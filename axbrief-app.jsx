/* ============================================================
   Design AX Brief — themed app (Babel/JSX)
   Layout A (Editorial) rendered across THREE design themes:
     · zen   — colorful ink-in-water, frosted (ref 1)
     · glass — dark glassmorphism, thin orbit rings (ref 2)
     · paper — achromatic, toned-down, textured paper
   Plus a weekly-impact timeline.
   Reads Geist tokens; surfaces are intentionally themed beyond the
   flat Geist default (user is exploring blur / glass / texture).
   Exports ThemedBrief, WeeklyTimeline, THEMES to window.
   ============================================================ */
const { useState, useRef, useEffect, useCallback, useLayoutEffect } = React;

/* i18n — `t` is the theme object throughout this file, so UI strings go through
   tx() → window.t() (i18n.js). Dictionary: i18n/ko.json. */
const tx = (key, vars) => window.t(key, vars);

/* ---- one-time CSS (keyframes + helpers) ---- */
if (!document.getElementById('ax-styles')) {
  const s = document.createElement('style');
  s.id = 'ax-styles';
  s.textContent = `
  .ax-scene{position:absolute;inset:0;overflow:hidden;}
  .ax-blob{position:absolute;border-radius:50%;will-change:transform;}
  .ax-grain{position:absolute;inset:0;pointer-events:none;
     background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");}
  .ax-svg{position:absolute;inset:0;width:100%;height:100%;display:block;}
  .ax-draw{stroke-dasharray:var(--len,600);stroke-dashoffset:var(--len,600);}
  @media (prefers-reduced-motion: no-preference){
    .ax-active .ax-blob{animation:axdrift 15s ease-in-out infinite alternate;}
    .ax-active .ax-blob.b2{animation-duration:19s;animation-direction:alternate-reverse;}
    .ax-active .ax-blob.b3{animation-duration:23s;animation-delay:-4s;}
    .ax-active .ax-spin{animation:axspin 26s linear infinite;transform-origin:center;}
    .ax-active .ax-spin.rev{animation:axspin 34s linear infinite reverse;}
    .ax-active .ax-draw{animation:axdrawk 5s ease-in-out infinite alternate;}
    .ax-active .ax-fade1{animation:axfade 9s ease-in-out infinite;}
    .ax-active .ax-fade2{animation:axfade 9s ease-in-out infinite 1.2s;}
    .ax-active .ax-fade3{animation:axfade 9s ease-in-out infinite 2.4s;}
    .ax-active .ax-pulse1{animation:axpulse 5.5s ease-in-out infinite;}
    .ax-active .ax-pulse2{animation:axpulse 5.5s ease-in-out infinite .45s;}
    .ax-active .ax-pulse3{animation:axpulse 5.5s ease-in-out infinite .9s;}
    .ax-active .ax-pulse4{animation:axpulse 5.5s ease-in-out infinite 1.35s;}
    .ax-active .ax-sweep{animation:axsweep 7s ease-in-out infinite;}
  }
  @keyframes axdrift{0%{transform:translate(0,0) scale(1)}100%{transform:translate(7%,5%) scale(1.14)}}
  @keyframes axspin{to{transform:rotate(360deg)}}
  @keyframes axdrawk{0%{stroke-dashoffset:var(--len,600)}55%,100%{stroke-dashoffset:0}}
  @keyframes axfade{0%,12%{opacity:0;transform:translateY(5px)}28%,72%{opacity:1;transform:none}90%,100%{opacity:0;transform:translateY(-3px)}}
  @keyframes axpulse{0%,100%{opacity:.3}50%{opacity:1}}
  @keyframes axsweep{0%,100%{transform:translateX(-35%);opacity:0}50%{opacity:.55}}
  .ax-track{display:flex;height:100%;transition:transform .5s cubic-bezier(.4,0,.2,1);}
  .ax-slide{flex:0 0 100%;min-width:100%;height:100%;}
  /* native horizontal scroll-snap carousel: horizontal swipe snaps cards, vertical
     swipe falls through to the page natively (no JS touch handler to swallow it). */
  .ax-snap{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;
     scroll-behavior:auto;scrollbar-width:none;-ms-overflow-style:none;
     /* pan-x: this element owns horizontal pans (card swipe); vertical pans fall through
        to the page so the card never blocks scroll-down. (pan-y when a card is flipped,
        set inline, so the article can scroll vertically.) */
     touch-action:pan-x;}
  .ax-snap::-webkit-scrollbar{display:none;}
  .ax-snapslide{flex:0 0 100%;min-width:100%;height:100%;scroll-snap-align:center;scroll-snap-stop:always;}
  /* 본문 400 + 음수 자간은 맥에서는 단정하지만 윈도우에서는 가늘고 흩어져 보인다.
     윈도우는 글자를 얇게 그리는 데다 한글 웹폰트는 힌팅이 약해 더 성글어진다.
     본문을 500으로 올리고 자간을 0으로 되돌린다 — 맥에서도 읽기가 나빠지지 않는다. */
  .ax-hl{font-family:'Pretendard',var(--font-sans);white-space:pre-line;font-weight:700;
     letter-spacing:-0.015em;text-wrap:balance;margin:0;word-break:keep-all;overflow-wrap:break-word;}
  .ax-body{font-family:'Pretendard',var(--font-sans);font-weight:500;letter-spacing:0;margin:0;
     word-break:keep-all;overflow-wrap:break-word;}
  .ax-eyebrow{font-family:var(--font-mono);font-size:11.5px;line-height:16px;letter-spacing:.06em;
     text-transform:uppercase;font-weight:600;}
  .ax-src{font-family:var(--font-mono);font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;
     text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:opacity .15s;}
  .ax-src:hover{opacity:.6;}
  /* ---- weekly deck timeline ---- */
  .ax-day{position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;outline:none;
     transition:transform .5s cubic-bezier(.2,.8,.25,1);}
  .ax-deck{position:relative;transition:filter .45s ease;}
  .ax-mini{position:absolute;left:50%;bottom:0;transform-origin:bottom center;
     transition:transform .5s cubic-bezier(.2,.8,.25,1),width .45s cubic-bezier(.2,.8,.25,1),
                height .45s cubic-bezier(.2,.8,.25,1),box-shadow .4s ease,opacity .35s ease;}
  .ax-tick{transition:transform .4s ease;}
  .ax-daylabel{transition:color .4s ease;}
  @keyframes axheroin{0%{opacity:0;transform:translateY(14px) scale(.965)}100%{opacity:1;transform:none}}
  .ax-heroin{animation:axheroin .6s cubic-bezier(.2,.8,.25,1);}
  /* ---- responsive shell ---- */
  .ax-shell{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:34px 40px 90px;box-sizing:border-box;}
  /* 카드 기본 치수. 480:760 비율을 지킨 채 한 단계 줄였다(요청). 비율이 어긋나면
     안쪽 고정 px 레이아웃에서 Read 버튼이 잘린다. */
  .ax-hero-wrap{position:relative;width:440px;max-width:100%;height:697px;margin:6px auto 0;}
  @media (max-width:760px){
    .ax-shell{padding:16px 12px 56px;}
    /* FIXED pixel height on mobile — viewport units (svh/vh) change as the browser
       address bar shows/hides on scroll, which made the collapsed card grow. px is
       stable. The summary fits; the expanded full article is a separate flowing view. */
    /* slightly narrower than full-bleed + a max cap, so the card reads as an upright
       card (not a wide slab) and keeps a little breathing room on each side. */
    .ax-hero-wrap{width:calc(100% - 20px);max-width:430px;height:580px;margin:8px auto 0;}
    /* Kill continuous GPU work on phones (was overheating the device): the SVG
       feTurbulence grain and every infinite drift/spin/pulse animation. The
       full-screen blurred+blended ThemeBackdrop is also not rendered on mobile. */
    .ax-grain{display:none !important;}
    .ax-scene *{animation:none !important;}
    .ax-blob,.ax-spin,.ax-draw,.ax-sweep{animation:none !important;}
  }
  /* ---- mobile filmstrip: one long horizontal swipe of all past cards.
     Chronological left->right (past -> yesterday); JS starts it scrolled to the
     right so YESTERDAY shows first and you swipe left into the past. Each day is a
     block with its date pinned (sticky) above that day's cards. ---- */
  /* NB: no -webkit-overflow-scrolling:touch — on iOS it puts the strip on its own
     compositor layer that doesn't repaint mid-scroll (cards/thumbs go blank until
     the scroll settles). Modern iOS scrolls smoothly without it. */
  .ax-strip{display:flex;align-items:flex-start;gap:22px;overflow-x:auto;overflow-y:hidden;
     padding:4px 14px 18px;scrollbar-width:none;}
  .ax-strip::-webkit-scrollbar{display:none;}
  .ax-day-block{flex:0 0 auto;display:flex;flex-direction:column;}
  .ax-strip-datehead{position:sticky;left:12px;align-self:flex-start;display:inline-flex;align-items:baseline;
     gap:7px;margin-bottom:11px;padding:5px 12px;border-radius:100px;z-index:3;white-space:nowrap;}
  /* flex-start (not stretch) so a long headline in one day doesn't make that day's
     cards taller than other days' — every card is the same fixed size. */
  .ax-day-cards{display:flex;gap:10px;align-items:flex-start;}
  .ax-strip-card{flex:0 0 auto;cursor:pointer;text-align:left;padding:0;border-radius:18px;overflow:hidden;
     transition:transform .2s ease;}
  .ax-strip-card:active{transform:scale(.96);}
  /* 3D 네트워크 호버 툴팁 — 라이브러리 기본 검은 박스 제거(내용 카드가 자체 스타일을 가짐).
     3d-force-graph(float-tooltip)의 실제 클래스는 .float-tooltip-kap */
  .float-tooltip-kap, .scene-tooltip, .graph-tooltip{background:transparent!important;border:none!important;
     padding:0!important;border-radius:0!important;color:inherit!important;font:inherit!important;
     max-width:none!important;box-shadow:none!important;}
  /* ---- section tabs (Design / Music / Movies / Games / Books) ---- */
  /* 카테고리 + 구분선 + 버튼 묶음이 한 줄. 다 들어가면 가운데로 모이고, 좁아지면
     카테고리만 줄며 가로로 스크롤된다 — 버튼은 늘 오른쪽에 남는다. */
  /* 줄은 .ax-shell(최대 1120px) 안에 있어 그대로 두면 탭이 다 들어가지 않는다.
     셸 밖으로 꺼내 뷰포트 기준으로 펼친다 — 셸이 가운데 정렬이라 left:50% +
     translateX(-50%)로 화면 중앙에 맞는다. transform은 이 줄에만 걸리고 버튼의
     ::after·select는 각자 position:relative 안에 앵커되므로 영향이 없다. */
  .ax-navrow{display:flex;align-items:center;justify-content:center;gap:10px;
     position:relative;left:50%;transform:translateX(-50%);
     width:min(1460px, 100vw - 32px);margin:0 0 16px;padding:0;box-sizing:border-box;}
  .ax-navrow .ax-tabs{flex:0 1 auto;min-width:0;flex-wrap:nowrap;overflow-x:auto;
     justify-content:flex-start;gap:6px;margin:0;padding:2px 0;scrollbar-width:none;
     -webkit-overflow-scrolling:touch;}
  .ax-navrow .ax-tabs::-webkit-scrollbar{display:none;}
  .ax-navdiv{flex:0 0 auto;width:1px;height:22px;}
  .ax-actions{flex:0 0 auto;display:flex;align-items:center;gap:8px;}
  @media (max-width:720px){ .ax-navdiv,.ax-navrow>#ax-actions-d{display:none;} }
  .ax-tabs{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin:0 auto 16px;padding:0 12px;}
  /* 탭 글자는 UI의 길잡이다 — 모노스페이스 12px/600은 윈도우에서 가늘고 희미했다.
     13.5px/700으로 키우고 자간을 좁혀 덩어리로 읽히게 한다. */
  /* 탭은 모노스페이스였다. 맥에서는 Menlo로 단정했지만 윈도우에는 Menlo가 없어
     Consolas/Courier New로 떨어졌고 — 다른 폰트, 더 거친 렌더링, 더 딱딱한 인상.
     이미 불러와 둔 Pretendard로 통일한다: 한글·영문 모두 설계된 폰트라 두 OS에서
     같게 보이고 가독성도 낫다. */
  .ax-tab{font-family:'Pretendard',var(--font-sans);font-size:13px;letter-spacing:-0.005em;font-weight:700;
     cursor:pointer;height:36px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;
     box-sizing:border-box;border-radius:100px;white-space:nowrap;transition:background .2s ease,color .2s ease,border-color .2s ease,transform .12s ease;}
  .ax-tab:active{transform:scale(.95);}
  @media (max-width:760px){
    .ax-tabs{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;scrollbar-width:none;margin-bottom:22px;}
    .ax-tabs::-webkit-scrollbar{display:none;}
  }
  /* ---- Pro 비교표 + 요금제 버튼 (SubscribeModal). 색·모션은 Pro 열과 할인
     스티커에만 쓴다 — 나머지 모달은 사이트의 절제된 톤을 그대로 유지한다. */
  .ax-pro-col{background:linear-gradient(135deg,rgba(121,40,202,.12),rgba(0,112,243,.12));
     background-size:220% 220%;background-position:0% 50%;}
  .ax-pro-badge{display:inline-block;padding:3px 11px;border-radius:999px;font-size:11.5px;
     font-weight:700;color:#fff;letter-spacing:.02em;
     background:linear-gradient(135deg,#7928ca,#0070f3);background-size:180% 180%;}
  .ax-check{display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;
     border-radius:50%;font-size:14px;font-weight:700;line-height:1;color:#fff;
     background:linear-gradient(135deg,#7928ca,#0070f3);}
  /* 비교표 항목명은 한 줄로 읽혀야 한다. 윈도우에서 Pretendard가 떨어지면 더 넓은
     시스템 폰트로 대체되면서 "인터랙티브 지식 네트워크로 인사이트 찾기"가 두 줄로
     꺾였다. 모달을 넉넉히 넓히고 줄바꿈을 막되, 폰 화면에서는 다시 흐르게 둔다. */
  .ax-pro-row{white-space:nowrap;}
  @media (max-width:560px){ .ax-pro-row{white-space:normal;} }
  /* 아직 만들지 않은 Pro 혜택 — 체크가 아니라 예고 배지로 표시한다. */
  .ax-soon{display:inline-block;padding:3px 7px;border-radius:999px;font-size:10.5px;font-weight:700;
     line-height:1.2;white-space:nowrap;color:#7928ca;border:1px solid rgba(121,40,202,.4);
     background:rgba(121,40,202,.08);}
  .ax-plan-btn{position:relative;display:block;width:100%;box-sizing:border-box;text-align:left;
     cursor:pointer;border:none;border-radius:12px;font-family:Pretendard,system-ui;
     transition:transform .15s ease;}
  .ax-plan-btn:active{transform:scale(.98);}
  .ax-sticker{position:absolute;top:-10px;right:-6px;display:inline-block;padding:3px 9px;
     border-radius:999px;font-size:11px;font-weight:700;color:#fff;transform:rotate(-8deg);
     background:linear-gradient(135deg,#ff5a4d,#7928ca);box-shadow:0 4px 12px -4px rgba(121,40,202,.6);}
  @media (prefers-reduced-motion: no-preference){
    .ax-pro-col{animation:axprodrift 9s ease-in-out infinite alternate;}
    .ax-pro-badge{animation:axprodrift 9s ease-in-out infinite alternate;}
    .ax-sticker{animation:axstickerpulse 2s ease-in-out infinite;}
  }
  @keyframes axprodrift{0%{background-position:0% 50%}100%{background-position:100% 50%}}
  @keyframes axstickerpulse{0%,100%{transform:rotate(-8deg) scale(1)}50%{transform:rotate(-8deg) scale(1.06)}}
  /* ---- card flip: front summary <-> back full translated article ---- */
  /* perspective + preserve-3d are applied INLINE only while flipping/flipped (see
     FlipCard) so a resting card has no 3D compositing layer — a 3D layer is what was
     swallowing vertical touch-scroll on the card on mobile. */
  .ax-flip-wrap{position:relative;width:100%;height:100%;}
  .ax-flip{position:relative;width:100%;height:100%;
     transition:transform .62s cubic-bezier(.4,0,.2,1);}
  .ax-flip.flipped{transform:rotateY(180deg);}
  .ax-flip-face{position:absolute;inset:0;overflow:hidden;border-radius:inherit;}
  /* backface-visibility는 뒤집는 동안에만 건다. 상시로 걸어 두면 카드가 영구 합성
     레이어가 되고, 윈도우 크롬은 합성 레이어 안에서 서브픽셀 안티에일리어싱
     (ClearType)을 끈다 — 맥에서는 원래 그레이스케일이라 티가 안 나지만 윈도우에서는
     본문 글씨가 자글자글해 보인다. 쉬고 있는 카드의 뒷면은 visibility:hidden으로
     이미 가려지므로 이 속성이 없어도 앞면 위로 비치지 않는다. */
  .ax-flip-wrap.is3d .ax-flip-face{backface-visibility:hidden;-webkit-backface-visibility:hidden;}
  .ax-flip-back{transform:rotateY(180deg);display:flex;flex-direction:column;}
  /* full-article scroll region (the fixed text box) */
  .ax-full{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:24px 26px 26px;}
  .ax-full::-webkit-scrollbar{width:8px;}
  .ax-full::-webkit-scrollbar-thumb{background:rgba(120,90,70,.22);border-radius:8px;}
  .ax-full p{margin:0 0 13px;}
  .ax-full img{display:block;width:100%;height:auto;border-radius:12px;margin:6px 0 16px;background:#efe9e1;}
  .ax-full .ax-vid{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;margin:6px 0 16px;background:#000;}
  .ax-full .ax-vid iframe,.ax-full .ax-vid video{position:absolute;inset:0;width:100%;height:100%;border:0;}
  `;
  document.head.appendChild(s);
}

/* ============================================================
   THEMES — token sets
   ============================================================ */
const ZEN_PAL = ['#ff5a4d', '#2ec5c5', '#3b6bff', '#7928ca'];

const THEMES = {
  zen: {
    name: 'Zen Ink',
    media: 'zen', bold: false,
    briefBg: 'linear-gradient(160deg,#f4f0e9 0%,#efe9e1 100%)',
    cardBg: 'rgba(255,255,255,0.46)',
    blur: 'blur(20px) saturate(1.15)',
    cardBorder: '1px solid rgba(255,255,255,0.7)',
    cardShadow: '0 1px 1px rgba(60,40,30,.04), 0 24px 60px -20px rgba(120,60,40,.28)',
    radius: 22,
    hl: '#1c1a18', body: 'rgba(28,24,20,.7)', mute: 'rgba(28,24,20,.5)', faint: 'rgba(28,24,20,.4)',
    rule: 'rgba(40,30,20,.12)', nav: 'light', dotOn: '#1c1a18', dotOff: 'rgba(40,30,20,.2)',
    feedBg: 'rgba(255,255,255,0.55)', feedBorder: '1px solid rgba(255,255,255,0.72)',
    feedShadow: '0 1px 1px rgba(60,40,30,.04), 0 14px 34px -18px rgba(120,60,40,.28)',
    /* opaque fills used on mobile so cards paint without the costly backdrop-filter */
    cardSolid: '#fbf8f3', feedSolid: '#fbf8f3',
    /* 탭처럼 배경 없는 자리에 쓰는 불투명 보조 글자색 (t.mute의 알파 없는 짝) */
    muteSolid: '#6d675f',
  },
  zenGlass: {
    name: 'Zen Glass · Bold',
    media: 'zen', bold: true,
    briefBg: 'linear-gradient(150deg,#f3ebe3 0%,#efe5ec 48%,#e8edf7 100%)',
    cardBg: 'rgba(255,255,255,0.24)',
    blur: 'blur(30px) saturate(1.8)',
    cardBorder: '1px solid rgba(255,255,255,0.85)',
    cardShadow: 'inset 0 1px 0 rgba(255,255,255,.65), 0 1px 1px rgba(80,40,60,.05), 0 32px 72px -22px rgba(120,50,90,.42)',
    radius: 26,
    hl: '#181318', body: 'rgba(24,19,24,.74)', mute: 'rgba(24,19,24,.56)', faint: 'rgba(24,19,24,.44)',
    rule: 'rgba(40,24,40,.15)', nav: 'light', dotOn: '#181318', dotOff: 'rgba(40,24,40,.24)',
    feedBg: 'rgba(255,255,255,0.3)', feedBorder: '1px solid rgba(255,255,255,0.8)',
    feedShadow: 'inset 0 1px 0 rgba(255,255,255,.6), 0 18px 44px -20px rgba(120,50,90,.4)',
    cardSolid: '#f8f2f5', feedSolid: '#f8f2f5',
    muteSolid: '#6b6069',
  },
};

/* ============================================================
   ThemeBackdrop — atmospheric bg layer behind the card (what the
   glass blurs). Distinct per theme.
   ============================================================ */
function ThemeBackdrop({ t }) {
  const o = t.bold ? 1.55 : 1; // bolder color presence for the glass theme
  const blooms = [
    { c: '#ff5a4d', w: '70%', h: '20%', top: '0%',  left: '-8%' },
    { c: '#2ec5c5', w: '62%', h: '17%', top: '20%', right: '-10%' },
    { c: '#3b6bff', w: '60%', h: '18%', top: '40%', left: '2%' },
    { c: '#7928ca', w: '56%', h: '16%', top: '60%', right: '-6%' },
    { c: '#eb367f', w: '58%', h: '16%', top: '78%', left: '-4%' },
    { c: '#2ec5c5', w: '52%', h: '15%', top: '92%', right: '4%' },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} aria-hidden>
      {blooms.map((b, i) => (
        <div key={i} className={'ax-blob' + (i % 3 === 1 ? ' b2' : i % 3 === 2 ? ' b3' : '')} style={{
          width: b.w, height: b.h, top: b.top, left: b.left, right: b.right,
          filter: `blur(${t.bold ? 58 : 66}px)`, opacity: Math.min(0.8, (0.34 - i * 0.012) * o),
          mixBlendMode: 'multiply', background: `radial-gradient(circle,${b.c},transparent 70%)`,
        }} />
      ))}
      <div className="ax-grain" style={{ opacity: t.bold ? 0.04 : 0.06 }} />
    </div>
  );
}

/* ============================================================
   MediaScene — the "image" (zen ink). Color lives here.
   `bold` pushes saturation + bloom opacity for the glass theme.
   ============================================================ */
/* A short, muted, looping in-article video clip (1.75× key segment, built by
   ax-media). Plays ONLY while its card is active — non-active slides pause and
   rewind so we never run five clips at once. The poster still shows before the
   first frame decodes and is what the deck/archive use. */
function VideoScene({ item, active, bold }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;                                  // iOS autoplay needs the PROPERTY set
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  }, [active]);
  const cover = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
  // Mount the <video> ONLY for the active card. iOS limits how many video decoders
  // can run at once — five mounted clips made some never play and others stall — so
  // inactive cards show the poster still and only the visible one decodes.
  return (
    <div className={'ax-scene' + (active ? ' ax-active' : '')} style={{ background: '#efe9e1' }}>
      {active ? (
        <video ref={ref} muted loop playsInline autoPlay preload="auto"
          poster={item.poster || item.image || undefined} style={cover}>
          {item.webm && <source src={item.webm} type="video/webm" />}
          <source src={item.video} type="video/mp4" />
        </video>
      ) : (
        <img src={item.poster || item.image} alt="" decoding="async" style={cover}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      )}
      <div className="ax-grain" style={{ opacity: bold ? 0.06 : 0.08 }} />
    </div>
  );
}

function MediaScene({ item, active, bold }) {
  const a = item.accent;
  const cls = 'ax-scene' + (active ? ' ax-active' : '');
  if (item.video) return <VideoScene item={item} active={active} bold={bold} />;
  if (item.image) {
    return (
      <div className={cls} style={{ background: '#efe9e1' }}>
        <img src={item.image} alt="" loading="eager" decoding="async" fetchpriority={active ? 'high' : 'low'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                   objectFit: 'cover', display: 'block' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div className="ax-grain" style={{ opacity: bold ? 0.06 : 0.08 }} />
      </div>
    );
  }
  const op = bold ? [0.86, 0.72, 0.62] : [0.72, 0.58, 0.5];
  return (
    <div className={cls} style={{ background: 'linear-gradient(150deg,#f6f2ec,#efe9e1)', filter: bold ? 'saturate(1.5)' : 'none' }}>
      <div className="ax-blob" style={{ width: '74%', height: '74%', left: '6%', top: '2%', filter: `blur(${bold ? 30 : 34}px)`,
        opacity: op[0], mixBlendMode: 'multiply', background: `radial-gradient(circle,${a},transparent 66%)` }} />
      <div className="ax-blob b2" style={{ width: '56%', height: '56%', right: '2%', bottom: '0%', filter: 'blur(40px)',
        opacity: op[1], mixBlendMode: 'multiply', background: `radial-gradient(circle,${ZEN_PAL[0]},transparent 70%)` }} />
      <div className="ax-blob b3" style={{ width: '50%', height: '50%', left: '24%', bottom: '6%', filter: 'blur(44px)',
        opacity: op[2], mixBlendMode: 'multiply', background: `radial-gradient(circle,${ZEN_PAL[1]},transparent 72%)` }} />
      <Motif kind={item.motif} ink="rgba(30,26,22,.32)" accent="rgba(30,26,22,.5)" />
      <div className="ax-grain" style={{ opacity: bold ? 0.06 : 0.08 }} />
    </div>
  );
}

/* thin single-weight tool motifs */
function Motif({ kind, ink, accent }) {
  const base = { fill: 'none', stroke: ink, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const acc = { fill: 'none', stroke: accent, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (kind === 'frame') {
    return (
      <svg className="ax-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
        <g {...base}><rect x="120" y="78" width="160" height="118" rx="10" /><circle cx="138" cy="96" r="5" /></g>
        <g style={acc}>
          <rect className="ax-fade1" x="138" y="116" width="96" height="14" rx="4" />
          <rect className="ax-fade2" x="138" y="140" width="124" height="14" rx="4" opacity=".7" />
          <rect className="ax-fade3" x="138" y="164" width="70" height="14" rx="4" opacity=".5" />
        </g>
      </svg>
    );
  }
  if (kind === 'sphere') {
    return (
      <svg className="ax-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
        <g className="ax-spin" style={{ transformOrigin: '200px 150px' }}>
          <ellipse cx="200" cy="150" rx="92" ry="34" {...base} opacity=".7" />
          <ellipse cx="200" cy="150" rx="34" ry="92" style={acc} opacity=".85" />
        </g>
        <circle cx="200" cy="150" r="62" {...base} opacity=".6" />
      </svg>
    );
  }
  if (kind === 'cube') {
    return (
      <svg className="ax-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
        <g transform="translate(200 150)"><g className="ax-spin">
          <path className="ax-draw" style={{ ...acc, '--len': 620, opacity: .9 }}
            d="M-56 -32 L0 -64 L56 -32 L56 36 L0 68 L-56 36 Z M-56 -32 L0 0 L56 -32 M0 0 L0 68" />
        </g></g>
      </svg>
    );
  }
  if (kind === 'swatch') {
    return (
      <svg className="ax-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} className={'ax-pulse' + (i + 1)} x={120 + i * 44} y="112" width="36" height="36" rx="9" {...acc} />
        ))}
        <path className="ax-draw" style={{ '--len': 70, ...acc, strokeWidth: 2.6 }} d="M178 196l16 16 30-34" />
      </svg>
    );
  }
  // headset
  return (
    <svg className="ax-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
      <g transform="translate(200 150)"><g className="ax-spin rev">
        <rect x="-30" y="-46" width="60" height="92" rx="12" {...base} opacity=".5" />
      </g></g>
      <g style={acc} opacity=".9"><rect x="148" y="120" width="104" height="44" rx="20" />
        <path d="M170 164l-5 12M230 164l5 12M178 138h.2M222 138h.2" /></g>
    </svg>
  );
}

/* ---- atoms ---- */
function Eyebrow({ item, index, total, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span className="ax-eyebrow" style={{ color: t.mute }}>{item.eyebrow}
        <span style={{ color: t.faint, margin: '0 7px' }}>·</span>{item.tool}</span>
      <span className="ax-eyebrow" style={{ color: t.faint }}>
        {String(index + 1).padStart(2, '0')}<span style={{ opacity: .55 }}> / {String(total).padStart(2, '0')}</span>
      </span>
    </div>
  );
}
function SourceLine({ item, t }) {
  return <a className="ax-src" style={{ color: t.mute }} href={item.url} target="_blank" rel="noopener">{item.source} <span aria-hidden>↗</span></a>;
}
/* quiet gray note on a card served in a fallback language (build sets `untranslated`) */
function UntranslatedNote({ t, style }) {
  return <div className="ax-eyebrow" style={{ fontSize: 10, color: t.faint, ...style }}>{tx('card.untranslated')}</div>;
}

/* ---- enrich: derive eyebrow/body/motif when a card lacks them
   (day-deck cards carry only tool/headline/source) ---- */
function axMotifFor(tool) {
  const s = String(tool);
  if (/Figma|UX Pilot|핸드오프|코드/.test(s)) return 'frame';
  if (/CAD/.test(s)) return 'cube';
  if (/Token|일관성/.test(s)) return 'swatch';
  if (/VR|몰입/.test(s)) return 'headset';
  return 'sphere';
}
function axBodyFor(tool) {
  const s = String(tool);
  if (/Figma/.test(s)) return tx('demo.body_figma');
  if (/KeyShot|CMF|렌더/.test(s)) return tx('demo.body_render');
  if (/CAD/.test(s)) return tx('demo.body_cad');
  if (/Token|일관성/.test(s)) return tx('demo.body_token');
  if (/VR|몰입/.test(s)) return tx('demo.body_vr');
  if (/핸드오프|코드/.test(s)) return tx('demo.body_handoff');
  if (/리서치/.test(s)) return tx('demo.body_research');
  if (/원칙|DesignAX/.test(s)) return tx('demo.body_principle');
  if (/UX Pilot/.test(s)) return tx('demo.body_uxpilot');
  return '';   // no generic placeholder — every card now carries its own one-line summary
}
function axEnrich(item) {
  return {
    ...item,
    eyebrow: item.eyebrow || tx('card.eyebrow_default'),
    motif: item.motif || axMotifFor(item.tool),
    body: item.body || axBodyFor(item.tool),
  };
}

/* ============================================================
   LAYOUT A — Editorial, vertical, FULL-BLEED (frame lives on the
   carousel window so swiping never reveals corner gaps)
   ============================================================ */
/* shared pill button — filled, full-width, rounded. The card "Read" trigger and the
   floating "close" in the expanded article share this one design. */
function AxPill({ label, onClick, t, style }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} style={{
      width: '100%', height: 42, borderRadius: 100, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans)', fontSize: 14, letterSpacing: '.06em', lineHeight: 1, fontWeight: 500,
      background: t.hl, color: '#fff', border: 'none', boxShadow: '0 6px 18px -8px rgba(40,30,20,.5)',
      transition: 'transform .15s ease', ...style }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}>
      {label}
    </button>
  );
}

/* Paddle.js의 이벤트는 Initialize의 eventCallback 하나로만 들어온다 — Checkout.open에
   콜백을 넘겨도 호출되지 않는다. 결제를 끝냈는데 비교표가 그대로 떠 있던 원인이
   이것이었다. 현재 열려 있는 모달이 여기에 자기 핸들러를 걸어 두고, Paddle 이벤트를
   그 핸들러로 넘긴다. */
let axPaddleOnEvent = null;

/* Paddle.js를 한 번만 불러온다. 결제창을 열 때까지 로드하지 않아 첫 화면이 가벼워진다. */
let axPaddleReady = null;
function loadPaddle(clientToken, environment) {
  if (axPaddleReady) return axPaddleReady;
  axPaddleReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = () => {
      try {
        if (environment === 'sandbox') window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({
          token: clientToken,
          eventCallback: (e) => {
            if (!e) return;
            // 오버레이는 실패를 "Something went wrong" 한 줄로 덮는다 — code/detail은
            // 이 경로로만 보인다. 결제 문제를 진단할 유일한 통로다.
            if (e.name === 'checkout.error' || e.name === 'checkout.warning')
              console.error('[ax] paddle ' + e.name, e.detail || '', e);
            if (axPaddleOnEvent) { try { axPaddleOnEvent(e); } catch (err) {} }
          },
        });
        resolve(window.Paddle);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('paddle_script_failed'));
    document.head.appendChild(s);
  });
  return axPaddleReady;
}

/* 결제 직후 권한을 다시 읽는다. 권한은 Paddle 웹훅이 열어주므로 브라우저가 결제
   성공을 본 시점에는 아직 안 열려 있을 수 있다. 2초 간격 5회까지 기다린다. */
async function pollEntitlement(tries = 5, gapMs = 2000) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, gapMs));
    try {
      const me = await fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.json());
      if (me.entitled) return true;
    } catch { /* 네트워크 일시 오류는 다음 회차에서 다시 본다 */ }
  }
  return false;
}

/* Pro 혜택 비교표 행. 키워드 알림이 붙으면 여기에 줄을 추가한다.
   pro: 'soon'은 아직 만들지 않은 혜택 — 체크 대신 "준비 중" 배지가 뜬다.
   없는 기능에 체크를 주면 돈을 받고 약속을 어기는 셈이라, 배지로만 예고한다. */
const PRO_ROWS = [
  { key: 'cards',   free: '8',    pro: '40', note: true },
  { key: 'deep',    free: false,  pro: true },
  { key: 'archive', free: false,  pro: true },
  { key: 'graph',   free: false,  pro: true },
  { key: 'report',  free: false,  pro: 'soon' },
  { key: 'mcp',     free: false,  pro: 'soon' },
];

/* 비교표 한 셀 — true면 체크(Pro 열은 강조색 원 안의 흰 체크), false면 흐린 가로줄,
   'soon'이면 준비 중 배지, 그 밖의 문자열이면 그 문자열(Pro 열은 더 크고 굵게 —
   숫자 대비가 가장 직관적이다). */
function ProCell({ v, t, strong }) {
  if (v === true) {
    return strong
      ? <span className="ax-check" aria-hidden>✓</span>
      : <span style={{ color: t.mute, fontSize: 15 }}>✓</span>;
  }
  if (v === 'soon') return <span className="ax-soon">{tx('pro.soon')}</span>;
  if (v === false) return <span style={{ color: t.faint, fontSize: 15 }}>—</span>;
  return (
    <span style={{ color: strong ? t.hl : t.body, fontWeight: strong ? 700 : 400,
      fontSize: strong ? 19 : 15 }}>{v}</span>
  );
}

/* 사이트 푸터. 링크 네 개(약관·개인정보·환불·문의)는 Paddle 도메인 심사가
   "navigation으로 분명히 접근 가능해야 한다"고 요구하는 항목이다. 그 아래 두 줄은
   사실 고지 — 카드 글이 AI 산출물이라는 점과, 결제의 판매자가 Paddle이라는 점.
   없는 정보(사업자번호 등)는 적지 않는다. */
const FOOTER_LINKS = [
  { key: 'terms',    href: '/terms' },
  { key: 'privacy',  href: '/privacy' },
  { key: 'refunds',  href: '/refunds' },
  { key: 'support',  href: 'mailto:support@axitnow.com' },
  { key: 'report',   href: 'mailto:support@axitnow.com?subject=Issue%20report' },
];

function SiteFooter({ t }) {
  const link = { color: t.mute, textDecoration: 'none', borderBottom: '1px solid ' + t.rule };
  return (
    <footer style={{ padding: '56px 20px 44px', borderTop: '1px solid ' + t.rule, marginTop: 48 }}>
      <nav style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 18px',
        marginBottom: 18 }}>
        {FOOTER_LINKS.map((l) => (
          <a key={l.key} href={l.href} className="ax-body" style={{ ...link, fontSize: 12.5 }}>
            {tx('footer.' + l.key)}
          </a>
        ))}
      </nav>
      <p className="ax-body" style={{ fontSize: 11.5, lineHeight: 1.7, color: t.faint,
        margin: '0 auto', maxWidth: 520, textAlign: 'center' }}>
        {tx('footer.ai_notice')}<br />
        {tx('footer.mor')}<br />
        {tx('footer.operator')}
      </p>
    </footer>
  );
}

/* 구독 중인 사람에게 보여주는 상태판. 이미 산 사람에게 다시 비교표를 들이밀 이유가
   없다 — 알고 싶은 건 "내가 언제까지, 얼마를, 어느 주소로 결제하고 있는가"다.
   해지한 구독은 '다음 결제일'이 아니라 '이용 종료일'이다 — 같은 날짜지만 뜻이 반대라
   라벨을 바꾼다. */
function fmtDay(unix) {
  if (!unix) return null;
  try {
    return new Intl.DateTimeFormat(window.AX_LANG_TAG,
      { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(unix * 1000));
  } catch { return null; }
}

function ProStatus({ me, t }) {
  const started = fmtDay(me && me.startedAt);
  const end = fmtDay(me && me.periodEnd);
  const canceled = me && me.status === 'canceled';
  const pastDue = me && me.status === 'past_due';
  const rows = [
    [tx('status.email'), me && me.email],
    [tx('status.started'), started],
    [tx(canceled ? 'status.ends' : 'status.next_charge'), end || tx('status.none')],
  ].filter((r) => r[1]);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700,
        color: '#fff', padding: '5px 12px', borderRadius: 999, marginBottom: 12,
        background: 'linear-gradient(110deg,#7928ca,#0070f3)' }}>
        ✓ {tx('pro.active')}
      </div>
      {(canceled || pastDue) && (
        <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6, color: canceled ? '#8a6d3b' : '#a94442' }}>
          {tx(canceled ? 'status.canceled_note' : 'status.past_due_note')}
        </p>
      )}
      <div style={{ border: '1px solid ' + t.rule, borderRadius: 12, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r[0]} style={{ display: 'flex', gap: 12, padding: '11px 14px', fontSize: 14,
            borderTop: i ? '1px solid ' + t.rule : 'none' }}>
            <span style={{ flex: '0 0 40%', color: t.mute, fontWeight: 600 }}>{r[0]}</span>
            <span style={{ flex: 1, color: t.hl, fontWeight: 600, wordBreak: 'break-all' }}>{r[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 무료/Pro 혜택 비교표 — SubscribeModal의 choose 화면, 요금제 버튼 위에 뜬다.
   Pro 열만 그라데이션 테두리로 띄워 담백한 무료 열과 대비시킨다. */
function ProCompareTable({ t }) {
  const proBorder = '1px solid rgba(121,40,202,.38)';
  return (
    <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid ' + t.rule,
      display: 'grid', gridTemplateColumns: '1fr 76px 92px', fontFamily: 'Pretendard, system-ui' }}>
      <div />
      <div style={{ padding: '10px 10px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: t.mute }}>
        {tx('pro.col_free')}
      </div>
      <div className="ax-pro-col" style={{ padding: '10px 10px 9px', textAlign: 'center',
        border: proBorder, borderBottom: 'none', borderRadius: '9px 9px 0 0' }}>
        <span className="ax-pro-badge">{tx('pro.col_pro')}</span>
      </div>
      {PRO_ROWS.map((row, i) => {
        const last = i === PRO_ROWS.length - 1;
        return (
          <React.Fragment key={row.key}>
            <div className="ax-pro-row" style={{ padding: '12px 18px 12px 16px', fontSize: 14,
              fontWeight: 600, color: t.hl, lineHeight: 1.35, wordBreak: 'keep-all',
              borderTop: '1px solid ' + t.rule }}>
              {tx('pro.row_' + row.key)}
              {row.note && (
                <div style={{ marginTop: 2, fontSize: 11.5, fontWeight: 500, color: t.mute }}>
                  {tx('pro.row_' + row.key + '_note')}
                </div>
              )}
            </div>
            <div style={{ padding: '12px 10px', textAlign: 'center', fontSize: 14.5, borderTop: '1px solid ' + t.rule }}>
              <ProCell v={row.free} t={t} />
            </div>
            <div className="ax-pro-col" style={{ padding: '12px 10px', textAlign: 'center',
              borderLeft: proBorder, borderRight: proBorder,
              borderBottom: last ? proBorder : 'none', borderRadius: last ? '0 0 9px 9px' : 0 }}>
              <ProCell v={row.pro} t={t} strong />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* 첫 결제일 — 첫 달 무료이므로 오늘 + 1개월. setMonth는 말일을 넘기면(1/31 → 3/3)
   엉뚱한 달로 넘어가므로, 목표 월의 마지막 날을 넘으면 그 달 말일로 고정한다.
   주의: 이 날짜는 Paddle 가격에 "1개월 무료 체험"이 설정돼 있다는 전제에서만 맞다.
   그 설정이 바뀌면 이 계산도 함께 바꿔야 한다 — 그러지 않으면 사용자에게 거짓
   결제일을 보여주게 된다. */
/* 체험 기간은 플랜마다 다르다 — 월간 7일, 연간 1개월. 이 값은 Paddle의 가격에
   설정된 trial_period와 반드시 같아야 한다. 어긋나면 사이트가 약속한 날짜와 실제
   청구일이 갈린다. pipeline/paddle_price_check.html로 양쪽을 대조할 수 있다. */
const TRIAL = { monthly: { days: 7 }, yearly: { months: 1 } };

function firstChargeDate(plan) {
  const t = TRIAL[plan] || TRIAL.yearly;
  const d = new Date();
  if (t.days) { d.setDate(d.getDate() + t.days); return d; }
  // setMonth는 말일을 넘기면 다음 달로 샌다(1/31 → 3/3) — 해당 달의 마지막 날로 깎는다.
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + t.months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
function firstChargeLabel(plan) {
  try {
    const dateStr = new Intl.DateTimeFormat(window.AX_LANG_TAG,
      { year: 'numeric', month: 'long', day: 'numeric' }).format(firstChargeDate(plan));
    return tx('paywall.first_charge', { date: dateStr });
  } catch { return ''; }
}

/* NOTE: rendered via createPortal to document.body — the carousel slides are CSS-
   transformed, and position:fixed inside a transformed ancestor anchors to that
   ancestor instead of the viewport (the modal appeared on the NEIGHBORING slide).
   The portal escapes the transform so the popup opens over the card you tapped,
   with the blurred locked card still visible behind the translucent backdrop. */
/* 구독 모달 — 플랜 2종. 결제창은 Paddle 오버레이로 사이트 위에 뜬다. */
function SubscribeModal({ onClose, t, initialPhase }) {
  const [phase, setPhase] = useState(initialPhase || 'choose');   // choose | confirming | slow | error | login | sent
  // 로그인 화면에 어떻게 왔는지 — 'signin'은 헤더의 Login 버튼(이미 구독한 사람),
  // 'subscribe'는 결제를 누르려다 로그인이 필요해서. 같은 화면이지만 할 말이 다르다.
  const [loginFor, setLoginFor] = useState(initialPhase === 'login' ? 'signin' : 'subscribe');
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  // 이미 구독 중인 사람에겐 요금제 대신 "이미 구독 중" 안내 + 관리 버튼을 보여준다.
  // 읽기 전에는 요금제를 보여준다(기본값) — 정적 프리뷰(워커 없음)에서 /api/me가
  // 404/네트워크 오류여도 조용히 묻힌다.
  const [me, setMe] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setMe(d); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  // 금액은 서버(env)가 확정하고, 그 금액을 감싸는 말('월'/'연')은 i18n 틀이 갖는다.
  // 버튼이 결제창과 다른 금액을 말하는 일도 없고, 한국어 페이지가 영어로 바뀌는 일도
  // 없다. 응답이 없으면 기존 i18n 문자열(금액 포함)로 그대로 떨어진다.
  const [amounts, setAmounts] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/billing/checkout', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d && d.amounts) setAmounts(d.amounts); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const planPrice = (plan) => {
    const amount = amounts && amounts[plan];
    return amount ? tx(`paywall.plan_${plan}_fmt`, { amount }) : tx(`paywall.plan_${plan}`);
  };

  const start = async (plan) => {
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) { setLoginFor('subscribe'); setPhase('login'); return; }
      // 409 = 이미 Paddle 구독 행이 있다. 두 번째 구독을 열면 첫 구독이 고아가 되므로
      // 서버가 막는다 — 사용자는 '구독 관리'로 가야 한다.
      if (res.status === 409) { setPhase('error'); setNote(tx('paywall.already_subscribed')); return; }
      // 503 sandbox_mode = 운영자 검증용 가드. 오류가 아니라 의도된 차단이라
      // 같은 문구로 뭉뚱그리면 진짜 오류와 구별되지 않는다.
      if (res.status === 503) { setPhase('error'); setNote(tx('paywall.sandbox_mode')); return; }
      if (!res.ok) { setPhase('error'); setNote(tx('paywall.checkout_failed')); return; }
      const cfg = await res.json();
      const Paddle = await loadPaddle(cfg.clientToken, cfg.environment);
      // 완료 이벤트는 Initialize의 콜백으로만 들어온다(위 axPaddleOnEvent 참고).
      axPaddleOnEvent = async (e) => {
        if (e.name !== 'checkout.completed') return;
        axPaddleOnEvent = null;          // 한 번만 처리한다
        setPhase('confirming');
        if (await pollEntitlement()) window.location.reload();
        else setPhase('slow');
      };
      Paddle.Checkout.open({
        items: [{ priceId: cfg.priceId, quantity: 1 }],
        customer: { email: cfg.email },
        customData: { email: cfg.email },      // 웹훅이 이 이메일로 권한을 연다
        settings: { displayMode: 'overlay', theme: 'light' },
      });
    } catch {
      setPhase('error'); setNote(tx('paywall.checkout_failed'));
    }
  };

  /* 두 버튼 모두 색이 채워진 형태. 연간이 기본 추천이라 그라데이션으로 더 강하게 띄우고,
     우상단에 "-17%" 스티커(아리아 레이블은 현지화된 문구)를 얹는다. */
  const Plan = ({ plan, price, discount, highlight }) => (
    <button onClick={() => start(plan)} className="ax-plan-btn" style={{
      padding: '14px 16px', marginBottom: 8,
      background: highlight ? 'linear-gradient(135deg,#7928ca,#0070f3)' : t.hl,
      boxShadow: highlight ? '0 10px 26px -10px rgba(121,40,202,.55)' : '0 6px 16px -8px rgba(40,30,20,.4)',
    }}>
      {discount && <span className="ax-sticker" aria-label={discount}>-17%</span>}
      <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#fff' }}>{price}</span>
      <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,.85)' }}>
        {tx('paywall.trial_' + plan)}
      </span>
      <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'rgba(255,255,255,.72)' }}>
        {firstChargeLabel(plan)}
      </span>
    </button>
  );

  return ReactDOM.createPortal(
    /* 뒤 배경은 확실히 눌러야 모달이 앞으로 나온다 — .4로는 밝은 종이색 배경에서
       거의 읽히지 않았다. 블러를 얹어 깊이를 준다. 세로 패딩과 overflow는 모달이
       화면보다 길어졌을 때(작은 노트북·가로 모드) 잘리지 않게 하는 안전장치다. */
    <div onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,12,.62)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      /* align-items:center + 넘치는 내용 = 위쪽이 잘리고 스크롤로도 닿지 않는다.
         flex-start로 두고 자식에 margin:auto를 주면, 들어갈 땐 가운데 정렬이고
         넘칠 땐 위에서부터 스크롤된다. overscroll-behavior는 팝업 끝에서 스크롤이
         뒤 페이지로 넘어가는 것을 막는다 — 폰에서 배경만 움직이던 원인. */
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '20px 14px', boxSizing: 'border-box',
      overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
      zIndex: 2147483100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16,
        padding: 26, width: 580, maxWidth: '94vw', margin: 'auto',
        fontFamily: 'Pretendard, system-ui' }}>
        <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>
          {phase === 'login' && loginFor === 'signin' ? tx('auth.login_title')
            : phase === 'choose' && me && me.entitled ? tx('status.title')
            : tx('paywall.modal_title')}
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: '#5a5450' }}>
          {phase === 'login' ? tx(loginFor === 'signin' ? 'auth.login_body' : 'paywall.login_first')
            : phase === 'choose' && me && me.entitled ? tx('status.body')
            : tx('paywall.modal_body')}
        </p>
        {phase === 'choose' && (
          me && me.entitled ? (
            <React.Fragment>
              <ProStatus me={me} t={t} />
              {me.hasSubscription && <ManageLink t={t} />}
            </React.Fragment>
          ) : (
            <React.Fragment>
              <ProCompareTable t={t} />
              {me && me.hasSubscription ? (
                <div style={{ marginTop: 2 }}><ManageLink t={t} /></div>
              ) : (
                <React.Fragment>
                  <Plan plan="monthly" price={planPrice('monthly')} />
                  <Plan plan="yearly" price={planPrice('yearly')} highlight
                    discount={tx('paywall.plan_yearly_note')} />
                  {/* 이미 구독한 사람의 입구. 폰에서는 헤더에 Login 알약이 들어갈
                      자리가 없어 여기가 유일한 길이다 — 데스크톱에서도 해가 없다. */}
                  {!(me && me.loggedIn) && (
                    <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 13, color: '#5a5450' }}>
                      {tx('auth.already')}{' '}
                      <button type="button" onClick={() => { setLoginFor('signin'); setPhase('login'); }}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          font: 'inherit', fontWeight: 700, color: '#7928ca', textDecoration: 'underline' }}>
                        {tx('auth.login')}
                      </button>
                    </p>
                  )}
                </React.Fragment>
              )}
            </React.Fragment>
          )
        )}
        {phase === 'login' && (
          <React.Fragment>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={tx('paywall.email_label')} autoComplete="email"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 16,
                borderRadius: 10, border: '1px solid ' + t.rule, marginBottom: 8 }} />
            <AxPill label={tx('paywall.send_link')} t={t}
              style={sendingLink ? { opacity: .6, pointerEvents: 'none' } : undefined}
              onClick={async () => {
                if (sendingLink || !email.includes('@')) return;
                setSendingLink(true);
                try {
                  // 상태 코드를 반드시 본다 — 발송 실패를 '보냈습니다'로 보여주면
                  // 사용자는 오지 않는 메일을 기다리게 된다.
                  const r = await fetch('/api/auth/request', { method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email }) });
                  if (!r.ok) { setPhase('error'); setNote(tx('paywall.send_link_failed')); return; }
                  setPhase('sent');
                } catch {
                  setPhase('error'); setNote(tx('paywall.send_link_failed'));
                } finally {
                  setSendingLink(false);
                }
              }} />
          </React.Fragment>
        )}
        {phase === 'sent' && (
          <p style={{ margin: 0, fontSize: 14, color: '#5a5450' }}>{tx('paywall.link_sent')}</p>
        )}
        {phase === 'confirming' && (
          <p style={{ margin: 0, fontSize: 14, color: '#5a5450' }}>{tx('paywall.confirming')}</p>
        )}
        {phase === 'slow' && (
          <p style={{ margin: 0, fontSize: 14, color: '#5a5450' }}>{tx('paywall.confirm_slow')}</p>
        )}
        {phase === 'error' && (
          <p style={{ margin: 0, fontSize: 14, color: '#b4453c' }}>{note}</p>
        )}
      </div>
    </div>,
    document.body
  );
}

/* round share button — copies a deep link to THIS card and flashes "link copied". */
function ShareButton({ url, t }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const onShare = (e) => {
    e.stopPropagation(); e.preventDefault();   // don't trigger the card's flip
    const flash = () => { setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(flash).catch(() => { fallbackCopy(url); flash(); });
    } else { fallbackCopy(url); flash(); }
  };
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      {/* the "link copied" popup, above the button */}
      <div aria-hidden={!copied} style={{ position: 'absolute', bottom: 'calc(100% + 9px)', left: '50%',
        transform: `translateX(-50%) translateY(${copied ? '0' : '4px'})`, opacity: copied ? 1 : 0,
        transition: 'opacity .18s ease, transform .18s ease', pointerEvents: 'none', whiteSpace: 'nowrap',
        background: t.hl, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.04em',
        padding: '6px 10px', borderRadius: 8, boxShadow: '0 6px 16px -6px rgba(40,30,20,.5)' }}>
        {tx('share.copied')}
        <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${t.hl}` }} />
      </div>
      <button onClick={onShare} aria-label={tx('share.copy_link')} title={tx('share.copy_link')} style={{
        width: 42, height: 42, borderRadius: '50%', cursor: 'pointer', flex: '0 0 auto',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: t.hl, color: '#fff', border: 'none', boxShadow: '0 6px 18px -8px rgba(40,30,20,.5)',
        transition: 'transform .15s ease' }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.92)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginTop: -1 }}>
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>
    </div>
  );
}
function fallbackCopy(text) {
  try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); ta.remove(); } catch (e) {}
}

function LayoutEditorial({ item, index, total, active, t, mobile, onExpand, section }) {
  // Share a per-card static page (/s/<section>/<id>) — it carries OG/Twitter meta so
  // the link unfurls with the card's image + headline, then redirects into the app
  // (/?c=<section>:<id>). The legacy ?c= link still works if anyone has one copied.
  // Under a language route (/<lang>/…) share that language's page /s/<lang>/<section>/<id>;
  // on the legacy / route keep /s/<section>/<id>.
  const shareLang = (typeof window !== 'undefined' && window.AX_LANG
    && window.location.pathname.indexOf('/' + window.AX_LANG + '/') === 0) ? window.AX_LANG + '/' : '';
  const shareUrl = (typeof window !== 'undefined' && item.id)
    ? window.location.origin + '/s/' + shareLang + (section || 'design') + '/' + item.id
    : '';
  const it = axEnrich(item);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ position: 'relative', flex: '0 0 auto', aspectRatio: mobile ? '16 / 10' : '4 / 3' }}>
        <MediaScene item={it} active={active} bold={t.bold} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: mobile ? '16px 18px 18px' : '22px 26px 22px' }}>
        <Eyebrow item={it} index={index} total={total} t={t} />
        <h2 className="ax-hl" style={{ fontSize: mobile ? 21 : 28, lineHeight: 1.18, marginTop: mobile ? 10 : 14, color: t.hl }}>{it.headline}</h2>
        {/* wrapper is the flex item (blockified safely); the <p> stays a real
            -webkit-box so -webkit-line-clamp actually caps at 3 lines */}
        <div style={{ flex: '0 0 auto', marginTop: mobile ? 9 : 12 }}>
          <p className="ax-body" style={{ fontSize: mobile ? 14 : 15, lineHeight: 1.55, margin: 0, color: t.body,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            maxHeight: 'calc(1.55em * 3)' }}>{it.body}</p>
        </div>
        {/* desktop pushes the source line to the card bottom; on mobile the card is
            content-height so the line simply follows the body (never clipped). */}
        <div style={{ flex: 1, minHeight: 14 }} />
        {it.untranslated && <UntranslatedNote t={t} style={{ flex: '0 0 auto', marginTop: mobile ? 8 : 0 }} />}
        {/* footer: divider, then one clean row — full-width "Read" pill + share button.
            The source link lives only inside the full view now (bottom of the article);
            cards WITHOUT a Read button keep the source line so the link isn't lost. */}
        <div style={{ flex: '0 0 auto', borderTop: `1px solid ${t.rule}`, paddingTop: mobile ? 13 : 14, marginTop: mobile ? 14 : 18 }}>
          {onExpand ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ flex: 1, minWidth: 0 }}><AxPill label={tx('card.read')} onClick={onExpand} t={t} /></div>
              {shareUrl && <ShareButton url={shareUrl} t={t} />}
            </div>
          ) : (
            <SourceLine item={it} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

/* shared block renderer — text/img/video blocks used by both the inline FullArticle
   (free/archive cards, whose complete deep-dive already rides in the public payload)
   and PremiumFullArticle (an entitled member's view of a locked card, whose deep-dive
   is fetched lazily from /api/premium/full). */
function renderFullBlocks(blocks) {
  return blocks.map((b, i) => {
    if (b.t === 'img') return <img key={i} src={b.src} alt={b.cap || ''} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
    if (b.t === 'video') return (
      <div key={i} className="ax-vid">
        {b.yt
          ? <iframe src={`https://www.youtube.com/embed/${b.yt}`} title={tx('common.video')} allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen />
          : <video src={b.src} poster={b.poster || undefined} controls playsInline />}
      </div>
    );
    return <p key={i}>{b.x}</p>;
  });
}

/* ---- FullArticle: the flip back — Korean-translated article deep-dive (text+img+video),
   capped to a fixed scroll box. v2: the public payload carries the COMPLETE deep-dive
   for any card that reaches this component (free card or an archive card — locked
   cards never mount this, see FlipCard's `item.locked` gate), so it renders fully,
   with no cutoff, no fade, and no subscribe CTA. ---- */
/* 전문 글자 크기 — 5단. 긴 글을 읽는 화면이라 사람마다 편한 크기가 다르고,
   한 번 고르면 다음 카드에서도 그대로여야 한다. localStorage는 이 브라우저의
   읽기 편의일 뿐이라 막혀 있어도 기본값으로 조용히 떨어진다. */
const FULL_SIZES = [13, 14.5, 16, 17.5, 19];
const FULL_SIZE_KEY = 'ax_full_size';

function useFullFontSize() {
  const [idx, setIdx] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(FULL_SIZE_KEY), 10);
      if (v >= 0 && v < FULL_SIZES.length) return v;
    } catch (e) {}
    return 1;
  });
  const set = (next) => {
    const v = Math.max(0, Math.min(FULL_SIZES.length - 1, next));
    setIdx(v);
    try { localStorage.setItem(FULL_SIZE_KEY, String(v)); } catch (e) {}
  };
  return [idx, set];
}

function FontSizeControl({ idx, set, t }) {
  const btn = (on) => ({
    width: 28, height: 28, borderRadius: 8, cursor: on ? 'pointer' : 'default',
    border: '1px solid ' + t.rule, background: t.cardSolid || '#fbf8f3',
    color: on ? t.hl : t.faint, fontWeight: 700, lineHeight: 1, padding: 0,
    fontFamily: 'Pretendard, system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}
      aria-label={tx('reader.text_size')}>
      <button type="button" onClick={() => set(idx - 1)} disabled={idx === 0}
        aria-label={tx('reader.smaller')} style={{ ...btn(idx > 0), fontSize: 12 }}>A</button>
      <div aria-hidden style={{ display: 'flex', gap: 3 }}>
        {FULL_SIZES.map((_, i) => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: '50%',
            background: i <= idx ? t.hl : t.rule }} />
        ))}
      </div>
      <button type="button" onClick={() => set(idx + 1)} disabled={idx === FULL_SIZES.length - 1}
        aria-label={tx('reader.larger')} style={{ ...btn(idx < FULL_SIZES.length - 1), fontSize: 17 }}>A</button>
    </div>
  );
}

function FullArticle({ item, t, section, onClose }) {
  const it = axEnrich(item);
  const [sizeIdx, setSizeIdx] = useFullFontSize();
  const solid = t.cardSolid || '#fbf8f3';   // opaque base for the floating-close fade

  // Defensive: FlipCard only ever mounts FullArticle for hasFull cards (see its own
  // hasFull gate above), so this should be unreachable — but never render deep-dive
  // chrome for a card that isn't supposed to have one.
  if (!item.hasFull) return null;

  const full = item.full || {};
  const blocks = full.blocks || [];
  return (
    <React.Fragment>
      <div style={{ flex: '0 0 auto', padding: '20px 26px 12px', borderBottom: `1px solid ${t.rule}` }}>
        <div style={{ minWidth: 0 }}>
          {/* 크기 조절은 eyebrow 줄 끝에 둔다 — 제목과 한 줄에 두면 제목 폭이 줄어
              멀쩡하던 헤드라인이 꺾인다. */}
          <div className="ax-eyebrow" style={{ color: t.faint, marginBottom: 7 }}>
            {it.eyebrow} · {it.tool}<span style={{ color: t.faint }}> · {tx('card.preview_translated')}</span>
          </div>
          {it.untranslated && <UntranslatedNote t={t} style={{ marginBottom: 7 }} />}
          <h2 className="ax-hl" style={{ fontSize: 20, lineHeight: 1.22, color: t.hl, margin: 0 }}>{it.headline}</h2>
          {/* 크기 조절은 제목 아래 자기 줄에. eyebrow와 한 줄에 두면 폰에서 자리가
              모자라 제목까지 밀려 꺾인다. */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <FontSizeControl idx={sizeIdx} set={setSizeIdx} t={t} />
          </div>
        </div>
      </div>
      {/* extra bottom padding so the last line clears the floating close pill */}
      <div className="ax-full ax-body" style={{ color: t.body, fontSize: FULL_SIZES[sizeIdx],
        lineHeight: 1.62, paddingBottom: 92, position: 'relative' }}>
        {renderFullBlocks(blocks)}
        <div style={{ marginTop: 8, paddingTop: 12, borderTop: `1px solid ${t.rule}` }}>
          <SourceLine item={it} t={t} />
        </div>
      </div>
      {/* floating close — the same pill as Read, always pinned to the bottom of the view */}
      {onClose && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 22px',
          paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
          background: `linear-gradient(to top, ${solid} 56%, ${solid}d9 78%, ${solid}00)`,
          pointerEvents: 'none', zIndex: 5 }}>
          <div style={{ pointerEvents: 'auto', maxWidth: 520, margin: '0 auto' }}>
            <AxPill label={tx('common.close_pill')} onClick={onClose} t={t} />
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

/* ---- PremiumFullArticle: the flip back for an ENTITLED member viewing a locked
   card. The public payload never carries a locked card's deep-dive (see
   split_teaser) — so unlike FullArticle, this lazy-fetches it from
   /api/premium/full once mounted (i.e. once its card is the active carousel
   slide, matching FullArticle's own "only the active card mounts" rule), shows
   a quiet loading line until it arrives, and a Korean retry line on failure. ---- */
function PremiumFullArticle({ item, t, section, onClose }) {
  const it = axEnrich(item);
  const solid = t.cardSolid || '#fbf8f3';
  const [sizeIdx, setSizeIdx] = useFullFontSize();
  const [state, setState] = useState({ status: 'loading', blocks: null, lang: null });
  const want = window.AX_LANG || 'ko';
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', blocks: null, lang: null });
    fetch(`/api/premium/full?section=${encodeURIComponent(section || '')}&id=${encodeURIComponent(item.id || '')}&lang=${encodeURIComponent(want)}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http_' + r.status))))
      .then((d) => { if (alive) setState({ status: 'ready', blocks: (d.full && d.full.blocks) || [], lang: d.lang || null }); })
      .catch(() => { if (alive) setState({ status: 'error', blocks: null }); });
    return () => { alive = false; };
  }, [section, item.id]);
  return (
    <React.Fragment>
      <div style={{ flex: '0 0 auto', padding: '20px 26px 12px', borderBottom: `1px solid ${t.rule}` }}>
        <div style={{ minWidth: 0 }}>
          <div className="ax-eyebrow" style={{ color: t.faint, marginBottom: 7 }}>{it.eyebrow} · {it.tool}</div>
          {(it.untranslated || (state.status === 'ready' && state.lang && state.lang !== want)) &&
            <UntranslatedNote t={t} style={{ marginBottom: 7 }} />}
          <h2 className="ax-hl" style={{ fontSize: 20, lineHeight: 1.22, color: t.hl, margin: 0 }}>{it.headline}</h2>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <FontSizeControl idx={sizeIdx} set={setSizeIdx} t={t} />
          </div>
        </div>
      </div>
      <div className="ax-full ax-body" style={{ color: t.body, fontSize: FULL_SIZES[sizeIdx],
        lineHeight: 1.62, paddingBottom: 92, position: 'relative' }}>
        {state.status === 'loading' && <p style={{ color: t.faint }}>{tx('common.loading')}</p>}
        {state.status === 'error' && <p style={{ color: t.faint }}>{tx('common.retry_later')}</p>}
        {state.status === 'ready' && (
          <React.Fragment>
            {renderFullBlocks(state.blocks)}
            <div style={{ marginTop: 8, paddingTop: 12, borderTop: `1px solid ${t.rule}` }}>
              <SourceLine item={it} t={t} />
            </div>
          </React.Fragment>
        )}
      </div>
      {onClose && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 22px',
          paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
          background: `linear-gradient(to top, ${solid} 56%, ${solid}d9 78%, ${solid}00)`,
          pointerEvents: 'none', zIndex: 5 }}>
          <div style={{ pointerEvents: 'auto', maxWidth: 520, margin: '0 auto' }}>
            <AxPill label={tx('common.close_pill')} onClick={onClose} t={t} />
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

/* ---- LockedCard: a REAL card (headline/body/image, all public front fields),
   rendered blurred behind a subscribe overlay — v2 replaces v1's empty gray
   placeholder tile per user feedback ("나머지 카드들에 대해서는 뒤에 흐릿하게 보이고
   지금처럼 구독 유도하게"). The blur/dim is applied to an INNER wrapper around the
   card content only (not the outer frame), so the card silhouette + rounded
   corners stay crisp — only the overlay sits on top, sharp and legible. Tapping
   the overlay (or Enter/Space) opens SubscribeModal; the underlying card content
   is inert (pointerEvents: none) and never flips/expands — there is no `full` in
   the payload for a locked card, so there's nothing to open. ---- */
function LockedCard({ item, index, total, t, mobile, section }) {
  const [showSubscribe, setShowSubscribe] = useState(false);
  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', borderRadius: 'inherit' }}>
      <div aria-hidden style={{ height: '100%', pointerEvents: 'none',
        filter: 'blur(10px) saturate(.7) brightness(.94)', transform: 'scale(1.04)' }}>
        <LayoutEditorial item={item} index={index} total={total} active={false} t={t} mobile={mobile} section={section} />
      </div>
      <div role="button" tabIndex={0} aria-label={tx('paywall.unlock_all')}
        onClick={() => setShowSubscribe(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowSubscribe(true); } }}
        style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, textAlign: 'center', padding: 32, cursor: 'pointer', boxSizing: 'border-box',
          background: 'rgba(28,24,18,.32)' }}>
        <div aria-hidden style={{ width: 46, height: 46, borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(255,255,255,.9)', fontSize: 19, color: '#1c1a18' }}>🔒</div>
        <div className="ax-hl" style={{ fontSize: mobile ? 17 : 19, color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,.45)' }}>
          {tx('paywall.unlock_all')}
        </div>
        <p className="ax-body" style={{ fontSize: 13, color: 'rgba(255,255,255,.9)', margin: 0, maxWidth: 260,
          textShadow: '0 1px 5px rgba(0,0,0,.4)' }}>
          {tx('paywall.rest_for_subscribers')}
        </p>
      </div>
      {showSubscribe && <SubscribeModal t={t} onClose={() => setShowSubscribe(false)} />}
    </div>
  );
}

/* ---- FlipCard: front = LayoutEditorial summary; tap + to flip (revolving door)
   to the FullArticle back. Desktop-first (the back uses absolute faces that need a
   fixed-height card; on mobile, where the hero is content-height, fall back to the
   plain summary card for now). ---- */
function FlipCard({ item, index, total, active, t, mobile, onFlipChange, section, entitled }) {
  const [flipped, setFlipped] = useState(false);
  const [flipping, setFlipping] = useState(false);   // true during the rotate animation
  const flipTimer = useRef();
  const doFlip = (v) => {
    setFlipping(true); setFlipped(v);
    clearTimeout(flipTimer.current);
    flipTimer.current = setTimeout(() => setFlipping(false), 680);   // > the .62s transition
  };
  useEffect(() => { if (!active) { setFlipped(false); setFlipping(false); } }, [active]);
  useEffect(() => { if (onFlipChange) onFlipChange(flipped); }, [flipped, onFlipChange]);
  useEffect(() => () => clearTimeout(flipTimer.current), []);
  // locked card — a real card (front fields are public) rendered blurred behind a
  // subscribe overlay; it has no `full` in the payload, so it must never flip.
  // EXCEPT for an entitled subscriber: they get the normal flip card below,
  // whose back (PremiumFullArticle) lazy-fetches the deep-dive from the Worker.
  if (item.locked && !entitled) {
    return <LockedCard item={item} index={index} total={total} t={t} mobile={mobile} section={section} />;
  }
  // public payload carries hasFull as a plain boolean; item.full (when present) is
  // the COMPLETE deep-dive (free/archive cards only — see FullArticle). A locked
  // card reaching this point is only here because the viewer is entitled.
  const hasFull = item.locked ? true : !!item.hasFull;
  if (!hasFull) {
    return <LayoutEditorial item={item} index={index} total={total} active={active} t={t} mobile={mobile} />;
  }
  // 3D only while flipping/flipped. At rest on the front the card is a plain 2D element
  // (no perspective/preserve-3d → no compositing layer → vertical touch scrolls the page).
  const use3d = flipped || flipping;
  return (
    <div className={'ax-flip-wrap' + (use3d ? ' is3d' : '')} style={{ perspective: use3d ? '1800px' : 'none' }}>
      <div className={'ax-flip' + (flipped ? ' flipped' : '')} style={{ transformStyle: use3d ? 'preserve-3d' : 'flat' }}>
        <div className="ax-flip-face">
          <LayoutEditorial item={item} index={index} total={total} active={active && !flipped} t={t} mobile={mobile}
            onExpand={() => doFlip(true)} section={section} />
        </div>
        {/* hide the back when flat (no backface-visibility in a flat context) so it can't
            bleed over the front; only the active card mounts the heavy article. */}
        <div className="ax-flip-face ax-flip-back" style={{ background: t.cardSolid || t.cardBg, visibility: use3d ? 'visible' : 'hidden' }}>
          {active && (item.locked
            ? <PremiumFullArticle item={item} t={t} section={section} onClose={() => doFlip(false)} />
            : <FullArticle item={item} t={t} section={section} onClose={() => doFlip(false)} />)}
        </div>
      </div>
    </div>
  );
}

/* ---- themed circular nav ---- */
function NavButton({ dir, disabled, onClick, t, size }) {
  const d = size || 34;
  const styles = {
    light: { bg: 'rgba(255,255,255,.7)', bd: 'rgba(40,30,20,.14)', fg: '#1c1a18' },
    dark: { bg: 'rgba(255,255,255,.1)', bd: 'rgba(255,255,255,.22)', fg: '#fff' },
    paper: { bg: 'rgba(249,247,242,.9)', bd: 'rgba(40,36,30,.16)', fg: '#26241f' },
  }[t.nav];
  return (
    <button aria-label={dir === 'l' ? tx('nav.prev') : tx('nav.next')} disabled={disabled} onClick={onClick}
      style={{ width: d, height: d, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: styles.bg, border: `1px solid ${styles.bd}`, color: styles.fg, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? .35 : 1, boxShadow: '0 6px 18px -8px rgba(40,30,20,.45)', transition: 'opacity .15s, transform .12s' }}>
      <svg width={Math.round(d * 0.44)} height={Math.round(d * 0.44)} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === 'l' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'} />
      </svg>
    </button>
  );
}

/* ============================================================
   Carousel — one card visible, swipe + dots + nav, themed.
   Frame (radius/border/shadow/glass) lives on the window so the
   sliding cards are full-bleed — no rounded-corner gaps on swipe.
   ============================================================ */
function Carousel({ items, t, initialIndex = 0, mobile, section, entitled }) {
  const [idx, setIdx] = useState(initialIndex);
  // 잠긴 카드로 넘어오면 구독 창을 한 번 띄운다. 한 번인 게 중요하다 — 닫을 때마다
  // 다시 뜨면 넘길 때마다 가로막는 꼴이라, 설득이 아니라 방해가 된다. 그래서
  // 이 페이지를 연 동안 딱 한 번만 띄우고, 그 뒤로는 카드를 눌러야 열린다.
  const autoShown = useRef(false);
  useEffect(() => {
    if (autoShown.current || entitled) return;
    const it = items[idx];
    if (!it || !it.locked) return;
    autoShown.current = true;
    window.dispatchEvent(new CustomEvent('ax:subscribe'));
  }, [idx, items, entitled]);
  const idxRef = useRef(initialIndex);
  const trackRef = useRef(null);
  const startX = useRef(0); const startY = useRef(0); const dx = useRef(0);
  const dragging = useRef(false); const axis = useRef(null); const lockedFlip = useRef(false);
  const total = items.length;
  useEffect(() => { idxRef.current = idx; }, [idx]);
  const go = (i) => { const n = Math.max(0, Math.min(total - 1, i)); idxRef.current = n; setIdx(n); };
  const setX = (px) => {
    const el = trackRef.current; if (!el) return;
    el.style.transition = 'none';
    el.style.transform = `translateX(calc(${-idxRef.current * 100}% + ${px}px))`;
  };
  const snapBack = () => {
    const el = trackRef.current; if (!el) return;
    el.style.transition = '';   // CSS .ax-track transition
    el.style.transform = `translateX(${-idxRef.current * 100}%)`;
  };
  // Touch listeners are NATIVE + non-passive so that, once a horizontal swipe is
  // locked in, we preventDefault to STOP the page from scrolling vertically during the
  // swipe. A vertical gesture is left untouched → the browser scrolls the page (the
  // viewport is overflow:clip, not a scroll container, so vertical falls through).
  const viewportRef = useRef(null);
  useEffect(() => {
    const el = viewportRef.current; if (!el) return;
    const onStart = (e) => {
      startX.current = e.touches[0].clientX; startY.current = e.touches[0].clientY;
      dx.current = 0; axis.current = null; dragging.current = true;
      const slide = trackRef.current && trackRef.current.children[idxRef.current];
      lockedFlip.current = !!(slide && slide.querySelector('.ax-flip.flipped'));   // reading → no swipe
    };
    const onMove = (e) => {
      if (!dragging.current || lockedFlip.current) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      if (!axis.current) {
        const adx = Math.abs(x - startX.current), ady = Math.abs(y - startY.current);
        if (Math.max(adx, ady) < 8) return;
        axis.current = adx > ady ? 'x' : 'y';
      }
      if (axis.current !== 'x') return;   // vertical → let the browser scroll the page
      if (e.cancelable) e.preventDefault();   // horizontal → lock vertical scroll
      let d = x - startX.current;
      if ((idxRef.current === 0 && d > 0) || (idxRef.current === total - 1 && d < 0)) d *= 0.3;
      dx.current = d; setX(d);
    };
    const onEnd = () => {
      dragging.current = false;
      const wasH = axis.current === 'x'; axis.current = null;
      if (lockedFlip.current || !wasH) return;
      if (Math.abs(dx.current) > 44) go(idxRef.current + (dx.current < 0 ? 1 : -1));
      snapBack();
      dx.current = 0;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); };
  }, [total]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
      <div className="ax-heroin" ref={viewportRef} style={{ flex: 1, minHeight: 0, overflow: 'clip',
        touchAction: 'pan-y',   // browser owns vertical (page / article); JS owns horizontal
        borderRadius: t.radius, border: t.cardBorder, boxShadow: t.cardShadow,
        background: t.cardSolid || t.cardBg }}>
        <div className="ax-track" ref={trackRef} style={{ transform: `translateX(${-idx * 100}%)` }}>
          {items.map((it, i) => (
            <div className="ax-slide" key={i}>
              <FlipCard item={it} index={i} total={total} active={i === idx} t={t} mobile={mobile} section={section} entitled={entitled} />
            </div>
          ))}
        </div>
      </div>
      {/* 좌우 이동은 카드 바깥 여백의 중앙 높이에. 점 옆에 모여 있을 때보다
          넘기려는 손이 가는 자리에 가깝다. 카드에 붙이지 않고 조금 띄운다.
          폰에서는 여백이 없으니 숨기고 스와이프에 맡긴다. */}
      {!mobile && (
        <React.Fragment>
          <div style={{ position: 'absolute', left: -58, top: '50%', transform: 'translateY(-50%)', zIndex: 4 }}>
            <NavButton dir="l" disabled={idx === 0} onClick={() => go(idx - 1)} t={t} size={44} />
          </div>
          <div style={{ position: 'absolute', right: -58, top: '50%', transform: 'translateY(-50%)', zIndex: 4 }}>
            <NavButton dir="r" disabled={idx === total - 1} onClick={() => go(idx + 1)} t={t} size={44} />
          </div>
        </React.Fragment>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: mobile ? 12 : 16 }}>
        {items.map((_, i) => (
          <button key={i} aria-label={tx('nav.card', { n: i + 1 })} onClick={() => go(i)}
            style={{ border: 'none', padding: 0, cursor: 'pointer', height: 6, borderRadius: 3,
              width: i === idx ? 22 : 6, transition: 'all .2s', background: i === idx ? t.dotOn : t.dotOff }} />
        ))}
      </div>
    </div>
  );
}

/* ---- morphing liquid title (ports liquid-text.tsx to inline-style JSX) ---- */
const MORPH_TIME = 1.5;
const COOLDOWN_TIME = 0.5;

function useMorphingText(texts) {
  const textIndexRef = useRef(0);
  const morphRef = useRef(0);
  const cooldownRef = useRef(0);
  const timeRef = useRef(new Date());
  const text1Ref = useRef(null);
  const text2Ref = useRef(null);

  const setStyles = useCallback((fraction) => {
    const c1 = text1Ref.current, c2 = text2Ref.current;
    if (!c1 || !c2 || !texts || !texts.length) return;
    c2.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
    c2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
    const inv = 1 - fraction;
    c1.style.filter = `blur(${Math.min(8 / inv - 8, 100)}px)`;
    c1.style.opacity = `${Math.pow(inv, 0.4) * 100}%`;
    c1.textContent = texts[textIndexRef.current % texts.length];
    c2.textContent = texts[(textIndexRef.current + 1) % texts.length];
  }, [texts]);

  const doMorph = useCallback(() => {
    morphRef.current -= cooldownRef.current;
    cooldownRef.current = 0;
    let fraction = morphRef.current / MORPH_TIME;
    if (fraction > 1) { cooldownRef.current = COOLDOWN_TIME; fraction = 1; }
    setStyles(fraction);
    if (fraction === 1) textIndexRef.current++;
  }, [setStyles]);

  const doCooldown = useCallback(() => {
    morphRef.current = 0;
    const c1 = text1Ref.current, c2 = text2Ref.current;
    if (c1 && c2) {
      c2.style.filter = 'none'; c2.style.opacity = '100%';
      c1.style.filter = 'none'; c1.style.opacity = '0%';
    }
  }, []);

  useEffect(() => {
    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = new Date();
      const dt = (now.getTime() - timeRef.current.getTime()) / 1000;
      timeRef.current = now;
      cooldownRef.current -= dt;
      if (cooldownRef.current <= 0) doMorph(); else doCooldown();
    };
    animate();
    return () => cancelAnimationFrame(raf);
  }, [doMorph, doCooldown]);

  return { text1Ref, text2Ref };
}

function MorphingTitle({ texts, color, fontSize = 56, width = 360, height = 72 }) {
  // Gooey morph done ENTIRELY inside SVG (two <text>s under a group filter =
  // feGaussianBlur + alpha-threshold). SVG filters on SVG content render reliably on
  // iOS Safari, unlike `filter:url(#id)` on an HTML element (which iOS dropped, so
  // the morph degraded to a plain text swap). The blur peaks mid-transition and the
  // threshold fuses the two crossfading words into liquid metaballs; at rest blur is
  // 0 so the word is crisp.
  const t1 = useRef(null), t2 = useRef(null), blurRef = useRef(null);
  useEffect(() => {
    const T1 = t1.current, T2 = t2.current, B = blurRef.current;
    if (!T1 || !T2 || !texts || !texts.length) return;
    const MORPH = 1500, HOLD = 700, CYCLE = MORPH + HOLD;
    let raf = 0, start = null, alive = true, lastBlur = -1;
    const tick = (now) => {
      if (start == null) start = now;
      const el = now - start;
      const i = Math.floor(el / CYCLE), phase = el % CYCLE;
      T1.textContent = texts[i % texts.length];
      T2.textContent = texts[(i + 1) % texts.length];
      const f = phase < MORPH ? phase / MORPH : 1;
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; // easeInOut
      T1.style.opacity = String(1 - e);
      T2.style.opacity = String(e);
      const blur = (phase < MORPH ? Math.sin(Math.PI * f) * 9 : 0);
      if (B && Math.abs(blur - lastBlur) > 0.05) { B.setAttribute('stdDeviation', blur.toFixed(2)); lastBlur = blur; }
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [texts]);
  const textProps = {
    x: '50%', y: '52%', textAnchor: 'middle', dominantBaseline: 'central',
    fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize, letterSpacing: '-0.04em', fill: color,
  };
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden
      style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <defs>
        <filter id="ax-goo" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur ref={blurRef} in="SourceGraphic" stdDeviation="0" result="b" />
          <feColorMatrix in="b" type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
        </filter>
      </defs>
      <g filter="url(#ax-goo)">
        <text ref={t1} {...textProps} />
        <text ref={t2} {...textProps} />
      </g>
    </svg>
  );
}

/* ---- masthead ---- */
function Masthead({ t, mobile, onHome }) {
  const d = new Date();
  const ds = `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: mobile ? 18 : 20 }}>
      {/* 폰에서는 모프 로고를 빼고 날짜 줄만 둔다 — 고정바 1줄에 AX-it NOW가 이미
          있어 같은 이름이 두 번 나온다. */}
      {!mobile && (
        <div data-ax-logo role="button" tabIndex={0} aria-label={tx('nav.home')} onClick={onHome}
          onKeyDown={(e) => { if (onHome && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onHome(); } }}
          style={{ cursor: onHome ? 'pointer' : 'default' }}>
          <MorphingTitle texts={['AX-it', 'NOW']} color={t.hl} fontSize={56} width={360} height={72} />
        </div>
      )}
      <div className="ax-eyebrow" style={{ color: t.mute, marginTop: mobile ? 0 : 8 }}>{tx('masthead.daily_brief')} · {ds}</div>
    </div>
  );
}

/* ---- MiniCard: a deck thumbnail (mode: stack | fan | front) ---- */
function MiniCard({ card, i, mode, t, onEnter, onClick }) {
  const fan = mode !== 'stack';
  const front = mode === 'front';
  const w = front ? 182 : fan ? 132 : 92;
  const h = front ? 244 : fan ? 178 : 126;
  const x = fan ? (i - 2) * 96 : (i - 2) * 4;
  const rot = fan ? 0 : (i - 2) * 2.5;
  const z = front ? 99 : (fan ? 10 + i : i);
  return (
    <div className="ax-mini" onMouseEnter={() => onEnter(i)} onClick={(e) => onClick(i, e)} style={{
      width: w, height: h, zIndex: z, transform: `translateX(-50%) translateX(${x}px) rotate(${rot}deg)`,
      borderRadius: 13, overflow: 'hidden', cursor: 'pointer',
      background: t.feedSolid || t.feedBg, border: t.feedBorder,
      boxShadow: front ? '0 28px 60px -16px rgba(80,50,40,.55)' : '0 10px 24px -12px rgba(80,50,40,.5)',
    }}>
      <div style={{ position: 'relative', height: front ? '50%' : '46%', overflow: 'hidden' }}>
        {card.image ? (
          <img src={card.image} alt="" loading="eager" decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <React.Fragment>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg,#f6f2ec,#efe9e1)' }} />
            <div style={{ position: 'absolute', width: '84%', height: '92%', left: '10%', top: '8%', borderRadius: '50%',
              filter: 'blur(13px)', mixBlendMode: 'multiply', opacity: .85, background: `radial-gradient(circle,${card.accent},transparent 66%)` }} />
          </React.Fragment>
        )}
      </div>
      <div style={{ padding: front ? '13px 14px' : '8px 9px' }}>
        <div className="ax-eyebrow" style={{ fontSize: front ? 10 : 8, color: t.faint, marginBottom: front ? 7 : 4 }}>{card.tool}</div>
        <div className="ax-hl" style={{ fontSize: front ? 15 : 10.5, lineHeight: 1.3, color: t.hl,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{card.headline}</div>
        {front && <div className="ax-eyebrow" style={{ fontSize: 9, color: t.mute, marginTop: 12 }}>{card.source} · {tx('deck.click_to_open')}</div>}
      </div>
    </div>
  );
}

/* ---- DayDeck: one day — stacked deck + axis tick + date label. When `locked`
   (non-entitled viewer), the deck content is blurred (inner wrapper only — the
   deck frame/positioning stays crisp, same blur-an-inner-wrapper approach as
   LockedCard) and a small 🔒 badge sits on top, unblurred. Clicking any card in
   a locked deck is redirected by the caller's `onOpen` (WeeklyTimeline passes a
   version that opens SubscribeModal instead of the day when not entitled). ---- */
function DayDeck({ day, idx, t, isLast, expanded, hoveredCard, shift, onDayEnter, onCardEnter, onOpen, locked }) {
  const deckRef = useRef();
  const dow = axDate(day.date, 'weekday');
  const md = axDate(day.date, 'md');
  const handleClick = (ci) => {
    if (locked) { onOpen(day, ci, null); return; }
    const rects = Array.from(deckRef.current.querySelectorAll('.ax-mini')).map((el) => el.getBoundingClientRect());
    onOpen(day, ci, rects);
  };
  return (
    <div className="ax-day" tabIndex={0} style={{ flex: '1 1 0', transform: `translateX(${shift}px)`, zIndex: expanded ? 60 : 1 }}
      onMouseEnter={() => onDayEnter(idx)} onFocus={() => onDayEnter(idx)}>
      <div style={{ position: 'relative', width: 92, marginBottom: 22 }}>
        <div ref={deckRef} className="ax-deck" style={{ position: 'relative', width: 92, height: 126,
          filter: (expanded ? 'none' : 'grayscale(1) opacity(.5)') }}>
          <div aria-hidden={locked || undefined} style={{ height: '100%',
            filter: locked ? 'blur(7px) saturate(.7) brightness(.94)' : 'none' }}>
            {day.cards.map((c, i) => (
              <MiniCard key={i} card={c} i={i} t={t}
                mode={expanded ? (hoveredCard === i ? 'front' : 'fan') : 'stack'}
                onEnter={onCardEnter} onClick={handleClick} />
            ))}
          </div>
        </div>
        {locked && (
          <div aria-hidden style={{ position: 'absolute', top: -6, right: 2, width: 22, height: 22, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1,
            background: 'rgba(28,24,18,.82)', color: '#fff', zIndex: 65, boxShadow: '0 3px 10px -3px rgba(0,0,0,.5)',
            pointerEvents: 'none' }}>🔒</div>
        )}
      </div>
      <div className="ax-tick" style={{ width: 9, height: 9, borderRadius: '50%', background: t.hl,
        transform: expanded ? 'scale(1.55)' : 'none', boxShadow: '0 0 0 4px #f1ece4' }} />
      <div className="ax-daylabel" style={{ marginTop: 12, textAlign: 'center' }}>
        <div className="ax-hl" style={{ fontSize: 15, color: expanded ? t.hl : t.mute }}>{md}</div>
        <div className="ax-eyebrow" style={{ fontSize: 9, color: t.faint, marginTop: 2 }}>{dow}{isLast ? ' · ' + tx('deck.yesterday') : ''}</div>
      </div>
    </div>
  );
}

/* ---- Small dark pill badge — "Become a Pro" next to the Past Days heading. ---- */
function ProBadge({ onClick }) {
  return (
    <span role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', background: '#1c1a18', color: '#fff',
        fontFamily: 'Pretendard, system-ui', fontSize: 11.5, fontWeight: 600, letterSpacing: '.01em',
        padding: '5px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {tx('paywall.become_pro')}
    </span>
  );
}

/* 구독 행이 있는 사람에게 보이는 관리 링크 — 카드 변경·해지·영수증은 Paddle 포털에서
   한다. entitled가 아니라 hasSubscription으로 띄운다: 갱신이 실패해 기간이 끝난 순간이
   바로 카드를 고쳐야 하는 순간인데, 그때 링크가 사라지면 할 수 있는 게 없다. */
function ManageLink({ t }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <React.Fragment>
      <button disabled={busy} onClick={async () => {
        setBusy(true); setMsg('');
        try {
          const r = await fetch('/api/billing/portal', { credentials: 'same-origin' });
          const b = await r.json();
          if (b.url) { window.open(b.url, '_blank', 'noopener'); return; }
          setMsg(r.status === 404 ? tx('paywall.manage_no_subscription') : tx('paywall.manage_unavailable'));
        } catch {
          setMsg(tx('paywall.manage_unavailable'));
        } finally { setBusy(false); }
      }} className="ax-eyebrow" style={{ cursor: 'pointer', border: 'none', background: 'none',
        color: t.faint, textDecoration: 'underline', padding: 0 }}>
        {tx('paywall.manage')}
      </button>
      {msg && <div className="ax-eyebrow" style={{ marginTop: 4, color: t.faint }}>{msg}</div>}
    </React.Fragment>
  );
}

/* ---- WeeklyTimeline: 5-day axis; hover fans a deck + pushes neighbors. When
   `!entitled`, the whole archive is Pro-gated: every deck renders blurred with
   a 🔒 badge (see DayDeck), a "Become a Pro" pill sits next to the heading, the
   helper copy hints at the paywall, and any click (deck or badge) opens
   SubscribeModal instead of the day. ---- */
function WeeklyTimeline({ t, onOpen, days, entitled, hasSubscription }) {
  days = days || [];
  const [hd, setHd] = useState(null);   // hovered day index
  const [hc, setHc] = useState(null);   // hovered card index within the day
  const [showSubscribe, setShowSubscribe] = useState(false);
  const PUSH = 168;
  const enterDay = (i) => { setHd(i); setHc(null); };
  const clear = () => { setHd(null); setHc(null); };
  const handleOpen = entitled ? onOpen : () => setShowSubscribe(true);
  return (
    <section style={{ paddingTop: 92 }} onMouseLeave={clear}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <span className="ax-eyebrow" style={{ display: 'inline-block', color: t.mute, padding: '7px 16px',
          borderRadius: 100, border: t.cardBorder, background: t.cardSolid || t.cardBg }}>{tx('deck.past_days')}</span>
        <h2 className="ax-hl" style={{ fontSize: 30, lineHeight: 1.18, color: t.hl, margin: '18px 0 8px' }}>{tx('deck.title')}</h2>
        <p className="ax-body" style={{ fontSize: 15, color: t.body, margin: 0 }}>
          {entitled
            ? tx('deck.hint_desktop')
            : tx('deck.locked')}
        </p>
        <div style={{ marginTop: 12 }}>
          {hasSubscription ? <ManageLink t={t} />
            : !entitled ? <ProBadge onClick={() => setShowSubscribe(true)} /> : null}
        </div>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', padding: '178px 40px 0' }}>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 178 + 148, height: 1, background: t.rule, zIndex: 0 }} />
        {days.map((day, i) => {
          const shift = hd == null ? 0 : (i < hd ? -PUSH : i > hd ? PUSH : 0);
          return (
            <DayDeck key={day.date} day={day} idx={i} t={t} isLast={i === days.length - 1}
              expanded={hd === i} hoveredCard={hd === i ? hc : null} shift={shift}
              onDayEnter={enterDay} onCardEnter={setHc} onOpen={handleOpen} locked={!entitled} />
          );
        })}
      </div>
      {showSubscribe && <SubscribeModal t={t} onClose={() => setShowSubscribe(false)} />}
    </section>
  );
}

/* ---- HeroDeckIntro: the chosen day's deck cascading into the hero ---- */
function HeroDeckIntro({ day, cardIdx, t, onDone, mobile }) {
  const [go, setGo] = useState(false);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    const f = setTimeout(() => setFade(true), 680);
    const dn = setTimeout(onDone, 1080);
    return () => { cancelAnimationFrame(a); clearTimeout(f); clearTimeout(dn); };
  }, []);
  const order = day.cards.map((_, i) => i).filter((i) => i !== cardIdx).concat(cardIdx);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'calc(100% - 66px)',
      borderRadius: t.radius, overflow: 'hidden', pointerEvents: 'none', opacity: fade ? 0 : 1, transition: 'opacity .4s ease' }}>
      {order.map((i, oi) => {
        const isClk = i === cardIdx;
        const dy = go ? 0 : 90;
        const sc = go ? 1 : 0.92;
        const op = go ? (isClk ? 1 : (fade ? 0 : 1)) : 0;
        return (
          <div key={i} style={{ position: 'absolute', inset: 0, transform: `translateY(${dy}px) scale(${sc})`, opacity: op,
            transition: `transform .6s cubic-bezier(.2,.8,.25,1) ${oi * 0.07}s, opacity .5s ease ${oi * 0.07}s` }}>
            <div style={{ height: '100%', borderRadius: t.radius, overflow: 'hidden',
              background: t.cardSolid || t.cardBg,
              border: t.cardBorder, boxShadow: t.cardShadow }}>
              <LayoutEditorial item={day.cards[i]} index={i} total={day.cards.length} active={isClk} t={t} mobile={mobile} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- useIsMobile: reactive max-width media query (no hover on touch) ---- */
function useIsMobile(maxW) {
  const q = `(max-width:${maxW}px)`;
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    if (mq.addEventListener) { mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }
    mq.addListener(on); return () => mq.removeListener(on);
  }, [q]);
  return m;
}

/* ---- MobileFilmstrip: all past cards as one long horizontal swipe. Days run
   chronologically left→right (past → yesterday); the strip starts scrolled to the
   RIGHT so yesterday is shown first and swiping left travels into the past. Each
   day is a block with its date pinned above its cards. Tap a card → opens it large
   in the hero (same flow as the desktop deck). Replaces WeeklyTimeline on mobile. ---- */
function MobileFilmstrip({ t, onOpen, days, entitled, hasSubscription }) {
  days = days || [];
  const stripRef = useRef();
  const [showSubscribe, setShowSubscribe] = useState(false);
  const lastDate = days.length ? days[days.length - 1].date : null;
  // Start at the right edge: yesterday (the newest day) is shown first.
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days.length]);
  const fmt = (date) => {
    return { md: axDate(date, 'md'), dow: axDate(date, 'weekday') };
  };
  const handleOpen = entitled ? onOpen : () => setShowSubscribe(true);
  return (
    <section style={{ paddingTop: 30 }}>
      <div style={{ textAlign: 'center', marginBottom: 6, padding: '0 16px' }}>
        <span className="ax-eyebrow" style={{ display: 'inline-block', color: t.mute, padding: '6px 14px',
          borderRadius: 100, border: t.cardBorder, background: t.cardSolid || t.cardBg }}>{tx('deck.past_days')}</span>
        <h2 className="ax-hl" style={{ fontSize: 23, lineHeight: 1.2, color: t.hl, margin: '13px 0 6px' }}>{tx('deck.title')}</h2>
        <p className="ax-body" style={{ fontSize: 13.5, color: t.body, margin: 0 }}>
          {entitled ? tx('deck.hint_mobile')
            : tx('deck.locked')}
        </p>
        <div style={{ marginTop: 10 }}>
          {hasSubscription ? <ManageLink t={t} />
            : !entitled ? <ProBadge onClick={() => setShowSubscribe(true)} /> : null}
        </div>
      </div>
      <div className="ax-strip" ref={stripRef}>
        {days.map((day) => {
          const { md, dow } = fmt(day.date);
          const isYesterday = day.date === lastDate;
          return (
            <div className="ax-day-block" key={day.date} style={{ position: 'relative' }}>
              <div className="ax-strip-datehead" style={{ background: t.feedSolid, border: t.cardBorder }}>
                <span className="ax-hl" style={{ fontSize: 14, color: t.hl, lineHeight: 1 }}>{md}</span>
                <span className="ax-eyebrow" style={{ fontSize: 8.5, color: t.faint }}>{dow}{isYesterday ? ' · ' + tx('deck.yesterday') : ''}</span>
              </div>
              <div aria-hidden={!entitled || undefined} className="ax-day-cards"
                style={{ filter: entitled ? 'none' : 'blur(7px) saturate(.7) brightness(.94)' }}>
                {day.cards.map((c, ci) => (
                  <button key={ci} className="ax-strip-card" onClick={() => handleOpen(day, ci)} style={{
                    width: 150, background: t.feedSolid, border: t.feedBorder,
                    boxShadow: '0 10px 24px -14px rgba(80,50,40,.5)' }}>
                    <div style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', background: '#efe9e1' }}>
                      {c.image ? (
                        <img src={c.image} alt="" loading="eager" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <React.Fragment>
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg,#f6f2ec,#efe9e1)' }} />
                          <div style={{ position: 'absolute', width: '84%', height: '92%', left: '10%', top: '8%', borderRadius: '50%',
                            filter: 'blur(13px)', mixBlendMode: 'multiply', opacity: .85, background: `radial-gradient(circle,${c.accent},transparent 66%)` }} />
                        </React.Fragment>
                      )}
                    </div>
                    <div style={{ padding: '10px 11px 12px' }}>
                      <div className="ax-eyebrow" style={{ fontSize: 8.5, color: t.faint, marginBottom: 5 }}>{c.tool}</div>
                      {/* reserve 3 lines so every card is the same height regardless of headline length */}
                      <div className="ax-hl" style={{ fontSize: 12.5, lineHeight: 1.32, color: t.hl, height: 'calc(1.32em * 3)',
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.headline}</div>
                    </div>
                  </button>
                ))}
              </div>
              {!entitled && (
                <div aria-hidden style={{ position: 'absolute', top: 2, right: 6, width: 24, height: 24, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1,
                  background: 'rgba(28,24,18,.82)', color: '#fff', zIndex: 5, boxShadow: '0 3px 10px -3px rgba(0,0,0,.5)',
                  pointerEvents: 'none' }}>🔒</div>
              )}
            </div>
          );
        })}
      </div>
      {showSubscribe && <SubscribeModal t={t} onClose={() => setShowSubscribe(false)} />}
    </section>
  );
}

/* ---- SectionTabs: Design / Music / Movies / Games / Books — switches the hero deck.
   Pro 구독자에게는 맨 앞에 Insights(지식 네트워크) 진입 pill이 구분선과 함께 붙는다. ---- */
function SectionTabs({ sections, order, active, onSelect, t, flush, showInsights, insightsActive, onInsights, actions }) {
  const tabs = (
    <div className="ax-tabs" role="tablist" aria-label={tx('nav.sections')}
      style={flush ? { margin: 0, padding: 0, justifyContent: 'flex-start' } : undefined}>
      {showInsights && (
        <React.Fragment>
          <button role="tab" aria-selected={!!insightsActive} className="ax-tab" onClick={onInsights}
            title={tx('insights.tab_title')}
            style={insightsActive
              ? { background: '#7928ca', color: '#fff', border: '1px solid #7928ca' }
              : { background: '#f3ecfb', color: '#6a1fb0', border: '1px solid #7928ca' }}>
            {tx('insights.tab_label')}
          </button>
          <span aria-hidden style={{ alignSelf: 'center', color: t.rule, fontSize: 15, padding: '0 3px', userSelect: 'none' }}>|</span>
        </React.Fragment>
      )}
      {order.map((s) => {
        const on = s === active;
        const label = (sections[s] && sections[s].label) || s;
        return (
          <button key={s} role="tab" aria-selected={on} className="ax-tab" onClick={() => onSelect(s)}
            style={on
              ? { background: t.hl, color: '#fff', border: '1px solid ' + t.hl }
              /* 불투명 배경 + 불투명 글자색. 투명 배경 위의 반투명 글자는 뒤의 흐린
                 색 덩어리가 비쳐 번져 보였고, 크롬도 ClearType을 쓸 수 없었다. */
              : { background: t.cardSolid || '#fbf8f3', color: t.muteSolid || t.mute,
                  border: '1px solid ' + t.rule }}>
            {label}
          </button>
        );
      })}
    </div>
  );
  if (!actions) return tabs;
  /* 카테고리 줄 오른쪽 끝에 세로 구분선을 긋고 그 너머에 Login·Pro·지구본을 둔다.
     버튼은 i18n.js가 이 자리로 옮겨 담는다. 지난번엔 버튼을 position:static으로
     바꿔 담았다가 Pro의 빛 쓸기와 지구본의 select가 기준점을 잃었다 — 이번엔
     relative를 유지한 채 자리만 옮긴다. */
  return (
    <div className="ax-navrow">
      {tabs}
      <span aria-hidden className="ax-navdiv" style={{ background: t.rule }} />
      <div id="ax-actions-d" className="ax-actions" />
    </div>
  );
}

/* ---- MobileStickyHeader: a compact two-row bar that curtains down from the top once
   the real masthead + tabs scroll out of view, and curtains up (fast) when they return.
   Row 1: a STATIC "AX-it NOW" title (no goo morph) on the left + Daily Brief on
   the right. Row 2: the same section tabs. Mobile only. ---- */
function MobileStickyHeader({ t, stuckTitle, stuckTabs, ds, gutter, sections, order, active, onSelect, onTitle, showInsights, insightsActive, onInsights }) {
  const titleRef = useRef(); const barRef = useRef();
  const [barH, setBarH] = useState(96);
  // 아래 본문이 바에 깔리지 않도록 같은 높이의 자리를 만든다. Login·Pro·지구본은
  // React 밖(i18n.js)에서 나중에 꽂히므로 높이가 도중에 바뀐다 — ResizeObserver로
  // 바 전체를 지켜보며 다시 잰다.
  useEffect(() => {
    const m = () => { if (barRef.current) setBarH(barRef.current.offsetHeight); };
    m(); window.addEventListener('resize', m);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(m);
      if (barRef.current) ro.observe(barRef.current);
    }
    return () => { window.removeEventListener('resize', m); if (ro) ro.disconnect(); };
  }, []);
  const g = Math.max(12, Math.round(gutter || 14));   // left/right inset = the card's edges
  /* 폰의 유일한 고정 바. 늘 보인다 — 예전에는 스크롤해야 내려왔고, 그 위에 별도
     상단 바까지 생기면서 둘이 겹쳐 레이아웃이 깨졌다. 1줄은 로고와 Login·Pro·
     지구본(i18n.js가 #ax-actions-m에 넣는다), 2줄은 카테고리 가로 스크롤. */
  return (
    <React.Fragment>
    <div ref={barRef} style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 120,
      background: t.cardSolid || '#fbf8f3', borderBottom: `1px solid ${t.rule}`,
      boxShadow: stuckTitle ? '0 6px 18px -12px rgba(60,40,30,.5)' : 'none',
      transition: 'box-shadow .25s ease' }}>
      {/* row 1 — 로고(왼쪽) + 버튼 묶음(오른쪽) */}
      <div ref={titleRef} style={{ padding: `11px ${g}px 9px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div onClick={onTitle} style={{ cursor: onTitle ? 'pointer' : 'default', flex: '0 0 auto',
          fontFamily: 'var(--font-sans)', fontWeight: 700, letterSpacing: '-0.03em', fontSize: 19,
          color: t.hl, whiteSpace: 'nowrap', lineHeight: 1 }}>AX-it NOW</div>
        <div id="ax-actions-m" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }} />
      </div>
      {/* row 2 — section tabs, flush to the same left edge as the title and the card */}
      <div style={{ padding: `4px ${g}px 11px` }}>
        <SectionTabs sections={sections} order={order} active={active} onSelect={onSelect} t={t} flush
          showInsights={showInsights} insightsActive={insightsActive} onInsights={onInsights} />
      </div>
    </div>
    <div aria-hidden style={{ height: barH }} />
    </React.Fragment>
  );
}

/* ---- ThemedPage: section tabs + hero carousel + weekly deck timeline (one theme) ---- */
/* ---- InsightsView (Pro 전용): 전 분야 뉴스 지식 네트워크 ----
   상단 2분할 [3D 네트워크 창 | 클릭된 노드의 뉴스 카드] + 하단 연관 뉴스
   카루셀(본 사이트 과거 5일 필름스트립 형식, 넘치면 가로 스크롤).
   네트워크는 3d-force-graph의 구(球) 레이아웃 — 선택이 없으면 지구본처럼
   천천히 자전하고, 노드를 선택하면 멈춘다. 카메라는 위치 고정: 노드를
   클릭해도 화면이 따라 움직이지 않고, 줌은 항상 처음 중심점 기준(팬 비활성).
   메인 카드는 히어로 프레임 안의 FlipCard 그대로(Read/Share, 플립 시
   /api/premium/full 전문 + SourceLine). */
const INSIGHTS_COLORS = {
  design: '#0070f3', music: '#eb367f', movies: '#7928ca', games: '#2ec5c5',
  books: '#f5a623', gadgets: '#ff5a4d', science: '#3aa655', politics: '#9aa8c7',
};
const insightsLabel = (sec) => tx('insights.legend_' + sec);   // legend label per section key
const INSIGHTS_CARD_W = 384;    // 뉴스 카드 열 너비
const INSIGHTS_GAP = 14;
const INSIGHTS_H = Math.round(INSIGHTS_CARD_W * 760 / 480);   // 카드(480:760) 높이 = 두 칸 공통 높이
const INSIGHTS_DIM = 'rgba(128,136,162,0.38)';   // 포커스 밖 노드·엣지 — 배경보다 살짝 밝게 + 반투명(시야 확보)

function insightsLoadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function InsightsView({ t, mobile, entitled }) {
  // 프리미엄 게이트: 비구독자는 노드 1개까지 자유롭게 탐색, 다른 노드를
  // 선택하려는 순간 구독 팝업. (그래프 자체는 모두에게 공개)
  const entitledRef = useRef(entitled); entitledRef.current = entitled;
  const freeSelRef = useRef(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const gateRef = useRef(null);
  const gateSelect = (id) => {
    if (entitledRef.current) return true;
    if (!freeSelRef.current || freeSelRef.current === id) { freeSelRef.current = id; return true; }
    setShowSubscribe(true);
    return false;
  };
  gateRef.current = gateSelect;
  const graphBoxRef = useRef();
  const graphRef = useRef(null);       // ForceGraph3D instance
  const dataRef = useRef({ nb: {}, adj: {}, card: {}, nodeById: {} });
  const selRef = useRef(null);
  const hoverRef = useRef(null);       // 그래프 위 직접 호버
  const pulseRef = useRef(null);       // 카루셀 카드 호버 → 노드 확대 대상 id
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(null);        // 선택된 노드 id
  const [, bump] = useState(0);                // D 채운 뒤 패널 리렌더용
  // 카드 칸은 히어로 원본(480×760)을 통째로 스케일해서 넣는다 — 타이포·줄바꿈이
  // 본 사이트와 동일해져 긴 제목에도 Read 버튼이 잘리지 않는다.
  const cardBoxRef = useRef();
  const [cardScale, setCardScale] = useState(INSIGHTS_CARD_W / 480);
  useEffect(() => {
    const box = cardBoxRef.current; if (!box) return;
    const upd = () => setCardScale((box.clientWidth || INSIGHTS_CARD_W) / 480);
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  const searchRef = useRef(null);              // 검색 매치 id Set (null = 검색 꺼짐)
  const hiddenRef = useRef(new Set());         // 범례에서 끈 카테고리(섹션) — accessor가 읽는다
  const [hiddenSecs, setHiddenSecs] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const stripRef = useRef();
  const [stripNav, setStripNav] = useState({ l: false, r: false });

  useEffect(() => {
    let alive = true;
    const jobs = [];
    if (!window.ForceGraph3D) jobs.push(insightsLoadScript('/vendor/3d-force-graph.min.js'));
    if (!window.AX_ARCHIVE) jobs.push(insightsLoadScript('/archive-data.js?v=' + Date.now()));
    if (!window.AX_GRAPH) jobs.push(insightsLoadScript('/archive-graph.js?v=' + Date.now()));
    Promise.all(jobs).then(() => { if (alive) setReady(true); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready || !graphBoxRef.current) return;
    const el = graphBoxRef.current;
    const D = dataRef.current;
    D.card = {}; (window.AX_ARCHIVE || []).forEach((c) => { D.card[c.section + '/' + c.id] = c; });
    const GD = window.AX_GRAPH || { nodes: [], links: [] };
    D.nb = {}; D.adj = {}; D.nodeById = {};
    GD.nodes.forEach((n) => { D.nodeById[n.id] = n; });
    GD.links.forEach((l) => {
      const s = l.source.id || l.source, tg = l.target.id || l.target;
      (D.nb[s] = D.nb[s] || {})[tg] = 1; (D.nb[tg] = D.nb[tg] || {})[s] = 1;
      (D.adj[s] = D.adj[s] || []).push({ id: tg, w: l.w, kw: l.kw });
      (D.adj[tg] = D.adj[tg] || []).push({ id: s, w: l.w, kw: l.kw });
    });
    window.__axi = { D };   // 콘솔 검증용 (인접·카드 매핑; 아래에서 g도 붙는다)
    bump((x) => x + 1);     // D가 채워졌으니 카루셀(최신 카드)을 다시 그린다
    // 자전 중엔 노드가 '정지한 커서' 밑을 지나가며 호버가 계속 발동한다 —
    // 실제 포인터 이동(600ms 이내)이 있을 때만 호버를 인정한다.
    let lastPointerMove = 0;
    const onPtrMove = () => { lastPointerMove = performance.now(); };
    el.addEventListener('pointermove', onPtrMove, { passive: true });
    const pointerFresh = () => performance.now() - lastPointerMove < 600;
    const focus = () => (hoverRef.current ? hoverRef.current.id : selRef.current);
    // 선택 클러스터와 호버 프리뷰 클러스터는 공존 — 호버로 기존 선택이 회색이
    // 되지 않고, 다른 노드를 '클릭'해야 선택이 교체된다.
    const inCluster = (center, id) => !!(center && (id === center || (D.nb[center] && D.nb[center][id])));
    let dragId = null;   // 드래그 중인 노드 — 호버와 동일하게 클러스터·엣지 하이라이트
    const hovId = () => (hoverRef.current ? hoverRef.current.id : dragId);
    const secColor = (n) => INSIGHTS_COLORS[n.section] || '#8a8377';

    const g = ForceGraph3D({ controlType: 'orbit', rendererConfig: { antialias: true, powerPreference: 'high-performance' } })(el)
      .graphData({ nodes: GD.nodes.map((n) => Object.assign({}, n)), links: GD.links.map((l) => ({ source: l.source, target: l.target, w: l.w, kw: l.kw })) })
      .nodeId('id')
      .nodeRelSize(3.4)
      .nodeVal((n) => Math.max(1, n.val || 1))
      .nodeOpacity(1)
      .nodeResolution(12)         // 매끄러운 구 (드로우콜 최적화로 여유 확보)
      .nodeVisibility((n) => !hiddenRef.current.has(n.section))   // 범례 토글
      // 선택 중에도 배경 노드는 회색으로 떠 있고(색만 dim), 엣지만 클러스터
      // 것으로 제한된다(hairball은 선택 중 숨김 — fx 루프 참고).
      .enableNodeDrag(true)       // 노드를 잡아 끌면 연결 노드들이 탄성 있게 딸려온다 (Second-Brain식)
      .warmupTicks(60)
      // 링크 8천 개를 개별 오브젝트로 그리면 드로우콜 폭발 → 평상시 hairball은
      // 배칭된 LineSegments 하나가 담당하고, lib에는 포커스(선택·호버·검색)
      // 관련 소수의 컬러 엣지만 보이게 한다. (accessor는 init 뒤에 주입 — 아래
      // realLinkVisibility 참고. 초기엔 첫 링크 하나만 보이게 해 Line 클래스
      // 템플릿을 확보한다.)
      .linkVisibility(() => false)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .nodeColor((n) => {
        const sset = searchRef.current;
        if (sset) return sset.has(n.id) ? secColor(n) : INSIGHTS_DIM;   // 검색 모드
        const f = selRef.current, h = hovId();
        if (!f && !h) return secColor(n);
        return (inCluster(f, n.id) || inCluster(h, n.id)) ? secColor(n) : INSIGHTS_DIM;
      })
      .linkColor((l) => {
        const sset = searchRef.current;
        const s0 = l.source.id || l.source, t0 = l.target.id || l.target;
        if (sset) {
          if (sset.has(s0) && sset.has(t0)) { const sn = D.nodeById[s0]; return sn ? secColor(sn) : '#8a8377'; }
          return INSIGHTS_DIM;
        }
        const f = selRef.current, h = hovId(), pid = pulseRef.current;
        const s = l.source.id || l.source, tg = l.target.id || l.target;
        if (pid && f && ((s === f && tg === pid) || (s === pid && tg === f))) {
          const pn = D.nodeById[pid];
          return pn ? secColor(pn) : '#8a8377';
        }
        if (f && (s === f || tg === f)) {
          const fn = D.nodeById[f];
          return fn ? secColor(fn) : '#8a8377';
        }
        if (h && (s === h || tg === h)) {
          const hn = D.nodeById[h];
          return hn ? secColor(hn) : '#8a8377';
        }
        return INSIGHTS_DIM;
      })
      .linkOpacity(0)   // 부트스트랩 링크가 안 보이게 — extras 준비 후 0.85로 올린다
      .linkWidth((l) => {
        const f = selRef.current, h = hovId(), pid = pulseRef.current;
        const s = l.source.id || l.source, tg = l.target.id || l.target;
        if (pid && f && ((s === f && tg === pid) || (s === pid && tg === f))) return 4;
        if (f && (s === f || tg === f)) return 2.6;
        return (h && (s === h || tg === h)) ? 2.2 : 0;
      })
      // (연결 애니메이션은 lib 파티클 대신 아래 커스텀 흰 대시 펄스가 담당)
      .nodeLabel((n) => {
        if (window.innerWidth < 760) return '';   // 모바일(터치): 호버/탭 스몰카드 프리뷰 없음
        if (!pointerFresh()) return '';           // 자전에 의한 통과 호버엔 툴팁 없음
        const c = D.card[n.id];
        if (!c) return n.label;
        const chip = '<span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-family:ui-monospace,Menlo,monospace;color:#fff;background:' + secColor(n) + ';border-radius:999px;padding:2px 7px;">' + (c.tool || n.section) + '</span>';
        const img = c.image ? '<img src="/' + c.image + '" style="flex:0 0 76px;width:76px;height:56px;border-radius:8px;object-fit:cover;background:#e8e2d6" />' : '';
        return '<div style="display:flex;gap:10px;align-items:flex-start;width:320px;background:#fff;border:1px solid #e6dfd3;border-radius:14px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.10);font-family:Pretendard,sans-serif;color:#171717;white-space:normal;text-align:left">' +
          img + '<div style="min-width:0">' +
          '<div style="display:flex;gap:7px;align-items:center;margin-bottom:3px">' + chip +
            '<span style="font-size:10.5px;color:#8a8377">' + n.date.replace(/-/g, '.') + ' · ' + (c.source || '') + '</span></div>' +
          '<div style="font-size:13px;font-weight:700;line-height:1.35">' + (c.headline || '').replace(/\n/g, ' ') + '</div>' +
          '<div style="font-size:11.5px;color:#57534a;line-height:1.45;margin-top:2px">' + (c.body || '') + '</div>' +
          '</div></div>';
      })
      .onNodeHover((n) => {
        const next = pointerFresh() ? (n || null) : null;
        const prevId = hoverRef.current && hoverRef.current.id;
        const nextId = next && next.id;
        if (prevId === nextId) return;
        hoverRef.current = next;
        el.style.cursor = next ? 'pointer' : 'default';
        pauseSpin(!!next);   // 노드 위에서는 자전을 멈춘다
        restyle();
      })
      .onNodeDrag((n) => {
        const id = n ? n.id : null;
        if (id !== dragId) { dragId = id; restyle(); }
      })
      .onNodeDragEnd(() => {
        if (dragId) { dragId = null; restyle(); }
      })
      .onNodeClick((n) => {
        if (!n) return;
        if (gateRef.current && !gateRef.current(n.id)) return;   // 비구독 2번째 노드 → 구독 팝업
        selRef.current = n.id; setSel(n.id);
        setRotate(false);          // 노드 선택 → 자전 멈춤
        orientLinks(n.id);         // 신호 파티클이 바깥으로 흐르게 방향 정렬
        faceNode(n);               // 선택 노드가 정면에 오도록 구를 돌린다
        restyle();
      })
      .onBackgroundClick(() => {   // 빈 곳 클릭 → 선택 해제 + 자전 재개
        selRef.current = null; setSel(null);
        setRotate(true);
        restyle();
      })
      .width(el.clientWidth).height(el.clientHeight)
      .cooldownTicks(90);

    // 실제 링크 가시성: 포커스(선택·호버·검색) 관련 엣지만 lib이 그린다
    const secOfId = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('/')) : '');
    const realLinkVisibility = (l) => {
      const s = l.source.id || l.source, tg = l.target.id || l.target;
      const hid = hiddenRef.current;
      if (hid.size && (hid.has(secOfId(s)) || hid.has(secOfId(tg)))) return false;
      const sset = searchRef.current;
      if (sset) return sset.has(s) && sset.has(tg);
      const f = selRef.current, h = hovId(), pid = pulseRef.current;
      if (f && (s === f || tg === f || s === pid || tg === pid)) return true;
      return !!(h && (s === h || tg === h));
    };
    // 부트스트랩: 첫 링크 하나만 보이게 → Line 오브젝트가 생기면 그 클래스로
    // baseLines(hairball)를 만들고 실제 accessor로 교체한다 (initSceneExtras에서).
    const firstLink = g.graphData().links[0];
    g.linkVisibility((l) => l === firstLink);
    // 스타일 accessor 재평가 트리거 (vasturiano 권장 패턴)
    const restyle = () => { g.nodeColor(g.nodeColor()).nodeVisibility(g.nodeVisibility()).linkColor(g.linkColor()).linkWidth(g.linkWidth()).linkVisibility(g.linkVisibility()); };
    // 지구본 자전 — OrbitControls autoRotate. 줌은 항상 타깃(초기 중심점) 기준,
    // 팬을 꺼서 중심점이 흐트러지지 않게 한다.
    try { g.renderer().setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); } catch (e) {}
    const controls = g.controls();
    // 시점을 적도 부근으로 제한 — 극지방에서 내려다보면 Y축 자전이 반시계
    // 회오리처럼 보인다. 상하 궤도각을 54°~126°로 클램프해 지구본처럼
    // 좌우로 흐르는 자전을 유지한다.
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.7;
    // 클릭한 노드가 정면에 오도록 — 중심·거리는 그대로 두고 카메라만 궤도 회전
    const faceNode = (node) => {
      try {
        if (node.x == null) return;
        const V3 = g.camera().position.constructor;   // THREE.Vector3 (번들 내부 클래스)
        const tgt = controls.target;
        const dir = new V3(node.x - tgt.x, node.y - tgt.y, node.z - tgt.z);
        if (dir.lengthSq() < 1) return;   // 중심 근처 노드는 회전 불필요
        dir.normalize();
        // 수직 성분 클램프 — 극 노드를 향해도 카메라는 적도권에 남는다
        const maxY = 0.55;
        if (Math.abs(dir.y) > maxY) {
          const h = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1e-6;
          const s = Math.sqrt(1 - maxY * maxY) / h;
          dir.x *= s; dir.z *= s; dir.y = Math.sign(dir.y) * maxY;
        }
        const dist = g.camera().position.clone().sub(tgt).length();
        g.cameraPosition(
          { x: tgt.x + dir.x * dist, y: tgt.y + dir.y * dist, z: tgt.z + dir.z * dist },
          { x: tgt.x, y: tgt.y, z: tgt.z }, 800);
      } catch (e) {}
    };
    g.__faceNode = faceNode;
    // 파티클은 source→target으로만 흐른다 — 선택 노드가 target인 엣지는 참조를
    // 스왑해 신호가 항상 선택 노드에서 바깥으로 나가게 한다(힘 계산은 대칭이라 무해).
    const orientLinks = (fid) => {
      g.graphData().links.forEach((l) => {
        const tg = l.target && (l.target.id || l.target);
        if (tg === fid) { const tmp = l.source; l.source = l.target; l.target = tmp; }
      });
    };
    g.__orientLinks = orientLinks;
    controls.enablePan = false;
    // 자전 속도 — 노드에 커서가 닿으면 즉시 멈추고, 커서가 떠나면 원래 속도까지
    // 서서히 올린다. 멈춤이 즉각적이어야 겨냥한 노드가 커서 밑에서 미끄러지지
    // 않고, 재가동이 점진적이어야 화면이 덜컥 튀지 않는다. 실제 속도 적용은
    // 프레임 루프(fxLoop)가 맡는다.
    const SPIN_SPEED = 0.55;
    const SPIN_RAMP_MS = 1200;
    let spinRamp = 1;          // 0 = 정지, 1 = 원래 속도
    let spinPaused = false;    // 호버로 인한 일시정지
    controls.autoRotateSpeed = SPIN_SPEED;
    const pauseSpin = (on) => {
      if (spinPaused === on) return;
      spinPaused = on;
      if (on) { spinRamp = 0; controls.autoRotateSpeed = 0; }   // 멈춤은 즉시
    };
    const setRotate = (on) => { controls.autoRotate = on && !selRef.current; };
    setRotate(true);
    g.__setRotate = setRotate; g.__restyle = restyle;   // 카루셀 핸들러에서 사용
    let fitted = false;
    let fitDist = 0;   // fit 직후 카메라 거리 — 줌인 판정 기준
    g.onEngineStop(() => {
      if (fitted) return;
      fitted = true;
      // 줌아웃(zoomToFit) 없이 — 노드가 등장한 초기 프레이밍 그대로 자전을
      // 시작한다. 카메라는 일절 건드리지 않고 안개·기준 거리만 보정.
      setTimeout(() => {
        try {
          const tgt = controls.target, cam = g.camera();
          const dist = cam.position.distanceTo(tgt);
          fitDist = dist;
          let R = 0;
          g.graphData().nodes.forEach((n) => {
            const d2 = (n.x || 0) ** 2 + (n.y || 0) ** 2 + (n.z || 0) ** 2;
            if (d2 > R) R = d2;
          });
          R = Math.sqrt(R);
          const fog = g.scene().fog;
          if (fog) { fog.near = Math.max(50, dist - R * 0.1); fog.far = dist + R * 1.8; }
        } catch (e) {}
      }, 700);
    });
    graphRef.current = g;
    window.__axi.g = g;   // 콘솔 검증용
    // 상시 이펙트 루프 — 선택된 노드와 이웃은 살짝 커진 채 깜빡이고(스케일·투명도
    // 오실레이션), 카루셀 호버 노드는 더 크게. 나머지는 1로 부드럽게 복귀.
    // 평상시 링크 hairball(옅고 얇은 기본 엣지선) — 전체를 드로우콜 1개로.
    // 번들이 THREE를 전역에 노출하지 않으므로, 씬에 이미 있는 라인·메시 오브젝트에서
    // 클래스(BufferGeometry·BufferAttribute·LineBasicMaterial·Line)를 역추출해 만든다.
    // isLineSegments 플래그를 세우면 렌더러가 gl.LINES(쌍 단위)로 그린다.
    let baseLines = null;
    let extrasReady = false;
    // 흰 빛 대시 펄스: 선택 엣지를 따라 '점선 하나 길이'의 흰 실린더가
    // 천천히(한 사이클 ~3초) 한 번에 하나씩 흘러간다. 실린더 클래스는
    // 포커스 엣지(굵은 링크)가 만든 CylinderGeometry 메시에서 역추출.
    let pulsePool = null;
    const ensurePulsePool = () => {
      if (pulsePool) return true;
      try {
        let cyl = null;
        g.scene().traverse((o) => {
          if (!cyl && o.isMesh && o.geometry && o.geometry.type === 'CylinderGeometry') cyl = o;
        });
        if (!cyl) return false;
        const GeoC = cyl.geometry.constructor, MeshC = cyl.constructor, MatC = cyl.material.constructor;
        pulsePool = [];
        for (let i = 0; i < 16; i++) {
          const m = new MeshC(new GeoC(1, 1, 1, 6),
            new MatC({ color: 0xffffff, transparent: true, opacity: 0.92 }));
          // 베이지(밝은) 배경에선 가산 블렌딩이 안 보인다 — 일반 블렌딩 +
          // 엣지 색을 밝게 틴트한 빛(updatePulses에서 엣지별로 색 지정)
          m.material.depthWrite = false;
          m.visible = false; m.raycast = () => {}; m.frustumCulled = false;
          g.scene().add(m); pulsePool.push(m);
        }
        return true;
      } catch (e) { return false; }
    };
    const updatePulses = (now) => {
      const f = selRef.current;
      if (!f) { if (pulsePool) pulsePool.forEach((m) => { m.visible = false; }); return; }
      if (!ensurePulsePool()) return;
      const V3 = g.camera().position.constructor;
      const up = new V3(0, 1, 0);
      const t = (now % 3000) / 3000;            // 한 사이클 3초 — 천천히
      const DASH = 0.16;                        // 엣지 길이의 16% = 점선 하나 길이
      let i = 0;
      const links = g.graphData().links;
      for (let k = 0; k < links.length && i < pulsePool.length; k++) {
        const l = links[k];
        const s = l.source, tg = l.target;
        if (typeof s !== 'object' || typeof tg !== 'object') continue;
        if (s.id !== f && tg.id !== f) continue;
        const from = s.id === f ? s : tg, to = s.id === f ? tg : s;   // 선택 노드에서 바깥으로
        const t2 = Math.min(1, t + DASH);
        const ax = from.x + (to.x - from.x) * t, ay = from.y + (to.y - from.y) * t, az = from.z + (to.z - from.z) * t;
        const bx = from.x + (to.x - from.x) * t2, by = from.y + (to.y - from.y) * t2, bz = from.z + (to.z - from.z) * t2;
        const m = pulsePool[i++];
        const dir = new V3(bx - ax, by - ay, bz - az);
        const len = dir.length();
        if (len < 0.5) { m.visible = false; continue; }
        m.visible = true;
        m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        // 엣지에 딱 붙는 굵기 — 별도 물체가 아니라 엣지 그 구간이 밝아진 것처럼
        m.scale.set(1.8, len, 1.8);
        m.quaternion.setFromUnitVectors(up, dir.normalize());
        // 엣지 원색을 30%만 밝힌 선명한 발광색 (기본 엣지는 opacity 0.5로 차분)
        const other = s.id === f ? tg : s;
        const hex = INSIGHTS_COLORS[other.section] || '#8a8377';
        const v = parseInt(hex.slice(1), 16);
        const mix = (c) => (c + (255 - c) * 0.3) / 255;
        if (m.material.color && m.material.color.setRGB)
          m.material.color.setRGB(mix((v >> 16) & 255), mix((v >> 8) & 255), mix(v & 255));
        if (m.material.emissive && m.material.emissive.copy) m.material.emissive.copy(m.material.color);
        // 끝에 다다르면 서서히 사라졌다가 다시 시작
        m.material.opacity = t > 0.86 ? Math.max(0, (1 - t) / 0.14) : 1;
      }
      for (; i < pulsePool.length; i++) pulsePool[i].visible = false;
    };
    const initSceneExtras = () => {
      try {
        let lineObj = null, meshMat = null;
        g.scene().traverse((o) => {
          if (!lineObj && o.isLine) lineObj = o;
          if (!meshMat && o.isMesh && o.material && o.material.color) meshMat = o.material;
        });
        if (meshMat && !g.scene().fog) {
          const ColorC = meshMat.color.constructor;   // THREE.Color
          // 선형 안개(duck-type) — 구 앞면(near 안쪽)은 100% 원색, 뒷면만 배경으로
          // 가라앉는다. near/far는 fit 후 카메라 거리·구 반경 기준으로 재보정(refit).
          g.scene().fog = { isFog: true, color: new ColorC('#1a1c26'), near: 700, far: 2200 };
        }
        if (lineObj && !baseLines) {
          const GeoC = lineObj.geometry.constructor;
          const AttrC = lineObj.geometry.getAttribute('position').constructor;
          const MatC = lineObj.material.constructor;
          const geo = new GeoC();
          geo.setAttribute('position', new AttrC(new Float32Array(g.graphData().links.length * 6), 3));
          baseLines = new lineObj.constructor(geo,
            new MatC({ color: 0x6a7186, transparent: true, opacity: 0 }));   // 페이드인 전까지 투명
          baseLines.isLineSegments = true; baseLines.type = 'LineSegments';
          baseLines.frustumCulled = false;
          baseLines.raycast = () => {};   // 호버 레이캐스트 대상에서 제외
          g.scene().add(baseLines);
          g.linkVisibility(realLinkVisibility);   // 부트스트랩 종료 → 실제 가시성 규칙
          g.linkOpacity(0.5);                     // 엣지는 차분하게 — 통과하는 빛이 도드라지게
        }
        return !!(g.scene().fog && baseLines);
      } catch (e) { return false; }
    };
    const syncBaseLines = () => {
      if (!baseLines) return;
      const links = g.graphData().links;
      const arr = baseLines.geometry.attributes.position.array;
      const hid = hiddenRef.current;
      let i = 0;
      for (let k = 0; k < links.length; k++) {
        const s = links[k].source, t2 = links[k].target;
        if (typeof s !== 'object' || typeof t2 !== 'object') continue;
        if (hid.size && (hid.has(s.section) || hid.has(t2.section))) continue;   // 범례 토글
        arr[i++] = s.x || 0; arr[i++] = s.y || 0; arr[i++] = s.z || 0;
        arr[i++] = t2.x || 0; arr[i++] = t2.y || 0; arr[i++] = t2.z || 0;
      }
      baseLines.geometry.setDrawRange(0, i / 3);
      baseLines.geometry.attributes.position.needsUpdate = true;
      baseLines.geometry.computeBoundingSphere && baseLines.geometry.computeBoundingSphere();
    };
    let fxRaf = 0;
    const fxT0 = performance.now();
    let fxPrev = 0;
    const fxLoop = (now) => {
      const f = selRef.current, pid = pulseRef.current;
      const ph = (now - fxT0) / 1000;
      // 자전 램프 — 호버가 풀린 뒤 1.2초에 걸쳐 0에서 원래 속도까지 올린다.
      // smoothstep이라 출발도 도착도 완만하다. 첫 프레임의 dt는 버린다.
      const dt = fxPrev ? Math.min(100, now - fxPrev) : 0;
      fxPrev = now;
      if (!spinPaused && spinRamp < 1) {
        spinRamp = Math.min(1, spinRamp + dt / SPIN_RAMP_MS);
        controls.autoRotateSpeed = SPIN_SPEED * (spinRamp * spinRamp * (3 - 2 * spinRamp));
      }
      const blink = 0.5 + 0.5 * Math.sin(ph * 4.5);
      g.graphData().nodes.forEach((n) => {
        const o = n.__threeObj; if (!o) return;
        let target = 1;
        const lit = f && (n.id === f || (D.nb[f] && D.nb[f][n.id]));
        if (lit) {
          target = (n.id === f ? 2.7 : 2.0) * (1 + 0.08 * Math.sin(ph * 4.5));
          if (!o.__axMat) { o.__axMat = 1; o.material = o.material.clone(); o.material.transparent = true; }
          o.material.opacity = 0.62 + 0.38 * blink;   // 깜빡임
        } else if (o.__axMat) { delete o.__axMat; }    // restyle이 공유 머티리얼로 되돌려 놓는다
        if (pid === n.id) target = Math.max(target, 2.2);
        if (Math.abs(o.scale.x - target) > 0.004) {
          const s = o.scale.x + (target - o.scale.x) * 0.18;
          o.scale.set(s, s, s);
        }
      });
      if (!extrasReady) extrasReady = initSceneExtras();
      syncBaseLines();
      updatePulses(now);
      // 기본 엣지선(hairball)은 자전 중엔 숨기고, 노드를 선택했거나 기준 거리의
      // 80% 이내로 줌인했을 때만 부드럽게 나타난다.
      if (baseLines) {
        const camDist = g.camera().position.distanceTo(controls.target);
        const wantLines = !selRef.current && (fitDist > 0 && camDist < fitDist * 0.8);
        const targetOp = wantLines ? 0.3 : 0;
        const m = baseLines.material;
        if (Math.abs(m.opacity - targetOp) > 0.005) m.opacity += (targetOp - m.opacity) * 0.12;
        baseLines.visible = m.opacity > 0.015;
      }
      fxRaf = requestAnimationFrame(fxLoop);
    };
    fxRaf = requestAnimationFrame(fxLoop);
    const onResize = () => { g.width(el.clientWidth).height(el.clientHeight); };
    // 포인터가 창을 벗어날 때 호버가 남아 있으면 그 클러스터 외 전부가 회색으로
    // 굳는다 — 확실하게 해제한다.
    const onLeave = () => { pauseSpin(false); if (hoverRef.current) { hoverRef.current = null; restyle(); } };
    el.addEventListener('pointerleave', onLeave);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    window.addEventListener('resize', onResize);
    requestAnimationFrame(onResize);
    return () => {
      cancelAnimationFrame(fxRaf);
      el.removeEventListener('pointermove', onPtrMove);
      el.removeEventListener('pointerleave', onLeave);
      ro.disconnect(); window.removeEventListener('resize', onResize);
      if (g._destructor) g._destructor();
      graphRef.current = null;
    };
  }, [ready]);

  const D = dataRef.current;
  const selectFromList = (id) => {
    if (!gateSelect(id)) return;
    selRef.current = id; setSel(id);
    const g = graphRef.current;
    if (!g) return;
    g.__setRotate(false);
    g.__orientLinks(id);
    g.__restyle();
    const node = g.graphData().nodes.find((n) => n.id === id);
    if (node) g.__faceNode(node);
  };
  /* 범례 토글 — 카테고리 노드·엣지 표시/숨김. 선택 중이던 노드의 카테고리를
     끄면 선택도 해제한다. */
  const toggleSection = (s) => {
    const next = new Set(hiddenRef.current);
    if (next.has(s)) next.delete(s); else next.add(s);
    hiddenRef.current = next;
    setHiddenSecs(next);
    if (selRef.current && next.has(selRef.current.slice(0, selRef.current.indexOf('/')))) {
      selRef.current = null; setSel(null);
      const g0 = graphRef.current; if (g0) g0.__setRotate(true);
    }
    const g = graphRef.current;
    if (g) g.__restyle();
  };

  /* 키워드 검색 — 매치 노드만 하이라이트, 나머지는 흐리게 */
  const searchDeb = useRef();
  const onSearch = (v) => {
    setQuery(v);
    clearTimeout(searchDeb.current);
    searchDeb.current = setTimeout(() => {
      const q = v.trim().toLowerCase();
      if (!q) { searchRef.current = null; }
      else {
        const hit = new Set();
        Object.keys(D.card).forEach((k) => {
          const c = D.card[k];
          const hay = ((c.headline || '') + ' ' + (c.body || '') + ' ' + (c.tool || '') + ' ' + (c.source || '')).toLowerCase();
          if (hay.indexOf(q) !== -1) hit.add(k);
        });
        searchRef.current = hit;
      }
      const g = graphRef.current;
      if (g) g.__restyle();
      bump((x) => x + 1);
    }, 180);
  };

  /* 카루셀 좌우 화살표 — 넘칠 때만 표시, 클릭 시 한 화면 폭만큼 스크롤 */
  const stripScrollCheck = () => {
    const el = stripRef.current;
    if (!el) return;
    const l = el.scrollLeft > 4;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setStripNav((p) => (p.l === l && p.r === r ? p : { l, r }));
  };
  const stripScrollBy = (dir) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(320, el.clientWidth * 0.8), behavior: 'smooth' });
  };
  useEffect(() => { stripScrollCheck(); });   // 렌더마다 오버플로 재판정 (setState 가드로 안전)

  /* 카루셀 카드 호버 → 해당 노드 확대·엣지 강조 (스케일은 이펙트 루프가 처리) */
  const rowHover = (id, on) => {
    pulseRef.current = on ? id : null;
    const g = graphRef.current;
    if (g) g.__restyle();   // 연결 엣지 색·굵기 강조 갱신
  };
  const card = sel ? D.card[sel] : null;
  const selNode = sel ? D.nodeById[sel] : null;
  const neighbors = sel ? (D.adj[sel] || []).slice().sort((a, b) => b.w - a.w) : [];
  const recent = ready ? (window.AX_ARCHIVE || []).slice(0, 14) : [];

  /* 히어로와 동일한 FlipCard가 먹는 아이템 형태로 변환 — has_full이면 locked로
     넘겨 entitled 플립(백면 PremiumFullArticle이 /api/premium/full에서 전문 로드,
     맨 아래 SourceLine 원문 링크까지 본 카드와 동일)을 그대로 탄다. */
  const toItem = (c) => ({
    id: c.id, eyebrow: tx('card.eyebrow_default'), headline: c.headline, body: c.body,
    tool: c.tool, source: c.source, url: c.url, accent: c.accent,
    motif: c.motif, image: c.image,
    // Pro: locked 플립(전문). 무료: 플립 없이 원문 링크(SourceLine)만
    locked: entitled ? !!c.has_full : false, hasFull: false,
  });

  /* 연관 뉴스 카드 — 본 사이트 과거 5일 필름스트립(.ax-strip-card)과 같은 형식:
     4:3 이미지 위 + 툴 아이브로 + 3줄 헤드라인. 맨 앞에 노드 점, 호버 시
     그래프의 해당 노드가 커지며 하이라이트, 클릭 시 그 노드 선택. */
  const StripCard = ({ id, isMain }) => {
    const c = D.card[id]; const n = D.nodeById[id];
    if (!c || !n) return null;
    return (
      <button className="ax-strip-card" onClick={() => selectFromList(id)}
        onMouseEnter={() => rowHover(id, true)} onMouseLeave={() => rowHover(id, false)}
        style={{ width: 168, background: t.feedSolid || t.cardSolid || '#fbf8f3',
          border: isMain ? ('2px solid ' + (INSIGHTS_COLORS[n.section] || '#171717')) : (t.feedBorder || t.cardBorder),
          boxShadow: '0 10px 24px -14px rgba(80,50,40,.5)' }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', background: '#efe9e1' }}>
          {c.image ? (
            <img src={'/' + c.image} alt="" loading="lazy"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <React.Fragment>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg,#f6f2ec,#efe9e1)' }} />
              <div style={{ position: 'absolute', width: '84%', height: '92%', left: '10%', top: '8%', borderRadius: '50%',
                filter: 'blur(13px)', mixBlendMode: 'multiply', opacity: .85,
                background: `radial-gradient(circle,${c.accent},transparent 66%)` }} />
            </React.Fragment>
          )}
        </div>
        <div style={{ padding: '10px 11px 12px' }}>
          <div className="ax-eyebrow" style={{ fontSize: 10, color: t.faint, marginBottom: 5,
            display: 'flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
              background: INSIGHTS_COLORS[n.section] || '#8a8377' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.tool} · {n.date.replace(/-/g, '.')}
            </span>
          </div>
          {/* 헤드라인 3줄 고정 높이 — 본 필름스트립 카드와 동일 */}
          <div className="ax-hl" style={{ fontSize: 12.5, lineHeight: 1.32, color: t.hl, height: 'calc(1.32em * 3)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {(c.headline || '').replace(/\n/g, ' ')}
          </div>
        </div>
      </button>
    );
  };

  if (failed) return <div style={{ textAlign: 'center', padding: '60px 0', color: t.mute }}>{tx('insights.load_failed')}</div>;

  const solid = t.cardSolid || '#fbf8f3';
  const stripIds = card ? neighbors.map((e) => e.id) : recent.map((c) => c.section + '/' + c.id);
  return (
    <div style={{ width: '100vw', position: 'relative', left: '50%', transform: 'translateX(-50%)' }}>
    {/* 상단 2분할: [3D 네트워크 창 | 클릭된 노드의 뉴스 카드] */}
    <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: INSIGHTS_GAP,
      alignItems: 'flex-start', maxWidth: 1320, margin: '8px auto 0', padding: '0 16px',
      boxSizing: 'border-box' }}>
      {/* 네트워크 창 — 히어로 프레임, 남는 폭 전부 사용 */}
      <div style={{ flex: mobile ? 'none' : '1 1 auto', minWidth: 0, position: 'relative',
        width: mobile ? '100%' : 'auto',
        height: mobile ? 'max(52vh, 320px)' : INSIGHTS_H,
        borderRadius: t.radius, border: t.cardBorder, boxShadow: t.cardShadow,
        background: 'radial-gradient(120% 95% at 50% 38%, #2b2f3d 0%, #20232f 46%, #171923 82%, #101219 100%)',
        overflow: 'hidden' }}>
        {/* 어두운 심도 비네트 — 구가 우주에 떠 있는 느낌 */}
        <div aria-hidden style={{ position: 'absolute', inset: 0,
          boxShadow: 'inset 0 0 140px 36px rgba(0,0,0,.42)', pointerEvents: 'none' }} />
        <div ref={graphBoxRef} style={{ position: 'absolute', inset: 0 }} />
        {!ready && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#9aa1b4', fontSize: 13 }}>{tx('insights.loading')}</div>
        )}
        {/* 범례 — 모바일: 창 상단 가로 칩 바 / 데스크톱: 좌측 중앙 세로 박스 */}
        {mobile ? (
          <div style={{ position: 'absolute', left: 8, right: 8, top: 8, display: 'flex', gap: 6,
            overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: '2px 2px 6px' }}>
            {Object.keys(INSIGHTS_COLORS).map((s) => {
              const off = hiddenSecs.has(s);
              return (
                <button key={s} onClick={() => toggleSection(s)}
                  style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 5,
                    background: 'rgba(255,255,255,.9)', border: '1px solid #e6dfd3', borderRadius: 999,
                    padding: '4px 10px', opacity: off ? 0.45 : 1, cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: INSIGHTS_COLORS[s] }} />
                  <span className="ax-eyebrow" style={{ color: '#57534a', fontSize: 9.5,
                    textDecoration: off ? 'line-through' : 'none' }}>{insightsLabel(s)}</span>
                </button>
              );
            })}
          </div>
        ) : (
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.92)',
          border: '1px solid #e6dfd3', borderRadius: 12, padding: '9px 11px' }}>
          {Object.keys(INSIGHTS_COLORS).map((s) => {
            const off = hiddenSecs.has(s);
            return (
              <div key={s} role="button" tabIndex={0} onClick={() => toggleSection(s)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(s); } }}
                title={off ? tx('insights.show') : tx('insights.hide')}
                style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '2.5px 0',
                  cursor: 'pointer', opacity: off ? 0.55 : 1, userSelect: 'none' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto',
                  background: INSIGHTS_COLORS[s] }} />
                <span className="ax-eyebrow" style={{ color: '#57534a', fontSize: 10, flex: 1, minWidth: 52 }}>
                  {insightsLabel(s)}
                </span>
                {/* 눈 아이콘 — 뜬 눈 = 표시 중, 감은 눈 = 숨김 */}
                {off ? (
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8a8377"
                    strokeWidth="1.3" strokeLinecap="round" aria-hidden>
                    <path d="M1.5 6s2.2 3 5.5 3 5.5-3 5.5-3" />
                    <path d="M3.2 8.4l-1 1.5M7 9.2v1.8M10.8 8.4l1 1.5" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#57534a"
                    strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M1.5 7S3.7 3.5 7 3.5 12.5 7 12.5 7 10.3 10.5 7 10.5 1.5 7 1.5 7z" />
                    <circle cx="7" cy="7" r="1.7" fill="#57534a" stroke="none" />
                  </svg>
                )}
              </div>
            );
          })}
          <div className="ax-eyebrow" style={{ color: '#8a8377', fontSize: 9.5, marginTop: 6, borderTop: '1px solid #eee6d9', paddingTop: 5 }}>
            {tx('insights.size_legend')}
          </div>
        </div>
        )}
        {/* 키워드 검색 — 창 하단 중앙, 기다란 pill. 매치 노드만 색이 남는다 */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: mobile ? 10 : 14,
          width: mobile ? '90%' : 'min(520px, 74%)' }}>
          <input value={query} onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onSearch(''); }}
            placeholder={mobile ? tx('insights.search_placeholder_mobile') : tx('insights.search_placeholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: mobile ? '10px 70px 10px 16px' : '11px 74px 11px 20px', borderRadius: 999,
              border: '1px solid #ddd5c7', background: 'rgba(255,255,255,.94)', color: '#171717',
              fontSize: mobile ? 16 : 13, fontFamily: 'inherit', outline: 'none',
              boxShadow: '0 6px 18px -8px rgba(80,50,40,.25)' }} />
          {query.trim() && (
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', alignItems: 'center', gap: 7 }}>
              {searchRef.current && (
                <span className="ax-eyebrow" style={{ color: '#8a8377', fontSize: 10 }}>{tx('insights.match_count', { n: searchRef.current.size })}</span>
              )}
              <button aria-label={tx('insights.clear_search')} onClick={() => onSearch('')}
                style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #ddd5c7',
                  background: '#f1ece2', color: '#57534a', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      {/* 클릭된 노드의 뉴스 카드 (히어로 프레임 — 불투명·라운드·플립) */}
      <div style={{ width: mobile ? '100%' : INSIGHTS_CARD_W, flex: 'none' }}>
        <div ref={cardBoxRef} style={{ aspectRatio: '480 / 760', position: 'relative',
          borderRadius: t.radius, border: t.cardBorder, boxShadow: t.cardShadow,
          background: solid, overflow: 'clip' }}>
          {card ? (
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <div style={{ width: 480, height: 760, transform: `scale(${cardScale})`, transformOrigin: 'top left' }}>
                <FlipCard key={sel} item={toItem(card)} index={0} total={1} active={true}
                  t={t} mobile={false} section={selNode.section} entitled={entitled} />
              </div>
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30, textAlign: 'center' }}>
              <div className="ax-hl" style={{ fontSize: 19, color: t.hl }}>{tx('insights.empty_title')}</div>
              <p className="ax-body" style={{ fontSize: 13.5, lineHeight: 1.6, color: t.body, margin: 0 }}>
                {tx('insights.empty_body_1')}<br />{tx('insights.empty_body_2')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    {showSubscribe && <SubscribeModal t={t} onClose={() => setShowSubscribe(false)} />}
    {/* 하단: 연관 뉴스 카루셀 — 넘치면 좌우 화살표로 가로 스크롤 넛징 */}
    <div style={{ maxWidth: 1320, margin: '18px auto 40px', padding: '0 2px', boxSizing: 'border-box', position: 'relative' }}>
      <div className="ax-strip" ref={stripRef} onScroll={stripScrollCheck}>
        {stripIds.map((id) => <StripCard key={id} id={id} />)}
      </div>
      {stripNav.l && (
        <div style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', zIndex: 3 }}>
          <NavButton dir="l" onClick={() => stripScrollBy(-1)} t={t} />
        </div>
      )}
      {stripNav.r && (
        <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', zIndex: 3 }}>
          <NavButton dir="r" onClick={() => stripScrollBy(1)} t={t} />
        </div>
      )}
    </div>
    </div>
  );
}

function ThemedPage({ themeKey }) {
  const t = THEMES[themeKey];
  const isMobile = useIsMobile(760);
  const sections = window.AX_SECTIONS || { design: { label: 'Design', news: window.AX_NEWS || [], days: window.AX_DAYS || [] } };
  const order = (window.AX_SECTION_ORDER || Object.keys(sections)).filter((s) => sections[s]);
  const [section, setSection] = useState(order[0] || 'design');
  // Entitlement: default logged-out/not-entitled so the STATIC preview (no Worker
  // behind it) renders identically to before — the /api/me fetch 404s there, the
  // r.ok guard keeps it from throwing, and the catch keeps it silent (no console
  // spam beyond the one failed request). Once the Worker is live, a signed-in
  // subscriber's /api/me returns loggedIn and entitled both set and every
  // locked card (below) renders unblurred with a lazy-fetched deep-dive instead
  // of the LockedCard subscribe overlay.
  const [auth, setAuth] = useState({ loggedIn: false, entitled: false, hasSubscription: false });
  useEffect(() => {
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      // 헤더의 Pro/로그인 버튼은 i18n.js가 그린다(React 밖). 권한을 아는 쪽은
      // 여기뿐이라 결과를 넘겨 준다 — 구독 중이면 'Pro 이용 중'으로 바뀌고,
      // 로그인하지 않았으면 로그인 버튼이 나타난다.
      .then((d) => { if (d) { setAuth(d); if (window.axSetAuthUI) window.axSetAuthUI(d); } })
      .catch(() => {});
  }, []);
  // 폰에서 스티키 바가 내려와 있으면 버튼을 그 첫 줄로 옮긴다 — 두 벌을 동시에
  // 띄우지 않기 위해서다. 버튼을 그리는 쪽이 React 밖(i18n.js)이라 알려 줘야 한다.
  useEffect(() => {
    if (window.axPlaceActions) window.axPlaceActions(isMobile);
  }, [isMobile]);
  // 헤더 Pro 버튼(i18n.js, React를 모르므로 이벤트로만 알림)이 쏘는 'ax:subscribe'를
  // 듣고 구독 모달을 연다. i18n.js의 axMountGlobe와 같은 역할의 짝.
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subscribePhase, setSubscribePhase] = useState('choose');
  useEffect(() => {
    const onPro = () => { setSubscribePhase('choose'); setShowSubscribe(true); };
    // 이미 구독한 사람이 새 기기에서 들어온 경우 — 요금제가 아니라 로그인부터.
    const onLogin = () => { setSubscribePhase('login'); setShowSubscribe(true); };
    window.addEventListener('ax:subscribe', onPro);
    window.addEventListener('ax:login', onLogin);
    return () => {
      window.removeEventListener('ax:subscribe', onPro);
      window.removeEventListener('ax:login', onLogin);
    };
  }, []);
  // Insights(Pro 전용 지식 네트워크) 뷰 — #insights 딥링크로도 진입. 엔타이틀이
  // 아니면 렌더 시점에 브리프로 폴백되므로 해시만으로는 열리지 않는다.
  const [view, setView] = useState(() =>
    (typeof window !== 'undefined' && window.location.hash === '#insights') ? 'insights' : 'brief');
  const openInsights = () => {
    setView('insights');
    try { history.replaceState(null, '', '#insights'); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const closeInsights = () => {
    if (view !== 'insights') return;
    setView('brief');
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
  };
  // The free card (news[0]) shows its full deep-dive, and every other today card
  // (news[1:]) already arrives in the public payload as a real, front-fields-public
  // card with `locked: true` (see build_data.py's split_teaser) — FlipCard renders
  // those as a blurred LockedCard UNLESS the viewer is entitled (see FlipCard).
  // heroItems is kept as a thin passthrough (rather than inlining `s.news` at every
  // call site) so all 5 call sites stay in one place if the hero deck ever needs
  // shaping again.
  const heroItems = (s) => (s && s.news) || [];
  const cur = sections[section] || { label: section, news: [], days: [] };
  const heroRef = useRef();
  const [hero, setHero] = useState(() => ({ items: heroItems(sections[order[0]]), index: 0, key: 0, day: null }));
  const [intro, setIntro] = useState(null);
  // Mobile flips the card in place (same as desktop), so there's no separate "expanded"
  // full-screen state to track — the FlipCard owns its own flip state.
  // Mobile sticky header, two stages: the title row curtains down once the goo masthead
  // (title + Daily Brief) leaves the top; the tabs row joins after a little more scroll.
  // gutter = the card's left edge, so title / Daily Brief / tabs all line up with the card.
  const [stuckTitle, setStuckTitle] = useState(false);
  const [stuckTabs, setStuckTabs] = useState(false);
  const [gutter, setGutter] = useState(14);
  const mastheadRef = useRef();
  const dnow = new Date();
  const ds = `${String(dnow.getFullYear()).slice(2)}.${String(dnow.getMonth() + 1).padStart(2, '0')}.${String(dnow.getDate()).padStart(2, '0')}`;
  useEffect(() => {
    if (!isMobile) { setStuckTitle(false); setStuckTabs(false); return; }
    const check = () => {
      const mh = mastheadRef.current;
      if (mh) {
        const b = mh.getBoundingClientRect().bottom;
        setStuckTitle((p) => { const n = b <= 0; return p === n ? p : n; });   // goo masthead gone
        setStuckTabs((p) => { const n = b <= -34; return p === n ? p : n; });  // scrolled a bit more
      }
      if (heroRef.current) {
        const left = Math.round(heroRef.current.getBoundingClientRect().left);
        setGutter((p) => (p === left ? p : left));
      }
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [isMobile]);
  // Pre-decode this section's images so swiping/scrolling never shows a blank tile.
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      if (!alive) return;
      document.querySelectorAll('img').forEach((im) => { if (im.decode) im.decode().catch(() => {}); });
    }, 60);
    return () => { alive = false; clearTimeout(id); };
  }, [section]);
  // Deep link: ?c=<section>:<id> opens straight to that card (today or a past day).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const c = new URLSearchParams(window.location.search).get('c');
    if (!c) return;
    const idx = c.indexOf(':'); if (idx < 0) return;
    const sec = decodeURIComponent(c.slice(0, idx)), cid = decodeURIComponent(c.slice(idx + 1));
    const s = sections[sec]; if (!s || !cid) return;
    setSection(sec);
    const today = s.news || [];
    const ti = today.findIndex((x) => x.id === cid);
    if (ti >= 0) {
      setHero({ items: heroItems(s), index: ti, key: Date.now(), day: null });
    } else {
      for (const day of (s.days || [])) {
        const di = (day.cards || []).findIndex((x) => x.id === cid);
        if (di >= 0) { setHero({ items: day.cards, index: di, key: Date.now(), day }); setIntro({ day, cardIdx: di, k: Date.now() }); break; }
      }
    }
    setTimeout(() => { if (heroRef.current) window.scrollTo({ top: heroRef.current.getBoundingClientRect().top + window.scrollY - 28 }); }, 120);
  }, []);
  const scrollToHero = () => {
    if (heroRef.current) {
      const top = heroRef.current.getBoundingClientRect().top + window.scrollY - 28;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };
  const switchSection = (s) => {
    closeInsights();
    if (s === section) return;
    setSection(s); setIntro(null);
    setHero({ items: heroItems(sections[s]), index: 0, key: Date.now(), day: null });
  };
  const openDay = (day, cardIdx) => {
    setHero({ items: day.cards, index: cardIdx, key: Date.now(), day });
    setIntro({ day, cardIdx, k: Date.now() });
    scrollToHero();
  };
  const backToToday = () => {
    setIntro(null);
    setHero({ items: heroItems(cur), index: 0, key: Date.now(), day: null });
    scrollToHero();
  };
  // logo → home: reset to the first section's today and scroll to the top.
  const goHome = () => {
    closeInsights();
    setSection(order[0] || 'design'); setIntro(null);
    setHero({ items: heroItems(sections[order[0]]), index: 0, key: Date.now(), day: null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const viewing = hero.day ? tx('deck.viewing', { date: axDate(hero.day.date, 'md') }) : null;
  const hasNews = (cur.news || []).length > 0;
  const insightsOn = view === 'insights';   // Knowledge Graph는 전원 공개(내부에서 프리미엄 게이트)
  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'visible', background: t.briefBg, boxSizing: 'border-box' }}>
      {/* The animated, full-screen, blurred + mix-blended backdrop is the page's
          biggest continuous GPU cost — it overheats phones. Desktop only; mobile
          falls back to the cheap static briefBg gradient on the root. */}
      {!isMobile && <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}><ThemeBackdrop t={t} /></div>}
      {/* mobile: compact sticky header that appears once the real masthead+tabs leave */}
      {isMobile && (
        <MobileStickyHeader t={t} stuckTitle={stuckTitle} stuckTabs={stuckTabs} ds={ds} gutter={gutter}
          sections={sections} order={order} active={insightsOn ? '' : section} onSelect={switchSection}
          showInsights={true} insightsActive={insightsOn} onInsights={openInsights}
          onTitle={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      )}
      <div className="ax-shell">
        <div ref={mastheadRef} style={insightsOn ? { position: 'relative', zIndex: 3 } : undefined}>
          <Masthead t={t} mobile={isMobile} onHome={goHome} />
        </div>
        {/* 폰에서는 같은 탭이 고정바에 이미 있다 — 두 벌을 띄우지 않는다. */}
        {!isMobile && (
          <div style={insightsOn ? { position: 'relative', zIndex: 3 } : undefined}>
            <SectionTabs sections={sections} order={order} active={insightsOn ? '' : section} onSelect={switchSection} t={t}
              showInsights={true} insightsActive={insightsOn} onInsights={openInsights} actions />
          </div>
        )}
        {/* back-to-today control — rendered only while viewing a past day. */}
        {!insightsOn && hero.day && (
          <div style={{ marginTop: 2, marginBottom: 2, textAlign: 'center' }}>
            <button onClick={backToToday} className="ax-eyebrow" style={{ cursor: 'pointer',
              border: t.cardBorder, background: t.cardSolid || t.cardBg, color: t.hl, padding: '7px 15px',
              borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden>←</span> {tx('deck.back_to_today')}
              <span style={{ color: t.faint }}>· {viewing}</span>
            </button>
          </div>
        )}
        {insightsOn ? (
          <InsightsView t={t} mobile={isMobile} entitled={auth.entitled} />
        ) : hasNews ? (
          <React.Fragment>
            {/* HERO — centered vertical card (flips in place to the full article).
                When the 2-row sticky bar is showing, drop the card so the tabs row
                doesn't cover its top. */}
            <div ref={heroRef} className="ax-hero-wrap"
              style={{ transition: 'margin-top .3s cubic-bezier(.2,.8,.25,1)' }}>
              <Carousel key={'hero' + section + hero.key} items={hero.items} initialIndex={hero.index} t={t} mobile={isMobile} section={section} entitled={auth.entitled} />
              {intro && <HeroDeckIntro key={'intro' + intro.k} day={intro.day} cardIdx={intro.cardIdx} t={t} mobile={isMobile} onDone={() => setIntro(null)} />}
            </div>
            {/* PAST DAYS — fan-out deck timeline (desktop) / horizontal filmstrip (mobile) */}
            {(cur.days || []).length > 0 && (isMobile
              ? <MobileFilmstrip t={t} onOpen={openDay} days={cur.days} entitled={auth.entitled}
                  hasSubscription={auth.hasSubscription} />
              : <WeeklyTimeline t={t} onOpen={openDay} days={cur.days} entitled={auth.entitled}
                  hasSubscription={auth.hasSubscription} />)}
          </React.Fragment>
        ) : (
          /* empty section (no news yet) */
          <div style={{ textAlign: 'center', padding: '64px 20px 80px' }}>
            <div className="ax-hl" style={{ fontSize: 22, color: t.hl, marginBottom: 10 }}>{cur.label} · {tx('section.preparing')}</div>
            <p className="ax-body" style={{ fontSize: 14.5, color: t.body, margin: 0 }}>
              {tx('section.empty')}</p>
          </div>
        )}
        {/* 사이트 푸터 — 약관·개인정보·환불 링크는 Paddle 도메인 심사의 요구사항이고,
            AI 생성 고지와 운영자 표기는 사실 그대로 적는다. */}
        <SiteFooter t={t} />
      </div>
      {showSubscribe && <SubscribeModal t={t} initialPhase={subscribePhase}
        onClose={() => setShowSubscribe(false)} />}
    </div>
  );
}

Object.assign(window, { THEMES, MediaScene, Motif, axEnrich, LayoutEditorial, Carousel, FlipCard, FullArticle, PremiumFullArticle, MiniCard, DayDeck, WeeklyTimeline, HeroDeckIntro, useIsMobile, MobileFilmstrip, SectionTabs, ThemedPage });
