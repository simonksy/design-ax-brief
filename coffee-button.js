/* ============================================================
   Coffee → QR floating button (shared by both designs)
   A round coffee button pinned bottom-right; on hover it bubbles
   open into the LinkTo donation QR card. The "https://link2.my/@simonksy"
   link inside the card is a live, clickable hyperlink. Standalone
   vanilla JS — both HTML pages just load this file.
   ============================================================ */
(function () {
  if (window.__axCoffeeMounted) return;
  window.__axCoffeeMounted = true;

  var LINK = 'https://link2.my/@simonksy';

  function mount() {
    if (document.getElementById('ax-coffee-wrap')) return;

    if (!document.getElementById('ax-coffee-styles')) {
      var s = document.createElement('style');
      s.id = 'ax-coffee-styles';
      s.textContent = [
        '#ax-coffee-wrap{position:fixed;right:24px;bottom:24px;z-index:2147483000;}',
        '#ax-coffee-btn{position:absolute;right:0;bottom:0;width:62px;height:62px;',
        '  border-radius:50%;overflow:hidden;background:#f5c518;',
        '  border:1.5px solid rgba(255,255,255,.65);',
        '  box-shadow:0 8px 22px -6px rgba(40,28,8,.5),0 2px 6px rgba(0,0,0,.18);',
        '  transition:width .5s cubic-bezier(.34,1.56,.64,1),height .5s cubic-bezier(.34,1.56,.64,1),',
        '             border-radius .5s cubic-bezier(.34,1.56,.64,1),box-shadow .4s ease;}',
        '#ax-coffee-btn img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;',
        '  transition:opacity .35s ease;pointer-events:none;}',
        '#ax-coffee-qr{opacity:0;background:#fff;}',
        // the live hyperlink over the card. Collapsed: covers the whole coffee
        // circle (so a click opens the link). Expanded: shrinks to sit exactly on
        // the "https://link2.my/@simonksy" text row, leaving the QR free to scan.
        '#ax-coffee-link{position:absolute;left:0;top:0;right:0;bottom:0;z-index:3;display:block;',
        '  border-radius:50%;cursor:pointer;text-decoration:none;',
        '  transition:left .5s cubic-bezier(.34,1.56,.64,1),right .5s cubic-bezier(.34,1.56,.64,1),',
        '             top .5s cubic-bezier(.34,1.56,.64,1),bottom .5s cubic-bezier(.34,1.56,.64,1),',
        '             border-radius .4s ease,background .25s ease;}',
        // open state is driven by JS (mouseenter/leave → .is-open), NOT CSS :hover —
        // :hover re-tests the element's box every frame, so at the icon's edge the
        // animating box flickers hover on/off and the expand loops. mouseenter/leave
        // fire once per real cross, and once open the cursor is inside the larger box.
        '#ax-coffee-btn.is-open{width:300px;height:374px;border-radius:24px;',
        '  box-shadow:0 28px 64px -16px rgba(40,28,8,.45),0 4px 12px rgba(0,0,0,.16);}',
        '#ax-coffee-btn.is-open #ax-coffee-coffee{opacity:0;}',
        '#ax-coffee-btn.is-open #ax-coffee-qr{opacity:1;}',
        '#ax-coffee-btn.is-open #ax-coffee-link{left:15%;right:15%;top:81.5%;bottom:9.5%;border-radius:7px;}',
        '#ax-coffee-btn.is-open #ax-coffee-link:hover{background:rgba(120,80,255,.12);}',
        // Pulse ring — concentric with the collapsed coffee (same 62px center), and
        // shown ONLY while fully collapsed (JS toggles .ax-idle). It is removed during
        // the expand/shrink transition so the wave never floats around a resizing card.
        '@media (prefers-reduced-motion: no-preference){',
        '  #ax-coffee-wrap.ax-idle::after{content:"";position:absolute;right:0;bottom:0;width:62px;height:62px;',
        '    border-radius:50%;pointer-events:none;box-shadow:0 0 0 0 rgba(245,197,24,.55);',
        '    animation:axCoffeePulse 2.6s ease-out infinite;}}',
        '@keyframes axCoffeePulse{0%{box-shadow:0 0 0 0 rgba(245,197,24,.5)}',
        '  70%{box-shadow:0 0 0 14px rgba(245,197,24,0)}100%{box-shadow:0 0 0 0 rgba(245,197,24,0)}}',
        '@media (max-width:860px){#ax-coffee-btn.is-open{width:262px;height:327px;}}'
      ].join('\n');
      document.head.appendChild(s);
    }

    var wrap = document.createElement('div');
    wrap.id = 'ax-coffee-wrap';

    var btn = document.createElement('div');
    btn.id = 'ax-coffee-btn';

    var coffee = document.createElement('img');
    coffee.id = 'ax-coffee-coffee';
    coffee.src = 'assets/coffee.jpg';
    coffee.alt = '커피 한 잔 후원';

    var qr = document.createElement('img');
    qr.id = 'ax-coffee-qr';
    qr.src = 'assets/linktoQR.png';
    qr.alt = '후원 QR 코드 — @simonksy';
    qr.loading = 'lazy';

    var link = document.createElement('a');
    link.id = 'ax-coffee-link';
    link.href = LINK;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', '후원 링크 열기 — link2.my/@simonksy');

    btn.appendChild(coffee);
    btn.appendChild(qr);
    btn.appendChild(link);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);

    // Open/close from a STABLE hit-test, not the animating element. Hit-testing the
    // element itself (via :hover OR mouseenter/leave) flickers at the edge because the
    // box (and its border-radius) animates under a near-stationary cursor. Instead we
    // test the pointer against fixed rectangles with hysteresis: OPEN when inside the
    // small resting box, CLOSE only when outside the full expanded box (+margin). The
    // rectangles never animate, so there is no in/out oscillation.
    var open = false, idleTimer = 0, reg = null;
    function calcRegions() {
      var r = wrap.getBoundingClientRect();        // 0x0 box pinned at the bottom-right anchor
      var rx = r.right, by = r.bottom, M = 8;
      reg = { cl: rx - 62, ct: by - 62, cr: rx, cb: by,                       // collapsed (open trigger)
              el: rx - 300 - M, et: by - 374 - M, er: rx + M, eb: by + M };   // expanded (close boundary)
    }
    function setOpen(v) {
      if (v === open) return;
      open = v;
      btn.classList.toggle('is-open', v);
      clearTimeout(idleTimer);
      if (v) wrap.classList.remove('ax-idle');
      else idleTimer = setTimeout(function () { if (!open) wrap.classList.add('ax-idle'); }, 560);
    }
    wrap.classList.add('ax-idle');
    calcRegions();
    window.addEventListener('resize', calcRegions);
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;   // touch taps the link directly
      if (!reg) calcRegions();
      var x = e.clientX, y = e.clientY;
      if (!open) {
        if (x >= reg.cl && x <= reg.cr && y >= reg.ct && y <= reg.cb) setOpen(true);
      } else {
        if (x < reg.el || x > reg.er || y < reg.et || y > reg.eb) setOpen(false);
      }
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
