import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "../lib/crypto.js";

const KEY = "test-signing-key-1234567890";

describe("session crypto", () => {
  it("round-trips a signed session", async () => {
    const tok = await signSession("a@b.com", KEY);
    expect(await verifySession(tok, KEY)).toEqual({ email: "a@b.com" });
  });
  it("rejects a tampered payload", async () => {
    const tok = await signSession("a@b.com", KEY);
    const bad = "x" + tok.slice(1);
    expect(await verifySession(bad, KEY)).toBeNull();
  });
  it("rejects an expired session", async () => {
    const tok = await signSession("a@b.com", KEY, -1); // already expired
    expect(await verifySession(tok, KEY)).toBeNull();
  });
});
