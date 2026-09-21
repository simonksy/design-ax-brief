import { signSession, verifySession } from "./lib/crypto.js";
import { issueMagicToken, consumeMagicToken } from "./lib/tokens.js";
import { parseCookies, sessionSetCookie, sessionClearCookie, SESSION_COOKIE } from "./lib/cookies.js";
import { getEntitlement } from "./lib/entitlement.js";
import { sendMagicLink } from "./lib/email.js";
import { patreonAuthorizeUrl, exchangeCode, fetchIdentity, membershipStatus } from "./lib/patreon.js";

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...extra } });

async function currentEmail(request, env) {
  const cookie = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  const sess = await verifySession(cookie, env.SESSION_SIGNING_KEY);
  return sess ? sess.email : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p.startsWith("/premium/")) return new Response("Forbidden", { status: 403 });

    if (p === "/api/auth/request" && request.method === "POST") {
      let email = "";
      try { email = (await request.json()).email; } catch {}
      email = String(email || "").trim().toLowerCase();
      if (email) {
        const token = await issueMagicToken(env.AUTH_TOKENS, email);
        const link = `${env.BASE_URL}/api/auth/callback?token=${token}`;
        await sendMagicLink(env, email, link);
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

    if (p === "/api/auth/patreon") {
      const state = await issueMagicToken(env.AUTH_TOKENS, "patreon-oauth-state");
      return new Response(null, { status: 302, headers: { location: patreonAuthorizeUrl(env, state) } });
    }

    if (p === "/api/auth/patreon/callback") {
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const marker = await consumeMagicToken(env.AUTH_TOKENS, state);
      if (marker !== "patreon-oauth-state")
        return new Response("잘못된 요청입니다. 다시 시도해 주세요.", { status: 400 });

      let email, active;
      try {
        const token = await exchangeCode(env, code);
        const identity = await fetchIdentity(env, token.access_token);
        ({ email, active } = membershipStatus(identity));
      } catch (e) {
        return new Response("Patreon 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.", { status: 502 });
      }
      if (!email)
        return new Response("Patreon 계정에 이메일이 필요합니다.", { status: 400 });

      const now = Math.floor(Date.now() / 1000);
      const existing = await env.DB.prepare("SELECT created_at, provider, status FROM subscribers WHERE email = ?").bind(email).first();
      const createdAt = existing ? existing.created_at : now;
      // A manually-granted active row (provider='manual' — e.g. the creator, comps,
      // support fixes) is an OVERRIDE: a Patreon login must never downgrade it just
      // because this person isn't a paying patron of the campaign (the creator of a
      // campaign is not its patron). Patreon results only apply to patreon-managed rows.
      const manualActive = existing && existing.provider === "manual" && existing.status === "active";
      if (!manualActive) {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,NULL,'patreon',?,?)"
        ).bind(email, active ? "active" : "canceled", createdAt, now).run();
      }

      const entitledNow = active || manualActive;
      const session = await signSession(email, env.SESSION_SIGNING_KEY);
      const location = entitledNow ? "/" : "/?patreon=inactive";
      return new Response(null, { status: 302, headers: { location, "set-cookie": sessionSetCookie(session) } });
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
      const res = await env.ASSETS.fetch(new URL("/premium/full.json", env.BASE_URL));
      if (!res.ok) return json({ reason: "unavailable" }, 503);
      const map = await res.json();
      const cardsByKey = map.cards || map;
      const full = cardsByKey[`${section}/${id}`];
      if (!full) return json({ reason: "not_found" }, 404);
      return json({ full });
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
      const clip = (s, n) => String(s || "").replace(/\s+/g, " ").slice(0, n);
      const lines = items.map((it) =>
        `- ${clip(it.date, 10)} [${clip(it.tool, 30)}${it.isSel ? " · 선택한 뉴스" : ""}] ${clip(it.headline, 120)} — ${clip(it.body, 180)}`
      ).join("\n");
      // 동일 클러스터는 캐시 재사용 (LLM 호출 비용 절약)
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines));
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
      const cacheKey = `insum:${hash}`;
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
