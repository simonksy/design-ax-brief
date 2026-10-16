# social/instagram/publish_order_test.py
"""올리는 순서는 story 와 trend 를 번갈아 간다.

피드는 올린 순서대로 쌓이므로 같은 형식이 연달아 붙으면 피드가 단조롭다.
marked_posts()는 같은 섹션의 story·trend 만 짝지어 붙이고 **짝 없는 trend 는
전부 맨 뒤로** 보냈다 — 10-16 에 books·design story 와 games·movies trend 를
고르자 story, story, trend, trend 로 나왔다.
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publish                                                   # noqa: E402


def _tree(stories, trends):
    root = tempfile.mkdtemp()
    for kind, secs in (("story", stories), ("trend", trends)):
        for i, sec in enumerate(secs):
            d = os.path.join(root, kind, "2026-10-16", f"!2026-10-16-{sec.lower()}-{kind}{i}")
            os.makedirs(d)
            json.dump({"meta": {"section": sec}}, open(os.path.join(d, "cards.json"), "w"))
    return root


def _order(stories, trends):
    root = _tree(stories, trends)
    saved = publish.HERE
    try:
        publish.HERE = root
        return [(k, json.load(open(os.path.join(p, "cards.json")))["meta"]["section"])
                for k, _, p in publish.marked_posts()]
    finally:
        publish.HERE = saved
        shutil.rmtree(root)


def test_alternates_kinds_when_no_section_pairs():
    got = _order(["BOOKS", "DESIGN"], ["GAMES", "MOVIES"])
    kinds = [k for k, _ in got]
    assert kinds == ["story", "trend", "story", "trend"], f"형식이 몰렸다: {got}"


def test_same_section_story_and_trend_stay_adjacent():
    got = _order(["DESIGN", "MOVIES"], ["DESIGN"])
    assert got[:2] == [("story", "DESIGN"), ("trend", "DESIGN")], f"짝이 떨어졌다: {got}"
    assert got[2] == ("story", "MOVIES"), got


def test_after_a_pair_the_next_is_a_story():
    """짝(story→trend) 뒤에 짝 없는 trend 가 바로 붙으면 trend 가 둘 연달아 온다."""
    got = _order(["DESIGN", "BOOKS"], ["DESIGN", "GAMES"])
    kinds = [k for k, _ in got]
    assert kinds == ["story", "trend", "story", "trend"], f"형식이 몰렸다: {got}"


def test_every_marked_post_appears_once():
    got = _order(["A", "B", "C"], ["A", "X"])
    assert len(got) == 5 and len(set(got)) == 5, got


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except AssertionError as e:
                fails += 1; print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
