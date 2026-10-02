// i18n.js — loaded right after i18n/<lang>.js on every page.
(function () {
  var LANG = window.AX_LANG || "ko";
  window.AX_LANG = LANG;
  var TAGS = { en: "en-US", ko: "ko-KR", ja: "ja-JP", zh: "zh-CN", es: "es-ES" };
  window.AX_LANG_TAG = TAGS[LANG] || "ko-KR";
  window.t = function (key, vars) {
    var own = Object.prototype.hasOwnProperty;
    var s = window.AX_I18N && own.call(window.AX_I18N, key) ? window.AX_I18N[key]
      : window.AX_I18N_KO && own.call(window.AX_I18N_KO, key) ? window.AX_I18N_KO[key] : key;
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  };
  window.axDate = function (dateStr, style) {
    var d = new Date(dateStr);
    if (style === "weekday") return new Intl.DateTimeFormat(window.AX_LANG_TAG, { weekday: "short" }).format(d);
    if (LANG === "ko") return (d.getMonth() + 1) + "." + String(d.getDate()).padStart(2, "0");
    return new Intl.DateTimeFormat(window.AX_LANG_TAG, { month: "short", day: "numeric" }).format(d);
  };
  window.axSetLang = function (lang) {
    document.cookie = "ax_lang=" + lang + "; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
    var sub = (location.pathname.match(/\/(large|archive)(\.html)?$/) || [])[1];
    location.href = "/" + lang + "/" + (sub || "") + location.search;
  };
  // Globe language picker, top-right corner of every page (scrolls away with the
  // masthead). Shown only behind the preview flag the Worker injects (AX_I18N_ON).
  // A transparent native <select> sits over the icon so phones get their own picker.
  // Language names are fixed endonyms, never translated.
  window.AX_LANG_NAMES = [["en", "English"], ["ko", "한국어"], ["ja", "日本語"], ["zh", "中文"], ["es", "Español"]];
  window.axMountGlobe = function () {
    if (!window.AX_I18N_ON || document.getElementById("ax-globe")) return;
    var css = document.createElement("style");
    css.textContent =
      // 상단 고정 바 — 스크롤해도 늘 보인다. 배경은 불투명(반투명이면 윈도우에서
      // ClearType이 꺼진다). 버튼들은 바 안의 flex 아이템이되 position:relative를
      // 유지한다 — static으로 두면 Pro의 빛 쓸기(::after)와 지구본의 투명 select가
      // 기준점을 잃고 페이지 전체에 앵커된다.
      "#ax-topbar{position:fixed;top:0;left:0;right:0;height:52px;z-index:300;display:flex;" +
      "align-items:center;justify-content:flex-end;gap:8px;padding:0 14px;box-sizing:border-box;" +
      // 별도 영역처럼 보이지 않게 — 페이지 맨 위 배경색 그대로에 가는 구분선만.
      "background:#f4f0e9;border-bottom:1px solid rgba(40,30,20,.07);}" +
      "body{padding-top:52px;}html.ax-nobar body{padding-top:0;}" +
      // 폰에서는 React가 그리는 고정바 1줄이 버튼의 자리다 — 이 바는 쓰지 않는다.
      "@media (max-width:720px){#ax-topbar{display:none;}body{padding-top:0;}}" +
      "#ax-globe{position:relative;z-index:200;flex:0 0 auto;display:flex;align-items:center;" +
      "justify-content:center;width:36px;height:36px;border-radius:50%;border:1px solid rgba(23,23,23,.22);" +
      "background:#fdfbf7;" +
      "color:#4a4540;" +
      "box-shadow:0 4px 14px -8px rgba(40,30,20,.45);}" +
      "#ax-globe:hover{border-color:rgba(23,23,23,.35);}" +
      "#ax-globe:focus-within{outline:2px solid #0070f3;outline-offset:2px;}" +
      "#ax-globe svg{width:17px;height:17px;flex:0 0 auto;}" +
      "#ax-globe select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;" +
      "appearance:none;-webkit-appearance:none;border:0;font-size:16px;}" +
      // Pro 버튼은 이 사이트에서 돈이 들어오는 유일한 입구다. 주변의 담백한 알약들과
      // 같은 옷을 입고 있으면 아무도 누르지 않는다 — 그라데이션으로 칠하고, 천천히
      // 흐르게 두고, 가끔 빛이 한 번 쓸고 지나가게 한다.
      "#ax-pro{position:relative;z-index:200;flex:0 0 auto;display:flex;align-items:center;" +
      "justify-content:center;height:36px;padding:0 16px;border-radius:10px;border:none;overflow:hidden;" +
      "background:linear-gradient(110deg,#7928ca,#0070f3,#eb367f,#7928ca);background-size:300% 100%;" +
      "animation:axprohue 9s linear infinite;" +
      "color:#fff;cursor:pointer;font-family:Pretendard,system-ui,sans-serif;font-size:13px;font-weight:700;" +
      "letter-spacing:-0.005em;white-space:nowrap;box-shadow:0 5px 18px -6px rgba(121,40,202,.7);" +
      "transition:transform .15s ease,box-shadow .15s ease;}" +
      "@keyframes axprohue{0%{background-position:0% 50%}100%{background-position:300% 50%}}" +
      // 빛 한 줄이 6초마다 버튼을 쓸고 지나간다 — 시선을 끌되 계속 번쩍이지는 않는다.
      "#ax-pro::after{content:'';position:absolute;top:0;bottom:0;width:38%;left:-45%;" +
      "background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);" +
      "animation:axproshine 6s ease-in-out infinite;}" +
      "@keyframes axproshine{0%,72%{left:-45%}92%,100%{left:115%}}" +
      "#ax-pro:hover{transform:translateY(-1px);box-shadow:0 8px 22px -6px rgba(121,40,202,.85);}" +
      "#ax-pro:active{transform:scale(.97);}" +
      "#ax-pro>span{position:relative;z-index:1;}" +
      "#ax-pro:focus-visible{outline:2px solid #0070f3;outline-offset:2px;}" +
      "#ax-pro .ax-pro-short{display:none;}" +
      // 이미 구독한 사람이 새 기기에서 들어오면 로그인할 입구가 있어야 한다.
      // 로그인 상태를 알기 전/로그인한 뒤에는 감춘다 — right 값은 Pro 버튼의
      // 실제 너비를 재서 JS가 정한다(문구 길이가 언어마다 다르다).
      "#ax-login{position:relative;z-index:200;flex:0 0 auto;display:flex;align-items:center;" +
      "justify-content:center;height:36px;padding:0 16px;border-radius:10px;" +
      "border:1px solid #1c1a18;background:#1c1a18;" +
      "color:#3a352f;" +
      "cursor:pointer;font-family:Pretendard,system-ui,sans-serif;font-size:13px;font-weight:700;color:#fff;" +
      "letter-spacing:-0.005em;white-space:nowrap;box-shadow:0 4px 14px -8px rgba(40,30,20,.45);}" +
      "#ax-login.signed-in{display:none;}" +
      "#ax-login:hover{background:#2e2a26;border-color:#2e2a26;}" +
      "#ax-login:focus-visible{outline:2px solid #0070f3;outline-offset:2px;}" +
      "#ax-login .ax-login-short{display:none;}" +
      // 폰: 버튼 셋 대신 더보기 하나. 누르면 오른쪽에서 사이드바가 열린다.
      "#ax-menu{display:none;position:relative;width:38px;height:38px;border-radius:10px;" +
      "align-items:center;justify-content:center;border:1px solid rgba(23,23,23,.22);" +
      "background:#fdfbf7;color:#1c1a18;cursor:pointer;padding:0;flex:0 0 auto;}" +
      "#ax-menu:focus-visible{outline:2px solid #0070f3;outline-offset:2px;}" +
      "#ax-scrim{position:fixed;inset:0;z-index:400;background:rgba(20,16,12,.5);" +
      "opacity:0;pointer-events:none;transition:opacity .22s ease;}" +
      "#ax-scrim.open{opacity:1;pointer-events:auto;}" +
      "#ax-drawer{position:fixed;top:0;right:0;bottom:0;width:min(300px,82vw);z-index:401;" +
      "background:#f7f3ec;border-left:1px solid rgba(40,30,20,.12);box-sizing:border-box;" +
      "padding:16px 16px calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px;" +
      "transform:translateX(101%);transition:transform .26s cubic-bezier(.2,.8,.25,1);" +
      "box-shadow:-12px 0 32px -18px rgba(40,30,20,.5);}" +
      "#ax-drawer.open{transform:translateX(0);}" +
      "#ax-drawer-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}" +
      "#ax-drawer-title{font-family:Pretendard,system-ui,sans-serif;font-weight:700;font-size:15px;color:#1c1a18;}" +
      "#ax-drawer-close{width:34px;height:34px;border-radius:9px;border:1px solid rgba(23,23,23,.18);" +
      "background:#fdfbf7;color:#1c1a18;font-size:18px;line-height:1;cursor:pointer;padding:0;}" +
      // 사이드바 안에서는 알약이 아니라 메뉴 줄처럼 — 가로 꽉 차고 왼쪽 정렬.
      "#ax-drawer #ax-login,#ax-drawer #ax-pro,#ax-drawer #ax-globe{width:100%;height:46px;" +
      "border-radius:12px;justify-content:flex-start;padding:0 14px;font-size:14px;}" +
      "#ax-drawer #ax-globe{gap:10px;}" +
      "#ax-drawer #ax-globe .ax-globe-label{display:inline;}" +
      "#ax-drawer #ax-login .ax-login-full{display:none;}#ax-drawer #ax-login .ax-login-short{display:inline;}" +
      "#ax-drawer #ax-pro .ax-pro-full{display:inline;}#ax-drawer #ax-pro .ax-pro-short{display:none;}" +
      "#ax-globe .ax-globe-label{display:none;font-family:Pretendard,system-ui,sans-serif;font-weight:700;}" +
      "@media (max-width:720px){#ax-menu{display:flex;}}" +
      // 구독 중일 때 Pro 버튼 — 모션을 멈추고 차분한 완료 상태로 바꾼다.
      "#ax-pro.is-pro{animation:none;background:linear-gradient(110deg,#7928ca,#0070f3);" +
      "background-size:100% 100%;}" +
      "#ax-pro.is-pro::after{display:none;}" +
      // 모션을 줄여 달라는 설정은 존중한다 — 색만 남기고 움직임은 멈춘다.
      "@media (prefers-reduced-motion:reduce){#ax-pro{animation:none;}#ax-pro::after{display:none;}}" +
      "@media (max-width:720px){#ax-pro .ax-pro-full{display:none;}#ax-pro .ax-pro-short{display:inline;}" +
      "#ax-login .ax-login-full{display:none;}#ax-login .ax-login-short{display:inline;}}";
    document.head.appendChild(css);
    var box = document.createElement("div");
    box.id = "ax-globe";
    box.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2' +
      'M12 2.8C9.4 5.4 8.1 8.4 8.1 12s1.3 6.6 3.9 9.2"/></svg>';
    var sel = document.createElement("select");
    sel.setAttribute("aria-label", window.t("lang.menu"));
    sel.title = window.t("lang.menu");
    window.AX_LANG_NAMES.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o[0]; opt.textContent = o[1];
      sel.appendChild(opt);
    });
    sel.value = LANG;
    sel.onchange = function () { window.axSetLang(sel.value); };
    var globeLabel = document.createElement("span");
    globeLabel.className = "ax-globe-label";
    (window.AX_LANG_NAMES.find(function (o) { return o[0] === LANG; }) || [])[1]
      && (globeLabel.textContent = window.AX_LANG_NAMES.find(function (o) { return o[0] === LANG; })[1]);
    box.appendChild(globeLabel);
    box.appendChild(sel);
    document.body.appendChild(box);
    // Pro entry point, left of the globe — same pill/blur treatment, same gate.
    // i18n.js has no React, so a click just announces intent; ThemedPage listens
    // and opens SubscribeModal.
    var proBtn = document.createElement("button");
    proBtn.id = "ax-pro";
    proBtn.type = "button";
    proBtn.innerHTML =
      '<span class="ax-pro-full"></span><span class="ax-pro-short"></span>';
    proBtn.querySelector(".ax-pro-full").textContent = window.t("pro.cta");
    proBtn.querySelector(".ax-pro-short").textContent = window.t("pro.cta_short");
    proBtn.onclick = function () { window.dispatchEvent(new CustomEvent("ax:subscribe")); };
    document.body.appendChild(proBtn);

    // 로그인 버튼 — 이미 구독한 사람이 새 기기에서 들어왔을 때의 입구.
    var loginBtn = document.createElement("button");
    loginBtn.id = "ax-login";
    loginBtn.type = "button";
    loginBtn.innerHTML = '<span class="ax-login-full"></span><span class="ax-login-short"></span>';
    loginBtn.querySelector(".ax-login-full").textContent = window.t("auth.login");
    loginBtn.querySelector(".ax-login-short").textContent = window.t("auth.login_short");
    loginBtn.onclick = function () { window.dispatchEvent(new CustomEvent("ax:login")); };
    document.body.appendChild(loginBtn);

    // 세 버튼은 상단 고정 바에 담긴다. 예전에는 body에 절대위치로 띄우고 폰에서
    // 로고 중심선에 맞췄는데, 버튼이 셋이 되면서 로고를 파고들었다. 고정 바는
    // 그 계산 자체를 없앤다 — 스크롤해도 늘 보이는 건 덤이다.
    // React가 /api/me를 읽고 나면 이걸 불러 준다. 로그인 상태를 모르는 동안에는
    // 로그인 버튼을 감춰 둔다 — Pro 구독자에게 잠깐 떴다 사라지는 게 더 어색하다.
    window.axSetAuthUI = function (auth) {
      var entitled = !!(auth && auth.entitled);
      var loggedIn = !!(auth && auth.loggedIn);
      proBtn.classList.toggle("is-pro", entitled);
      proBtn.querySelector(".ax-pro-full").textContent =
        window.t(entitled ? "pro.cta_active" : "pro.cta");
      proBtn.querySelector(".ax-pro-short").textContent =
        window.t(entitled ? "pro.cta_active_short" : "pro.cta_short");
      loginBtn.classList.toggle("signed-in", loggedIn);
    };

    // 더보기 버튼과 사이드바 — 폰에서 버튼 셋을 한 곳에 모은다.
    var menuBtn = document.createElement("button");
    menuBtn.id = "ax-menu";
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-label", window.t("nav.menu"));
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.innerHTML =
      '<svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor"' +
      ' stroke-width="1.9" stroke-linecap="round" aria-hidden>' +
      '<path d="M3 5.5h14M3 10h14M3 14.5h14"/></svg>';

    var scrim = document.createElement("div");
    scrim.id = "ax-scrim";
    var drawer = document.createElement("div");
    drawer.id = "ax-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", window.t("nav.menu"));
    var head = document.createElement("div");
    head.id = "ax-drawer-head";
    var dTitle = document.createElement("span");
    dTitle.id = "ax-drawer-title";
    dTitle.textContent = window.t("nav.menu");
    var closeBtn = document.createElement("button");
    closeBtn.id = "ax-drawer-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", window.t("common.close"));
    closeBtn.innerHTML = "&times;";
    head.appendChild(dTitle); head.appendChild(closeBtn);
    drawer.appendChild(head);
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);

    var setMenu = function (open) {
      scrim.classList.toggle("open", open);
      drawer.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      // 열려 있는 동안 뒤 페이지가 스크롤되지 않게 — 폰에서 특히 거슬린다.
      document.documentElement.style.overflow = open ? "hidden" : "";
    };
    menuBtn.onclick = function () { setMenu(true); };
    closeBtn.onclick = function () { setMenu(false); };
    scrim.onclick = function () { setMenu(false); };
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
    // 사이드바 안에서 뭔가를 고르면 닫는다 — 모달이 그 뒤에 뜨므로 겹치면 안 된다.
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("#ax-login,#ax-pro")) setMenu(false);
    });
    sel.addEventListener("change", function () { setMenu(false); });

    var bar = document.createElement("div");
    bar.id = "ax-topbar";
    document.body.appendChild(bar);

    // 버튼은 한 벌뿐이라 자리를 옮겨 다닌다. 기본은 이 상단 바, 폰에서 스티키
    // 헤더가 내려와 있는 동안만 그 첫 줄(#ax-actions-m)로 간다 — React가
    // axPlaceActions로 알려 준다. 두 벌을 동시에 띄우지 않기 위해서다.
    // 폰에서 #ax-actions-d는 CSS로 감춰져 있다 — 거기 담으면 버튼이 사라진다.
    // 그리고 아래 interval이 place()를 계속 부르므로, React가 알려 준 마지막
    // 상태(wantMobile)를 기억해 두지 않으면 폰에서 바로 되돌려 버린다.
    var wantMobile = false;
    // 데스크톱의 React 페이지에서는 버튼이 결국 카테고리 줄로 간다. 그때까지 상단
    // 바에 담아 두면 새로고침마다 우상단에 잠깐 떴다가 사라진다 — 그 자리를 아예
    // 거치지 않도록, 자리가 생길 때까지 바를 비워 둔다. React가 없는 페이지
    // (archive 등)와 폰에서는 상단 바가 제자리이므로 바로 보여 준다.
    var reactPage = !!document.getElementById("root");
    var place = function (useMobileSlot) {
      if (typeof useMobileSlot === "boolean") wantMobile = useMobileSlot;
      var phone = window.innerWidth <= 720;
      var slot = phone
        ? (wantMobile ? document.getElementById("ax-actions-m") : null)
        : document.getElementById("ax-actions-d");
      if (!slot && reactPage && !phone) { bar.style.display = "none"; return; }
      if (phone) {
        // 줄에는 더보기 하나만, 실제 버튼 셋은 사이드바 안에 둔다.
        if (slot && menuBtn.parentNode !== slot) slot.appendChild(menuBtn);
        if (loginBtn.parentNode !== drawer) {
          drawer.appendChild(loginBtn); drawer.appendChild(proBtn); drawer.appendChild(box);
        }
        bar.style.display = "none";
        document.documentElement.classList.add("ax-nobar");
        return;
      }
      if (menuBtn.parentNode) menuBtn.parentNode.removeChild(menuBtn);
      setMenu(false);
      var host = slot || bar;
      // 카테고리 줄(데스크톱)이나 스티키 바(폰)에 담겼으면 상단 바는 비워 둔다.
      // React가 없는 페이지(archive)에는 두 자리가 다 없어 상단 바가 폴백이 된다.
      bar.style.display = slot ? "none" : "";
      // 바를 감추면 그 자리를 비워 두던 여백도 걷는다 — 안 그러면 위에 빈 띠가 남는다.
      document.documentElement.classList.toggle("ax-nobar", !!slot);
      if (loginBtn.parentNode === host) return;
      host.appendChild(loginBtn);
      host.appendChild(proBtn);
      host.appendChild(box);
    };
    window.axPlaceActions = place;
    place(false);
    window.addEventListener("resize", function () { place(); });
    // React가 자리를 그릴 때까지 잠깐 쫓는다.
    var tries = 0, tick = setInterval(function () {
      place(); if (++tries > 80) clearInterval(tick);
    }, 100);

  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", window.axMountGlobe);
  else window.axMountGlobe();
})();
