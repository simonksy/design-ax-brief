import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import schema from "../schema.sql?raw";
import { getEntitlement } from "../lib/entitlement.js";

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

async function put(email, status, periodEnd) {
  const t = now();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,?,'paddle',?,?)"
  ).bind(email, status, periodEnd, t, t).run();
}

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
});

describe("getEntitlement", () => {
  it("행이 없으면 권한 없음", async () => {
    expect((await getEntitlement(env.DB, "nobody@x.com")).entitled).toBe(false);
  });

  it("active + 미래 만료일 → 권한 있음", async () => {
    await put("a@x.com", "active", now() + 30 * DAY);
    expect((await getEntitlement(env.DB, "a@x.com")).entitled).toBe(true);
  });

  it("active + 지난 만료일 → 권한 없음", async () => {
    await put("b@x.com", "active", now() - DAY);
    expect((await getEntitlement(env.DB, "b@x.com")).entitled).toBe(false);
  });

  it("해지해도 남은 기간은 보장된다", async () => {
    await put("c@x.com", "canceled", now() + 10 * DAY);
    const e = await getEntitlement(env.DB, "c@x.com");
    expect(e.entitled).toBe(true);
    expect(e.status).toBe("canceled");
  });

  it("해지 + 기간 만료 → 권한 없음", async () => {
    await put("d@x.com", "canceled", now() - DAY);
    expect((await getEntitlement(env.DB, "d@x.com")).entitled).toBe(false);
  });

  it("결제 실패(past_due)도 기간 내에는 열어둔다", async () => {
    await put("e@x.com", "past_due", now() + 3 * DAY);
    expect((await getEntitlement(env.DB, "e@x.com")).entitled).toBe(true);
  });

  it("만료일 NULL은 active일 때만 권한 — 수동 부여 전용", async () => {
    await put("f@x.com", "active", null);
    expect((await getEntitlement(env.DB, "f@x.com")).entitled).toBe(true);
    await put("g@x.com", "canceled", null);
    expect((await getEntitlement(env.DB, "g@x.com")).entitled).toBe(false);
  });
});
