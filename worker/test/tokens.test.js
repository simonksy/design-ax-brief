import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { issueMagicToken, consumeMagicToken } from "../lib/tokens.js";
import { parseCookies, sessionSetCookie } from "../lib/cookies.js";

describe("magic tokens", () => {
  it("issues then consumes once", async () => {
    const t = await issueMagicToken(env.AUTH_TOKENS, "a@b.com");
    expect(await consumeMagicToken(env.AUTH_TOKENS, t)).toBe("a@b.com");
    expect(await consumeMagicToken(env.AUTH_TOKENS, t)).toBeNull(); // single-use
  });
});

describe("cookies", () => {
  it("parses a cookie header", () => {
    expect(parseCookies("ax_session=abc; foo=bar").ax_session).toBe("abc");
  });
  it("builds an httpOnly set-cookie", () => {
    const c = sessionSetCookie("tok123");
    expect(c).toMatch(/ax_session=tok123/);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
  });
});
