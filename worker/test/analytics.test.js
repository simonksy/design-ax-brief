import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import { signSession } from "../lib/crypto.js";
import { refHost, normalize, utcDay, visitorId } from "../lib/analytics.js";

const ADMIN = "owner@x.com";

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,?,?,?,?)"
  ).bind(ADMIN, "active", null, "manual", now, now).run();
});

beforeEach(async () => { await env.DB.exec("DELETE FROM events"); });

async function call(path, init) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, init), env, ctx);
  await waitOnExecutionContext(ctx);   // /api/e writes via waitUntil
  return res;
}
const post = (events, headers = {}) => call("/api/e", {
  method: "POST",
  headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...headers },
  body: JSON.stringify({ events }),
});
const rows = async () =>
  (await env.DB.prepare("SELECT * FROM events ORDER BY id").all()).results;

describe("event collection", () => {
  it("stores an allowlisted event and answers 204", async () => {
    const res = await post([{ name: "page_view" }]);
    expect(res.status).toBe(204);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("page_view");
    expect(r[0].day).toBe(utcDay(Date.now()));
  });

  it("drops unknown event names but keeps the valid ones in the same batch", async () => {
    await post([{ name: "page_view" }, { name: "evil_injected" }, { name: "share_click" }]);
    expect((await rows()).map((r) => r.name)).toEqual(["page_view", "share_click"]);
  });

  it("caps a batch at 20 rows so one caller cannot flood the table", async () => {
    await post(Array.from({ length: 50 }, () => ({ name: "card_view" })));
    expect(await rows()).toHaveLength(20);
  });

  it("never 500s or writes on malformed input", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://localhost/api/e", { method: "POST", body: "not json" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(204);
    expect(await rows()).toHaveLength(0);
  });

  it("truncates oversized fields instead of rejecting them", async () => {
    await post([{ name: "card_view", section: "x".repeat(200), cardId: "y".repeat(500) }]);
    const r = (await rows())[0];
    expect(r.section).toHaveLength(24);
    expect(r.card_id).toHaveLength(96);
  });

  it("is not reachable by GET", async () => {
    const res = await call("/api/e");
    expect(res.status).not.toBe(204);
  });
});

describe("privacy", () => {
  it("stores no IP or user-agent, only a hashed visitor id", async () => {
    await post([{ name: "page_view" }], { "user-agent": "Mozilla/5.0 (test)" });
    const r = (await rows())[0];
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("203.0.113.9");
    expect(blob).not.toContain("Mozilla");
    expect(r.visitor).toMatch(/^[0-9a-f]{16}$/);
  });

  it("gives the same device one id within a day and a different one the next day", async () => {
    const req = new Request("http://localhost/api/e", {
      headers: { "cf-connecting-ip": "203.0.113.9", "user-agent": "UA" },
    });
    const a = await visitorId(req, env, "2026-09-26");
    const b = await visitorId(req, env, "2026-09-26");
    const c = await visitorId(req, env, "2026-09-27");
    expect(a).toBe(b);
    expect(a).not.toBe(c);   // unjoinable across days
  });

  it("does not collapse every IP-less request onto one shared visitor", async () => {
    const req = new Request("http://localhost/api/e");
    const a = await visitorId(req, env, "2026-09-26");
    const b = await visitorId(req, env, "2026-09-26");
    expect(a).not.toBe(b);
  });

  it("keeps only the referrer host, and ignores internal navigation", () => {
    expect(refHost("https://www.threads.com/@x/post/123?q=1", "axitnow.com")).toBe("threads.com");
    expect(refHost("https://axitnow.com/large", "axitnow.com")).toBeNull();
    expect(refHost("", "axitnow.com")).toBeNull();
    expect(refHost("not a url", "axitnow.com")).toBeNull();
  });

  it("sets no cookie", async () => {
    const res = await post([{ name: "page_view" }]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("normalize", () => {
  const ctx = { ts: 1, day: "2026-09-26", visitor: "v", ref: null, country: "KR", entitled: false };

  it("accepts a bare object, an array, and {events:[...]}", () => {
    expect(normalize({ name: "page_view" }, ctx)).toHaveLength(1);
    expect(normalize([{ name: "page_view" }], ctx)).toHaveLength(1);
    expect(normalize({ events: [{ name: "page_view" }] }, ctx)).toHaveLength(1);
  });

  it("accepts cardId in either camelCase or snake_case", () => {
    expect(normalize({ name: "card_view", cardId: "a" }, ctx)[0].card_id).toBe("a");
    expect(normalize({ name: "card_view", card_id: "b" }, ctx)[0].card_id).toBe("b");
  });
});

describe("/api/stats", () => {
  const adminCookie = async () => "ax_session=" + (await signSession(ADMIN, env.SESSION_SIGNING_KEY));

  it("is 403 for anonymous and for a non-admin subscriber", async () => {
    expect((await call("/api/stats")).status).toBe(403);
    const other = "ax_session=" + (await signSession("paid@x.com", env.SESSION_SIGNING_KEY));
    expect((await call("/api/stats", { headers: { cookie: other } })).status).toBe(403);
  });

  it("counts DISTINCT visitors per step, not raw hits", async () => {
    // One visitor (same IP+UA) bouncing off the paywall three times.
    for (let i = 0; i < 3; i++) await post([{ name: "paywall_view", section: "design" }]);
    await post([{ name: "page_view" }]);
    const res = await call("/api/stats?days=7", { headers: { cookie: await adminCookie() } });
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.funnel.steps.paywall_view.visitors).toBe(1);
    expect(b.funnel.steps.paywall_view.hits).toBe(3);
  });

  it("reports the funnel rates and names the unmeasurable step", async () => {
    await post([{ name: "page_view" }, { name: "paywall_view" }, { name: "subscribe_open" }]);
    const b = await (await call("/api/stats", { headers: { cookie: await adminCookie() } })).json();
    expect(b.funnel.rates.paywall_reach).toBe(100);
    expect(b.funnel.rates.checkout_click).toBe(0);
    expect(b.funnel.blind_spot).toMatch(/webhook/);
  });

  it("breaks engagement down per section", async () => {
    await post([{ name: "card_read", section: "politics" }, { name: "card_read", section: "design" }]);
    const b = await (await call("/api/stats", { headers: { cookie: await adminCookie() } })).json();
    expect(b.sections.politics.card_read).toBe(1);
    expect(b.sections.design.card_read).toBe(1);
  });

  it("ranks referrers by visitors", async () => {
    await post([{ name: "page_view" }], { referer: "https://www.threads.com/@a/post/1" });
    const b = await (await call("/api/stats", { headers: { cookie: await adminCookie() } })).json();
    expect(b.referrers[0]).toMatchObject({ ref: "threads.com", visitors: 1 });
  });

  it("clamps the days window", async () => {
    const c = await adminCookie();
    expect((await (await call("/api/stats?days=9999", { headers: { cookie: c } })).json()).days).toBe(90);
    expect((await (await call("/api/stats?days=junk", { headers: { cookie: c } })).json()).days).toBe(14);
  });
});
