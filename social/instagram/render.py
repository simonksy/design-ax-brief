#!/usr/bin/env python3
"""인스타그램 카드뉴스 생성기.

사이트 카드의 문법(위 시각 블록, 아래 제목·요약)을 1080x1350 캐러셀로 옮긴다.
사이트는 카드 한 장이 뉴스 한 건이지만 여기서는 한 이슈를 여러 장에 쪼갠다 —
스와이프로 읽히므로 한 장이 하나의 microbite만 담아야 한다.

영상이 우선이다. 카드에 `video`가 있으면 MP4로 굽고, 영상 소스가 아예 없을
때만 스틸로 간다. 영상은 썸네일 자리에서만 움직이고 글은 고정이다 — 글까지
움직이면 읽을 수가 없다.

합성 방식: 카드 전체를 '썸네일 자리만 투명한' PNG 한 장으로 굽고, 영상 위에
그 PNG를 얹는다. 글·숫자판·인용판이 모두 그 PNG에 들어 있으므로 영상 위에
숫자를 올리는 것도 같은 경로로 처리된다.

렌더는 헤드리스 크롬, 합성은 ffmpeg. 둘 다 이 기계에 있다.
`NODE_OPTIONS`가 오염돼 있으면 크롬이 아니라 그 전에 죽는다 — `unset` 하고 돌린다.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))          # 저장소 루트
POST = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else HERE
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

W, H = 1080, 1350
MEDIA_H = 760            # 썸네일 자리의 최대 높이. 글이 길면 이보다 줄어든다.
PAD_X, PAD_TOP = 68, 52
TEXT_W = W - PAD_X * 2
FOOT_H = 24 + 44         # 푸터 글자 + 아래 여백
BREATH = 46              # 본문과 푸터 사이 최소 숨
CREAM = "#fbf8f3"
# 로고의 시그널 오렌지. outro 한 장만 섹션 액센트 대신 이 색을 쓴다 — 마지막
# 장은 그 회차의 섹션이 아니라 브랜드를 말하는 자리고, 섹션색을 쓰면 마크의
# 오렌지 점과 맞부딪힌다(영화편 파랑 옆에 두고 보면 바로 보인다).
BRAND_ACCENT = "#FF4D1A"

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:%(W)dpx;height:%(H)dpx;overflow:hidden;background:%(PAGE)s}
body{font-family:-apple-system,'Apple SD Gothic Neo','Helvetica Neue',sans-serif;
  color:#1c1a18;-webkit-font-smoothing:antialiased}
.media{width:%(W)dpx;height:%(MH)dpx;overflow:hidden;position:relative;background:%(MBG)s}
.media img{width:100%%;height:100%%;object-fit:cover;display:block}
/* 영상 위에 글을 올릴 때만 어둡게 깐다 — 안 깔면 숫자가 장면에 묻힌다 */
.scrim{position:absolute;inset:0;background:rgba(10,8,6,.56)}
.stat{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:18px;color:#f4f0e9}
.stat .big{font-size:96px;font-weight:800;letter-spacing:-.03em;line-height:1}
.stat .was{opacity:.5;text-decoration:line-through;text-decoration-thickness:5px}
.stat .mid{font-size:30px;opacity:.72;letter-spacing:.02em}
.stat .now{color:%(ACCENT)s}
.quote{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;
  padding:0 78px;color:#fff}
.quote .q{font-size:62px;font-weight:700;line-height:1.34;letter-spacing:-.02em;white-space:pre-line}
.quote .by{margin-top:32px;font-size:26px;opacity:.85;line-height:1.5}
.quote .mark{font-size:92px;font-weight:800;opacity:.42;line-height:.8;margin-bottom:14px}
/* 마지막 장 — 사이트로 보내는 자리. 썸네일 칸을 비우지 않고 마크를 세워
   레이아웃 문법을 지킨다(글이 같은 자리에서 시작한다). */
.brandblock{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:28px}
.brandblock img{width:272px;height:272px}
.brandblock .wm{font-size:58px;font-weight:800;letter-spacing:-.035em;color:#3a352e}
.brandblock .url{font-size:35px;font-weight:700;color:%(ACCENT)s}
/* 글 자리. 한글은 아무 데서나 접히면 읽기 나쁘다 — 띄어쓰기에서만 접어 폭을 끝까지 쓴다.
   제목에 수동 줄바꿈을 넣지 않는 이유도 같다: 넣으면 폭을 반만 쓰고 접힌다. */
.body{height:%(BH)dpx;padding:%(PT)dpx %(PX)dpx 0;display:flex;flex-direction:column;
  background:%(CREAM)s}
.eyebrow{font-size:25px;font-weight:700;letter-spacing:.06em;color:%(ACCENT)s;margin-bottom:20px}
h1{font-size:%(HS)dpx;font-weight:800;line-height:1.26;letter-spacing:-.035em;word-break:keep-all}
p{margin-top:28px;font-size:%(BS)dpx;line-height:1.72;color:#332f29;word-break:keep-all}
.cover h1{font-size:84px;line-height:1.2}
.foot{margin-top:auto;padding-top:%(BR)dpx;padding-bottom:44px;display:flex;align-items:center;
  justify-content:space-between;font-size:24px;color:#8e887c}
.brand{display:flex;align-items:center;gap:11px;font-weight:700;color:#5a544c}
.brand img{width:30px;height:30px}
.pg{font-variant-numeric:tabular-nums;letter-spacing:.04em}
"""


def asset(rel):
    """미디어는 저장소 경로를 그대로 쓴다. 절대 file:// 로 넘겨 HTML을 어디에
    써도 경로가 풀리게 한다."""
    return "file://" + os.path.join(ROOT, rel)


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _sizes(c):
    hl, bl = len(c.get("headline", "")), len(c.get("body", ""))
    return (58 if hl > 24 else (64 if hl > 18 else 70)), (34 if bl > 72 else 36)


def _lines(text, size):
    """한글은 한 글자가 글자 크기만큼의 폭을 먹는다. 접히는 줄 수를 어림한다."""
    return max(1, -(-len(text) // max(1, int(TEXT_W / (size * 0.98)))))


def media_height(c):
    """글이 들어갈 자리를 먼저 재고, 남는 만큼만 썸네일에 준다.

    처음에는 높이를 고정했다가 본문이 긴 카드에서 푸터가 화면 밖으로 밀렸다 —
    거기 출처가 들어가므로 잘리면 출처 표기가 사라진다."""
    hs, bs = _sizes(c)
    need = (PAD_TOP + 45
            + _lines(c.get("headline", ""), hs) * hs * 1.26
            + 28 + _lines(c.get("body", ""), bs) * bs * 1.72
            + FOOT_H + BREATH)
    return int(max(540, min(MEDIA_H, H - need)))


def media_inner(c, has_video):
    k = c.get("kind")
    out = []
    if has_video and k in ("stat", "quote"):
        out.append('<div class="scrim"></div>')
    if k == "stat":
        out.append('<div class="stat">'
                   f'<div class="big was">{esc(c["stat_top"])}</div>'
                   f'<div class="mid">{esc(c["stat_arrow"])}</div>'
                   f'<div class="big now">{esc(c["stat_bottom"])}</div></div>')
    elif k == "quote":
        out.append('<div class="quote"><div class="mark">“</div>'
                   f'<div class="q">{esc(c["quote"])}</div>'
                   f'<div class="by">{esc(c["quote_by"])}</div></div>')
    elif k == "outro":
        out.append('<div class="brandblock">'
                   f'<img src="{asset("favicon.svg")}">'
                   '<div class="wm">AX-it NOW</div>'
                   '<div class="url">axitnow.com</div></div>')
    elif not has_video and c.get("media"):
        out.insert(0, f'<img src="{asset(c["media"])}">')
    return "".join(out)


def card_html(c, meta, total, has_video):
    hs, bs = _sizes(c)
    mh = media_height(c)
    k = c.get("kind")
    # 영상 카드는 썸네일 자리를 투명하게 비워 둔다 — 그 자리에 영상이 들어간다.
    mbg = "transparent" if has_video else (
        "#17150f" if k == "stat" else (meta["accent"] if k == "quote" else (
            "#f2ece1" if k == "outro" else "#e9e3d8")))
    accent = BRAND_ACCENT if k == "outro" else meta["accent"]
    css = CSS % {"W": W, "H": H, "MH": mh, "BH": H - mh, "PT": PAD_TOP, "PX": PAD_X,
                 "BR": BREATH, "ACCENT": accent, "HS": hs, "BS": bs,
                 "CREAM": CREAM, "PAGE": "transparent" if has_video else CREAM,
                 "MBG": mbg}
    cover = " cover" if k == "cover" else ""
    counter = f'{c["n"]} / {total}' if c.get("n") else ""
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{css}</style></head>
<body><div class="media">{media_inner(c, has_video)}</div>
<div class="body{cover}">
  <div class="eyebrow">{esc(c.get('eyebrow',''))}</div>
  <h1>{esc(c.get('headline',''))}</h1>
  <p>{esc(c.get('body',''))}</p>
  <div class="foot">
    <span>{esc(c.get('foot',''))}</span>
    <span class="brand"><img src="{asset('favicon.svg')}">AX-it NOW</span>
    <span class="pg">{counter}</span>
  </div>
</div></body></html>"""


def shoot(html, out, transparent=False):
    p = os.path.join(POST, "_tmp.html")
    open(p, "w", encoding="utf-8").write(html)
    cmd = [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars"]
    if transparent:
        cmd.append("--default-background-color=00000000")
    cmd += [f"--window-size={W},{H}", f"--screenshot={out}",
            "--virtual-time-budget=5000", "--allow-file-access-from-files", "file://" + p]
    subprocess.run(cmd, capture_output=True)
    os.path.exists(p) and os.remove(p)


def compose(card, overlay, out, mh):
    """영상 위에 투명 PNG를 얹는다. 영상은 썸네일 자리만 채우고 나머지는 크림색."""
    src = os.path.join(ROOT, card["video"]) if not os.path.isabs(card["video"]) else card["video"]
    if not os.path.exists(src):
        src = os.path.join(POST, card["video"])
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    if card.get("start"):
        args += ["-ss", str(card["start"])]
    if card.get("dur"):
        args += ["-t", str(card["dur"])]          # -t 는 -i 앞이다. 뒤에 두면 안 먹는다.
    # 제작사 클립에는 타임코드나 로고가 아래쪽에 구워져 있는 경우가 있다.
    # trim_bottom(비율)으로 그 띠를 먼저 잘라낸다 — 올리기 전에 지워야 한다.
    tb = float(card.get("trim_bottom") or 0)
    pre = f"crop=iw:ih*{1 - tb:.4f}:0:0," if tb else ""
    args += ["-i", src, "-i", overlay,
             "-filter_complex",
             # 소스가 작을 수 있으므로 상자를 '덮도록' 키운 뒤 가운데를 자른다.
             f"[0:v]{pre}scale={W}:{mh}:force_original_aspect_ratio=increase,"
             f"crop={W}:{mh},setsar=1,pad={W}:{H}:0:0:color={CREAM}[bg];"
             "[bg][1:v]overlay=0:0,format=yuv420p[o]",
             "-map", "[o]", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
             "-movflags", "+faststart", "-an", out]
    subprocess.run(args, check=True)


def main():
    spec = json.load(open(os.path.join(POST, "cards.json"), encoding="utf-8"))
    meta, cards = spec["meta"], spec["cards"]
    out_dir = os.path.join(POST, "out")
    os.makedirs(out_dir, exist_ok=True)
    for c in cards:
        n, has_video = c["n"], bool(c.get("video"))
        mh = media_height(c)
        if _lines(c.get("body", ""), _sizes(c)[1]) > 3:
            print(f"  ! card{n}: 본문이 세 줄을 넘는다 — 줄여야 한다")
        if has_video:
            ov = os.path.join(out_dir, f"_ov{n}.png")
            shoot(card_html(c, meta, len(cards), True), ov, transparent=True)
            out = os.path.join(out_dir, f"card{n}.mp4")
            compose(c, ov, out, mh)
            os.remove(ov)
            kind = "MP4"
        else:
            out = os.path.join(out_dir, f"card{n}.png")
            shoot(card_html(c, meta, len(cards), False), out)
            kind = "PNG"
        print(f"card{n}  {kind}  {os.path.getsize(out)//1024}KB")


if __name__ == "__main__":
    sys.exit(main())
