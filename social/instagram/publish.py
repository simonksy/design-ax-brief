#!/usr/bin/env python3
"""`*` 표시된 회차를 인스타그램에 캐러셀로 올린다.

    python3 social/instagram/publish.py --dry-run   # 올리지 않고 전부 검사만
    python3 social/instagram/publish.py             # 실제로 올린다

**무엇을 올릴지는 폴더 이름이 정한다.** 사람이 전체를 훑어보고 고른 회차에
표시를 붙이면 그걸 그대로 입력으로 삼는다.

    social/instagram/trend/!2026-10-14-sorting-the-flood   ← 올릴 것
    social/instagram/trend/*2026-10-14-sorting-the-flood   ← 올린 것
    social/instagram/trend/2026-10-14-sorting-the-flood    ← 검토 전

올리고 나면 `!`를 `*`로 바꿔 두 번 올라가지 않게 한다. 둘 다 키보드에서
바로 치는 글자다 — 체크 기호 같은 건 매번 복사해 와야 해서 결국 안 쓴다.

비밀값은 저장소 루트의 `.env.local`에서 읽는다(.gitignore에 있다):

    IG_ACCESS_TOKEN=   장기 토큰(60일). 만료 전에 갱신해야 한다
    IG_USER_ID=        axit.now 의 Instagram 사용자 ID
    IG_MEDIA_BASE=     카드 파일이 공개로 열리는 주소의 앞부분

**Meta는 파일 업로드를 받지 않는다.** 공개 URL만 받아서 자기가 내려받는다.
그래서 올릴 카드가 인터넷에서 열려 있어야 하고, 그 주소의 앞부분이
IG_MEDIA_BASE다. 예를 들어 base가 `https://axitnow.com/ig` 이면
`trend/2026-10-14-sorting-the-flood/card1.png` 는
`https://axitnow.com/ig/trend/2026-10-14-sorting-the-flood/card1.png` 로 열려야 한다.

--dry-run은 토큰이 없어도 돈다. 카드 순서·크기·길이·캡션·주소가 규격에
맞는지까지 전부 보므로, 토큰을 기다리는 동안 먼저 돌려 보면 된다.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
API = "https://graph.instagram.com/v23.0"

# 인스타그램 제한. 넘으면 업로드가 거부되는 값들이라 올리기 전에 막는다.
CAROUSEL_MIN, CAROUSEL_MAX = 2, 20
CAPTION_MAX = 2200
VIDEO_MIN_S, VIDEO_MAX_S = 3, 60      # 캐러셀 안의 영상
CARD_W, CARD_H = 1080, 1350


def load_env():
    """.env.local 을 읽는다. 없는 키는 빈 문자열로 둔다 — dry-run은 토큰 없이 돈다."""
    env = {}
    p = os.path.join(ROOT, ".env.local")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    for k in ("IG_ACCESS_TOKEN", "IG_USER_ID", "IG_MEDIA_BASE"):
        env.setdefault(k, os.environ.get(k, ""))
    return env


MARK_TODO, MARK_DONE = "!", "*"

# Meta는 파일을 받지 않고 공개 URL만 받아 자기가 내려받는다. social/ 은 일부러
# 배포에서 빼 뒀으므로(올리기 전 원고가 공개되면 곤란하다), 올릴 회차만 저장소
# 루트의 ig/ 로 복사해 잠시 공개한다. wrangler의 assets.directory 가 "." 이라
# 거기 두면 워커 코드 없이 그대로 서빙된다.
#
# ig/ 는 임시다 — 올리고 나면 지운다. .gitignore 에 있어 커밋되지 않고,
# 직접 배포(wrangler)는 작업트리를 올리므로 복사만 해 두고 배포하면 열린다.
STAGE = os.path.join(ROOT, "ig")


def stage_dir(kind, slug):
    return os.path.join(STAGE, kind, slug)


def do_stage(posts):
    import shutil
    n = 0
    for kind, name, d in posts:
        slug = name[1:]
        dst = stage_dir(kind, slug)
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        os.makedirs(dst, exist_ok=True)
        for f in sorted(os.listdir(os.path.join(d, "out"))):
            shutil.copy2(os.path.join(d, "out", f), os.path.join(dst, f))
            n += 1
        print(f"  {kind}/{slug}  →  ig/{kind}/{slug}")
    print(f"\n파일 {n}개를 ig/ 에 복사했다. 이제 배포해야 주소가 열린다:")
    print("  bash pipeline/deploy.sh")


def do_unstage():
    import shutil
    if os.path.isdir(STAGE):
        shutil.rmtree(STAGE)
        print("ig/ 를 비웠다. 배포하면 공개도 내려간다:  bash pipeline/deploy.sh")
    else:
        print("ig/ 가 이미 없다")


def marked_posts():
    """`!` 가 붙은 회차 폴더를 story·trend 양쪽에서 찾는다."""
    out = []
    for kind in ("story", "trend"):
        d = os.path.join(HERE, kind)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.startswith(MARK_TODO):
                out.append((kind, name, os.path.join(d, name)))
    return out


def card_files(post_dir, spec):
    """cards.json 의 n 순서대로 out/ 파일을 세운다.

    파일 이름으로 정렬하면 card10이 card2보다 앞에 온다. 카드 번호로 세운다."""
    out_dir = os.path.join(post_dir, "out")
    files = []
    for c in sorted(spec["cards"], key=lambda c: c["n"]):
        hit = [f for f in os.listdir(out_dir)
               if os.path.splitext(f)[0] == f"card{c['n']}"]
        if len(hit) != 1:
            raise SystemExit(f"{post_dir}: card{c['n']} 파일이 {len(hit)}개다 — out/을 다시 구워라")
        files.append(os.path.join(out_dir, hit[0]))
    return files


def probe(path):
    """ffprobe로 크기와 길이를 읽는다. 올리고 나서 거부당하는 것보다 먼저 보는 게 싸다."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-show_entries", "format=duration",
         "-of", "json", path], capture_output=True, text=True)
    if r.returncode:
        return None
    j = json.loads(r.stdout or "{}")
    st = (j.get("streams") or [{}])[0]
    dur = float((j.get("format") or {}).get("duration") or 0)
    return st.get("width"), st.get("height"), dur


def media_url(base, kind, slug, filename):
    return "/".join([base.rstrip("/"), kind, slug, filename])


def url_ok(url, timeout=12):
    """Meta가 내려받을 수 있는 주소인지 먼저 확인한다. 못 받으면 컨테이너 생성이
    'media download failed'로 끝나는데, 그 메시지로는 원인을 알 수 없다."""
    req = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, str(e)[:60]


def api(path, params, method="GET"):
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{path}"
    req = (urllib.request.Request(url, data=data, method="POST") if method == "POST"
           else urllib.request.Request(f"{url}?{data}"))
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise SystemExit(f"API {e.code}: {body[:400]}")


def check(post, env, verbose=True):
    """한 회차가 규격에 맞는지 본다. 문제를 모아 돌려준다 — 첫 번째에서 멈추면
    고치고 다시 돌리기를 반복하게 된다."""
    kind, name, d = post
    slug = name[1:]
    bad = []
    spec = json.load(open(os.path.join(d, "cards.json"), encoding="utf-8"))
    files = card_files(d, spec)
    n = len(files)
    if not (CAROUSEL_MIN <= n <= CAROUSEL_MAX):
        bad.append(f"카드 {n}장 — 캐러셀은 {CAROUSEL_MIN}~{CAROUSEL_MAX}장")

    cap_p = os.path.join(d, "caption.txt")
    caption = open(cap_p, encoding="utf-8").read().strip() if os.path.exists(cap_p) else ""
    if not caption:
        bad.append("caption.txt 가 없거나 비었다")
    elif len(caption) > CAPTION_MAX:
        bad.append(f"캡션 {len(caption)}자 — {CAPTION_MAX}자까지")

    items = []
    for f in files:
        base = os.path.basename(f)
        is_video = f.lower().endswith(".mp4")
        info = probe(f)
        if not info:
            bad.append(f"{base}: 읽을 수 없다")
            continue
        w, h, dur = info
        if (w, h) != (CARD_W, CARD_H):
            bad.append(f"{base}: {w}x{h} — {CARD_W}x{CARD_H} 여야 한다")
        if is_video and not (VIDEO_MIN_S <= dur <= VIDEO_MAX_S):
            bad.append(f"{base}: 영상 {dur:.1f}초 — {VIDEO_MIN_S}~{VIDEO_MAX_S}초")
        url = media_url(env["IG_MEDIA_BASE"], kind, slug, base) if env["IG_MEDIA_BASE"] else ""
        items.append({"file": f, "name": base, "video": is_video, "url": url})

    if env["IG_MEDIA_BASE"]:
        for it in items:
            code, note = url_ok(it["url"])
            if code != 200:
                bad.append(f"{it['name']}: 주소가 열리지 않는다 ({code} {note})")
    else:
        bad.append("IG_MEDIA_BASE 가 비었다 — Meta는 공개 URL로만 받아 간다")

    if verbose:
        mark = "✗" if bad else "✓"
        print(f"{mark} {kind}/{slug}  카드 {n}장 · 캡션 {len(caption)}자")
        for b in bad:
            print(f"    - {b}")
    return spec, items, caption, bad


def publish(post, items, caption, env):
    """컨테이너를 하나씩 만들고, 묶고, 올린다.

    영상은 Meta가 내려받아 변환할 때까지 기다려야 한다 — 바로 묶으려 하면
    'Media ID is not available' 로 끝난다. 그래서 status_code 를 확인한다."""
    kind, name, d = post
    uid, tok = env["IG_USER_ID"], env["IG_ACCESS_TOKEN"]
    children = []
    for i, it in enumerate(items, 1):
        p = {"is_carousel_item": "true", "access_token": tok}
        if it["video"]:
            p["media_type"] = "VIDEO"
            p["video_url"] = it["url"]
        else:
            p["image_url"] = it["url"]
        cid = api(f"{uid}/media", p, "POST")["id"]
        children.append(cid)
        print(f"  [{i}/{len(items)}] {it['name']} → {cid}")
        if it["video"]:
            for _ in range(60):          # 최대 5분
                st = api(cid, {"fields": "status_code", "access_token": tok})
                code = st.get("status_code")
                if code == "FINISHED":
                    break
                if code == "ERROR":
                    raise SystemExit(f"  변환 실패: {it['name']}")
                time.sleep(5)
            else:
                raise SystemExit(f"  변환이 5분 안에 끝나지 않았다: {it['name']}")

    parent = api(f"{uid}/media", {
        "media_type": "CAROUSEL", "children": ",".join(children),
        "caption": caption, "access_token": tok}, "POST")["id"]
    res = api(f"{uid}/media_publish", {"creation_id": parent, "access_token": tok}, "POST")
    print(f"  올림 → {res.get('id')}")

    done = os.path.join(os.path.dirname(d), MARK_DONE + name[1:])
    os.rename(d, done)
    print(f"  표시 변경: {os.path.basename(done)}")
    return res.get("id")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="올리지 않고 검사만")
    ap.add_argument("--whoami", action="store_true",
                    help="토큰으로 계정을 물어본다 (IG_USER_ID 를 찾을 때)")
    ap.add_argument("--stage", action="store_true",
                    help="올릴 회차를 ig/ 로 복사한다 (배포하면 주소가 열린다)")
    ap.add_argument("--unstage", action="store_true", help="ig/ 를 비운다")
    a = ap.parse_args()
    env = load_env()
    if a.whoami:
        if not env["IG_ACCESS_TOKEN"]:
            print(".env.local 의 IG_ACCESS_TOKEN 이 비었다", file=sys.stderr); return 1
        me = api("me", {"fields": "user_id,username", "access_token": env["IG_ACCESS_TOKEN"]})
        print(f"username  {me.get('username')}")
        print(f"user_id   {me.get('user_id') or me.get('id')}")
        print("\n이 user_id 를 .env.local 의 IG_USER_ID 에 적어라.")
        return 0
    if a.unstage:
        do_unstage(); return 0
    posts = marked_posts()
    if not posts:
        print(f"`{MARK_TODO}` 표시된 회차가 없다. 올릴 폴더 이름 앞에 {MARK_TODO} 를 붙여라.")
        return 0

    print(f"`{MARK_TODO}` 표시된 회차 {len(posts)}개\n")
    if a.stage:
        do_stage(posts); return 0
    ready = []
    for post in posts:
        spec, items, caption, bad = check(post, env)
        if not bad:
            ready.append((post, items, caption))
    print()

    if a.dry_run:
        print(f"검사만 했다 — 올릴 수 있는 회차 {len(ready)}/{len(posts)}개")
        if not env["IG_ACCESS_TOKEN"]:
            print("(토큰이 아직 없다. .env.local 의 IG_ACCESS_TOKEN 을 채우면 실제로 올릴 수 있다)")
        return 0
    if not env["IG_ACCESS_TOKEN"] or not env["IG_USER_ID"]:
        print("IG_ACCESS_TOKEN / IG_USER_ID 가 비었다 — .env.local 을 채워라", file=sys.stderr)
        return 1
    if len(ready) != len(posts):
        print("규격을 통과하지 못한 회차가 있다. 고치고 다시 돌려라.", file=sys.stderr)
        return 1

    for post, items, caption in ready:
        print(f"{post[0]}/{post[1][1:]}")
        publish(post, items, caption, env)
    print("\n올리기 끝. 공개해 둔 파일을 내린다:")
    do_unstage()
    return 0


if __name__ == "__main__":
    sys.exit(main())
