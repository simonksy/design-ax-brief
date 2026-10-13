#!/usr/bin/env python3
"""인스타그램 카드뉴스 생성기.

사이트 카드의 문법을 그대로 가져온다: 위에 시각 블록, 아래 제목과 요약.
다만 인스타그램은 1080x1350(4:5)이고 스와이프로 읽으므로, 한 이슈를 여러 장에
쪼개 각 장이 하나의 microbite만 담는다.

시각 블록은 세 종류다. 사진(photo), 숫자판(stat), 인용판(quote) — 사진이 없는
대목에서도 레이아웃 문법을 유지하려고 둔 것이다. 모두 같은 높이를 쓰므로
캐러셀을 넘길 때 글이 같은 자리에서 시작한다.

렌더는 헤드리스 크롬. 영상 카드는 글 부분만 PNG로 굽고 ffmpeg으로 위에 영상을
얹는다 — 텍스트는 고정이고 썸네일 자리만 움직인다.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))      # 저장소 루트
# 포스트 폴더: 인자로 받는다. cards.json과 out/이 그 안에 있다.
POST = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else HERE
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1080, 1350
MEDIA_H = 760          # 시각 블록 높이. 나머지 590이 글 자리다.

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:%(W)dpx;height:%(H)dpx;overflow:hidden}
body{font-family:-apple-system,'Apple SD Gothic Neo','Helvetica Neue',sans-serif;
  background:#fbf8f3;color:#1c1a18;-webkit-font-smoothing:antialiased}
.media{width:%(W)dpx;height:%(MH)dpx;overflow:hidden;position:relative;background:#e9e3d8}
.media img{width:100%%;height:100%%;object-fit:cover;display:block}
/* 숫자판 — 사진이 없는 대목에서도 시각 블록의 자리를 지킨다 */
.stat{width:100%%;height:100%%;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:18px;background:#17150f;color:#f4f0e9}
.stat .big{font-size:96px;font-weight:800;letter-spacing:-.03em;line-height:1}
.stat .was{opacity:.45;text-decoration:line-through;text-decoration-thickness:5px}
.stat .mid{font-size:30px;opacity:.62;letter-spacing:.02em}
.stat .now{color:%(ACCENT)s}
/* 인용판 */
.quote{width:100%%;height:100%%;display:flex;flex-direction:column;justify-content:center;
  padding:0 78px;background:%(ACCENT)s;color:#fff}
.quote .q{font-size:62px;font-weight:700;line-height:1.34;letter-spacing:-.02em;white-space:pre-line}
.quote .by{margin-top:32px;font-size:26px;opacity:.82;line-height:1.5}
.quote .mark{font-size:92px;font-weight:800;opacity:.4;line-height:.8;margin-bottom:14px}
/* 글 자리 */
.body{height:%(BH)dpx;padding:52px 68px 0;display:flex;flex-direction:column}
.eyebrow{font-size:25px;font-weight:700;letter-spacing:.06em;color:%(ACCENT)s;margin-bottom:20px}
h1{font-size:%(HS)dpx;font-weight:800;line-height:1.28;letter-spacing:-.03em;white-space:pre-line}
p{margin-top:26px;font-size:%(BS)dpx;line-height:1.66;color:#45403a;white-space:pre-line}
.cover h1{font-size:82px}
.cover p{font-size:34px;color:#5a544c}
.foot{margin-top:auto;padding-bottom:44px;display:flex;align-items:center;
  justify-content:space-between;font-size:24px;color:#8e887c}
.brand{display:flex;align-items:center;gap:11px;font-weight:700;color:#5a544c}
.brand img{width:30px;height:30px}
.pg{font-variant-numeric:tabular-nums;letter-spacing:.04em}
"""


def asset(rel):
    """미디어는 저장소의 pipeline/media를 그대로 쓴다 — 사본을 두면 같은 그림이
    두 벌이 되고, 한쪽만 고쳐지는 날이 온다. 절대 file:// 로 넘겨 HTML을 어디에
    써도 경로가 풀리게 한다."""
    return "file://" + os.path.join(ROOT, rel)


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def media_html(c, accent):
    k = c.get("kind")
    if k == "stat":
        return ('<div class="media"><div class="stat">'
                f'<div class="big was">{esc(c["stat_top"])}</div>'
                f'<div class="mid">{esc(c["stat_arrow"])}</div>'
                f'<div class="big now">{esc(c["stat_bottom"])}</div></div></div>')
    if k == "quote":
        return ('<div class="media"><div class="quote">'
                '<div class="mark">“</div>'
                f'<div class="q">{esc(c["quote"])}</div>'
                f'<div class="by">{esc(c["quote_by"])}</div></div></div>')
    return f'<div class="media"><img src="{asset(c["media"])}"></div>'


def media_height(c):
    """글이 길수록 시각 블록을 줄인다. 넘쳐서 잘리는 것보다 그림이 작은 게 낫다 —
    캐러셀에서 푸터(출처·페이지 번호)가 사라지면 출처 표기가 없어진다."""
    if c.get("kind") == "cover":
        return MEDIA_H
    n = len(c.get("body", ""))
    return MEDIA_H if n <= 150 else (660 if n <= 250 else 580)


def card_html(c, meta, total, text_only=False):
    accent = meta["accent"]
    cover = " cover" if c.get("kind") == "cover" else ""
    blen = len(c.get("body", ""))
    mh = media_height(c)
    hs = 56 if len(c.get("headline", "")) > 26 else 62
    bs = 29 if blen > 300 else (31 if blen > 190 else 33)
    css = CSS % {"W": W, "H": H, "MH": mh, "BH": H - mh,
                 "ACCENT": accent, "HS": hs, "BS": bs}
    media = "" if text_only else media_html(c, accent)
    if text_only:
        css += "\n.body{height:%dpx}" % (H - MEDIA_H)
    pg = c.get("foot", "")
    counter = f'{c["n"]} / {total}' if c.get("n") else ""
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{css}</style></head>
<body>{media}
<div class="body{cover}">
  <div class="eyebrow">{esc(c.get('eyebrow',''))}</div>
  <h1>{esc(c.get('headline',''))}</h1>
  <p>{esc(c.get('body',''))}</p>
  <div class="foot">
    <span>{esc(pg)}</span>
    <span class="brand"><img src="{asset("favicon.svg")}">AX-it NOW</span>
    <span class="pg">{counter}</span>
  </div>
</div></body></html>"""


def shoot(html, out, h=H):
    p = os.path.join(POST, "_tmp.html")
    open(p, "w", encoding="utf-8").write(html)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                    f"--window-size={W},{h}", f"--screenshot={out}",
                    "--virtual-time-budget=4000", "--allow-file-access-from-files",
                    "file://" + p], capture_output=True)
    return os.path.exists(out)


def main():
    spec = json.load(open(os.path.join(POST, "cards.json"), encoding="utf-8"))
    meta, cards = spec["meta"], spec["cards"]
    out_dir = os.path.join(POST, "out")
    os.makedirs(out_dir, exist_ok=True)
    for c in cards:
        out = os.path.join(out_dir, f"card{c['n']}.png")
        shoot(card_html(c, meta, len(cards)), out)
        print(f"card{c['n']}.png  {os.path.getsize(out)//1024}KB")

    # 영상 카드: 글 부분만 PNG로 굽고 위에 영상을 얹는다.
    v = spec.get("video_demo")
    if v:
        tx = os.path.join(out_dir, "_text.png")
        shoot(card_html(dict(v, n=0), meta, len(cards), text_only=True), tx, h=H - MEDIA_H)
        src = os.path.join(ROOT, v["video"])
        out = os.path.join(out_dir, "card_video.mp4")
        # 영상을 1080 폭으로 맞춰 자르고, 그 아래 고정 텍스트를 붙인다.
        # 소스(1280x720)는 1080폭으로 줄이면 608px이라 760 크롭이 안 된다.
        # 상자를 '덮도록' 키운 뒤 가운데를 자른다.
        vf = (f"[0:v]scale={W}:{MEDIA_H}:force_original_aspect_ratio=increase,"
              f"crop={W}:{MEDIA_H},setsar=1[v];"
              f"[v][1:v]vstack=inputs=2,format=yuv420p[o]")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-i", tx,
                        "-filter_complex", vf, "-map", "[o]",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                        "-movflags", "+faststart", "-an", out], check=True)
        d = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                            "format=duration", "-of", "csv=p=0", out],
                           capture_output=True, text=True).stdout.strip()
        print(f"card_video.mp4  {os.path.getsize(out)//1024}KB  {d}s")


if __name__ == "__main__":
    sys.exit(main())
