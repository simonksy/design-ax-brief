# pipeline/social_story_variety_test.py
"""한 회차 안에서 다섯 장이 같은 그림을 쓰면 안 된다.

회차끼리 겹치는 것은 social_media_test 가 막는다. 이건 **한 회차 안**이다 —
story 초안이 고른 그림 하나를 다섯 장에 그대로 깔고 있었고, 그대로 올린 글을
보고 "카드 썸네일이 다 동일하다, 내용에 맞게 다른 썸네일을 써야지"라는 지적을
받았다. 넘기는 사람에게는 같은 장을 다섯 번 보는 셈이다.

**초안은 보지 않는다.** 표시(`!` 올릴 것 · `*` 올린 것)를 붙인 회차만 본다.
초안에서까지 막아 보니 스틸 회차의 가운데 네 장이 빈 칸으로 나왔고, "카드
자체가 없어 판단할 수가 없다"는 지적을 받았다 — 초안의 일은 **고를 수 있게**
하는 것이다. 겹친 썸네일로 올리는 것만 막으면 된다.

기준 두 개다:

  - 스틸(jpg/png)은 한 회차에서 **한 장만** 쓴다. 남는 장은 stat·quote 처럼
    그림이 필요 없는 구성으로 짜거나, 비워 두고 사람이 채운다.
  - 같은 영상을 여러 장이 쓰는 것은 괜찮다 — 단 `start` 가 서로 달라야 한다.
    앞뒤 다른 대목을 쓰는 것은 의도한 구성이고, 같은 초를 두 번 쓰는 것은
    그냥 같은 그림이다.
"""
import collections
import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
POSTS = os.path.join(ROOT, "social", "instagram")


def _frames(spec):
    """{그림: [장 번호…]} — 영상은 (경로, start) 로 센다."""
    out = collections.defaultdict(list)
    for c in spec["cards"]:
        if c.get("video"):
            out[(c["video"], c.get("start", 0))].append(c["n"])
        elif c.get("media"):
            out[c["media"]].append(c["n"])
    return out


MARKS = ("!", "*")


def marked_specs():
    """표시된 회차의 cards.json 경로. 초안은 지나간다."""
    for cp in sorted(glob.glob(os.path.join(POSTS, "*", "*", "*", "cards.json"))):
        if os.path.basename(os.path.dirname(cp)).startswith(MARKS):
            yield cp


def test_no_card_repeats_a_frame_within_a_post():
    bad = []
    for cp in marked_specs():
        spec = json.load(open(cp, encoding="utf-8"))
        for frame, ns in _frames(spec).items():
            if len(ns) > 1:
                rel = os.path.relpath(os.path.dirname(cp), POSTS)
                what = frame[0] if isinstance(frame, tuple) else frame
                where = f"start {frame[1]}s" if isinstance(frame, tuple) else "스틸"
                bad.append(f"{rel}: card{','.join(map(str, ns))} 가 같은 그림 "
                           f"({os.path.basename(what)} · {where})")
    assert not bad, "한 회차 안에서 같은 장면이 반복된다:\n  " + "\n  ".join(bad)


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except AssertionError as e:
                fails += 1; print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
