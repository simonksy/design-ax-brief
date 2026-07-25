import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import premiumMap from "../../premium/full.json"; // real build output (Task 1)
import { signSession } from "../lib/crypto.js";

const FIRST_KEY = Object.keys(premiumMap.cards)[0];   // e.g. "design/agentface"
const [SECTION, ID] = FIRST_KEY.split("/");
const SECRET = premiumMap.cards[FIRST_KEY].blocks[0].x; // real deep-dive text to check for leaks

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
async function paidCookie() {
  return "ax_session=" + (await signSession("paid@x.com", env.SESSION_SIGNING_KEY));
}

describe("premium gating", () => {
  it("direct /premium/* is 403 and never returns the deep dive", async () => {
    const res = await call("/premium/full.json");
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(SECRET);
  });

  it("402 for a logged-out user, body has no deep dive", async () => {
    const res = await call(`/api/premium/full?section=${SECTION}&id=${ID}`);
    expect(res.status).toBe(402);
    expect(await res.text()).not.toContain(SECRET);
  });

  it("200 with the deep dive for an entitled user", async () => {
    const res = await call(`/api/premium/full?section=${SECTION}&id=${ID}`, { headers: { cookie: await paidCookie() } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.full.blocks)).toBe(true);
    expect(body.full.blocks.length).toBeGreaterThan(0);
    expect(body.full.blocks[0].x).toBe(SECRET);
  });
});
