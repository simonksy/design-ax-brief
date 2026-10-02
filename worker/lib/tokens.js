// /api/auth/request는 인증 없이 누구나 부를 수 있는 메일 발송기다. 제한이 없으면
// (1) 메일 쿼터가 말라 로그인 자체가 막히고 — 로그인은 이제 결제의 선행 관문이므로
// 매출이 0이 된다 — (2) 제3자에게 메일을 퍼붓는 중계기가 된다.
// KV에는 원자적 증가가 없어 동시 요청 몇 개는 새어 나간다. 정밀한 게이트가 아니라
// 피해 범위를 묶는 제동 장치이므로 그 정도는 받아들인다.
const WINDOW_SEC = 3600;

export async function rateLimited(kv, bucket, id, limit, nowSec = Math.floor(Date.now() / 1000)) {
  if (!id) return false;
  const key = `rl:${bucket}:${id}:${Math.floor(nowSec / WINDOW_SEC)}`;
  const n = Number(await kv.get(key)) || 0;
  if (n >= limit) return true;
  await kv.put(key, String(n + 1), { expirationTtl: WINDOW_SEC * 2 });
  return false;
}

export async function issueMagicToken(kv, email) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await kv.put("ml:" + token, email, { expirationTtl: 900 });
  return token;
}
export async function consumeMagicToken(kv, token) {
  if (!token) return null;
  const email = await kv.get("ml:" + token);
  if (email) await kv.delete("ml:" + token);
  return email;
}
