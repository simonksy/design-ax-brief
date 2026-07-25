# Design AX Brief — 유료 구독(페이월) Phase 1 설계

**작성일:** 2026-07-25
**상태:** 승인 대기 (사용자 리뷰 전)
**범위:** Phase 1만. Phase 2~4는 "전체 로드맵"에 개요만 두고 각자 별도 스펙으로 진행.

---

## 1. 배경과 목표

Design AX Brief는 현재 **순수 정적 사이트**다. `wrangler.jsonc`에 서버 Worker(`main`)가 없고
`assets.directory: "."`로 HTML/JS/JSON을 그대로 서빙한다. React는 CDN에서 로드되어 브라우저에서
`axbrief-data.js`를 렌더링한다. 매일 08:00 KST에 launchd 자동화가 7개 섹션 브리핑을 발행한다.

**하고 싶은 것 (최종형):** 유료 구독자에게 전체 콘텐츠(심층 분석)를 열어주고, 카카오톡으로 요약 카드
알림을 보낸다.

**제약 (확정된 사실):** 운영자는 **개인, 사업자등록 없음**. 이 상태에서는
- 카카오 알림톡·친구톡(타인 발송)은 사업자+비즈니스 채널이 필수 → **불가**.
- 국내 정기결제 PG(토스페이먼츠·카카오페이·PortOne) 가맹도 사업자 필수 → **불가**.

**채택한 방향 — Route C(하이브리드):** 지금은 개인으로 띄우되, **결제 제공자와 알림 채널을
어댑터로 갈아끼울 수 있게** 설계한다. 나중에 사업자를 내면 카카오·국내 PG 어댑터만 추가한다.

**페이월 경계 (확정):** **심층 분석(`full`)만 잠근다.**
- 무료: 카드 앞면 전체 — 제목 `headline` + 한 줄 요약 `body` + 원문 링크 `url` + 미디어.
- 유료: `full` 심층 분석 블록 + (Phase 3의) 요약 카드 알림.

### Phase 1의 목표

정적 사이트를 "게이트가 있는 사이트"로 바꾸는 **가장 어려운 핵심**을 먼저, 결제 없이 끝까지 검증한다.
결제 대행사 연동(Phase 2) 전에, **수동 구독자 명단(allowlist)**만으로 다음이 동작해야 한다:

1. 무료 사용자는 지금과 100% 동일하게 사이트를 본다(회귀 없음).
2. `full` 심층 분석은 공개 URL로 절대 새지 않는다(정적 자산으로 노출 안 됨).
3. 방문자가 이메일로 매직링크 로그인을 하면, allowlist에 있을 때만 `full`을 볼 수 있다.
4. allowlist에 없으면 페이월 CTA를 본다.

**Phase 1은 성공 기준이 "결제를 붙이기 전에 게이팅이 완벽히 샌 곳 없이 동작"이다.**

---

## 2. 아키텍처 개요

현재 정적 배포 **앞에 얇은 Cloudflare Worker를 한 겹** 세운다. Worker는 대부분의 요청을 기존 정적
자산으로 그대로 흘려보내고, `/api/*`와 프리미엄 콘텐츠 경로만 직접 처리한다.

```
브라우저
  │
  ▼
Cloudflare Worker (worker/index.js)   ← 신규
  ├── /api/*            → 인증·엔타이틀먼트·프리미엄 콘텐츠 처리
  ├── /premium/*        → 차단(정적 노출 금지). /api/premium 통해서만
  └── 그 외 전부        → env.ASSETS.fetch() 로 기존 정적 자산 패스스루
                          (index.html, /s/*, _ds, axbrief-data.js …)
  │
  ├── D1 (SUBSCRIBERS)  ← 구독자 명단·엔타이틀먼트
  └── KV (AUTH_TOKENS)  ← 매직링크 1회용 토큰
```

**설계 원칙:** Worker는 얇게 유지한다. 렌더링·콘텐츠 생성은 여전히 파이프라인과 프런트가 담당하고,
Worker는 "이 사람이 유료 콘텐츠를 받을 자격이 있는가"만 판정한다.

---

## 3. 데이터 분할 — "정적은 숨길 수 없다" 문제 해결

핵심 문제: 지금은 `full` 심층 분석이 `axbrief-data.js` 안에 들어 있어 누구나 URL로 통째 받는다.
정적 파일에 숨긴 유료 콘텐츠는 숨긴 게 아니다. 따라서 **빌드 시점에 물리적으로 분리**한다.

`pipeline/build_data.py`를 수정한다(`to_js()` 및 출력 단계):

- **무료 `axbrief-data.js`** (지금 위치, 공개 정적 자산):
  각 카드에서 **`full` 키를 제거**하고, 대신 `"hasFull": true|false` 플래그만 남긴다.
  나머지(headline, body, url, source, tool, accent, motif, image/media)는 그대로.
- **유료 `premium/<date>.json`** (신규):
  그날 모든 카드의 `full` 블록만 `{ "<section>/<id>": { ...full... } }` 형태로 모은다.
  **이 디렉터리는 정적 자산으로 노출하지 않는다** — Worker가 `/premium/*` 경로를 명시적으로 차단하고,
  프리미엄 콘텐츠는 오직 `GET /api/premium/full` 을 통해서만 나간다.
  (구현 방법: `premium/`를 `assets.directory` 밖에 두거나, Worker에서 `/premium/` prefix를 403 처리.
  Phase 1에서는 **Worker 경로 차단 + Worker가 파일을 직접 읽어 서빙**하는 방식을 택한다.
  premium JSON은 Worker 번들에 포함하거나 R2/자산 비공개 경로로 읽는다 — 구현 계획에서 확정.)

**되돌아보기 안전장치:** `s/<section>/<id>.html` 공유(OG) 페이지는 지금도 요약만 담고 `full`
본문 전체를 노출하지 않는다. Phase 1에서 이 페이지들이 `full`을 렌더하지 않는지 확인하고, 만약
노출한다면 요약까지만 남기도록 조정한다.

---

## 4. Worker API 명세 (Phase 1)

세션은 **httpOnly·Secure·SameSite=Lax 쿠키**에 담긴 서명 JWT. 매직링크는 비밀번호가 없다.

| 메서드·경로 | 동작 | 인증 |
|---|---|---|
| `POST /api/auth/request` | body `{email}`. 1회용 토큰 생성(KV, TTL 15분) → 매직링크를 **Resend로 이메일 발송**(아래 주석 참조). 응답은 항상 `{ok:true}`(이메일 존재 여부를 노출하지 않음). | 없음 |
| `GET /api/auth/callback?token=…` | 토큰 검증·소모(1회용) → 세션 쿠키 설정 → `/` 리다이렉트 | 토큰 |
| `POST /api/auth/logout` | 세션 쿠키 무효화 | 세션 |
| `GET /api/me` | `{ loggedIn, email, entitled, plan }` 반환. `entitled`는 D1에서 이메일이 활성 구독자인지로 판정 | 세션(선택) |
| `GET /api/premium/full?date&section&id` | 세션 O + `entitled` O → 해당 `full` JSON. 아니면 **402** + `{reason}` | 세션 |
| `GET /premium/*` | **403** (정적 노출 차단) | — |
| 그 외 | `env.ASSETS.fetch(request)` 패스스루 | — |

**이메일 발송(매직링크):** Phase 1은 결제가 없으므로 구독자 명단은 수동이지만, **로그인 UX 검증을
위해 매직링크 메일은 실제로 보낸다.** 발송은 `Notifier`가 아닌 별도의 얇은 `sendMagicLink()`가
Resend API로 처리한다(요약 알림 Notifier와 책임 분리). Resend 무료 티어(월 3,000통)로 충분.

**엔타이틀먼트 판정 (Phase 1):** D1 `subscribers` 테이블에 **수동으로** 넣은 이메일이 있고
`status='active'`이며 `current_period_end`가 미래(또는 NULL=무기한 테스트)면 `entitled=true`.
Phase 2에서 이 테이블을 결제 웹훅이 자동 갱신한다 — **판정 로직은 그대로 재사용**된다.

---

## 5. 데이터 저장소 (전부 Cloudflare 무료 티어)

**D1 `subscribers`**
```sql
CREATE TABLE subscribers (
  email               TEXT PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'active',   -- active | canceled | past_due
  current_period_end  INTEGER,                          -- epoch s, NULL=무기한(테스트)
  provider            TEXT,                             -- 'manual'(P1) | 'lemonsqueezy'(P2)…
  provider_customer_id TEXT,
  kakao_id            TEXT,                             -- P4용 예약 컬럼, P1은 NULL
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
```

**KV `AUTH_TOKENS`**: key=1회용 토큰, value=email, TTL 900초.

**Secrets** (`wrangler secret`): `RESEND_API_KEY`, `SESSION_SIGNING_KEY`.
(결제 웹훅 시크릿은 Phase 2에서 추가.)

---

## 6. 갈아끼우는 어댑터 (Route C의 핵심 — Phase 1에서 인터페이스만 확정)

Phase 1은 구현체를 최소로 두되, **인터페이스 경계를 지금 못박아** 이후 Phase가 구현체만 추가하게 한다.

- **`PaymentProvider`** — Phase 1 구현체: `ManualAllowlistProvider`(D1 수동 관리, 웹훅 없음).
  Phase 2: `LemonSqueezyProvider`(또는 Gumroad류) 추가. Phase 4: `TossPaymentsProvider` 추가.
  인터페이스: `verifyWebhook(req) → event`, `toEntitlement(event) → {email,status,periodEnd}`.
- **`Notifier`** — Phase 1: 미구현(스텁만). Phase 3: `EmailNotifier`. Phase 4: `KakaoNotifier`.
  인터페이스: `send(subscribers[], dailyDigest) → results`.

**어느 결제 대행사를 쓸지는 Phase 2 스펙에서 확정한다**(Lemon Squeezy vs Gumroad vs Ko-fi vs
Patreon). Phase 1은 여기에 의존하지 않는다.

---

## 7. 프런트엔드 변경 (Phase 1)

`axbrief-app.jsx`(및 large 변형)에서:

1. **엔타이틀먼트 상태**: 앱 로드시 `GET /api/me` 1회 → `{loggedIn, entitled}`를 컨텍스트에 보관.
2. **카드 상세**: `card.hasFull === true`인데 `full`이 payload에 없으면,
   - `entitled` → `GET /api/premium/full?…`로 지연 로드해 렌더.
   - 미구독/비로그인 → **페이월 카드**: "유료 구독 시 심층 분석 열람" + 로그인/구독 CTA.
3. **로그인 모달**: 이메일 입력 → `POST /api/auth/request` → "메일함을 확인하세요" 안내.
   매직링크 클릭 → 콜백 → 세션 → 앱이 `entitled` 재조회.
4. **회귀 없음**: 비로그인 사용자의 무료 경험은 시각적으로 지금과 동일(페이월은 `full` 진입 시에만).

디자인 톤: 기존 Geist/Pretendard 미니멀 유지. 페이월 카드는 커피 버튼과 충돌하지 않게 배치.

---

## 8. 배포 (deploy truth 준수)

기존 배포 진실을 반드시 지킨다: **main 푸시만으로는 배포 안 됨**. `pipeline/deploy.sh`가 main을
`cloudflare/workers-autoconfig`로 머지·푸시해야 Cloudflare 빌드가 트리거된다. `wrangler.jsonc`는
main에 유지한다.

Phase 1에서 `wrangler.jsonc`에 추가:
- `"main": "worker/index.js"`
- `d1_databases`(SUBSCRIBERS), `kv_namespaces`(AUTH_TOKENS) 바인딩
- `assets`에 `binding: "ASSETS"` 지정(Worker에서 `env.ASSETS.fetch` 쓰기 위함) 및
  Worker-first 라우팅 설정.

**주의:** `assets.directory`는 `.`이므로 `premium/`을 자산 밖으로 빼는 방법을 구현 계획에서 확정한다
(가장 단순: premium JSON을 Worker 번들에 import, 또는 별도 비공개 경로). 매일 파이프라인이
`premium/<date>.json`을 새로 만들면 재배포로 Worker가 최신본을 참조하도록 한다.

---

## 9. 파이프라인 영향 (Phase 1 최소)

- `build_data.py`: `full` 분리 로직 추가(§3). 기존 `axbrief-data.js` 출력 형식은 `full` 제거 +
  `hasFull` 추가 외에는 불변 → 프런트 회귀 최소.
- 08:00 자동화 흐름 자체는 Phase 1에서 바꾸지 않는다(알림 브로드캐스트는 Phase 3).
- 로컬 프리뷰 서버(8765/4321)는 그대로. Worker 로컬 확인은 `wrangler dev` 별도.

---

## 10. 엣지 케이스·에러 처리

- 매직링크 토큰 만료/재사용 → 명확한 "링크가 만료됨, 다시 요청하세요" 화면.
- `entitled=false`인데 `/api/premium/full` 직접 호출 → 402, 본문에 `full` 절대 미포함.
- premium JSON 누락(그날 빌드 실패) → 프런트는 페이월 대신 "잠시 후 다시" 폴백.
- 세션 위조 시도 → 서명 검증 실패 시 비로그인 취급.
- 무료 회귀 감시: `full`이 `axbrief-data.js`에 남아 있지 않은지 빌드 후 자동 assert.

---

## 11. 테스트 전략

- **빌드 단위**: `build_data.py` 분리 후 공개 JS에 어떤 카드에도 `full` 키가 없음 / premium JSON에
  모든 `hasFull` 카드의 `full`이 있음 (assert).
- **Worker 통합**(`wrangler dev` + 스크립트):
  - 비로그인 `/api/premium/full` → 402, `full` 미포함.
  - allowlist 이메일로 매직링크 → 콜백 → `/api/me` `entitled:true` → `/api/premium/full` 200.
  - allowlist에 없는 이메일 → 로그인은 되나 `entitled:false` → 402.
  - `/premium/2026-07-25.json` 직접 GET → 403.
- **회귀**: 배포본에서 무료 카드 앞면·`/s/*` 공유 페이지가 지금과 동일 렌더.

---

## 12. 전체 로드맵 (Phase 2~4 개요 — 각자 별도 스펙)

- **Phase 2 — 결제**: 판매대행(Lemon Squeezy/Gumroad류) 선정·연동. `POST /api/webhook/payment` →
  `PaymentProvider.verifyWebhook` → D1 upsert. 구독/해지/연체 반영. 체크아웃 링크·구독 관리 UI.
- **Phase 3 — 알림**: `EmailNotifier`(Resend)로 그날 요약 카드 이메일. 08:00 파이프라인 발행·배포
  직후 활성 구독자 브로드캐스트 훅. 수신거부 링크.
- **Phase 4 — 사업자 전환**: 개인사업자 등록 후 `KakaoNotifier`(알림톡·SOLAPI) +
  국내 PG 어댑터(`TossPaymentsProvider`) 추가. 인터페이스는 이미 있으므로 구현체만 꽂음.

---

## 13. 열린 결정 (Phase 1 진행에는 불필요, 이후 단계에서 확정)

- 결제 대행사 선택(Phase 2).
- 첫 알림 채널: 이메일 vs 웹푸시(Phase 3 — 현재 추천: 이메일 먼저).
- 가격·티어 구성(Phase 2, 아키텍처 무관).
- premium JSON 서빙 방식의 구체안(Worker 번들 import vs 비공개 경로 vs R2) — Phase 1 구현 계획에서 확정.
