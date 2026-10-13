#!/usr/bin/env python3
"""인스타그램 프로필 이미지를 굽는다.

프로필 사진은 **원형으로 잘리고 110px 안팎으로 표시된다.** 그래서 글자를
넣지 않는다 — "AX-it NOW"를 올려 봐야 그 크기에서는 읽히지 않고 마크만
작아진다. 마크 하나만 가운데에 세우고, 원형 크롭이 살(spoke) 끝을 자르지
않도록 여백을 넉넉히 둔다(마크는 정사각의 57%, 외접원 반지름 310px <
크롭 반지름 540px).

바탕을 두 벌 굽는다. 어느 쪽이 맞는지는 앱에서 봐야 안다:
  ink   — 어두운 바탕. 흰 피드에서 원이 또렷하게 떨어지고 살 색이 산다.
  cream — 사이트와 같은 크림 바탕. 흰 배경에서는 원 경계가 흐려질 수 있다.

    python3 social/instagram/profile.py        # out/profile-{ink,cream}.png
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
S = 1080                 # 업로드 크기. 인스타그램은 320까지 줄여 저장한다.
MARK = 620               # 마크 지름

GROUNDS = {"ink": "#1c1a18", "cream": "#fbf8f3"}

PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}
html,body{width:%(S)dpx;height:%(S)dpx;overflow:hidden;background:%(BG)s}
body{display:flex;align-items:center;justify-content:center}
img{width:%(M)dpx;height:%(M)dpx;display:block}
</style></head><body><img src="%(SRC)s"></body></html>"""


def shoot(html, out):
    p = os.path.join(HERE, "_profile.html")
    open(p, "w", encoding="utf-8").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                    f"--window-size={S},{S}", f"--screenshot={out}",
                    "--virtual-time-budget=5000", "--allow-file-access-from-files",
                    "file://" + p], capture_output=True)
    os.path.exists(p) and os.remove(p)


def main():
    out_dir = os.path.join(HERE, "out")
    os.makedirs(out_dir, exist_ok=True)
    src = "file://" + os.path.join(ROOT, "favicon.svg")
    for name, bg in GROUNDS.items():
        out = os.path.join(out_dir, f"profile-{name}.png")
        shoot(PAGE % {"S": S, "M": MARK, "BG": bg, "SRC": src}, out)
        print(f"profile-{name}.png  {os.path.getsize(out)//1024}KB")


if __name__ == "__main__":
    sys.exit(main())
