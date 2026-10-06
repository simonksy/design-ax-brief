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
/* 기기 간 로그인의 승인 자리. KV에 두었더니 쓰기가 읽기에 반영되기까지 몇 초가
   걸려(최종 일관성) "로그인" 버튼을 눌러도 원래 창이 한참 그대로였다. D1은 즉시
   읽히므로 폴링이 바로 잡아낸다. */
CREATE TABLE IF NOT EXISTS pending_logins (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  session    TEXT,
  created_at INTEGER NOT NULL
);
