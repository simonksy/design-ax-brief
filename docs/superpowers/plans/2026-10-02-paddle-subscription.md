# Paddle 구독 결제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 패트레온을 걷어내고, Paddle 오버레이 결제로 사이트에서 직접 유료 구독을 받는다.

**Architecture:** 세션·권한판정·잠금UI는 그대로 두고, 결제사 연동 레이어만 교체한다.
순수 함수(서명 검증, 이벤트→권한 변환)를 `worker/lib/paddle.js`에, DB 반영(멱등성·순서)을
`worker/lib/billing.js`에 분리해 Worker 라우트는 얇게 유지한다. 권한은 **웹훅으로만** 열린다.

**Tech Stack:** Cloudflare Workers, D1(SQLite), KV, vitest + @cloudflare/vitest-pool-workers,
Paddle Billing(현행 API, Classic 아님), Paddle.js 오버레이 체크아웃, React(UMD, JSX 런타임 변환)

**Spec:** `docs/superpowers/specs/2026-10-02-paddle-subscription-design.md`

## Global Constraints

- Paddle **Billing** API만 쓴다. Paddle Classic은 쓰지 않는다.
- 웹훅 서명: 헤더 `Paddle-Signature`, 형식 `ts=<unix>;h1=<hex>`,
  `HMAC-SHA256("{ts}:{raw_body}", PADDLE_WEBHOOK_SECRET)`, **hex 소문자**, 상수 시간 비교,
  타임스탬프 허용 오차 **5초**.
- 서명 검증은 **원문 바디**로 한다. `request.text()`로 먼저 읽고, 검증 통과 후에만 `JSON.parse`.
- 권한은 웹훅으로만 연다. 브라우저가 보고하는 결제 성공으로 권한을 열지 않는다.
- 가격·price id·토큰은 **코드에 하드코딩하지 않는다.** 전부 `env`에서 읽는다.
- 시크릿(`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`)은 **절대 커밋하지 않는다.**
  `wrangler.jsonc`의 `vars`에 넣지 말고 `wrangler secret put`으로 넣는다.
- `status` 허용값: `active` | `past_due` | `canceled`.
- 이메일은 **소문자로 정규화**해서 저장·조회한다 (`subscribers.email`이 PK).
- 모든 사용자 노출 문구는 `i18n/ko.json`에 키를 추가하고 5개 언어로 번역한다.
  JSX에서는 `tx('키')`로 쓴다.
- 커밋 메시지 말미에 다음 두 줄을 붙인다:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy`

## Review Focus

1. **결제했는데 권한이 안 열림** — 웹훅 페이로드에 이메일이 없으면(`custom_data` 누락)
   그 결제가 영원히 반영되지 않는다. Paddle API로 고객 이메일을 조회하는 폴백이 있어야 한다. (Task 4)
2. **결제한 이메일과 로그인 이메일이 다름** — Paddle에서 gmail로 결제하고 사이트에는 naver로
   로그인하면 아무것도 안 열린다. 결제 전에 로그인을 요구해 동일 이메일을 보장해야 한다. (Task 6)
3. **해지했는데 즉시 끊김** — 남은 유료 기간은 보장되어야 한다. (Task 2)
4. **웹훅 재전송/순서 역전** — 같은 이벤트 두 번, 또는 늦게 도착한 옛 이벤트가 최신 상태를
   덮어쓰면 권한이 잘못 닫힌다. (Task 5)
5. **서명 검증 우회** — 서명 없이/위조된 바디로 `/api/billing/webhook`을 때리면 누구나
   자기 이메일에 권한을 줄 수 있다. (Task 3)

---

### Task 1: 패트레온 제거

**Files:**
- Delete: `worker/lib/patreon.js`
- Delete: `worker/test/patreon.test.js`
- Modify: `worker/index.js` (patreon import, `/api/auth/patreon` 2개 라우트)
- Modify: `wrangler.jsonc` (`PATREON_CLIENT_ID` 삭제)
- Modify: `vitest.config.js` (`PATREON_*` 바인딩 삭제)
- Modify: `axbrief-app.jsx` (`SUBSCRIBE_URL`, SubscribeModal의 패트레온 링크)
- Modify: `i18n/ko.json`, `i18n/{en,ja,zh,es}.json` (패트레온 언급 문구)

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (제거만)

- [ ] **Step 1: 패트레온 참조 전부 찾기**

Run: `cd /Users/leopard/Projects/design-ax-brief/.claude/worktrees/i18n && grep -rin "patreon" --include="*.js" --include="*.jsx" --include="*.json" --include="*.jsonc" --include="*.html" . | grep -v node_modules | grep -v "^./docs/"`

삭제 대상을 눈으로 확인한다. `docs/`의 과거 설계 문서는 기록이므로 건드리지 않는다.

- [ ] **Step 2: 파일 삭제**

```bash
git rm worker/lib/patreon.js worker/test/patreon.test.js
```

- [ ] **Step 3: `worker/index.js`에서 라우트와 import 제거**

`import { patreonAuthorizeUrl, exchangeCode, fetchIdentity, membershipStatus } from "./lib/patreon.js";` 줄을 지운다.

`if (p === "/api/auth/patreon") { ... }` 블록과 `if (p === "/api/auth/patreon/callback") { ... }` 블록을
통째로 지운다 (두 번째 블록은 `return new Response(null, { status: 302, headers: { location, "set-cookie": sessionSetCookie(session) } });` 와 닫는 `}`까지).

`consumeMagicToken`/`issueMagicToken`은 매직링크 로그인이 계속 쓰므로 import를 남겨둔다.

- [ ] **Step 4: 설정에서 제거**

`wrangler.jsonc`의 `vars`에서 이 줄을 지운다:
```
    "PATREON_CLIENT_ID": "En9WUM2-Pdq56jtOwF6kGZwDqppxQxE92MHR-d1XLcR7886AKQVDDgJuNy32794s"
```

`vitest.config.js`의 `bindings`에서 이 두 줄을 지운다:
```
            PATREON_CLIENT_ID: "test-patreon-client",
            PATREON_CLIENT_SECRET: "test-patreon-secret",
```

- [ ] **Step 5: 프런트에서 제거**

`axbrief-app.jsx`에서 `SUBSCRIBE_URL` 상수 선언 줄과, SubscribeModal 안의 패트레온 링크
단락(`{tx('paywall.already')}` 을 감싼 `<p>` 전체)을 지운다. 그 위 주석 블록
(`/* subscribe CTA modal — ... */`)도 패트레온을 설명하므로 지운다.
`AxPill`의 `onClick`은 Task 7에서 교체하므로 지금은 `onClick={onClose}` 로 둔다.

- [ ] **Step 6: 문구에서 제거**

`i18n/ko.json`에서 세 키의 값을 패트레온 언급 없이 바꾼다:
```json
  "paywall.login": "로그인",
  "paywall.new_tab": "결제창이 열립니다",
  "paywall.subscribe": "구독하기",
```
`i18n/{en,ja,zh,es}.json`의 같은 세 키도 각 언어로 바꾼다:
- en: `"Log in"`, `"The checkout will open"`, `"Subscribe"`
- ja: `"ログイン"`, `"決済画面が開きます"`, `"購読する"`
- zh: `"登录"`, `"结账窗口将打开"`, `"订阅"`
- es: `"Iniciar sesión"`, `"Se abrirá el pago"`, `"Suscribirse"`

그 다음 `python3 pipeline/build_i18n.py` 로 `i18n/*.js`를 재생성한다.

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd /Users/leopard/Projects/design-ax-brief/.claude/worktrees/i18n && PATH=/opt/homebrew/bin:$PATH npm test`
Expected: PASS. 패트레온 테스트가 사라져 총 개수가 줄어든다. 실패가 있으면 그 파일의 patreon 참조를 마저 지운다.

Run: `grep -rin "patreon" --include="*.js" --include="*.jsx" --include="*.json" --include="*.jsonc" . | grep -v node_modules | grep -v "^./docs/"`
Expected: 출력 없음.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(billing): 패트레온 연동 전면 제거

후원자가 0명이므로 하위 호환 없이 걷어낸다. 세션·권한판정·잠금 UI는 그대로다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy"
```

---

### Task 2: 권한 판정에 잔여기간 보장 + 스키마 확장

**Files:**
- Modify: `worker/lib/entitlement.js`
- Modify: `worker/schema.sql`
- Test: `worker/test/entitlement.test.js` (신규)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `getEntitlement(db, email) -> Promise<{entitled: boolean, status: string|null, periodEnd: number|null}>` (동작 변경)
  - 테이블 `processed_events(event_id TEXT PRIMARY KEY, occurred_at INTEGER, received_at INTEGER)`
  - 컬럼 `subscribers.last_event_at INTEGER`

- [ ] **Step 1: Write the failing test**

새 파일 `worker/test/entitlement.test.js`:

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import schema from "../schema.sql?raw";
import { getEntitlement } from "../lib/entitlement.js";

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

async function put(email, status, periodEnd) {
  const t = now();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,?,'paddle',?,?)"
  ).bind(email, status, periodEnd, t, t).run();
}

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
});

describe("getEntitlement", () => {
  it("행이 없으면 권한 없음", async () => {
    expect((await getEntitlement(env.DB, "nobody@x.com")).entitled).toBe(false);
  });

  it("active + 미래 만료일 → 권한 있음", async () => {
    await put("a@x.com", "active", now() + 30 * DAY);
    expect((await getEntitlement(env.DB, "a@x.com")).entitled).toBe(true);
  });

  it("active + 지난 만료일 → 권한 없음", async () => {
    await put("b@x.com", "active", now() - DAY);
    expect((await getEntitlement(env.DB, "b@x.com")).entitled).toBe(false);
  });

  it("해지해도 남은 기간은 보장된다", async () => {
    await put("c@x.com", "canceled", now() + 10 * DAY);
    const e = await getEntitlement(env.DB, "c@x.com");
    expect(e.entitled).toBe(true);
    expect(e.status).toBe("canceled");
  });

  it("해지 + 기간 만료 → 권한 없음", async () => {
    await put("d@x.com", "canceled", now() - DAY);
    expect((await getEntitlement(env.DB, "d@x.com")).entitled).toBe(false);
  });

  it("결제 실패(past_due)도 기간 내에는 열어둔다", async () => {
    await put("e@x.com", "past_due", now() + 3 * DAY);
    expect((await getEntitlement(env.DB, "e@x.com")).entitled).toBe(true);
  });

  it("만료일 NULL은 active일 때만 권한 — 수동 부여 전용", async () => {
    await put("f@x.com", "active", null);
    expect((await getEntitlement(env.DB, "f@x.com")).entitled).toBe(true);
    await put("g@x.com", "canceled", null);
    expect((await getEntitlement(env.DB, "g@x.com")).entitled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/leopard/Projects/design-ax-brief/.claude/worktrees/i18n && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/entitlement.test.js`
Expected: FAIL — "해지해도 남은 기간은 보장된다"와 "결제 실패(past_due)도 기간 내에는 열어둔다"가
`expected false to be true`로 깨진다. 현재 구현이 `status === "active"`만 통과시키기 때문이다.

- [ ] **Step 3: 권한 판정 구현**

`worker/lib/entitlement.js` 전체를 교체:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/entitlement.test.js`
Expected: PASS (7개)

- [ ] **Step 5: 스키마 확장**

`worker/schema.sql` 끝에 추가:

```sql

-- 웹훅 멱등성: Paddle이 같은 이벤트를 재전송해도 한 번만 반영한다.
CREATE TABLE IF NOT EXISTS processed_events (
  event_id    TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
```

그리고 `subscribers` 테이블 정의의 `updated_at INTEGER NOT NULL,` 다음 줄에
`  last_event_at        INTEGER,` 를 넣는다 (웹훅 순서 역전 방지용).

운영 DB에는 이미 테이블이 있으므로 배포 시 다음을 실행해야 한다 (Task 9에서 수행):
```bash
wrangler d1 execute axbrief-subscribers --remote --command \
  "ALTER TABLE subscribers ADD COLUMN last_event_at INTEGER"
wrangler d1 execute axbrief-subscribers --remote --command \
  "CREATE TABLE IF NOT EXISTS processed_events (event_id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL, received_at INTEGER NOT NULL)"
```

- [ ] **Step 6: 전체 테스트**

Run: `PATH=/opt/homebrew/bin:$PATH npm test`
Expected: PASS 전부. 기존 premium 테스트는 `provider='manual'`+`status='active'`+`period_end=null`
행을 쓰므로 그대로 통과한다.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/entitlement.js worker/schema.sql worker/test/entitlement.test.js
git commit -m "feat(billing): 해지·결제실패 시 잔여 유료기간 보장 + 웹훅용 스키마

만료일이 있으면 날짜가 유일 기준. 해지는 갱신 중단이지 즉시 차단이 아니다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy"
```

---

### Task 3: 웹훅 서명 검증

**Files:**
- Create: `worker/lib/paddle.js`
- Test: `worker/test/paddle.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `verifyPaddleSignature(rawBody: string, header: string|null, secret: string, nowSec?: number) -> Promise<boolean>`

- [ ] **Step 1: Write the failing test**

새 파일 `worker/test/paddle.test.js`:

```js
import { describe, it, expect } from "vitest";
import { verifyPaddleSignature } from "../lib/paddle.js";

const SECRET = "pdl_ntfset_test_secret";
const BODY = '{"event_id":"evt_1","event_type":"subscription.activated"}';

// 테스트가 직접 서명을 만든다 — 구현과 같은 알고리즘을 독립적으로 재현해 둬야
// 구현이 틀렸을 때 테스트가 함께 틀리지 않는다.
async function sign(body, ts, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyPaddleSignature", () => {
  const now = 1800000000;

  it("올바른 서명은 통과한다", async () => {
    const h = `ts=${now};h1=${await sign(BODY, now)}`;
    expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(true);
  });

  it("바디가 한 글자라도 다르면 거부한다", async () => {
    const h = `ts=${now};h1=${await sign(BODY, now)}`;
    expect(await verifyPaddleSignature(BODY + " ", h, SECRET, now)).toBe(false);
  });

  it("다른 시크릿으로 만든 서명은 거부한다", async () => {
    const h = `ts=${now};h1=${await sign(BODY, now, "wrong_secret")}`;
    expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(false);
  });

  it("5초를 넘게 벗어난 타임스탬프는 거부한다 (재전송 공격)", async () => {
    const old = now - 6;
    const h = `ts=${old};h1=${await sign(BODY, old)}`;
    expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(false);
  });

  it("5초 이내면 과거·미래 모두 통과한다", async () => {
    for (const ts of [now - 5, now + 5]) {
      const h = `ts=${ts};h1=${await sign(BODY, ts)}`;
      expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(true);
    }
  });

  it("헤더가 없거나 형식이 깨졌으면 거부한다", async () => {
    for (const h of [null, "", "garbage", "ts=;h1=", `ts=${now}`, `h1=abc`])
      expect(await verifyPaddleSignature(BODY, h, SECRET, now)).toBe(false);
  });

  it("시크릿이 비어 있으면 거부한다 — 설정 누락이 통과로 둔갑하면 안 된다", async () => {
    const h = `ts=${now};h1=${await sign(BODY, now)}`;
    expect(await verifyPaddleSignature(BODY, h, "", now)).toBe(false);
    expect(await verifyPaddleSignature(BODY, h, undefined, now)).toBe(false);
  });

  it("서명 길이가 다르면 거부한다 (상수시간 비교가 길이에서 터지지 않는지)", async () => {
    expect(await verifyPaddleSignature(BODY, `ts=${now};h1=ab`, SECRET, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/leopard/Projects/design-ax-brief/.claude/worktrees/i18n && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/paddle.test.js`
Expected: FAIL — `Failed to resolve import "../lib/paddle.js"`

- [ ] **Step 3: 구현**

새 파일 `worker/lib/paddle.js`:

```js
// Paddle Billing 웹훅 서명 검증.
// 헤더 형식: `Paddle-Signature: ts=<unix>;h1=<hex>`
// 서명 대상: `{ts}:{raw_body}` — 바디는 받은 원문 그대로여야 한다. JSON을 파싱했다
// 다시 문자열로 만들면 공백·키순서가 달라져 서명이 깨진다.
const enc = new TextEncoder();
const TOLERANCE_SEC = 5;

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 길이가 다르면 바로 false. 같으면 전체를 끝까지 훑어 타이밍 차이를 없앤다.
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPaddleSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = {};
  for (const seg of String(header).split(";")) {
    const i = seg.indexOf("=");
    if (i > 0) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  }
  const ts = Number(parts.ts);
  const h1 = parts.h1;
  if (!Number.isFinite(ts) || ts <= 0 || !h1) return false;
  if (Math.abs(nowSec - ts) > TOLERANCE_SEC) return false;
  return constantTimeEqual(await hmacHex(`${ts}:${rawBody}`, secret), h1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/paddle.test.js`
Expected: PASS (8개)

- [ ] **Step 5: Commit**

```bash
git add worker/lib/paddle.js worker/test/paddle.test.js
git commit -m "feat(billing): Paddle 웹훅 서명 검증 (HMAC-SHA256, 상수시간 비교)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy"
```

---

### Task 4: 이벤트 → 권한 변환

**Files:**
- Modify: `worker/lib/paddle.js` (함수 추가)
- Modify: `worker/test/paddle.test.js` (describe 블록 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `toEntitlement(event: object) -> {eventId, occurredAt, email, customerId, status, periodEnd} | null`
    - `null` = 관심 없는 이벤트(무시하고 200)
    - `email`이 `null`이면 호출자가 Paddle API로 조회해야 한다
    - `periodEnd`가 `null`이면 "만료일을 바꾸지 말 것"
  - `fetchCustomerEmail(env, customerId) -> Promise<string|null>`

- [ ] **Step 1: Write the failing test**

`worker/test/paddle.test.js` 끝에 추가:

```js
import { toEntitlement } from "../lib/paddle.js";

const ISO = "2026-10-02T03:04:05.000Z";
const EPOCH = Math.floor(Date.parse(ISO) / 1000);
const END_ISO = "2026-11-02T03:04:05.000Z";
const END = Math.floor(Date.parse(END_ISO) / 1000);

function ev(type, data = {}) {
  return { event_id: "evt_1", event_type: type, occurred_at: ISO,
           data: { id: "sub_1", customer_id: "ctm_1",
                   custom_data: { email: "Buyer@Example.COM" }, ...data } };
}

describe("toEntitlement", () => {
  it("체험 시작 → 권한 열림, 만료일은 첫 청구일", () => {
    const r = toEntitlement(ev("subscription.trialing", { next_billed_at: END_ISO }));
    expect(r).toMatchObject({ eventId: "evt_1", occurredAt: EPOCH, status: "active",
                              periodEnd: END, customerId: "ctm_1" });
  });

  it("이메일은 소문자로 정규화한다", () => {
    expect(toEntitlement(ev("subscription.activated")).email).toBe("buyer@example.com");
  });

  it("체험 전환(activated) → 권한 열림, 만료일은 청구주기 종료", () => {
    const r = toEntitlement(ev("subscription.activated",
      { current_billing_period: { starts_at: ISO, ends_at: END_ISO } }));
    expect(r.status).toBe("active");
    expect(r.periodEnd).toBe(END);
  });

  it("updated는 페이로드의 status를 그대로 반영한다", () => {
    const cases = { active: "active", trialing: "active", past_due: "past_due",
                    paused: "canceled", canceled: "canceled" };
    for (const [paddle, ours] of Object.entries(cases))
      expect(toEntitlement(ev("subscription.updated", { status: paddle })).status).toBe(ours);
  });

  it("해지 → canceled, 만료일은 유료기간 끝까지 유지", () => {
    const r = toEntitlement(ev("subscription.canceled",
      { current_billing_period: { starts_at: ISO, ends_at: END_ISO } }));
    expect(r.status).toBe("canceled");
    expect(r.periodEnd).toBe(END);
  });

  it("결제 실패 → past_due, 만료일은 건드리지 않는다", () => {
    const r = toEntitlement(ev("transaction.payment_failed"));
    expect(r.status).toBe("past_due");
    expect(r.periodEnd).toBe(null);
  });

  it("결제 성공 → active 복구, 만료일은 건드리지 않는다", () => {
    const r = toEntitlement(ev("transaction.completed"));
    expect(r.status).toBe("active");
    expect(r.periodEnd).toBe(null);
  });

  it("관심 없는 이벤트는 null", () => {
    expect(toEntitlement(ev("customer.updated"))).toBe(null);
    expect(toEntitlement(ev("product.created"))).toBe(null);
  });

  it("custom_data에 이메일이 없으면 email=null로 알려 조회를 맡긴다", () => {
    const e = ev("subscription.activated");
    delete e.data.custom_data;
    const r = toEntitlement(e);
    expect(r.email).toBe(null);
    expect(r.customerId).toBe("ctm_1");
  });

  it("망가진 페이로드에 터지지 않는다", () => {
    expect(toEntitlement(null)).toBe(null);
    expect(toEntitlement({})).toBe(null);
    expect(toEntitlement({ event_type: "subscription.activated" })).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/paddle.test.js`
Expected: FAIL — `toEntitlement is not a function`

- [ ] **Step 3: 구현**

`worker/lib/paddle.js` 끝에 추가:

```js
// Paddle status → 우리 status. paused는 결제가 멈춘 상태이므로 canceled와 같이 다룬다
// (만료일이 남아 있으면 그때까지는 열려 있다 — getEntitlement 참고).
const STATUS_MAP = {
  active: "active", trialing: "active",
  past_due: "past_due", paused: "canceled", canceled: "canceled",
};

const epoch = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

export function toEntitlement(event) {
  if (!event || typeof event !== "object") return null;
  const { event_id: eventId, event_type: type, occurred_at, data } = event;
  if (!eventId || !type || !data) return null;

  // periodEnd=null은 "만료일을 바꾸지 말 것"이라는 뜻이다. 결제 성공/실패 이벤트는
  // 상태만 바꾸고 기간은 subscription.* 이벤트가 정한다.
  let status, periodEnd = null;
  if (type === "subscription.trialing") {
    status = "active";
    periodEnd = epoch(data.next_billed_at) ?? epoch(data.current_billing_period?.ends_at);
  } else if (type === "subscription.activated") {
    status = "active";
    periodEnd = epoch(data.current_billing_period?.ends_at) ?? epoch(data.next_billed_at);
  } else if (type === "subscription.updated") {
    status = STATUS_MAP[data.status] ?? "canceled";
    periodEnd = epoch(data.current_billing_period?.ends_at) ?? epoch(data.next_billed_at);
  } else if (type === "subscription.canceled") {
    status = "canceled";
    periodEnd = epoch(data.current_billing_period?.ends_at);
  } else if (type === "transaction.completed") {
    status = "active";
  } else if (type === "transaction.payment_failed") {
    status = "past_due";
  } else {
    return null;
  }

  const raw = data.custom_data?.email;
  return {
    eventId,
    occurredAt: epoch(occurred_at) ?? Math.floor(Date.now() / 1000),
    email: typeof raw === "string" && raw ? raw.trim().toLowerCase() : null,
    customerId: data.customer_id ?? null,
    status,
    periodEnd: periodEnd ?? null,
  };
}

// custom_data에 이메일이 없을 때의 폴백. 이게 없으면 "결제했는데 권한이 안 열림"이
// 조용히 발생한다 — 가장 나쁜 실패다.
export async function fetchCustomerEmail(env, customerId) {
  if (!customerId || !env.PADDLE_API_KEY) return null;
  const base = env.PADDLE_ENV === "sandbox"
    ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const res = await fetch(`${base}/customers/${encodeURIComponent(customerId)}`, {
    headers: { authorization: `Bearer ${env.PADDLE_API_KEY}` },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const email = body?.data?.email;
  return typeof email === "string" && email ? email.trim().toLowerCase() : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/paddle.test.js`
Expected: PASS (18개)

- [ ] **Step 5: Commit**

```bash
git add worker/lib/paddle.js worker/test/paddle.test.js
git commit -m "feat(billing): Paddle 이벤트를 권한 변경으로 변환

이메일이 없는 페이로드는 null로 표시해 API 조회 폴백을 타게 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy"
```

---

### Task 5: DB 반영 — 멱등성과 순서

**Files:**
- Create: `worker/lib/billing.js`
- Test: `worker/test/billing.test.js`

**Interfaces:**
- Consumes: Task 4의 `toEntitlement` 결과 객체
- Produces:
  - `applyEntitlement(db, delta) -> Promise<"applied"|"duplicate"|"stale">`
    - `delta`는 `{eventId, occurredAt, email, customerId, status, periodEnd}`

- [ ] **Step 1: Write the failing test**

새 파일 `worker/test/billing.test.js`:

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import schema from "../schema.sql?raw";
import { applyEntitlement } from "../lib/billing.js";
import { getEntitlement } from "../lib/entitlement.js";

const DAY = 86400;
const base = Math.floor(Date.now() / 1000);

const delta = (o) => ({
  eventId: "evt_" + Math.random().toString(36).slice(2),
  occurredAt: base, email: "u@x.com", customerId: "ctm_1",
  status: "active", periodEnd: base + 30 * DAY, ...o,
});

const row = (email) => env.DB.prepare(
  "SELECT status, current_period_end, provider, provider_customer_id, last_event_at FROM subscribers WHERE email = ?"
).bind(email).first();

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
});

describe("applyEntitlement", () => {
  it("새 구독자를 만든다", async () => {
    expect(await applyEntitlement(env.DB, delta({ email: "new@x.com" }))).toBe("applied");
    const r = await row("new@x.com");
    expect(r.status).toBe("active");
    expect(r.provider).toBe("paddle");
    expect(r.provider_customer_id).toBe("ctm_1");
    expect((await getEntitlement(env.DB, "new@x.com")).entitled).toBe(true);
  });

  it("같은 event_id를 두 번 보내면 두 번째는 무시한다", async () => {
    const d = delta({ email: "dup@x.com" });
    expect(await applyEntitlement(env.DB, d)).toBe("applied");
    const after = { ...d, status: "canceled", periodEnd: base - DAY };
    expect(await applyEntitlement(env.DB, after)).toBe("duplicate");
    expect((await row("dup@x.com")).status).toBe("active"); // 안 바뀌어야 한다
  });

  it("늦게 도착한 옛 이벤트는 최신 상태를 덮지 않는다", async () => {
    const email = "order@x.com";
    await applyEntitlement(env.DB, delta({ email, occurredAt: base + 100, status: "active" }));
    const r = await applyEntitlement(env.DB, delta({ email, occurredAt: base, status: "canceled" }));
    expect(r).toBe("stale");
    expect((await row(email)).status).toBe("active");
  });

  it("같은 시각의 다른 이벤트는 처리한다", async () => {
    const email = "same@x.com";
    await applyEntitlement(env.DB, delta({ email, occurredAt: base, status: "active" }));
    expect(await applyEntitlement(env.DB, delta({ email, occurredAt: base, status: "past_due" })))
      .toBe("applied");
    expect((await row(email)).status).toBe("past_due");
  });

  it("periodEnd가 null이면 기존 만료일을 유지한다", async () => {
    const email = "keep@x.com";
    const end = base + 20 * DAY;
    await applyEntitlement(env.DB, delta({ email, periodEnd: end, occurredAt: base }));
    await applyEntitlement(env.DB, delta({ email, periodEnd: null, status: "past_due", occurredAt: base + 1 }));
    const r = await row(email);
    expect(r.current_period_end).toBe(end);
    expect(r.status).toBe("past_due");
  });

  it("created_at은 첫 가입 시각을 유지한다", async () => {
    const email = "created@x.com";
    await applyEntitlement(env.DB, delta({ email, occurredAt: base }));
    const first = await env.DB.prepare("SELECT created_at FROM subscribers WHERE email=?").bind(email).first();
    await applyEntitlement(env.DB, delta({ email, occurredAt: base + 10 }));
    const second = await env.DB.prepare("SELECT created_at FROM subscribers WHERE email=?").bind(email).first();
    expect(second.created_at).toBe(first.created_at);
  });

  it("수동 부여(provider='manual', 무기한)는 Paddle 이벤트가 끌어내리지 못한다", async () => {
    const t = base;
    await env.DB.prepare(
      "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,NULL,'manual',?,?)"
    ).bind("comp@x.com", "active", t, t).run();
    expect(await applyEntitlement(env.DB, delta({ email: "comp@x.com", status: "canceled" })))
      .toBe("stale");
    expect((await getEntitlement(env.DB, "comp@x.com")).entitled).toBe(true);
  });

  it("이메일 없는 delta는 거부한다", async () => {
    await expect(applyEntitlement(env.DB, delta({ email: null }))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/billing.test.js`
Expected: FAIL — `Failed to resolve import "../lib/billing.js"`

- [ ] **Step 3: 구현**

새 파일 `worker/lib/billing.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/billing.test.js`
Expected: PASS (8개)

- [ ] **Step 5: Commit**

```bash
git add worker/lib/billing.js worker/test/billing.test.js
git commit -m "feat(billing): 웹훅 반영 — 멱등성·순서역전 방지·수동부여 보호

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy"
```

---

### Task 6: Worker 라우트 — 웹훅·체크아웃·포털

**Files:**
- Modify: `worker/index.js` (라우트 3개 추가, import 추가)
- Modify: `wrangler.jsonc` (vars 4개)
- Modify: `vitest.config.js` (테스트 바인딩)
- Test: `worker/test/billing-routes.test.js`

**Interfaces:**
- Consumes: `verifyPaddleSignature`, `toEntitlement`, `fetchCustomerEmail` (`./lib/paddle.js`),
  `applyEntitlement` (`./lib/billing.js`), 기존 `currentEmail(request, env)`
- Produces:
  - `POST /api/billing/webhook` → 200 `{ok:true}` / 401
  - `POST /api/billing/checkout` → 200 `{priceId, email, clientToken, environment}` / 401 / 400
  - `GET /api/billing/portal` → 200 `{url}` / 401 / 404

- [ ] **Step 1: Write the failing test**

새 파일 `worker/test/billing-routes.test.js`:

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import { signSession } from "../lib/crypto.js";

const SECRET = env.PADDLE_WEBHOOK_SECRET;
const DAY = 86400;

async function sign(body, ts) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function call(path, init = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, { redirect: "manual", ...init }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function post(path, body, extraHeaders = {}) {
  const ts = Math.floor(Date.now() / 1000);
  return call(path, { method: "POST", body,
    headers: { "paddle-signature": `ts=${ts};h1=${await sign(body, ts)}`, ...extraHeaders } });
}

async function cookieFor(email) {
  return "ax_session=" + await signSession(email, env.SESSION_SIGNING_KEY);
}

const webhookBody = (o = {}) => JSON.stringify({
  event_id: o.eventId ?? "evt_" + Math.random().toString(36).slice(2),
  event_type: o.type ?? "subscription.activated",
  occurred_at: new Date().toISOString(),
  data: { id: "sub_1", customer_id: "ctm_1", status: "active",
          custom_data: { email: o.email ?? "wh@x.com" },
          current_billing_period: { starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 30 * DAY * 1000).toISOString() } },
});

beforeAll(async () => {
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
});

describe("POST /api/billing/webhook", () => {
  it("서명이 맞으면 권한을 연다", async () => {
    const res = await post("/api/billing/webhook", webhookBody({ email: "ok@x.com" }));
    expect(res.status).toBe(200);
    const me = await call("/api/me", { headers: { cookie: await cookieFor("ok@x.com") } });
    expect((await me.json()).entitled).toBe(true);
  });

  it("서명 없이는 401이고 권한도 안 열린다", async () => {
    const res = await call("/api/billing/webhook", { method: "POST", body: webhookBody({ email: "nosig@x.com" }) });
    expect(res.status).toBe(401);
    const me = await call("/api/me", { headers: { cookie: await cookieFor("nosig@x.com") } });
    expect((await me.json()).entitled).toBe(false);
  });

  it("바디를 위조하면 401", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const good = webhookBody({ email: "a@x.com" });
    const res = await call("/api/billing/webhook", { method: "POST",
      body: webhookBody({ email: "attacker@x.com" }),
      headers: { "paddle-signature": `ts=${ts};h1=${await sign(good, ts)}` } });
    expect(res.status).toBe(401);
  });

  it("관심 없는 이벤트도 200으로 받아준다 (재전송 방지)", async () => {
    const body = JSON.stringify({ event_id: "evt_x", event_type: "product.created",
      occurred_at: new Date().toISOString(), data: { id: "pro_1" } });
    expect((await post("/api/billing/webhook", body)).status).toBe(200);
  });

  it("같은 이벤트를 두 번 보내도 200이고 상태는 한 번만 바뀐다", async () => {
    const body = webhookBody({ eventId: "evt_same", email: "twice@x.com" });
    expect((await post("/api/billing/webhook", body)).status).toBe(200);
    expect((await post("/api/billing/webhook", body)).status).toBe(200);
    const n = await env.DB.prepare("SELECT COUNT(*) c FROM processed_events WHERE event_id='evt_same'").first();
    expect(n.c).toBe(1);
  });

  it("JSON이 깨졌으면 400", async () => {
    expect((await post("/api/billing/webhook", "not json{{")).status).toBe(400);
  });
});

describe("POST /api/billing/checkout", () => {
  it("비로그인은 401 — 결제 이메일과 로그인 이메일을 일치시키기 위함", async () => {
    const res = await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "monthly" }) });
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe("login_required");
  });

  it("월간/연간 각각 올바른 price id를 돌려준다", async () => {
    const cookie = await cookieFor("buyer@x.com");
    for (const [plan, want] of [["monthly", env.PADDLE_PRICE_MONTHLY], ["yearly", env.PADDLE_PRICE_YEARLY]]) {
      const res = await call("/api/billing/checkout", { method: "POST", headers: { cookie }, body: JSON.stringify({ plan }) });
      expect(res.status).toBe(200);
      const b = await res.json();
      expect(b.priceId).toBe(want);
      expect(b.email).toBe("buyer@x.com");
      expect(b.clientToken).toBe(env.PADDLE_CLIENT_TOKEN);
    }
  });

  it("모르는 플랜은 400", async () => {
    const cookie = await cookieFor("buyer@x.com");
    for (const body of ['{"plan":"lifetime"}', "{}", "garbage"]) {
      const res = await call("/api/billing/checkout", { method: "POST", headers: { cookie }, body });
      expect(res.status).toBe(400);
    }
  });
});

describe("GET /api/billing/portal", () => {
  it("비로그인은 401", async () => {
    expect((await call("/api/billing/portal")).status).toBe(401);
  });

  it("구독 이력이 없으면 404", async () => {
    const res = await call("/api/billing/portal", { headers: { cookie: await cookieFor("nosub@x.com") } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 테스트 바인딩 추가**

`vitest.config.js`의 `bindings`에 추가 (Task 1에서 PATREON 두 줄을 지운 자리):
```js
            PADDLE_ENV: "sandbox",
            PADDLE_CLIENT_TOKEN: "test_client_token",
            PADDLE_API_KEY: "test_api_key",
            PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
            PADDLE_PRICE_MONTHLY: "pri_test_monthly",
            PADDLE_PRICE_YEARLY: "pri_test_yearly",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/billing-routes.test.js`
Expected: FAIL — 라우트가 없어 모두 404를 받는다.

- [ ] **Step 4: 라우트 구현**

`worker/index.js` 상단 import에 추가:
```js
import { verifyPaddleSignature, toEntitlement, fetchCustomerEmail } from "./lib/paddle.js";
import { applyEntitlement } from "./lib/billing.js";
```

`if (p === "/api/auth/logout" ...)` 블록 **다음에** 세 라우트를 넣는다
(`/premium/*` 차단보다 뒤, `/api/me`보다 앞이면 어디든 무방하다):

```js
    // Paddle 웹훅 — 권한이 열리는 유일한 경로. 브라우저가 보고하는 결제 성공은
    // 믿지 않는다. 서명 검증은 원문 바디로 하므로 파싱보다 먼저 한다.
    if (p === "/api/billing/webhook" && request.method === "POST") {
      const raw = await request.text();
      const ok = await verifyPaddleSignature(raw, request.headers.get("paddle-signature"),
                                             env.PADDLE_WEBHOOK_SECRET);
      if (!ok) return new Response(null, { status: 401 });

      let event;
      try { event = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }

      const delta = toEntitlement(event);
      // 관심 없는 이벤트는 200으로 받아준다 — 401/500을 주면 Paddle이 계속 재전송한다.
      if (!delta) return json({ ok: true, ignored: true });

      if (!delta.email) delta.email = await fetchCustomerEmail(env, delta.customerId);
      if (!delta.email) {
        // 이메일을 끝내 알 수 없으면 반영할 수 없다. 500을 줘서 Paddle이 재전송하게
        // 두고(일시적 API 장애일 수 있다) 로그에 남긴다.
        console.error("paddle webhook: no email", delta.eventId, delta.customerId);
        return new Response(null, { status: 500 });
      }
      const result = await applyEntitlement(env.DB, delta);
      return json({ ok: true, result });
    }

    // 결제 시작 — price id를 번들에 박지 않고 여기서 내려준다. 로그인을 요구하는
    // 이유: 결제 이메일과 로그인 이메일이 갈리면 돈을 내고도 아무것도 안 열린다.
    if (p === "/api/billing/checkout" && request.method === "POST") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 401);
      let plan = null;
      try { plan = (await request.json()).plan; } catch {}
      const priceId = plan === "monthly" ? env.PADDLE_PRICE_MONTHLY
                    : plan === "yearly" ? env.PADDLE_PRICE_YEARLY : null;
      if (!priceId) return json({ reason: "unknown_plan" }, 400);
      return json({ priceId, email, clientToken: env.PADDLE_CLIENT_TOKEN,
                    environment: env.PADDLE_ENV === "sandbox" ? "sandbox" : "production" });
    }

    // 구독 관리 — 카드 변경·해지·영수증은 Paddle 고객 포털로 보낸다.
    if (p === "/api/billing/portal") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 401);
      const row = await env.DB.prepare(
        "SELECT provider_customer_id FROM subscribers WHERE email = ?"
      ).bind(email).first();
      if (!row || !row.provider_customer_id) return json({ reason: "no_subscription" }, 404);
      const base = env.PADDLE_ENV === "sandbox"
        ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
      const res = await fetch(`${base}/customers/${encodeURIComponent(row.provider_customer_id)}/portal-sessions`,
        { method: "POST", headers: { authorization: `Bearer ${env.PADDLE_API_KEY}`,
                                     "content-type": "application/json" }, body: "{}" });
      if (!res.ok) return json({ reason: "portal_unavailable" }, 502);
      const body = await res.json().catch(() => null);
      const link = body?.data?.urls?.general?.overview;
      if (!link) return json({ reason: "portal_unavailable" }, 502);
      return json({ url: link });
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/billing-routes.test.js`
Expected: PASS (11개)

- [ ] **Step 6: 운영 설정 추가**

`wrangler.jsonc`의 `vars`에 추가 (시크릿은 넣지 않는다):
```
    "PADDLE_ENV": "sandbox",
    "PADDLE_CLIENT_TOKEN": "",
    "PADDLE_PRICE_MONTHLY": "",
    "PADDLE_PRICE_YEARLY": "",
```
빈 값은 Paddle 계정 승인 후 Task 9에서 채운다.

- [ ] **Step 7: 전체 테스트**

Run: `PATH=/opt/homebrew/bin:$PATH npm test`
Expected: PASS 전부

- [ ] **Step 8: Commit**

```bash
git add worker/index.js wrangler.jsonc vitest.config.js worker/test/billing-routes.test.js
git commit -m "feat(billing): 웹훅·체크아웃·고객포털 라우트

권한은 서명 검증을 통과한 웹훅으로만 열린다. 체크아웃은 로그인을 요구해
결제 이메일과 계정 이메일을 일치시킨다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy"
```

---

### Task 7: 프런트 — 플랜 선택과 Paddle 오버레이

**Files:**
- Modify: `axbrief-app.jsx` (`SubscribeModal` 전면 교체, `useEntitlementPoll` 추가)
- Modify: `i18n/ko.json` + `i18n/{en,ja,zh,es}.json` (문구 추가)
- Test: `pipeline/subscribe_modal_test.py` (신규 — 정적 검증)

**Interfaces:**
- Consumes: `POST /api/billing/checkout`, `GET /api/me`
- Produces: 없음 (최종 UI)

- [ ] **Step 1: 문구 추가**

`i18n/ko.json`에 추가 (알파벳 순서를 지킨다 — 기존 파일이 정렬돼 있다):
```json
  "paywall.plan_monthly": "월 $5.99",
  "paywall.plan_yearly": "연 $59.99",
  "paywall.plan_yearly_note": "17% 할인",
  "paywall.trial": "첫 달 무료",
  "paywall.login_first": "구독하려면 먼저 로그인해 주세요",
  "paywall.confirming": "결제를 확인하는 중입니다…",
  "paywall.confirm_slow": "결제가 확인되는 중입니다. 잠시 후 새로고침해 주세요.",
  "paywall.checkout_failed": "결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.",
```

`i18n/en.json`:
```json
  "paywall.plan_monthly": "$5.99 / month",
  "paywall.plan_yearly": "$59.99 / year",
  "paywall.plan_yearly_note": "Save 17%",
  "paywall.trial": "First month free",
  "paywall.login_first": "Please log in first to subscribe",
  "paywall.confirming": "Confirming your payment…",
  "paywall.confirm_slow": "Your payment is still being confirmed. Please refresh in a moment.",
  "paywall.checkout_failed": "Could not open the checkout. Please try again.",
```

`i18n/ja.json`:
```json
  "paywall.plan_monthly": "月額 $5.99",
  "paywall.plan_yearly": "年額 $59.99",
  "paywall.plan_yearly_note": "17%お得",
  "paywall.trial": "初月無料",
  "paywall.login_first": "購読するにはログインしてください",
  "paywall.confirming": "決済を確認しています…",
  "paywall.confirm_slow": "決済を確認中です。少し経ってから再読み込みしてください。",
  "paywall.checkout_failed": "決済画面を開けませんでした。もう一度お試しください。",
```

`i18n/zh.json`:
```json
  "paywall.plan_monthly": "每月 $5.99",
  "paywall.plan_yearly": "每年 $59.99",
  "paywall.plan_yearly_note": "省 17%",
  "paywall.trial": "首月免费",
  "paywall.login_first": "请先登录再订阅",
  "paywall.confirming": "正在确认付款…",
  "paywall.confirm_slow": "付款仍在确认中，请稍后刷新。",
  "paywall.checkout_failed": "无法打开结账窗口，请重试。",
```

`i18n/es.json`:
```json
  "paywall.plan_monthly": "$5.99 / mes",
  "paywall.plan_yearly": "$59.99 / año",
  "paywall.plan_yearly_note": "Ahorra 17%",
  "paywall.trial": "Primer mes gratis",
  "paywall.login_first": "Inicia sesión para suscribirte",
  "paywall.confirming": "Confirmando tu pago…",
  "paywall.confirm_slow": "Tu pago sigue confirmándose. Actualiza en un momento.",
  "paywall.checkout_failed": "No se pudo abrir el pago. Inténtalo de nuevo.",
```

Run: `python3 pipeline/build_i18n.py`

- [ ] **Step 2: Write the failing test**

새 파일 `pipeline/subscribe_modal_test.py` — 빌드 산출물이 아닌 소스를 정적으로 검사한다
(JSX는 브라우저에서 변환되므로 단위 테스트 환경이 없다. 회귀만 잡는다):

```python
#!/usr/bin/env python3
"""SubscribeModal이 결제 흐름의 핵심 규칙을 지키는지 정적으로 검사한다."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "axbrief-app.jsx"), encoding="utf-8").read()

# 1) 패트레온 흔적이 없어야 한다
assert "patreon" not in src.lower(), "axbrief-app.jsx still mentions Patreon"

# 2) 결제 성공을 프런트가 단정하지 않는다 — setAuth({entitled:true}) 같은 직접 설정 금지
assert not re.search(r"entitled:\s*true", src), \
    "front end must not grant entitlement itself; it must re-read /api/me"

# 3) 체크아웃은 서버에서 price id를 받아온다 (번들에 하드코딩 금지)
assert "/api/billing/checkout" in src, "checkout endpoint not called"
assert not re.search(r"pri_[a-z0-9]{6,}", src), "price id hardcoded in the bundle"

# 4) 결제 후 /api/me를 다시 읽는다
assert src.count("/api/me") >= 2, "no re-read of /api/me after checkout"

# 5) 플랜 두 가지를 모두 제공한다
for key in ("monthly", "yearly"):
    assert f"'{key}'" in src or f'"{key}"' in src, f"plan {key} missing"

# 6) 새 문구 키가 5개 언어에 모두 있다
need = ["paywall.plan_monthly", "paywall.plan_yearly", "paywall.plan_yearly_note",
        "paywall.trial", "paywall.login_first", "paywall.confirming",
        "paywall.confirm_slow", "paywall.checkout_failed"]
for lang in ("ko", "en", "ja", "zh", "es"):
    d = json.load(open(os.path.join(ROOT, "i18n", f"{lang}.json"), encoding="utf-8"))
    missing = [k for k in need if k not in d]
    assert not missing, f"{lang}.json missing {missing}"
    stale = [k for k in ("paywall.login", "paywall.subscribe", "paywall.new_tab")
             if "atreon" in d.get(k, "")]
    assert not stale, f"{lang}.json still says Patreon in {stale}"

print("subscribe modal OK")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/leopard/Projects/design-ax-brief/.claude/worktrees/i18n/pipeline && python3 subscribe_modal_test.py`
Expected: FAIL — `AssertionError: checkout endpoint not called`

- [ ] **Step 4: SubscribeModal 구현**

`axbrief-app.jsx`에서 Task 1이 남겨둔 `SubscribeModal` 함수 전체를 아래로 교체한다.
`AxPill`, `tx`, `ReactDOM.createPortal`은 기존 그대로 쓴다.

```jsx
/* Paddle.js를 한 번만 불러온다. 결제창을 열 때까지 로드하지 않아 첫 화면이 가벼워진다. */
let axPaddleReady = null;
function loadPaddle(clientToken, environment) {
  if (axPaddleReady) return axPaddleReady;
  axPaddleReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = () => {
      try {
        if (environment === 'sandbox') window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({ token: clientToken });
        resolve(window.Paddle);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('paddle_script_failed'));
    document.head.appendChild(s);
  });
  return axPaddleReady;
}

/* 결제 직후 권한을 다시 읽는다. 권한은 Paddle 웹훅이 열어주므로 브라우저가 결제
   성공을 본 시점에는 아직 안 열려 있을 수 있다. 2초 간격 5회까지 기다린다. */
async function pollEntitlement(tries = 5, gapMs = 2000) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, gapMs));
    try {
      const me = await fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.json());
      if (me.entitled) return true;
    } catch { /* 네트워크 일시 오류는 다음 회차에서 다시 본다 */ }
  }
  return false;
}

/* 구독 모달 — 플랜 2종. 결제창은 Paddle 오버레이로 사이트 위에 뜬다. */
function SubscribeModal({ onClose, t }) {
  const [phase, setPhase] = useState('choose');   // choose | confirming | slow | error
  const [note, setNote] = useState('');

  const start = async (plan) => {
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) { setPhase('error'); setNote(tx('paywall.login_first')); return; }
      if (!res.ok) { setPhase('error'); setNote(tx('paywall.checkout_failed')); return; }
      const cfg = await res.json();
      const Paddle = await loadPaddle(cfg.clientToken, cfg.environment);
      Paddle.Checkout.open({
        items: [{ priceId: cfg.priceId, quantity: 1 }],
        customer: { email: cfg.email },
        customData: { email: cfg.email },      // 웹훅이 이 이메일로 권한을 연다
        settings: { displayMode: 'overlay', theme: 'light' },
        eventCallback: async (e) => {
          if (e.name !== 'checkout.completed') return;
          setPhase('confirming');
          if (await pollEntitlement()) window.location.reload();
          else setPhase('slow');
        },
      });
    } catch {
      setPhase('error'); setNote(tx('paywall.checkout_failed'));
    }
  };

  const Plan = ({ plan, price, badge }) => (
    <button onClick={() => start(plan)} style={{ display: 'block', width: '100%', textAlign: 'left',
      padding: '13px 15px', marginBottom: 8, borderRadius: 12, cursor: 'pointer',
      border: '1px solid ' + t.rule, background: 'transparent', fontFamily: 'Pretendard, system-ui' }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: t.hl }}>{price}</span>
      {badge && <span style={{ marginLeft: 8, fontSize: 12, color: t.hl }}>{badge}</span>}
      <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: t.mute }}>{tx('paywall.trial')}</span>
    </button>
  );

  return ReactDOM.createPortal(
    <div onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16,
        padding: 24, width: 320, maxWidth: '88vw', fontFamily: 'Pretendard, system-ui' }}>
        <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>{tx('paywall.modal_title')}</p>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: '#5a5450' }}>
          {tx('paywall.modal_body')}
        </p>
        {phase === 'choose' && (
          <React.Fragment>
            <Plan plan="monthly" price={tx('paywall.plan_monthly')} />
            <Plan plan="yearly" price={tx('paywall.plan_yearly')} badge={tx('paywall.plan_yearly_note')} />
          </React.Fragment>
        )}
        {phase === 'confirming' && (
          <p style={{ margin: 0, fontSize: 14, color: '#5a5450' }}>{tx('paywall.confirming')}</p>
        )}
        {phase === 'slow' && (
          <p style={{ margin: 0, fontSize: 14, color: '#5a5450' }}>{tx('paywall.confirm_slow')}</p>
        )}
        {phase === 'error' && (
          <p style={{ margin: 0, fontSize: 14, color: '#b4453c' }}>{note}</p>
        )}
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd pipeline && python3 subscribe_modal_test.py`
Expected: `subscribe modal OK`

- [ ] **Step 6: 문법 확인과 렌더 확인**

Run: `cd /Users/leopard/Projects/design-ax-brief/.claude/worktrees/i18n && ./node_modules/.bin/esbuild axbrief-app.jsx --loader:.jsx=jsx --outfile=/dev/null`
Expected: 에러 없음. 브라우저가 Babel standalone으로 JSX를 변환하므로 문법 오류는
런타임에야 드러난다 — 여기서 미리 잡는다.

Run: `PATH=/opt/homebrew/bin:$PATH npm test`
Expected: PASS 전부

- [ ] **Step 7: Commit**

```bash
git add axbrief-app.jsx i18n/ pipeline/subscribe_modal_test.py
git commit -m "feat(billing): 구독 모달 — 월간/연간 플랜 + Paddle 오버레이 결제

권한은 웹훅이 연다. 결제창이 닫히면 /api/me를 2초 간격 5회까지 다시 읽는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy"
```

---

### Task 8: 로그인 유도와 구독 관리 링크

**Files:**
- Modify: `axbrief-app.jsx` (`SubscribeModal`에 로그인 폼, `ProBadge` 옆 관리 링크)
- Modify: `i18n/*.json`

**Interfaces:**
- Consumes: `POST /api/auth/request`, `GET /api/billing/portal`, `GET /api/me`
- Produces: 없음 (최종 UI)

- [ ] **Step 1: 문구 추가**

`i18n/ko.json`:
```json
  "paywall.email_label": "이메일",
  "paywall.send_link": "로그인 링크 받기",
  "paywall.link_sent": "메일함을 확인해 주세요. 로그인 링크를 보냈습니다.",
  "paywall.manage": "구독 관리",
```
`i18n/en.json`: `"Email"`, `"Send login link"`, `"Check your inbox — we sent a login link."`, `"Manage subscription"`
`i18n/ja.json`: `"メールアドレス"`, `"ログインリンクを送る"`, `"メールをご確認ください。ログインリンクを送りました。"`, `"購読の管理"`
`i18n/zh.json`: `"邮箱"`, `"发送登录链接"`, `"请查收邮件，我们已发送登录链接。"`, `"管理订阅"`
`i18n/es.json`: `"Correo"`, `"Enviar enlace"`, `"Revisa tu correo: te enviamos un enlace de acceso."`, `"Gestionar suscripción"`

Run: `python3 pipeline/build_i18n.py`

- [ ] **Step 2: Write the failing test**

`pipeline/subscribe_modal_test.py` 끝의 `print(...)` 앞에 추가:

```python
# 7) 비로그인 사용자를 위한 로그인 경로가 모달 안에 있다
assert "/api/auth/request" in src, "no login path inside the subscribe modal"

# 8) 구독자에게 관리 링크를 제공한다
assert "/api/billing/portal" in src, "no manage-subscription link"

# 9) 새 문구 키도 5개 언어에 모두 있다
need2 = ["paywall.email_label", "paywall.send_link", "paywall.link_sent", "paywall.manage"]
for lang in ("ko", "en", "ja", "zh", "es"):
    d = json.load(open(os.path.join(ROOT, "i18n", f"{lang}.json"), encoding="utf-8"))
    missing = [k for k in need2 if k not in d]
    assert not missing, f"{lang}.json missing {missing}"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pipeline && python3 subscribe_modal_test.py`
Expected: FAIL — `AssertionError: no login path inside the subscribe modal`

- [ ] **Step 4: 로그인 폼 구현**

`SubscribeModal`의 `start` 함수에서 401을 받았을 때 에러만 띄우지 말고 로그인 단계로 보낸다.
`setPhase('error')` 대신 `setPhase('login')`로 바꾸고, 상태 블록에 다음을 추가한다
(`{phase === 'choose' && ...}` 와 `{phase === 'confirming' && ...}` 사이):

```jsx
        {phase === 'login' && (
          <React.Fragment>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#5a5450' }}>{tx('paywall.login_first')}</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={tx('paywall.email_label')} autoComplete="email"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 16,
                borderRadius: 10, border: '1px solid ' + t.rule, marginBottom: 8 }} />
            <AxPill label={tx('paywall.send_link')} t={t} onClick={async () => {
              if (!email.includes('@')) return;
              await fetch('/api/auth/request', { method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email }) });
              setPhase('sent');
            }} />
          </React.Fragment>
        )}
        {phase === 'sent' && (
          <p style={{ margin: 0, fontSize: 14, color: '#5a5450' }}>{tx('paywall.link_sent')}</p>
        )}
```

같은 함수 상단의 상태 선언에 추가:
```jsx
  const [email, setEmail] = useState('');
```

- [ ] **Step 5: 구독 관리 링크 구현**

`ProBadge` 함수(axbrief-app.jsx 내) 바로 아래에 추가:

```jsx
/* 구독자에게만 보이는 관리 링크 — 카드 변경·해지·영수증은 Paddle 포털에서 한다. */
function ManageLink({ t }) {
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const r = await fetch('/api/billing/portal', { credentials: 'same-origin' });
        const b = await r.json();
        if (b.url) window.open(b.url, '_blank', 'noopener');
      } finally { setBusy(false); }
    }} className="ax-eyebrow" style={{ cursor: 'pointer', border: 'none', background: 'none',
      color: t.faint, textDecoration: 'underline', padding: 0 }}>
      {tx('paywall.manage')}
    </button>
  );
}
```

`WeeklyTimeline`의 `ProBadge` 렌더 지점에서, 구독자일 때는 `ManageLink`를 대신 보여준다:
`{!entitled && <ProBadge onClick={...} />}` 패턴을 찾아
`{entitled ? <ManageLink t={t} /> : <ProBadge onClick={...} />}` 로 바꾼다.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd pipeline && python3 subscribe_modal_test.py`
Expected: `subscribe modal OK`

Run: `./node_modules/.bin/esbuild axbrief-app.jsx --loader:.jsx=jsx --outfile=/dev/null`
Expected: 에러 없음

- [ ] **Step 7: Commit**

```bash
git add axbrief-app.jsx i18n/ pipeline/subscribe_modal_test.py
git commit -m "feat(billing): 모달 안 이메일 로그인 + 구독자 관리 링크

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TYYxH4mRVed7tGNaMFwjoy"
```

---

### Task 9 (컨트롤러 전용 — 구현자는 건너뜀): 샌드박스 검증과 프로덕션 전환

이 태스크는 Paddle 계정과 실제 시크릿이 필요하므로 사람이 값을 넣어야 진행된다.
구현 태스크가 모두 끝난 뒤 컨트롤러가 사용자와 함께 수행한다.

- [ ] **Step 1: 샌드박스 값 설정**

사용자에게 Paddle 샌드박스에서 다음을 받는다: client token, API key, webhook secret,
월간/연간 price id. 그다음:
```bash
cd /Users/leopard/Projects/design-ax-brief
wrangler secret put PADDLE_API_KEY
wrangler secret put PADDLE_WEBHOOK_SECRET
```
`wrangler.jsonc`의 `PADDLE_CLIENT_TOKEN`, `PADDLE_PRICE_MONTHLY`, `PADDLE_PRICE_YEARLY`를 채우고
`PADDLE_ENV`는 `"sandbox"`로 둔다.

**배포 전 반드시 확인할 것 (최종 검토에서 나온 항목):**
- `MAIL_FROM`을 **검증된 Resend 도메인 주소**로 설정한다. 설정하지 않으면 Resend 공용 발신
  주소로 나가고, 그 주소는 **Resend 계정 주인에게만 배달된다** — 운영자 본인만 로그인에
  성공하고 나머지 모든 구매자는 메일을 받지 못한다. `wrangler.jsonc`에 자리표시자가 없으니
  잊기 쉽다.
- `PADDLE_API_KEY`가 반드시 설정돼 있어야 한다. 환불 취소 처리(`adjustment.*`)는 페이로드에
  `custom_data`가 없어서 고객 조회 API에 의존한다. 키가 없으면 환불해도 권한이 안 닫힌다.

- [ ] **Step 2: DB 마이그레이션**

```bash
wrangler d1 execute axbrief-subscribers --remote --command \
  "ALTER TABLE subscribers ADD COLUMN last_event_at INTEGER"
wrangler d1 execute axbrief-subscribers --remote --command \
  "CREATE TABLE IF NOT EXISTS processed_events (event_id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL, received_at INTEGER NOT NULL)"
```

- [ ] **Step 3: 웹훅 등록**

Paddle 대시보드 → Notifications → 대상 URL `https://axitnow.com/api/billing/webhook`,
이벤트: `subscription.trialing`, `subscription.activated`, `subscription.updated`,
`subscription.canceled`, `transaction.completed`, `transaction.payment_failed`.

- [ ] **Step 3b: 샌드박스 중에는 일반 방문자의 결제를 막는다**

`workers_dev`/`preview_urls`가 모두 꺼져 있어 샌드박스 검증도 프로덕션 호스트에서 해야 한다.
그 창 동안 실제 방문자가 Paddle 공개 테스트 카드(4242…)로 결제하면 진짜 구독 행이 생긴다.
`/api/billing/checkout`에 가드를 넣어 `PADDLE_ENV === "sandbox"`이면서 요청 호스트가
프로덕션 도메인이면 503을 돌려주되, 쿠키 `ax_sandbox=1`을 가진 요청만 통과시킨다
(운영자가 `?sandbox=1`로 한 번 설정). 프로덕션 전환 시 이 가드는 자동으로 무력화된다.

- [ ] **Step 4: 실제 결제 1건 흘려보기**

샌드박스 테스트 카드로 월간 플랜을 결제하고 다음을 확인한다:
- 결제창이 사이트 위에 오버레이로 뜨는가
- **결제창에서 이메일을 일부러 다른 주소로 바꿔서** 결제했을 때, 서버 로그에 불일치 경고가
  남고 어느 주소로 권한이 열렸는지 추적 가능한가 (최종 검토 Critical 2)
- `subscription.*` 이벤트 payload에 `custom_data.email`이 실제로 실려 오는가 — 안 실려 오면
  모든 권한이 `fetchCustomerEmail` 폴백에 의존하게 된다
- 갱신 1회가 `current_period_end`를 실제로 밀어주는가 (최종 검토 Important 5)
- 환불 1건이 권한을 즉시 닫는가 (최종 검토 Important 6)
- 결제 후 잠긴 카드가 열리는가 (웹훅 도착까지 최대 10초)
- `wrangler d1 execute axbrief-subscribers --remote --command "SELECT * FROM subscribers WHERE provider='paddle'"` 에 행이 생겼는가
- 고객 포털 링크가 열리는가
- 포털에서 해지 후에도 만료일까지 열려 있는가

- [ ] **Step 5: 프로덕션 전환**

`PADDLE_ENV`를 `"production"`으로 바꾸고 프로덕션 토큰·price id로 교체, 시크릿 재설정,
웹훅 대상 재등록. `git push origin main` 후 프로덕션에서 Step 4를 한 번 더 확인한다.
