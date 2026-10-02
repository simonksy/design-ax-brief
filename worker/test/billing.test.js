import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import schema from "../schema.sql?raw";
import { applyEntitlement } from "../lib/billing.js";
import { getEntitlement } from "../lib/entitlement.js";

const DAY = 86400;
const base = Math.floor(Date.now() / 1000);

const delta = (o) => ({
  eventId: "evt_" + Math.random().toString(36).slice(2),
  occurredAt: base, email: "u@x.com", customerId: "ctm_1",
  status: "active", periodEnd: base + 30 * DAY, ...o,
});

const row = (email) => env.DB.prepare(
  "SELECT status, current_period_end, provider, provider_customer_id, last_event_at FROM subscribers WHERE email = ?"
).bind(email).first();

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
});

describe("applyEntitlement", () => {
  it("새 구독자를 만든다", async () => {
    expect(await applyEntitlement(env.DB, delta({ email: "new@x.com" }))).toBe("applied");
    const r = await row("new@x.com");
    expect(r.status).toBe("active");
    expect(r.provider).toBe("paddle");
    expect(r.provider_customer_id).toBe("ctm_1");
    expect((await getEntitlement(env.DB, "new@x.com")).entitled).toBe(true);
  });

  it("같은 event_id를 두 번 보내면 두 번째는 무시한다", async () => {
    const d = delta({ email: "dup@x.com" });
    expect(await applyEntitlement(env.DB, d)).toBe("applied");
    const after = { ...d, status: "canceled", periodEnd: base - DAY };
    expect(await applyEntitlement(env.DB, after)).toBe("duplicate");
    expect((await row("dup@x.com")).status).toBe("active"); // 안 바뀌어야 한다
  });

  it("늦게 도착한 옛 이벤트는 최신 상태를 덮지 않는다", async () => {
    const email = "order@x.com";
    await applyEntitlement(env.DB, delta({ email, occurredAt: base + 100, status: "active" }));
    const r = await applyEntitlement(env.DB, delta({ email, occurredAt: base, status: "canceled" }));
    expect(r).toBe("stale");
    expect((await row(email)).status).toBe("active");
  });

  it("같은 시각의 다른 이벤트는 처리한다", async () => {
    const email = "same@x.com";
    await applyEntitlement(env.DB, delta({ email, occurredAt: base, status: "active" }));
    expect(await applyEntitlement(env.DB, delta({ email, occurredAt: base, status: "past_due" })))
      .toBe("applied");
    expect((await row(email)).status).toBe("past_due");
  });

  it("periodEnd가 null이면 기존 만료일을 유지한다", async () => {
    const email = "keep@x.com";
    const end = base + 20 * DAY;
    await applyEntitlement(env.DB, delta({ email, periodEnd: end, occurredAt: base }));
    await applyEntitlement(env.DB, delta({ email, periodEnd: null, status: "past_due", occurredAt: base + 1 }));
    const r = await row(email);
    expect(r.current_period_end).toBe(end);
    expect(r.status).toBe("past_due");
  });

  it("created_at은 첫 가입 시각을 유지한다", async () => {
    const email = "created@x.com";
    await applyEntitlement(env.DB, delta({ email, occurredAt: base }));
    const first = await env.DB.prepare("SELECT created_at FROM subscribers WHERE email=?").bind(email).first();
    await applyEntitlement(env.DB, delta({ email, occurredAt: base + 10 }));
    const second = await env.DB.prepare("SELECT created_at FROM subscribers WHERE email=?").bind(email).first();
    expect(second.created_at).toBe(first.created_at);
  });

  it("수동 부여(provider='manual', 무기한)는 Paddle 이벤트가 끌어내리지 못한다", async () => {
    const t = base;
    await env.DB.prepare(
      "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,NULL,'manual',?,?)"
    ).bind("comp@x.com", "active", t, t).run();
    expect(await applyEntitlement(env.DB, delta({ email: "comp@x.com", status: "canceled" })))
      .toBe("stale");
    expect((await getEntitlement(env.DB, "comp@x.com")).entitled).toBe(true);
  });

  it("이메일 없는 delta는 거부한다", async () => {
    await expect(applyEntitlement(env.DB, delta({ email: null }))).rejects.toThrow();
  });
});
