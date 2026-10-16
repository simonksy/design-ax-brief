# social/instagram/render_outro_cache_test.py
"""outro는 한 번만 굽는다.

마지막 장(outro)은 회차마다 똑같다 — 문안이 같고, 번호를 적지 않고, 색은
브랜드 오렌지로 고정이고, 도는 지식 그래프는 고정 시드다. 10-16 에 구운
outro 13개의 md5가 **전부 같았다.** 그런데 한 장에 7분이 걸려(5400×4560
시트를 크롬으로 다섯 번 찍고 150프레임을 인코딩) 한 벌 8분 중 7분을 먹었고,
후보 20벌을 굽는 데 두 시간 반이 걸렸다.

그래서 같은 outro는 캐시에서 복사한다. 키는 outro를 결정하는 것 전부다 —
문안이 바뀌거나 그래프·합성 코드가 바뀌면 키가 달라져 새로 굽는다.
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render                                                    # noqa: E402

OUTRO = {"n": 6, "kind": "outro", "eyebrow": "매일 아침, AI가 바꾸는 현장",
         "headline": "더 많은 소식은 axitnow.com",
         "body": "매일 아침 열 개 분야에서 새 카드 50장."}
META = {"accent": "#0070f3"}


def test_same_outro_same_key_regardless_of_set():
    """세트 길이(6장·7장)와 섹션 색이 달라도 outro는 같은 장이다."""
    a = render.outro_key(OUTRO, META, 6)
    b = render.outro_key(dict(OUTRO, n=7), {"accent": "#eb367f"}, 7)
    assert a == b, "세트마다 키가 달라 캐시를 못 쓴다"


def test_changed_copy_changes_key():
    a = render.outro_key(OUTRO, META, 6)
    b = render.outro_key(dict(OUTRO, headline="다른 문안"), META, 6)
    assert a != b, "문안이 바뀌었는데 묵은 outro를 꺼내 쓴다"


class _Fakes:
    """크롬·ffmpeg 대역. outro를 몇 번 새로 구웠는지 센다."""
    def __init__(self):
        self.clips = 0

    def network_clip(self, out_dir, mh):
        self.clips += 1
        p = os.path.join(out_dir, "_net.mp4")
        open(p, "wb").write(b"net")
        return p

    def shoot(self, html, out, transparent=False, size=None):
        open(out, "wb").write(b"png")

    def compose(self, card, overlay, out, mh):
        open(out, "wb").write(b"OUTRO-MP4")


def _post(root, name):
    d = os.path.join(root, name)
    os.makedirs(d)
    spec = {"meta": META,
            "cards": [{"n": 1, "kind": "photo", "eyebrow": "e", "headline": "h", "body": "b"},
                      dict(OUTRO, n=2)]}
    json.dump(spec, open(os.path.join(d, "cards.json"), "w"), ensure_ascii=False)
    return d


def test_second_set_copies_outro_instead_of_rebaking():
    tmp = tempfile.mkdtemp()
    fakes = _Fakes()
    saved = {k: getattr(render, k) for k in ("network_clip", "shoot", "compose", "POST", "OUTRO_CACHE")}
    try:
        render.network_clip, render.shoot, render.compose = (
            fakes.network_clip, fakes.shoot, fakes.compose)
        render.OUTRO_CACHE = os.path.join(tmp, "cache")
        for name in ("a", "b"):
            render.POST = _post(tmp, name)
            assert render.main() in (0, None), f"{name} 렌더 실패"
        assert fakes.clips == 1, f"outro를 {fakes.clips}번 구웠다 — 두 번째는 복사해야 한다"
        got = open(os.path.join(tmp, "b", "out", "card2.mp4"), "rb").read()
        assert got == b"OUTRO-MP4", "복사된 outro가 처음 구운 것과 다르다"
        assert not os.path.exists(os.path.join(tmp, "b", "out", "card2.png")), "outro 자리에 png가 생겼다"
    finally:
        for k, v in saved.items():
            setattr(render, k, v)
        shutil.rmtree(tmp)


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except (AssertionError, AttributeError) as e:
                fails += 1; print(f"FAIL {name}: {type(e).__name__}: {e}")
    raise SystemExit(1 if fails else 0)
