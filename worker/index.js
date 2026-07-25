import { signSession, verifySession } from "./lib/crypto.js";
import { issueMagicToken, consumeMagicToken } from "./lib/tokens.js";
import { parseCookies, sessionSetCookie, sessionClearCookie, SESSION_COOKIE } from "./lib/cookies.js";
import { getEntitlement } from "./lib/entitlement.js";
import { sendMagicLink } from "./lib/email.js";

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
      const full = map[`${section}/${id}`];
      if (!full) return json({ reason: "not_found" }, 404);
      return json({ full });
    }

    return env.ASSETS.fetch(request);
  },
};
