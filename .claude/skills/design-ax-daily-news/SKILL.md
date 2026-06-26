---
name: design-ax-daily-news
description: Run the multi-section Design AX daily news pipeline — collect, curate, write, illustrate, and publish 3–5 fresh AI×domain cards per section (Design, Music, Movies, Games, Books) into the Design AX Brief page.
---

Generate today's Design AX Brief by running the pipeline **once per section** from the
repo root `/Users/leopard/Projects/design-ax-brief`. Determine `now_iso` = current UTC
time; `date` = its calendar date.

**Sections** come from `pipeline/sources.json` → `sections` (each maps to one or more
source categories): `design` (AI×design tools/work culture), `music` (AI×Music),
`movies` (AI×Film), `games` (AI×Video Games), `books` (AI×Books/Publishing). AI is the
constant axis; each section pairs AI with its domain.

**Per-section quota: fill 5 (floor 3).** Target **5** candidates/cards per section, with
3 as the floor. To hit the count, ax-librarian must EXPAND the search when a section's
fresh+deduped pool is short (see "Fill the count" below) — do not stop at the first
keyword pass. Only publish fewer than the target if the section genuinely has no more
fresh, non-duplicate, on-topic items after expansion — and then note the shortfall.
Never pad with stale or off-topic items.

**Freshness window is per-section** (`pipeline/freshness.py <pub_iso> <now_iso> <section>`):
`design` = **72h**; `music` / `movies` / `games` / `books` = **14 days (336h)** — those
domains publish AI news less often, so a wider window is needed to fill 5.

**Fill the count (keyword expansion).** If, after the first keyword pass + freshness +
dedup, a section has fewer than 5 candidates, ax-librarian EXPANDS: add related/sibling
keywords (synonyms, named products/vendors, adjacent sub-topics, Korean equivalents) and
widen to more of that section's `allowed_domains`, re-search, and keep going until the
section reaches 5 fresh non-duplicate candidates or the topic is genuinely exhausted.
Report what was added when expansion was used.

Run STRICTLY in order within each section, and after each agent verify its artifact
exists and is non-empty before the next. Intermediate artifacts are written per section
(e.g. `pipeline/keywords.json`, `candidates.json`, … are reused per section — archive
each section's set under `pipeline/runs/<date>/<section>/`).

**Daily operation (two phases).** A scheduled job runs every morning ~08:00 KST and
executes only the COLLECTION phase (Steps 1–3 per section, with keyword expansion to
fill 5) — it stops at the candidate list and notifies the user; it must NOT auto-select
or publish. When the user starts their session they review each section's candidates,
make the **user selection** (Step 4), and the pipeline finishes Steps 5–10 and auto-
publishes. So: **AI collects candidates overnight; the human picks; the site publishes.**
ax-curator auto-picks ONLY if the user explicitly defers a section ("알아서").

**Step 0 — keywords (ask the user once; skip in the scheduled collection run).** Ask in
Korean 존댓말 for any extra search keywords and which sections to run today (default: all
5). Defaults come from `pipeline/keyword_pool.json` (section-keyed pools). Pass user
keywords to ax-planner as extra seeds for the relevant section(s).

For EACH selected section S (default order design, music, movies, games, books):
1. **ax-planner** — "Section: S. Today is <date>. Extra seeds: <…/none>. Run your steps."
   (reads `keyword_pool.json.sections[S]` — always its `core`, rotates the rest by date.)
   → `pipeline/keywords.json`
2. **ax-librarian** — "Section: S. now_iso = <now_iso>. Run your steps." Searches ONLY
   the `allowed_domains` of S's categories (from sources.json). WIDE funnel (~16–28),
   ≤3 per outlet, freshness-gated (72h). → `pipeline/candidates.json`
3. **DEDUP PRE-FILTER** — `python3 pipeline/dedup_candidates.py --section S` → drops URLs
   already published in S's last 5 days → `pipeline/candidates_filtered.json`. Then set
   aside content-level dupes within S.
4. **DECISION GATE** — present S's de-duplicated candidates to the user (numbered: source,
   category, date, headline, URL), state how many were dropped, and ask in Korean 존댓말
   which to publish (3–5). If the user defers ("알아서"), ax-curator picks. (You may batch
   all sections' gates together, or run section by section — keep it to one prompt per
   section at most.)
5. **ax-curator** — "Section: S. Run your steps. User selection: <…/none — you choose>."
   Re-applies URL+CONTENT dedup vs S's history (backstop, even on hand-picks).
   → `pipeline/selected.json`
6. **ax-writer** — "Run your steps." → `pipeline/cards.json` (Korean copy)
7. **ax-media** — "Run your steps." → `pipeline/media.json` + downloaded media
8. **roll S** — `python3 pipeline/roll.py --section S --data pipeline/news_data.json --cards pipeline/cards.json --media pipeline/media.json` (moves S's previous `today` into S's deck, trims to 5, sets S's new `today`). Archive the section's JSONs to `pipeline/runs/<date>/<section>/`.

After ALL sections are rolled:
9. **build once** — `python3 pipeline/build_data.py --in pipeline/news_data.json --out axbrief-data.js` → emits `window.AX_SECTIONS` (+ back-compat `AX_NEWS`/`AX_DAYS` = design). `node --check axbrief-data.js`; restore the per-run backup on failure.
10. **verify render over HTTP** (not file://). Serve `python3 -m http.server 8765` and confirm the small app's section TABS switch the hero deck per section. Screenshot → `pipeline/runs/<date>/render.png`.

Freshness: **per-section** window via `pipeline/freshness.py <pub> <now> <section>`
(design 72h; music/movies/games/books 14 days). Dedup is **per
section** (URL + CONTENT): each distinct story appears on exactly one date within its
section (earliest-wins) — `roll.py` drops rolled-in URLs already earlier in that section;
`build_data.py` FAILS the build on a duplicate URL within a section (WARNS on shared
thumbnail). Drop general AI-business noise (funding, compute, layoffs, exec moves) unless
the user explicitly relaxes criteria for a thin day.

After publishing, post to chat in Korean 존댓말, short: per section "S: N장" with the
chosen headlines linked to source URLs; note any section below 3. Then give BOTH preview
URLs (small carousel now has the section tabs; large card still shows Design only until
it becomes section-aware):
- small/carousel: `http://localhost:8765/Design%20AX%20Brief.html` (or `/` · live: axitdesign.simonksy.workers.dev)
- large card: `http://localhost:8765/Design%20AX%20Brief%20(Large%20Card).html`
