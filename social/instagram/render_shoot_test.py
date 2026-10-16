# social/instagram/render_shoot_test.py
"""크롬이 끝나면 shoot()도 바로 끝나야 한다.

헤드리스 크롬은 끝나면서 chrome_crashpad_handler 를 고아로 남기고, 그
핸들러가 크롬의 stderr 를 물려받아 40~70초 쥐고 있다. shoot()이
`capture_output=True` 로 크롬을 부르면 파이프가 닫힐 때까지(= 핸들러가
죽을 때까지) 기다린다 — 10-16 크론에서 크롬은 이미 `<defunct>` 인데
render.py 가 멈춰 있었고, PNG 한 장에 40~70초씩 걸렸다(같은 시각 손으로
돌린 렌더는 한 벌 6초). 크롬 출력은 쓰지 않으므로 파이프를 만들지 않는다.
"""
import os
import stat
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render                                                    # noqa: E402

LINGER = 6     # 가짜 crashpad 가 stderr 를 쥐고 버티는 시간


def test_shoot_returns_when_chrome_exits_even_if_a_helper_holds_stderr():
    tmp = tempfile.mkdtemp()
    fake = os.path.join(tmp, "chrome")
    # 크롬 대역: stderr 를 물려받은 자식을 남기고 바로 끝난다.
    open(fake, "w").write(f"#!/bin/sh\n(sleep {LINGER}) &\nexit 0\n")
    os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
    saved = render.CHROME, render.POST
    try:
        render.CHROME, render.POST = fake, tmp
        t = time.monotonic()
        render.shoot("<html></html>", os.path.join(tmp, "x.png"))
        took = time.monotonic() - t
    finally:
        render.CHROME, render.POST = saved
    assert took < LINGER / 2, (f"shoot()이 {took:.1f}초 걸렸다 — 크롬은 바로 끝났는데 "
                               "남은 보조 프로세스가 파이프를 닫을 때까지 기다렸다")


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except AssertionError as e:
                fails += 1; print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
