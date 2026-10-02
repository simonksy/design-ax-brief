import { env, fetchMock, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll, vi } from "vitest";
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
  occurred_at: o.occurredAt ?? new Date().toISOString(),
  data: { id: "sub_1", customer_id: o.customerId ?? "ctm_1", status: "active",
          ...(o.email === null ? {} : { custom_data: { email: o.email ?? "wh@x.com" } }),
          ...(o.data || {}),
          current_billing_period: { starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 30 * DAY * 1000).toISOString() } },
});

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
  // 웹훅은 이제 적용된 이벤트마다 Paddle 고객 이메일을 조회해 custom_data와 비교한다
  // (waitUntil). 기본 고객(ctm_1)은 404로 막아 테스트가 네트워크를 타지 않게 한다.
  fetchMock.activate();
  fetchMock.disableNetConnect();
  fetchMock.get("https://sandbox-api.paddle.com")
    .intercept({ path: /^\/customers\/ctm_1$/, method: "GET" }).reply(404, "").persist();
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

// 돈이 흐르는 경로에서 조용히 거부되는 모든 분기는 로그를 남겨야 한다.
// PADDLE_WEBHOOK_SECRET 오타 하나로 모든 이벤트가 흔적 없이 401이 되는 것이
// 출시일 가장 그럴듯한 실패다.
describe("웹훅 관측성", () => {
  const logs = () => spy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
  let spy;
  const watch = () => { spy = vi.spyOn(console, "error").mockImplementation(() => {}); };
  const stop = () => spy.mockRestore();

  it("서명 거부를 이벤트 id와 함께 기록한다", async () => {
    watch();
    try {
      const body = webhookBody({ eventId: "evt_badsig", email: "badsig@x.com" });
      const res = await call("/api/billing/webhook", { method: "POST", body,
        headers: { "paddle-signature": `ts=${Math.floor(Date.now() / 1000)};h1=${"0".repeat(64)}` } });
      expect(res.status).toBe(401);
      expect(logs()).toContain("signature rejected");
      expect(logs()).toContain("evt_badsig");
    } finally { stop(); }
  });

  it("바디가 파싱되지 않는 서명 거부도 그 사실을 기록한다", async () => {
    watch();
    try {
      const res = await call("/api/billing/webhook", { method: "POST", body: "not json{{",
        headers: { "paddle-signature": `ts=${Math.floor(Date.now() / 1000)};h1=${"0".repeat(64)}` } });
      expect(res.status).toBe(401);
      expect(logs()).toContain("body did not parse");
    } finally { stop(); }
  });

  it("custom_data가 없어 고객 조회로 대체하면 양쪽 주소를 기록한다", async () => {
    fetchMock.get("https://sandbox-api.paddle.com")
      .intercept({ path: "/customers/ctm_fallback", method: "GET" })
      .reply(200, JSON.stringify({ data: { email: "fallback@x.com" } }));
    watch();
    try {
      const res = await post("/api/billing/webhook",
        webhookBody({ eventId: "evt_fb", email: null, customerId: "ctm_fallback" }));
      expect(res.status).toBe(200);
      expect(logs()).toContain("custom_data.email absent");
      expect(logs()).toContain("evt_fb");
      expect(logs()).toContain("fallback@x.com");
    } finally { stop(); }
    const me = await call("/api/me", { headers: { cookie: await cookieFor("fallback@x.com") } });
    expect((await me.json()).entitled).toBe(true);
  });

  it("custom_data와 Paddle 고객 이메일이 다르면 기록하되 막지 않는다", async () => {
    fetchMock.get("https://sandbox-api.paddle.com")
      .intercept({ path: "/customers/ctm_mismatch", method: "GET" })
      .reply(200, JSON.stringify({ data: { email: "typed@x.com" } }));
    watch();
    try {
      const res = await post("/api/billing/webhook",
        webhookBody({ eventId: "evt_mm", email: "account@x.com", customerId: "ctm_mismatch" }));
      expect(res.status).toBe(200);
      expect(logs()).toContain("email mismatch");
      expect(logs()).toContain("account@x.com");
      expect(logs()).toContain("typed@x.com");
    } finally { stop(); }
    // 권한은 세션이 있는 주소(custom_data)에 열린다 — 거부하지 않는다.
    const me = await call("/api/me", { headers: { cookie: await cookieFor("account@x.com") } });
    expect((await me.json()).entitled).toBe(true);
  });

  it("중복 재전송을 기록한다", async () => {
    const body = webhookBody({ eventId: "evt_dup_log", email: "dup@x.com" });
    expect((await post("/api/billing/webhook", body)).status).toBe(200);
    watch();
    try {
      const res = await post("/api/billing/webhook", body);
      expect((await res.json()).result).toBe("duplicate");
      expect(logs()).toContain("duplicate event ignored");
      expect(logs()).toContain("evt_dup_log");
    } finally { stop(); }
  });

  it("늦게 온 이벤트를 버릴 때도 기록한다", async () => {
    const now = Date.now();
    await post("/api/billing/webhook", webhookBody({ eventId: "evt_new", email: "order@x.com",
      occurredAt: new Date(now).toISOString() }));
    watch();
    try {
      const res = await post("/api/billing/webhook", webhookBody({ eventId: "evt_old",
        email: "order@x.com", occurredAt: new Date(now - 60000).toISOString() }));
      expect((await res.json()).result).toBe("stale");
      expect(logs()).toContain("not applied (stale or manual-protected)");
      expect(logs()).toContain("evt_old");
    } finally { stop(); }
  });
});

describe("갱신과 환불이 만료일을 실제로 움직인다", () => {
  const endOf = (email) => env.DB
    .prepare("SELECT current_period_end e FROM subscribers WHERE email = ?").bind(email).first();

  it("갱신 결제 1회가 current_period_end를 밀어준다", async () => {
    const t0 = Date.now();
    await post("/api/billing/webhook", webhookBody({ eventId: "evt_r1", email: "renew@x.com",
      occurredAt: new Date(t0).toISOString() }));
    const before = (await endOf("renew@x.com")).e;

    const nextEnd = new Date(t0 + 60 * DAY * 1000).toISOString();
    const res = await post("/api/billing/webhook", webhookBody({
      eventId: "evt_r2", type: "transaction.completed", email: "renew@x.com",
      occurredAt: new Date(t0 + 1000).toISOString(),
      data: { billing_period: { starts_at: new Date(t0).toISOString(), ends_at: nextEnd } },
    }));
    expect((await res.json()).result).toBe("applied");

    const after = (await endOf("renew@x.com")).e;
    expect(after).toBe(Math.floor(Date.parse(nextEnd) / 1000));
    expect(after).toBeGreaterThan(before);
    const me = await call("/api/me", { headers: { cookie: await cookieFor("renew@x.com") } });
    expect((await me.json()).entitled).toBe(true);
  });

  it("환불/차지백은 만료일을 지금으로 당겨 권한을 닫는다", async () => {
    const t0 = Date.now();
    await post("/api/billing/webhook", webhookBody({ eventId: "evt_f1", email: "refund@x.com",
      occurredAt: new Date(t0 - 60000).toISOString() }));
    const me1 = await call("/api/me", { headers: { cookie: await cookieFor("refund@x.com") } });
    expect((await me1.json()).entitled).toBe(true);

    const at = new Date(t0).toISOString();   // 환불 시각 = 지금. 이후는 열려 있지 않다.
    const res = await post("/api/billing/webhook", webhookBody({
      eventId: "evt_f2", type: "adjustment.created", email: "refund@x.com", occurredAt: at,
      data: { action: "refund", status: "approved",
              items: [{ item_id: "txnitm_1", type: "full", amount: "5990" }] },
    }));
    expect((await res.json()).result).toBe("applied");
    expect((await endOf("refund@x.com")).e).toBe(Math.floor(Date.parse(at) / 1000));
    const me2 = await call("/api/me", { headers: { cookie: await cookieFor("refund@x.com") } });
    expect((await me2.json()).entitled).toBe(false);
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

  // 금액이 i18n 문자열에 박혀 있으면 Paddle에서 가격이 바뀐 순간 버튼과 결제창의
  // 금액이 갈린다 — 차지백 사유다. 표시 금액은 서버(env)가 확정한다.
  it("표시 가격 문구를 env에서 내려준다 (로그인 전에도 읽을 수 있다)", async () => {
    const res = await call("/api/billing/checkout");
    expect(res.status).toBe(200);
    expect((await res.json()).labels).toEqual({
      monthly: env.PADDLE_PRICE_MONTHLY_LABEL, yearly: env.PADDLE_PRICE_YEARLY_LABEL });
  });

  it("결제 시작 응답에도 선택한 플랜의 표시 문구가 실린다", async () => {
    const cookie = await cookieFor("labels@x.com");
    for (const [plan, want] of [["monthly", env.PADDLE_PRICE_MONTHLY_LABEL],
                                ["yearly", env.PADDLE_PRICE_YEARLY_LABEL]]) {
      const res = await call("/api/billing/checkout", { method: "POST", headers: { cookie },
        body: JSON.stringify({ plan }) });
      expect((await res.json()).label).toBe(want);
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

// 갱신이 실패해 기간이 끝난 구독자가 가장 곤란하다: 관리 링크(=카드 고치는 길)가
// 사라지고, 남은 건 "구독하기"뿐이어서 두 번째 구독을 열어 첫 구독을 고아로 만든다.
describe("만료된 구독자", () => {
  const seed = async (email, status, end) => {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO subscribers
       (email,status,current_period_end,provider,provider_customer_id,created_at,updated_at)
       VALUES (?,?,?,'paddle','ctm_1',?,?)`
    ).bind(email, status, end, now, now).run();
  };
  const me = async (email) => (await call("/api/me",
    { headers: { cookie: await cookieFor(email) } })).json();

  it("권한은 닫혔어도 hasSubscription은 true다 — 관리 링크가 사라지면 안 된다", async () => {
    await seed("lapsed@x.com", "past_due", Math.floor(Date.now() / 1000) - DAY);
    expect(await me("lapsed@x.com")).toMatchObject({ entitled: false, hasSubscription: true });
  });

  it("그 상태에서 체크아웃은 409 — 두 번째 구독을 열지 않는다", async () => {
    await seed("lapsed2@x.com", "past_due", Math.floor(Date.now() / 1000) - DAY);
    const res = await call("/api/billing/checkout", { method: "POST",
      headers: { cookie: await cookieFor("lapsed2@x.com") }, body: JSON.stringify({ plan: "monthly" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("already_subscribed");
  });

  it("해지(canceled) 이력은 다시 구독할 수 있다", async () => {
    await seed("gone@x.com", "canceled", Math.floor(Date.now() / 1000) - DAY);
    expect(await me("gone@x.com")).toMatchObject({ entitled: false, hasSubscription: false });
    const res = await call("/api/billing/checkout", { method: "POST",
      headers: { cookie: await cookieFor("gone@x.com") }, body: JSON.stringify({ plan: "monthly" }) });
    expect(res.status).toBe(200);
  });

  it("수동 부여(provider='manual')는 Paddle 구독이 아니다", async () => {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,NULL,'manual',?,?)"
    ).bind("comp@x.com", "active", now, now).run();
    expect(await me("comp@x.com")).toMatchObject({ entitled: true, hasSubscription: false });
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
