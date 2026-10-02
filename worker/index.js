import { LANGS, pickLang, splitLangPath } from "./lib/lang.js";
import { signSession, verifySession } from "./lib/crypto.js";
import { issueMagicToken, consumeMagicToken } from "./lib/tokens.js";
import { parseCookies, sessionSetCookie, sessionClearCookie, SESSION_COOKIE } from "./lib/cookies.js";
import { getEntitlement } from "./lib/entitlement.js";
import { sendMagicLink } from "./lib/email.js";
import { verifyPaddleSignature, toEntitlement, fetchCustomerEmail } from "./lib/paddle.js";
import { applyEntitlement } from "./lib/billing.js";

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...extra } });

// custom_data.email(로그인한 계정)과 Paddle 고객 이메일(영수증이 가는 주소)이 갈리는
// 경우를 로그로만 남긴다. 권한은 custom_data 쪽에 여는 게 맞다 — 세션이 있는 주소다.
// 막지 않는 이유: 잘못된 행에 권한을 여는 것은 복구 가능하지만, 실제 결제를 거부하는
// 것은 복구할 수 없다. 조회는 waitUntil로 돌려 웹훅 응답을 늦추지 않는다.
async function warnEmailMismatch(env, delta) {
  try {
    const paddleEmail = await fetchCustomerEmail(env, delta.customerId);
    if (paddleEmail && paddleEmail !== delta.email)
      console.error("paddle webhook: email mismatch — event", delta.eventId,
                    "custom_data:", delta.email, "paddle customer:", paddleEmail,
                    "customer:", delta.customerId);
  } catch (e) {
    console.error("paddle webhook: customer lookup failed — event", delta.eventId,
                  String((e && e.message) || e));
  }
}

async function currentEmail(request, env) {
  const cookie = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  const sess = await verifySession(cookie, env.SESSION_SIGNING_KEY);
  return sess ? sess.email : null;
}

// Canonical asset paths (fetching "/index.html" etc. gets a 307 to these under html_handling).
const PAGE_ASSET = { "/": "/", "/large": "/large", "/archive": "/archive" };

async function serveHtml(env, page, lang, i18nOn, previewOn, langRoute) {
  const res = await env.ASSETS.fetch(new Request(new URL(PAGE_ASSET[page] ?? "/", env.BASE_URL)));
  if (res.status !== 200) return res; // pass redirects/errors through untouched
  const isPublic = env.I18N_PUBLIC === "1";
  const sub = page.replace(/^\//, "");
  const base = String(env.BASE_URL).replace(/\/$/, "");
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${base}/${l}/${sub}">`).join("")
    + `<link rel="alternate" hreflang="x-default" href="${base}/en/${sub}">`;
  const out = new HTMLRewriter()
    .on("html", { element(e) { e.setAttribute("lang", lang); } })
    .on("head", { element(e) {
      e.prepend(`<base href="/"><script>window.AX_LANG=${JSON.stringify(lang)};window.AX_I18N_ON=${i18nOn};</script>`,
                { html: true });
      if (isPublic) e.append(alts, { html: true });
    } })
    .transform(res);
  const headers = new Headers(out.headers);
  headers.set("content-language", lang);
  // Language routes stay out of search indexes until the multilingual site is public.
  if (langRoute && !isPublic) headers.set("x-robots-tag", "noindex");
  if (previewOn) headers.append("set-cookie", "ax_i18n=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  return new Response(out.body, { status: res.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    const cookies = parseCookies(request.headers.get("cookie"));
    const previewOn = url.searchParams.get("i18n") === "1";
    // I18N_MENU shows the globe picker to everyone; I18N_PUBLIC also turns on the
    // Accept-Language redirect on / and search indexing of the /{lang}/ pages.
    const i18nOn = env.I18N_PUBLIC === "1" || env.I18N_MENU === "1" || previewOn || cookies.ax_i18n === "1";
    if (p === "/" || p === "/index.html") {
      if (env.I18N_PUBLIC === "1")
        return new Response(null, { status: 302, headers: {
          location: `/${pickLang(cookies.ax_lang, request.headers.get("accept-language"))}/${url.search}`,
          "cache-control": "no-store",
          vary: "Cookie, Accept-Language" } });
      return serveHtml(env, "/", "ko", i18nOn, previewOn, false);
    }
    if (LANGS.includes(p.slice(1)))
      return new Response(null, { status: 301, headers: { location: `${p}/${url.search}` } });
    const lp = splitLangPath(p);
    if (lp && PAGE_ASSET[lp.rest]) return serveHtml(env, lp.rest, lp.lang, i18nOn, previewOn, true);

    if (p.startsWith("/premium/")) return new Response("Forbidden", { status: 403 });

    if (p === "/api/auth/request" && request.method === "POST") {
      let email = "";
      try { email = (await request.json()).email; } catch {}
      email = String(email || "").trim().toLowerCase();
      if (email) {
        const token = await issueMagicToken(env.AUTH_TOKENS, email);
        const link = `${env.BASE_URL}/api/auth/callback?token=${token}`;
        try {
          await sendMagicLink(env, email, link);
        } catch (e) {
          // 주소가 등록돼 있는지는 끝까지 숨기지만(= 모르는 주소도 ok:true), 메일
          // 발송 자체가 실패한 것은 다른 사건이다. 성공으로 위장하면 사용자는 오지
          // 않는 메일을 영원히 기다린다.
          console.error("auth/request: magic link send failed", String(e && e.message || e));
          return json({ ok: false, reason: "send_failed" }, 502);
        }
      }
      return json({ ok: true }); // never reveal whether the email exists
    }

    if (p === "/api/auth/callback") {
      const token = url.searchParams.get("token");
      const email = await consumeMagicToken(env.AUTH_TOKENS, token);
      if (!email) return new Response("만료되었거나 이미 사용된 링크입니다. 다시 요청해 주세요.", { status: 400 });
      const session = await signSession(email, env.SESSION_SIGNING_KEY);
      return new Response(null, { status: 302, headers: { location: "/", "set-cookie": sessionSetCookie(session) } });
    }

    if (p === "/api/auth/logout" && request.method === "POST")
      return json({ ok: true }, 200, { "set-cookie": sessionClearCookie() });

    // Paddle 웹훅 — 권한이 열리는 유일한 경로. 브라우저가 보고하는 결제 성공은
    // 믿지 않는다. 서명 검증은 원문 바디로 하므로 파싱보다 먼저 한다.
    if (p === "/api/billing/webhook" && request.method === "POST") {
      const raw = await request.text();
      const ok = await verifyPaddleSignature(raw, request.headers.get("paddle-signature"),
                                             env.PADDLE_WEBHOOK_SECRET);
      if (!ok) {
        // 돈이 흐르는 경로의 조용한 거부는 전부 로그를 남긴다. PADDLE_WEBHOOK_SECRET이
        // 틀리면 모든 이벤트가 401로 떨어지는데, 로그가 없으면 며칠을 흔적 없이 잃는다.
        let id = null, parsed = true;
        try { id = JSON.parse(raw)?.event_id ?? null; } catch { parsed = false; }
        console.error("paddle webhook: signature rejected —",
                      parsed ? `event ${id}` : "body did not parse",
                      "secret configured:", !!env.PADDLE_WEBHOOK_SECRET);
        return new Response(null, { status: 401 });
      }

      let event;
      try { event = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }

      const delta = toEntitlement(event);
      // 관심 없는 이벤트는 200으로 받아준다 — 401/500을 주면 Paddle이 계속 재전송한다.
      if (!delta) return json({ ok: true, ignored: true });

      const fromCustomData = !!delta.email;
      if (!delta.email) delta.email = await fetchCustomerEmail(env, delta.customerId);
      if (!delta.email) {
        // 이메일을 끝내 알 수 없으면 반영할 수 없다. 500을 줘서 Paddle이 재전송하게
        // 두고(일시적 API 장애일 수 있다) 로그에 남긴다.
        console.error("paddle webhook: no email", delta.eventId, delta.customerId);
        return new Response(null, { status: 500 });
      }
      if (!fromCustomData)
        // custom_data가 이 이벤트에 실려오지 않았다. 구매자가 오버레이에서 고친 주소일
        // 수 있고, 그러면 결제는 세션이 없는 주소에 꽂힌다 — 가장 추적하기 어려운 실패다.
        console.error("paddle webhook: custom_data.email absent — event", delta.eventId,
                      "custom_data: (none)", "paddle customer:", delta.email,
                      "customer:", delta.customerId);

      const result = await applyEntitlement(env.DB, delta);
      if (result === "stale")
        // 늦게 온 이벤트이거나 수동 부여를 보호한 경우. 어느 쪽이든 이 이벤트는 반영되지
        // 않았으므로, "결제했는데 안 열린다"는 문의가 오면 여기부터 봐야 한다.
        console.error("paddle webhook: not applied (stale or manual-protected) — event",
                      delta.eventId, delta.email, delta.status, "periodEnd:", delta.periodEnd);
      if (result === "duplicate")
        console.error("paddle webhook: duplicate event ignored —", delta.eventId, delta.email);
      if (result === "applied" && fromCustomData) ctx.waitUntil(warnEmailMismatch(env, delta));
      return json({ ok: true, result });
    }

    // 결제 시작 — price id를 번들에 박지 않고 여기서 내려준다. 로그인을 요구하는
    // 이유: 결제 이메일과 로그인 이메일이 갈리면 돈을 내고도 아무것도 안 열린다.
    if (p === "/api/billing/checkout" && request.method === "POST") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 401);
      let plan = null;
      try { plan = (await request.json()).plan; } catch {}
      const priceId = plan === "monthly" ? env.PADDLE_PRICE_MONTHLY
                    : plan === "yearly" ? env.PADDLE_PRICE_YEARLY : null;
      if (!priceId) return json({ reason: "unknown_plan" }, 400);
      return json({ priceId, email, clientToken: env.PADDLE_CLIENT_TOKEN,
                    environment: env.PADDLE_ENV === "sandbox" ? "sandbox" : "production" });
    }

    // 구독 관리 — 카드 변경·해지·영수증은 Paddle 고객 포털로 보낸다.
    if (p === "/api/billing/portal") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 401);
      const row = await env.DB.prepare(
        "SELECT provider_customer_id FROM subscribers WHERE email = ?"
      ).bind(email).first();
      if (!row || !row.provider_customer_id) return json({ reason: "no_subscription" }, 404);
      const base = env.PADDLE_ENV === "sandbox"
        ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
      const res = await fetch(`${base}/customers/${encodeURIComponent(row.provider_customer_id)}/portal-sessions`,
        { method: "POST", headers: { authorization: `Bearer ${env.PADDLE_API_KEY}`,
                                     "content-type": "application/json" }, body: "{}" });
      if (!res.ok) return json({ reason: "portal_unavailable" }, 502);
      const body = await res.json().catch(() => null);
      const link = body?.data?.urls?.general?.overview;
      if (!link) return json({ reason: "portal_unavailable" }, 502);
      return json({ url: link });
    }

    if (p === "/api/me") {
      const email = await currentEmail(request, env);
      if (!email) return json({ loggedIn: false, email: null, entitled: false });
      const ent = await getEntitlement(env.DB, email);
      return json({ loggedIn: true, email, entitled: ent.entitled });
    }

    if (p === "/api/premium/full") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 402);
      const ent = await getEntitlement(env.DB, email);
      if (!ent.entitled) return json({ reason: "subscription_required" }, 402);
      const section = url.searchParams.get("section");
      const id = url.searchParams.get("id");
      const want = LANGS.includes(url.searchParams.get("lang")) ? url.searchParams.get("lang") : "ko";
      const key = `${section}/${id}`;
      const tries = [...new Set([want, "en", "ko"])].map((l) => [l, `/premium/${l}/${section}.json`]);
      tries.push(["ko", "/premium/full.json"]);
      for (const [l, path] of tries) {
        if (!/^[a-z]+$/.test(section || "")) break;
        const res = await env.ASSETS.fetch(new Request(new URL(path, env.BASE_URL)));
        if (!res.ok) continue;
        const map = await res.json();
        const full = (map.cards || map)[key];
        if (full) return json({ full, lang: l });
      }
      return json({ reason: "not_found" }, 404);
    }

    // Knowledge Graph 클러스터 요약 — 선택 뉴스+연결 뉴스의 시간 흐름 요약을
    // LLM(Claude Haiku)으로 생성. 구독자 전용, KV 30일 캐시(동일 클러스터 재사용).
    if (p === "/api/insights/summary" && request.method === "POST") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 402);
      const ent = await getEntitlement(env.DB, email);
      if (!ent.entitled) return json({ reason: "subscription_required" }, 402);
      if (!env.ANTHROPIC_API_KEY) return json({ reason: "not_configured" }, 503);
      let body;
      try { body = await request.json(); } catch { return json({ reason: "bad_request" }, 400); }
      const items = Array.isArray(body.items) ? body.items.slice(0, 16) : [];
      if (items.length < 2) return json({ reason: "bad_request" }, 400);
      const lang = LANGS.includes(body.lang) ? body.lang : "ko";
      const clip = (s, n) => String(s || "").replace(/\s+/g, " ").slice(0, n);
      const lines = items.map((it) =>
        `- ${clip(it.date, 10)} [${clip(it.tool, 30)}${it.isSel ? " · 선택한 뉴스" : ""}] ${clip(it.headline, 120)} — ${clip(it.body, 180)}`
      ).join("\n");
      // 동일 클러스터는 캐시 재사용 (LLM 호출 비용 절약)
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines));
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
      const cacheKey = `insum:${lang}:${hash}`;
      const cached = await env.AUTH_TOKENS.get(cacheKey);
      if (cached) return json({ summary: cached, cached: true });
      const prompt = `당신은 AI 뉴스 큐레이션 서비스의 에디터입니다. 아래는 하나의 토픽 클러스터입니다 — 사용자가 선택한 뉴스와, 공유 키워드로 직접 연결된 뉴스들의 날짜·매체·헤드라인·한 줄 요약입니다.

이 클러스터 전체를 종합해, 시간의 흐름에 따라 이 토픽이 어떻게 시작되고 발전·변화해 왔는지가 한눈에 보이는 한국어 요약문을 쓰세요.

규칙:
- 4~7문장의 자연스러운 산문. 불릿·헤딩 금지, 요약문만 출력.
- 첫 문장은 토픽을 한 줄로 규정하고, 마지막 문장은 현재 상태 또는 다음에 지켜볼 지점.
- 사실·수치는 제공된 내용 안에서만 쓰고 추측하지 않는다.
- '선택한 뉴스'가 흐름의 어디에 있는지 자연스럽게 짚는다.
- 날짜는 필요한 곳에만 '6월 말', '9월 19일' 정도로 가볍게.
- 출력 언어: ${{ en: "English", ko: "한국어", ja: "日本語", zh: "简体中文", es: "Español" }[lang]}. 고유명사·수치는 그대로.

클러스터:
${lines}`;
      let res;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 700,
            messages: [{ role: "user", content: prompt }],
          }),
        });
      } catch {
        return json({ reason: "llm_unreachable" }, 502);
      }
      if (!res.ok) return json({ reason: "llm_error", status: res.status }, 502);
      const data = await res.json();
      const text = ((data.content || []).map((c) => c.text || "").join("") || "").trim();
      if (!text) return json({ reason: "llm_empty" }, 502);
      await env.AUTH_TOKENS.put(cacheKey, text, { expirationTtl: 60 * 60 * 24 * 30 });
      return json({ summary: text });
    }

    return env.ASSETS.fetch(request);
  },
};
