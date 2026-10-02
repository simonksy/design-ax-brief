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
