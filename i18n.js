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
    document.cookie = "ax_lang=" + lang + "; Path=/; Max-Age=31536000; SameSite=Lax";
    var sub = (location.pathname.match(/\/(large|archive)(\.html)?$/) || [])[1];
    location.href = "/" + lang + "/" + (sub || "") + location.search;
  };
})();
