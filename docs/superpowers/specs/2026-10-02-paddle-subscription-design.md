# Paddle 자체 구독 결제 설계

**작성일:** 2026-10-02
**상태:** 승인 대기
**대체 대상:** Patreon 연동 (`worker/lib/patreon.js`, `/api/auth/patreon*`) — 전면 제거

## 1. 목적

사이트에서 직접 유료 구독 결제를 받는다. 결제 대행은 Paddle(Merchant of Record)이 맡고,
사용자는 패트레온 계정 없이 카드만으로 구독한다. 전 세계 사용자를 대상으로 하되
각국 세금 신고는 Paddle이 대행한다.

**지금 패트레온 후원자는 0명이므로 하위 호환은 고려하지 않는다.**

## 2. 요금제

| 플랜 | 가격 | 체험 | 첫 결제 |
|---|---|---|---|
| 월간 | $5.99 / 월 | 1개월 무료 | 2개월차부터 매달 $5.99 |
| 연간 | $59.99 / 년 | 1개월 무료 | 2개월차에 $59.99, 이후 12개월 이용 |

- 연간은 무료 1개월 + 유료 12개월 = **총 13개월**. 정가 $71.88 대비 17% 할인.
- 체험 시작 시 카드 등록은 필수다 (Paddle `trial_period` 기본 동작).
- 가격·플랜 식별자는 코드에 상수로 두지 않고 **Worker 환경변수**로 둔다
  (`PADDLE_PRICE_MONTHLY`, `PADDLE_PRICE_YEARLY`). 가격 변경이 배포 없이 가능해야 한다.

**리스크:** Paddle 공개 안내는 $10 미만 상품을 "별도 문의" 대상으로 둔다. 월 $5.99는
건당 수수료 비중이 약 13%($0.80)다. 연간은 약 5.8%. 가입 심사에서 월간 플랜이
거절되거나 수수료가 조정될 수 있으므로, **Paddle 계정 승인 후 실제 조건을 확인하고
필요하면 가격을 재검토한다.** 설계는 가격을 환경변수로 두어 이 변경을 흡수한다.

## 3. 아키텍처

### 3.1 그대로 두는 것 (수정 없음)

| 구성요소 | 파일 | 역할 |
|---|---|---|
| 세션 서명/검증 | `worker/lib/crypto.js` | HMAC-SHA256 쿠키, 30일 |
| 쿠키 | `worker/lib/cookies.js` | `ax_session` |
| 매직링크 로그인 | `worker/lib/tokens.js`, `email.js` | 이메일 소유 증명 |
| 권한 판정 | `worker/lib/entitlement.js` | `status='active'` AND 만료 전 |
| 잠금 UI | `axbrief-app.jsx` LockedCard / FlipCard / ProBadge | `entitled` 불리언만 소비 |
| 무료/유료 분리 | `pipeline/build_data.py` `split_teaser` | 섹션별 첫 카드 무료 |
| 프리미엄 본문 | `/api/premium/full` | 권한 확인 후 서빙 |

권한 판정이 `provider`를 보지 않으므로 결제사 교체에 영향받지 않는다.

### 3.2 제거

- `worker/lib/patreon.js` (파일 삭제)
- `worker/index.js`의 `/api/auth/patreon`, `/api/auth/patreon/callback` 라우트
- `wrangler.jsonc`의 `PATREON_CLIENT_ID`, Worker 시크릿 `PATREON_CLIENT_SECRET`
- `axbrief-app.jsx`의 `SUBSCRIBE_URL` 상수와 패트레온 링크
- `i18n/*.json`의 패트레온 언급 문구 (`paywall.login`, `paywall.subscribe`, `paywall.new_tab`)

### 3.3 신규

#### (a) 결제 시작 — `POST /api/billing/checkout`

입력: `{plan: "monthly"|"yearly"}`. 세션 쿠키가 있으면 그 이메일을 Paddle에 전달해
결제창에 미리 채운다. 없으면 Paddle이 이메일을 받는다.

응답: `{priceId, customerEmail?}`. 실제 결제창은 **브라우저에서 Paddle.js로 연다**
(`Paddle.Checkout.open()`), 오버레이 방식. 사이트를 떠나지 않고 Paddle 결제 화면이
위에 겹쳐 뜬다. 카드·PayPal·Apple Pay·Google Pay를 Paddle이 알아서 띄운다.

Worker가 이 엔드포인트를 두는 이유: price id를 클라이언트 번들에 하드코딩하지 않고
환경변수에서 내려주기 위함이다.

#### (b) 결제 상태 수신 — `POST /api/billing/webhook`

Paddle이 보내는 알림을 받아 `subscribers` 테이블을 갱신한다.

**서명 검증 (필수):** 헤더 `Paddle-Signature`가 `ts=<unix>;h1=<hex>` 형식이다.
`HMAC-SHA256("{ts}:{raw_body}", PADDLE_WEBHOOK_SECRET)`를 계산해 `h1`과
**상수 시간 비교**한다. 원문 바디를 그대로 써야 하므로 JSON 파싱 전에 검증한다.
타임스탬프가 현재 시각에서 5초를 넘게 벗어나면 거부한다(재전송 공격 방지).
검증 실패는 401, 본문 없음.

**처리하는 이벤트:**

| 이벤트 | 처리 |
|---|---|
| `subscription.trialing` | `status='active'`, `current_period_end` = 체험 종료 시각 |
| `subscription.activated` | `status='active'`, `current_period_end` = 다음 청구일 |
| `subscription.updated` | 상태·기간을 페이로드대로 반영 (갱신/변경/일시정지) |
| `subscription.canceled` | `status='canceled'`. **기간 말까지는 유지** — `current_period_end`는 그대로 두고 판정식이 만료를 처리 |
| `transaction.completed` | `current_period_end` 연장 |
| `transaction.payment_failed` | `status='past_due'`. 즉시 차단하지 않고 Paddle의 재시도를 기다린다 |

그 외 이벤트는 200으로 무시한다(Paddle이 재전송하지 않도록).

**멱등성:** Paddle은 같은 이벤트를 재전송할 수 있다. `processed_events` 테이블에
`event_id`를 PK로 기록하고, 이미 있으면 바로 200을 반환한다.

**순서 역전:** 웹훅은 순서가 보장되지 않는다. 각 이벤트의 `occurred_at`을 저장하고,
**저장된 값보다 오래된 이벤트는 무시**한다. 그러지 않으면 늦게 도착한 취소 알림이
그 뒤의 갱신을 덮어쓴다.

**이메일 기준:** `subscribers.email`이 PK다. Paddle 고객 이메일을 소문자로 정규화해
키로 쓴다. `provider='paddle'`, `provider_customer_id`에 Paddle 구독 id를 저장한다.

#### (c) 구독 관리 — `GET /api/billing/portal`

로그인 상태에서 Paddle 고객 포털 URL을 발급해 돌려준다. 카드 변경·해지·영수증을
사용자가 직접 처리한다. 자체 화면을 만들지 않는다.

#### (d) 결제 후 화면

결제창이 성공으로 닫히면 프런트가 `/api/me`를 다시 호출한다. 웹훅이 아직 안 왔을 수
있으므로 **2초 간격으로 최대 5회 재조회**한다. 그때까지도 권한이 안 열리면
"결제가 확인되는 중입니다. 잠시 후 새로고침해 주세요"를 띄운다.
결제 성공 판정을 프런트 응답만으로 하지 않는다 — 권한은 웹훅으로만 열린다.

## 4. 데이터 변경

```sql
-- 기존 subscribers 테이블은 그대로 사용. provider 값만 'paddle'이 추가된다.
-- kakao_id 컬럼은 미사용 상태로 둔다(이번 작업 범위 밖).

CREATE TABLE IF NOT EXISTS processed_events (
  event_id    TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

-- 이벤트 순서 역전 방지용. subscribers에 추가.
ALTER TABLE subscribers ADD COLUMN last_event_at INTEGER;
```

`status` 허용값: `active` | `past_due` | `canceled`.

## 5. 설정

**환경변수** (`wrangler.jsonc` vars — 공개돼도 되는 값):
- `PADDLE_ENV`: `sandbox` | `production`
- `PADDLE_CLIENT_TOKEN`: Paddle.js 초기화용 공개 토큰
- `PADDLE_PRICE_MONTHLY`, `PADDLE_PRICE_YEARLY`: price id

**시크릿** (`wrangler secret put` — 절대 커밋하지 않음):
- `PADDLE_API_KEY`: 고객 포털 URL 발급 등 서버 호출용
- `PADDLE_WEBHOOK_SECRET`: 웹훅 서명 검증용

## 6. 테스트

기존 `worker/test/*.test.js`(vitest, 40개)에 더한다.

- **서명 검증:** 올바른 서명 통과 / 변조된 바디 거부 / 오래된 타임스탬프 거부 /
  서명 헤더 없음 거부
- **멱등성:** 같은 `event_id` 두 번 → 두 번째는 DB를 건드리지 않음
- **순서 역전:** 최신 이벤트 뒤에 오래된 이벤트 → 무시됨
- **생애주기:** trialing → active → past_due → canceled 각 단계 후 `getEntitlement` 결과
- **해지 후 잔여기간:** `status='canceled'`이고 `current_period_end`가 미래면 `entitled=true`
- **권한 게이트:** 비로그인 402 / 로그인했으나 미구독 402 / 구독자 200
- **체크아웃:** 플랜별 올바른 price id 반환, 잘못된 plan 값 400

Paddle 샌드박스로 실제 결제 1건을 흘려 웹훅 수신까지 확인한 뒤 프로덕션에 올린다.

## 7. 작업 순서

1. 패트레온 제거 (코드·설정·문구) + 테스트 통과 확인
2. DB 스키마 추가 (`processed_events`, `last_event_at`)
3. 웹훅 서명 검증 모듈 + 테스트
4. 웹훅 핸들러 (이벤트별 처리, 멱등성, 순서 역전) + 테스트
5. 체크아웃 엔드포인트 + 테스트
6. 프런트: Paddle.js 로드, SubscribeModal 개편(플랜 2종), 결제 후 재조회
7. 고객 포털 링크
8. i18n 문구 5개 언어 (기존 번역 파이프라인 사용)
9. 샌드박스 end-to-end 검증
10. 프로덕션 전환

## 8. 미결 사항

- **Paddle 계정 승인** — 가입 후 월 $5.99 플랜이 허용되는지, 수수료 조건이 공개가와
  같은지 확인 필요. 결과에 따라 가격 재검토.
- **정산 최소 $100** — 월간 구독자 약 20명이 모여야 첫 정산. 초기에는 잔액으로 쌓인다.
- **환불 정책** — Paddle 기본 정책을 따를지 자체 기준을 둘지 미정. 사이트에 명시해야 한다.
- **이용약관·개인정보처리방침** — 유료 결제를 받으려면 필요하다. 이번 범위 밖이지만
  프로덕션 전환 전에 준비해야 한다.
