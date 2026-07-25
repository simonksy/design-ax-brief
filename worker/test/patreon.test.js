import { env, fetchMock, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import { membershipStatus } from "../lib/patreon.js";
import { issueMagicToken } from "../lib/tokens.js";

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
});

async function call(path, init) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function identityJson({ email, patronStatus }) {
  return {
    data: { attributes: email == null ? {} : { email } },
    included: patronStatus === undefined ? [] : [
      { type: "member", attributes: { patron_status: patronStatus } },
    ],
  };
}

function mockPatreonExchange({ email, patronStatus }) {
  fetchMock.activate();
  fetchMock.disableNetConnect();
  const pool = fetchMock.get("https://www.patreon.com");
  pool.intercept({ path: "/api/oauth2/token", method: "POST" })
    .reply(200, JSON.stringify({ access_token: "test-access-token" }));
  pool.intercept({ path: /^\/api\/oauth2\/v2\/identity/, method: "GET" })
    .reply(200, JSON.stringify(identityJson({ email, patronStatus })));
}

describe("membershipStatus (pure)", () => {
  it("active patron -> {email, active:true}", () => {
    const j = identityJson({ email: "patron@x.com", patronStatus: "active_patron" });
    expect(membershipStatus(j)).toEqual({ email: "patron@x.com", active: true });
  });

  it("declined patron -> active:false", () => {
    const j = identityJson({ email: "d@x.com", patronStatus: "declined_patron" });
    expect(membershipStatus(j)).toEqual({ email: "d@x.com", active: false });
  });

  it("null patron_status -> active:false", () => {
    const j = identityJson({ email: "n@x.com", patronStatus: null });
    expect(membershipStatus(j)).toEqual({ email: "n@x.com", active: false });
  });

  it("no included -> active:false", () => {
    const j = { data: { attributes: { email: "solo@x.com" } } };
    expect(membershipStatus(j)).toEqual({ email: "solo@x.com", active: false });
  });

  it("no email -> {email:null, active:false}", () => {
    const j = identityJson({ email: null, patronStatus: "active_patron" });
    expect(membershipStatus(j)).toEqual({ email: null, active: false });
  });
});

describe("Patreon OAuth callback", () => {
  it("invalid/missing state -> 400", async () => {
    const res = await call("/api/auth/patreon/callback?code=abc&state=not-a-real-token");
    expect(res.status).toBe(400);
  });

  it("valid state + active patron -> 302 with session cookie, then /api/me entitled:true", async () => {
    const state = await issueMagicToken(env.AUTH_TOKENS, "patreon-oauth-state");
    mockPatreonExchange({ email: "activepatron@x.com", patronStatus: "active_patron" });

    const res = await call(`/api/auth/patreon/callback?code=goodcode&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/ax_session=/);
    const sess = cookie.split(";")[0].split("=")[1];

    const me = await (await call("/api/me", { headers: { cookie: "ax_session=" + sess } })).json();
    expect(me).toEqual({ loggedIn: true, email: "activepatron@x.com", entitled: true });
  });

  it("valid state + inactive patron -> 302 to /?patreon=inactive, /api/me entitled:false", async () => {
    const state = await issueMagicToken(env.AUTH_TOKENS, "patreon-oauth-state");
    mockPatreonExchange({ email: "lapsed@x.com", patronStatus: "former_patron" });

    const res = await call(`/api/auth/patreon/callback?code=goodcode&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?patreon=inactive");
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/ax_session=/);
    const sess = cookie.split(";")[0].split("=")[1];

    const me = await (await call("/api/me", { headers: { cookie: "ax_session=" + sess } })).json();
    expect(me).toEqual({ loggedIn: true, email: "lapsed@x.com", entitled: false });
  });

  it("state reused a second time -> 400 (single-use)", async () => {
    const state = await issueMagicToken(env.AUTH_TOKENS, "patreon-oauth-state");
    mockPatreonExchange({ email: "reuse@x.com", patronStatus: "active_patron" });
    const first = await call(`/api/auth/patreon/callback?code=goodcode&state=${state}`);
    expect(first.status).toBe(302);
    const second = await call(`/api/auth/patreon/callback?code=goodcode&state=${state}`);
    expect(second.status).toBe(400);
  });
});

describe("GET /api/auth/patreon", () => {
  it("302s to the Patreon authorize URL", async () => {
    const res = await call("/api/auth/patreon");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location");
    expect(loc).toMatch(/^https:\/\/www\.patreon\.com\/oauth2\/authorize\?/);
    expect(loc).toContain("client_id=test-patreon-client");
    expect(loc).toContain("state=");
  });
});
