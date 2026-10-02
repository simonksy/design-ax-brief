import { env, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { sendMagicLink } from "../lib/email.js";

describe("sendMagicLink", () => {
  it("posts to Resend when a real key is set", async () => {
    const realEnv = { ...env, RESEND_API_KEY: "re_live_key" };
    fetchMock.activate(); fetchMock.disableNetConnect();
    let seen = null;
    fetchMock.get("https://api.resend.com").intercept({ path: "/emails", method: "POST" })
      .reply(200, (opts) => { seen = JSON.parse(opts.body); return JSON.stringify({ id: "x" }); });
    await sendMagicLink(realEnv, "a@b.com", "http://localhost/api/auth/callback?token=t");
    expect(seen.to).toContain("a@b.com");
    expect(JSON.stringify(seen)).toContain("callback?token=t");
    expect(seen.from).toContain("onboarding@resend.dev");   // 기본값(폴백)
  });

  // 기본 발신 주소는 Resend 공용 샌드박스라 계정 소유자에게만 배달된다.
  // 도메인 인증 후 코드 변경 없이 바꿀 수 있어야 한다.
  it("env.MAIL_FROM이 있으면 그 주소로 발신한다", async () => {
    const realEnv = { ...env, RESEND_API_KEY: "re_live_key", MAIL_FROM: "AX-it NOW <hello@axitnow.com>" };
    fetchMock.activate(); fetchMock.disableNetConnect();
    let seen = null;
    fetchMock.get("https://api.resend.com").intercept({ path: "/emails", method: "POST" })
      .reply(200, (opts) => { seen = JSON.parse(opts.body); return JSON.stringify({ id: "x" }); });
    await sendMagicLink(realEnv, "a@b.com", "http://localhost/x");
    expect(seen.from).toBe("AX-it NOW <hello@axitnow.com>");
  });

  it("Resend가 실패하면 throw한다 — 호출자가 성공으로 착각하면 안 된다", async () => {
    const realEnv = { ...env, RESEND_API_KEY: "re_live_key" };
    fetchMock.activate(); fetchMock.disableNetConnect();
    fetchMock.get("https://api.resend.com").intercept({ path: "/emails", method: "POST" })
      .reply(422, JSON.stringify({ message: "domain not verified" }));
    await expect(sendMagicLink(realEnv, "a@b.com", "http://localhost/x")).rejects.toThrow(/422/);
  });
});
