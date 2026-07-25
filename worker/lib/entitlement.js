export async function getEntitlement(db, email) {
  const row = await db.prepare(
    "SELECT status, current_period_end FROM subscribers WHERE email = ?"
  ).bind(email).first();
  if (!row) return { entitled: false, status: null, periodEnd: null };
  const now = Math.floor(Date.now() / 1000);
  const active = row.status === "active" &&
    (row.current_period_end == null || row.current_period_end > now);
  return { entitled: active, status: row.status, periodEnd: row.current_period_end ?? null };
}
