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
import subprocess
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
MAIL_DIR = "mail"
MAIL_WIDTH = 1032          # 메일 본문 표시 폭 516px의 2배 — 고해상도 화면까지 커버한다
MAIL_HEIGHT = 580          # 16:9. 2열에서 두 칸의 그림 높이가 같아야 글줄이 맞는다
MAIL_QUALITY = "70"
MAIL_PAD = "FBF8F3"        # 메일 본문 배경색 — 여백이 배경에 녹아 보이지 않는다


def mail_rel(rel):
    """원본 카드 이미지 경로 → 메일용 축소본의 상대 경로."""
    d, name = os.path.split(rel)
    return os.path.join(d, MAIL_DIR, os.path.splitext(name)[0] + ".jpg")


def mail_image(base, rel):
    """메일에 실을 그림의 절대 주소. 상대 경로는 메일에서 안 먹는다.

    카드 그림은 사이트 기준으로 만들어져 있어서 메일에는 너무 무겁다 — W40 사례
    4장의 원본을 합치면 2.98MB이고 그중 PNG 두 장이 2.6MB인데, 메일은 그걸 516px로
    그리면서 원본을 통째로 내려받는다. 그래서 메일은 늘 축소본을 가리킨다.

    svg와 webp는 아예 뺀다 — Outlook과 몇몇 클라이언트가 못 그리고, 깨진 그림
    자리가 남는 것보다 글만 가는 게 낫다. 렌더러는 이미지 없는 사례를 처리한다."""
    if not rel:
        return ""
    if not rel.lower().endswith(MAILABLE_IMG):
        return ""
    return f"{base.rstrip('/')}/{mail_rel(rel).lstrip('/')}"


def _dims(path):
    """sips가 읽어 준 원본 픽셀 크기."""
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                         check=True, capture_output=True, text=True).stdout
    d = dict(l.strip().split(": ") for l in out.splitlines() if ": " in l)
    return int(d["pixelWidth"]), int(d["pixelHeight"])


def ensure_mail_image(rel, root=None):
    """메일용 축소본을 굽는다. 이미 있으면 그대로 두고 True.

    sips는 macOS에만 있다 — 이 파이프라인은 사용자의 Mac에서 도는 cron이 돌리므로
    그걸 쓴다. 없거나 실패하면 False를 돌려주고, 호출부가 원본 주소로 떨어진다."""
    base = root or ROOT
    src = os.path.join(base, rel)
    if not os.path.exists(src):
        return False
    out = os.path.join(base, mail_rel(rel))
    if os.path.exists(out):
        return True
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        w, h = _dims(src)
        # 상자 안에 통째로 들어가게 줄인 뒤 배경색으로 여백을 채운다. 잘라서 맞추면
        # 도표의 축이나 라벨이 날아간다 — 이 메일의 그림은 장식이 아니라 근거다.
        k = min(MAIL_WIDTH / w, MAIL_HEIGHT / h, 1.0)
        subprocess.run(["sips", "-s", "format", "jpeg",
                        "-s", "formatOptions", MAIL_QUALITY,
                        "-z", str(max(1, round(h * k))), str(max(1, round(w * k))),
                        "--padToHeightWidth", str(MAIL_HEIGHT), str(MAIL_WIDTH),
                        "--padColor", MAIL_PAD,
                        src, "--out", out],
                       check=True, capture_output=True)
    except (OSError, ValueError, ZeroDivisionError, subprocess.CalledProcessError):
        if os.path.exists(out):
            os.remove(out)
        return False
    return os.path.exists(out)


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
            "subject": "메일 제목용 한 줄. 25자 안쪽.",
            "insight": "굵게 들어갈 한 문장. 이 주의 핵심 통찰.",
            "article": "세 문장. 사람 에디터가 쓴 것 같은 글.",
            "evidence": [{"card": "<섹션>/<카드 id>"}],
        },
        "rules": [
            # 메일은 짧다. 맨 위 콜라주 한 장, 굵은 인사이트 한 줄, 짧은 글, 카드 링크.
            # 사례를 넉 장 펼치던 구조는 글이 너무 많았다 — 사이트가 하는 일을 반복했다.
            "섹션별 요약을 쓰지 않는다. 한 주의 카드를 전부 읽은 사람에게만 보이는 것을 쓴다.",

            # insight — 일반 원리 한 줄. 이름을 넣지 않아도 된다. 읽히는 게 전부다.
            "insight는 한 문장짜리 일반 원리다. 이번 주 사건들에서 뽑아낸, 다음 주에도 "
            "쓸 수 있는 판단 기준을 쓴다. 예: 'AI 규제는 늘어나지만 그 규제를 집행할 "
            "주체에게 경제적 보상이 없으면 규제는 사실상 효력이 없다.'",
            "insight는 쉬운 말로 쓴다. 한 번 읽고 바로 알아야 한다. 비유를 쓰지 않고, "
            "'자리·지점·영역·측면' 같은 말로 행위자를 대신하지 않는다.",
            "insight는 주장이어야 한다. '~가 늘고 있다' 같은 관찰이 아니라 '~하면 ~이다' 꼴로 "
            "쓴다. 'AI가 모든 것을 바꾼다'처럼 언제나 참인 문장은 통찰이 아니다.",
            "insight는 뉴스 한 건으로는 못 하는 말이어야 하고, 서로 다른 섹션 최소 3곳의 "
            "카드로 떠받쳐져야 한다.",

            # article — 여기가 사람 에디터의 자리다.
            "article은 세 문장이다. 사실을 모아 요약하지 않는다 — 이 현상을 본 편집자가 "
            "독자에게 '그래서 이게 당신에게 무슨 뜻인지'를 말해 주는 글로 쓴다.",
            "article 첫 문장과 둘째 문장은 구체적인 사례를 든다. 회사·기관·나라·법·제품 "
            "이름과 숫자를 그대로 쓴다. 셋째 문장은 그래서 독자가 무엇을 달리 봐야 하는지로 "
            "닫는다.",
            "article에 '~로 보인다', '~일 수 있다', '주목된다' 같은 기자체 상투어를 쓰지 "
            "않는다. 편집자가 자기 판단으로 말한다.",
            "전망이나 '다음 주에 볼 것'을 쓰지 않는다. 지금 읽는 사람에게 지금 쓸모 있는 "
            "말로 끝낸다.",

            # 공통
            "근거 카드가 없는 주장은 쓰지 않는다. 추측 금지.",
            "subject는 받은메일함에 뜨는 한 줄이다. 25자 안쪽으로, insight를 줄인 게 아니라 "
            "제목답게 다시 쓴 문장이어야 한다. 실제 이름이 하나는 들어가고, 마침표는 없다.",
            "evidence는 4건. 서로 다른 섹션에서 고르고, 맨 위 콜라주가 이 넷의 그림으로 "
            "만들어지므로 has_image가 true인 카드만 쓴다. role은 쓰지 않는다 — 메일에는 "
            "제목만 링크로 걸린다.",
            "링크와 이미지 주소는 쓰지 않는다. card에 \"<섹션>/<카드 id>\"만 적는다.",
        ],
    }


def build_collage(rels, edition, root=None):
    """사례 썸네일 넉 장을 2x2 한 장으로 합친다. 메일 맨 위에 오는 그림이다.

    넉 장을 따로 싣던 구조는 글이 너무 많았다. 한 장으로 묶으면 메일이 짧아지고,
    받는 쪽이 한눈에 '이번 주에 무슨 그림이 있었나'를 본다.

    ffmpeg의 hstack/vstack을 쓴다 — ImageMagick도 PIL도 이 기계에 없고, sips는
    합성을 못 한다. 타일이 넉 장이 안 되면 빈 칸을 메일 배경색으로 채운다:
    사례가 모자란 주에도 그림의 모양은 일정해야 한다.

    못 만들면 빈 문자열을 돌려주고 렌더러가 콜라주 없이 간다."""
    base = root or ROOT
    tiles = [r for r in rels if r and os.path.exists(os.path.join(base, r))][:4]
    if not tiles:
        return ""
    out_rel = os.path.join("pipeline", "media", "mail", f"collage-{edition}.jpg")
    out = os.path.join(base, out_rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    half_w, half_h = MAIL_WIDTH // 2, MAIL_HEIGHT // 2

    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for t in tiles:
        args += ["-i", os.path.join(base, t)]
    # 빈 칸은 배경색 단색으로 채운다. 타일과 같은 크기라야 stack이 붙는다.
    blanks = 4 - len(tiles)
    for _ in range(blanks):
        args += ["-f", "lavfi", "-i", f"color=c=0x{MAIL_PAD}:s={half_w}x{half_h}"]
    scale = "".join(f"[{i}:v]scale={half_w}:{half_h}:force_original_aspect_ratio=increase,"
                    f"crop={half_w}:{half_h}[t{i}];" for i in range(len(tiles)))
    scale += "".join(f"[{len(tiles)+i}:v]null[t{len(tiles)+i}];" for i in range(blanks))
    chain = scale + "[t0][t1]hstack[top];[t2][t3]hstack[bot];[top][bot]vstack[v]"
    args += ["-filter_complex", chain, "-map", "[v]", "-frames:v", "1",
             "-q:v", "4", out]
    try:
        subprocess.run(args, check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError):
        if os.path.exists(out):
            os.remove(out)
        return ""
    return out_rel if os.path.exists(out) else ""


def evidence_image(base_url, rel):
    """메일에 실을 주소를 고른다: 축소본이 있으면 그걸, 못 만들면 원본을.

    그림 없는 메일보다 무거운 그림이 낫다 — 특히 첫 사례는 무료 수신자가 보는
    단 하나라서 그 자리가 비면 그림 없는 메일이 된다."""
    small = mail_image(base_url, rel)
    if not small:
        return ""
    if ensure_mail_image(rel):
        return small
    return f"{base_url.rstrip('/')}/{rel.lstrip('/')}"


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
        evidence, used = [], []
        for item in a.get("evidence") or []:
            c = by_key.get((item or {}).get("card"))
            if not c:
                continue      # 없는 카드를 가리키면 링크를 만들지 않는다
            used.append(c)
            evidence.append({
                "section": c.get("section"),
                "headline": (c.get("headline") or "").replace("\n", " "),
                "url": card_link(base_url, lang, c.get("section"), c.get("id")),
                "image": evidence_image(base_url, c.get("image")),
                "role": item.get("role", ""),
            })
        # 콜라주는 사례 썸네일에서 만든다. 언어가 달라도 카드는 같으므로 한 번만 굽고
        # 다섯 언어가 같은 그림을 쓴다.
        # 콜라주는 '원본'에서 만든다. 축소본은 이미 레터박스로 여백이 들어가 있어서,
        # 그걸 다시 잘라 채우면 타일 안에 배경색 띠가 남는다.
        collage = build_collage([c.get("image") for c in used
                                 if mail_image("x", c.get("image"))], edition)
        json.dump({"edition": edition, "lang": lang,
                   "subject": a.get("subject", ""),
                   "collage": f"{base_url.rstrip('/')}/{collage}" if collage else "",
                   "insight": a.get("insight", ""), "article": a.get("article", ""),
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
