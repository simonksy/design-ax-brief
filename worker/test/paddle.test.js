import { describe, it, expect } from "vitest";
import { verifyPaddleSignature, toEntitlement } from "../lib/paddle.js";

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

const ISO = "2026-10-02T03:04:05.000Z";
const EPOCH = Math.floor(Date.parse(ISO) / 1000);
const END_ISO = "2026-11-02T03:04:05.000Z";
const END = Math.floor(Date.parse(END_ISO) / 1000);

function ev(type, data = {}) {
  return { event_id: "evt_1", event_type: type, occurred_at: ISO,
           data: { id: "sub_1", customer_id: "ctm_1",
                   custom_data: { email: "Buyer@Example.COM" }, ...data } };
}

describe("toEntitlement", () => {
  it("체험 시작 → 권한 열림, 만료일은 첫 청구일", () => {
    const r = toEntitlement(ev("subscription.trialing", { next_billed_at: END_ISO }));
    expect(r).toMatchObject({ eventId: "evt_1", occurredAt: EPOCH, status: "active",
                              periodEnd: END, customerId: "ctm_1" });
  });

  it("이메일은 소문자로 정규화한다", () => {
    expect(toEntitlement(ev("subscription.activated")).email).toBe("buyer@example.com");
  });

  it("체험 전환(activated) → 권한 열림, 만료일은 청구주기 종료", () => {
    const r = toEntitlement(ev("subscription.activated",
      { current_billing_period: { starts_at: ISO, ends_at: END_ISO } }));
    expect(r.status).toBe("active");
    expect(r.periodEnd).toBe(END);
  });

  it("updated는 페이로드의 status를 그대로 반영한다", () => {
    const cases = { active: "active", trialing: "active", past_due: "past_due",
                    paused: "canceled", canceled: "canceled" };
    for (const [paddle, ours] of Object.entries(cases))
      expect(toEntitlement(ev("subscription.updated", { status: paddle })).status).toBe(ours);
  });

  it("해지 → canceled, 만료일은 유료기간 끝까지 유지", () => {
    const r = toEntitlement(ev("subscription.canceled",
      { current_billing_period: { starts_at: ISO, ends_at: END_ISO } }));
    expect(r.status).toBe("canceled");
    expect(r.periodEnd).toBe(END);
  });

  it("결제 실패 → past_due, 만료일은 건드리지 않는다", () => {
    const r = toEntitlement(ev("transaction.payment_failed"));
    expect(r.status).toBe("past_due");
    expect(r.periodEnd).toBe(null);
  });

  it("결제 성공 → active 복구, 만료일은 건드리지 않는다", () => {
    const r = toEntitlement(ev("transaction.completed"));
    expect(r.status).toBe("active");
    expect(r.periodEnd).toBe(null);
  });

  it("관심 없는 이벤트는 null", () => {
    expect(toEntitlement(ev("customer.updated"))).toBe(null);
    expect(toEntitlement(ev("product.created"))).toBe(null);
  });

  it("custom_data에 이메일이 없으면 email=null로 알려 조회를 맡긴다", () => {
    const e = ev("subscription.activated");
    delete e.data.custom_data;
    const r = toEntitlement(e);
    expect(r.email).toBe(null);
    expect(r.customerId).toBe("ctm_1");
  });

  it("망가진 페이로드에 터지지 않는다", () => {
    expect(toEntitlement(null)).toBe(null);
    expect(toEntitlement({})).toBe(null);
    expect(toEntitlement({ event_type: "subscription.activated" })).toBe(null);
  });
});
