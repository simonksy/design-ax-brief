import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_report import week_edition, week_range, cards_in_week, cross_section_clusters, card_link


def test_edition_is_iso_week():
    assert week_edition("2026-10-06") == "2026-W41"


def test_week_range_is_monday_to_sunday():
    lo, hi = week_range("2026-W41")
    assert lo.isoformat() == "2026-10-05" and hi.isoformat() == "2026-10-11"


def test_cards_in_week_is_monday_to_sunday():
    cards = [{"date": "2026-10-04", "section": "design", "id": "a"},   # 전주 일요일
             {"date": "2026-10-05", "section": "design", "id": "b"},   # 월
             {"date": "2026-10-11", "section": "design", "id": "c"},   # 일
             {"date": "2026-10-12", "section": "design", "id": "d"}]   # 다음 주 월
    assert [c["id"] for c in cards_in_week(cards, "2026-W41")] == ["b", "c"]


def test_bad_date_is_skipped_not_fatal():
    assert cards_in_week([{"date": "", "id": "x"}, {"id": "y"}], "2026-W41") == []


# Review Focus 2 — 그 주에 카드가 한 장도 없어도 터지지 않는다.
def test_empty_input_is_not_fatal():
    assert cross_section_clusters([], []) == []


# 실제 데이터 모양: archive 카드의 id는 "cad"처럼 접두사가 없고, 그래프 노드는
# "design/cad"다(build_archive.py의 key = section + "/" + id). 그리고 kw는 문자열이
# 아니라 리스트다. 계획서의 테스트가 두 가지를 모두 잘못 가정하고 있었다.
def test_matches_real_shapes_bare_card_id_and_list_kw():
    cards = [{"id": "cad", "section": "design"}, {"id": "gpt-ads", "section": "marketing"}]
    links = [{"source": "design/cad", "target": "marketing/gpt-ads",
              "kw": ["watermark", "출처"], "w": 0.9}]
    out = cross_section_clusters(cards, links)
    # kw는 낱개로 펼쳐지지만, 같은 카드 묶음은 하나만 남는다(동의어 중복 제거).
    assert len(out) == 1, out
    assert out[0]["kw"] in ("watermark", "출처"), out[0]["kw"]
    assert set(out[0]["sections"]) == {"design", "marketing"}


def test_cluster_must_span_two_sections():
    cards = [{"id": "x", "section": "design"},
             {"id": "y", "section": "marketing"},
             {"id": "z", "section": "design"}]
    links = [{"source": "design/x", "target": "marketing/y", "kw": "watermark", "w": 3},
             {"source": "design/x", "target": "design/z", "kw": "figma", "w": 2}]
    out = cross_section_clusters(cards, links)
    assert len(out) == 1, out
    assert set(out[0]["sections"]) == {"design", "marketing"}
    assert out[0]["kw"] == "watermark"


def test_links_to_cards_outside_the_week_are_ignored():
    cards = [{"id": "x", "section": "design"}]
    links = [{"source": "design/x", "target": "games/old", "kw": "k", "w": 9}]
    assert cross_section_clusters(cards, links) == []


def test_clusters_sorted_by_weight():
    cards = [{"id": "1", "section": "a"}, {"id": "1", "section": "b"},
             {"id": "1", "section": "c"}, {"id": "1", "section": "d"}]
    links = [{"source": "a/1", "target": "b/1", "kw": "small", "w": 1},
             {"source": "c/1", "target": "d/1", "kw": "big", "w": 5}]
    assert [g["kw"] for g in cross_section_clusters(cards, links)] == ["big", "small"]


# 스펙 6.3 — 메일에서 사이트로 돌아오는 링크는 원문 URL이 아니라 딥링크다.
def test_card_link_is_site_deeplink_not_source_url():
    assert card_link("https://axitnow.com", "ko", "marketing", "google-ai-spam") \
        == "https://axitnow.com/ko/?c=marketing:google-ai-spam"


# 클러스터의 ids는 그래프 키(section/id)인데 카드 조회는 bare id로 하고 있었다 —
# 근거 카드가 전부 None으로 나왔다. 프롬프트에 근거가 비면 에이전트가 지어낸다.
def test_cluster_cards_resolve_to_real_headlines():
    from build_report import build_prompts
    archive = [{"id": "cad", "section": "design", "date": "2026-10-06",
                "headline": "말로 그리는 CAD", "body": "b", "source": "s"},
               {"id": "ads", "section": "marketing", "date": "2026-10-06",
                "headline": "ChatGPT 광고", "body": "b", "source": "s"}]
    graph = {"links": [{"source": "design/cad", "target": "marketing/ads",
                        "kw": ["watermark"], "w": 1}]}
    out = build_prompts("2026-W41", archive=archive, graph=graph)
    assert len(out["clusters"]) == 1, out["clusters"]
    heads = [c["headline"] for c in out["clusters"][0]["cards"]]
    assert all(heads), heads
    assert "말로 그리는 CAD" in heads, heads


# I5 — 묶음이 '간선 하나'에 머물면 ③번의 뜻이 사라진다. 같은 키워드를 공유하는
# 간선들이 하나로 모여 세 섹션·네 카드를 잇는 묶음이 나와야 한다.
def test_clusters_merge_on_a_shared_keyword():
    cards = [{"id": "1", "section": "games"}, {"id": "2", "section": "music"},
             {"id": "3", "section": "politics"}, {"id": "4", "section": "books"}]
    links = [{"source": "games/1", "target": "music/2", "kw": ["court", "판결"], "w": 1},
             {"source": "politics/3", "target": "books/4", "kw": ["court", "항소심"], "w": 1}]
    out = cross_section_clusters(cards, links)
    top = out[0]
    assert set(top["sections"]) == {"games", "music", "politics", "books"}, top["sections"]
    assert len(top["ids"]) == 4, top["ids"]
    assert top["kw"] == "court", top["kw"]


# 메일은 섹션별 헤드라인을 다시 늘어놓지 않는다 — 관통 명제 하나와 그걸
# 떠받치는 사례들만 담는다. 사례의 링크와 이미지 주소는 에이전트가 적지 않고
# 카드 id로부터 파이썬이 만든다. 적게 하면 지어낸다.
ARCH = [{"id": "ads", "section": "marketing", "date": "2026-10-06",
         "headline": "ChatGPT 광고", "body": "b", "source": "s",
         "image": "pipeline/media/ads.jpg"}]


def _apply(answers, archive=ARCH):
    from build_report import apply_answers
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        apply_answers("2026-W41", answers, out_root=d, archive=archive,
                      base_url="https://axitnow.com")
        return json.load(open(os.path.join(d, "ko.json"), encoding="utf-8"))


def test_evidence_card_becomes_deep_link_and_absolute_image():
    got = _apply({"ko": {"thesis": "명제", "ground": "논거",
                         "evidence": [{"card": "marketing/ads", "role": "떠받친다"}]}})
    e = got["evidence"][0]
    assert e["url"] == "https://axitnow.com/ko/?c=marketing:ads", e
    assert e["image"] == "https://axitnow.com/pipeline/media/ads.jpg", e
    assert e["headline"] == "ChatGPT 광고" and e["role"] == "떠받친다", e
    assert e["section"] == "marketing", e


def test_thesis_and_ground_pass_through():
    got = _apply({"ko": {"thesis": "관통 명제", "ground": "그 논거",
                         "evidence": []}})
    assert got["thesis"] == "관통 명제" and got["ground"] == "그 논거", got


# 옛 형식(change/sections/dots/next)이 남으면 발송 쪽 게이트가 thesis를 못 찾아
# 그 주 메일이 조용히 건너뛰어진다. 절반만 이주한 상태를 막는다.
def test_legacy_keys_are_gone():
    got = _apply({"ko": {"thesis": "t", "ground": "g", "evidence": []}})
    for k in ("change", "links", "sections", "dots", "next"):
        assert k not in got, (k, got)


# 미디어를 못 구한 카드도 사례로 뽑힐 수 있다. 사례 자체는 남아야 한다.
def test_card_without_image_still_becomes_evidence():
    arch = [dict(ARCH[0], image=None)]
    got = _apply({"ko": {"thesis": "t", "ground": "g",
                         "evidence": [{"card": "marketing/ads", "role": "r"}]}}, arch)
    assert len(got["evidence"]) == 1 and got["evidence"][0]["image"] == "", got


# svg·webp는 메일 클라이언트가 자주 못 그린다. 깨진 그림 자리보다 글만 남는 게 낫다.
def test_unmailable_image_formats_are_dropped():
    for ext in ("svg", "webp"):
        arch = [dict(ARCH[0], image=f"pipeline/media/ads.{ext}")]
        got = _apply({"ko": {"thesis": "t", "ground": "g",
                             "evidence": [{"card": "marketing/ads", "role": "r"}]}}, arch)
        assert got["evidence"][0]["image"] == "", (ext, got)


# 없는 카드를 가리키면 링크를 만들지 않는다 — URL을 지어내는 것보다 빠지는 게 낫다.
def test_unknown_card_is_skipped():
    got = _apply({"ko": {"thesis": "t", "ground": "g",
                         "evidence": [{"card": "marketing/nope", "role": "r"},
                                      {"card": "marketing/ads", "role": "r2"}]}})
    assert len(got["evidence"]) == 1 and got["evidence"][0]["role"] == "r2", got


# 메일은 사례마다 카드 이미지를 싣는다. 이미지 없는 카드를 사례로 고르면 그 자리가
# 비는데, 에이전트는 입력에 그 정보가 없으면 알 수가 없다 — 실제로 W40 1번 사례가
# 그렇게 뽑혔고, 무료 수신자가 보는 단 하나의 사례가 그림 없이 나갔다.
def test_prompts_tell_which_cards_have_an_image():
    from build_report import build_prompts
    archive = [{"id": "withimg", "section": "design", "date": "2026-10-01",
                "headline": "그림 있다", "body": "b", "source": "s",
                "image": "pipeline/media/withimg.jpg"},
               {"id": "noimg", "section": "politics", "date": "2026-10-01",
                "headline": "그림 없다", "body": "b", "source": "s", "image": None}]
    p = build_prompts("2026-W40", archive=archive, graph={"nodes": [], "links": []})
    flat = {c["id"]: c for v in p["sections"].values() for c in v}
    assert flat["withimg"]["has_image"] is True, flat["withimg"]
    assert flat["noimg"]["has_image"] is False, flat["noimg"]


# 메일 클라이언트가 못 그리는 형식은 '이미지 있음'으로 세지 않는다 — 조립 쪽이
# 어차피 빼므로, 있다고 알려 주면 에이전트가 빈 자리를 고르게 된다.
def test_unmailable_image_does_not_count_as_having_one():
    from build_report import build_prompts
    archive = [{"id": "svgonly", "section": "design", "date": "2026-10-01",
                "headline": "svg", "body": "b", "source": "s",
                "image": "pipeline/media/svgonly.svg"}]
    p = build_prompts("2026-W40", archive=archive, graph={"nodes": [], "links": []})
    flat = {c["id"]: c for v in p["sections"].values() for c in v}
    assert flat["svgonly"]["has_image"] is False, flat["svgonly"]


# 같은 카드 묶음이 동의어 수만큼 반복되면 상위 3칸을 한 사건이 다 차지한다
# (실측 W40: 1·2·3위가 'court' / 'fair' / '공정', 뒤 둘은 같은 카드 두 장).
def test_same_card_set_is_not_repeated_under_synonyms():
    cards = [{"id": "1", "section": "music"}, {"id": "2", "section": "politics"},
             {"id": "3", "section": "games"}]
    links = [{"source": "music/1", "target": "politics/2", "kw": ["fair", "공정"], "w": 2},
             {"source": "games/3", "target": "music/1", "kw": ["voice"], "w": 1}]
    out = cross_section_clusters(cards, links)
    sets = [tuple(c["ids"]) for c in out]
    assert len(sets) == len(set(sets)), out
    # 더 무거운 쪽이 남는다
    assert out[0]["kw"] in ("fair", "공정"), out[0]


if __name__ == "__main__":
    fns = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    for n, f in fns:
        f()
    print(f"build_report OK ({len(fns)} tests)")
