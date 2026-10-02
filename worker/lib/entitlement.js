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
