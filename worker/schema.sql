CREATE TABLE IF NOT EXISTS subscribers (
  email                TEXT PRIMARY KEY,
  status               TEXT NOT NULL DEFAULT 'active',
  current_period_end   INTEGER,
  provider             TEXT,
  provider_customer_id TEXT,
  kakao_id             TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

/* First-party funnel analytics. No cookies, no third party, no PII: `visitor` is a
   SHA-256 of (UTC day + IP + user-agent + signing key) truncated to 16 hex chars, so
   it identifies a device only WITHIN one UTC day and cannot be joined across days or
   back to a person. Events are written from /api/e via ctx.waitUntil (never blocking
   the response) and read back by /api/stats.
   NOTE: block comments, not `--` — statements here get flattened to a single line
   (see the beforeAll in worker/test/*.test.js) and a `--` would eat the SQL. */
CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  day      TEXT    NOT NULL,
  name     TEXT    NOT NULL,
  section  TEXT,
  card_id  TEXT,
  variant  TEXT,
  ref      TEXT,
  country  TEXT,
  visitor  TEXT    NOT NULL,
  entitled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_day_name    ON events(day, name);
CREATE INDEX IF NOT EXISTS idx_events_day_section ON events(day, section);
CREATE INDEX IF NOT EXISTS idx_events_visitor_day ON events(visitor, day);
