import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index.js";
import { pickLang, splitLangPath } from "../lib/lang.js";

async function call(path, init = {}, extraEnv = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, { redirect: "manual", ...init }),
                                 { ...env, ...extraEnv }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("pickLang", () => {
  it("cookie wins, then Accept-Language, then en", () => {
    expect(pickLang("ja", "es-ES,es;q=0.9")).toBe("ja");
    expect(pickLang(undefined, "zh-TW,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(pickLang(undefined, "es-419,es;q=0.9")).toBe("es");
    expect(pickLang(undefined, "pt-BR,pt;q=0.9")).toBe("en");
    expect(pickLang(undefined, "pt-BR,ko;q=0.5")).toBe("ko");
    expect(pickLang("xx", null)).toBe("en");
  });
  it("q=0 means not acceptable", () => {
    expect(pickLang(undefined, "ja;q=0, es;q=0.5")).toBe("es");
    expect(pickLang(undefined, "ko;q=0")).toBe("en");
  });
  it("splitLangPath", () => {
    expect(splitLangPath("/en/")).toEqual({ lang: "en", rest: "/" });
    expect(splitLangPath("/ja/large")).toEqual({ lang: "ja", rest: "/large" });
    expect(splitLangPath("/s/en/design/x")).toBe(null);
    expect(splitLangPath("/enx/")).toBe(null);
  });
});

describe("html routing", () => {
  it("/ stays ko (no redirect) while I18N_PUBLIC is off", async () => {
    const r = await call("/", { headers: { "accept-language": "ja" } });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('<html lang="ko"');
    expect(html).toContain('window.AX_LANG="ko"');
    expect(html).toContain("window.AX_I18N_ON=false");
  });
  it("/ redirects by cookie/header once public", async () => {
    let r = await call("/", { headers: { "accept-language": "ja-JP" } }, { I18N_PUBLIC: "1" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/ja/");
    r = await call("/", { headers: { cookie: "ax_lang=es", "accept-language": "ja" } }, { I18N_PUBLIC: "1" });
    expect(r.headers.get("location")).toBe("/es/");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("vary")).toBe("Cookie, Accept-Language");
  });
  it("public / redirect keeps the query (legacy ?c= deep links)", async () => {
    const r = await call("/?c=design:some-id", { headers: { "accept-language": "ja" } }, { I18N_PUBLIC: "1" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/ja/?c=design:some-id");
  });
  it("bare /{lang} 301s to /{lang}/ with the query", async () => {
    for (const l of ["en", "ko", "ja", "zh", "es"]) {
      const r = await call(`/${l}?c=x:y`);
      expect(r.status).toBe(301);
      expect(r.headers.get("location")).toBe(`/${l}/?c=x:y`);
    }
  });
  it("/{lang}/ pages get base href + lang", async () => {
    for (const [path, marker] of [["/en/", "axbrief-app.jsx"], ["/zh/large", "axbrief-app-large.jsx"], ["/es/archive", "archive-data"]]) {
      const r = await call(path);
      expect(r.status).toBe(200);
      const html = await r.text();
      expect(html).toMatch(/<head>\s*<base href="\/">/);
      expect(html).toContain(`window.AX_LANG="${path.split("/")[1]}"`);
      expect(html).toContain(marker);
    }
    const html = await (await call("/ja/large", {}, { I18N_PUBLIC: "1" })).text();
    for (const l of ["en", "ko", "ja", "zh", "es"])
      expect(html).toContain(`<link rel="alternate" hreflang="${l}" href="http://localhost/${l}/large">`);
    expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="http://localhost/en/large">`);
  });
  it("hreflang alternates + noindex follow I18N_PUBLIC", async () => {
    const off = await call("/ja/large");
    expect(off.status).toBe(200);
    expect(off.headers.get("x-robots-tag")).toBe("noindex");
    expect(await off.text()).not.toContain('hreflang=');
    const root = await call("/");
    expect(root.headers.get("x-robots-tag")).toBe(null);
    expect(await root.text()).not.toContain('hreflang=');
    const on = await call("/ja/large", {}, { I18N_PUBLIC: "1" });
    expect(on.headers.get("x-robots-tag")).toBe(null);
    expect(await on.text()).toContain('hreflang="ja"');
  });
  it("serves canonical page assets with 200 for every page", async () => {
    for (const path of ["/", "/en/", "/en/large", "/en/archive", "/index.html"]) {
      const r = await call(path);
      expect(r.status, path).toBe(200);
    }
  });
  it("?i18n=1 sets the preview cookie and turns the menu on", async () => {
    const r = await call("/en/?i18n=1");
    expect(r.headers.get("set-cookie")).toMatch(/ax_i18n=1/);
    expect(await r.text()).toContain("window.AX_I18N_ON=true");
    const r2 = await call("/en/", { headers: { cookie: "ax_i18n=1" } });
    expect(await r2.text()).toContain("window.AX_I18N_ON=true");
  });
  it("legacy share pages are untouched", async () => {
    const r = await call("/s/design/does-not-exist");
    expect(r.status).not.toBe(302);
  });
});
