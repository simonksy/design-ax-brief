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
# 상태 조회 간격. 영상 변환은 30초 넘게 걸리는 쪽이 보통이므로 30초에서
# 시작해 벌려 간다 — 10초로 시작하면 앞머리 조회가 전부 헛걸음이고, 그
# 헛걸음이 모여 한도(4/2207051)에 걸린다.
POLL_START, POLL_MAX = 30, 90
BACKOFF = (90, 180, 300)              # 한도에 걸렸을 때 물러서는 시간
# 발행이 한도에 걸린 뒤 "정말 안 올라갔나"를 다시 보는 간격(누적 90·270·570초).
# 한 번만 보고 없다고 재발행했다가 이미 올라가 있던 글을 또 보낸 적이 있다.
PUBLISH_RECHECK = (90, 180, 300)
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
# **ig/ 는 커밋한다.** 한때 .gitignore 에 넣고 직접 배포(wrangler)로만 올렸는데,
# 그 직후 CI 빌드가 커밋된 상태로 다시 빌드하면서 조용히 지워 버렸다 —
# deploy.sh 주석이 경고하는 바로 그 함정이다. 커밋해도 저장소는 커지지 않는다:
# 같은 바이트가 social/ 아래 이미 있고 git은 내용 해시로 블롭을 공유한다.
# 올린 뒤에도 남겨 둔다. 이미 공개된 게시물의 그림이라 숨길 이유가 없고,
# 지웠다 올렸다 하면 커밋만 두 배로 는다.
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
    print(f"\n파일 {n}개를 ig/ 에 복사했다. **커밋하고 배포해야** 주소가 열린다:")
    print("  git add ig && git commit -m 'chore(ig): 올릴 회차 공개' && git push origin main")
    print("  bash pipeline/deploy.sh")
    print("커밋을 빠뜨리면 직접 배포로 잠깐 열렸다가 CI 빌드가 지운다.")


def do_unstage():
    import shutil
    if os.path.isdir(STAGE):
        shutil.rmtree(STAGE)
        print("ig/ 를 비웠다. 배포하면 공개도 내려간다:  bash pipeline/deploy.sh")
    else:
        print("ig/ 가 이미 없다")


def marked_posts():
    """`!` 가 붙은 회차 폴더를 찾는다.

    회차는 날짜 폴더 아래에 산다(story/2026-10-14/!2026-10-14-…). 날짜별로
    묶어 두면 "오늘 뭐가 나왔나"를 폴더 하나로 볼 수 있다.

    **story 와 trend 를 번갈아 돌려준다.** 피드는 올린 순서대로 쌓이므로,
    한 번에 여러 벌을 올릴 때 형식별로 몰아 올리면 같은 생김새가 연달아 붙어
    피드가 단조로워진다. 같은 섹션의 story 와 trend 가 둘 다 있으면 붙여서
    내보낸다 — '한 건'과 '그 뒤의 흐름'이 나란히 읽힌다."""
    found = {"story": [], "trend": []}
    for kind in ("story", "trend"):
        base = os.path.join(HERE, kind)
        if not os.path.isdir(base):
            continue
        for date in sorted(os.listdir(base)):
            d = os.path.join(base, date)
            if not os.path.isdir(d):
                continue
            for name in sorted(os.listdir(d)):
                if name.startswith(MARK_TODO):
                    p = os.path.join(d, name)
                    try:
                        sec = json.load(open(os.path.join(p, "cards.json"),
                                             encoding="utf-8"))["meta"]["section"]
                    except Exception:
                        sec = ""
                    found[kind].append((sec, kind, name, p))
    out, seen = [], set()
    for sec, kind, name, p in found["story"]:
        out.append((kind, name, p))
        seen.add(("story", sec))
        mate = next((t for t in found["trend"] if t[0] == sec and t not in seen), None)
        if mate:
            out.append((mate[1], mate[2], mate[3]))
            seen.add(mate)
    for t in found["trend"]:
        if t not in seen and (t[1], t[2], t[3]) not in out:
            out.append((t[1], t[2], t[3]))
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


# Cloudflare 앞단은 기본 User-Agent(Python-urllib/…)를 막아 403을 돌려준다.
# 그걸 '주소가 안 열린다'로 읽으면 멀쩡한 파일을 두고 원인을 찾게 된다 —
# 실제로 한 번 그랬다. 평범한 브라우저 UA를 보낸다.
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")


def url_ok(url, timeout=15):
    """Meta가 내려받을 수 있는 주소인지 먼저 확인한다. 못 받으면 컨테이너 생성이
    'media download failed'로 끝나는데, 그 메시지로는 원인을 알 수 없다.

    HEAD 대신 첫 1바이트만 GET한다 — Meta도 GET으로 받아 가므로 더 가깝고,
    HEAD만 막아 두는 앞단에 걸리지 않는다."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, str(e)[:60]


def is_rate_limited(body):
    """'Application request limit reached'(code 4 · 2207051) 인가.

    이건 회차가 잘못됐다는 뜻이 아니라 잠깐 물러서라는 뜻이다. 끝내 버리면
    이미 만들어 둔 컨테이너를 버리고 처음부터 다시 하게 된다."""
    try:
        e = json.loads(body).get("error") or {}
    except (ValueError, AttributeError):
        return False
    return e.get("code") == 4 or e.get("error_subcode") == 2207051


def poll_plan(limit=600, start=POLL_START, cap=POLL_MAX):
    """상태를 **언제** 물을지. 초 단위 누적 시각이다.

    묻기 전에 먼저 기다린다 — 방금 만든 컨테이너가 FINISHED 일 수는 없으므로
    0초 조회는 언제나 버리는 요청이다. 간격은 벌려 가며 10분을 덮는다."""
    plan, t, gap = [], 0, start
    while t < limit:
        t += gap
        plan.append(t)
        gap = min(int(gap * 1.6), cap)
    return plan


def api(path, params, method="GET", retries=3, soft=False):
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{path}"
    for attempt in range(retries + 1):
        req = (urllib.request.Request(url, data=data, method="POST") if method == "POST"
               else urllib.request.Request(f"{url}?{data}"))
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if is_rate_limited(body) and attempt < retries:
                back = BACKOFF[attempt]
                print(f"    한도에 걸렸다 — {back}초 뒤 다시 묻는다 "
                      f"({attempt + 1}/{retries})")
                time.sleep(back)
                continue
            if soft and is_rate_limited(body):
                return {"_limited": True}
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


def wait_finished(cid, tok, label, limit=600):
    """컨테이너가 FINISHED 가 될 때까지 기다린다.

    영상은 Meta가 내려받아 변환해야 하고, 캐러셀은 자식들을 묶어야 한다.
    둘 다 비동기라 바로 다음 단계로 가면 'Media ID is not available' 로 끝난다.

    **묻기 전에 먼저 기다린다**(poll_plan). 만들자마자 물으면 반드시
    IN_PROGRESS 라 버리는 요청이고, 그 버리는 요청이 모여 'Application
    request limit reached'(4/2207051)에 걸린다 — 기다리는 일에 요청을 쓰면
    정작 올릴 요청이 모자란다."""
    waited = 0
    for at in poll_plan(limit):
        time.sleep(at - waited)
        waited = at
        st = api(cid, {"fields": "status_code,status", "access_token": tok})
        code = st.get("status_code")
        if code == "FINISHED":
            return
        if code == "ERROR":
            raise SystemExit(f"  준비 실패: {label} — {st.get('status')}")
        print(f"    {label} 기다리는 중… ({code}, {waited}초)")
    raise SystemExit(f"  준비가 끝나지 않았다: {label}")


def feed_state(caption, env):
    """이 캡션이 피드에 있나. ("found"|"absent"|"unknown", 링크)

    **못 물어본 것과 안 올라간 것은 다르다.** 10-15 에 둘을 같게 보다가,
    실제로는 올라가 있는 글을 '없다'고 판단해 다시 보냈다. 하필 발행이
    한도에 걸린 직후라 피드 조회도 같은 한도에 걸렸고, 빈 목록이 '안
    올라갔다'로 읽힌 것이다 — 가장 위험한 순간에 정확히 반대로 판단한다."""
    try:
        data = api(f"{env['IG_USER_ID']}/media",
                   {"fields": "caption,permalink", "limit": "25",
                    "access_token": env["IG_ACCESS_TOKEN"]}, retries=0).get("data", [])
    except SystemExit:
        return "unknown", None
    head = caption.strip().split("\n")[0].strip()
    for m in data:
        if head and head == (m.get("caption") or "").strip().split("\n")[0].strip():
            return "found", m.get("permalink", "(링크 없음)")
    return "absent", None


def already_posted(caption, env, fresh=False, cache={}):
    """이 캡션으로 이미 올라간 게시물이 있나.

    발행 요청이 400으로 끝나도 Meta 가 뒤늦게 처리해 실제로는 올라가는 일이
    있다(오늘만 두 번). 그러면 스크립트는 실패로 알고 표시를 그대로 두므로,
    다시 돌리는 순간 같은 글이 두 번 올라간다. 올리기 직전에 최근 게시물의
    첫 줄과 맞춰 본다. `fresh=True` 는 캐시를 버리고 다시 묻는다 — 발행이
    한도에 걸린 **직후**에는 방금 올라갔는지를 봐야 하므로 묵은 목록으로는
    안 된다."""
    if fresh:
        cache.pop("data", None)
    if "data" not in cache:
        try:
            cache["data"] = api(f"{env['IG_USER_ID']}/media",
                                {"fields": "caption,permalink", "limit": "25",
                                 "access_token": env["IG_ACCESS_TOKEN"]}).get("data", [])
        except SystemExit:
            cache["data"] = []          # 못 물어보면 막지 않는다 — 판단은 사람 몫
    head = caption.strip().split("\n")[0].strip()
    for m in cache["data"]:
        if head and head == (m.get("caption") or "").strip().split("\n")[0].strip():
            return m.get("permalink", "(링크 없음)")
    return None


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
            wait_finished(cid, tok, it["name"])

    parent = api(f"{uid}/media", {
        "media_type": "CAROUSEL", "children": ",".join(children),
        "caption": caption, "access_token": tok}, "POST")["id"]
    # 부모도 기다려야 한다. 자식 영상만 FINISHED 를 보고 바로 발행하면
    # 'Media ID is not available (9007/2207027) — 아직 준비가 완료되지 않아'
    # 로 끝난다. 묶는 일 자체가 비동기다.
    wait_finished(parent, tok, "캐러셀")
    # 발행만은 한도에 걸려도 **곧바로 다시 보내지 않는다.** 403/400 으로
    # 끝나도 Meta 가 뒤늦게 올려 버리는 일이 있어(10-14 에 네 번 모두 그랬다)
    # 다시 보내면 같은 글이 두 번 올라간다. 물러서서 피드를 먼저 본다.
    go = {"creation_id": parent, "access_token": tok}
    res = api(f"{uid}/media_publish", go, "POST", retries=0, soft=True)
    if res.get("_limited"):
        # 피드에 뜨기까지 시간이 걸린다. 한 번만 보고 없다고 다시 보냈다가
        # 10-15 에 실제로는 올라가 있던 글을 재발행해 2207085(Fatal)를 받았다
        # — 다행히 두 번 올라가진 않았지만, 운이었다. 여러 번 나눠 본다.
        link, blind = None, False
        for wait in PUBLISH_RECHECK:
            print(f"    발행이 한도에 걸렸다 — {wait}초 뒤 피드를 확인한다")
            time.sleep(wait)
            state, link = feed_state(caption, env)
            if state == "found":
                break
            if state == "unknown":
                blind = True
                print("      피드도 한도에 걸려 못 봤다")
        if link:
            print(f"  이미 올라가 있다 — 다시 보내지 않는다 → {link}")
            res = {"id": link}
        else:
            # **여기서 다시 보내지 않는다.** 10-15 에 세 번 다 다시 보냈고,
            # 세 번 다 첫 요청이 이미 성공해 있었으며, 재발행은 세 번 다
            # 2207085(Fatal)로 떨어졌다. 한도 응답은 '실패'가 아니라 '응답을
            # 못 받았다'에 가깝다.
            #
            # 피드로도 확인이 안 되는 이유는 두 가지다 — 피드 조회가 같은
            # 한도에 걸리거나(unknown), 조회는 되는데 **목록 반영이 10분
            # 넘게 늦거나**(absent). 둘 다 '안 올라갔다'의 근거가 못 된다.
            why = "피드도 한도에 걸려 못 봤다" if blind else "목록 반영이 늦는다"
            raise SystemExit(
                f"  발행 응답을 못 받았다 ({why}).\n"
                "  **다시 보내지 않는다** — 지금까지는 매번 실제로 올라가 있었다.\n"
                "  피드를 눈으로 확인하고, 올라가 있으면 폴더 표시를 "
                f"{MARK_DONE} 로 바꿔라.")
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
        dup = already_posted(caption, env)
        if dup:
            print(f"  이미 올라가 있다 → {dup}")
            d = post[2]
            os.rename(d, os.path.join(os.path.dirname(d), MARK_DONE + post[1][1:]))
            print("  표시만 바꾼다")
            continue
        publish(post, items, caption, env)
    print("\n올리기 끝.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
