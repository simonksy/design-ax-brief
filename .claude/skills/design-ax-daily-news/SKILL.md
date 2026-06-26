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

**Per-section quota: aim for 3–5 cards.** Target a floor of 3, cap of 5. If a section
has fewer than 3 fresh, non-duplicate items, publish what exists and note the shortfall
— never pad with stale or off-topic items.

Run STRICTLY in order within each section, and after each agent verify its artifact
exists and is non-empty before the next. Intermediate artifacts are written per section
(e.g. `pipeline/keywords.json`, `candidates.json`, … are reused per section — archive
each section's set under `pipeline/runs/<date>/<section>/`).

**Step 0 — keywords (ask the user once).** Before running, ask in Korean 존댓말 for any
extra search keywords and which sections to run today (default: all 5). State defaults
come from `pipeline/keyword_pool.json` (section-keyed pools). Pass user keywords to
ax-planner as extra seeds for the relevant section(s).

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

Freshness: flat **72h** window (every day) via `pipeline/freshness.py`. Dedup is **per
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
