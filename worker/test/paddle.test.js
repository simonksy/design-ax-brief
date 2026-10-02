import { describe, it, expect } from "vitest";
import { verifyPaddleSignature } from "../lib/paddle.js";

const SECRET = "pdl_ntfset_test_secret";
const BODY = '{"event_id":"evt_1","event_type":"subscription.activated"}';

// 테스트가 직접 서명을 만든다 — 구현과 같은 알고리즘을 독립적으로 재현해 둬야
// 구현이 틀렸을 때 테스트가 함께 틀리지 않는다.
async function sign(body, ts, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyPaddleSignature", () => {
  const now = 1800000000;

  it("올바른 서명은 통과한다", async () => {
    const h = `ts=${now};h1=${await sign(BODY, now)}`;
    expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(true);
  });

  it("바디가 한 글자라도 다르면 거부한다", async () => {
    const h = `ts=${now};h1=${await sign(BODY, now)}`;
    expect(await verifyPaddleSignature(BODY + " ", h, SECRET, now)).toBe(false);
  });

  it("다른 시크릿으로 만든 서명은 거부한다", async () => {
    const h = `ts=${now};h1=${await sign(BODY, now, "wrong_secret")}`;
    expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(false);
  });

  it("5초를 넘게 벗어난 타임스탬프는 거부한다 (재전송 공격)", async () => {
    const old = now - 6;
    const h = `ts=${old};h1=${await sign(BODY, old)}`;
    expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(false);
  });

  it("5초 이내면 과거·미래 모두 통과한다", async () => {
    for (const ts of [now - 5, now + 5]) {
      const h = `ts=${ts};h1=${await sign(BODY, ts)}`;
      expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(true);
    }
  });

  it("헤더가 없거나 형식이 깨졌으면 거부한다", async () => {
    for (const h of [null, "", "garbage", "ts=;h1=", `ts=${now}`, `h1=abc`])
      expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(false);
  });

  it("시크릿이 비어 있으면 거부한다 — 설정 누락이 통과로 둔갑하면 안 된다", async () => {
    const h = `ts=${now};h1=${await sign(BODY, now)}`;
    expect(await verifyPaddleSignature(BODY, h, "", now)).toBe(false);
    expect(await verifyPaddleSignature(BODY, h, undefined, now)).toBe(false);
  });

  it("서명 길이가 다르면 거부한다 (상수시간 비교가 길이에서 터지지 않는지)", async () => {
    expect(await verifyPaddleSignature(BODY, `ts=${now};h1=ab`, SECRET, now)).toBe(false);
  });
});
