import { LANGS, pickLang, splitLangPath } from "./lib/lang.js";
import { signSession, verifySession } from "./lib/crypto.js";
import { issueMagicToken, consumeMagicToken, rateLimited,
         newPendingId, newPendingCode, putPending, readPending,
         approvePending, claimPending } from "./lib/tokens.js";
import { parseCookies, sessionSetCookie, sessionClearCookie, SESSION_COOKIE } from "./lib/cookies.js";
import { getEntitlement, hasPaddleSubscription } from "./lib/entitlement.js";
import { getPrefs, setPrefs, unsubscribeAll } from "./lib/mail_prefs.js";
import { signUnsub, verifyUnsub } from "./lib/unsub.js";
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

// 버튼에 표시할 금액. 금액을 i18n 파일 10개에 문자열로 박아두면 Paddle에서 가격이
// 바뀐 순간 버튼은 $5.99라고 하고 결제창은 다른 금액을 받는다 — 차지백 사유다.
// 명세 §2대로 배포 없이 바꿀 수 있게 env에 둔다. 금액만 내려보내고 '월/연' 같은
// 주변 문구는 클라이언트의 i18n 틀이 갖는다 — 금액은 서버가 확정하고 말은 번역된다.
const planAmounts = (env) => ({
  monthly: env.PADDLE_PRICE_MONTHLY_AMOUNT || null,
  yearly: env.PADDLE_PRICE_YEARLY_AMOUNT || null,
});

async function currentEmail(request, env) {
  const cookie = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  const sess = await verifySession(cookie, env.SESSION_SIGNING_KEY);
  return sess ? sess.email : null;
}

// Sandbox 체크아웃 가드 — workers_dev/preview_urls가 꺼져 있어 SANDBOX 자격증명을
// 검증할 별도 호스트가 없다. 운영 도메인 자체가 검증 환경이 되는 동안, 아무 방문자나
// 플랜을 누르면 Paddle 공개 테스트 카드(4242...)로 결제가 "성공"하고, 올바르게 서명된
// 샌드박스 웹훅이 진짜 subscribers 행을 공짜로 연다. ax_sandbox=1 쿠키(운영자만 /?sandbox=1
// 로 심음)가 없으면 체크아웃 두 핸들러 모두 막는다. 웹훅 라우트는 이 가드 밖에 있다 —
// 그게 검증 대상이다. PADDLE_ENV가 sandbox가 아니면(운영) 이 함수는 항상 false다.
function sandboxCheckoutBlocked(env, cookies) {
  return env.PADDLE_ENV === "sandbox" && cookies.ax_sandbox !== "1";
}

// Canonical asset paths (fetching "/index.html" etc. gets a 307 to these under html_handling).
const PAGE_ASSET = { "/": "/", "/large": "/large", "/archive": "/archive" };

async function serveHtml(env, page, lang, i18nOn, previewOn, langRoute, sandboxParam) {
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
  // 운영자가 ?sandbox=1을 달아 들어오면 체크아웃 가드를 우회하는 쿠키를 심는다(검증용).
  // ?sandbox=0은 되돌리는 길 — 값은 로그로 남기지 않는다.
  if (sandboxParam === "1")
    headers.append("set-cookie", "ax_sandbox=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400");
  else if (sandboxParam === "0")
    headers.append("set-cookie", "ax_sandbox=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(out.body, { status: res.status, headers });
}

/* 메일 링크를 연 기기에 보여 주는 최소한의 페이지들. 앱을 띄울 자리가 아니라
   한 문장과 버튼 하나면 되므로 워커가 직접 그린다. */
function htmlPage(msg, status = 200, extraHeaders = {}) {
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AX-it NOW</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f4f0e9;color:#1c1a18;font-family:Pretendard,system-ui,sans-serif;padding:24px}
.box{max-width:420px;text-align:center;line-height:1.6;font-size:15px}
a{color:#1c1a18}</style></head>
<body><div class="box">${msg}</div></body></html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}

// 다른 기기에서 열었을 때의 확인 화면. 코드를 크게 띄우고, 요청 화면의 숫자와
// 같을 때만 누르라고 분명히 적는다.
function confirmPage(code, token, pid) {
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return htmlPage(`
    <p style="font-size:17px;font-weight:700;margin:0 0 6px">로그인 확인</p>
    <p style="margin:0 0 18px;color:#5a5450">로그인을 요청한 화면에 아래 숫자가
      떠 있는지 확인하세요.</p>
    <p style="font:700 34px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;margin:0 0 20px">${esc(code)}</p>
    <form method="POST" action="/api/auth/approve">
      <input type="hidden" name="token" value="${esc(token)}">
      <input type="hidden" name="p" value="${esc(pid)}">
      <button type="submit" style="width:100%;height:46px;border:none;border-radius:12px;
        background:#1c1a18;color:#fff;font:700 15px Pretendard,system-ui,sans-serif;cursor:pointer">
        숫자가 같습니다 — 로그인</button>
    </form>
    <p style="margin:16px 0 0;color:#8a8377;font-size:13px">숫자가 다르면 누르지 마세요.
      누군가 당신의 주소로 로그인을 시도하는 중일 수 있습니다.</p>`);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    const cookies = parseCookies(request.headers.get("cookie"));
    const previewOn = url.searchParams.get("i18n") === "1";
    const sandboxParam = url.searchParams.get("sandbox");
    // I18N_MENU shows the globe picker to everyone; I18N_PUBLIC also turns on the
    // Accept-Language redirect on / and search indexing of the /{lang}/ pages.
    const i18nOn = env.I18N_PUBLIC === "1" || env.I18N_MENU === "1" || previewOn || cookies.ax_i18n === "1";
    if (p === "/" || p === "/index.html") {
      if (env.I18N_PUBLIC === "1")
        return new Response(null, { status: 302, headers: {
          location: `/${pickLang(cookies.ax_lang, request.headers.get("accept-language"))}/${url.search}`,
          "cache-control": "no-store",
          vary: "Cookie, Accept-Language" } });
      return serveHtml(env, "/", "ko", i18nOn, previewOn, false, sandboxParam);
    }
    if (LANGS.includes(p.slice(1)))
      return new Response(null, { status: 301, headers: { location: `${p}/${url.search}` } });
    const lp = splitLangPath(p);
    if (lp && PAGE_ASSET[lp.rest]) return serveHtml(env, lp.rest, lp.lang, i18nOn, previewOn, true, sandboxParam);

    if (p.startsWith("/premium/")) return new Response("Forbidden", { status: 403 });

    if (p === "/api/auth/request" && request.method === "POST") {
      let email = "";
      try { email = (await request.json()).email; } catch {}
      email = String(email || "").trim().toLowerCase();
      if (email) {
        // 주소당 시간당 5통, IP당 시간당 15통. 넘으면 보내지 않고도 응답은 똑같다
        // — 등록 여부도, 제한에 걸렸는지도 알려주지 않는다.
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        if (await rateLimited(env.AUTH_TOKENS, "em", email, 5) ||
            await rateLimited(env.AUTH_TOKENS, "ip", ip, 15))
          return json({ ok: true });
        const token = await issueMagicToken(env.AUTH_TOKENS, email);
        // 요청한 브라우저가 승인을 받아 갈 자리. 링크를 다른 기기에서 열어도 이 자리에
        // 세션이 놓이면 원래 창이 그걸 가져간다.
        const pid = newPendingId();
        const code = newPendingCode();
        await putPending(env.DB, pid, email, code);
        const link = `${env.BASE_URL}/api/auth/callback?token=${token}&p=${pid}`;
        try {
          await sendMagicLink(env, email, link, code);
        } catch (e) {
          // 주소가 등록돼 있는지는 끝까지 숨기지만(= 모르는 주소도 ok:true), 메일
          // 발송 자체가 실패한 것은 다른 사건이다. 성공으로 위장하면 사용자는 오지
          // 않는 메일을 영원히 기다린다.
          console.error("auth/request: magic link send failed", String(e && e.message || e));
          return json({ ok: false, reason: "send_failed" }, 502);
        }
        // pid는 이 브라우저만 알아야 한다(세션을 가져갈 열쇠다). 쿠키로도 심어
        // 두면 같은 기기에서 링크를 열었을 때 확인 코드를 묻지 않고 지나갈 수 있다.
        return json({ ok: true, pid, code }, 200, {
          "set-cookie": `ax_pend=${pid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`,
        });
      }
      return json({ ok: true }); // never reveal whether the email exists
    }

    // 요청했던 브라우저가 "승인됐나?"를 묻는 자리. pid를 아는 것만으로는 안 되고
    // 요청 때 심은 쿠키까지 맞아야 한다 — 메일 링크를 가로챈 쪽이 세션을 긁어가지
    // 못하게 한다.
    if (p === "/api/auth/pending") {
      const pid = url.searchParams.get("pid") || "";
      if (!pid || cookies.ax_pend !== pid) return json({ approved: false }, 403);
      const session = await claimPending(env.DB, pid);
      if (!session) return json({ approved: false });
      return json({ approved: true }, 200, { "set-cookie": sessionSetCookie(session) });
    }

    if (p === "/api/auth/callback") {
      const token = url.searchParams.get("token");
      const pid = url.searchParams.get("p") || "";
      // 같은 브라우저에서 열었으면(요청 때 심은 쿠키가 그대로 있으면) 묻지 않는다.
      // 다른 기기면 코드를 보여 주고 사람이 맞춰 본 뒤에야 승인한다 — 그 확인이
      // 없으면 "남의 주소로 요청해 두고 클릭을 유도하는" 공격이 그대로 통한다.
      const sameDevice = pid && cookies.ax_pend === pid;
      if (pid && !sameDevice) {
        const rec = await readPending(env.DB, pid);
        // 토큰은 아직 쓰지 않는다 — 승인 버튼을 눌러야 소모된다.
        if (!rec || !(await env.AUTH_TOKENS.get("ml:" + token)))
          return htmlPage("만료되었거나 이미 사용된 링크입니다. 다시 요청해 주세요.", 400);
        return confirmPage(rec.code, token, pid);
      }
      const email = await consumeMagicToken(env.AUTH_TOKENS, token);
      if (!email) return new Response("만료되었거나 이미 사용된 링크입니다. 다시 요청해 주세요.", { status: 400 });
      const session = await signSession(email, env.SESSION_SIGNING_KEY);
      if (pid) await approvePending(env.DB, pid, session);
      return new Response(null, { status: 302, headers: { location: "/", "set-cookie": sessionSetCookie(session) } });
    }

    // 다른 기기에서 코드를 맞춰 보고 누르는 승인. 토큰은 여기서 소모된다.
    if (p === "/api/auth/approve" && request.method === "POST") {
      const form = await request.formData().catch(() => null);
      const token = form && form.get("token");
      const pid = form && form.get("p");
      const email = await consumeMagicToken(env.AUTH_TOKENS, String(token || ""));
      if (!email) return htmlPage("만료되었거나 이미 사용된 링크입니다. 다시 요청해 주세요.", 400);
      const session = await signSession(email, env.SESSION_SIGNING_KEY);
      await approvePending(env.DB, String(pid || ""), session);
      // 이 기기도 함께 로그인시킨다 — 폰에서 열었다면 폰에서도 보고 싶을 것이다.
      return htmlPage("로그인했습니다. 요청하신 화면으로 돌아가세요.", 200,
                      { "set-cookie": sessionSetCookie(session) });
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

    // 가격만 읽어가는 공개 조회 — 플랜 목록은 로그인 전에도 보이므로 인증을
    // 요구하지 않는다. 금액 외에 아무것도 노출하지 않는다.
    if (p === "/api/billing/checkout" && request.method === "GET") {
      if (sandboxCheckoutBlocked(env, cookies)) return json({ reason: "sandbox_mode" }, 503);
      return json({ amounts: planAmounts(env) });
    }

    // 결제 시작 — price id를 번들에 박지 않고 여기서 내려준다. 로그인을 요구하는
    // 이유: 결제 이메일과 로그인 이메일이 갈리면 돈을 내고도 아무것도 안 열린다.
    if (p === "/api/billing/checkout" && request.method === "POST") {
      if (sandboxCheckoutBlocked(env, cookies)) return json({ reason: "sandbox_mode" }, 503);
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 401);
      // 이미 구독 행이 있으면 두 번째 Paddle 구독을 열지 못하게 막는다. 그대로 두면
      // 첫 구독이 고아가 되어 두 건이 동시에 청구된다.
      if (await hasPaddleSubscription(env.DB, email))
        return json({ reason: "already_subscribed" }, 409);
      let plan = null;
      try { plan = (await request.json()).plan; } catch {}
      const priceId = plan === "monthly" ? env.PADDLE_PRICE_MONTHLY
                    : plan === "yearly" ? env.PADDLE_PRICE_YEARLY : null;
      if (!priceId) return json({ reason: "unknown_plan" }, 400);
      return json({ priceId, email, clientToken: env.PADDLE_CLIENT_TOKEN,
                    amount: planAmounts(env)[plan], amounts: planAmounts(env),
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
      if (!email) return json({ loggedIn: false, email: null, entitled: false, hasSubscription: false });
      const ent = await getEntitlement(env.DB, email);
      // hasSubscription은 기간을 보지 않는다 — 갱신이 실패해 권한이 닫힌 구독자에게도
      // "구독 관리"를 계속 보여줘야 한다. 그때가 카드를 고쳐야 하는 순간이다.
      const hasSubscription = await hasPaddleSubscription(env.DB, email);
      // 구독 상태 화면이 쓰는 값들 — 시작일, 유효기간 끝(=다음 결제일), 결제 수단.
      // 권한 판정과 달리 이건 사람에게 보여주는 정보다.
      return json({ loggedIn: true, email, entitled: ent.entitled, hasSubscription,
                    status: ent.status, periodEnd: ent.periodEnd,
                    startedAt: ent.startedAt, provider: ent.provider });
    }

    // 수신 거부 — 로그인을 요구하지 않는다. 메일을 받은 사람이 로그인 화면을
    // 만나면 스팸 신고 버튼을 누른다. 끊는 대상은 오직 토큰 안의 주소이고,
    // 쿼리에 실린 다른 주소는 읽지도 않는다.
    if (p === "/api/mail/unsubscribe") {
      const who = await verifyUnsub(url.searchParams.get("t"), env.SESSION_SIGNING_KEY);
      if (!who) return htmlPage("링크가 올바르지 않습니다. 메일 하단의 링크를 다시 눌러 주세요.", 400);
      await unsubscribeAll(env.DB, who);
      // 두 번 눌러도 같은 화면이다 — 이미 끊긴 사람에게 오류를 보여 줄 이유가 없다.
      return htmlPage(`<p style="font-size:17px;font-weight:700;margin:0 0 8px">수신을 해지했습니다</p>
        <p style="margin:0;color:#5a5450">${who} 주소로 더 이상 주간 리포트를 보내지 않습니다.</p>`);
    }

    // 수신 설정 — 로그인한 본인 것만 읽고 쓴다. 남의 설정을 건드릴 길은 없다.
    if (p === "/api/mail/prefs") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 401);
      if (request.method === "GET") return json(await getPrefs(env.DB, email));
      if (request.method === "POST") {
        let body = {};
        try { body = await request.json(); } catch {}
        // 받은 것 중 아는 필드만 추린다 — unsub_all은 여기서 못 바꾼다(수신 거부
        // 링크 전용). 설정 화면의 실수로 전체 수신 거부가 켜지면 안 된다.
        const patch = {};
        if (typeof body.lang === "string" && LANGS.includes(body.lang)) patch.lang = body.lang;
        if (typeof body.sections === "string") patch.sections = body.sections;
        if (body.weekly != null) patch.weekly = body.weekly ? 1 : 0;
        return json(await setPrefs(env.DB, email, patch));
      }
      return json({ reason: "method_not_allowed" }, 405);
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
