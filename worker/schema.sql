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
CREATE TABLE IF NOT EXISTS processed_events (
  event_id    TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
