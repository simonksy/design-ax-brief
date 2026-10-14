#!/usr/bin/env python3
"""오늘자 브리프에서 인스타그램 회차 **후보 20벌**을 만들어 굽는다.

    python3 pipeline/social_daily.py                 # 오늘 날짜로
    python3 pipeline/social_daily.py --date 2026-10-14
    python3 pipeline/social_daily.py --no-render     # JSON만, 굽지 않음

열 개 섹션마다 story 한 벌, trend 한 벌 — 모두 20벌이 날짜 폴더에 쌓인다.

    social/instagram/story/2026-10-14/2026-10-14-<슬러그>/
    social/instagram/trend/2026-10-14/2026-10-14-<섹션>-trend/
    social/instagram/DRAFTS-2026-10-14.md

**이건 고르라고 만드는 것이지 그대로 올리라고 만드는 게 아니다.** 제목과
썸네일과 구성이 보이므로 "이 주제가 올릴 값이 있나"는 충분히 판단된다.
올릴 두 벌을 정해 폴더 앞에 `!`를 붙이면, 그 두 벌만 사람이 원문을 받아
숫자를 확인하고 글을 다시 쓴 뒤 올린다.

기계가 못 하는 일이 그 다시 쓰기다. 카드 요약은 원문을 줄이면서 숫자와
날짜를 잃고(실제로 '2시간 반'이 135분이었고 상하이 판결이 9월이 아니라
6월이었다), 여러 건을 꿰는 판단도 낱말 겹침으로는 안 된다.
"""
import argparse
import datetime
import glob
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SOCIAL = os.path.join(ROOT, "social", "instagram")

SECTIONS = ["design", "marketing", "music", "movies", "games",
            "books", "gadgets", "science", "medicine", "politics"]
ACCENT = {"design": "#0070f3", "music": "#eb367f", "movies": "#7928ca",
          "games": "#2ec5c5", "books": "#f5a623", "gadgets": "#ff5a4d",
          "science": "#3aa655", "politics": "#9aa8c7", "marketing": "#ff8a3d",
          "medicine": "#00897b"}
KO = {"design": "디자인", "marketing": "마케팅", "music": "음악", "movies": "영화",
      "games": "게임", "books": "책", "gadgets": "가젯", "science": "과학",
      "medicine": "의료", "politics": "정책"}
OUTRO = {"kind": "outro", "eyebrow": "매일 아침, AI가 바꾸는 현장",
         "headline": "더 많은 소식은 axitnow.com",
         "body": "매일 아침 열 개 분야에서 새 카드 50장. "
                 "분야를 넘나드는 연결은 지식 그래프로 한눈에 봅니다.",
         "foot": ""}
TREND_SPAN = 7                   # trend 가 거슬러 올라가는 날수
HEAD_MAX, BODY_MAX = 24, 76      # render 규격(제목 2줄 · 본문 3줄) 안에 드는 길이


def fit(text, limit):
    """규격 안으로 줄인다. 넘치면 render 가 아예 멈추므로 멈추게 두지 않는다.

    초안이라 잘려도 된다 — 고른 두 벌은 어차피 사람이 다시 쓴다. 다만 말
    중간에서 끊으면 읽기 나쁘므로 띄어쓰기를 찾아 끊는다."""
    t = (text or "").replace("\n", " ").strip()
    if len(t) <= limit:
        return t
    cut = t[:limit - 1]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > limit * 0.5 else cut).rstrip(" ,·") + "…"


def media_for(cid):
    """영상이 먼저다. 스틸은 쓸 영상이 아예 없을 때만."""
    for ext in (".mp4", ".jpg", ".png", ".webp"):
        rel = os.path.join("pipeline", "media", cid + ext)
        if os.path.exists(os.path.join(ROOT, rel)):
            return ("video" if ext == ".mp4" else "media"), rel
    return None, None


def used_media():
    """이미 만들어 둔 회차들이 쓰는 그림.

    두 회차가 같은 그림을 쓰면 넘기는 사람에게는 같은 글로 보인다
    (social_media_test 가 막는다). 그래서 겹치지 않게 피해 고른다."""
    used = set()
    for cp in glob.glob(os.path.join(SOCIAL, "*", "*", "*", "cards.json")):
        for c in json.load(open(cp, encoding="utf-8"))["cards"]:
            for k in ("video", "media"):
                if c.get(k):
                    used.add(c[k])
    return used


def ko_text(card, key):
    return ((card.get("text") or {}).get("ko") or {}).get(key) or card.get(key) or ""


def paras(card):
    return [b["x"] for b in ((card.get("full") or {}).get("blocks") or [])
            if b.get("t") == "p" and b.get("x")]


def slugify(cid):
    return re.sub(r"[^a-z0-9-]+", "-", cid.lower()).strip("-")[:46]


def write_post(kind, date, slug, spec):
    d = os.path.join(SOCIAL, kind, date, slug)
    for mark in ("", "!", "*"):          # 표시된 같은 회차가 있으면 손대지 않는다
        if os.path.isdir(os.path.join(SOCIAL, kind, date, mark + slug)):
            return None
    os.makedirs(d, exist_ok=True)
    for i, c in enumerate(spec["cards"], 1):
        c["n"] = i
    open(os.path.join(d, "cards.json"), "w", encoding="utf-8").write(
        json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
    return d


def clip_seconds(rel):
    """영상 길이. 못 읽으면 0 — 그럼 앞 대목만 쓴다."""
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration", "-of", "csv=p=0",
                        os.path.join(ROOT, rel)], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def story_spec(sec, date, card, key, rel):
    ps = paras(card)
    steps = ["무슨 일인가", "어떻게 되는가", "짚을 대목", "그래서 지금"]
    head = fit(ko_text(card, "headline"), HEAD_MAX)
    # 한 그림을 다섯 장에 그대로 깔면 넘기는 사람에게는 같은 장을 다섯 번
    # 보여 주는 셈이다(social_story_variety_test 가 막는다). 영상은 서로 다른
    # 대목을 끊어 쓰고, 스틸은 표지에만 쓴다 — 남는 장은 비워 두고, 올리기로
    # 정한 회차에서 사람이 stat·quote 로 채운다.
    starts = [None] * 5
    if key == "video":
        n = max(1, int(clip_seconds(rel) // 4))      # 4초씩 끊어 쓸 수 있는 칸
        starts = [i * 4 if i < n else None for i in range(5)]
    cards = [{"kind": "cover",
              "eyebrow": f"AI × {KO[sec]} · {date.replace('-', '.')}",
              "headline": head,
              "body": fit(ps[0] if ps else ko_text(card, "body"), BODY_MAX),
              "foot": "밀어서 보기 →"}]
    if key == "video" and starts[0] is not None:
        cards[0].update({"video": rel, "dur": 4})
    elif key == "media":
        cards[0]["media"] = rel
    for i, step in enumerate(steps):
        c = {"kind": "photo", "eyebrow": step, "headline": head,
             "body": fit(ps[i + 1] if i + 1 < len(ps) else ko_text(card, "body"), BODY_MAX),
             "foot": date.replace("-", ".")}
        if key == "video" and starts[i + 1] is not None:
            c.update({"video": rel, "start": starts[i + 1], "dur": 4})
        cards.append(c)
    cards.append(dict(OUTRO))
    return {"meta": {"issue": fit(ko_text(card, "headline"), 60),
                     "date": date.replace("-", "."), "section": sec.upper(),
                     "accent": ACCENT[sec],
                     "note": "자동 초안. 올리기로 정하면 원문을 받아 숫자를 확인하고 글을 다시 쓰고, 빈 장은 stat·quote 로 채운다.",
                     "sources": [card.get("url", "")]},
            "cards": cards}


def trend_spec(sec, date, picks):
    pts = [{"d": c["date"][5:].replace("-0", ".").replace("-", "."),
            "t": fit(ko_text(c, "headline"), 7),
            "c": ACCENT[sec], "s": sec.upper()} for c in picks]
    cards = [{"kind": "thread", "thread_badge": "이슈 트렌드",
              "thread_cap": f"{len(picks)}건 · {KO[sec]}",
              "thread": pts,
              "thread_note": "TODO: 이 흐름의 요점 한 줄",
              "eyebrow": f"흐름 · {KO[sec]}",
              "headline": fit(ko_text(picks[-1], "headline"), HEAD_MAX),
              "body": "TODO: 왜 한 건으로는 안 보이는지",
              "foot": "밀어서 보기 →"}]
    for c in picks:
        key, rel = media_for(c["id"])
        card = {"kind": "photo", "eyebrow": c["date"].replace("-", "."),
                "headline": fit(ko_text(c, "headline"), HEAD_MAX),
                "body": fit(ko_text(c, "body"), BODY_MAX),
                "foot": c["date"].replace("-", ".")}
        if key:
            card[key] = rel
        cards.append(card)
    cards.append(dict(OUTRO))
    return {"meta": {"issue": "TODO: 꿰어야 보이는 문장",
                     "date": date.replace("-", "."), "section": sec.upper(),
                     "accent": ACCENT[sec],
                     "note": "자동 초안(뼈대). 어느 것이 한 전선으로 읽히는지는 사람이 고른다.",
                     "sources": [c.get("url", "") for c in picks]},
            "cards": cards}


def caption_for(spec, kind):
    body = spec["cards"][1:-1]
    lines = [spec["meta"]["issue"], ""]
    if kind == "trend":
        lines += [spec["cards"][0]["thread_note"], ""]
    lines += [f"· {c['headline']}" for c in body]
    lines += ["", f"밀어서 {len(spec['cards'])}장 →", "",
              "출처: " + " · ".join(s for s in spec["meta"]["sources"] if s), "",
              "매일 아침 열 개 분야 AI 뉴스와 분야를 넘나드는 지식 그래프 → axitnow.com (프로필 링크)",
              "", "#AI #axitnow"]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None)
    ap.add_argument("--data", default=os.path.join(HERE, "news_data.json"))
    ap.add_argument("--no-render", action="store_true")
    a = ap.parse_args()
    date = a.date or datetime.date.today().isoformat()
    data = json.load(open(a.data, encoding="utf-8"))
    taken = used_media()
    made, report, digest = [], [], []

    for sec in SECTIONS:
        s = (data.get("sections") or {}).get(sec) or {}
        today = s.get("today") or {}
        if today.get("date") != date or not today.get("cards"):
            report.append((sec, "—", None, "오늘자 카드가 없다"))
            continue
        cards = today["cards"]

        # story — 영상이 있고 원문이 가장 두툼한 카드. 한 편이 혼자 다섯 장을
        # 버텨야 하므로 문단 수가 사실상 유일한 기준이다.
        ranked = sorted(cards, key=lambda c: (media_for(c["id"])[0] == "video",
                                              len(paras(c))), reverse=True)
        pick = next((c for c in ranked if media_for(c["id"])[1] not in taken), ranked[0])
        key, rel = media_for(pick["id"])
        slug = f"{date}-{slugify(pick['id'])}"
        if write_post("story", date, slug, story_spec(sec, date, pick, key, rel)):
            made.append(("story", slug))
            if rel:
                taken.add(rel)
        report.append((sec, "story", slug, fit(ko_text(pick, "headline"), 40)))

        # trend 는 기계가 못 고른다. 낱말이 겹친다고 같은 이야기가 아니다 —
        # 최근 3주를 키워드로 묶어 보면 상위 묶음이 '대신'·'으로'·'whether' 처럼
        # 전부 우연이다. 그래서 **읽을 거리만 내놓고** 묶는 일은 사람이 한다.
        for day in (s.get("days") or [])[-TREND_SPAN:] + [today]:
            for c in day.get("cards", []):
                digest.append((sec, day.get("date", date), c["id"],
                               media_for(c["id"])[0] or "-", ko_text(c, "headline")))

    for kind, slug in made:
        post = os.path.join(SOCIAL, kind, date, slug)
        spec = json.load(open(os.path.join(post, "cards.json"), encoding="utf-8"))
        open(os.path.join(post, "caption.txt"), "w", encoding="utf-8").write(
            caption_for(spec, kind))
        if a.no_render:
            continue
        r = subprocess.run(["python3", os.path.join(SOCIAL, "render.py"), post],
                           capture_output=True, text=True)
        ok = r.returncode == 0
        print(f"{'✓' if ok else '✗'} {kind}/{slug}")
        if not ok:
            tail = (r.stdout or r.stderr).strip().splitlines()
            print("   " + (tail[-1][:120] if tail else "(출력 없음)"))

    lines = [f"# 인스타그램 후보 · {date}", "",
             f"열 개 섹션 × story·trend = 최대 20벌. 이번에 새로 만든 것 {len(made)}벌.", "",
             "**고르라고 만든 것이다.** 올릴 두 벌을 정해 폴더 이름 앞에 `!`를 붙이면,",
             "그 두 벌만 원문을 받아 숫자를 확인하고 글을 다시 쓴 뒤 올린다.",
             "trend 회차의 `TODO:` 두 줄은 반드시 사람이 쓴다 — 낱말이 겹친다고 같은 이야기는 아니다.", "",
             "```",
             "python3 social/instagram/publish.py --stage",
             "git add ig && git commit -m 'chore(ig): 올릴 회차 공개' && git push origin main",
             "bash pipeline/deploy.sh",
             "python3 social/instagram/publish.py",
             "```", "",
             "## story — 기계가 고른 것", "",
             "| 섹션 | 폴더 | 내용 |", "|---|---|---|"]
    for sec, kind, slug, note in report:
        lines.append(f"| {KO.get(sec, sec)} | `{slug or '—'}` | {note} |")
    lines += ["", "## trend — 읽고 묶을 거리", "",
              "낱말로는 못 묶는다. 최근 3주를 키워드로 묶어 보면 상위 묶음이",
              "`대신`·`으로`·`whether` 처럼 전부 우연이다. 아래를 읽고 **한 전선으로",
              "읽히는 것만** 골라 묶은 뒤, 첫 장의 요점 한 줄을 직접 쓴다.", ""]
    cur = None
    for sec, dt, cid, m, head in digest:
        if sec != cur:
            lines += ["", f"### {KO.get(sec, sec)}", "", "```"]
            cur = sec
        lines.append(f"{dt[5:]} {m} {cid[:38]:38} {head[:40]}")
    lines.append("```")
    open(os.path.join(SOCIAL, f"DRAFTS-{date}.md"), "w", encoding="utf-8").write(
        "\n".join(lines) + "\n")
    print(f"\n새로 만든 회차 {len(made)}벌 · 안내: social/instagram/DRAFTS-{date}.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
