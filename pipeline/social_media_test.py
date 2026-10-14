# pipeline/social_media_test.py
"""두 회차가 같은 그림을 쓰면 안 된다.

story 회차와 trend 회차가 같은 소재를 다룰 때가 있다. 글이 다르더라도
**썸네일이 같으면 넘기는 사람에게는 같은 글로 보인다** — 실제로 영화
story와 trend가 TW3 클립 두 개를 나눠 쓰고 있었고, 읽을 값이 떨어진다는
지적을 받았다.

경로로만 비교하면 놓친다. 회차마다 src/ 사본을 들고 있으면 경로는 다르고
파일은 같기 때문이다. 그래서 내용 해시로 본다.

한 회차 안에서 같은 영상을 두 번 쓰는 것은 막지 않는다 — 첫 장과 마지막
장이 같은 클립의 앞뒤를 쓰는 것은 의도한 구성이다.
"""
import collections
import glob
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
POSTS = os.path.join(ROOT, "social", "instagram")


def _sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def _usage():
    """{내용해시: {회차: [카드번호…]}}"""
    out = collections.defaultdict(lambda: collections.defaultdict(list))
    for cp in sorted(glob.glob(os.path.join(POSTS, "*", "*", "*", "cards.json"))):
        post = os.path.relpath(os.path.dirname(cp), POSTS)
        for c in json.load(open(cp, encoding="utf-8"))["cards"]:
            for key in ("video", "media"):
                rel = c.get(key)
                if not rel:
                    continue
                p = os.path.join(ROOT, rel)
                if not os.path.exists(p):
                    p = os.path.join(POSTS, post, rel)
                assert os.path.exists(p), f"{post} card{c['n']}: 미디어가 없다 — {rel}"
                out[_sha(p)][post].append(c["n"])
    return out


def test_no_two_posts_share_a_thumbnail():
    bad = []
    for posts in _usage().values():
        if len(posts) > 1:
            bad.append(" / ".join(f"{k} card{','.join(map(str, v))}"
                                  for k, v in sorted(posts.items())))
    assert not bad, "같은 그림을 쓰는 회차들:\n  " + "\n  ".join(bad)


def test_every_card_media_exists():
    """_usage가 경로를 확인하며 돌므로, 빠진 파일이 있으면 여기서 선다."""
    assert _usage(), "회차를 하나도 읽지 못했다"


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except AssertionError as e:
                fails += 1; print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
