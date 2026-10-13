# pipeline/pro_numbers_test.py
"""구독 안내에 뜨는 숫자가 실제와 어긋나지 않아야 한다.

이 파일이 생긴 이유: 섹션이 열 개가 된 뒤에도 구독 팝업에 "하루 9장 / Pro 45장"
(아홉 개 시절 값)이 떠 있었고, 아카이브는 2,900장을 넘었는데 "2,400+"가
그대로였다. **둘 다 손으로 적어 둔 숫자였고, 틀려도 아무 오류가 나지 않는다** —
돈을 받는 화면이라 사용자가 먼저 발견한다.

그래서 숫자를 데이터에서 끌어오게 고쳤고, 다시 손으로 적히지 않게 여기서 막는다.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LANGS = ["ko", "en", "ja", "zh", "es"]


def _read(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()


def _archive_count():
    a = json.load(open(os.path.join(HERE, "archive.json"), encoding="utf-8"))
    if isinstance(a, dict):
        a = a.get("cards", a.get("items", a))
    return len(a)


def test_daily_card_counts_are_not_written_by_hand():
    """비교표의 '하루에 받는 카드' 줄은 섹션 수에서 세야 한다."""
    app = _read("axbrief-app.jsx")
    row = re.search(r"\{\s*key:\s*'cards',(.*?)\},", app, re.S)
    assert row, "PRO_ROWS에서 cards 줄을 찾지 못했다"
    body = row.group(1)
    assert "sectionCount()" in body, "cards 줄이 섹션 수를 세지 않는다 — 숫자를 손으로 적었는가"
    assert not re.search(r"['\"]\d+['\"]", body), \
        f"cards 줄에 숫자가 박혀 있다: {body.strip()}"


def test_free_count_matches_what_the_builder_actually_locks():
    """build_data가 cards[1:]를 잠그므로 섹션당 무료는 정확히 한 장이다.
    페이월을 두 장으로 바꾸면 이 테스트가 먼저 걸린다."""
    assert "for c in cards[1:]:" in _read(os.path.join("pipeline", "build_data.py")), \
        "build_data의 잠금 규칙이 바뀌었다 — 구독 안내의 무료 장수도 같이 봐야 한다"
    app = _read("axbrief-app.jsx")
    assert "const CARDS_PER_SECTION_FREE = 1;" in app, \
        "무료 장수가 빌더의 잠금 규칙(한 장)과 어긋난다"


def test_archive_total_is_emitted_and_never_overstates():
    """안내 숫자는 실제보다 크면 안 된다. 백 단위 내림이라 하루이틀 밀려도 참이다."""
    m = re.search(r"window\.AX_ARCHIVE_TOTAL\s*=\s*(\d+)", _read("axbrief-data.js"))
    assert m, "axbrief-data.js에 AX_ARCHIVE_TOTAL이 없다 — build_data를 다시 돌려라"
    shown, real = int(m.group(1)), _archive_count()
    assert shown <= real, f"안내가 실제보다 많다: {shown} > {real}"
    assert real - shown < 100, f"안내가 너무 뒤처졌다: {shown} vs 실제 {real}"
    assert shown % 100 == 0, f"백 단위로 내림해야 한다: {shown}"


def test_every_language_templates_the_archive_count():
    """한 언어라도 숫자를 박아 두면 그 언어에서만 조용히 틀린다."""
    bad = [l for l in LANGS
           if "{n}" not in json.load(open(os.path.join(ROOT, "i18n", l + ".json"),
                                          encoding="utf-8"))["pro.row_archive"]]
    assert not bad, f"아카이브 수치를 박아 둔 언어: {bad}"


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except AssertionError as e:
                fails += 1; print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
