# pipeline/sections_test.py
"""한 섹션은 여덟 군데에 등록돼야 산다. 한 곳만 빠져도 조용히 틀린다.

마케팅을 추가할 때 motif를 sources.json에만 적고 앱에는 없는 이름을 썼다. 앱은
모르는 motif에 대해 실패하지 않는다 — 마지막 분기로 떨어져 VR 헤드셋을 그린다.
빠뜨리기는 쉽고 눈에 띄기는 어렵다. 그래서 sources.json을 유일한 기준으로 두고,
나머지 일곱 곳이 그걸 따라오는지 한자리에서 본다.

순서도 같이 본다. 탭 순서(build_data), 아카이브 순서(build_archive), 그리고
sources.json의 선언 순서가 어긋나면 화면마다 섹션 차례가 달라진다.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LANGS = ["en", "ko", "ja", "zh", "es"]


def _sources():
    return json.load(open(os.path.join(HERE, "sources.json"), encoding="utf-8"))


def _declared():
    return [s["section"] for s in _sources()["sections"]]


def _py_list(path, name):
    """build_data/build_archive를 import하면 무거운 의존이 딸려 온다. 선언만 읽는다."""
    src = open(os.path.join(HERE, path), encoding="utf-8").read()
    m = re.search(name + r"\s*=\s*\[(.*?)\]", src, re.S)
    assert m, f"{path}에 {name}이 없다"
    return re.findall(r'"([a-z]+)"', m.group(1))


def _py_dict_keys(path, name):
    src = open(os.path.join(HERE, path), encoding="utf-8").read()
    m = re.search(name + r"\s*=\s*\{(.*?)\n\n", src, re.S)
    assert m, f"{path}에 {name}이 없다"
    return set(re.findall(r'"([a-z]+)"\s*:', m.group(1)))


def test_tab_order_matches_sources():
    want = _declared()
    assert _py_list("build_data.py", "SECTION_ORDER") == want, "build_data 탭 순서가 다르다"
    assert _py_list("build_archive.py", "SECTION_ORDER") == want, "build_archive 순서가 다르다"


def test_every_section_has_a_label():
    want = set(_declared())
    for path in ("build_data.py", "build_archive.py"):
        missing = want - _py_dict_keys(path, "SECTION_LABELS")
        assert not missing, f"{path} SECTION_LABELS에 없다: {sorted(missing)}"


def test_every_section_has_a_category():
    s = _sources()
    cats = {c["category"] for c in s["categories"]}
    for sec in s["sections"]:
        missing = [c for c in sec["categories"] if c not in cats]
        assert not missing, f"{sec['section']}가 없는 카테고리를 가리킨다: {missing}"


def test_every_category_has_sources_to_search():
    """allowed_domains가 비면 사서가 검색할 데가 없어 그 섹션은 영원히 빈다."""
    bad = [c["category"] for c in _sources()["categories"] if not c.get("allowed_domains")]
    assert not bad, f"allowed_domains가 빈 카테고리: {bad}"


def test_every_section_has_a_keyword_pool():
    """ax-planner는 `core` + (`pool` | `keywords`)만 읽는다. 다른 이름으로 넣으면
    그 섹션은 core 세 개로만 검색하게 되고, 그래도 아무 오류가 나지 않는다 —
    후보가 적은 날이 그냥 '뉴스가 없는 날'로 보인다. medicine을 처음 넣을 때
    `rotate`로 썼다가 이 테스트에 걸렸다."""
    pool = json.load(open(os.path.join(HERE, "keyword_pool.json"), encoding="utf-8"))
    for sec in _declared():
        got = (pool.get("sections") or {}).get(sec)
        assert got, f"keyword_pool에 없다: {sec}"
        assert got.get("core"), f"{sec}에 core가 없다"
        bulk = [k for k in ("pool", "keywords") if got.get(k)]
        assert bulk, (f"{sec}의 키워드 묶음 키가 'pool'도 'keywords'도 아니다: "
                      f"{sorted(got)} — ax-planner가 못 읽는다")


def test_every_section_has_a_freshness_window():
    import freshness
    for sec in _declared():
        # 모르는 섹션도 예외 없이 느린 창으로 떨어진다. 그 자체는 괜찮지만,
        # 의도한 값인지 한 번은 사람이 고르게 한다.
        w = freshness.window_hours(sec) if hasattr(freshness, "window_hours") else None
        if w is None:
            w = freshness.FAST_WINDOW_H if sec in freshness.FAST_SECTIONS else freshness.SLOW_WINDOW_H
        assert w in (freshness.FAST_WINDOW_H, freshness.SLOW_WINDOW_H), (sec, w)


def test_every_section_has_a_legend_label_in_every_language():
    want = _declared()
    for lang in LANGS:
        d = json.load(open(os.path.join(ROOT, "i18n", f"{lang}.json"), encoding="utf-8"))
        missing = [s for s in want if f"insights.legend_{s}" not in d]
        assert not missing, f"i18n/{lang}.json에 없다: {missing}"


def test_every_section_has_a_graph_colour():
    src = open(os.path.join(ROOT, "axbrief-app.jsx"), encoding="utf-8").read()
    m = re.search(r"const INSIGHTS_COLORS = \{(.*?)\};", src, re.S)
    assert m, "axbrief-app.jsx에 INSIGHTS_COLORS가 없다"
    have = set(re.findall(r"([a-z]+):\s*'#", m.group(1)))
    missing = [s for s in _declared() if s not in have]
    assert not missing, f"INSIGHTS_COLORS에 없다 — 지식 그래프에서 색이 빈다: {missing}"


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn()
                print(f"ok   {name}")
            except AssertionError as e:
                fails += 1
                print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
