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

/* ---- 기기 간 로그인 (pending) ----------------------------------------------
   메일 링크를 연 기기에만 세션이 생기면, 폰으로 메일을 확인한 사람은 정작
   로그인하려던 PC 화면에서 아무 일도 일어나지 않는다. 그래서 요청한 브라우저가
   받아 갈 자리를 서버에 하나 만들어 두고, 링크가 열리면 그 자리에 승인을 남긴다.

   확인 코드가 필요한 이유: 이 구조는 원래 없던 공격을 하나 만든다. 공격자가 자기
   PC에서 피해자의 주소로 요청해 두고 "링크 눌러보세요"라고 유도하면, 피해자의
   클릭이 공격자 브라우저를 로그인시킨다. 코드를 양쪽(요청 화면 / 메일)에 띄우고
   사람이 맞춰 보게 하면 공격자는 자기 화면의 코드를 피해자에게 알릴 길이 없다. */
const PEND_TTL = 900;   // 매직 토큰과 같은 15분

/* 자리는 KV가 아니라 D1에 둔다. KV는 최종 일관성이라 쓰기가 읽기에 반영되기까지
   몇 초가 걸리고, 그 몇 초가 "로그인 버튼을 눌렀는데 원래 창이 그대로"로 나타난다.
   D1은 즉시 읽히므로 폴링이 바로 잡아낸다. */
export function newPendingId() {
  return crypto.randomUUID().replace(/-/g, "");
}

// 1000~9999. 앞자리가 0이면 사람이 읽고 옮길 때 흔히 빠뜨린다.
export function newPendingCode() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(1000 + (b[0] % 9000));
}

const nowSec = () => Math.floor(Date.now() / 1000);

export async function putPending(db, pid, email, code) {
  await db.prepare(
    "INSERT OR REPLACE INTO pending_logins (id,email,code,session,created_at) VALUES (?,?,?,NULL,?)"
  ).bind(pid, email, code, nowSec()).run();
  // 만료된 자리는 들를 때마다 조금씩 치운다 — 따로 도는 청소 작업을 두지 않는다.
  await db.prepare("DELETE FROM pending_logins WHERE created_at < ?")
          .bind(nowSec() - PEND_TTL).run();
}

export async function readPending(db, pid) {
  if (!pid) return null;
  const row = await db.prepare(
    "SELECT email, code, session FROM pending_logins WHERE id = ? AND created_at >= ?"
  ).bind(pid, nowSec() - PEND_TTL).first();
  return row || null;
}

// 승인 = 요청했던 브라우저가 가져갈 세션을 자리에 놓아 두는 것.
export async function approvePending(db, pid, session) {
  const r = await db.prepare(
    "UPDATE pending_logins SET session = ? WHERE id = ? AND created_at >= ?"
  ).bind(session, pid, nowSec() - PEND_TTL).run();
  return !!(r.meta && r.meta.changes);
}

// 한 번만 가져갈 수 있다 — 세션을 넘긴 자리는 즉시 지운다.
export async function claimPending(db, pid) {
  const rec = await readPending(db, pid);
  if (!rec || !rec.session) return null;
  await db.prepare("DELETE FROM pending_logins WHERE id = ?").bind(pid).run();
  return rec.session;
}
