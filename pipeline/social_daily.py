#!/usr/bin/env python3
"""오늘자 브리프에서 인스타그램 회차 **초안**을 뽑는다.

    python3 pipeline/social_daily.py                 # 오늘 날짜로
    python3 pipeline/social_daily.py --date 2026-10-14

하는 일:
  social/instagram/story/<날짜>-<슬러그>/cards.json   한 이슈를 따라가는 초안
  social/instagram/trend/<날짜>-<슬러그>/cards.json   여러 건을 꿴 초안
  social/instagram/DRAFTS-<날짜>.md                  무엇을 골랐고 무엇을 고쳐야 하는지

**굽지 않는다.** 고른 재료와 뼈대까지가 기계가 할 수 있는 일이고, 그 위의
글은 사람이 쓴다. 초안을 그대로 구우면 '완성된 것처럼 생긴 약한 카드'가
나오는데, 올리기 전에 그걸 알아채기가 더 어렵다. 다듬은 뒤에 굽는다:

    python3 social/instagram/render.py social/instagram/story/<폴더>

story는 기계가 고를 수 있다 — 영상이 있고 원문이 가장 두툼한 카드 하나면
된다. trend는 아니다. 여러 건을 꿰는 판단은 키워드로 대신할 수 없어서
(아카이브 그래프 연결은 아직 절반 넘게 우연이다) **후보 묶음만 적어 둔다.**
"""
import argparse
import collections
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SOCIAL = os.path.join(ROOT, "social", "instagram")
ACCENT = {"design": "#0070f3", "music": "#eb367f", "movies": "#7928ca",
          "games": "#2ec5c5", "books": "#f5a623", "gadgets": "#ff5a4d",
          "science": "#3aa655", "politics": "#9aa8c7", "marketing": "#ff8a3d",
          "medicine": "#00897b"}
OUTRO = {"kind": "outro", "eyebrow": "매일 아침, AI가 바꾸는 현장",
         "headline": "더 많은 소식은 axitnow.com",
         "body": "매일 아침 열 개 분야에서 새 카드 50장. "
                 "분야를 넘나드는 연결은 지식 그래프로 한눈에 봅니다.",
         "foot": ""}
TODO = "TODO: "


def media_for(cid):
    """영상이 먼저다. 스틸은 쓸 영상이 아예 없을 때만."""
    for ext in (".mp4", ".jpg", ".png", ".webp"):
        rel = os.path.join("pipeline", "media", cid + ext)
        if os.path.exists(os.path.join(ROOT, rel)):
            return ("video" if ext == ".mp4" else "media"), rel
    return None, None


def today_cards(data, date):
    for sec, v in (data.get("sections") or {}).items():
        t = v.get("today") or {}
        if t.get("date") != date:
            continue
        for c in t.get("cards", []):
            yield sec, c


def paras(card):
    return [b["x"] for b in ((card.get("full") or {}).get("blocks") or [])
            if b.get("t") == "p" and b.get("x")]


def slugify(cid):
    return re.sub(r"[^a-z0-9-]+", "-", cid.lower()).strip("-")[:46]


def pick_story(cards):
    """영상이 있고 원문이 가장 두툼한 카드. 한 편을 끝까지 따라가려면 그
    카드 혼자서 다섯 단계를 버텨야 하므로, 문단 수가 사실상 유일한 기준이다."""
    scored = []
    for sec, c in cards:
        kind, rel = media_for(c["id"])
        scored.append(((kind == "video", len(paras(c))), sec, c, kind, rel))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0] if scored else None


def story_draft(date, sec, card, kind, rel):
    ps = paras(card)
    steps = ["무슨 일인가", "왜 이렇게 했나", "어떻게 만들었나", "그래서 지금"]
    cards = [{"n": 1, "kind": "cover",
              "eyebrow": f"AI × {sec} · {date.replace('-', '.')}",
              "headline": TODO + (card.get("headline") or "").replace("\n", " "),
              "body": TODO + "이 회차가 무엇을 따라가는지 한 문장",
              "foot": "밀어서 보기 →"}]
    if kind:
        cards[0][kind] = rel
    for i, step in enumerate(steps, start=2):
        c = {"n": i, "kind": "photo", "eyebrow": TODO + step,
             "headline": TODO + "이 단계의 한 줄",
             "body": (ps[i - 2] if i - 2 < len(ps) else TODO + "본문"),
             "foot": date.replace("-", ".")}
        if i == 3:
            c["kind"] = "stat"
            c.update({"stat_top": TODO + "값", "stat_arrow": TODO + "에서",
                      "stat_bottom": TODO + "값", "stat_strike": False})
        elif i == 4:
            c["kind"] = "quote"
            c.update({"quote": TODO + "원문에서 가져온 인용",
                      "quote_by": TODO + "말한 사람 · 소속"})
        elif kind == "video" and i == 5:
            c.update({"video": rel, "start": 4})
        elif kind:
            c[kind] = rel
        cards.append(c)
    cards.append(dict(OUTRO, n=len(cards) + 1))
    return {"meta": {"issue": TODO + "한 문장", "date": date.replace("-", "."),
                     "section": sec.upper(), "accent": ACCENT.get(sec, "#0070f3"),
                     "note": "자동 초안. 글은 사람이 다시 쓴다.",
                     "sources": [card.get("url", "")]},
            "cards": cards}


def trend_candidates(cards, top=5):
    """오늘 카드들을 공유 낱말로 묶어 후보를 뽑는다.

    고르지는 않는다. 섹션을 가로지르는 낱말은 아직 'whether'나 'days' 같은
    것이 대부분이라, 기계가 고르면 억지 묶음이 나온다. 사람이 제목을 보고
    고르라고 **묶음만** 적어 둔다."""
    sys.path.insert(0, HERE)
    import build_archive as ba
    by_term = collections.defaultdict(list)
    for sec, c in cards:
        for t in ba._tokens((c.get("headline") or "") + " " + (c.get("body") or "")):
            by_term[t].append((sec, c))
    out = []
    for t, group in by_term.items():
        secs = {s for s, _ in group}
        if len(secs) >= 3 and len(group) >= 3:
            out.append((len(secs), len(group), t, group))
    out.sort(reverse=True)
    return out[:top]


def trend_draft(date):
    cards = [{"n": 1, "kind": "thread", "thread_badge": "이슈 트렌드",
              "thread_cap": TODO + "N일 · N건 · N개 섹션",
              "thread": [{"d": TODO, "t": TODO, "c": "#0070f3", "s": "SECTION"}],
              "thread_note": TODO + "이 흐름의 요점 한 줄",
              "eyebrow": "흐름 · " + TODO,
              "headline": TODO + "꿰어야 보이는 문장",
              "body": TODO + "왜 한 건으로는 안 보이는지",
              "foot": "밀어서 보기 →"}]
    cards.append(dict(OUTRO, n=2))
    return {"meta": {"issue": TODO, "date": date.replace("-", "."),
                     "section": "DESIGN", "accent": "#0070f3",
                     "note": "자동 초안(뼈대만). 어느 카드를 꿸지는 DRAFTS 문서를 보고 사람이 정한다.",
                     "sources": []},
            "cards": cards}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None)
    ap.add_argument("--data", default=os.path.join(HERE, "news_data.json"))
    a = ap.parse_args()
    date = a.date or datetime.date.today().isoformat()
    data = json.load(open(a.data, encoding="utf-8"))
    cards = list(today_cards(data, date))
    if not cards:
        print(f"{date} 자 카드가 없다 — 브리프를 먼저 발행하라", file=sys.stderr)
        return 1

    # 그날 회차가 이미 있으면 손대지 않는다. 사람이 손으로 만든 날에 초안이
    # 끼어들면, 올릴 때 어느 쪽이 진짜인지 알 수 없게 된다.
    existing = [k for k in ("story", "trend")
                if os.path.isdir(os.path.join(SOCIAL, k, date))]
    if len(existing) == 2:
        print(f"{date} 자 story·trend 회차가 이미 있다 — 초안을 만들지 않는다")
        return 0

    pick = pick_story(cards)
    (_, sec, card, kind, rel) = pick
    slug = f"{date}-{slugify(card['id'])}"
    d = os.path.join(SOCIAL, "story", date, slug)
    made = []
    if "story" in existing or os.path.exists(os.path.join(d, "cards.json")):
        print(f"story 초안이 이미 있다 — 건드리지 않는다: {slug}")
    else:
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "cards.json"), "w", encoding="utf-8").write(
            json.dumps(story_draft(date, sec, card, kind, rel), ensure_ascii=False, indent=2) + "\n")
        made.append(os.path.relpath(d, ROOT))

    tslug = f"{date}-trend"
    td = os.path.join(SOCIAL, "trend", date, tslug)
    if "trend" in existing or os.path.exists(os.path.join(td, "cards.json")):
        print(f"trend 회차가 이미 있다 — 건드리지 않는다: {tslug}")
    else:
        os.makedirs(td, exist_ok=True)
        open(os.path.join(td, "cards.json"), "w", encoding="utf-8").write(
            json.dumps(trend_draft(date), ensure_ascii=False, indent=2) + "\n")
        made.append(os.path.relpath(td, ROOT))

    lines = [f"# 인스타그램 초안 · {date}", "",
             "**굽지 않았다.** 글을 다듬은 뒤에 굽는다:",
             "", "```", f"python3 social/instagram/render.py social/instagram/story/{slug}",
             f"python3 social/instagram/render.py social/instagram/trend/{tslug}", "```", "",
             "## story — 기계가 고른 한 건", "",
             f"- `{card['id']}` ({sec}) · 영상 {'있음' if kind == 'video' else '없음'}"
             f" · 원문 {len(paras(card))}문단",
             f"- {(card.get('headline') or '').replace(chr(10), ' ')}",
             f"- {card.get('url', '')}", "",
             "본문 칸에 원문 문단을 그대로 넣어 두었다. 그대로 쓰지 말고 "
             "훅 → 왜 → 어떻게 → 그래서로 다시 쓴다. 숫자가 들어가면 원문을 받아 대조한다.", "",
             "## trend — 후보 묶음 (사람이 고른다)", ""]
    cand = trend_candidates(cards)
    if not cand:
        lines.append("오늘은 세 섹션을 가로지르는 묶음이 없었다. 아카이브까지 거슬러 "
                     "며칠을 꿰는 쪽을 보라.")
    for nsec, n, term, group in cand:
        lines.append(f"**{term}** — {nsec}개 섹션 · {n}건")
        for s, c in group:
            lines.append(f"  - [{s}] {(c.get('headline') or '').replace(chr(10), ' ')}")
        lines.append("")
    lines += ["묶음은 **후보일 뿐이다.** 낱말이 겹친다고 같은 이야기는 아니다 — "
              "제목을 읽고 한 전선으로 읽히는 것만 고른다.", "",
              "## 지켜야 할 것", "",
              "- 두 회차가 같은 그림을 쓰지 않는다 (`pipeline/social_media_test.py`)",
              "- 제목 2줄 · 본문 3줄을 넘지 않는다 (넘으면 render가 멈춘다)",
              "- 캡션에 출처 매체와 날짜를 남긴다", ""]
    rp = os.path.join(SOCIAL, f"DRAFTS-{date}.md")
    open(rp, "w", encoding="utf-8").write("\n".join(lines))
    print(f"초안: {', '.join(made) if made else '(새로 만든 것 없음)'}")
    print(f"안내: {os.path.relpath(rp, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
