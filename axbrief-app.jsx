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
     letter-spacing:-0.02em;text-wrap:balance;margin:0;}
  .ax-body{font-family:'Pretendard',var(--font-sans);font-weight:400;letter-spacing:-0.01em;margin:0;}
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
function MediaScene({ item, active, bold }) {
  const a = item.accent;
  const cls = 'ax-scene' + (active ? ' ax-active' : '');
  if (item.image) {
    return (
      <div className={cls} style={{ background: '#efe9e1' }}>
        <img src={item.image} alt="" loading="lazy"
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
function LayoutEditorial({ item, index, total, active, t }) {
  const it = axEnrich(item);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ position: 'relative', flex: '0 0 auto', aspectRatio: '4 / 3' }}>
        <MediaScene item={it} active={active} bold={t.bold} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '22px 26px 22px' }}>
        <Eyebrow item={it} index={index} total={total} t={t} />
        <h2 className="ax-hl" style={{ fontSize: 28, lineHeight: 1.17, marginTop: 14, color: t.hl }}>{it.headline}</h2>
        {/* wrapper is the flex item (blockified safely); the <p> stays a real
            -webkit-box so -webkit-line-clamp actually caps at 3 lines */}
        <div style={{ flex: '0 0 auto', marginTop: 12 }}>
          <p className="ax-body" style={{ fontSize: 15, lineHeight: 1.55, margin: 0, color: t.body,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            maxHeight: 'calc(1.55em * 3)' }}>{it.body}</p>
        </div>
        <div style={{ flex: 1, minHeight: 14 }} />
        <div style={{ flex: '0 0 auto', borderTop: `1px solid ${t.rule}`, paddingTop: 14, marginTop: 18 }}>
          <SourceLine item={it} t={t} />
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
function Carousel({ items, t, initialIndex = 0 }) {
  const [idx, setIdx] = useState(initialIndex);
  const startX = useRef(0); const dx = useRef(0);
  const total = items.length;
  const go = useCallback((i) => setIdx(Math.max(0, Math.min(total - 1, i))), [total]);
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; dx.current = 0; };
  const onTouchMove = (e) => { dx.current = e.touches[0].clientX - startX.current; };
  const onTouchEnd = () => { if (Math.abs(dx.current) > 44) go(idx + (dx.current < 0 ? 1 : -1)); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="ax-heroin" style={{ flex: 1, minHeight: 0, overflow: 'hidden',
        borderRadius: t.radius, border: t.cardBorder, boxShadow: t.cardShadow,
        background: t.cardBg, WebkitBackdropFilter: t.blur, backdropFilter: t.blur }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="ax-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {items.map((it, i) => (
            <div className="ax-slide" key={i}>
              <LayoutEditorial item={it} index={i} total={total} active={i === idx} t={t} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 16 }}>
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
  const { text1Ref, text2Ref } = useMorphingText(texts);
  const spanStyle = {
    position: 'absolute', left: 0, top: 0, display: 'inline-block',
    width: '100%', textAlign: 'center', whiteSpace: 'nowrap',
  };
  return (
    <div style={{
      position: 'relative', width, height, margin: '0 auto',
      fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize,
      letterSpacing: '-0.04em', lineHeight: `${height}px`, color,
      filter: 'url(#ax-threshold) blur(0.35px)',
    }}>
      <span ref={text1Ref} style={spanStyle} />
      <span ref={text2Ref} style={spanStyle} />
      <svg className="ax-hidden-svg" style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="ax-threshold" x="-15%" y="-15%" width="130%" height="130%"
            colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

/* ---- masthead ---- */
function Masthead({ t }) {
  const d = new Date();
  const ds = `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 24 }}>
      <MorphingTitle texts={['AX-it', 'DESIGN', 'NOW']} color={t.hl} />
      <div className="ax-eyebrow" style={{ color: t.mute, marginTop: 8 }}>Daily Brief · {ds}</div>
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
          <img src={card.image} alt="" loading="lazy"
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
function WeeklyTimeline({ t, onOpen }) {
  const days = window.AX_DAYS;
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

/* ---- ThemedPage: hero carousel + weekly deck timeline (one theme) ---- */
function ThemedPage({ themeKey }) {
  const t = THEMES[themeKey];
  const heroRef = useRef();
  const [hero, setHero] = useState({ items: window.AX_NEWS, index: 0, key: 0, day: null });
  const [intro, setIntro] = useState(null);
  const openDay = (day, cardIdx) => {
    setHero({ items: day.cards, index: cardIdx, key: Date.now(), day });
    setIntro({ day, cardIdx, k: Date.now() });
    if (heroRef.current) {
      const top = heroRef.current.getBoundingClientRect().top + window.scrollY - 28;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };
  const backToToday = () => {
    setIntro(null);
    setHero({ items: window.AX_NEWS, index: 0, key: Date.now(), day: null });
    if (heroRef.current) {
      const top = heroRef.current.getBoundingClientRect().top + window.scrollY - 28;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };
  const viewing = hero.day ? `${new Date(hero.day.date).getMonth() + 1}.${String(new Date(hero.day.date).getDate()).padStart(2, '0')} 소식 보는 중` : null;
  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'visible', background: t.briefBg, boxSizing: 'border-box' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}><ThemeBackdrop t={t} /></div>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto', padding: '34px 40px 90px', boxSizing: 'border-box' }}>
        <Masthead t={t} />
        {/* back-to-today control — shown only while viewing a past day */}
        <div style={{ height: 30, marginTop: 10, textAlign: 'center' }}>
          {hero.day && (
            <button onClick={backToToday} className="ax-eyebrow" style={{ cursor: 'pointer',
              border: t.cardBorder, background: t.cardBg, color: t.hl, padding: '7px 15px', borderRadius: 100,
              WebkitBackdropFilter: t.blur, backdropFilter: t.blur, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden>←</span> 오늘 소식으로
              <span style={{ color: t.faint }}>· {viewing}</span>
            </button>
          )}
        </div>
        {/* HERO — centered vertical card */}
        <div ref={heroRef} style={{ position: 'relative', width: 480, maxWidth: '100%', height: 680, margin: '8px auto 0' }}>
          <Carousel key={'hero' + hero.key} items={hero.items} initialIndex={hero.index} t={t} />
          {intro && <HeroDeckIntro key={'intro' + intro.k} day={intro.day} cardIdx={intro.cardIdx} t={t} onDone={() => setIntro(null)} />}
        </div>
        {/* WEEKLY DECK TIMELINE */}
        <WeeklyTimeline t={t} onOpen={openDay} />
      </div>
    </div>
  );
}

Object.assign(window, { THEMES, MediaScene, Motif, axEnrich, LayoutEditorial, Carousel, MiniCard, DayDeck, WeeklyTimeline, HeroDeckIntro, ThemedPage });
