import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";

beforeAll(async () => {
  for (const stmt of schema.split(";").map(s => s.trim()).filter(Boolean)) {
    await env.DB.exec(stmt.replace(/\s+/g, " "));
  }
});

async function call(path, init) {
  const req = new Request("http://localhost" + path, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("worker skeleton", () => {
  it("403s direct premium access", async () => {
    const res = await call("/premium/full.json");
    expect(res.status).toBe(403);
  });
});

export { call, schema };
