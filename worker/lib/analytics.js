/* First-party funnel analytics — no cookies, no third-party script, no PII.
 *
 * Why this exists: AdSense reports revenue, not behaviour. To decide where to spend
 * marketing effort we need the FUNNEL — which section a reader lands on, whether the
 * free card holds them, whether the paywall gets tapped, whether they click through
 * to checkout. Those are first-party questions about our own page, so they are
 * answered by our own Worker + D1 rather than by renting a third party.
 *
 * Privacy model: `visitor` is SHA-256(UTC-day + IP + user-agent + signing key)
 * truncated to 16 hex chars. It distinguishes devices WITHIN a single UTC day, which
 * is all a funnel needs, and is unjoinable across days and irreversible back to a
 * person. No cookie is set, so no consent banner is required for it.
 */

/* Event names are allowlisted so a stray or hostile caller cannot fill the table
 * with junk cardinality. Adding a funnel step means adding it here on purpose. */
export const EVENTS = new Set([
  "page_view",      // app booted
  "section_view",   // a section tab became active
  "card_view",      // a card became the active hero slide
  "card_read",      // the flip-to-article ("Read") was opened
  "paywall_view",   // a locked card was rendered to a non-entitled reader
  "subscribe_open", // the subscribe modal opened
  "subscribe_click",// the Patreon checkout button was clicked
  "login_click",    // "Patreon으로 로그인" was clicked
  "share_click",    // a card link was copied/shared
]);

const MAX_BATCH = 20;

const clip = (v, n) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, n) : null;
};

/** Referrer reduced to its host — the acquisition channel, without the path that
 *  could carry a query string or identify an individual page a reader came from. */
export function refHost(referer, selfHost) {
  if (!referer) return null;
  let host;
  try { host = new URL(referer).host; } catch { return null; }
  if (!host || host === selfHost) return null;         // internal navigation is not a referral
  return host.replace(/^www\./, "").slice(0, 80);
}

export function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Daily-rotating pseudonymous device id. Falls back to a random id when the
 *  request carries no IP (so a missing header can never collapse every visitor
 *  onto one shared bucket and silently overstate returning traffic). */
export async function visitorId(request, env, day) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (!ip) return "anon-" + crypto.randomUUID().slice(0, 11);
  const ua = request.headers.get("user-agent") || "";
  const material = `${day}|${ip}|${ua}|${env.SESSION_SIGNING_KEY || ""}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Normalise a client-sent batch into rows. Unknown event names are dropped rather
 *  than failing the whole batch — a stale cached client must not start erroring. */
export function normalize(body, { ts, day, visitor, ref, country, entitled }) {
  const raw = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [body];
  const rows = [];
  for (const e of raw.slice(0, MAX_BATCH)) {
    const name = clip(e?.name, 32);
    if (!name || !EVENTS.has(name)) continue;
    rows.push({
      ts, day, name,
      section: clip(e?.section, 24),
      card_id: clip(e?.cardId ?? e?.card_id, 96),
      variant: clip(e?.variant, 16),
      ref, country,
      visitor,
      entitled: entitled ? 1 : 0,
    });
  }
  return rows;
}

export async function insertEvents(db, rows) {
  if (!rows.length) return 0;
  const stmt = db.prepare(
    "INSERT INTO events (ts,day,name,section,card_id,variant,ref,country,visitor,entitled) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  await db.batch(rows.map((r) =>
    stmt.bind(r.ts, r.day, r.name, r.section, r.card_id, r.variant, r.ref, r.country, r.visitor, r.entitled)));
  return rows.length;
}

/** The funnel, as counts of DISTINCT visitors per step — not raw hits. One reader
 *  bouncing off the paywall five times is one blocked reader, not five. */
export async function funnel(db, days) {
  const since = utcDay(Date.now() - days * 86400000);
  const { results } = await db.prepare(
    `SELECT name, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS hits
       FROM events WHERE day >= ? GROUP BY name`
  ).bind(since).all();
  const by = Object.fromEntries((results || []).map((r) => [r.name, r]));
  const step = (n) => ({ visitors: by[n]?.visitors || 0, hits: by[n]?.hits || 0 });
  const f = {
    page_view: step("page_view"),
    paywall_view: step("paywall_view"),
    subscribe_open: step("subscribe_open"),
    subscribe_click: step("subscribe_click"),
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    since,
    steps: f,
    rates: {
      paywall_reach: pct(f.paywall_view.visitors, f.page_view.visitors),
      modal_open: pct(f.subscribe_open.visitors, f.paywall_view.visitors),
      checkout_click: pct(f.subscribe_click.visitors, f.subscribe_open.visitors),
      overall: pct(f.subscribe_click.visitors, f.page_view.visitors),
    },
    // Everything after this point is invisible: the Patreon checkout opens in a new
    // tab and no payment webhook reports back, so click→paid cannot be measured yet.
    blind_spot: "subscribe_click → paid (no Patreon webhook wired)",
  };
}

export async function bySection(db, days) {
  const since = utcDay(Date.now() - days * 86400000);
  const { results } = await db.prepare(
    `SELECT section, name, COUNT(DISTINCT visitor) AS visitors
       FROM events WHERE day >= ? AND section IS NOT NULL
       GROUP BY section, name ORDER BY section`
  ).bind(since).all();
  const out = {};
  for (const r of results || []) (out[r.section] ||= {})[r.name] = r.visitors;
  return out;
}

export async function daily(db, days) {
  const since = utcDay(Date.now() - days * 86400000);
  const { results } = await db.prepare(
    `SELECT day, name, COUNT(DISTINCT visitor) AS visitors
       FROM events WHERE day >= ? GROUP BY day, name ORDER BY day`
  ).bind(since).all();
  const out = {};
  for (const r of results || []) (out[r.day] ||= {})[r.name] = r.visitors;
  return out;
}

export async function referrers(db, days, limit = 20) {
  const since = utcDay(Date.now() - days * 86400000);
  const { results } = await db.prepare(
    `SELECT ref, COUNT(DISTINCT visitor) AS visitors
       FROM events WHERE day >= ? AND name = 'page_view' AND ref IS NOT NULL
       GROUP BY ref ORDER BY visitors DESC LIMIT ?`
  ).bind(since, limit).all();
  return results || [];
}
