# pipeline/favicon_test.py
"""탭 아이콘이 모든 셸에 걸려 있고, 가리키는 파일이 실제로 있어야 한다.

이 사이트는 오랫동안 파비콘이 없어 브라우저 기본 아이콘으로 떴다. 링크 한 줄이
빠져도 아무 오류가 나지 않고, 탭을 직접 보기 전에는 아무도 모른다 — 그래서
셸을 추가하거나 복사할 때 다시 빠지기 쉽다.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# 사람이 탭으로 여는 페이지들. s/ 아래 공유 페이지는 build_data가 만들므로
# 따로 검사한다(test_share_pages_carry_it).
SHELLS = ["index.html", "archive.html", "large.html", "terms.html",
          "privacy.html", "refunds.html",
          "Design AX Brief.html", "Design AX Brief (Large Card).html"]

NEEDED = ["favicon.svg", "favicon-32.png", "favicon-192.png", "apple-touch-icon.png"]


def _read(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()


def test_icon_files_exist_and_are_not_empty():
    for f in NEEDED:
        p = os.path.join(ROOT, f)
        assert os.path.exists(p), f"{f}가 없다"
        assert os.path.getsize(p) > 200, f"{f}가 비었다 ({os.path.getsize(p)}B)"


def test_every_shell_links_the_icon():
    missing = [s for s in SHELLS if 'rel="icon"' not in _read(s)]
    assert not missing, f"파비콘 링크가 없는 셸: {missing}"


def test_every_shell_links_the_apple_touch_icon():
    """홈 화면에 추가했을 때 iOS가 쓸 아이콘. 없으면 화면 스크린샷을 멋대로 쓴다."""
    missing = [s for s in SHELLS if 'rel="apple-touch-icon"' not in _read(s)]
    assert not missing, f"apple-touch-icon이 없는 셸: {missing}"


def test_links_point_at_files_that_exist():
    for s in SHELLS:
        for href in re.findall(r'rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"', _read(s)):
            f = href.lstrip("/").split("?")[0]
            assert os.path.exists(os.path.join(ROOT, f)), f"{s} -> {href} 파일이 없다"


def test_share_pages_carry_it():
    """공유 페이지는 링크를 붙여 넣은 사람이 탭으로 연다 — 거기서도 아이콘이 떠야 한다."""
    src = _read(os.path.join("pipeline", "build_data.py"))
    assert 'rel="icon"' in src, "build_data의 공유 페이지 템플릿에 파비콘이 없다"


def test_the_svg_bakes_the_shape_instead_of_filtering_it():
    """SVG 파비콘의 필터 지원은 브라우저마다 갈린다. 안 먹으면 마크가 흩어진다."""
    svg = _read("favicon.svg")
    assert "<filter" not in svg, "파비콘이 필터에 기대고 있다 — 패스로 구워야 한다"
    assert "<path" in svg


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except AssertionError as e:
                fails += 1; print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
