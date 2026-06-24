/* ============================================================
   Design AX Brief — "Large Card" stacked layout (Babel/JSX)
   Charmer-style: five full-viewport cards connected vertically
   (sticky-stack: each card pins, the next slides up over it and
   the receding card recedes via scale+dim), then the weekly
   "어제까지의 모든 소식" archive at the very bottom.
   Reuses the zen-ink media scene + Geist tokens / Pretendard.
   Exports ThemedPage + helpers to window.
   ============================================================ */
const { useState, useRef, useEffect, useCallback } = React;

/* ---- one-time CSS (keyframes + layout helpers) ---- */
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
  }
  @keyframes axdrift{0%{transform:translate(0,0) scale(1)}100%{transform:translate(7%,5%) scale(1.14)}}
  @keyframes axspin{to{transform:rotate(360deg)}}
  @keyframes axdrawk{0%{stroke-dashoffset:var(--len,600)}55%,100%{stroke-dashoffset:0}}
  @keyframes axfade{0%,12%{opacity:0;transform:translateY(5px)}28%,72%{opacity:1;transform:none}90%,100%{opacity:0;transform:translateY(-3px)}}
  @keyframes axpulse{0%,100%{opacity:.3}50%{opacity:1}}

  .ax-hl{font-family:'Pretendard',var(--font-sans);white-space:pre-line;font-weight:600;
     letter-spacing:-0.025em;text-wrap:balance;margin:0;}
  .ax-body{font-family:'Pretendard',var(--font-sans);font-weight:400;letter-spacing:-0.01em;margin:0;}
  .ax-eyebrow{font-family:var(--font-mono);font-size:12px;line-height:16px;letter-spacing:.08em;
     text-transform:uppercase;font-weight:500;}
  .ax-src{font-family:var(--font-mono);font-size:12px;letter-spacing:.05em;text-transform:uppercase;
     text-decoration:none;display:inline-flex;align-items:center;gap:7px;transition:opacity .15s;}
  .ax-src:hover{opacity:.6;}

  /* ---- full-bleed banner cards (image fills screen, text bottom-right) ---- */
  .ax-stack{position:relative;}
  .fcard{position:sticky;top:0;height:100vh;height:100svh;}
  .fcard-inner{position:relative;width:100%;height:100%;overflow:hidden;}
  /* recede dim — a compositor-only opacity layer (NOT filter:brightness, which would
     re-rasterize the image + blur-blobs + backdrop-blur under it every scroll frame). */
  .fcard-dim{position:absolute;inset:0;z-index:6;background:#000;opacity:0;pointer-events:none;will-change:opacity;}
  .fcard-media{position:absolute;inset:0;}
  .fcard-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;}
  .fcard-scrim{position:absolute;right:0;bottom:0;width:62%;height:64%;pointer-events:none;z-index:1;
     background:radial-gradient(128% 122% at 100% 100%,rgba(247,243,237,.64),rgba(247,243,237,0) 72%);}
  .fcard-media.has-img .fcard-scrim{width:80%;height:84%;
     background:radial-gradient(122% 120% at 100% 100%,rgba(247,243,237,.94),rgba(247,243,237,.52) 40%,rgba(247,243,237,0) 78%);}
  .ax-tile-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;
     filter:blur(7px);transform:scale(1.12);
     transition:filter .45s ease,transform .45s ease;}
  .ax-tile:hover .ax-tile-img{filter:blur(0);transform:scale(1.02);}
  .fcard-overlay{position:absolute;right:clamp(24px,4.2vw,76px);bottom:clamp(24px,4vw,64px);z-index:2;
     width:clamp(290px,31vw,460px);max-width:38%;max-height:62%;
     display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;
     padding:clamp(20px,1.7vw,28px) clamp(22px,1.9vw,30px);border-radius:20px;
     background:rgba(14,12,11,.46);border:1px solid rgba(255,255,255,.16);
     box-shadow:0 24px 70px -28px rgba(0,0,0,.6);
     -webkit-backdrop-filter:blur(20px) saturate(1.12);backdrop-filter:blur(20px) saturate(1.12);}
  .fcard-overlay .ax-eyebrow,.fcard-overlay .ax-hl,.fcard-overlay .ax-body,.fcard-overlay .ax-src{
     text-shadow:0 1px 3px rgba(0,0,0,.5);}
  .fcard-hl{font-size:clamp(26px,2.7vw,46px);line-height:1.1;}
  .fcard-head{display:flex;flex-direction:column;align-items:flex-start;gap:5px;margin-bottom:14px;}
  .fcard-head .ax-eyebrow{white-space:nowrap;}
  @media (max-width:860px){
    .fcard{height:auto;min-height:100svh;position:relative;top:auto;}
    .fcard-overlay{left:clamp(20px,5vw,40px);right:clamp(20px,5vw,40px);width:auto;max-width:none;max-height:54%;}
    .fcard-hl{font-size:clamp(26px,7vw,40px);}
  }

  /* ---- fixed masthead ---- */
  .ax-top{position:fixed;top:0;left:0;right:0;z-index:120;display:flex;align-items:center;
     justify-content:space-between;padding:16px clamp(20px,3vw,40px);pointer-events:none;}
  .ax-top::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;
     background:linear-gradient(to bottom,rgba(244,240,233,.92),rgba(244,240,233,0));}
  .ax-top a{pointer-events:auto;}

  /* ---- scroll-expansion hero (cover) ---- */
  .ax-hero{position:relative;}
  .ax-hero-sticky{position:sticky;top:0;height:100svh;overflow:hidden;display:flex;align-items:center;justify-content:center;}
  .ax-hero-media{position:relative;border-radius:24px;overflow:hidden;will-change:width,height,border-radius;
     border:1px solid rgba(255,255,255,.16);box-shadow:0 50px 130px -34px rgba(0,0,0,.55);}
  .ax-hero-gif{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  .ax-hero-slide{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;
     transition:opacity 1s ease;}
  .ax-hero-slide.on{opacity:1;}
  .ax-hero-mscrim{position:absolute;inset:0;pointer-events:none;
     background:radial-gradient(closest-side at 50% 47%,rgba(247,243,237,.42),rgba(247,243,237,0) 70%);}
  .ax-logo-scrim{position:fixed;top:0;left:0;right:0;height:106px;z-index:125;pointer-events:none;
     background:linear-gradient(to bottom,rgba(244,240,233,.94),rgba(244,240,233,0));}
  .ax-hero-logo{position:fixed;left:50%;z-index:130;margin:0;pointer-events:none;transform-origin:top center;
     width:min(92vw,680px);text-align:center;font-family:var(--font-sans);font-weight:700;letter-spacing:-0.03em;
     font-size:clamp(28px,4.4vw,52px);will-change:top,transform;}
  .ax-morph{position:relative;display:block;width:100%;height:1.16em;line-height:1.1;
     -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  .ax-morph span{position:absolute;left:0;right:0;top:0;margin:0 auto;white-space:nowrap;}
  .ax-hero-date{position:absolute;z-index:10;left:0;right:0;text-align:center;margin:0;
     font-family:var(--font-mono);font-size:13px;letter-spacing:.05em;will-change:opacity,top;
     text-shadow:0 1px 2px rgba(247,243,237,.8);}
  .ax-hero-hint{position:fixed;z-index:131;left:50%;transform:translateX(-50%);bottom:clamp(22px,4.5vh,44px);
     display:inline-flex;align-items:center;gap:8px;margin:0;pointer-events:none;will-change:opacity;
     padding:8px 16px;border-radius:100px;border:1px solid rgba(255,255,255,.18);
     background:rgba(14,12,11,.42);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
     font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;color:rgba(255,255,255,.92);
     text-shadow:0 1px 2px rgba(0,0,0,.4);}
  .ax-hint-arrow{display:inline-block;animation:axhintbob 1.5s ease-in-out infinite;}
  @keyframes axhintbob{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
  @media (prefers-reduced-motion: reduce){ .ax-hint-arrow{animation:none;} }
  @media (max-width:860px){ .ax-hero-logo{font-size:clamp(30px,8vw,52px);} }

  /* ---- weekly deck timeline ---- */
  .ax-day{position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;outline:none;
     transition:transform .5s cubic-bezier(.2,.8,.25,1);}
  .ax-deck{position:relative;transition:filter .45s ease;}
  .ax-mini{position:absolute;left:50%;bottom:0;transform-origin:bottom center;
     transition:transform .5s cubic-bezier(.2,.8,.25,1),width .45s cubic-bezier(.2,.8,.25,1),
                height .45s cubic-bezier(.2,.8,.25,1),box-shadow .4s ease,opacity .35s ease;}
  .ax-tick{transition:transform .4s ease;}
  .ax-daylabel{transition:color .4s ease;}
  @keyframes axheroin{0%{opacity:0;transform:translateY(14px) scale(.97)}100%{opacity:1;transform:none}}
  .ax-modalin{animation:axheroin .5s cubic-bezier(.2,.8,.25,1);}

  /* ---- archive: scroll-driven 3D tilt-up gallery ---- */
  .ax-gal-scroll{position:relative;}
  .ax-gal-sticky{position:sticky;top:0;height:100svh;display:flex;align-items:flex-start;justify-content:center;
     padding-top:clamp(74px,10vh,116px);padding-bottom:clamp(14px,3vh,30px);overflow:hidden;perspective:1500px;perspective-origin:center top;}
  .ax-gal-grid{position:relative;width:min(1180px,92vw);display:grid;grid-template-columns:repeat(5,1fr);
     gap:11px;transform-style:preserve-3d;transform-origin:50% 0%;will-change:transform;}
  .ax-gal-col{display:flex;flex-direction:column;gap:11px;will-change:transform;}
  .ax-tile{position:relative;display:block;width:100%;aspect-ratio:16/9;border-radius:16px;overflow:hidden;
     cursor:pointer;padding:0;border:1px solid rgba(255,255,255,.16);text-align:left;
     box-shadow:0 1px 1px rgba(0,0,0,.06),0 24px 70px -28px rgba(0,0,0,.6);
     transition:box-shadow .35s ease,transform .35s ease,border-color .35s ease;}
  .ax-tile:hover{border-color:rgba(255,255,255,.28);
     box-shadow:0 1px 1px rgba(0,0,0,.06),0 34px 90px -22px rgba(0,0,0,.62);
     transform:translateY(-6px) scale(1.05);z-index:5;}
  .ax-tile-cap{position:absolute;left:0;right:0;bottom:0;padding:12px 13px 13px;z-index:2;
     background:linear-gradient(to top,rgba(8,7,6,.86),rgba(8,7,6,.5) 52%,rgba(8,7,6,0));}
  .ax-tile-cap .ax-eyebrow,.ax-tile-cap .ax-hl{text-shadow:0 1px 3px rgba(0,0,0,.55);}
  .ax-colhead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:0 3px 3px;margin-bottom:1px;}
  .ax-rev{opacity:0;filter:blur(10px);transform:translateY(12px);}
  .ax-revwrap.in .ax-rev{opacity:1;filter:blur(0);transform:none;
     transition:opacity .7s cubic-bezier(.2,.8,.25,1),filter .7s cubic-bezier(.2,.8,.25,1),transform .7s cubic-bezier(.2,.8,.25,1);}
  @media (max-width:860px){
    .ax-gal-scroll{height:auto !important;}
    .ax-gal-sticky{position:relative;height:auto;perspective:none;padding:36px 16px 60px;}
    .ax-gal-grid{grid-template-columns:repeat(2,1fr);transform:none !important;width:100%;}
    .ax-gal-col{transform:none !important;margin-top:0 !important;}
  }
  @media (prefers-reduced-motion: reduce){ .ax-rev{opacity:1;filter:none;transform:none;} }
  `;
  document.head.appendChild(s);
}

/* ============================================================
   THEME — zen ink (single theme; warm sheet + colorful ink media)
   ============================================================ */
const ZEN_PAL = ['#ff5a4d', '#2ec5c5', '#3b6bff', '#7928ca'];

const THEMES = {
  zen: {
    name: 'Zen Ink', media: 'zen', bold: false,
    briefBg: 'linear-gradient(160deg,#f4f0e9 0%,#efe9e1 100%)',
    cardBg: 'rgba(255,255,255,0.5)',
    blur: 'blur(22px) saturate(1.15)',
    cardBorder: '1px solid rgba(255,255,255,0.72)',
    cardShadow: '0 1px 1px rgba(60,40,30,.05), 0 40px 90px -28px rgba(120,60,40,.34)',
    radius: 26,
    hl: '#1c1a18', body: 'rgba(28,24,20,.7)', mute: 'rgba(28,24,20,.5)', faint: 'rgba(28,24,20,.34)',
    rule: 'rgba(40,30,20,.12)', nav: 'light', dotOn: '#1c1a18', dotOff: 'rgba(40,30,20,.2)',
    feedBg: 'rgba(255,255,255,0.55)', feedBorder: '1px solid rgba(255,255,255,0.72)',
    feedShadow: '0 1px 1px rgba(60,40,30,.04), 0 14px 34px -18px rgba(120,60,40,.28)',
  },
};

/* small helper — is the element substantially in the viewport? */
function useInView(threshold = 0.5) {
  const ref = useRef();
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const o = new IntersectionObserver(([e]) => setV(e.isIntersecting), { threshold });
    o.observe(ref.current);
    return () => o.disconnect();
  }, [threshold]);
  return [ref, v];
}

/* ============================================================
   ThemeBackdrop — atmospheric bloom layer the glass cards blur.
   ============================================================ */
function ThemeBackdrop({ t }) {
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
          filter: 'blur(66px)', opacity: Math.min(0.8, 0.34 - i * 0.012),
          mixBlendMode: 'multiply', background: `radial-gradient(circle,${b.c},transparent 70%)`,
        }} />
      ))}
      <div className="ax-grain" style={{ opacity: 0.06 }} />
    </div>
  );
}

/* ============================================================
   MediaScene — the "image" (zen ink). Color lives here.
   ============================================================ */
function MediaScene({ item, active, bold }) {
  const a = item.accent;
  const cls = 'ax-scene' + (active ? ' ax-active' : '');
  const op = [0.72, 0.58, 0.5];
  return (
    <div className={cls} style={{ background: 'linear-gradient(150deg,#f6f2ec,#efe9e1)' }}>
      <div className="ax-blob" style={{ width: '74%', height: '74%', left: '6%', top: '2%', filter: 'blur(34px)',
        opacity: op[0], mixBlendMode: 'multiply', background: `radial-gradient(circle,${a},transparent 66%)` }} />
      <div className="ax-blob b2" style={{ width: '56%', height: '56%', right: '2%', bottom: '0%', filter: 'blur(40px)',
        opacity: op[1], mixBlendMode: 'multiply', background: `radial-gradient(circle,${ZEN_PAL[0]},transparent 70%)` }} />
      <div className="ax-blob b3" style={{ width: '50%', height: '50%', left: '24%', bottom: '6%', filter: 'blur(44px)',
        opacity: op[2], mixBlendMode: 'multiply', background: `radial-gradient(circle,${ZEN_PAL[1]},transparent 72%)` }} />
      <Motif kind={item.motif} ink="rgba(30,26,22,.32)" accent="rgba(30,26,22,.5)" />
      <div className="ax-grain" style={{ opacity: 0.08 }} />
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

/* ---- source line (dark ink for contrast on the light banner) ---- */
function SourceLine({ item, t }) {
  return <a className="ax-src" style={{ color: 'rgba(255,255,255,.82)' }} href={item.url} target="_blank" rel="noopener">{item.source} <span aria-hidden>↗</span></a>;
}

/* ---- enrich: derive eyebrow/body/motif for day-deck cards ---- */
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
   CardScene — full-bleed banner image (the zen ink media) + a
   soft feathered scrim under the bottom-right text for legibility.
   CardOverlay — the bottom-right text block (≤1/3 wide, ≤1/2 tall),
   dark ink on the light banner, lifted with a drop shadow.
   Shared by the full-screen stack cards and the archive modal.
   ============================================================ */
function CardScene({ it, active }) {
  const img = it.image;   // pipeline-provided per-card image (pipeline/media/...)
  return (
    <div className={'fcard-media' + (img ? ' has-img' : '')}>
      <MediaScene item={it} active={active} bold={false} />
      {img && <img className="fcard-img" src={img} alt="" loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
    </div>
  );
}
function CardOverlay({ it, num, tot, t }) {
  return (
    <div className="fcard-overlay">
      <div className="fcard-head">
        {num && <span className="ax-eyebrow" style={{ color: 'rgba(255,255,255,.58)' }}>{num} / {tot}</span>}
        <span className="ax-eyebrow" style={{ color: 'rgba(255,255,255,.84)' }}>{it.eyebrow}
          <span style={{ opacity: .55, margin: '0 7px' }}>·</span>{it.tool}</span>
      </div>
      <h2 className="ax-hl fcard-hl" style={{ color: '#ffffff' }}>{it.headline}</h2>
      <p className="ax-body" style={{ color: 'rgba(255,255,255,.85)', fontSize: 'clamp(14px,1.05vw,18px)',
        lineHeight: 1.56, marginTop: 14 }}>{it.body}</p>
      <div style={{ marginTop: 18 }}><SourceLine item={it} t={t} /></div>
    </div>
  );
}

/* ---- StackCard — one full-viewport, sticky banner ---- */
function StackCard({ item, index, total, t, dimRef }) {
  const [ref, inView] = useInView(0.45);
  const it = axEnrich(item);
  const num = String(index + 1).padStart(2, '0');
  const tot = String(total).padStart(2, '0');
  return (
    <section ref={ref} className="fcard" data-screen-label={'카드 ' + num}>
      <div className="fcard-inner">
        <CardScene it={it} active={inView} />
        <CardOverlay it={it} num={num} tot={tot} t={t} />
        <div ref={dimRef} className="fcard-dim" />
      </div>
    </section>
  );
}

/* ---- StackSection — the five connected cards + recede-on-scroll ---- */
function StackSection({ items, t }) {
  const wrapRef = useRef();
  const dims = useRef([]);
  const last = useRef([]);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width:860px)').matches) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const vh = window.innerHeight;
      const top = wrapRef.current ? wrapRef.current.offsetTop : 0;
      const y = window.scrollY;
      dims.current.forEach((el, i) => {
        if (!el) return;
        // recede as the next banner slides over — opacity only (compositor cheap).
        const p = Math.min(1, Math.max(0, (y - (top + i * vh)) / vh));
        const o = p > 0.001 ? +(0.34 * p).toFixed(3) : 0;
        if (last.current[i] !== o) { el.style.opacity = o; last.current[i] = o; } // skip redundant writes
      });
    };
    // one rAF per frame, only while scrolling/resizing — no always-on loop or timer.
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [items.length]);
  return (
    <div ref={wrapRef} className="ax-stack">
      {items.map((it, i) => (
        <StackCard key={it.id || i} item={it} index={i} total={items.length} t={t}
          dimRef={(el) => { dims.current[i] = el; }} />
      ))}
    </div>
  );
}

/* ---- masthead ---- */
function Masthead({ t }) {
  const d = new Date();
  const ds = `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return (
    <header className="ax-top">
      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 19, letterSpacing: '-0.03em', color: t.hl }}>Design AX</span>
      <span className="ax-eyebrow" style={{ color: t.mute }}>Daily Brief · {ds}</span>
    </header>
  );
}

/* ---- CardModal — archive card opened large ---- */
function CardModal({ card, t, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, []);
  const it = axEnrich(card);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 'clamp(16px,4vw,56px)', background: 'rgba(30,22,16,.42)',
      WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}>
      <div className="ax-modalin" onClick={(e) => e.stopPropagation()} style={{ position: 'relative',
        width: 'min(960px,100%)', height: 'min(86vh,680px)' }}>
        <button aria-label="닫기" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 5,
          width: 38, height: 38, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,.78)', border: '1px solid rgba(40,30,20,.16)', color: t.hl, cursor: 'pointer',
          WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4l10 10M14 4L4 14" /></svg>
        </button>
        <div className="fcard-inner" style={{ height: '100%', borderRadius: 20,
          boxShadow: '0 40px 120px -30px rgba(0,0,0,.7)', border: '1px solid rgba(255,255,255,.16)' }}>
          <CardScene it={it} active={true} />
          <CardOverlay it={it} num={null} t={t} />
        </div>
      </div>
    </div>
  );
}

/* ---- GalleryTile: a single archive card as a banner thumbnail ---- */
function GalleryTile({ card, t, onClick }) {
  return (
    <button className="ax-tile" onClick={onClick} aria-label={card.headline}
      style={{ background: 'linear-gradient(150deg,#f6f2ec,#efe9e1)' }}>
      <div className="ax-scene ax-active" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <div className="ax-blob" style={{ width: '88%', height: '92%', left: '6%', top: '2%', filter: 'blur(20px)',
          opacity: .82, mixBlendMode: 'multiply', background: `radial-gradient(circle,${card.accent},transparent 66%)` }} />
        <div className="ax-blob b2" style={{ width: '60%', height: '60%', right: '0%', bottom: '0%', filter: 'blur(22px)',
          opacity: .5, mixBlendMode: 'multiply', background: `radial-gradient(circle,${ZEN_PAL[1]},transparent 72%)` }} />
        <div className="ax-grain" style={{ opacity: .07 }} />
      </div>
      {card.image && <img className="ax-tile-img" src={card.image} alt=""
        loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div className="ax-tile-cap">
        <div className="ax-eyebrow" style={{ fontSize: 9, color: 'rgba(255,255,255,.72)', marginBottom: 4 }}>{card.tool}</div>
        <div className="ax-hl" style={{ fontSize: 'clamp(12px,1vw,14px)', lineHeight: 1.28, color: '#ffffff',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{card.headline}</div>
      </div>
    </button>
  );
}

/* ---- GalleryColHeader: the day label atop each column ---- */
function GalleryColHeader({ day, isLast, t }) {
  const d = new Date(day.date);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const md = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
  return (
    <div className="ax-colhead">
      <span className="ax-hl" style={{ fontSize: 15, color: t.hl }}>{md}</span>
      <span className="ax-eyebrow" style={{ fontSize: 9, color: t.faint }}>{dow}{isLast ? ' · 어제' : ''}</span>
    </div>
  );
}

/* ---- ArchiveGallery: scroll-driven 3D tilt-up reveal (rotateX + scale)
   with per-column parallax — mirrors the animated-gallery motion. Each
   column is one day's deck of 5 cards; clicking a card opens it large. ---- */
function ArchiveGallery({ t, onOpen }) {
  const days = window.AX_DAYS;
  const [headRef, headIn] = useInView(0.35);
  const scrollRef = useRef();
  const gridRef = useRef();
  const cols = useRef([]);
  const yRanges = [[5, -2], [-5, -1], [4, -2], [-6, -1], [6, -2]];
  const baseMt = [0, 18, 8, 22, 4];

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = () => window.matchMedia('(max-width:860px)').matches;
    const lerp = (a, b, x) => a + (b - a) * x;
    const c01 = (x) => Math.max(0, Math.min(1, x));
    let raf = 0;
    const apply = () => {
      raf = 0;
      const el = scrollRef.current; if (!el) return;
      if (reduce || narrow()) {
        if (gridRef.current) gridRef.current.style.transform = 'none';
        cols.current.forEach((c) => { if (c) c.style.transform = 'none'; });
        return;
      }
      const rect = el.getBoundingClientRect();
      const total = Math.max(1, el.offsetHeight - window.innerHeight);
      const p = c01(-rect.top / total);
      const rotX = lerp(75, 0, c01(p / 0.5));          // animated-gallery: rotateX [0,0.5]→[75,0]
      const scale = lerp(1.2, 1, c01((p - 0.5) / 0.4));  // animated-gallery: scale [0.5,0.9]→[1.2,1]
      if (gridRef.current) gridRef.current.style.transform = `rotateX(${rotX}deg) scale(${scale})`;
      const yp = c01((p - 0.5) / 0.5);                  // columns drift apart
      cols.current.forEach((c, i) => {
        if (!c) return;
        const r = yRanges[i % yRanges.length];
        c.style.transform = `translateY(${lerp(r[0], r[1], yp)}%)`;
      });
    };
    // Native scroll now drives the page, so recompute once per frame ONLY on scroll/
    // resize (no always-on rAF loop, no 150ms timer) — this is what makes the tilt
    // track the scroll smoothly instead of stuttering against competing loops.
    const on = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <React.Fragment>
      <div ref={headRef} className={'ax-revwrap' + (headIn ? ' in' : '')}
        style={{ position: 'relative', zIndex: 1, textAlign: 'center',
          padding: 'clamp(70px,12vh,130px) 24px clamp(20px,4vh,44px)' }}>
        <span className="ax-rev ax-eyebrow" style={{ display: 'inline-block', color: t.mute, padding: '7px 16px',
          borderRadius: 100, border: t.cardBorder, background: t.cardBg, transitionDelay: '0s',
          WebkitBackdropFilter: t.blur, backdropFilter: t.blur }}>Past 5 Days</span>
        <h2 className="ax-rev ax-hl" style={{ fontSize: 'clamp(30px,3.8vw,46px)', lineHeight: 1.14, color: t.hl,
          margin: '18px 0 10px', transitionDelay: '.1s' }}>어제까지의 모든 소식</h2>
        <p className="ax-rev ax-body" style={{ fontSize: 16, color: t.body, margin: 0, transitionDelay: '.2s' }}>
          스크롤하면 지난 5일의 카드덱이 펼쳐집니다 · 카드를 누르면 크게 열립니다</p>
      </div>
      <section ref={scrollRef} className="ax-gal-scroll" style={{ height: '300vh' }} data-screen-label="아카이브">
        <div className="ax-gal-sticky">
          <div ref={gridRef} className="ax-gal-grid">
            {days.map((day, i) => (
              <div key={day.date} className="ax-gal-col" ref={(el) => { cols.current[i] = el; }}
                style={{ marginTop: baseMt[i % baseMt.length] }}>
                <GalleryColHeader day={day} isLast={i === days.length - 1} t={t} />
                {day.cards.map((c, ci) => (
                  <GalleryTile key={ci} card={c} t={t} onClick={() => onOpen(day, ci)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </React.Fragment>
  );
}

/* ---- ThemedPage: fixed masthead + stacked cards + weekly archive ---- */
/* ---- MorphingTitle — gooey "liquid" text that morphs between words (AX-it →
   DESIGN → NOW) via blur + an SVG alpha-threshold filter. Vanilla port of the
   liquid-text reference (no Tailwind / TS). ---- */
/* ---- HeroSlideshow — crossfades today's card images (from the pipeline) inside
   the hero media frame. Replaces the pre-rendered GIF so it always stays in sync
   with the daily publish — no build step, reads the same pipeline/media images. ---- */
function HeroSlideshow({ images }) {
  const [idx, setIdx] = useState(0);
  const pics = (images && images.length) ? images : [];
  useEffect(() => {
    if (pics.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % pics.length), 2600);
    return () => clearInterval(id);
  }, [pics.length]);
  if (!pics.length) return null;
  return (
    <React.Fragment>
      {pics.map((src, i) => (
        <img key={i} className={'ax-hero-slide' + (i === idx ? ' on' : '')} src={src} alt=""
          loading={i === 0 ? 'eager' : 'lazy'} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      ))}
    </React.Fragment>
  );
}

function MorphingTitle({ texts, color }) {
  const wrap = useRef(), a = useRef(), b = useRef();
  useEffect(() => {
    const morphTime = 1.5, cooldownTime = 0.55;
    const GOO = 'url(#ax-threshold) blur(0.55px)';
    let i = 0, morph = 0, cooldown = 0, last = performance.now(), raf = 0, alive = true, gooOn = null;
    const goo = (on) => { if (gooOn === on || !wrap.current) return; gooOn = on; wrap.current.style.filter = on ? GOO : 'none'; };
    const setStyles = (f) => {
      const c1 = a.current, c2 = b.current; if (!c1 || !c2) return;
      c2.style.filter = `blur(${Math.min(8 / f - 8, 100)}px)`; c2.style.opacity = `${Math.pow(f, 0.4) * 100}%`;
      const inv = 1 - f;
      c1.style.filter = `blur(${Math.min(8 / inv - 8, 100)}px)`; c1.style.opacity = `${Math.pow(inv, 0.4) * 100}%`;
      c1.textContent = texts[i % texts.length];
      c2.textContent = texts[(i + 1) % texts.length];
    };
    // gooey threshold ONLY while morphing; crisp native text (no filter) at rest.
    const doMorph = () => { morph -= cooldown; cooldown = 0; let f = morph / morphTime; if (f > 1) { cooldown = cooldownTime; f = 1; } goo(f < 1); setStyles(f); if (f === 1) i++; };
    const doCooldown = () => { morph = 0; goo(false); const c1 = a.current, c2 = b.current; if (c1 && c2) { c2.style.filter = 'none'; c2.style.opacity = '100%'; c1.style.filter = 'none'; c1.style.opacity = '0%'; } };
    const animate = () => {
      if (!alive) return;
      raf = requestAnimationFrame(animate);
      const now = performance.now(); const dt = (now - last) / 1000; last = now;
      cooldown -= dt; morph += dt;
      if (cooldown <= 0) doMorph(); else doCooldown();
    };
    animate();
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, []);
  return (
    <span ref={wrap} className="ax-morph" style={{ color }}>
      <span ref={a} />
      <span ref={b} />
    </span>
  );
}

/* ---- HeroExpand — scroll-expansion cover: site backdrop behind, a portrait
   rounded media (today's 5 thumbnails as a slideshow GIF) that grows to fill the
   whole screen on scroll, then hands off to the first news card. The morphing
   "AX-it / DESIGN / NOW" title sits above the media and, on scroll, rises to the
   top-center where it pins as the fixed logo. Native scroll-driven. ---- */
function HeroExpand({ t }) {
  const zoneRef = useRef(), stickyRef = useRef(), mediaRef = useRef(), logoRef = useRef(),
        scrimRef = useRef(), dateRef = useRef(), hintRef = useRef();
  const d = new Date();
  const edition = `Daily Brief · ${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  useEffect(() => {
    const c01 = (x) => Math.max(0, Math.min(1, x));
    const lerp = (a, b, x) => a + (b - a) * x;
    let raf = 0, alive = true;
    const apply = () => {
      const zone = zoneRef.current; if (!zone) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      // Expansion finishes near the very end of the pin distance (only a tiny hold),
      // so the GIF reaches full-screen right as the section unpins straight into the
      // first news card — no long "filled, keep scrolling" dead zone.
      const denom = Math.max(1, (zone.offsetHeight - vh) * 0.92);
      const p = c01((window.scrollY - zone.offsetTop) / denom);
      const mob = window.matchMedia('(max-width:860px)').matches;
      const startW = mob ? 280 : 320, startH = mob ? 360 : 420;
      if (mediaRef.current) {
        const ease = p * p * (3 - 2 * p);                 // smoothstep
        mediaRef.current.style.width = lerp(startW, vw, ease) + 'px';
        mediaRef.current.style.height = lerp(startH, vh, ease) + 'px';
        mediaRef.current.style.borderRadius = lerp(24, 0, c01((p - 0.5) / 0.45)) + 'px';
        const edge = c01((p - 0.72) / 0.28);
        mediaRef.current.style.borderColor = `rgba(255,255,255,${0.16 * (1 - edge)})`;
        mediaRef.current.style.boxShadow = edge > 0.98 ? 'none' : `0 50px 130px -34px rgba(0,0,0,${0.55 * (1 - edge)})`;
      }
      // ---- vertical layout: title → edition date → GIF card. Anchor off the GIF's
      // ACTUAL rendered top so the gaps are exact (logo sits just above the date,
      // date a comfortable gap above the GIF). While pinned, sticky-top ≈ viewport. ----
      const titleH = mob ? 40 : 58;
      const gTop = mediaRef.current ? mediaRef.current.getBoundingClientRect().top : (vh * 0.5 - startH / 2);
      const dateTop = gTop - 50 - 17;                    // ~50px gap above the GIF (date line ~17px)
      const landTop = Math.max(16, dateTop - 8 - titleH); // title just above (≈8px) the date
      // logo rises from above the media to the top-center and pins (stays fixed).
      const pT = c01(p / 0.55);
      if (logoRef.current) {
        logoRef.current.style.top = lerp(landTop, 12, pT) + 'px';
        logoRef.current.style.transform = `translateX(-50%) scale(${lerp(1, 0.5, pT)})`;
      }
      if (scrimRef.current) scrimRef.current.style.opacity = pT;
      if (dateRef.current) {
        dateRef.current.style.top = dateTop + 'px';       // fades out as the GIF grows
        dateRef.current.style.opacity = c01(1 - p * 2.6);
      }
      // keep the scroll cue until the first news card is FULLY up (scrollY ≈ zone end),
      // so the full-screen GIF isn't mistaken for the news and people keep scrolling.
      if (hintRef.current) {
        const cardFullY = zone.offsetTop + zone.offsetHeight - vh * 0.04;
        hintRef.current.style.opacity = c01((cardFullY - window.scrollY) / (vh * 0.5));
      }
    };
    apply();
    // one rAF per frame, only while scrolling/resizing (no always-on loop).
    const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(); }); };
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  return (
    <React.Fragment>
      {/* gooey alpha-threshold filter for the morphing title */}
      <svg className="ax-svgdefs" aria-hidden width="0" height="0">
        <defs>
          <filter id="ax-threshold">
            <feColorMatrix in="SourceGraphic" type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 255 -140" />
          </filter>
        </defs>
      </svg>
      <div ref={scrimRef} className="ax-logo-scrim" aria-hidden style={{ opacity: 0 }} />
      <h1 ref={logoRef} className="ax-hero-logo" style={{ top: '14vh', transform: 'translateX(-50%) scale(1)' }}>
        <MorphingTitle texts={['AX-it', 'DESIGN', 'NOW']} color={t.hl} />
      </h1>
      <section ref={zoneRef} className="ax-hero" style={{ height: '180vh' }} data-screen-label="표지">
        <div ref={stickyRef} className="ax-hero-sticky">
          <div ref={mediaRef} className="ax-hero-media" style={{ width: 320, height: 440 }}>
            <HeroSlideshow images={(window.AX_NEWS || []).map((n) => n.image).filter(Boolean)} />
            <div className="ax-hero-mscrim" />
          </div>
          <p ref={dateRef} className="ax-hero-date" style={{ color: t.hl }}>{edition}</p>
        </div>
      </section>
      {/* scroll cue stays pinned at the bottom through the whole hero — until the
          first news card is fully up — so the full-screen GIF isn't mistaken for it */}
      <div ref={hintRef} className="ax-hero-hint" aria-hidden>
        <span>SCROLL</span>
        <span className="ax-hint-arrow">↓</span>
      </div>
    </React.Fragment>
  );
}

function ThemedPage({ themeKey }) {
  const t = THEMES[themeKey] || THEMES.zen;
  const [modal, setModal] = useState(null);
  const openCard = (day, ci) => setModal(day.cards[ci]);

  /* Native scroll drives the page: scroll-expansion hero → sticky stack cards →
     archive. (The old magnetic-snap wheel controller was removed so the hero can
     lead the page without scroll-index conflicts; sticky cards still pin/stack.) */
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: t.briefBg, boxSizing: 'border-box' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}><ThemeBackdrop t={t} /></div>
      <main style={{ position: 'relative', zIndex: 1 }}>
        <HeroExpand t={t} />
        <StackSection items={window.AX_NEWS} t={t} />
        <ArchiveGallery t={t} onOpen={openCard} />
      </main>
      {modal && <CardModal card={modal} t={t} onClose={() => setModal(null)} />}
    </div>
  );
}

Object.assign(window, { THEMES, MediaScene, Motif, axEnrich, CardScene, CardOverlay, StackCard, StackSection, GalleryTile, GalleryColHeader, ArchiveGallery, CardModal, Masthead, ThemedPage });
