# 주간 비즈니스 리포트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro 구독자에게 매주 월요일 아침, 그 주 AI 뉴스에서 한 섹션만 봐서는 보이지 않는 교차 흐름을 짚어 주는 리포트를 메일로 보낸다.

**Architecture:** 리포트 본문은 주당 50개 블록(9섹션 × 5언어 + 교차 5)으로 **한 번만** 생성해 빌드 산출물(`reports/<edition>/<lang>.json`)로 두고, 개인별 메일은 그 블록을 **조립**만 한다. 구독자가 1명이든 1만 명이든 LLM 호출은 50회다. 발송은 Cloudflare Cron Trigger가 깨우는 Worker의 `scheduled` 핸들러가 Resend 배치 API로 수행한다.

**Tech Stack:** Cloudflare Workers (`scheduled` 핸들러 + Cron Triggers), D1 (`axbrief-subscribers`), Resend, 기존 `worker/lib/crypto.js`(HMAC 서명), Python 파이프라인(블록 생성), vitest(`@cloudflare/vitest-pool-workers`).

**Spec:** `docs/superpowers/specs/2026-10-02-email-reports-design.md` (2026-10-06 개정 — 주간 리포트만)

## Global Constraints

- **발송은 매주 월요일 07:00 KST.** KST는 UTC+9이므로 cron 식은 `0 22 * * 0`(일요일 22:00 UTC)이다.
- **메일 하단 고지는 "이 리포트는 AI가 작성합니다."** — 사람이 검수하지 않으므로 "사람이 검수합니다"는 절대 쓰지 않는다.
- **모든 메일 하단에 수신 거부 링크를 넣는다.** 로그인을 요구하지 않는다 — 서명된 토큰을 링크에 담아 한 번의 클릭으로 끊는다. 법적 요건이고, 요구하면 스팸 신고로 간다.
- **무료 수신자에게는 ①번 문단만 보낸다.** ②③④가 무료 메일에 들어가면 유료 콘텐츠 유출이다.
- **같은 edition을 두 번 보내지 않는다.** Cron이 두 번 돌아도, 재시도가 겹쳐도 한 번만 나간다.
- 섹션 목록은 `pipeline/build_data.py`의 `SECTION_ORDER`를 단일 출처로 삼는다(현재 9개). 숫자를 코드에 박지 않는다.
- 언어는 `worker/lib/lang.js`의 `LANGS` (`en ko ja zh es`).
- 시크릿은 `wrangler.jsonc`에 쓰지 않는다. `RESEND_API_KEY`, `SESSION_SIGNING_KEY`는 이미 Worker 시크릿으로 있다.
- 새 D1 테이블은 `worker/schema.sql`에 추가하고, 프로덕션에는 `npx wrangler d1 execute axbrief-subscribers --remote --command "..."`로 따로 적용한다(테스트는 `schema.sql`을 `beforeAll`에서 적용한다).
- `node --check` / `npm test` 실행 전 `unset NODE_OPTIONS` — 세션에 주입된 preload가 node를 깨뜨린다.
- 커밋은 **명시적 경로로만** 한다. `git add -A` / `.` / `-u` 금지 — 작업 트리에 번역 데이터가 섞여 있다.

## Review Focus

스펙이 암시하지만 어느 태스크의 테스트도 건드리지 않는, 사람에게 실제로 피해가 가는 입력들. 각 줄의 테스트는 해당 태스크에 넣는다.

1. **수신 거부 토큰을 다른 주소로 재사용** — 서명이 맞아도 토큰에 담긴 주소 외의 사람을 끊어서는 안 된다. (Task 2)
2. **그 주에 카드가 한 장도 없는 섹션** — 블록 생성이 빈 입력에서 터지지 않고 그 섹션만 빠져야 한다. (Task 4)
3. **블록 하나가 생성에 실패한 주** — 메일 전체가 멈추는 게 아니라 그 섹션만 빠지고 나머지는 나가야 한다. (Task 5)
4. **구독이 만료된 직후의 수신자** — 발송 시점에 `entitled`가 false면 ①번만 받아야 한다. 발송 목록을 만든 시각과 보내는 시각 사이에 상태가 바뀔 수 있다. (Task 5)
5. **Resend가 일부 주소에서만 실패** — 한 통의 실패가 나머지 발송을 중단시키면 안 된다. 실패는 기록하고 다음 회차에 재시도하지 않는다. (Task 5)

---

### Task 1: 수신 설정 스키마와 읽기·쓰기 API

**Files:**
- Modify: `worker/schema.sql`
- Create: `worker/lib/mail_prefs.js`
- Modify: `worker/index.js` (라우트 2개)
- Test: `worker/test/mail_prefs.test.js`

**Interfaces:**
- Consumes: `currentEmail(request, env)` — `worker/index.js`에 이미 있다. 세션 쿠키에서 이메일을 꺼낸다.
- Produces:
  - `getPrefs(db, email) -> {email, lang, sections, weekly, unsub_all}` — 행이 없으면 기본값 객체를 반환한다(행을 만들지 않는다).
  - `setPrefs(db, email, patch) -> prefs` — 주어진 필드만 덮어쓰고 나머지는 유지한다.
  - `listWeeklyRecipients(db) -> [{email, lang, sections}]` — `weekly=1 AND unsub_all=0`인 사람만.
  - `unsubscribeAll(db, email) -> bool`

- [ ] **Step 1: 스키마 추가**

`worker/schema.sql` 끝에 붙인다:

```sql
/* 주간 리포트 수신 설정. 행이 없으면 "아직 아무것도 고르지 않은 사람"이고,
   기본값(전체 섹션 / 사이트 언어 / 수신함)으로 취급한다 — 로그인만 하고 설정에
   들어온 적 없는 사람에게도 리포트가 가야 하기 때문이다. */
CREATE TABLE IF NOT EXISTS mail_prefs (
  email      TEXT PRIMARY KEY,
  lang       TEXT NOT NULL DEFAULT 'ko',
  sections   TEXT NOT NULL DEFAULT '*',   -- '*' 또는 쉼표로 구분한 섹션 키
  weekly     INTEGER NOT NULL DEFAULT 1,  -- 0/1
  unsub_all  INTEGER NOT NULL DEFAULT 0,  -- 전체 수신 거부
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
/* 같은 메일을 두 번 보내지 않기 위한 발송 기록. Cron 재실행·재시도에 안전해야 한다. */
CREATE TABLE IF NOT EXISTS mail_sent (
  id      TEXT PRIMARY KEY,   -- 'weekly:<edition>:<email>'
  sent_at INTEGER NOT NULL
);
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`worker/test/mail_prefs.test.js`:

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import schema from "../schema.sql?raw";
import { getPrefs, setPrefs, listWeeklyRecipients, unsubscribeAll } from "../lib/mail_prefs.js";

beforeAll(async () => {
  for (const s of schema.split(";").map(x => x.trim()).filter(Boolean))
    await env.DB.exec(s.replace(/\s+/g, " "));
});

describe("mail_prefs", () => {
  it("행이 없으면 기본값을 주되 행을 만들지는 않는다", async () => {
    const p = await getPrefs(env.DB, "nobody@x.com");
    expect(p).toMatchObject({ email: "nobody@x.com", sections: "*", weekly: 1, unsub_all: 0 });
    const row = await env.DB.prepare("SELECT 1 FROM mail_prefs WHERE email=?").bind("nobody@x.com").first();
    expect(row).toBeNull();
  });

  it("준 필드만 덮어쓰고 나머지는 유지한다", async () => {
    await setPrefs(env.DB, "a@x.com", { lang: "en" });
    await setPrefs(env.DB, "a@x.com", { sections: "design,marketing" });
    const p = await getPrefs(env.DB, "a@x.com");
    expect(p.lang).toBe("en");
    expect(p.sections).toBe("design,marketing");
    expect(p.weekly).toBe(1);
  });

  it("수신 거부한 사람과 weekly=0인 사람은 발송 목록에서 빠진다", async () => {
    await setPrefs(env.DB, "on@x.com", { weekly: 1 });
    await setPrefs(env.DB, "off@x.com", { weekly: 0 });
    await setPrefs(env.DB, "gone@x.com", { weekly: 1 });
    await unsubscribeAll(env.DB, "gone@x.com");
    const list = (await listWeeklyRecipients(env.DB)).map(r => r.email);
    expect(list).toContain("on@x.com");
    expect(list).not.toContain("off@x.com");
    expect(list).not.toContain("gone@x.com");
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

```bash
cd /Users/leopard/Projects/design-ax-brief/.claude/worktrees/i18n
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/mail_prefs.test.js
```
기대: `Cannot find module '../lib/mail_prefs.js'`로 실패.

- [ ] **Step 4: 최소 구현**

`worker/lib/mail_prefs.js`:

```js
/* 주간 리포트 수신 설정. 행이 없는 사람은 "아직 고르지 않은 사람"이지
   "안 받겠다는 사람"이 아니다 — 기본값을 주되 행은 만들지 않는다. 설정 화면에
   들어온 적 없는 사람에게도 리포트가 가야 한다. */
const DEFAULTS = { lang: "ko", sections: "*", weekly: 1, unsub_all: 0 };
const nowSec = () => Math.floor(Date.now() / 1000);

export async function getPrefs(db, email) {
  const row = await db.prepare(
    "SELECT email, lang, sections, weekly, unsub_all FROM mail_prefs WHERE email = ?"
  ).bind(email).first();
  return row || { email, ...DEFAULTS };
}

export async function setPrefs(db, email, patch) {
  const cur = await getPrefs(db, email);
  const next = { ...cur, ...patch };
  const t = nowSec();
  await db.prepare(
    `INSERT INTO mail_prefs (email,lang,sections,weekly,unsub_all,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET
       lang=excluded.lang, sections=excluded.sections, weekly=excluded.weekly,
       unsub_all=excluded.unsub_all, updated_at=excluded.updated_at`
  ).bind(email, next.lang, next.sections, next.weekly ? 1 : 0, next.unsub_all ? 1 : 0, t, t).run();
  return next;
}

export async function listWeeklyRecipients(db) {
  const { results } = await db.prepare(
    "SELECT email, lang, sections FROM mail_prefs WHERE weekly = 1 AND unsub_all = 0"
  ).all();
  return results || [];
}

export async function unsubscribeAll(db, email) {
  await setPrefs(db, email, { weekly: 0, unsub_all: 1 });
  return true;
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/mail_prefs.test.js
```
기대: 3 passed.

- [ ] **Step 6: 라우트 두 개를 더한다**

`worker/index.js`의 `/api/me` 블록 바로 아래에:

```js
    // 수신 설정 — 로그인한 본인 것만 읽고 쓴다.
    if (p === "/api/mail/prefs") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 401);
      if (request.method === "GET") return json(await getPrefs(env.DB, email));
      if (request.method === "POST") {
        let body = {};
        try { body = await request.json(); } catch {}
        const patch = {};
        if (typeof body.lang === "string" && LANGS.includes(body.lang)) patch.lang = body.lang;
        if (typeof body.sections === "string") patch.sections = body.sections;
        if (body.weekly != null) patch.weekly = body.weekly ? 1 : 0;
        return json(await setPrefs(env.DB, email, patch));
      }
      return json({ reason: "method_not_allowed" }, 405);
    }
```

import에 `getPrefs, setPrefs`를 더한다.

- [ ] **Step 7: 전체 테스트 + 커밋**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npm test
git add worker/schema.sql worker/lib/mail_prefs.js worker/index.js worker/test/mail_prefs.test.js
git commit -m "feat(mail): 주간 리포트 수신 설정 스키마와 API"
```

---

### Task 2: 수신 거부 — 로그인 없이 한 번의 클릭

**Files:**
- Create: `worker/lib/unsub.js`
- Modify: `worker/index.js` (라우트 1개)
- Test: `worker/test/unsub.test.js`

**Interfaces:**
- Consumes: `worker/lib/crypto.js`의 HMAC 패턴(`signSession`/`verifySession`와 같은 `payload.sig` 형식), `unsubscribeAll(db, email)`.
- Produces:
  - `signUnsub(email, secret) -> token` (만료 없음 — 메일은 몇 달 뒤에 열릴 수 있다)
  - `verifyUnsub(token, secret) -> email | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`worker/test/unsub.test.js`:

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import { signUnsub, verifyUnsub } from "../lib/unsub.js";
import { getPrefs } from "../lib/mail_prefs.js";

beforeAll(async () => {
  for (const s of schema.split(";").map(x => x.trim()).filter(Boolean))
    await env.DB.exec(s.replace(/\s+/g, " "));
});
const call = (path, init) => worker.fetch(new Request("http://localhost" + path, init), env, {
  waitUntil() {}, passThroughOnException() {},
});

describe("unsubscribe", () => {
  it("서명한 토큰에서 주소를 되찾는다", async () => {
    const t = await signUnsub("a@x.com", "k");
    expect(await verifyUnsub(t, "k")).toBe("a@x.com");
  });

  it("다른 키로 서명한 토큰은 거부한다", async () => {
    const t = await signUnsub("a@x.com", "k");
    expect(await verifyUnsub(t, "other")).toBeNull();
  });

  // Review Focus 1 — 서명이 맞아도 토큰에 담긴 주소 외의 사람을 끊어선 안 된다.
  it("토큰의 주소만 끊는다 — 쿼리로 다른 주소를 끼워 넣어도 무시한다", async () => {
    const t = await signUnsub("victim@x.com", env.SESSION_SIGNING_KEY);
    await call(`/api/mail/unsubscribe?t=${t}&email=other@x.com`);
    expect((await getPrefs(env.DB, "victim@x.com")).unsub_all).toBe(1);
    expect((await getPrefs(env.DB, "other@x.com")).unsub_all).toBe(0);
  });

  it("한 번의 GET으로 끊기고, 두 번 눌러도 같은 화면이다", async () => {
    const t = await signUnsub("b@x.com", env.SESSION_SIGNING_KEY);
    const r1 = await call(`/api/mail/unsubscribe?t=${t}`);
    const r2 = await call(`/api/mail/unsubscribe?t=${t}`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((await getPrefs(env.DB, "b@x.com")).unsub_all).toBe(1);
  });

  it("서명이 깨진 토큰은 아무도 끊지 않는다", async () => {
    const r = await call("/api/mail/unsubscribe?t=garbage");
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/unsub.test.js
```
기대: `Cannot find module '../lib/unsub.js'`.

- [ ] **Step 3: 최소 구현**

`worker/lib/unsub.js`:

```js
/* 수신 거부 토큰. 세션과 달리 만료를 두지 않는다 — 메일은 몇 달 뒤에 열릴 수
   있고, 그때 "링크가 만료됐습니다"를 보여 주면 사람은 스팸 신고 버튼을 누른다. */
const enc = new TextEncoder();
const b64url = (bytes) => {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlDec = (s) => {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
};
async function hmac(msg, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg))));
}

export async function signUnsub(email, secret) {
  const payload = b64url(enc.encode(JSON.stringify({ email, k: "unsub" })));
  return payload + "." + await hmac(payload, secret);
}

export async function verifyUnsub(token, secret) {
  if (!token || token.indexOf(".") < 0) return null;
  const [payload, sig] = token.split(".");
  if (await hmac(payload, secret) !== sig) return null;
  try {
    const o = JSON.parse(b64urlDec(payload));
    return o && o.k === "unsub" && o.email ? o.email : null;
  } catch { return null; }
}
```

- [ ] **Step 4: 라우트를 더한다**

`worker/index.js`에, 토큰의 주소만 쓰고 쿼리의 다른 주소는 절대 읽지 않는다:

```js
    // 수신 거부 — 로그인을 요구하지 않는다. 끊는 대상은 오직 토큰 안의 주소다.
    if (p === "/api/mail/unsubscribe") {
      const email = await verifyUnsub(url.searchParams.get("t"), env.SESSION_SIGNING_KEY);
      if (!email) return htmlPage("링크가 올바르지 않습니다. 메일 하단의 링크를 다시 눌러 주세요.", 400);
      await unsubscribeAll(env.DB, email);
      return htmlPage(`<p>수신을 해지했습니다.</p>
        <p style="color:#8a8377;font-size:13px">${email} 주소로 더 이상 리포트를 보내지 않습니다.</p>`);
    }
```

- [ ] **Step 5: 통과 확인 + 커밋**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npm test
git add worker/lib/unsub.js worker/index.js worker/test/unsub.test.js
git commit -m "feat(mail): 로그인 없이 한 번의 클릭으로 끊는 수신 거부"
```

---

### Task 3: 배관 검증 — LLM 없이 더미 리포트 한 통

**Files:**
- Create: `worker/lib/report_mail.js`
- Modify: `worker/lib/email.js` (`sendReport` 추가)
- Modify: `worker/index.js` (운영자 전용 테스트 라우트)
- Test: `worker/test/report_mail.test.js`

**Interfaces:**
- Consumes: `getPrefs`, `signUnsub`, `env.RESEND_API_KEY`, `env.MAIL_FROM`.
- Produces:
  - `renderReport({edition, lang, blocks, entitled, unsubUrl}) -> {subject, html}`
  - `sendReport(env, to, subject, html) -> void` (실패하면 throw)

**이 태스크의 목적은 콘텐츠가 아니라 배관이다.** 블록은 손으로 만든 더미를 쓴다. 메일이 실제로 도착하고, 수신 거부가 돌고, 무료/Pro 분기가 맞는지부터 확인한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`worker/test/report_mail.test.js`:

```js
import { describe, it, expect } from "vitest";
import { renderReport } from "../lib/report_mail.js";

const BLOCKS = {
  change: "이번 주의 변화 문단",
  sections: { design: "디자인 신호", marketing: "마케팅 신호" },
  dots: "흩어진 점 잇기 문단",
  next: ["다음에 볼 것 1", "다음에 볼 것 2"],
};

describe("renderReport", () => {
  it("Pro는 네 부분을 모두 받는다", () => {
    const { html } = renderReport({ edition: "2026-W41", lang: "ko", blocks: BLOCKS,
      entitled: true, sections: ["design", "marketing"], unsubUrl: "https://x/u" });
    expect(html).toContain("이번 주의 변화 문단");
    expect(html).toContain("디자인 신호");
    expect(html).toContain("흩어진 점 잇기 문단");
    expect(html).toContain("다음에 볼 것 1");
  });

  // Global Constraint — 무료 메일에 ②③④가 들어가면 유료 콘텐츠 유출이다.
  it("무료는 ①번만 받는다 — ②③④가 들어가면 안 된다", () => {
    const { html } = renderReport({ edition: "2026-W41", lang: "ko", blocks: BLOCKS,
      entitled: false, sections: ["design", "marketing"], unsubUrl: "https://x/u" });
    expect(html).toContain("이번 주의 변화 문단");
    expect(html).not.toContain("디자인 신호");
    expect(html).not.toContain("흩어진 점 잇기 문단");
    expect(html).not.toContain("다음에 볼 것 1");
  });

  it("고른 섹션만 담는다", () => {
    const { html } = renderReport({ edition: "2026-W41", lang: "ko", blocks: BLOCKS,
      entitled: true, sections: ["design"], unsubUrl: "https://x/u" });
    expect(html).toContain("디자인 신호");
    expect(html).not.toContain("마케팅 신호");
  });

  it("AI 작성 고지와 수신 거부 링크가 반드시 들어간다", () => {
    const { html } = renderReport({ edition: "2026-W41", lang: "ko", blocks: BLOCKS,
      entitled: true, sections: ["design"], unsubUrl: "https://x/unsub?t=abc" });
    expect(html).toContain("AI가 작성합니다");
    expect(html).not.toContain("사람이 검수");   // 지키지 않을 약속은 적지 않는다
    expect(html).toContain("https://x/unsub?t=abc");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/report_mail.test.js
```

- [ ] **Step 3: 최소 구현**

`worker/lib/report_mail.js` — 한 벌의 HTML 틀. 메일 클라이언트는 CSS를 거의 안 먹으므로 인라인 스타일만 쓴다:

```js
/* 메일 HTML. 메일 클라이언트는 <style> 블록과 대부분의 CSS를 버리므로 인라인
   스타일만 쓰고, 레이아웃은 테이블 대신 단일 컬럼으로 단순하게 간다. */
const esc = (v) => String(v == null ? "" : v)
  .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const T = {
  ko: { subject: (e) => `AX-it NOW 주간 리포트 · ${e}`, change: "이번 주의 변화",
        signals: "분야별 신호", dots: "흩어진 점 잇기", next: "다음에 볼 것",
        ai: "이 리포트는 AI가 작성합니다.", unsub: "수신 거부",
        locked: "분야별 신호와 교차 인사이트는 Pro 구독자에게 열립니다." },
  en: { subject: (e) => `AX-it NOW weekly · ${e}`, change: "What changed this week",
        signals: "Signals by field", dots: "Connecting the dots", next: "What to watch",
        ai: "This report is written by AI.", unsub: "Unsubscribe",
        locked: "Signals and cross-section insight are open to Pro subscribers." },
  // ja / zh / es 도 같은 모양으로 채운다
};

export function renderReport({ edition, lang, blocks, entitled, sections, unsubUrl }) {
  const t = T[lang] || T.ko;
  const p = (s) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#2a2622">${esc(s)}</p>`;
  const h = (s) => `<h2 style="margin:28px 0 10px;font-size:16px;color:#1c1a18">${esc(s)}</h2>`;
  const out = [h(t.change), p(blocks.change)];

  if (entitled) {
    out.push(h(t.signals));
    for (const s of sections) if (blocks.sections[s]) out.push(p(blocks.sections[s]));
    out.push(h(t.dots), p(blocks.dots));
    out.push(h(t.next));
    for (const n of blocks.next || []) out.push(p("· " + n));
  } else {
    out.push(`<p style="margin:24px 0 0;padding:14px 16px;border-radius:12px;background:#f1ece4;
      font-size:14px;color:#5a5450">${esc(t.locked)}</p>`);
  }

  const html = `<!doctype html><html><body style="margin:0;background:#f4f0e9;
    font-family:-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:28px 22px 36px;background:#fbf8f3">
      <div style="font-size:13px;color:#8a8377;letter-spacing:.06em">AX-it NOW · ${esc(edition)}</div>
      ${out.join("")}
      <hr style="margin:30px 0 14px;border:0;border-top:1px solid #e3dccf">
      <p style="margin:0 0 6px;font-size:12px;color:#8a8377">${esc(t.ai)}</p>
      <p style="margin:0;font-size:12px"><a href="${esc(unsubUrl)}" style="color:#8a8377">${esc(t.unsub)}</a></p>
    </div></body></html>`;
  return { subject: t.subject(edition), html };
}
```

`worker/lib/email.js`에 더한다:

```js
export async function sendReport(env, to, subject, html) {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "test-resend-key") {
    (env.__sentReports ||= []).push({ to, subject, html });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "AX-it NOW <noreply@axitnow.com>", to: [to], subject, html }),
  });
  if (!res.ok) throw new Error("resend_failed_" + res.status);
}
```

- [ ] **Step 4: 통과 확인**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/report_mail.test.js
```
기대: 4 passed.

- [ ] **Step 5: 운영자 전용 테스트 발송 라우트**

`worker/index.js`에. **로그인한 본인에게만** 보낸다 — 아무 주소로나 보낼 수 있으면 메일 중계기가 된다.
import에 `renderReport`(report_mail.js), `sendReport`(email.js), `signUnsub`(unsub.js)을 더한다
(`getPrefs`·`getEntitlement`는 Task 1·기존에서 이미 들어와 있다):

```js
    // 배관 점검용. 로그인한 본인에게만 더미 리포트를 한 통 보낸다.
    if (p === "/api/mail/test" && request.method === "POST") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 401);
      const ent = await getEntitlement(env.DB, email);
      const prefs = await getPrefs(env.DB, email);
      const token = await signUnsub(email, env.SESSION_SIGNING_KEY);
      const { subject, html } = renderReport({
        edition: "TEST", lang: prefs.lang, blocks: {
          change: "배관 점검용 더미 문단입니다.", sections: { design: "디자인 더미 신호" },
          dots: "교차 인사이트 더미 문단입니다.", next: ["더미 항목"],
        },
        entitled: ent.entitled, sections: ["design"],
        unsubUrl: `${env.BASE_URL}/api/mail/unsubscribe?t=${token}`,
      });
      try { await sendReport(env, email, subject, html); }
      catch (e) { return json({ ok: false, reason: String(e.message || e) }, 502); }
      return json({ ok: true, to: email });
    }
```

- [ ] **Step 6: 실제로 한 통 받아 본다**

```bash
# 배포 후, 로그인한 브라우저에서
curl -X POST https://axitnow.com/api/mail/test -b "ax_session=<세션>"
```
받은 메일에서 확인할 것: 레이아웃이 깨지지 않는가 / "AI가 작성합니다"가 있는가 / 수신 거부 링크를 누르면 한 번에 끊기는가.

- [ ] **Step 7: 커밋**

```bash
git add worker/lib/report_mail.js worker/lib/email.js worker/index.js worker/test/report_mail.test.js
git commit -m "feat(mail): 리포트 메일 틀과 배관 점검용 테스트 발송"
```

---

### Task 4: 리포트 블록 생성 (파이프라인)

**Files:**
- Create: `pipeline/build_report.py`
- Create: `pipeline/build_report_test.py`
- Create: `reports/` (산출물 디렉터리, `.gitignore` 하지 않는다 — Worker가 정적 자산으로 읽는다)

**먼저 확인할 것:** `wrangler.jsonc`의 `assets` 설정이 레포 루트를 통째로 서빙하는지. 그렇지 않으면 `reports/`가 `env.ASSETS`로 읽히지 않아 Task 5의 `scheduled`가 항상 "no report"로 끝난다. 확인 명령: 아무 파일이나 `reports/`에 두고 배포한 뒤 `curl -s -o /dev/null -w "%{http_code}" https://axitnow.com/reports/ping.txt` 가 200인지 본다.

**Interfaces:**
- Consumes: `pipeline/archive.json`(카드: `id/headline/body/section/date/url`), `archive-graph.js`(`nodes`/`links`, 링크에 `kw`), `pipeline/build_data.py`의 `SECTION_ORDER`.
- Produces: `reports/<edition>/<lang>.json` — `{edition, lang, change, sections:{<key>:str}, dots, next:[str]}`
  - `edition`은 ISO 주차 `YYYY-Www` (예: `2026-W41`).

**LLM 호출은 ax-writer 계열 서브에이전트가 한다.** 이 스크립트는 (a) 그 주 카드를 모아 프롬프트 입력을 만들고, (b) 교차 섹션 클러스터를 계산하고, (c) 답을 받아 `reports/`에 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`pipeline/build_report_test.py`:

```python
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_report import week_edition, cards_in_week, cross_section_clusters

def test_edition_is_iso_week():
    assert week_edition("2026-10-06") == "2026-W41"

def test_cards_in_week_is_monday_to_sunday():
    cards = [{"date": "2026-10-04", "section": "design", "id": "a"},   # 전주 일요일
             {"date": "2026-10-05", "section": "design", "id": "b"},   # 월
             {"date": "2026-10-11", "section": "design", "id": "c"},   # 일
             {"date": "2026-10-12", "section": "design", "id": "d"}]   # 다음 주 월
    got = [c["id"] for c in cards_in_week(cards, "2026-W41")]
    assert got == ["b", "c"], got

# Review Focus 2 — 그 주에 카드가 한 장도 없는 섹션에서 터지지 않는다.
def test_empty_section_is_skipped_not_fatal():
    out = cross_section_clusters([], [])
    assert out == []

def test_cluster_spans_two_sections_at_least():
    cards = [{"id": "design/x", "section": "design"}, {"id": "marketing/y", "section": "marketing"},
             {"id": "design/z", "section": "design"}]
    links = [{"source": "design/x", "target": "marketing/y", "kw": "watermark", "w": 3},
             {"source": "design/x", "target": "design/z", "kw": "figma", "w": 2}]
    out = cross_section_clusters(cards, links)
    assert len(out) == 1
    assert set(out[0]["sections"]) == {"design", "marketing"}
    assert out[0]["kw"] == "watermark"

if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"): fn()
    print("build_report OK")
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd pipeline && python3 build_report_test.py
```
기대: `ModuleNotFoundError: No module named 'build_report'`.

- [ ] **Step 3: 최소 구현**

`pipeline/build_report.py` — 순수 함수부터. LLM은 아직 붙이지 않는다:

```python
"""주간 리포트 블록을 만든다.

리포트의 핵심은 ③ '흩어진 점 잇기'다. 지식 네트워크가 이미 공유 키워드로 카드
사이의 간선을 계산해 두었으므로, 그 주 카드들이 걸쳐 있는 간선 중 **두 개 이상의
섹션을 잇는 것**만 추리면 "한 섹션만 봐서는 안 보이는 흐름"이 그대로 나온다.
억지로 지어내지 않고 데이터가 이미 아는 것을 꺼내는 쪽이 리포트의 신뢰를 지킨다."""
import datetime, json, os, re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def week_edition(date_str):
    """ISO 주차 라벨. 월요일이 주의 시작이다."""
    d = datetime.date.fromisoformat(date_str)
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def week_range(edition):
    y, w = edition.split("-W")
    monday = datetime.date.fromisocalendar(int(y), int(w), 1)
    return monday, monday + datetime.timedelta(days=6)


def cards_in_week(cards, edition):
    lo, hi = week_range(edition)
    out = []
    for c in cards:
        try: d = datetime.date.fromisoformat(c.get("date", ""))
        except ValueError: continue
        if lo <= d <= hi: out.append(c)
    return out


def cross_section_clusters(cards, links, min_sections=2):
    """두 개 이상의 섹션을 잇는 간선만 남겨, 공유 키워드별로 묶는다.
    가중치 합이 큰 묶음이 그 주의 '점'이다."""
    sec = {c["id"]: c.get("section") for c in cards}
    by_kw = defaultdict(lambda: {"ids": set(), "sections": set(), "w": 0})
    for l in links:
        a, b = l.get("source"), l.get("target")
        if a not in sec or b not in sec: continue
        if sec[a] == sec[b]: continue          # 같은 섹션끼리는 '교차'가 아니다
        g = by_kw[l.get("kw") or ""]
        g["ids"].update([a, b]); g["sections"].update([sec[a], sec[b]])
        g["w"] += l.get("w") or 1
    out = [{"kw": k, "ids": sorted(v["ids"]), "sections": sorted(v["sections"]), "w": v["w"]}
           for k, v in by_kw.items() if len(v["sections"]) >= min_sections]
    out.sort(key=lambda x: (-x["w"], x["kw"]))
    return out
```

- [ ] **Step 4: 통과 확인**

```bash
cd pipeline && python3 build_report_test.py
```
기대: `build_report OK`.

- [ ] **Step 5: 프롬프트 입력 생성과 쓰기를 더한다**

`build_report.py`에 CLI를 붙인다:

```
python3 build_report.py prompts --edition 2026-W41 --out /tmp/report_jobs.json
    (ax-writer 계열 에이전트가 읽고 /tmp/report_answers.json을 쓴다)
python3 build_report.py apply --edition 2026-W41 --answers /tmp/report_answers.json
    -> reports/2026-W41/<lang>.json  (5개 언어)
```

`prompts`가 담을 것: 섹션별 그 주 카드 목록(헤드라인+한 줄+카드 id), 교차 클러스터 상위 3개와 그 근거 카드. **"추측 금지, 근거 카드가 없는 주장은 쓰지 않는다"**를 프롬프트에 명시한다(④ 다음에 볼 것이 점괘가 되는 걸 막는다).

**카드 링크(스펙 §6.3).** 블록 안의 근거 카드는 원문 URL이 아니라 **사이트 딥링크**로 건다 — `{BASE_URL}/<lang>/?c=<section>:<id>`. 메일이 사람을 사이트로 돌려보내야 하고, 잠긴 카드를 누른 비구독자에게는 기존 구독 모달이 뜬다. 답에는 카드 id만 받고 링크 조립은 파이썬이 한다(에이전트가 URL을 지어내지 못하게).

```python
def card_link(base, lang, section, card_id):
    return f"{base}/{lang}/?c={section}:{card_id}"
```

- [ ] **Step 5b: 딥링크 테스트**

```python
def test_card_link_is_site_deeplink_not_source_url():
    assert card_link("https://axitnow.com", "ko", "marketing", "google-ai-spam") \
        == "https://axitnow.com/ko/?c=marketing:google-ai-spam"
```

- [ ] **Step 6: 커밋**

```bash
git add pipeline/build_report.py pipeline/build_report_test.py
git commit -m "feat(report): 주간 리포트 블록 생성 — 교차 섹션 클러스터 계산"
```

---

### Task 5: 조립·발송과 Cron

**Files:**
- Create: `worker/lib/weekly_send.js`
- Modify: `worker/index.js` (`scheduled` 핸들러 추가)
- Modify: `wrangler.jsonc` (Cron Trigger)
- Test: `worker/test/weekly_send.test.js`

**Interfaces:**
- Consumes: `listWeeklyRecipients`, `getEntitlement`, `renderReport`, `sendReport`, `signUnsub`, `env.ASSETS`(reports/ 읽기), `mail_sent` 테이블.
- Produces: `sendWeekly(env, edition) -> {sent, skipped, failed}`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`worker/test/weekly_send.test.js` — Review Focus 3·4·5를 모두 덮는다:

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import schema from "../schema.sql?raw";
import { sendWeekly } from "../lib/weekly_send.js";
import { setPrefs } from "../lib/mail_prefs.js";

const BLOCKS = { change: "변화", sections: { design: "디자인", marketing: "마케팅" },
                 dots: "교차", next: ["다음"] };

beforeAll(async () => {
  for (const s of schema.split(";").map(x => x.trim()).filter(Boolean))
    await env.DB.exec(s.replace(/\s+/g, " "));
});
beforeEach(async () => {
  env.__sentReports = [];
  await env.DB.exec("DELETE FROM mail_sent");
});

describe("sendWeekly", () => {
  it("같은 edition을 두 번 돌려도 한 번만 나간다", async () => {
    await setPrefs(env.DB, "a@x.com", { weekly: 1 });
    await sendWeekly(env, "2026-W41", BLOCKS);
    const first = env.__sentReports.length;
    await sendWeekly(env, "2026-W41", BLOCKS);
    expect(env.__sentReports.length).toBe(first);
  });

  // Review Focus 4 — 발송 시점의 권한으로 판단한다.
  it("구독이 끝난 사람은 ①번만 받는다", async () => {
    await setPrefs(env.DB, "free@x.com", { weekly: 1 });
    await sendWeekly(env, "2026-W42", BLOCKS);
    const mail = env.__sentReports.find(m => m.to === "free@x.com");
    expect(mail.html).toContain("변화");
    expect(mail.html).not.toContain("교차");
  });

  // Review Focus 3 — 블록 하나가 비어도 그 섹션만 빠지고 메일은 나간다.
  it("섹션 블록이 비어도 메일은 나간다", async () => {
    await setPrefs(env.DB, "b@x.com", { weekly: 1, sections: "design,marketing" });
    await sendWeekly(env, "2026-W43", { ...BLOCKS, sections: { design: "디자인" } });
    expect(env.__sentReports.some(m => m.to === "b@x.com")).toBe(true);
  });

  // Review Focus 5 — 한 통의 실패가 나머지를 막지 않는다.
  it("한 주소에서 실패해도 나머지는 계속 보낸다", async () => {
    await setPrefs(env.DB, "ok1@x.com", { weekly: 1 });
    await setPrefs(env.DB, "boom@x.com", { weekly: 1 });
    await setPrefs(env.DB, "ok2@x.com", { weekly: 1 });
    const r = await sendWeekly(env, "2026-W44", BLOCKS, {
      send: async (e, to, s, h) => { if (to === "boom@x.com") throw new Error("nope");
                                     (e.__sentReports ||= []).push({ to, subject: s, html: h }); },
    });
    expect(r.failed).toBe(1);
    expect(env.__sentReports.map(m => m.to).sort()).toEqual(["ok1@x.com", "ok2@x.com"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/weekly_send.test.js
```

- [ ] **Step 3: 최소 구현**

`worker/lib/weekly_send.js`:

```js
import { listWeeklyRecipients } from "./mail_prefs.js";
import { getEntitlement } from "./entitlement.js";
import { renderReport } from "./report_mail.js";
import { sendReport } from "./email.js";
import { signUnsub } from "./unsub.js";

/* 발송은 한 사람씩 독립적이다. 한 통이 실패해도 나머지는 계속 간다 — 실패한
   주소는 기록만 하고 다음 회차에 재시도하지 않는다. 지난 호를 뒤늦게 보내는
   것보다 건너뛰는 게 낫다. */
/* `blocksByLang`은 {ko:{...}, en:{...}} 꼴이다. 테스트처럼 블록 하나만 넘기면
   모든 언어가 그걸 쓰도록 받아 준다 — 호출부가 두 모양이면 한쪽이 반드시 틀린다. */
export async function sendWeekly(env, edition, blocksByLang, opts = {}) {
  const send = opts.send || sendReport;
  const pick = (lang) => blocksByLang[lang] || blocksByLang.ko || blocksByLang.en || blocksByLang;
  const people = await listWeeklyRecipients(env.DB);
  let sent = 0, skipped = 0, failed = 0;

  for (const p of people) {
    const id = `weekly:${edition}:${p.email}`;
    const seen = await env.DB.prepare("SELECT 1 FROM mail_sent WHERE id = ?").bind(id).first();
    if (seen) { skipped++; continue; }

    // 발송 시점의 권한으로 판단한다 — 목록을 만든 시각과 보내는 시각 사이에 바뀔 수 있다.
    const ent = await getEntitlement(env.DB, p.email);
    const blocks = pick(p.lang);
    const sections = p.sections === "*" ? Object.keys(blocks.sections || {})
                                        : p.sections.split(",").filter(Boolean);
    const token = await signUnsub(p.email, env.SESSION_SIGNING_KEY);
    const { subject, html } = renderReport({
      edition, lang: p.lang, blocks, entitled: ent.entitled, sections,
      unsubUrl: `${env.BASE_URL}/api/mail/unsubscribe?t=${token}`,
    });
    try {
      await send(env, p.email, subject, html);
      await env.DB.prepare("INSERT OR IGNORE INTO mail_sent (id, sent_at) VALUES (?,?)")
        .bind(id, Math.floor(Date.now() / 1000)).run();
      sent++;
    } catch (e) {
      console.error("weekly: send failed", p.email, String(e && e.message || e));
      failed++;
    }
  }
  return { sent, skipped, failed };
}
```

- [ ] **Step 4: 통과 확인**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npx vitest run worker/test/weekly_send.test.js
```
기대: 4 passed.

- [ ] **Step 5: `scheduled` 핸들러와 Cron**

`worker/index.js`의 `export default {` 안, `fetch` 옆에:

```js
  // 매주 월요일 07:00 KST = 일요일 22:00 UTC.
  async scheduled(event, env, ctx) {
    const d = new Date(Date.now() + 9 * 3600 * 1000);   // KST 기준의 '오늘'
    const edition = isoWeekLabel(d);
    // 언어별 블록을 미리 읽어 둔다 — 사람마다 다시 읽으면 같은 파일을 수백 번 가져온다.
    const byLang = {};
    for (const l of LANGS) {
      const r = await env.ASSETS.fetch(new Request(new URL(`/reports/${edition}/${l}.json`, env.BASE_URL)));
      if (r.ok) byLang[l] = await r.json();
    }
    if (!byLang.ko && !byLang.en) { console.error("weekly: no report for", edition); return; }
    ctx.waitUntil(sendWeekly(env, edition, byLang));
  },
```

`isoWeekLabel`은 `worker/lib/weekly_send.js`에 함께 둔다 — 파이썬 쪽
`build_report.week_edition`과 **같은 라벨을 만들어야** 파일을 찾는다:

```js
/* ISO 주차 라벨. pipeline/build_report.py의 week_edition과 결과가 같아야 한다 —
   한쪽이 2026-W41을 쓰는데 다른 쪽이 2026-W40을 찾으면 메일이 나가지 않는다. */
export function isoWeekLabel(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;            // 월=1 … 일=7
  t.setUTCDate(t.getUTCDate() + 4 - day);    // 그 주의 목요일 = ISO 주차의 기준
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
```

`wrangler.jsonc`에:

```jsonc
  "triggers": { "crons": ["0 22 * * 0"] },
```

- [ ] **Step 6: 전체 테스트 + 커밋**

```bash
unset NODE_OPTIONS && PATH=/opt/homebrew/bin:$PATH npm test
git add worker/lib/weekly_send.js worker/index.js worker/test/weekly_send.test.js wrangler.jsonc
git commit -m "feat(mail): 주간 리포트 조립·발송과 월요일 07시 Cron"
```

---

### Task 6: 수신 설정 화면

**Files:**
- Modify: `axbrief-app.jsx` (`SubscribeModal`에 설정 화면 추가, 또는 별도 모달)
- Modify: `i18n/*.json` (5개 언어 문구)
- Test: `pipeline/subscribe_modal_test.py` (문구 키가 5개 언어에 다 있는지)

- [ ] **Step 1: 문구 키를 더한다**

`mail.title`, `mail.weekly_on`, `mail.sections`, `mail.lang`, `mail.saved`, `mail.unsub_hint` — 5개 언어.

- [ ] **Step 2: 화면을 그린다**

구독 모달의 Pro 상태판 아래에 "리포트 설정" 줄을 두고, 누르면 같은 모달 안에서 설정으로 바뀐다. 섹션 체크박스 9개 + 언어 선택 + 주간 리포트 on/off. 저장은 `POST /api/mail/prefs`.

**로그인만 하고 구독하지 않은 사람도 들어올 수 있어야 한다** — 무료도 ①번 문단을 받기 때문이다.

- [ ] **Step 3: 문구 테스트 + 커밋**

```bash
cd pipeline && python3 subscribe_modal_test.py
git add axbrief-app.jsx i18n/*.json i18n/*.js pipeline/subscribe_modal_test.py
git commit -m "feat(mail): 주간 리포트 수신 설정 화면"
```

---

### Task 7: 첫 회차 실제 발송 검증

- [ ] **Step 1: 프로덕션 D1에 테이블을 만든다**

```bash
npx wrangler d1 execute axbrief-subscribers --remote --command \
  "CREATE TABLE IF NOT EXISTS mail_prefs (...); CREATE TABLE IF NOT EXISTS mail_sent (...);"
```

- [ ] **Step 2: 이번 주 블록을 생성한다**

```bash
cd pipeline && python3 build_report.py prompts --edition $(python3 -c "import build_report,datetime;print(build_report.week_edition(datetime.date.today().isoformat()))") --out /tmp/report_jobs.json
# ax-writer 계열 에이전트 실행 -> /tmp/report_answers.json
python3 build_report.py apply --edition <edition> --answers /tmp/report_answers.json
```

- [ ] **Step 3: 내 주소로 먼저 한 통**

`/api/mail/test`로 실제 블록을 넣어 보내 보고, 레이아웃·고지·수신 거부를 눈으로 확인한다.

- [ ] **Step 4: Cron을 한 번 수동으로 깨운다**

```bash
npx wrangler dev --test-scheduled    # 로컬
# 또는 배포 후 Cloudflare 대시보드에서 트리거
```

- [ ] **Step 5: 확인**

`mail_sent`에 행이 생겼는가 / 같은 edition으로 다시 돌렸을 때 아무도 두 번 받지 않는가 / 수신 거부 링크를 누른 주소가 다음 회차에서 빠지는가.
