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
  });
});
