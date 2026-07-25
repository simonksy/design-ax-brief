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

    return env.ASSETS.fetch(request);
  },
};
