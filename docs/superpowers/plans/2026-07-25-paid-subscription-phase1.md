# Paid Subscription Paywall — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static Design AX Brief into a gated site where the `full` deep-dive is served only to authenticated, entitled subscribers — proven end-to-end with a manual allowlist, no payment yet.

**Architecture:** A thin Cloudflare Worker sits in front of the existing static assets. `build_data.py` splits each card's `full` block out of the public `axbrief-data.js` into a private `premium/full.json`. The Worker passes all normal routes through to static assets, 403s any direct hit to `/premium/*`, and serves `full` content only via `GET /api/premium/full` after checking a magic-link session cookie against a D1 allowlist.

**Tech Stack:** Cloudflare Workers (static assets binding + `run_worker_first`), D1 (SQLite), KV, Web Crypto (HMAC-SHA256 sessions — no JWT lib), Resend (magic-link email), Vitest + `@cloudflare/vitest-pool-workers` for Worker tests, dependency-free Python assert scripts for the build change.

## Global Constraints

- **Branch isolation:** ALL work happens on a feature branch (or worktree), NOT `main`. The 08:00 KST launchd automation commits to `main` and auto-deploys daily; a half-finished paywall on `main` would ship broken. Merge to `main` and deploy ONLY in the final task (Task 8).
- **Deploy truth:** Pushing `main` does NOT deploy. `pipeline/deploy.sh` merges `main` → `cloudflare/workers-autoconfig` and pushes it, triggering the Cloudflare Workers Build. `wrangler.jsonc` is tracked on `main` (identical on both branches) and carried forward by that merge — edit it on `main`.
- **No content leak:** The public `axbrief-data.js` must contain NO card `full` key. `premium/full.json` must never be reachable as a public URL. These are the two airtight-gating invariants Phase 1 must prove.
- **No regression:** A logged-out visitor's free experience (card fronts, `/s/*` share pages) must render exactly as it does today.
- **Premium key format:** `"<section>/<id>"` (e.g. `"design/agentface"`). Used identically in `premium/full.json`, the `/api/premium/full?section=&id=` query, and the frontend fetch.
- **Session cookie:** name `ax_session`, httpOnly, Secure, SameSite=Lax, Max-Age 2592000 (30d). Signed `payloadB64.sigB64` with HMAC-SHA256 over the payload using `SESSION_SIGNING_KEY`.
- **Magic-link token TTL:** 900 seconds, single-use (delete on consume), stored in KV `AUTH_TOKENS` under key `ml:<token>`.
- **Node/wrangler:** Node v20.20.2, wrangler 4.86.0 (via `npx`).

---

## File Structure

- `pipeline/build_data.py` — MODIFY: add `split_full()`, write `premium/full.json`, strip `full` + add `hasFull` to public JS.
- `pipeline/tests/test_split_full.py` — CREATE: dependency-free assert script for the split.
- `premium/full.json` — GENERATED build output (gitignored? no — committed so the deploy branch carries it; see Task 1).
- `package.json` — CREATE: devDeps (wrangler, vitest, @cloudflare/vitest-pool-workers) + scripts.
- `wrangler.jsonc` — MODIFY: add `main`, ASSETS binding, `run_worker_first`, D1, KV bindings.
- `vitest.config.js` — CREATE: workers pool config.
- `worker/index.js` — CREATE: router / fetch handler.
- `worker/lib/crypto.js` — CREATE: base64url + HMAC session sign/verify.
- `worker/lib/cookies.js` — CREATE: cookie parse + Set-Cookie builders.
- `worker/lib/tokens.js` — CREATE: KV magic-link issue/consume.
- `worker/lib/entitlement.js` — CREATE: D1 entitlement lookup.
- `worker/lib/email.js` — CREATE: Resend magic-link sender.
- `worker/schema.sql` — CREATE: D1 `subscribers` table DDL (also used by tests).
- `worker/test/*.test.js` — CREATE: Vitest worker tests per task.
- `axbrief-app.jsx` — MODIFY: entitlement context, paywall block, login modal, premium fetch.

---

## Task 1: Split `full` out of the public build

**Files:**
- Modify: `pipeline/build_data.py` (add `split_full`, wire into `main()` around lines 150-160)
- Create: `pipeline/tests/test_split_full.py`

**Interfaces:**
- Produces: `split_full(data: dict) -> dict` — mutates every card in `data` (today + archive days across all sections): pops `full`, sets `hasFull: bool`. Returns `premium` map `{"<section>/<id>": <full block>}`. `to_js(data)` (unchanged signature) then emits public JS with no `full`.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/test_split_full.py`:

```python
import importlib.util, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("build_data", os.path.join(ROOT, "build_data.py"))
bd = importlib.util.module_from_spec(spec); spec.loader.exec_module(bd)

def sample():
    return {"sections": {"design": {"today": {"cards": [
        {"id": "alpha", "headline": "A", "body": "b", "url": "u1",
         "full": {"mode": "summary", "blocks": [{"t": "p", "x": "DEEP"}]}},
        {"id": "beta", "headline": "B", "body": "b", "url": "u2"},  # no full
    ]}, "days": [{"date": "2026-07-24", "cards": [
        {"id": "gamma", "headline": "G", "body": "b", "url": "u3",
         "full": {"mode": "full", "blocks": [{"t": "p", "x": "ARCHIVE_DEEP"}]}},
    ]}]}}}

def run():
    data = sample()
    premium = bd.split_full(data)
    cards = data["sections"]["design"]["today"]["cards"]
    assert "full" not in cards[0], "full must be stripped from public card"
    assert cards[0]["hasFull"] is True, "card with full → hasFull True"
    assert cards[1]["hasFull"] is False, "card without full → hasFull False"
    assert premium["design/alpha"]["blocks"][0]["x"] == "DEEP"
    assert premium["design/gamma"]["blocks"][0]["x"] == "ARCHIVE_DEEP", "archive full included"
    js = bd.to_js(data)
    assert "DEEP" not in js, "deep-dive text must not leak into public JS"
    assert '"hasFull"' in js, "public JS carries hasFull flag"
    print("PASS test_split_full")

if __name__ == "__main__":
    try:
        run()
    except AssertionError as e:
        print("FAIL:", e); sys.exit(1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/leopard/Projects/design-ax-brief && python3 pipeline/tests/test_split_full.py`
Expected: FAIL (AttributeError: module 'build_data' has no attribute 'split_full', shown as a traceback / nonzero exit).

- [ ] **Step 3: Add `split_full` to `pipeline/build_data.py`**

Insert this function just above `def to_js(data):` (near line 60):

```python
def split_full(data):
    """Move every card's `full` deep-dive out of the public payload.
    Mutates cards in place (pops `full`, sets `hasFull`); returns the premium
    map { "<section>/<id>": <full block> } for premium/full.json."""
    sections = data.get("sections")
    if sections is None:
        sections = {"design": {"today": data.get("today", {"cards": []}),
                               "days": data.get("days", [])}}
    premium = {}
    for sec, s in sections.items():
        cards = list((s.get("today") or {}).get("cards", []))
        for day in s.get("days", []):
            cards += day.get("cards", [])
        for c in cards:
            cid = c.get("id")
            full = c.pop("full", None)
            if full and cid:
                premium["%s/%s" % (sec, cid)] = full
                c["hasFull"] = True
            else:
                c["hasFull"] = False
    return premium
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/leopard/Projects/design-ax-brief && python3 pipeline/tests/test_split_full.py`
Expected: `PASS test_split_full`

- [ ] **Step 5: Wire `split_full` + premium output into `main()`**

In `pipeline/build_data.py` `main()`, replace the final two lines:

```python
    data = json.load(open(a.inp, encoding="utf-8"))
    open(a.out, "w", encoding="utf-8").write(to_js(data))
```

with:

```python
    data = json.load(open(a.inp, encoding="utf-8"))
    premium = split_full(data)  # strips `full`, adds `hasFull`, returns premium map
    open(a.out, "w", encoding="utf-8").write(to_js(data))
    prem_dir = os.path.join(os.path.dirname(os.path.abspath(a.out)), "premium")
    os.makedirs(prem_dir, exist_ok=True)
    with open(os.path.join(prem_dir, "full.json"), "w", encoding="utf-8") as f:
        json.dump(premium, f, ensure_ascii=False, indent=2)
```

(Note: the existing `emit_share_pages` call, if present after this in `main()`, still works — it reads only `headline`/`body`, never `full`.)

- [ ] **Step 6: Regenerate and eyeball the real build**

Run:
```bash
cd /Users/leopard/Projects/design-ax-brief/pipeline && python3 build_data.py
cd /Users/leopard/Projects/design-ax-brief
grep -c '"hasFull"' axbrief-data.js        # expect > 0
python3 -c "import json;d=json.load(open('premium/full.json'));print('premium keys:',len(d))"  # expect ~ today+archive cards
python3 - <<'PY'
import re
js=open('axbrief-data.js',encoding='utf-8').read()
assert '"full"' not in js.replace('"hasFull"',''), "full leaked into public JS!"
print("OK: no full in public JS")
PY
```
Expected: `hasFull` count > 0, premium keys > 0, `OK: no full in public JS`.

- [ ] **Step 7: Commit**

```bash
cd /Users/leopard/Projects/design-ax-brief
git add pipeline/build_data.py pipeline/tests/test_split_full.py axbrief-data.js premium/full.json
git commit -m "feat(build): split full deep-dive into private premium/full.json"
```

---

## Task 2: Worker project scaffold + Cloudflare bindings + test harness

**Files:**
- Create: `package.json`, `vitest.config.js`, `worker/index.js`, `worker/schema.sql`, `worker/test/smoke.test.js`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: a deployable Worker whose `fetch(request, env, ctx)` passes everything through to `env.ASSETS`. Bindings available to later tasks: `env.ASSETS` (static), `env.DB` (D1), `env.AUTH_TOKENS` (KV), `env.SESSION_SIGNING_KEY`, `env.RESEND_API_KEY`, `env.BASE_URL`.

- [ ] **Step 1: Create Cloudflare resources**

Run (records the ids you paste into `wrangler.jsonc`):
```bash
cd /Users/leopard/Projects/design-ax-brief
npx wrangler d1 create axbrief-subscribers
npx wrangler kv namespace create AUTH_TOKENS
```
Expected: each prints a binding block with a `database_id` / `id`. Copy those.

- [ ] **Step 2: Create `worker/schema.sql`**

```sql
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
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "axitdesign-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "wrangler dev",
    "db:init": "wrangler d1 execute axbrief-subscribers --local --file=worker/schema.sql"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "vitest": "^2.1.0",
    "wrangler": "^4.86.0"
  }
}
```

Run: `cd /Users/leopard/Projects/design-ax-brief && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Edit `wrangler.jsonc`**

Add these keys (keep existing `name`, `compatibility_date`, `compatibility_flags`, `observability`). Replace `<...>` with the ids from Step 1:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "axitdesign",
  "compatibility_date": "2026-07-07",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "main": "worker/index.js",
  "assets": {
    "directory": ".",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*", "/premium/*"]
  },
  "vars": { "BASE_URL": "https://axitdesign.simonksy.workers.dev" },
  "d1_databases": [
    { "binding": "DB", "database_name": "axbrief-subscribers", "database_id": "<D1_ID>" }
  ],
  "kv_namespaces": [
    { "binding": "AUTH_TOKENS", "id": "<KV_ID>" }
  ]
}
```

- [ ] **Step 5: Create `worker/index.js` (passthrough only for now)**

```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/premium/")) {
      return new Response("Forbidden", { status: 403 });
    }
    // /api/* handled in later tasks; everything else → static assets.
    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 6: Create `vitest.config.js`**

```js
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          kvNamespaces: ["AUTH_TOKENS"],
          bindings: {
            SESSION_SIGNING_KEY: "test-signing-key-1234567890",
            RESEND_API_KEY: "test-resend-key",
            BASE_URL: "http://localhost",
          },
        },
      },
    },
  },
});
```

- [ ] **Step 7: Create `worker/test/smoke.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";

beforeAll(async () => {
  for (const stmt of schema.split(";").map(s => s.trim()).filter(Boolean)) {
    await env.DB.exec(stmt.replace(/\s+/g, " "));
  }
});

async function call(path, init) {
  const req = new Request("http://localhost" + path, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("worker skeleton", () => {
  it("403s direct premium access", async () => {
    const res = await call("/premium/full.json");
    expect(res.status).toBe(403);
  });
});

export { call, schema };
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/leopard/Projects/design-ax-brief && npx vitest run`
Expected: 1 passing test (`403s direct premium access`).

- [ ] **Step 9: Add `.gitignore` entry and commit**

```bash
cd /Users/leopard/Projects/design-ax-brief
printf 'node_modules/\n.wrangler/\n' >> .gitignore
git add package.json package-lock.json vitest.config.js wrangler.jsonc worker/index.js worker/schema.sql worker/test/smoke.test.js .gitignore
git commit -m "feat(worker): scaffold gating worker + bindings + vitest harness"
```

---

## Task 3: Session + magic-link token primitives

**Files:**
- Create: `worker/lib/crypto.js`, `worker/lib/cookies.js`, `worker/lib/tokens.js`
- Create: `worker/test/crypto.test.js`, `worker/test/tokens.test.js`

**Interfaces:**
- Produces:
  - `crypto.js`: `async signSession(email: string, secret: string, ttlSec=2592000): Promise<string>`; `async verifySession(token: string, secret: string): Promise<{email:string}|null>` (null if bad sig or expired).
  - `cookies.js`: `parseCookies(header: string|null): Record<string,string>`; `sessionSetCookie(token: string): string`; `sessionClearCookie(): string`. Cookie name `ax_session`.
  - `tokens.js`: `async issueMagicToken(kv, email: string): Promise<string>`; `async consumeMagicToken(kv, token: string): Promise<string|null>`.

- [ ] **Step 1: Write failing tests for crypto**

Create `worker/test/crypto.test.js`:

```js
import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "../lib/crypto.js";

const KEY = "test-signing-key-1234567890";

describe("session crypto", () => {
  it("round-trips a signed session", async () => {
    const tok = await signSession("a@b.com", KEY);
    expect(await verifySession(tok, KEY)).toEqual({ email: "a@b.com" });
  });
  it("rejects a tampered payload", async () => {
    const tok = await signSession("a@b.com", KEY);
    const bad = "x" + tok.slice(1);
    expect(await verifySession(bad, KEY)).toBeNull();
  });
  it("rejects an expired session", async () => {
    const tok = await signSession("a@b.com", KEY, -1); // already expired
    expect(await verifySession(tok, KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run worker/test/crypto.test.js`
Expected: FAIL (cannot resolve `../lib/crypto.js`).

- [ ] **Step 3: Implement `worker/lib/crypto.js`**

```js
const enc = new TextEncoder();

function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncode(str) { return b64urlFromBytes(enc.encode(str)); }
function b64urlDecode(str) {
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return bin;
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlFromBytes(new Uint8Array(sig));
}

export async function signSession(email, secret, ttlSec = 2592000) {
  const payload = b64urlEncode(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = await hmac(payload, secret);
  return payload + "." + sig;
}

export async function verifySession(token, secret) {
  if (!token || token.indexOf(".") < 0) return null;
  const [payload, sig] = token.split(".");
  const expected = await hmac(payload, secret);
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: data.email };
  } catch { return null; }
}
```

- [ ] **Step 4: Run to verify crypto passes**

Run: `npx vitest run worker/test/crypto.test.js`
Expected: 3 passing.

- [ ] **Step 5: Write failing tests for tokens + cookies**

Create `worker/test/tokens.test.js`:

```js
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { issueMagicToken, consumeMagicToken } from "../lib/tokens.js";
import { parseCookies, sessionSetCookie } from "../lib/cookies.js";

describe("magic tokens", () => {
  it("issues then consumes once", async () => {
    const t = await issueMagicToken(env.AUTH_TOKENS, "a@b.com");
    expect(await consumeMagicToken(env.AUTH_TOKENS, t)).toBe("a@b.com");
    expect(await consumeMagicToken(env.AUTH_TOKENS, t)).toBeNull(); // single-use
  });
});

describe("cookies", () => {
  it("parses a cookie header", () => {
    expect(parseCookies("ax_session=abc; foo=bar").ax_session).toBe("abc");
  });
  it("builds an httpOnly set-cookie", () => {
    const c = sessionSetCookie("tok123");
    expect(c).toMatch(/ax_session=tok123/);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run worker/test/tokens.test.js`
Expected: FAIL (cannot resolve `../lib/tokens.js`).

- [ ] **Step 7: Implement `worker/lib/tokens.js` and `worker/lib/cookies.js`**

`worker/lib/tokens.js`:
```js
export async function issueMagicToken(kv, email) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await kv.put("ml:" + token, email, { expirationTtl: 900 });
  return token;
}
export async function consumeMagicToken(kv, token) {
  if (!token) return null;
  const email = await kv.get("ml:" + token);
  if (email) await kv.delete("ml:" + token);
  return email;
}
```

`worker/lib/cookies.js`:
```js
const NAME = "ax_session";
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
export function sessionSetCookie(token) {
  return `${NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}
export function sessionClearCookie() {
  return `${NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export const SESSION_COOKIE = NAME;
```

- [ ] **Step 8: Run to verify all pass**

Run: `npx vitest run worker/test/tokens.test.js worker/test/crypto.test.js`
Expected: all passing.

- [ ] **Step 9: Commit**

```bash
git add worker/lib/crypto.js worker/lib/cookies.js worker/lib/tokens.js worker/test/crypto.test.js worker/test/tokens.test.js
git commit -m "feat(worker): session crypto, magic-link tokens, cookie helpers"
```

---

## Task 4: Entitlement lookup + auth endpoints + `/api/me`

**Files:**
- Create: `worker/lib/entitlement.js`
- Modify: `worker/index.js` (add `/api/auth/request`, `/api/auth/callback`, `/api/auth/logout`, `/api/me`)
- Create: `worker/test/auth.test.js`

**Interfaces:**
- Consumes: `signSession/verifySession` (Task 3), `issueMagicToken/consumeMagicToken` (Task 3), `parseCookies/sessionSetCookie/sessionClearCookie/SESSION_COOKIE` (Task 3).
- Produces:
  - `entitlement.js`: `async getEntitlement(db, email): Promise<{entitled:boolean, status:string|null, periodEnd:number|null}>`.
  - Endpoints returning JSON. `/api/me` → `{ loggedIn, email|null, entitled }`.
  - Magic link sending is stubbed here (`env.__lastMagicLink` set in test mode); real Resend send lands in Task 6.

- [ ] **Step 1: Write failing tests**

Create `worker/test/auth.test.js`:

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";

beforeAll(async () => {
  for (const stmt of schema.split(";").map(s => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,?,?,?,?)"
  ).bind("paid@x.com", "active", null, "manual", now, now).run();
});

async function call(path, init) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("auth + entitlement", () => {
  it("me is logged-out by default", async () => {
    expect(await (await call("/api/me")).json()).toEqual({ loggedIn: false, email: null, entitled: false });
  });

  it("magic-link login yields an entitled session for an allowlisted email", async () => {
    const r1 = await call("/api/auth/request", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "paid@x.com" }),
    });
    expect((await r1.json()).ok).toBe(true);
    const link = env.__lastMagicLink;              // stub captures the URL
    const token = new URL(link).searchParams.get("token");
    const r2 = await call("/api/auth/callback?token=" + token);
    const cookie = r2.headers.get("set-cookie");
    expect(cookie).toMatch(/ax_session=/);
    const sess = cookie.split(";")[0].split("=")[1];
    const me = await (await call("/api/me", { headers: { cookie: "ax_session=" + sess } })).json();
    expect(me).toEqual({ loggedIn: true, email: "paid@x.com", entitled: true });
  });

  it("non-allowlisted email logs in but is not entitled", async () => {
    await call("/api/auth/request", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "free@x.com" }),
    });
    const token = new URL(env.__lastMagicLink).searchParams.get("token");
    const cookie = (await call("/api/auth/callback?token=" + token)).headers.get("set-cookie");
    const sess = cookie.split(";")[0].split("=")[1];
    const me = await (await call("/api/me", { headers: { cookie: "ax_session=" + sess } })).json();
    expect(me).toEqual({ loggedIn: true, email: "free@x.com", entitled: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run worker/test/auth.test.js`
Expected: FAIL (routes 404 / `env.__lastMagicLink` undefined).

- [ ] **Step 3: Implement `worker/lib/entitlement.js`**

```js
export async function getEntitlement(db, email) {
  const row = await db.prepare(
    "SELECT status, current_period_end FROM subscribers WHERE email = ?"
  ).bind(email).first();
  if (!row) return { entitled: false, status: null, periodEnd: null };
  const now = Math.floor(Date.now() / 1000);
  const active = row.status === "active" &&
    (row.current_period_end == null || row.current_period_end > now);
  return { entitled: active, status: row.status, periodEnd: row.current_period_end ?? null };
}
```

- [ ] **Step 4: Rewrite `worker/index.js` with the router**

```js
import { signSession, verifySession } from "./lib/crypto.js";
import { issueMagicToken, consumeMagicToken } from "./lib/tokens.js";
import { parseCookies, sessionSetCookie, sessionClearCookie, SESSION_COOKIE } from "./lib/cookies.js";
import { getEntitlement } from "./lib/entitlement.js";
import { sendMagicLink } from "./lib/email.js";

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...extra } });

async function currentEmail(request, env) {
  const cookie = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  const sess = await verifySession(cookie, env.SESSION_SIGNING_KEY);
  return sess ? sess.email : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p.startsWith("/premium/")) return new Response("Forbidden", { status: 403 });

    if (p === "/api/auth/request" && request.method === "POST") {
      let email = "";
      try { email = (await request.json()).email; } catch {}
      email = (email || "").trim().toLowerCase();
      if (email) {
        const token = await issueMagicToken(env.AUTH_TOKENS, email);
        const link = `${env.BASE_URL}/api/auth/callback?token=${token}`;
        await sendMagicLink(env, email, link);
      }
      return json({ ok: true }); // never reveal whether the email exists
    }

    if (p === "/api/auth/callback") {
      const token = url.searchParams.get("token");
      const email = await consumeMagicToken(env.AUTH_TOKENS, token);
      if (!email) return new Response("만료되었거나 이미 사용된 링크입니다. 다시 요청해 주세요.", { status: 400 });
      const session = await signSession(email, env.SESSION_SIGNING_KEY);
      return new Response(null, { status: 302, headers: { location: "/", "set-cookie": sessionSetCookie(session) } });
    }

    if (p === "/api/auth/logout" && request.method === "POST")
      return json({ ok: true }, 200, { "set-cookie": sessionClearCookie() });

    if (p === "/api/me") {
      const email = await currentEmail(request, env);
      if (!email) return json({ loggedIn: false, email: null, entitled: false });
      const ent = await getEntitlement(env.DB, email);
      return json({ loggedIn: true, email, entitled: ent.entitled });
    }

    // /api/premium/full lands in Task 5.
    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 5: Create a test-mode `worker/lib/email.js` stub**

(Real Resend send replaces the body in Task 6; the stub captures the link so tests can read it.)
```js
export async function sendMagicLink(env, email, link) {
  // Task 6 replaces this with a real Resend API call.
  env.__lastMagicLink = link; // test hook
}
```

- [ ] **Step 6: Run to verify all pass**

Run: `npx vitest run worker/test/auth.test.js`
Expected: 3 passing.

- [ ] **Step 7: Commit**

```bash
git add worker/index.js worker/lib/entitlement.js worker/lib/email.js worker/test/auth.test.js
git commit -m "feat(worker): magic-link auth, session, D1 entitlement, /api/me"
```

---

## Task 5: Premium gating — `/api/premium/full` (the crux)

**Files:**
- Modify: `worker/index.js` (add `/api/premium/full` before the ASSETS passthrough)
- Create: `worker/test/premium.test.js`

**Interfaces:**
- Consumes: `currentEmail` + `getEntitlement`. Reads premium content via `env.ASSETS.fetch("<BASE>/premium/full.json")` server-side (bypasses `run_worker_first`, so it is readable internally even though direct client hits are 403'd). The workers test pool serves this real on-disk file through `env.ASSETS`, so the test reads it directly — no fetch mock (a `fetchMock` would only intercept global `fetch`, never the ASSETS service binding).
- Produces: `GET /api/premium/full?section=&id=` → `{ full }` (200) when entitled; `402` `{reason}` otherwise; `404` if the key is absent.

**Precondition:** `premium/full.json` must exist on disk (produced by Task 1 `python3 pipeline/build_data.py`). The test imports it to pick a real `section/id` and to know the real deep-dive text, so the assertions stay hermetic without mocking the assets binding.

- [ ] **Step 1: Write failing tests**

Create `worker/test/premium.test.js`:

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import premiumMap from "../../premium/full.json"; // real build output (Task 1)
import { signSession } from "../lib/crypto.js";

const FIRST_KEY = Object.keys(premiumMap)[0];         // e.g. "design/agentface"
const [SECTION, ID] = FIRST_KEY.split("/");
const SECRET = premiumMap[FIRST_KEY].blocks[0].x;     // real deep-dive text to check for leaks

beforeAll(async () => {
  for (const stmt of schema.split(";").map(s => s.trim()).filter(Boolean))
    await env.DB.exec(stmt.replace(/\s+/g, " "));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO subscribers (email,status,current_period_end,provider,created_at,updated_at) VALUES (?,?,?,?,?,?)"
  ).bind("paid@x.com", "active", null, "manual", now, now).run();
});

async function call(path, init) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function paidCookie() {
  return "ax_session=" + (await signSession("paid@x.com", env.SESSION_SIGNING_KEY));
}

describe("premium gating", () => {
  it("direct /premium/* is 403 and never returns the deep dive", async () => {
    const res = await call("/premium/full.json");
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(SECRET);
  });

  it("402 for a logged-out user, body has no deep dive", async () => {
    const res = await call(`/api/premium/full?section=${SECTION}&id=${ID}`);
    expect(res.status).toBe(402);
    expect(await res.text()).not.toContain(SECRET);
  });

  it("200 with the deep dive for an entitled user", async () => {
    const res = await call(`/api/premium/full?section=${SECTION}&id=${ID}`, { headers: { cookie: await paidCookie() } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.full.blocks)).toBe(true);
    expect(body.full.blocks.length).toBeGreaterThan(0);
    expect(body.full.blocks[0].x).toBe(SECRET);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/leopard/Projects/design-ax-brief/pipeline && python3 build_data.py && cd .. && npx vitest run worker/test/premium.test.js`
Expected: FAIL (402/403 tests pass trivially, but the entitled 200 test fails — route not implemented, so it falls through to ASSETS and does not return `{full}`).

- [ ] **Step 3: Add the `/api/premium/full` route to `worker/index.js`**

Insert immediately before the final `return env.ASSETS.fetch(request);`:

```js
    if (p === "/api/premium/full") {
      const email = await currentEmail(request, env);
      if (!email) return json({ reason: "login_required" }, 402);
      const ent = await getEntitlement(env.DB, email);
      if (!ent.entitled) return json({ reason: "subscription_required" }, 402);
      const section = url.searchParams.get("section");
      const id = url.searchParams.get("id");
      const res = await env.ASSETS.fetch(new URL("/premium/full.json", env.BASE_URL));
      if (!res.ok) return json({ reason: "unavailable" }, 503);
      const map = await res.json();
      const full = map[`${section}/${id}`];
      if (!full) return json({ reason: "not_found" }, 404);
      return json({ full });
    }
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run worker/test/premium.test.js`
Expected: 3 passing.

- [ ] **Step 5: Full local end-to-end with `wrangler dev`**

```bash
cd /Users/leopard/Projects/design-ax-brief
npm run db:init                       # apply schema to local D1
npx wrangler d1 execute axbrief-subscribers --local \
  --command "INSERT OR REPLACE INTO subscribers (email,status,provider,created_at,updated_at) VALUES ('me@test.com','active','manual',0,0);"
npx wrangler dev &                    # starts on http://localhost:8787
sleep 4
curl -si "http://localhost:8787/premium/full.json" | head -1              # expect 403
curl -si "http://localhost:8787/api/premium/full?section=design&id=agentface" | head -1  # expect 402
kill %1
```
Expected: `HTTP/1.1 403` then `HTTP/1.1 402`. (Full 200 path requires a session cookie — covered by vitest.)

- [ ] **Step 6: Commit**

```bash
git add worker/index.js worker/test/premium.test.js
git commit -m "feat(worker): gate full deep-dive behind entitlement (/api/premium/full)"
```

---

## Task 6: Real Resend magic-link email

**Files:**
- Modify: `worker/lib/email.js`
- Create: `worker/test/email.test.js`

**Interfaces:**
- Consumes: `env.RESEND_API_KEY`, `env.BASE_URL`.
- Produces: `sendMagicLink(env, email, link)` POSTs to the Resend API; retains the `env.__lastMagicLink` hook when `RESEND_API_KEY` is the test placeholder so existing tests keep working.

- [ ] **Step 1: Write failing test**

Create `worker/test/email.test.js`:

```js
import { env, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { sendMagicLink } from "../lib/email.js";

describe("sendMagicLink", () => {
  it("posts to Resend when a real key is set", async () => {
    const realEnv = { ...env, RESEND_API_KEY: "re_live_key" };
    fetchMock.activate(); fetchMock.disableNetConnect();
    let seen = null;
    fetchMock.get("https://api.resend.com").intercept({ path: "/emails", method: "POST" })
      .reply(200, (opts) => { seen = JSON.parse(opts.body); return JSON.stringify({ id: "x" }); });
    await sendMagicLink(realEnv, "a@b.com", "http://localhost/api/auth/callback?token=t");
    expect(seen.to).toContain("a@b.com");
    expect(JSON.stringify(seen)).toContain("callback?token=t");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run worker/test/email.test.js`
Expected: FAIL (stub does not call fetch).

- [ ] **Step 3: Implement real send in `worker/lib/email.js`**

```js
export async function sendMagicLink(env, email, link) {
  // Test mode: no real key → just capture for assertions (keeps auth tests hermetic).
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "test-resend-key") {
    env.__lastMagicLink = link;
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "Design AX Brief <onboarding@resend.dev>", // Task 8: swap to a verified domain sender
      to: [email],
      subject: "Design AX Brief 로그인 링크",
      html: `<p>아래 링크로 로그인하세요 (15분 내 유효):</p>
             <p><a href="${link}">Design AX Brief 로그인 →</a></p>`,
    }),
  });
  if (!res.ok) throw new Error("resend_failed_" + res.status);
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run`
Expected: all suites pass (crypto, tokens, auth, premium, email, smoke).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/email.js worker/test/email.test.js
git commit -m "feat(worker): send magic-link via Resend"
```

---

## Task 7: Frontend — entitlement context, paywall, login modal

**Files:**
- Modify: `axbrief-app.jsx` (entitlement fetch on mount; paywall + login modal; premium lazy-fetch in the full view around lines 500-566)

**Interfaces:**
- Consumes: `GET /api/me`, `GET /api/premium/full?section=&id=`, `POST /api/auth/request`.
- The public JS now gives each card `hasFull: boolean` and NO `full`. The full view must: if `!card.hasFull` → existing no-deep-dive behavior; if `card.hasFull` and entitled → fetch premium and render blocks; if `card.hasFull` and not entitled → paywall.

- [ ] **Step 1: Add an entitlement fetch near app init**

Find the top-level app component (the one that reads `window.AX_SECTIONS`). Add, inside it:

```jsx
const [auth, setAuth] = React.useState({ loggedIn: false, entitled: false, email: null });
React.useEffect(() => {
  fetch("/api/me", { credentials: "same-origin" })
    .then(r => r.json()).then(setAuth).catch(() => {});
}, []);
```

Thread `auth` (and `section` id) down to the full-view component via props.

- [ ] **Step 2: Add a login modal component**

Add near the other small components (e.g. after `AxPill`, ~line 400):

```jsx
function LoginModal({ onClose, t }) {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const submit = async () => {
    await fetch("/api/auth/request", {
      method: "POST", headers: { "content-type": "application/json" },
      credentials: "same-origin", body: JSON.stringify({ email }),
    });
    setSent(true);
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16,
        padding: 24, width: 320, maxWidth: "88vw", fontFamily: "Pretendard, system-ui" }}>
        {sent ? (
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6 }}>
            메일함을 확인하세요. 로그인 링크를 보냈습니다 (15분 내 유효).
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>구독자 로그인</p>
            <input type="email" value={email} placeholder="you@example.com"
              onChange={e => setEmail(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10,
                border: "1px solid #ddd", fontSize: 14, marginBottom: 12 }} />
            <AxPill label="로그인 링크 받기" onClick={submit} t={t} />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the full-view gating logic (around lines 500-566)**

At the full-view component (`const full = item.full || { blocks: [] }`), change to fetch premium when entitled and gate otherwise. Replace the `hasFull`/`if (!hasFull)` block near line 564 with:

```jsx
// item.hasFull comes from the public build; item.full is fetched on demand.
const [full, setFull] = React.useState(item.full || null);
const [showLogin, setShowLogin] = React.useState(false);
React.useEffect(() => {
  if (item.hasFull && !full && auth.entitled) {
    fetch(`/api/premium/full?section=${section}&id=${item.id}`, { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null).then(d => d && setFull(d.full)).catch(() => {});
  }
}, [item.id, auth.entitled]);

if (!item.hasFull) {
  /* keep the existing "no deep-dive" branch body here verbatim */
}
if (item.hasFull && !auth.entitled) {
  return (
    <div className="ax-full ax-body" style={{ color: t.body, padding: 26 }}>
      <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>심층 분석은 구독자 전용입니다</p>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: t.faint, margin: "0 0 16px" }}>
        유료 구독 시 이 기사의 전체 번역·심층 분석을 읽을 수 있습니다.
      </p>
      <AxPill label={auth.loggedIn ? "구독하기" : "로그인 / 구독"} t={t}
        onClick={() => auth.loggedIn ? (window.location.href = "/#subscribe") : setShowLogin(true)} />
      {showLogin && <LoginModal t={t} onClose={() => setShowLogin(false)} />}
    </div>
  );
}
const blocks = (full && full.blocks) || [];
// ...existing block-rendering JSX continues, now driven by the fetched `full`...
```

(Where the old code referenced `item.full`, use the local `full` state. Preserve the existing block-rendering markup below this point.)

- [ ] **Step 4: Manual verification with `wrangler dev`**

```bash
cd /Users/leopard/Projects/design-ax-brief
cd pipeline && python3 build_data.py && cd ..   # ensure hasFull + premium/full.json exist
npx wrangler dev
```
In a browser at `http://localhost:8787`:
1. Open a card's deep-dive → **paywall** ("심층 분석은 구독자 전용입니다") appears (logged out).
2. Click "로그인 / 구독" → modal → enter your allowlisted email → check the `wrangler dev` console for the magic link (test key path logs it) → visit the callback URL → reload.
3. `/api/me` now returns `entitled:true`; open the deep-dive → real blocks render.
4. DevTools Network: confirm `axbrief-data.js` has NO `full`; deep-dive text arrives only from `/api/premium/full`.

- [ ] **Step 5: Commit**

```bash
git add axbrief-app.jsx
git commit -m "feat(app): paywall + magic-link login + on-demand premium fetch"
```

---

## Task 8: Merge, deploy, prod smoke test, memory update

**Files:**
- Modify: `MEMORY.md` + a new memory file; verify `wrangler.jsonc` prod ids.

- [ ] **Step 1: Set production secrets and D1 schema**

```bash
cd /Users/leopard/Projects/design-ax-brief
printf '%s' "$(openssl rand -hex 32)" | npx wrangler secret put SESSION_SIGNING_KEY
npx wrangler secret put RESEND_API_KEY        # paste your Resend key
npx wrangler d1 execute axbrief-subscribers --remote --file=worker/schema.sql
npx wrangler d1 execute axbrief-subscribers --remote \
  --command "INSERT OR REPLACE INTO subscribers (email,status,provider,created_at,updated_at) VALUES ('YOUR_TEST_EMAIL','active','manual',0,0);"
```

- [ ] **Step 2: Full test suite green before merge**

Run: `npx vitest run && python3 pipeline/tests/test_split_full.py`
Expected: all worker suites pass + `PASS test_split_full`.

- [ ] **Step 3: Merge the feature branch to main and push**

```bash
git checkout main
git merge --no-ff <feature-branch> -m "feat: paid subscription paywall Phase 1"
git push origin main
```

- [ ] **Step 4: Deploy (respects deploy truth)**

Run: `bash pipeline/deploy.sh`
Expected: `OK: '...workers-autoconfig' synced with main and pushed → Cloudflare Workers build triggered.`

- [ ] **Step 5: Production smoke test**

Wait ~60-120s, then:
```bash
BASE=https://axitdesign.simonksy.workers.dev
curl -si "$BASE/premium/full.json" | head -1                                   # expect 403
curl -si "$BASE/api/premium/full?section=design&id=agentface" | head -1        # expect 402
curl -s "$BASE/axbrief-data.js" | grep -c '"hasFull"'                          # expect > 0
curl -s "$BASE/axbrief-data.js" | grep -c '"full"'                            # expect 0 (ignoring hasFull)
curl -s "$BASE/api/me"                                                         # expect {"loggedIn":false,...}
```
Expected: 403, 402, hasFull>0, no leaked `full`, logged-out `/api/me`. Then do a manual browser login with your allowlisted email and confirm the deep-dive renders.

- [ ] **Step 6: Update memory**

Create `/Users/leopard/.claude/projects/-Users-leopard-Projects-design-ax-brief/memory/paywall-phase1.md` describing: the Worker now fronts the static site; `full` is split into `premium/full.json` and served only via `/api/premium/full`; magic-link + D1 allowlist; how to add a subscriber (`wrangler d1 execute ... INSERT`); secrets `SESSION_SIGNING_KEY`/`RESEND_API_KEY`; and that the daily 08:00 build now emits `premium/full.json` (build change is compatible). Add a one-line pointer in `MEMORY.md`. Link `[[deploy-truth-main-branch]]`, `[[daily-news-autopublish-cron]]`.

- [ ] **Step 7: Verify the daily automation still builds**

Confirm `pipeline/build_data.py` runs clean inside the normal pipeline (the 08:00 job calls it). Optionally trigger a dry local build: `cd pipeline && python3 build_data.py` → `axbrief-data.js` + `premium/full.json` regenerate with no error.

---

## Self-Review Notes

- **Spec §3 (data split)** → Task 1. **§4 (Worker API)** → Tasks 4-5. **§5 (stores)** → Task 2 (D1/KV/secrets). **§6 (adapters)** → interfaces established (`getEntitlement` is provider-agnostic; `sendMagicLink` separate from future `Notifier`); concrete payment/kakao adapters are explicitly Phase 2-4. **§7 (frontend)** → Task 7. **§8 (deploy)** → Tasks 2 + 8. **§9 (pipeline)** → Task 1 + Task 8 step 7. **§10 (edge cases)** → covered: expired/reused token (Task 4 callback 400), direct premium 403 + 402 no-leak (Task 5), premium unavailable 503 (Task 5), forged session → null (Task 3). **§11 (tests)** → Tasks 1,3,4,5,6.
- **Open item resolved:** premium serving = static asset under `run_worker_first` + internal `env.ASSETS.fetch`; no R2.
- **Type consistency:** `getEntitlement` returns `{entitled,status,periodEnd}` used in Tasks 4-5; premium key `"<section>/<id>"` consistent across build, API, frontend; cookie name `ax_session` consistent (crypto/cookies/tests).
- **Deferred to Phase 2+ (not gaps):** payment webhook, `Notifier`/email digest broadcast, Kakao, domestic PG, pricing UI.
