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
      "#ax-globe{position:absolute;top:14px;right:14px;z-index:200;display:flex;align-items:center;" +
      "justify-content:center;width:34px;height:34px;border-radius:50%;border:1px solid rgba(23,23,23,.14);" +
      "background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);" +
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
      "#ax-pro{position:absolute;top:14px;right:56px;z-index:200;display:flex;align-items:center;" +
      "justify-content:center;height:34px;padding:0 15px;border-radius:17px;border:none;overflow:hidden;" +
      "background:linear-gradient(110deg,#7928ca,#0070f3,#eb367f,#7928ca);background-size:300% 100%;" +
      "animation:axprohue 9s linear infinite;" +
      "color:#fff;cursor:pointer;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700;" +
      "letter-spacing:.06em;white-space:nowrap;box-shadow:0 5px 18px -6px rgba(121,40,202,.7);" +
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
      "#ax-login{position:absolute;top:14px;z-index:200;display:none;align-items:center;" +
      "justify-content:center;height:34px;padding:0 13px;border-radius:17px;" +
      "border:1px solid rgba(23,23,23,.14);background:rgba(255,255,255,.72);" +
      "-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#4a4540;" +
      "cursor:pointer;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;" +
      "letter-spacing:.06em;white-space:nowrap;box-shadow:0 4px 14px -8px rgba(40,30,20,.45);}" +
      "#ax-login.on{display:flex;}" +
      "#ax-login:hover{border-color:rgba(23,23,23,.35);}" +
      "#ax-login:focus-visible{outline:2px solid #0070f3;outline-offset:2px;}" +
      "#ax-login .ax-login-short{display:none;}" +
      // 구독 중일 때 Pro 버튼 — 모션을 멈추고 차분한 완료 상태로 바꾼다.
      "#ax-pro.is-pro{animation:none;background:linear-gradient(110deg,#7928ca,#0070f3);" +
      "background-size:100% 100%;}" +
      "#ax-pro.is-pro::after{display:none;}" +
      // 모션을 줄여 달라는 설정은 존중한다 — 색만 남기고 움직임은 멈춘다.
      "@media (prefers-reduced-motion:reduce){#ax-pro{animation:none;}#ax-pro::after{display:none;}}" +
      "@media (max-width:720px){#ax-globe{top:10px;right:10px;}" +
      "#ax-pro{top:10px;right:52px;}#ax-pro .ax-pro-full{display:none;}#ax-pro .ax-pro-short{display:inline;}" +
      "#ax-login{top:10px;}#ax-login .ax-login-full{display:none;}#ax-login .ax-login-short{display:inline;}}";
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

    // 가로 위치: 로그인 버튼은 Pro 버튼 왼쪽에 붙는다. Pro 버튼의 너비는 문구
    // 길이(언어마다 다름)와 화면 폭에 따라 달라지므로 실측해서 정한다.
    var placeLogin = function () {
      var proRight = window.innerWidth <= 720 ? 52 : 56;
      loginBtn.style.right = (proRight + proBtn.offsetWidth + 8) + "px";
    };

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
      loginBtn.classList.toggle("on", !loggedIn);
      placeLogin();
    };

    // Mobile: centre the globe + Pro/Login buttons on the logo's horizontal midline
    // (the logo is rendered by React after load, so re-measure on resize and for a
    // few frames). They move together so they never drift apart.
    var align = function () {
      placeLogin();
      var logo = document.querySelector("[data-ax-logo]");
      if (!logo || window.innerWidth > 720) {
        box.style.top = ""; proBtn.style.top = ""; loginBtn.style.top = ""; return;
      }
      var r = logo.getBoundingClientRect();
      if (!r.height) return;
      var mid = r.top + window.scrollY + r.height / 2;
      box.style.top = Math.round(mid - box.offsetHeight / 2) + "px";
      proBtn.style.top = Math.round(mid - proBtn.offsetHeight / 2) + "px";
      loginBtn.style.top = Math.round(mid - loginBtn.offsetHeight / 2) + "px";
    };
    window.addEventListener("resize", align);
    var tries = 0, tick = setInterval(function () { align(); if (++tries > 40) clearInterval(tick); }, 100);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", window.axMountGlobe);
  else window.axMountGlobe();
})();
