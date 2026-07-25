import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";

beforeAll(async () => {
  for (const stmt of schema.split(";").map(s => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,?,?,?,?)"
  ).bind("paid@x.com", "active", null, "manual", now, now).run();
});

async function call(path, init) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("auth + entitlement", () => {
  it("me is logged-out by default", async () => {
    expect(await (await call("/api/me")).json()).toEqual({ loggedIn: false, email: null, entitled: false });
  });

  it("magic-link login yields an entitled session for an allowlisted email", async () => {
    const r1 = await call("/api/auth/request", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "paid@x.com" }),
    });
    expect((await r1.json()).ok).toBe(true);
    const link = env.__lastMagicLink;              // stub captures the URL
    const token = new URL(link).searchParams.get("token");
    const r2 = await call("/api/auth/callback?token=" + token);
    const cookie = r2.headers.get("set-cookie");
    expect(cookie).toMatch(/ax_session=/);
    const sess = cookie.split(";")[0].split("=")[1];
    const me = await (await call("/api/me", { headers: { cookie: "ax_session=" + sess } })).json();
    expect(me).toEqual({ loggedIn: true, email: "paid@x.com", entitled: true });
  });

  it("non-allowlisted email logs in but is not entitled", async () => {
    await call("/api/auth/request", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "free@x.com" }),
    });
    const token = new URL(env.__lastMagicLink).searchParams.get("token");
    const cookie = (await call("/api/auth/callback?token=" + token)).headers.get("set-cookie");
    const sess = cookie.split(";")[0].split("=")[1];
    const me = await (await call("/api/me", { headers: { cookie: "ax_session=" + sess } })).json();
    expect(me).toEqual({ loggedIn: true, email: "free@x.com", entitled: false });
  });

  it("returns ok (no crash) for a non-string email value", async () => {
    const res = await call("/api/auth/request", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: 123 }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
