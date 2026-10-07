"""주간 리포트 블록을 만든다.

리포트의 핵심은 ③ '흩어진 점 잇기'다. 지식 네트워크가 이미 공유 키워드로 카드
사이의 간선을 계산해 두었으므로, 그 주 카드들이 걸쳐 있는 간선 중 **두 개 이상의
섹션을 잇는 것**만 추리면 "한 섹션만 봐서는 안 보이는 흐름"이 그대로 나온다.
억지로 지어내지 않고 데이터가 이미 아는 것을 꺼내는 쪽이 리포트의 신뢰를 지킨다.

    python3 build_report.py prompts --edition 2026-W41 --out /tmp/report_jobs.json
    (ax-writer 계열 에이전트가 읽고 /tmp/report_answers.json을 쓴다)
    python3 build_report.py apply --edition 2026-W41 --answers /tmp/report_answers.json
        -> reports/<edition>/<lang>.json  (5개 언어)
"""
import argparse
import datetime
import json
import os
import re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LANGS = ["en", "ko", "ja", "zh", "es"]
TOP_CLUSTERS = 3


def week_edition(date_str):
    """ISO 주차 라벨. 월요일이 주의 시작이다.
    worker/lib/weekly_send.js의 isoWeekLabel과 결과가 같아야 한다 — 한쪽이
    2026-W41을 쓰는데 다른 쪽이 W40을 찾으면 메일이 조용히 나가지 않는다."""
    d = datetime.date.fromisoformat(date_str)
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def week_range(edition):
    y, w = edition.split("-W")
    monday = datetime.date.fromisocalendar(int(y), int(w), 1)
    return monday, monday + datetime.timedelta(days=6)


def cards_in_week(cards, edition):
    lo, hi = week_range(edition)
    out = []
    for c in cards:
        try:
            d = datetime.date.fromisoformat(c.get("date") or "")
        except (ValueError, TypeError):
            continue          # 날짜가 깨진 카드 하나가 그 주 전체를 막지 않는다
        if lo <= d <= hi:
            out.append(c)
    return out


def graph_key(card):
    """그래프 노드 id는 build_archive.py가 section + "/" + id로 만든다. archive의
    카드 id는 접두사가 없으므로 여기서 같은 규칙으로 맞춰야 간선이 붙는다 —
    맞추지 않으면 교차 클러스터가 늘 0개가 되고 ③번 문단이 통째로 비어 버린다."""
    return f"{card.get('section')}/{card.get('id')}"


def cross_section_clusters(cards, links, min_sections=2):
    """두 개 이상의 섹션을 잇는 간선만 남겨 공유 키워드별로 묶는다.
    가중치 합이 큰 묶음이 그 주의 '점'이다."""
    sec = {graph_key(c): c.get("section") for c in cards}
    by_kw = defaultdict(lambda: {"ids": set(), "sections": set(), "w": 0, "kw": None})
    for l in links:
        a, b = l.get("source"), l.get("target")
        if a not in sec or b not in sec:
            continue          # 그 주 바깥의 카드로 뻗은 간선은 이번 주의 점이 아니다
        if sec[a] == sec[b]:
            continue          # 같은 섹션끼리는 '교차'가 아니다
        # kw는 같은 뜻의 여러 표기가 담긴 리스트다. 리스트 전체를 키로 쓰면 표기가
        # 한 글자만 달라도 다른 묶음이 되어, 결과가 전부 '카드 두 장짜리 간선 하나'로
        # 쪼개진다 — 실측에서 60/61이 두 장이었다. 낱개 키워드로 펼쳐 묶으면 같은
        # 키워드를 공유하는 간선들이 모여 세 섹션·네 카드짜리 묶음이 나온다.
        kw = l.get("kw")
        words = kw if isinstance(kw, (list, tuple)) else [kw or ""]
        for word in words:
            g = by_kw[word]
            g["kw"] = word
            g["ids"].update([a, b])
            g["sections"].update([sec[a], sec[b]])
            g["w"] += l.get("w") or 1
    out = [{"kw": v["kw"], "ids": sorted(v["ids"]), "sections": sorted(v["sections"]), "w": v["w"]}
           for v in by_kw.values() if len(v["sections"]) >= min_sections]
    out.sort(key=lambda x: (-x["w"], str(x["kw"])))
    # 같은 카드 묶음이 동의어 수만큼 반복되면 상위 칸을 한 사건이 다 차지한다
    # (실측: W40의 1·2·3위가 court / fair / 공정이었고 뒤 둘은 같은 카드 두 장).
    # 카드 집합이 같으면 가장 무거운 하나만 남긴다.
    seen, uniq = set(), []
    for g in out:
        key = tuple(g["ids"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(g)
    return uniq


def card_link(base, lang, section, card_id):
    """메일에서 사이트로 돌아오는 링크(스펙 6.3). 원문 URL이 아니라 딥링크다 —
    잠긴 카드를 누른 비구독자에게 기존 구독 모달이 떠야 전환이 일어난다."""
    return f"{base.rstrip('/')}/{lang}/?c={section}:{card_id}"


MAILABLE_IMG = (".jpg", ".jpeg", ".png", ".gif")


def mail_image(base, rel):
    """카드 이미지의 절대 주소. 메일에서는 사이트와 달리 상대 경로가 안 먹는다.

    svg와 webp는 뺀다 — Outlook과 몇몇 클라이언트가 못 그리고, 깨진 그림 자리가
    남는 것보다 글만 가는 게 낫다. 렌더러는 이미지 없는 사례를 이미 처리한다."""
    if not rel:
        return ""
    if not rel.lower().endswith(MAILABLE_IMG):
        return ""
    return f"{base.rstrip('/')}/{rel.lstrip('/')}"


def load_graph(path=None):
    p = path or os.path.join(ROOT, "archive-graph.js")
    s = open(p, encoding="utf-8").read()
    m = re.search(r"window\.AX_GRAPH\s*=\s*(\{.*\})\s*;", s, re.S)
    if not m:
        return {"nodes": [], "links": []}
    return json.loads(m.group(1))


def load_archive(path=None):
    p = path or os.path.join(HERE, "archive.json")
    d = json.load(open(p, encoding="utf-8"))
    return d["cards"] if isinstance(d, dict) and "cards" in d else d


def build_prompts(edition, archive=None, graph=None, base_url="https://axitnow.com"):
    """에이전트에게 넘길 입력. 사실은 전부 여기서 넣고, 에이전트는 문장만 쓴다 —
    링크도 카드 id만 받아 파이썬이 조립한다(URL을 지어내지 못하게)."""
    cards = cards_in_week(archive if archive is not None else load_archive(), edition)
    g = graph if graph is not None else load_graph()
    clusters = cross_section_clusters(cards, g.get("links") or [])[:TOP_CLUSTERS]
    # 클러스터의 ids는 그래프 키(section/id)다 — bare id로 찾으면 전부 비고,
    # 근거가 빈 프롬프트를 받은 에이전트는 지어내기 시작한다.
    by_key = {graph_key(c): c for c in cards}

    # 메일은 사례마다 카드 이미지를 싣는다. 이미지 없는 카드를 사례로 고르면 그
    # 자리가 비는데, 입력에 적어 주지 않으면 에이전트는 알 수가 없다. 메일에서 못
    # 그리는 형식은 '없음'으로 센다 — 조립 쪽이 어차피 빼므로 있다고 알리면 거짓이다.
    def has_image(c):
        return bool(mail_image("https://x", c.get("image")))

    by_section = defaultdict(list)
    for c in cards:
        by_section[c.get("section")].append({
            "id": c.get("id"), "headline": (c.get("headline") or "").replace("\n", " "),
            "body": c.get("body"), "source": c.get("source"), "has_image": has_image(c),
        })

    def brief(key):
        c = by_key.get(key) or {}
        return {"id": c.get("id"), "section": c.get("section"),
                "headline": (c.get("headline") or "").replace("\n", " "),
                "body": c.get("body"), "has_image": has_image(c)}

    return {
        "edition": edition,
        "range": [d.isoformat() for d in week_range(edition)],
        "card_count": len(cards),
        "sections": {k: v for k, v in sorted(by_section.items())},
        "clusters": [{**c, "cards": [brief(i) for i in c["ids"]]} for c in clusters],
        "langs": LANGS,
        "answer_shape": {
            "thesis": "한 문장. 섹션들을 관통하는 명제.",
            "ground": "두 문장. 그 명제가 왜 이번 주에 성립하는지에 대한 논거.",
            "evidence": [{"card": "<섹션>/<카드 id>", "role": "한 문장."}],
        },
        "rules": [
            # 이 메일의 존재 이유가 이 한 줄에 달려 있다. 섹션별 요약은 사이트가 이미
            # 하는 일이고, 메일이 그걸 반복하면 따로 받을 이유가 없다.
            "섹션별 요약을 쓰지 않는다. 한 주의 카드를 전부 읽은 사람에게만 보이는 관통선 하나를 명제로 쓴다.",
            "명제는 뉴스 한 건으로는 못 하는 말이어야 한다. 한 사건을 바꿔 말한 문장이면 버리고 다시 쓴다.",
            "명제는 서로 다른 섹션 최소 3곳의 카드로 떠받쳐져야 한다. 한 섹션 안에서만 성립하면 그건 그 섹션의 뉴스다.",
            "'AI가 모든 것을 바꾼다' 같은 언제나 참인 문장은 명제가 아니다. 이번 주에 새로 참이 된 것만 쓴다.",
            "근거 카드가 없는 주장은 쓰지 않는다. 추측 금지.",
            "사례는 4건. 각 role은 '이 사례가 명제의 어느 부분을 떠받치는가'만 쓴다 — 기사 요약을 다시 쓰지 않는다.",
            "사례는 has_image가 true인 카드에서 고른다. 메일은 사례마다 카드 그림을 싣고, 그림 없는 카드는 그 자리가 빈다. 논지상 꼭 필요한 카드만 예외로 두되 첫 사례로는 쓰지 않는다 — 첫 사례는 무료 수신자가 보는 단 하나다.",
            "링크와 이미지 주소는 쓰지 않는다. card에 \"<섹션>/<카드 id>\"만 적으면 조립 쪽이 만든다.",
            "다음 주 전망, 지켜볼 것, 맺음말을 쓰지 않는다. 명제와 그 근거에서 끝낸다.",
        ],
    }


def apply_answers(edition, answers, out_root=None, base_url="https://axitnow.com",
                  archive=None):
    """언어별 답을 reports/<edition>/<lang>.json으로 쓴다.

    사례의 링크와 이미지 주소는 에이전트가 적지 않는다(`card`에 id만 적는다) —
    적게 하면 지어낸다. 원문이 아니라 사이트 딥링크를 걸어야 메일이 사람을 사이트로
    돌려보내고, 잠긴 카드를 누른 비구독자에게 구독 모달이 뜬다."""
    root = out_root or os.path.join(ROOT, "reports", edition)
    os.makedirs(root, exist_ok=True)
    cards = archive if archive is not None else load_archive()
    by_key = {graph_key(c): c for c in cards}
    written = []
    for lang in LANGS:
        a = answers.get(lang)
        if not a:
            continue          # 한 언어가 비어도 나머지는 쓴다
        evidence = []
        for item in a.get("evidence") or []:
            c = by_key.get((item or {}).get("card"))
            if not c:
                continue      # 없는 카드를 가리키면 링크를 만들지 않는다
            evidence.append({
                "section": c.get("section"),
                "headline": (c.get("headline") or "").replace("\n", " "),
                "url": card_link(base_url, lang, c.get("section"), c.get("id")),
                "image": mail_image(base_url, c.get("image")),
                "role": item.get("role", ""),
            })
        json.dump({"edition": edition, "lang": lang,
                   "thesis": a.get("thesis", ""), "ground": a.get("ground", ""),
                   "evidence": evidence},
                  open(os.path.join(root, f"{lang}.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        written.append(lang)
    return written


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("prompts"); p1.add_argument("--edition", required=True); p1.add_argument("--out", required=True)
    p2 = sub.add_parser("apply"); p2.add_argument("--edition", required=True); p2.add_argument("--answers", required=True)
    a = ap.parse_args()
    if a.cmd == "prompts":
        d = build_prompts(a.edition)
        json.dump(d, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"{d['card_count']} card(s), {len(d['clusters'])} cluster(s) -> {a.out}")
    else:
        got = apply_answers(a.edition, json.load(open(a.answers, encoding="utf-8")))
        print(f"reports/{a.edition}/: {', '.join(got)}")


if __name__ == "__main__":
    main()
