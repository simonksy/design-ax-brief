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
const { useState, useRef, useEffect, useCallback } = React;

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
  .ax-track{display:flex;height:100%;transition:transform .5s cubic-bezier(.4,0,.2,1);will-change:transform;}
  .ax-slide{flex:0 0 100%;min-width:100%;height:100%;}
  .ax-hl{font-family:'Pretendard',var(--font-sans);white-space:pre-line;font-weight:600;
     letter-spacing:-0.02em;text-wrap:balance;margin:0;word-break:keep-all;overflow-wrap:break-word;}
  .ax-body{font-family:'Pretendard',var(--font-sans);font-weight:400;letter-spacing:-0.01em;margin:0;
     word-break:keep-all;overflow-wrap:break-word;}
  .ax-eyebrow{font-family:var(--font-mono);font-size:11px;line-height:16px;letter-spacing:.07em;
     text-transform:uppercase;font-weight:500;}
  .ax-src{font-family:var(--font-mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;
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
  .ax-hero-wrap{position:relative;width:480px;max-width:100%;height:760px;margin:6px auto 0;}
  @media (max-width:760px){
    .ax-shell{padding:16px 12px 56px;}
    /* FIXED pixel height on mobile — viewport units (svh/vh) change as the browser
       address bar shows/hides on scroll, which made the collapsed card grow. px is
       stable. The summary fits; the expanded full article is a separate flowing view. */
    .ax-hero-wrap{width:100%;height:580px;margin:2px auto 0;}
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
  .ax-strip-card{flex:0 0 auto;cursor:pointer;text-align:left;padding:0;border-radius:14px;overflow:hidden;
     transition:transform .2s ease;}
  .ax-strip-card:active{transform:scale(.96);}
  /* ---- section tabs (Design / Music / Movies / Games / Books) ---- */
  .ax-tabs{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin:0 auto 16px;padding:0 12px;}
  .ax-tab{font-family:var(--font-mono);font-size:12px;letter-spacing:.04em;font-weight:600;cursor:pointer;
     padding:7px 15px;border-radius:100px;white-space:nowrap;transition:background .2s ease,color .2s ease,border-color .2s ease,transform .12s ease;}
  .ax-tab:active{transform:scale(.95);}
  @media (max-width:760px){
    .ax-tabs{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;scrollbar-width:none;margin-bottom:12px;}
    .ax-tabs::-webkit-scrollbar{display:none;}
  }
  /* ---- card flip: front summary <-> back full translated article ---- */
  .ax-flip-wrap{position:relative;width:100%;height:100%;perspective:1800px;}
  .ax-flip{position:relative;width:100%;height:100%;transform-style:preserve-3d;
     transition:transform .62s cubic-bezier(.4,0,.2,1);}
  .ax-flip.flipped{transform:rotateY(180deg);}
  .ax-flip-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
     overflow:hidden;border-radius:inherit;}
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
  if (/Figma/.test(s)) return '스크린샷·프롬프트가 곧 수정 가능한 디자인이 됩니다.';
  if (/KeyShot|CMF|렌더/.test(s)) return '고화질 렌더를 기다릴 필요 없이, 그 자리에서 바로.';
  if (/CAD/.test(s)) return '글로 설명하면 3D 형상과 도면이 따라옵니다.';
  if (/Token|일관성/.test(s)) return '규칙을 한 곳에 모으면 점검은 AI가 대신합니다.';
  if (/VR|몰입/.test(s)) return '실물 목업 없이 가상으로 보고 결정합니다.';
  if (/핸드오프|코드/.test(s)) return '디자인과 코드가 자동으로 이어집니다.';
  if (/리서치/.test(s)) return 'AI가 유저리서치를 합성하고 인사이트를 정리합니다.';
  if (/원칙|DesignAX/.test(s)) return 'AI와 사람의 협업, 그 원칙을 다시 세웁니다.';
  if (/UX Pilot/.test(s)) return '프롬프트 한 줄로 UI와 코드 초안이 나옵니다.';
  return 'AI가 디자인 워크플로우를 빠르게 바꾸고 있습니다.';
}
function axEnrich(item) {
  return {
    ...item,
    eyebrow: item.eyebrow || 'AI NEWS',
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

function LayoutEditorial({ item, index, total, active, t, mobile, onExpand }) {
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
        {/* footer: divider, source link, then a full-width "Read" pill at the bottom */}
        <div style={{ flex: '0 0 auto', borderTop: `1px solid ${t.rule}`, paddingTop: mobile ? 13 : 14, marginTop: mobile ? 14 : 18 }}>
          <SourceLine item={it} t={t} />
          {onExpand && (
            <div style={{ marginTop: 14 }}>
              <AxPill label="Read" onClick={onExpand} t={t} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- FullArticle: the flip back — Korean-translated article (text+img+video),
   capped to a fixed scroll box (full if it fits, else a summary that fits). ---- */
function FullArticle({ item, t, onClose }) {
  const it = axEnrich(item);
  const full = item.full || { blocks: [] };
  const blocks = full.blocks || [];
  const solid = t.cardSolid || '#fbf8f3';   // opaque base for the floating-close fade
  return (
    <React.Fragment>
      <div style={{ flex: '0 0 auto', padding: '20px 26px 12px', borderBottom: `1px solid ${t.rule}` }}>
        <div style={{ minWidth: 0 }}>
          <div className="ax-eyebrow" style={{ color: t.faint, marginBottom: 7 }}>
            {it.eyebrow} · {it.tool}<span style={{ color: t.faint }}> · {full.mode === 'summary' ? '요약본(번역)' : '전문(번역)'}</span>
          </div>
          <h2 className="ax-hl" style={{ fontSize: 20, lineHeight: 1.22, color: t.hl, margin: 0 }}>{it.headline}</h2>
        </div>
      </div>
      {/* extra bottom padding so the last line clears the floating close pill */}
      <div className="ax-full ax-body" style={{ color: t.body, fontSize: 14.5, lineHeight: 1.62, paddingBottom: 92 }}>
        {blocks.map((b, i) => {
          if (b.t === 'img') return <img key={i} src={b.src} alt={b.cap || ''} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
          if (b.t === 'video') return (
            <div key={i} className="ax-vid">
              {b.yt
                ? <iframe src={`https://www.youtube.com/embed/${b.yt}`} title="video" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen />
                : <video src={b.src} poster={b.poster || undefined} controls playsInline />}
            </div>
          );
          return <p key={i}>{b.x}</p>;
        })}
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
            <AxPill label="close" onClick={onClose} t={t} />
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

/* ---- FlipCard: front = LayoutEditorial summary; tap + to flip (revolving door)
   to the FullArticle back. Desktop-first (the back uses absolute faces that need a
   fixed-height card; on mobile, where the hero is content-height, fall back to the
   plain summary card for now). ---- */
function FlipCard({ item, index, total, active, t, mobile }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => { if (!active) setFlipped(false); }, [active]);
  const hasFull = item.full && Array.isArray(item.full.blocks) && item.full.blocks.length > 0;
  if (!hasFull) {
    return <LayoutEditorial item={item} index={index} total={total} active={active} t={t} mobile={mobile} />;
  }
  // Both desktop AND mobile flip in place (revolving door): the summary front and the
  // full translated-article back are one connected card, so reading stays in context.
  // The hero box is a fixed height on both (CSS .ax-hero-wrap: 760px / 580px mobile),
  // which gives the absolute faces a box to fill — no full-screen sheet swap.
  return (
    <div className="ax-flip-wrap">
      <div className={'ax-flip' + (flipped ? ' flipped' : '')}>
        <div className="ax-flip-face">
          <LayoutEditorial item={item} index={index} total={total} active={active && !flipped} t={t} mobile={mobile}
            onExpand={() => setFlipped(true)} />
        </div>
        <div className="ax-flip-face ax-flip-back" style={{ background: t.cardSolid || t.cardBg }}>
          <FullArticle item={item} t={t} onClose={() => setFlipped(false)} />
        </div>
      </div>
    </div>
  );
}

/* ---- themed circular nav ---- */
function NavButton({ dir, disabled, onClick, t }) {
  const styles = {
    light: { bg: 'rgba(255,255,255,.7)', bd: 'rgba(40,30,20,.14)', fg: '#1c1a18' },
    dark: { bg: 'rgba(255,255,255,.1)', bd: 'rgba(255,255,255,.22)', fg: '#fff' },
    paper: { bg: 'rgba(249,247,242,.9)', bd: 'rgba(40,36,30,.16)', fg: '#26241f' },
  }[t.nav];
  return (
    <button aria-label={dir === 'l' ? '이전' : '다음'} disabled={disabled} onClick={onClick}
      style={{ width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: styles.bg, border: `1px solid ${styles.bd}`, color: styles.fg, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? .35 : 1, WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)', transition: 'opacity .15s' }}>
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
function Carousel({ items, t, initialIndex = 0, mobile }) {
  const [idx, setIdx] = useState(initialIndex);
  const idxRef = useRef(initialIndex);
  const trackRef = useRef(null);
  const startX = useRef(0); const dx = useRef(0); const dragging = useRef(false);
  const total = items.length;
  useEffect(() => { idxRef.current = idx; }, [idx]);
  const go = useCallback((i) => setIdx(Math.max(0, Math.min(total - 1, i))), [total]);
  // During a drag we move the track DIRECTLY via the DOM (no React re-render per
  // touchmove — re-rendering 5 heavy slides each move is what made the swipe lag on
  // mobile). React only takes over on release, animating the snap to the new index.
  const setX = (px, animate) => {
    const el = trackRef.current; if (!el) return;
    el.style.transition = animate ? '' : 'none'; // '' → fall back to the .ax-track CSS transition
    el.style.transform = `translateX(calc(${-idxRef.current * 100}% + ${px}px))`;
  };
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; dx.current = 0; dragging.current = true; setX(0, false); };
  const onTouchMove = (e) => {
    if (!dragging.current) return;
    let d = e.touches[0].clientX - startX.current;
    if ((idxRef.current === 0 && d > 0) || (idxRef.current === total - 1 && d < 0)) d *= 0.3; // rubber-band at the ends
    dx.current = d; setX(d, false);
  };
  const onTouchEnd = () => {
    dragging.current = false;
    const el = trackRef.current; if (el) el.style.transition = ''; // re-enable the CSS snap transition
    if (Math.abs(dx.current) > 44) go(idxRef.current + (dx.current < 0 ? 1 : -1));
    else if (el) el.style.transform = `translateX(${-idxRef.current * 100}%)`; // snap back
    dx.current = 0;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="ax-heroin" style={{ flex: 1, minHeight: 0, overflow: 'hidden', touchAction: 'pan-y',
        borderRadius: t.radius, border: t.cardBorder, boxShadow: t.cardShadow,
        // mobile: opaque bg + no backdrop-filter so the swipe transform stays smooth
        // (animating a transform over a backdrop-filter re-samples the blur each frame)
        background: mobile ? t.cardSolid : t.cardBg,
        WebkitBackdropFilter: mobile ? 'none' : t.blur, backdropFilter: mobile ? 'none' : t.blur }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="ax-track" ref={trackRef} style={{ transform: `translateX(${-idx * 100}%)` }}>
          {items.map((it, i) => (
            <div className="ax-slide" key={i}>
              <FlipCard item={it} index={i} total={total} active={i === idx} t={t} mobile={mobile} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: mobile ? 12 : 16 }}>
        <NavButton dir="l" disabled={idx === 0} onClick={() => go(idx - 1)} t={t} />
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          {items.map((_, i) => (
            <button key={i} aria-label={'카드 ' + (i + 1)} onClick={() => go(i)}
              style={{ border: 'none', padding: 0, cursor: 'pointer', height: 6, borderRadius: 3,
                width: i === idx ? 22 : 6, transition: 'all .2s', background: i === idx ? t.dotOn : t.dotOff }} />
          ))}
        </div>
        <NavButton dir="r" disabled={idx === total - 1} onClick={() => go(idx + 1)} t={t} />
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: mobile ? 12 : 20 }}>
      {/* logo → home */}
      <div role="button" tabIndex={0} aria-label="홈으로" onClick={onHome}
        onKeyDown={(e) => { if (onHome && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onHome(); } }}
        style={{ cursor: onHome ? 'pointer' : 'default' }}>
        <MorphingTitle texts={['AX-it', 'DESIGN', 'NOW']} color={t.hl}
          fontSize={mobile ? 42 : 56} width={mobile ? 300 : 360} height={mobile ? 56 : 72} />
      </div>
      <div className="ax-eyebrow" style={{ color: t.mute, marginTop: mobile ? 5 : 8 }}>Daily Brief · {ds}</div>
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
      background: t.feedBg, WebkitBackdropFilter: t.blur, backdropFilter: t.blur, border: t.feedBorder,
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
        {front && <div className="ax-eyebrow" style={{ fontSize: 9, color: t.mute, marginTop: 12 }}>{card.source} · 클릭하면 크게 열림 ↗</div>}
      </div>
    </div>
  );
}

/* ---- DayDeck: one day — stacked deck + axis tick + date label ---- */
function DayDeck({ day, idx, t, isLast, expanded, hoveredCard, shift, onDayEnter, onCardEnter, onOpen }) {
  const deckRef = useRef();
  const d = new Date(day.date);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const md = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
  const handleClick = (ci) => {
    const rects = Array.from(deckRef.current.querySelectorAll('.ax-mini')).map((el) => el.getBoundingClientRect());
    onOpen(day, ci, rects);
  };
  return (
    <div className="ax-day" tabIndex={0} style={{ flex: '1 1 0', transform: `translateX(${shift}px)`, zIndex: expanded ? 60 : 1 }}
      onMouseEnter={() => onDayEnter(idx)} onFocus={() => onDayEnter(idx)}>
      <div ref={deckRef} className="ax-deck" style={{ position: 'relative', width: 92, height: 126, marginBottom: 22,
        filter: expanded ? 'none' : 'grayscale(1) opacity(.5)' }}>
        {day.cards.map((c, i) => (
          <MiniCard key={i} card={c} i={i} t={t}
            mode={expanded ? (hoveredCard === i ? 'front' : 'fan') : 'stack'}
            onEnter={onCardEnter} onClick={handleClick} />
        ))}
      </div>
      <div className="ax-tick" style={{ width: 9, height: 9, borderRadius: '50%', background: t.hl,
        transform: expanded ? 'scale(1.55)' : 'none', boxShadow: '0 0 0 4px #f1ece4' }} />
      <div className="ax-daylabel" style={{ marginTop: 12, textAlign: 'center' }}>
        <div className="ax-hl" style={{ fontSize: 15, color: expanded ? t.hl : t.mute }}>{md}</div>
        <div className="ax-eyebrow" style={{ fontSize: 9, color: t.faint, marginTop: 2 }}>{dow}{isLast ? ' · 어제' : ''}</div>
      </div>
    </div>
  );
}

/* ---- WeeklyTimeline: 5-day axis; hover fans a deck + pushes neighbors ---- */
function WeeklyTimeline({ t, onOpen, days }) {
  days = days || [];
  const [hd, setHd] = useState(null);   // hovered day index
  const [hc, setHc] = useState(null);   // hovered card index within the day
  const PUSH = 168;
  const enterDay = (i) => { setHd(i); setHc(null); };
  const clear = () => { setHd(null); setHc(null); };
  return (
    <section style={{ paddingTop: 92 }} onMouseLeave={clear}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <span className="ax-eyebrow" style={{ display: 'inline-block', color: t.mute, padding: '7px 16px',
          borderRadius: 100, border: t.cardBorder, background: t.cardBg, WebkitBackdropFilter: t.blur, backdropFilter: t.blur }}>Past Days</span>
        <h2 className="ax-hl" style={{ fontSize: 30, lineHeight: 1.18, color: t.hl, margin: '18px 0 8px' }}>어제까지의 모든 소식</h2>
        <p className="ax-body" style={{ fontSize: 15, color: t.body, margin: 0 }}>날짜에 올리면 그날의 카드가 펼쳐지고, 카드를 누르면 위에서 크게 열립니다 · 과거 소식을 본 뒤엔 상단의 '오늘 소식으로'로 돌아옵니다</p>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', padding: '178px 40px 0' }}>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 178 + 148, height: 1, background: t.rule, zIndex: 0 }} />
        {days.map((day, i) => {
          const shift = hd == null ? 0 : (i < hd ? -PUSH : i > hd ? PUSH : 0);
          return (
            <DayDeck key={day.date} day={day} idx={i} t={t} isLast={i === days.length - 1}
              expanded={hd === i} hoveredCard={hd === i ? hc : null} shift={shift}
              onDayEnter={enterDay} onCardEnter={setHc} onOpen={onOpen} />
          );
        })}
      </div>
    </section>
  );
}

/* ---- HeroDeckIntro: the chosen day's deck cascading into the hero ---- */
function HeroDeckIntro({ day, cardIdx, t, onDone }) {
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
            <div style={{ height: '100%', borderRadius: t.radius, overflow: 'hidden', background: t.cardBg,
              WebkitBackdropFilter: t.blur, backdropFilter: t.blur, border: t.cardBorder, boxShadow: t.cardShadow }}>
              <LayoutEditorial item={day.cards[i]} index={i} total={day.cards.length} active={isClk} t={t} />
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
function MobileFilmstrip({ t, onOpen, days }) {
  days = days || [];
  const stripRef = useRef();
  const lastDate = days.length ? days[days.length - 1].date : null;
  // Start at the right edge: yesterday (the newest day) is shown first.
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days.length]);
  const fmt = (date) => {
    const d = new Date(date);
    return { md: `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`, dow: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] };
  };
  return (
    <section style={{ paddingTop: 30 }}>
      <div style={{ textAlign: 'center', marginBottom: 6, padding: '0 16px' }}>
        <span className="ax-eyebrow" style={{ display: 'inline-block', color: t.mute, padding: '6px 14px',
          borderRadius: 100, border: t.cardBorder, background: t.cardBg, WebkitBackdropFilter: t.blur, backdropFilter: t.blur }}>Past Days</span>
        <h2 className="ax-hl" style={{ fontSize: 23, lineHeight: 1.2, color: t.hl, margin: '13px 0 6px' }}>어제까지의 모든 소식</h2>
        <p className="ax-body" style={{ fontSize: 13.5, color: t.body, margin: 0 }}>어제부터 시작해 옆으로 밀면 과거로 · 카드를 누르면 위에서 크게 열립니다</p>
      </div>
      <div className="ax-strip" ref={stripRef}>
        {days.map((day) => {
          const { md, dow } = fmt(day.date);
          const isYesterday = day.date === lastDate;
          return (
            <div className="ax-day-block" key={day.date}>
              <div className="ax-strip-datehead" style={{ background: t.feedSolid, border: t.cardBorder }}>
                <span className="ax-hl" style={{ fontSize: 14, color: t.hl, lineHeight: 1 }}>{md}</span>
                <span className="ax-eyebrow" style={{ fontSize: 8.5, color: t.faint }}>{dow}{isYesterday ? ' · 어제' : ''}</span>
              </div>
              <div className="ax-day-cards">
                {day.cards.map((c, ci) => (
                  <button key={ci} className="ax-strip-card" onClick={() => onOpen(day, ci)} style={{
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
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---- SectionTabs: Design / Music / Movies / Games / Books — switches the hero deck ---- */
function SectionTabs({ sections, order, active, onSelect, t }) {
  return (
    <div className="ax-tabs" role="tablist" aria-label="섹션">
      {order.map((s) => {
        const on = s === active;
        const label = (sections[s] && sections[s].label) || s;
        return (
          <button key={s} role="tab" aria-selected={on} className="ax-tab" onClick={() => onSelect(s)}
            style={on
              ? { background: t.hl, color: '#fff', border: '1px solid ' + t.hl }
              : { background: 'transparent', color: t.mute, border: '1px solid ' + t.rule }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ---- ThemedPage: section tabs + hero carousel + weekly deck timeline (one theme) ---- */
function ThemedPage({ themeKey }) {
  const t = THEMES[themeKey];
  const isMobile = useIsMobile(760);
  const sections = window.AX_SECTIONS || { design: { label: 'Design', news: window.AX_NEWS || [], days: window.AX_DAYS || [] } };
  const order = (window.AX_SECTION_ORDER || Object.keys(sections)).filter((s) => sections[s]);
  const [section, setSection] = useState(order[0] || 'design');
  const cur = sections[section] || { label: section, news: [], days: [] };
  const heroRef = useRef();
  const [hero, setHero] = useState(() => ({ items: (sections[order[0]] || { news: [] }).news, index: 0, key: 0, day: null }));
  const [intro, setIntro] = useState(null);
  // Mobile flips the card in place (same as desktop), so there's no separate "expanded"
  // full-screen state to track — the FlipCard owns its own flip state.
  // Pre-decode this section's images so swiping/scrolling never shows a blank tile.
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      if (!alive) return;
      document.querySelectorAll('img').forEach((im) => { if (im.decode) im.decode().catch(() => {}); });
    }, 60);
    return () => { alive = false; clearTimeout(id); };
  }, [section]);
  const scrollToHero = () => {
    if (heroRef.current) {
      const top = heroRef.current.getBoundingClientRect().top + window.scrollY - 28;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };
  const switchSection = (s) => {
    if (s === section) return;
    setSection(s); setIntro(null);
    setHero({ items: (sections[s] || { news: [] }).news, index: 0, key: Date.now(), day: null });
  };
  const openDay = (day, cardIdx) => {
    setHero({ items: day.cards, index: cardIdx, key: Date.now(), day });
    setIntro({ day, cardIdx, k: Date.now() });
    scrollToHero();
  };
  const backToToday = () => {
    setIntro(null);
    setHero({ items: cur.news, index: 0, key: Date.now(), day: null });
    scrollToHero();
  };
  // logo → home: reset to the first section's today and scroll to the top.
  const goHome = () => {
    setSection(order[0] || 'design'); setIntro(null);
    setHero({ items: (sections[order[0]] || { news: [] }).news, index: 0, key: Date.now(), day: null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const viewing = hero.day ? `${new Date(hero.day.date).getMonth() + 1}.${String(new Date(hero.day.date).getDate()).padStart(2, '0')} 소식 보는 중` : null;
  const hasNews = (cur.news || []).length > 0;
  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'visible', background: t.briefBg, boxSizing: 'border-box' }}>
      {/* The animated, full-screen, blurred + mix-blended backdrop is the page's
          biggest continuous GPU cost — it overheats phones. Desktop only; mobile
          falls back to the cheap static briefBg gradient on the root. */}
      {!isMobile && <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}><ThemeBackdrop t={t} /></div>}
      <div className="ax-shell">
        <Masthead t={t} mobile={isMobile} onHome={goHome} />
        <SectionTabs sections={sections} order={order} active={section} onSelect={switchSection} t={t} />
        {/* back-to-today control — rendered only while viewing a past day. */}
        {hero.day && (
          <div style={{ marginTop: 2, marginBottom: 2, textAlign: 'center' }}>
            <button onClick={backToToday} className="ax-eyebrow" style={{ cursor: 'pointer',
              border: t.cardBorder, background: t.cardBg, color: t.hl, padding: '7px 15px', borderRadius: 100,
              WebkitBackdropFilter: t.blur, backdropFilter: t.blur, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden>←</span> 오늘 소식으로
              <span style={{ color: t.faint }}>· {viewing}</span>
            </button>
          </div>
        )}
        {hasNews ? (
          <React.Fragment>
            {/* HERO — centered vertical card (flips in place to the full article) */}
            <div ref={heroRef} className="ax-hero-wrap">
              <Carousel key={'hero' + section + hero.key} items={hero.items} initialIndex={hero.index} t={t} mobile={isMobile} />
              {intro && <HeroDeckIntro key={'intro' + intro.k} day={intro.day} cardIdx={intro.cardIdx} t={t} onDone={() => setIntro(null)} />}
            </div>
            {/* PAST DAYS — fan-out deck timeline (desktop) / horizontal filmstrip (mobile) */}
            {(cur.days || []).length > 0 && (isMobile
              ? <MobileFilmstrip t={t} onOpen={openDay} days={cur.days} />
              : <WeeklyTimeline t={t} onOpen={openDay} days={cur.days} />)}
          </React.Fragment>
        ) : (
          /* empty section (no news yet) */
          <div style={{ textAlign: 'center', padding: '64px 20px 80px' }}>
            <div className="ax-hl" style={{ fontSize: 22, color: t.hl, marginBottom: 10 }}>{cur.label} · 준비 중</div>
            <p className="ax-body" style={{ fontSize: 14.5, color: t.body, margin: 0 }}>
              이 섹션에는 아직 오늘 소식이 없습니다. 곧 채워집니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { THEMES, MediaScene, Motif, axEnrich, LayoutEditorial, Carousel, FlipCard, FullArticle, MiniCard, DayDeck, WeeklyTimeline, HeroDeckIntro, useIsMobile, MobileFilmstrip, SectionTabs, ThemedPage });
