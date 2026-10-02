// Paddle 이벤트를 subscribers 테이블에 반영한다.
// 웹훅은 (1) 같은 이벤트가 재전송될 수 있고 (2) 순서가 보장되지 않는다.
// 둘 다 막지 않으면 늦게 온 취소가 최신 갱신을 덮어써 권한이 잘못 닫힌다.
export async function applyEntitlement(db, delta) {
  const { eventId, occurredAt, email, customerId, status, periodEnd } = delta;
  if (!email) throw new Error("applyEntitlement: email required");
  const now = Math.floor(Date.now() / 1000);

  // (1) 멱등성 — 이미 처리한 event_id면 아무것도 하지 않는다.
  const seen = await db.prepare("SELECT event_id FROM processed_events WHERE event_id = ?")
    .bind(eventId).first();
  if (seen) return "duplicate";

  const existing = await db.prepare(
    "SELECT created_at, provider, status, current_period_end, last_event_at FROM subscribers WHERE email = ?"
  ).bind(email).first();

  // 수동 부여(무기한 comp)는 운영자가 직접 준 권한이다. Paddle 구독 상태가
  // 어떻든 내리지 않는다.
  const manualForever = existing && existing.provider === "manual" &&
    existing.status === "active" && existing.current_period_end == null;

  // (2) 순서 — 저장된 것보다 오래된 이벤트는 버린다. 같은 시각은 처리한다
  // (한 동작이 여러 이벤트를 같은 타임스탬프로 뿜을 수 있다).
  const stale = existing && existing.last_event_at != null && occurredAt < existing.last_event_at;

  if (manualForever || stale) {
    await db.prepare(
      "INSERT OR IGNORE INTO processed_events (event_id, occurred_at, received_at) VALUES (?,?,?)"
    ).bind(eventId, occurredAt, now).run();
    return "stale";
  }

  const createdAt = existing ? existing.created_at : now;
  // periodEnd가 null이면 기존 만료일을 유지한다 — 결제 성공/실패는 상태만 바꾼다.
  const end = periodEnd ?? (existing ? existing.current_period_end : null);

  await db.batch([
    db.prepare(
      `INSERT OR REPLACE INTO subscribers
       (email,status,current_period_end,provider,provider_customer_id,created_at,updated_at,last_event_at)
       VALUES (?,?,?,'paddle',?,?,?,?)`
    ).bind(email, status, end, customerId ?? null, createdAt, now, occurredAt),
    db.prepare(
      "INSERT OR IGNORE INTO processed_events (event_id, occurred_at, received_at) VALUES (?,?,?)"
    ).bind(eventId, occurredAt, now),
  ]);
  return "applied";
}
