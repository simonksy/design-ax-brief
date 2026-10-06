import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import { signUnsub, verifyUnsub } from "../lib/unsub.js";
import { getPrefs } from "../lib/mail_prefs.js";

beforeAll(async () => {
  for (const s of schema.split(";").map(x => x.trim()).filter(Boolean))
    await env.DB.exec(s.replace(/\s+/g, " "));
});
const call = (path, init) => worker.fetch(new Request("http://localhost" + path, init), env, {
  waitUntil() {}, passThroughOnException() {},
});

describe("unsubscribe", () => {
  it("서명한 토큰에서 주소를 되찾는다", async () => {
    const t = await signUnsub("a@x.com", "k");
    expect(await verifyUnsub(t, "k")).toBe("a@x.com");
  });

  it("다른 키로 서명한 토큰은 거부한다", async () => {
    const t = await signUnsub("a@x.com", "k");
    expect(await verifyUnsub(t, "other")).toBeNull();
  });

  // Review Focus 1 — 서명이 맞아도 토큰에 담긴 주소 외의 사람을 끊어선 안 된다.
  it("토큰의 주소만 끊는다 — 쿼리로 다른 주소를 끼워 넣어도 무시한다", async () => {
    const t = await signUnsub("victim@x.com", env.SESSION_SIGNING_KEY);
    await call(`/api/mail/unsubscribe?t=${t}&email=other@x.com`);
    expect((await getPrefs(env.DB, "victim@x.com")).unsub_all).toBe(1);
    expect((await getPrefs(env.DB, "other@x.com")).unsub_all).toBe(0);
  });

  it("한 번의 GET으로 끊기고, 두 번 눌러도 같은 화면이다", async () => {
    const t = await signUnsub("b@x.com", env.SESSION_SIGNING_KEY);
    const r1 = await call(`/api/mail/unsubscribe?t=${t}`);
    const r2 = await call(`/api/mail/unsubscribe?t=${t}`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((await getPrefs(env.DB, "b@x.com")).unsub_all).toBe(1);
  });

  it("서명이 깨진 토큰은 아무도 끊지 않는다", async () => {
    const r = await call("/api/mail/unsubscribe?t=garbage");
    expect(r.status).toBe(400);
  });
});
