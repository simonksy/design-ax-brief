// Paddle Billing 웹훅 서명 검증.
// 헤더 형식: `Paddle-Signature: ts=<unix>;h1=<hex>`
// 서명 대상: `{ts}:{raw_body}` — 바디는 받은 원문 그대로여야 한다. JSON을 파싱했다
// 다시 문자열로 만들면 공백·키순서가 달라져 서명이 깨진다.
const enc = new TextEncoder();
const TOLERANCE_SEC = 5;

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 길이가 다르면 바로 false. 같으면 전체를 끝까지 훑어 타이밍 차이를 없앤다.
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPaddleSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = {};
  for (const seg of String(header).split(";")) {
    const i = seg.indexOf("=");
    if (i > 0) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  }
  const ts = Number(parts.ts);
  const h1 = parts.h1;
  if (!Number.isFinite(ts) || ts <= 0 || !h1) return false;
  if (Math.abs(nowSec - ts) > TOLERANCE_SEC) return false;
  return constantTimeEqual(await hmacHex(`${ts}:${rawBody}`, secret), h1);
}

// Paddle status → 우리 status. paused는 결제가 멈춘 상태이므로 canceled와 같이 다룬다
// (만료일이 남아 있으면 그때까지는 열려 있다 — getEntitlement 참고).
const STATUS_MAP = {
  active: "active", trialing: "active",
  past_due: "past_due", paused: "canceled", canceled: "canceled",
};

const epoch = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

export function toEntitlement(event) {
  if (!event || typeof event !== "object") return null;
  const { event_id: eventId, event_type: type, occurred_at, data } = event;
  if (!eventId || !type || !data) return null;

  // periodEnd=null은 "만료일을 바꾸지 말 것"이라는 뜻이다. 결제 성공/실패 이벤트는
  // 상태만 바꾸고 기간은 subscription.* 이벤트가 정한다.
  let status, periodEnd = null;
  if (type === "subscription.trialing") {
    status = "active";
    periodEnd = epoch(data.next_billed_at) ?? epoch(data.current_billing_period?.ends_at);
  } else if (type === "subscription.activated") {
    status = "active";
    periodEnd = epoch(data.current_billing_period?.ends_at) ?? epoch(data.next_billed_at);
  } else if (type === "subscription.updated") {
    status = STATUS_MAP[data.status] ?? "canceled";
    periodEnd = epoch(data.current_billing_period?.ends_at) ?? epoch(data.next_billed_at);
  } else if (type === "subscription.canceled") {
    status = "canceled";
    periodEnd = epoch(data.current_billing_period?.ends_at);
  } else if (type === "transaction.completed") {
    status = "active";
  } else if (type === "transaction.payment_failed") {
    status = "past_due";
  } else {
    return null;
  }

  const raw = data.custom_data?.email;
  return {
    eventId,
    occurredAt: epoch(occurred_at) ?? Math.floor(Date.now() / 1000),
    email: typeof raw === "string" && raw ? raw.trim().toLowerCase() : null,
    customerId: data.customer_id ?? null,
    status,
    periodEnd: periodEnd ?? null,
  };
}

// custom_data에 이메일이 없을 때의 폴백. 이게 없으면 "결제했는데 권한이 안 열림"이
// 조용히 발생한다 — 가장 나쁜 실패다.
export async function fetchCustomerEmail(env, customerId) {
  if (!customerId || !env.PADDLE_API_KEY) return null;
  const base = env.PADDLE_ENV === "sandbox"
    ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const res = await fetch(`${base}/customers/${encodeURIComponent(customerId)}`, {
    headers: { authorization: `Bearer ${env.PADDLE_API_KEY}` },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const email = body?.data?.email;
  return typeof email === "string" && email ? email.trim().toLowerCase() : null;
}
