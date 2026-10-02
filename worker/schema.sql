CREATE TABLE IF NOT EXISTS subscribers (
  email                TEXT PRIMARY KEY,
  status               TEXT NOT NULL DEFAULT 'active',
  current_period_end   INTEGER,
  provider             TEXT,
  provider_customer_id TEXT,
  kakao_id             TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  last_event_at        INTEGER
);
/* 웹훅 멱등성: Paddle이 같은 이벤트를 재전송해도 한 번만 반영한다. */
CREATE TABLE IF NOT EXISTS processed_events (
  event_id    TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
