import { env, fetchMock, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
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
    expect(await (await call("/api/me")).json()).toEqual({ loggedIn: false, email: null, entitled: false, hasSubscription: false });
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
    expect(me).toEqual({ loggedIn: true, email: "paid@x.com", entitled: true, hasSubscription: false });
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
    expect(me).toEqual({ loggedIn: true, email: "free@x.com", entitled: false, hasSubscription: false });
  });

  // 발송 실패를 200으로 숨기면 사용자는 오지 않는 메일을 영원히 기다린다.
  // (주소가 등록돼 있는지는 여전히 숨긴다 — 그건 별개의 사건이다.)
  it("메일 발송이 실제로 실패하면 2xx가 아니다", async () => {
    const saved = env.RESEND_API_KEY;
    fetchMock.activate(); fetchMock.disableNetConnect();
    fetchMock.get("https://api.resend.com").intercept({ path: "/emails", method: "POST" })
      .reply(500, "boom");
    env.RESEND_API_KEY = "re_live_key";
    try {
      const res = await call("/api/auth/request", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "sendfail@x.com" }),
      });
      expect(res.status).toBe(502);
      expect((await res.json()).ok).toBe(false);
    } finally {
      env.RESEND_API_KEY = saved;
      fetchMock.deactivate();
    }
  });

  // 인증 없는 무제한 메일 발송기는 메일 쿼터를 말려 로그인(=결제의 선행 관문)을
  // 막고, 제3자에게 메일을 퍼붓는 중계기로도 쓰인다.
  describe("/api/auth/request 스로틀", () => {
    const links = async () => (await env.AUTH_TOKENS.list({ prefix: "ml:" })).keys.length;
    const ask = (email, ip) => call("/api/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ email }),
    });

    it("같은 주소로 쏟아부으면 시간당 5통에서 멈추되 응답은 ok로 같다", async () => {
      const before = await links();
      for (let i = 0; i < 8; i++) {
        const res = await ask("flood@x.com", "203.0.113.9");
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);   // 제한에 걸렸음을 알려주지 않는다
      }
      expect((await links()) - before).toBe(5);
    });

    it("주소를 바꿔가며 쏟아부어도 IP당 시간당 15통에서 멈춘다", async () => {
      const before = await links();
      for (let i = 0; i < 18; i++) {
        const res = await ask(`victim${i}@x.com`, "203.0.113.10");
        expect(res.status).toBe(200);
      }
      expect((await links()) - before).toBe(15);
    });
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
