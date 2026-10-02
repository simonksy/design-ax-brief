import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import { signSession } from "../lib/crypto.js";

const SECRET = env.PADDLE_WEBHOOK_SECRET;
const DAY = 86400;

async function sign(body, ts) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function call(path, init = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, { redirect: "manual", ...init }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function post(path, body, extraHeaders = {}) {
  const ts = Math.floor(Date.now() / 1000);
  return call(path, { method: "POST", body,
    headers: { "paddle-signature": `ts=${ts};h1=${await sign(body, ts)}`, ...extraHeaders } });
}

async function cookieFor(email) {
  return "ax_session=" + await signSession(email, env.SESSION_SIGNING_KEY);
}

const webhookBody = (o = {}) => JSON.stringify({
  event_id: o.eventId ?? "evt_" + Math.random().toString(36).slice(2),
  event_type: o.type ?? "subscription.activated",
  occurred_at: new Date().toISOString(),
  data: { id: "sub_1", customer_id: "ctm_1", status: "active",
          custom_data: { email: o.email ?? "wh@x.com" },
          current_billing_period: { starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 30 * DAY * 1000).toISOString() } },
});

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
});

describe("POST /api/billing/webhook", () => {
  it("서명이 맞으면 권한을 연다", async () => {
    const res = await post("/api/billing/webhook", webhookBody({ email: "ok@x.com" }));
    expect(res.status).toBe(200);
    const me = await call("/api/me", { headers: { cookie: await cookieFor("ok@x.com") } });
    expect((await me.json()).entitled).toBe(true);
  });

  it("서명 없이는 401이고 권한도 안 열린다", async () => {
    const res = await call("/api/billing/webhook", { method: "POST", body: webhookBody({ email: "nosig@x.com" }) });
    expect(res.status).toBe(401);
    const me = await call("/api/me", { headers: { cookie: await cookieFor("nosig@x.com") } });
    expect((await me.json()).entitled).toBe(false);
  });

  it("바디를 위조하면 401", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const good = webhookBody({ email: "a@x.com" });
    const res = await call("/api/billing/webhook", { method: "POST",
      body: webhookBody({ email: "attacker@x.com" }),
      headers: { "paddle-signature": `ts=${ts};h1=${await sign(good, ts)}` } });
    expect(res.status).toBe(401);
  });

  it("관심 없는 이벤트도 200으로 받아준다 (재전송 방지)", async () => {
    const body = JSON.stringify({ event_id: "evt_x", event_type: "product.created",
      occurred_at: new Date().toISOString(), data: { id: "pro_1" } });
    expect((await post("/api/billing/webhook", body)).status).toBe(200);
  });

  it("같은 이벤트를 두 번 보내도 200이고 상태는 한 번만 바뀐다", async () => {
    const body = webhookBody({ eventId: "evt_same", email: "twice@x.com" });
    expect((await post("/api/billing/webhook", body)).status).toBe(200);
    expect((await post("/api/billing/webhook", body)).status).toBe(200);
    const n = await env.DB.prepare("SELECT COUNT(*) c FROM processed_events WHERE event_id='evt_same'").first();
    expect(n.c).toBe(1);
  });

  it("JSON이 깨졌으면 400", async () => {
    expect((await post("/api/billing/webhook", "not json{{")).status).toBe(400);
  });
});

describe("POST /api/billing/checkout", () => {
  it("비로그인은 401 — 결제 이메일과 로그인 이메일을 일치시키기 위함", async () => {
    const res = await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "monthly" }) });
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe("login_required");
  });

  it("월간/연간 각각 올바른 price id를 돌려준다", async () => {
    const cookie = await cookieFor("buyer@x.com");
    for (const [plan, want] of [["monthly", env.PADDLE_PRICE_MONTHLY], ["yearly", env.PADDLE_PRICE_YEARLY]]) {
      const res = await call("/api/billing/checkout", { method: "POST", headers: { cookie }, body: JSON.stringify({ plan }) });
      expect(res.status).toBe(200);
      const b = await res.json();
      expect(b.priceId).toBe(want);
      expect(b.email).toBe("buyer@x.com");
      expect(b.clientToken).toBe(env.PADDLE_CLIENT_TOKEN);
    }
  });

  it("모르는 플랜은 400", async () => {
    const cookie = await cookieFor("buyer@x.com");
    for (const body of ['{"plan":"lifetime"}', "{}", "garbage"]) {
      const res = await call("/api/billing/checkout", { method: "POST", headers: { cookie }, body });
      expect(res.status).toBe(400);
    }
  });
});

describe("GET /api/billing/portal", () => {
  it("비로그인은 401", async () => {
    expect((await call("/api/billing/portal")).status).toBe(401);
  });

  it("구독 이력이 없으면 404", async () => {
    const res = await call("/api/billing/portal", { headers: { cookie: await cookieFor("nosub@x.com") } });
    expect(res.status).toBe(404);
  });
});
