export async function getEntitlement(db, email) {
  const row = await db.prepare(
    "SELECT status, current_period_end FROM subscribers WHERE email = ?"
  ).bind(email).first();
  if (!row) return { entitled: false, status: null, periodEnd: null };
  const now = Math.floor(Date.now() / 1000);
  const end = row.current_period_end ?? null;
  // 만료일이 있으면 그 날짜가 유일한 기준이다 — 해지(canceled)는 "갱신 안 함"이지
  // "지금 끊음"이 아니고, 결제 실패(past_due)는 Paddle이 며칠 재시도하는 동안
  // 열어둬야 억울한 차단이 없다. 만료일이 NULL인 무기한 권한은 수동 부여(comp)
  // 뿐이므로 active만 인정한다.
  const entitled = end == null ? row.status === "active" : end > now;
  return { entitled, status: row.status, periodEnd: end };
}

// 권한(entitled)과는 다른 질문: "Paddle 구독 행이 있는가" — 기간은 보지 않는다.
// 갱신이 실패해 기간이 끝난 구독자도 카드를 고치러 포털에 갈 수 있어야 하고,
// 그 상태에서 두 번째 구독을 열어 첫 구독을 고아로 만들어서도 안 된다.
// canceled는 제외한다 — 그 사람은 정말로 다시 구독할 수 있어야 한다.
export async function hasPaddleSubscription(db, email) {
  const row = await db.prepare(
    "SELECT 1 AS found FROM subscribers WHERE email = ? AND provider = 'paddle' AND status <> 'canceled'"
  ).bind(email).first();
  return !!row;
}
