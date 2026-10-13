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
FOOT_H = 28 + 44         # 푸터 글자 + 아래 여백
BREATH = 46              # 본문과 푸터 사이 최소 숨
COVER_HS = 86            # 첫 장 제목 크기. CSS의 .cover h1과 같아야 한다 —
                         # 어긋나면 높이 계산이 틀려 푸터가 밀린다.
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
.stat .top{opacity:.62}
.stat .mid{font-size:30px;opacity:.72;letter-spacing:.02em}
.stat .now{color:%(ACCENT)s}
.quote{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;
  padding:0 78px;color:#fff}
.quote .q{font-size:62px;font-weight:700;line-height:1.34;letter-spacing:-.02em;white-space:pre-line}
.quote .by{margin-top:32px;font-size:26px;opacity:.85;line-height:1.5}
.quote .mark{font-size:92px;font-weight:800;opacity:.42;line-height:.8;margin-bottom:14px}
/* 마지막 장 — 사이트로 보내는 자리. 썸네일 칸을 비우지 않고 마크를 세워
   레이아웃 문법을 지킨다(글이 같은 자리에서 시작한다). */
/* 가운데에 크림 후광을 깐다. 뒤에서 구가 돌기 때문에 어떤 노드가 글자
   뒤로 지나갈지 미리 알 수 없다 — 노드를 비켜 놓는 대신 글자 쪽에 바탕을
   깔아야 회전 내내 읽힌다. */
.brandblock{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:26px;
  background:radial-gradient(ellipse 250px 215px at 50%% 50%%,
    rgba(242,236,225,.95) 46%%, rgba(242,236,225,0) 100%%)}
/* 마크를 원으로 자른다. 앱 아이콘의 둥근 사각형은 네트워크 한가운데 놓으면
   혼자 각이 져서 떠 보인다 — 주변이 전부 원형 노드이기 때문이다. */
.brandblock img{width:238px;height:238px;border-radius:50%%}
.brandblock .wm{font-size:54px;font-weight:800;letter-spacing:-.035em;color:#3a352e}
/* 흐름 카드의 타임라인. 여러 날짜·여러 섹션에서 벌어진 일을 한 줄에 세워
   "이건 뉴스 한 건이 아니다"를 첫 장에서 말한다. */
.thread{position:absolute;inset:0;background:#f2ece1}
.thread .cap{position:absolute;top:58px;left:0;right:0;text-align:center;
  font-size:25px;font-weight:700;letter-spacing:.06em;color:#8e887c}
.thread .dot{position:absolute;border-radius:50%%;transform:translate(-50%%,-50%%)}
.thread .dt{position:absolute;transform:translate(-50%%,-50%%);font-size:24px;
  font-weight:800;color:#5a544c;font-variant-numeric:tabular-nums}
.thread .lb{position:absolute;transform:translateX(-50%%);width:188px;text-align:center;
  font-size:25px;font-weight:600;line-height:1.3;color:#332f29;word-break:keep-all}
.thread .sc{position:absolute;transform:translateX(-50%%);width:188px;text-align:center;
  font-size:20px;font-weight:700;letter-spacing:.08em}
.thread .nt{position:absolute;left:%(PX)dpx;right:%(PX)dpx;text-align:center;
  font-size:28px;line-height:1.5;color:#5a544c;word-break:keep-all}
/* 글 자리. 한글은 아무 데서나 접히면 읽기 나쁘다 — 띄어쓰기에서만 접어 폭을 끝까지 쓴다.
   제목에 수동 줄바꿈을 넣지 않는 이유도 같다: 넣으면 폭을 반만 쓰고 접힌다. */
.body{height:%(BH)dpx;padding:%(PT)dpx %(PX)dpx 0;display:flex;flex-direction:column;
  background:%(CREAM)s}
.eyebrow{font-size:25px;font-weight:700;letter-spacing:.06em;color:%(ACCENT)s;margin-bottom:20px}
h1{font-size:%(HS)dpx;font-weight:900;line-height:1.24;letter-spacing:-.04em;word-break:keep-all}
p{margin-top:28px;font-size:%(BS)dpx;line-height:1.72;color:#332f29;word-break:keep-all}
.cover h1{font-size:%(CHS)dpx;line-height:1.18}
/* 푸터는 flex + space-between이었는데, 그러면 가운데 항목이 가운데가 아니라
   좌우 글자 폭에 따라 밀린다 — 1번 장("밀어서 보기")과 2번 장("2026.10.12")의
   마크가 25px쯤 어긋나 넘길 때 로고가 흔들려 보였다. 1fr auto 1fr로 가운데
   칸을 카드 한가운데에 못 박는다. */
.foot{margin-top:auto;padding-top:%(BR)dpx;padding-bottom:44px;
  display:grid;grid-template-columns:1fr auto 1fr;align-items:center;
  font-size:28px;color:#8e887c}
.foot>:nth-child(1){justify-self:start}
.foot>:nth-child(3){justify-self:end}
.brand{display:flex;align-items:center;gap:11px;font-weight:700;color:#5a544c}
.brand img{width:34px;height:34px}
.pg{font-variant-numeric:tabular-nums;letter-spacing:.04em}
"""


# --- outro 카드의 지식 그래프 배경 -------------------------------------------
# 사이트의 Pro 기능인 지식 그래프를 마지막 장 배경에 깐다. 사이트는
# 3d-force-graph의 구(球) 레이아웃을 지구본처럼 돌리므로 여기서도 **구로**
# 그린다 — 평면 그림을 ffmpeg으로 돌리면 앞뒤가 겹치지 않아 입체로 보이지
# 않는다. 노드를 구 껍질에 뿌리고 프레임마다 직접 투영한다.
#
# 화면 캡처를 쓰지 않는 이유: 그 화면은 날마다 달라지고, 글자가 읽히는
# 크기로 들어오지 않는다. 같은 팔레트로 다시 그리는 쪽이 통제된다.
NET_BG = "#f2ece1"       # outro 썸네일 칸 바탕과 같은 색
NET_SEED = 11
NET_NODES = 54
NET_R = 420              # 투영 반지름(px). 칸 높이(760)보다 커서 구가 위아래로
                         # 잘린다 — 다 보이게 줄이면 양옆이 휑해져 사이트
                         # 그래프와 인상이 달라진다.
NET_TILT = 0.28          # 고정 기울기(rad). 0이면 노드가 한 띠에 몰려 납작하다.
NET_SWEEP = 0.85         # 전체 회전량(rad) ≈ 49도. 10초에 걸쳐 돈다.
NET_FPS = 15
NET_FRAMES = 150
NET_GRID = (5, 6)        # 시트 한 장에 담는 타일(열, 행). 30장 × 5시트 = 150
# 로고와 이어 붙일 노드. 피보나치 배치라 번호를 고르게 띄우면 위도도 고르게
# 퍼진다. 뒤쪽으로 돌아간 살은 짧아져 로고 밑으로 숨는다 — 그게 자연스럽다.
HUB_NODES = (2, 8, 14, 20, 26, 32, 38, 44, 50)
# 사이트 INSIGHTS_COLORS와 같은 섹션 색. 한쪽만 고치면 색이 어긋난다.
NET_COLORS = ["#0070f3", "#eb367f", "#7928ca", "#2ec5c5", "#f5a623",
              "#ff5a4d", "#3aa655", "#9aa8c7", "#ff8a3d", "#00897b"]


def _net_graph():
    """노드를 구 껍질에 고르게 뿌리고 가까운 것끼리 잇는다.

    속을 채우지 않고 껍질에만 두는 이유: 채우면 가운데가 빽빽해져 로고와
    주소가 노드에 묻힌다. 껍질이면 투영했을 때 테두리가 짙고 가운데가
    비어 — 사이트의 지구본과 같은 인상이 된다."""
    import math
    import random
    rnd = random.Random(NET_SEED)
    pts = []
    ga = math.pi * (3 - math.sqrt(5))          # 황금각: 구 위에 고르게 깔린다
    for i in range(NET_NODES):
        y = 1 - 2 * (i + 0.5) / NET_NODES
        r = math.sqrt(max(0.0, 1 - y * y))
        a = ga * i
        s = rnd.uniform(0.9, 1.0)              # 껍질에 약간의 두께
        pts.append((math.cos(a) * r * s, y * s, math.sin(a) * r * s,
                    rnd.randrange(len(NET_COLORS)), 10 + rnd.randrange(7)))
    edges = set()
    for i, p in enumerate(pts):
        near = sorted(range(NET_NODES),
                      key=lambda j: sum((pts[j][k] - p[k]) ** 2 for k in range(3)))
        for j in near[1:3]:
            edges.add((min(i, j), max(i, j)))
    return pts, sorted(edges)


def _net_frame(pts, edges, angle, h):
    """한 프레임을 SVG로 그린다. 직교 투영 + 깊이에 따른 크기·투명도.

    엣지와 노드를 따로 그리지 않고 깊이로 한 번에 정렬한다 — 따로 그리면
    뒤쪽 노드가 앞쪽 엣지를 덮어 겹침이 거꾸로 보인다."""
    import math
    ca, sa = math.cos(angle), math.sin(angle)
    ct, st = math.cos(NET_TILT), math.sin(NET_TILT)
    cx, cy = W / 2, h / 2
    proj = []
    for x, y, z, ci, base in pts:
        X, Z = x * ca + z * sa, -x * sa + z * ca      # Y축 회전
        Y, Z = y * ct - Z * st, y * st + Z * ct       # X축 고정 기울기
        proj.append((cx + X * NET_R, cy + Y * NET_R, (Z + 1) / 2, ci, base))

    layers = []
    # 허브 살. 가운데 로고를 '그래프 밖에 얹힌 그림'이 아니라 **네트워크의 한
    # 노드**로 보이게 한다. 바깥 끝은 노드와 함께 돌고 안쪽 끝은 로고에 고정돼
    # 있어서, 도는 동안 로고가 망을 쥐고 있는 것처럼 읽힌다. 살의 안쪽은
    # 불투명한 로고 원이 덮으므로 따로 잘라낼 필요가 없다.
    for i in HUB_NODES:
        hx, hy, hd, _, _ = proj[i]
        layers.append((hd, f'<line x1="{cx:.1f}" y1="{cy:.1f}" x2="{hx:.1f}" '
                           f'y2="{hy:.1f}" stroke="#a89c88" '
                           f'stroke-width="{1.6 + 1.6 * hd:.2f}" '
                           f'stroke-opacity="{0.14 + 0.40 * hd:.3f}"/>'))
    for i, j in edges:
        ax, ay, az, _, _ = proj[i]
        bx, by, bz, _, _ = proj[j]
        d = (az + bz) / 2
        layers.append((d, f'<line x1="{ax:.1f}" y1="{ay:.1f}" x2="{bx:.1f}" '
                          f'y2="{by:.1f}" stroke="#a89c88" '
                          f'stroke-width="{1.3 + 1.5 * d:.2f}" '
                          f'stroke-opacity="{0.10 + 0.34 * d:.3f}"/>'))
    for px, py, d, ci, base in proj:
        r = base * (0.58 + 0.60 * d)
        layers.append((d, f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r:.1f}" '
                          f'fill="{NET_COLORS[ci]}" '
                          f'fill-opacity="{0.30 + 0.68 * d:.3f}"/>'))
    layers.sort(key=lambda t: t[0])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" '
            f'viewBox="0 0 {W} {h}"><rect width="{W}" height="{h}" '
            f'fill="{NET_BG}"/>' + "".join(s for _, s in layers) + "</svg>")


def network_clip(out_dir, mh):
    """구가 도는 10초 클립을 만든다.

    프레임을 한 장씩 크롬으로 찍지 않는다 — 150번 띄우면 몇 분이 걸린다.
    **한 시트에 30프레임을 타일로 깔아 한 번에 찍고** ffmpeg untile로
    쪼갠다. 크롬 호출이 150번에서 5번으로 줄어든다."""
    cols, rows = NET_GRID
    per = cols * rows
    pts, edges = _net_graph()
    frames_dir = os.path.join(out_dir, "_frames")
    os.makedirs(frames_dir, exist_ok=True)
    sheets = -(-NET_FRAMES // per)
    for s in range(sheets):
        tiles = []
        for k in range(per):
            f = s * per + k
            if f >= NET_FRAMES:
                # 남는 칸은 마지막 프레임으로 채운다. 빈 칸을 두면 untile이
                # 그 칸도 프레임으로 뱉어 끝에 흰 장면이 붙는다.
                f = NET_FRAMES - 1
            a = NET_SWEEP * f / (NET_FRAMES - 1)
            tiles.append(f'<i>{_net_frame(pts, edges, a, mh)}</i>')
        shoot(f'<!doctype html><html><head><meta charset="utf-8"><style>'
              f'*{{margin:0;padding:0}}'
              f'body{{display:grid;grid-template-columns:repeat({cols},{W}px);'
              f'width:{cols * W}px}}'
              f'i{{display:block;width:{W}px;height:{mh}px}}</style></head>'
              f'<body>{"".join(tiles)}</body></html>',
              os.path.join(out_dir, f"_sheet{s}.png"),
              size=(cols * W, rows * mh))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                        "-i", os.path.join(out_dir, f"_sheet{s}.png"),
                        "-vf", f"untile={cols}x{rows}",
                        os.path.join(frames_dir, f"f{s:02d}_%03d.png")], check=True)
        os.remove(os.path.join(out_dir, f"_sheet{s}.png"))

    keep = sorted(os.listdir(frames_dir))[:NET_FRAMES]
    for n, name in enumerate(keep):
        os.rename(os.path.join(frames_dir, name),
                  os.path.join(frames_dir, f"z{n:04d}.png"))
    for name in os.listdir(frames_dir):
        if not name.startswith("z"):
            os.remove(os.path.join(frames_dir, name))
    clip = os.path.join(out_dir, "_net.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                    "-framerate", str(NET_FPS),
                    "-i", os.path.join(frames_dir, "z%04d.png"),
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-an", clip], check=True)
    for name in os.listdir(frames_dir):
        os.remove(os.path.join(frames_dir, name))
    os.rmdir(frames_dir)
    return clip


def asset(rel):
    """미디어는 저장소 경로를 그대로 쓴다. 절대 file:// 로 넘겨 HTML을 어디에
    써도 경로가 풀리게 한다."""
    return "file://" + os.path.join(ROOT, rel)


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _sizes(c):
    """제목은 크고 두껍게. 캐러셀은 피드에서 손가락만 한 크기로 지나가므로,
    제목이 본문만 해지면 넘길 이유가 사라진다 — 한 장에서 읽히는 것은 사실상
    제목 하나다. 본문은 제목을 거드는 자리라 키우지 않는다."""
    hl, bl = len(c.get("headline", "")), len(c.get("body", ""))
    return (62 if hl > 24 else (70 if hl > 18 else 76)), (34 if bl > 72 else 36)


def _lines(text, size):
    """한글은 한 글자가 글자 크기만큼의 폭을 먹는다. 접히는 줄 수를 어림한다."""
    return max(1, -(-len(text) // max(1, int(TEXT_W / (size * 0.98)))))


def media_height(c):
    """글이 들어갈 자리를 먼저 재고, 남는 만큼만 썸네일에 준다.

    처음에는 높이를 고정했다가 본문이 긴 카드에서 푸터가 화면 밖으로 밀렸다 —
    거기 출처가 들어가므로 잘리면 출처 표기가 사라진다."""
    hs, bs = _sizes(c)
    # 첫 장은 CSS(.cover h1)가 제목 크기를 덮어쓴다. 여기서 작은 값으로 재면
    # 글 자리를 모자라게 잡아 푸터가 아래로 밀린다 — 첫 장의 푸터만 다른
    # 자리에 서 있던 원인이 이것이었다.
    if c.get("kind") in ("cover", "thread"):
        hs = COVER_HS
    need = (PAD_TOP + 45
            + _lines(c.get("headline", ""), hs) * hs * 1.24
            + 28 + _lines(c.get("body", ""), bs) * bs * 1.72
            + FOOT_H + BREATH)
    # 반드시 짝수로 떨어뜨린다. 이 값이 그대로 ffmpeg의 crop 높이가 되는데,
    # libx264는 홀수 높이를 거부한다("height not divisible by 2"). 글 길이에
    # 따라 계산되는 값이라 어느 날 우연히 홀수가 되면 그날 렌더가 통째로
    # 멈춘다 — 실제로 푸터 글씨를 키우자 747이 나와 멈췄다.
    return int(max(540, min(MEDIA_H, H - need))) // 2 * 2


def media_inner(c, has_video):
    k = c.get("kind")
    out = []
    if has_video and k in ("stat", "quote"):
        out.append('<div class="scrim"></div>')
    if k == "stat":
        # 취소선은 'A였던 것이 B가 됐다'일 때만 뜻이 맞는다. 'A로 B를 했다'
        # 류에 그으면 위쪽 값이 부정된 것처럼 읽힌다 — stat_strike로 끈다.
        was = "big was" if c.get("stat_strike", True) else "big top"
        out.append('<div class="stat">'
                   f'<div class="{was}">{esc(c["stat_top"])}</div>'
                   f'<div class="mid">{esc(c["stat_arrow"])}</div>'
                   f'<div class="big now">{esc(c["stat_bottom"])}</div></div>')
    elif k == "quote":
        out.append('<div class="quote"><div class="mark">“</div>'
                   f'<div class="q">{esc(c["quote"])}</div>'
                   f'<div class="by">{esc(c["quote_by"])}</div></div>')
    elif k == "thread":
        pts = c["thread"]
        n = len(pts)
        mh = media_height(c)       # 본문이 길면 칸이 줄어든다 — 상수를 쓰면 어긋난다
        base = mh * 0.54
        # 라벨 폭이 188이므로 양 끝을 94 이상 안쪽에 둔다. 끝까지 밀면 마지막
        # 라벨이 카드 밖으로 잘린다.
        edge = 100
        xs = [edge + i * (W - edge * 2) / (n - 1) for i in range(n)]
        seg = [f'<svg width="{W}" height="{mh}" style="position:absolute;inset:0">'
               f'<polyline fill="none" stroke="#c9bfae" stroke-width="3" points="'
               + " ".join(f"{x:.0f},{base:.0f}" for x in xs) + '"/></svg>']
        if c.get("thread_cap"):
            seg.append(f'<div class="cap">{esc(c["thread_cap"])}</div>')
        for (p, x) in zip(pts, xs):
            r = 15 if p.get("big") else 11
            seg.append(f'<div class="dot" style="left:{x:.0f}px;top:{base:.0f}px;'
                       f'width:{r*2}px;height:{r*2}px;background:{p["c"]}"></div>')
            seg.append(f'<div class="dt" style="left:{x:.0f}px;top:{base-54:.0f}px">'
                       f'{esc(p["d"])}</div>')
            seg.append(f'<div class="lb" style="left:{x:.0f}px;top:{base+34:.0f}px">'
                       f'{esc(p["t"])}</div>')
            # 섹션 꼬리표. 이 회차의 요점이 "여러 섹션에 흩어져 있었다"는
            # 것이므로, 그림에서 그게 보이지 않으면 타임라인일 뿐이다.
            if p.get("s"):
                seg.append(f'<div class="sc" style="left:{x:.0f}px;top:{base+84:.0f}px;'
                           f'color:{p["c"]}">{esc(p["s"])}</div>')
        if c.get("thread_note"):
            seg.append(f'<div class="nt" style="top:{base+168:.0f}px">'
                       f'{esc(c["thread_note"])}</div>')
        out.append('<div class="thread">' + "".join(seg) + "</div>")
    elif k == "outro":
        out.append('<div class="brandblock">'
                   f'<img src="{asset("favicon.svg")}">'
                   '<div class="wm">AX-it NOW</div></div>')
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
            "#f2ece1" if k in ("outro", "thread") else "#e9e3d8")))
    accent = BRAND_ACCENT if k == "outro" else meta["accent"]
    css = CSS % {"W": W, "H": H, "MH": mh, "BH": H - mh, "PT": PAD_TOP, "PX": PAD_X,
                 "BR": BREATH, "ACCENT": accent, "HS": hs, "BS": bs,
                 "CREAM": CREAM, "CHS": COVER_HS,
                 "PAGE": "transparent" if has_video else CREAM,
                 "MBG": mbg}
    # thread도 첫 장이므로 커버 크기를 쓴다. 안 그러면 흐름 회차의 첫 장만
    # 제목이 작아져 같은 계정에서 두 가지 서체 크기가 섞인 것처럼 보인다.
    cover = " cover" if k in ("cover", "thread") else ""
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


def shoot(html, out, transparent=False, size=None):
    w, h = size or (W, H)
    p = os.path.join(POST, "_tmp.html")
    open(p, "w", encoding="utf-8").write(html)
    cmd = [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars"]
    if transparent:
        cmd.append("--default-background-color=00000000")
    cmd += [f"--window-size={w},{h}", f"--screenshot={out}",
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
    # 방송 클립은 위쪽에 방송사 로고와 'Courtesy of…' 띠가, 제작사 클립은
    # 아래쪽에 타임코드가 구워져 있다. 어느 쪽이든 올리기 전에 잘라낸다 —
    # 남의 워터마크를 얹은 채로 내 카드를 내보낼 수는 없다.
    tt = float(card.get("trim_top") or 0)
    tb = float(card.get("trim_bottom") or 0)
    pre = (f"crop=iw:ih*{1 - tt - tb:.4f}:0:ih*{tt:.4f},") if (tt or tb) else ""
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
        n = c["n"]
        mh = media_height(c)
        if _lines(c.get("body", ""), _sizes(c)[1]) > 3:
            print(f"  ! card{n}: 본문이 세 줄을 넘는다 — 줄여야 한다")
        # outro는 지식 그래프가 천천히 도는 배경을 스스로 만든다.
        # `"network": false`로 끄면 예전처럼 정지 카드로 나온다.
        scratch = None
        if c.get("kind") == "outro" and c.get("network") is not False:
            scratch = network_clip(out_dir, mh)
            c = dict(c, video=scratch)
        has_video = bool(c.get("video"))
        if has_video:
            ov = os.path.join(out_dir, f"_ov{n}.png")
            shoot(card_html(c, meta, len(cards), True), ov, transparent=True)
            out = os.path.join(out_dir, f"card{n}.mp4")
            compose(c, ov, out, mh)
            os.remove(ov)
            scratch and os.path.exists(scratch) and os.remove(scratch)
            kind = "MP4"
        else:
            out = os.path.join(out_dir, f"card{n}.png")
            shoot(card_html(c, meta, len(cards), False), out)
            kind = "PNG"
        # 같은 번호의 다른 확장자가 남아 있으면 지운다. 카드 종류를 바꾸면
        # (영상 커버 → thread 그림) 예전 파일이 그대로 남아, 올릴 때 어느
        # 쪽이 최신인지 알 수 없게 된다 — 실제로 card1.mp4와 card1.png가
        # 한 폴더에 같이 있었다.
        stale = os.path.join(out_dir, f"card{n}." + ("png" if has_video else "mp4"))
        if os.path.exists(stale):
            os.remove(stale)
            print(f"  · 묵은 card{n}.{'png' if has_video else 'mp4'} 지움")
        print(f"card{n}  {kind}  {os.path.getsize(out)//1024}KB")


if __name__ == "__main__":
    sys.exit(main())
