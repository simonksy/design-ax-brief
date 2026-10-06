/* 수신 거부 토큰.

   세션과 달리 만료를 두지 않는다 — 메일은 몇 달 뒤에 열릴 수 있고, 그때
   "링크가 만료됐습니다"를 보여 주면 사람은 스팸 신고 버튼을 누른다. 토큰이
   오래 사는 대신 할 수 있는 일을 하나로 좁혔다: 토큰에 적힌 그 주소의 수신을
   끊는 것. 세션을 주지도, 다른 주소를 건드리지도 못한다. */
const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDec(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}
async function hmac(msg, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg))));
}

export async function signUnsub(email, secret) {
  // k:"unsub"은 용도 표시다. 이 서명 키는 세션에도 쓰이므로, 용도를 적어 두지
  // 않으면 한쪽 토큰을 다른 쪽에 들이밀 여지가 생긴다.
  const payload = b64url(enc.encode(JSON.stringify({ email, k: "unsub" })));
  return payload + "." + (await hmac(payload, secret));
}

export async function verifyUnsub(token, secret) {
  if (!token || token.indexOf(".") < 0) return null;
  const [payload, sig] = token.split(".");
  if ((await hmac(payload, secret)) !== sig) return null;
  try {
    const o = JSON.parse(b64urlDec(payload));
    return o && o.k === "unsub" && o.email ? o.email : null;
  } catch {
    return null;
  }
}
