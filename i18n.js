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
      "#ax-globe{position:absolute;top:14px;right:14px;z-index:200;display:flex;align-items:center;gap:5px;" +
      "height:34px;padding:0 11px 0 9px;border-radius:100px;border:1px solid rgba(23,23,23,.14);" +
      "background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);" +
      "color:#4a4540;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;" +
      "box-shadow:0 4px 14px -8px rgba(40,30,20,.45);}" +
      "#ax-globe:hover{border-color:rgba(23,23,23,.35);}" +
      "#ax-globe:focus-within{outline:2px solid #0070f3;outline-offset:2px;}" +
      "#ax-globe svg{width:17px;height:17px;flex:0 0 auto;}" +
      "#ax-globe select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;" +
      "appearance:none;-webkit-appearance:none;border:0;font-size:16px;}" +
      "@media (max-width:720px){#ax-globe{top:10px;right:10px;}}";
    document.head.appendChild(css);
    var box = document.createElement("div");
    box.id = "ax-globe";
    box.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2' +
      'M12 2.8C9.4 5.4 8.1 8.4 8.1 12s1.3 6.6 3.9 9.2"/></svg><span aria-hidden="true"></span>';
    box.querySelector("span").textContent = LANG.toUpperCase();
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
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", window.axMountGlobe);
  else window.axMountGlobe();
})();
