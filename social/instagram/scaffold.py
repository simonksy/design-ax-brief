#!/usr/bin/env python3
"""아카이브 카드 id로 회차 뼈대를 찍어 낸다.

스무 세트를 손으로 쓰다 보면 반드시 어긋난다 — 섹션 색을 테마로 고르거나,
날짜를 보도일로 적거나, 미디어 경로를 틀리게 쓴다. 실제로 첫 회차들에서
셋 다 났다. **날짜·섹션·색·미디어 경로는 아카이브가 정답을 갖고 있으니
사람이 손으로 옮기지 않는다.**

    python3 social/instagram/scaffold.py trend <슬러그> <id> <id> ...
    python3 social/instagram/scaffold.py story <슬러그> <id> [<id> ...]

찍어 낸 cards.json은 **초고다.** eyebrow·headline·body는 아카이브 요약을
그대로 넣어 두므로, 그대로 두면 안 된다:

  - 요약은 원문을 줄이면서 숫자와 날짜를 잃는다. 숫자가 들어간 카드는
    원문을 받아 대조한다 — 지금까지 이 대조가 매번 틀린 값을 잡았다.
  - story는 한 이슈의 다음 단계로, trend는 한 전선의 시간순으로 다시 쓴다.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ARCHIVE = os.path.join(ROOT, "pipeline", "archive.json")

# 사이트 INSIGHTS_COLORS와 같아야 한다. 한쪽만 고치면 카드 색이 사이트와 어긋난다.
ACCENT = {"design": "#0070f3", "music": "#eb367f", "movies": "#7928ca",
          "games": "#2ec5c5", "books": "#f5a623", "gadgets": "#ff5a4d",
          "science": "#3aa655", "politics": "#9aa8c7", "marketing": "#ff8a3d",
          "medicine": "#00897b"}

OUTRO = {"kind": "outro", "eyebrow": "매일 아침, AI가 바꾸는 현장",
         "headline": "더 많은 소식은 axitnow.com",
         "body": "매일 아침 열 개 분야에서 새 카드 50장. "
                 "분야를 넘나드는 연결은 지식 그래프로 한눈에 봅니다.",
         "foot": ""}


def load():
    a = json.load(open(ARCHIVE, encoding="utf-8"))
    if isinstance(a, dict):
        a = a.get("cards", a.get("items", []))
    return {c["id"]: c for c in a}


def ko(c, key):
    return ((c.get("text") or {}).get("ko") or {}).get(key) or c.get(key) or ""


def media_for(cid):
    """영상이 있으면 영상을 쓴다 — 스틸은 쓸 영상이 아예 없을 때만이다."""
    for ext in (".mp4", ".jpg", ".png", ".webp"):
        rel = os.path.join("pipeline", "media", cid + ext)
        if os.path.exists(os.path.join(ROOT, rel)):
            return ("video" if ext == ".mp4" else "media"), rel
    return None, None


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 1
    mode, slug, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
    if mode not in ("story", "trend"):
        print("mode는 story 또는 trend"); return 1
    by_id = load()
    missing = [i for i in ids if i not in by_id]
    if missing:
        print("아카이브에 없는 id:", ", ".join(missing)); return 1
    picks = sorted((by_id[i] for i in ids), key=lambda c: c["date"])
    section = picks[0]["section"]
    accent = ACCENT[section]

    cards = []
    if mode == "trend":
        cards.append({
            "n": 1, "kind": "thread",
            "thread_badge": "이슈 트렌드",
            "thread_cap": f"아카이브에서 꿴 {len(picks)}건",
            "thread": [{"d": c["date"][5:].replace("-0", ".").replace("-", "."),
                        "t": ko(c, "headline").replace("\n", " ")[:7],
                        "c": ACCENT[c["section"]], "s": c["section"].upper()}
                       for c in picks],
            "thread_note": "TODO: 이 흐름의 요점 한 줄",
            "eyebrow": "흐름 · TODO",
            "headline": "TODO: 꿰어야 보이는 문장",
            "body": "TODO: 왜 한 건으로는 안 보이는지",
            "foot": "밀어서 보기 →",
        })
    for n, c in enumerate(picks, start=2 if mode == "trend" else 1):
        kind, mrel = media_for(c["id"])
        card = {"n": n, "kind": "photo",
                "eyebrow": "TODO",
                "headline": ko(c, "headline").replace("\n", " "),
                "body": ko(c, "body").replace("\n", " "),
                "foot": c["date"].replace("-", "."),
                "_src": c.get("url", ""), "_id": c["id"]}
        if kind:
            card[kind] = mrel
        cards.append(card)
    if mode == "story":
        cards[0]["kind"] = "cover"
    cards.append(dict(OUTRO, n=len(cards) + 1))

    spec = {"meta": {"issue": "TODO", "date": "2026.10.13",
                     "section": section.upper(), "accent": accent,
                     "note": "TODO", "sources": [c.get("url", "") for c in picks]},
            "cards": cards}
    d = os.path.join(HERE, mode, slug)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "cards.json")
    open(p, "w", encoding="utf-8").write(json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
    vids = sum(1 for c in cards if c.get("video"))
    print(f"{p}  카드 {len(cards)}장 · 영상 {vids}장 · 섹션 {section}")
    for c in cards:
        if c.get("_id"):
            print(f"  {c['foot']}  {'VID' if c.get('video') else ('IMG' if c.get('media') else '없음')}"
                  f"  {c['headline'][:44]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
