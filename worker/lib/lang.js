export const LANGS = ["en", "ko", "ja", "zh", "es"];

export function pickLang(cookieLang, acceptLanguage) {
  if (LANGS.includes(cookieLang)) return cookieLang;
  const prefs = String(acceptLanguage || "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? parseFloat(q.slice(2)) || 0 : 1 };
    })
    .filter((x) => x.base && x.q > 0) // q=0 means "not acceptable"
    .sort((a, b) => b.q - a.q);
  const hit = prefs.find((x) => LANGS.includes(x.base));
  return hit ? hit.base : "en";
}

export function splitLangPath(pathname) {
  const m = /^\/(en|ko|ja|zh|es)(\/.*)$/.exec(pathname);
  return m ? { lang: m[1], rest: m[2] } : null;
}
