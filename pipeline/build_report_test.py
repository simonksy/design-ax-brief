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
    # kw 리스트는 낱개 키워드로 펼쳐지므로 표기 수만큼 묶음이 나온다(I5).
    assert len(out) == 2, out
    assert {g["kw"] for g in out} == {"watermark", "출처"}
    assert all(set(g["sections"]) == {"design", "marketing"} for g in out)


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


# I6 — ①번에 근거 카드 링크가 붙어야 메일이 사람을 사이트로 돌려보낸다.
def test_change_cards_become_deep_links():
    from build_report import apply_answers
    import tempfile
    archive = [{"id": "ads", "section": "marketing", "date": "2026-10-06",
                "headline": "ChatGPT 광고", "body": "b", "source": "s"}]
    with tempfile.TemporaryDirectory() as d:
        apply_answers("2026-W41", {"ko": {"change": "c", "change_cards": ["marketing/ads"]}},
                      out_root=d, archive=archive, base_url="https://axitnow.com")
        got = json.load(open(os.path.join(d, "ko.json"), encoding="utf-8"))
    assert got["links"], got
    assert got["links"][0]["url"] == "https://axitnow.com/ko/?c=marketing:ads", got["links"]
    assert got["links"][0]["headline"] == "ChatGPT 광고"


if __name__ == "__main__":
    fns = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    for n, f in fns:
        f()
    print(f"build_report OK ({len(fns)} tests)")
