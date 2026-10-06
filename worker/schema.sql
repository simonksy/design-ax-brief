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
/* 주간 리포트 수신 설정. 행이 없으면 "아직 아무것도 고르지 않은 사람"이고,
   기본값(전체 섹션 / 사이트 언어 / 수신함)으로 취급한다 — 로그인만 하고 설정에
   들어온 적 없는 사람에게도 리포트가 가야 하기 때문이다. */
CREATE TABLE IF NOT EXISTS mail_prefs (
  email      TEXT PRIMARY KEY,
  lang       TEXT NOT NULL DEFAULT 'ko',
  sections   TEXT NOT NULL DEFAULT '*',
  weekly     INTEGER NOT NULL DEFAULT 1,
  unsub_all  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
/* 같은 메일을 두 번 보내지 않기 위한 발송 기록. Cron 재실행·재시도에 안전해야 한다. */
CREATE TABLE IF NOT EXISTS mail_sent (
  id      TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL
);
