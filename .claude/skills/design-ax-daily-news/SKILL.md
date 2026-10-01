---
name: design-ax-daily-news
description: Run the multi-section Design AX daily news pipeline — collect, curate, write, illustrate, and publish 3–5 fresh AI×domain cards per section (Design, Music, Movies, Games, Books, Gadgets, Science, Politics) into the Design AX Brief page.
---

Generate today's Design AX Brief by running the pipeline **once per section** from the
repo root `/Users/simonksy/Projects/design-ax-brief`. Determine `now_iso` = current UTC
time; `date` = its calendar date.

**Sections** come from `pipeline/sources.json` → `sections` (each maps to one or more
source categories): `design` (AI×design tools/work culture), `music` (AI×Music),
`movies` (AI×Film), `games` (AI×Video Games), `books` (AI×Books/Publishing), `gadgets`
(AI×devices/hardware — AI wearables, on-device AI, smart glasses, robots, NPU PCs),
`science` (AI×research — psychology, life/materials science, physics, quantum, astronomy),
`politics` (AI×politics on three axes: **policy/regulation**, **AI in elections & public
opinion**, **AI geopolitics**). AI is the constant axis; each section pairs AI with its
domain.

**Politics is scoped and non-partisan.** Take only stories where AI is what makes the
story happen — if deleting AI from the headline leaves it standing, it is general
political news and does not belong. Report what was decided, filed or published and what
it changes for people who build with AI: no partisan framing, no endorsement or criticism
of parties or candidates, no horse-race or polling commentary; attribute contested claims
to the named party rather than asserting them, and prefer the primary document (bill text,
ruling, agency release) over commentary about it. Full rules live in `sources.json` →
`categories[politics]._note`.

**Per-section quota: fill 5 (floor 3).** Target **5** candidates/cards per section, with
3 as the floor. To hit the count, ax-librarian must EXPAND the search when a section's
fresh+deduped pool is short (see "Fill the count" below) — do not stop at the first
keyword pass. Only publish fewer than the target if the section genuinely has no more
fresh, non-duplicate, on-topic items after expansion — and then note the shortfall.
Never pad with stale or off-topic items.

**Freshness window is per-section** (`pipeline/freshness.py <pub_iso> <now_iso> <section>`):
`design` / `politics` = **72h** — both beats move fast and are dense, and a two-week-old
ruling or export-control decision is already stale. `music` / `movies` / `games` / `books`
/ `gadgets` / `science` = **14 days (336h)** — those domains publish AI news less often, so
a wider window is needed to fill 5.

**Fill the count (keyword expansion).** If, after the first keyword pass + freshness +
dedup, a section has fewer than 5 candidates, ax-librarian EXPANDS: add related/sibling
keywords (synonyms, named products/vendors, adjacent sub-topics, Korean equivalents) and
widen to more of that section's `allowed_domains`, re-search, and keep going until the
section reaches 5 fresh non-duplicate candidates or the topic is genuinely exhausted.
Report what was added when expansion was used.

**Recovery-pass cap (runtime guard).** After curation, sections still under floor may get
a RECOVERY collection pass — but at most **2 recovery passes per run**, spent on the most
deficient sections first. A recovery pass must NOT repeat already-used keywords: expand
into related/adjacent terms (synonyms, parent/child topics, adjacent tools, people, event
names). Sections still under floor after the cap ship as-is, flagged in the final report.

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
8). Defaults come from `pipeline/keyword_pool.json` (section-keyed pools). Pass user
keywords to ax-planner as extra seeds for the relevant section(s).

For EACH selected section S (default order design, music, movies, games, books, gadgets,
science, politics):
1. **ax-planner** — "Section: S. Today is <date>. Extra seeds: <…/none>. Run your steps."
   (reads `keyword_pool.json.sections[S]` — always its `core`, rotates the rest by date.)
   → `pipeline/keywords.json`
2. **ax-librarian** — "Section: S. now_iso = <now_iso>. Run your steps." Searches ONLY
   the `allowed_domains` of S's categories (from sources.json). WIDE funnel (~16–28),
   ≤3 per outlet, freshness-gated (S's per-section window). → `pipeline/candidates.json`
3. **DEDUP PRE-FILTER** (run from `pipeline/`) —
   a. URL: `python3 dedup_candidates.py --section S --candidates candidates_S.json --out candidates_filtered_S.json`
      → drops URLs ever published in S (permanent ledger `published_urls.json` + news_data).
   b. STORY: `python3 story_dedup.py annotate --section S` (edits `candidates_filtered_S.json`
      in place) → drops near-verbatim repeats of S's last 30 days (`story_ledger.json`),
      tags look-alikes (`history_match`) and same-day same-story groups (`cluster`), and
      attaches `history_digest` (30 days) for the curator's content check.
4. **DECISION GATE** — present S's de-duplicated candidates to the user (numbered: source,
   category, date, headline, URL), state how many were dropped, and ask in Korean 존댓말
   which to publish (3–5). If the user defers ("알아서"), ax-curator picks. (You may batch
   all sections' gates together, or run section by section — keep it to one prompt per
   section at most.)
5. **ax-curator** — "Section: S. Run your steps. User selection: <…/none — you choose>."
   Re-applies URL+CONTENT dedup vs S's history (backstop, even on hand-picks).
   → `pipeline/selected.json`
6. **ax-writer** — "Run your steps." → `pipeline/cards.json` — writes card copy in the
   source article's language (+ `source_lang`).
6b. **full article + fact-check (REQUIRED for every card).** For each selected card,
   build `card.full` = the source article in its own original language (`source_lang`)
   as a structure-mirroring summary for the flip-back view — do NOT translate it here:
   `full = { "mode":"full"|"summary", "blocks":[ {"t":"p","x":"source-language text"} | {"t":"img","src":"abs-url","cap"} | {"t":"video","yt":"id"|"src":"mp4"} ] }`.
   Fetch the article, mirror its body in `source_lang` preserving order, and INTERLEAVE its
   in-body images + any embedded videos (YouTube → `yt` id; mp4 → `src`). Cap to a fixed
   box: ≤ ~1600 characters, ≤ 4 images, ≤ 1 video — if the whole mirror fits, `mode:"full"`;
   if longer, write a same-language summary that fits and set `mode:"summary"`.
   YouTube cards lead with the video block. Fact-check against the source IN THE SAME
   LANGUAGE (no translation step in between to hide a slip behind) — patch any
   headline/body that contradicts the source before rolling. Content fidelity is
   absolute (facts/numbers/quotes/names unchanged).
6c. **translate (no API — subagents)** —
   `python3 pipeline/translate.py jobs --cards pipeline/cards_S.json --out pipeline/jobs_S.json`
   → dispatch **ax-translator** with JOBS=`pipeline/jobs_S.json`, ANSWERS=`pipeline/answers_S.json`
   → `python3 pipeline/translate.py apply --jobs pipeline/jobs_S.json --answers pipeline/answers_S.json`
   Exit 10 = some answers failed the checks: dispatch ax-translator again on
   `pipeline/jobs_S.retry.json` (ANSWERS=`pipeline/answers_S.retry.json`) and apply that; at
   most 2 retry passes — whatever still fails is recorded as fallback (`i18n_status`) and
   publishes with the label. Then humanize **only `text.ko`** with the humanize-korean
   skill (facts byte-identical) and run
   `python3 pipeline/translate.py check pipeline/cards_S.json` — this re-validates every
   language against its source and syncs the top-level fields to `text.ko`.
7. **ax-media** — "Run your steps." → `pipeline/media.json` + downloaded media
8. **roll S** — `python3 pipeline/roll.py --section S --data pipeline/news_data.json --cards pipeline/cards_S.json --media pipeline/media_S.json` (moves S's previous `today` into S's deck, trims to 5, sets S's new `today`). Archive the section's JSONs to `pipeline/runs/<date>/<section>/`.
   **Story gate:** roll.py first runs `story_dedup.py verify` on `selected_S.json` (next to
   the cards file) and refuses to roll if any card is not a curated pick, a pick lacks its
   `dedup.checks` verdict, a pick repeats S's 30-day history, or two picks are one story.
   **Swapping a pick after curation** (cross-section clash, failed media, fact problem)
   goes back through ax-curator so the replacement gets its own dedup verdict — never
   edit selected/cards by hand to slip it in. `--no-story-check` is for manual repair only.
   Then **`python3 pipeline/update_ledger.py --news pipeline/news_data.json --ledger pipeline/published_urls.json`**
   — records S's URLs permanently and rebuilds `story_ledger.json` (the history the
   next day's story dedup checks against). Skipping it lets repeats through after day 5.
   **Every card keeps its full payload forever** — `roll.py` preserves `eyebrow`/`body`/`full` on deck cards, so opening ANY past card shows the same main-card layout as today (thumbnail · headline · one-line summary · Read → flip to the full article, served in the viewer's language via `text[lang]`, falling back toward `source_lang` then `en`/`ko`). A card without `full` (no Read button) is a defect: backfill it.

After ALL sections are rolled:
9. **build once** — `python3 pipeline/build_data.py --in pipeline/news_data.json --out axbrief-data.js --share-root . --base-url https://axitnow.com` → emits `window.AX_SECTIONS` (+ back-compat `AX_NEWS`/`AX_DAYS` = design) per language as `axbrief-data.{en,ko,ja,zh,es}.js` (each card flattened to that language via `i18n_text.flatten`, falling back toward `source_lang` then `en`/`ko`), AND regenerates per-card OG share pages under `s/<section>/<id>.html` (so pasted card links unfurl with the card image + headline, then redirect into the app at `/?c=<section>:<id>`). Then `python3 pipeline/build_i18n.py` — regenerates the UI-string dictionaries `i18n/{en,ko,ja,zh,es}.js` from `i18n/{lang}.json`. `node --check axbrief-data.{en,ko,ja,zh,es}.js`; restore the per-run backup on failure. Keep card thumbnails as jpg/png (not webp) so previews render on all platforms.
   Then `python3 pipeline/build_archive.py` — folds today's cards into the permanent
   `pipeline/archive.json` (append-only, teaser fields only — NEVER the premium `full`)
   and regenerates `archive-data.{en,ko,ja,zh,es}.js` + `archive-graph.js` (shared-keyword
   knowledge network) for the /archive page (list + #graph network view).
   `node --check archive-data.{en,ko,ja,zh,es}.js archive-graph.js` too.
10. **verify render over HTTP** (not file://). Serve `python3 -m http.server 8765` and confirm the small app's section TABS switch the hero deck per section. Screenshot → `pipeline/runs/<date>/render.png`.
11. **commit + deploy.** Commit the run to `main` and `git push origin main`, THEN run
    **`bash pipeline/deploy.sh`**. ⚠️ Pushing `main` alone does NOT deploy: Cloudflare
    Workers Builds ships the site from the **`cloudflare/workers-autoconfig`** branch
    (it holds `wrangler.jsonc`), not `main`. `deploy.sh` merges `main` into that deploy
    branch and pushes it, which triggers the Cloudflare build. Then verify production
    reflects a today card id (`curl -s https://axitnow.com/axbrief-data.js | grep -c <id>`)
    and that a share page serves (`/s/<section>/<id>` → 200) within ~30–120s.

Korean voice (humanize-korean — REQUIRED): the humanize target is `text.ko` — the
Korean TRANSLATION produced by step 6c, never the card's original-language
`source_lang` fields. Every Korean string in `text.ko` (`headline`/`body` and every
`full` paragraph) must be run through the **humanize-korean** skill/methodology (refs
in the installed plugin: `.../humanize-korean/references/quick-rules.md` +
`rewriting-playbook.md`) to strip AI-tells (번역투·과도 피동·균일 리듬·접속사 남발·상투적
마무리·영어 직역체); then `pipeline/translate.py check` re-validates `text.ko` (and every
other language) against the source and syncs the top-level fields to `text.ko`.
Style/rhythm only — facts, numbers, dates, quotes, and product/company names stay
byte-identical (~8–25% change). The front card flips (회전문) to the `full` back via a
+ button; the back is a fixed scrollable box (text + the article's images + video
containers).

Freshness: **per-section** window via `pipeline/freshness.py <pub> <now> <section>`
(design/politics 72h; music/movies/games/books/gadgets/science 14 days). Dedup is **per
section** (URL + CONTENT): each distinct story appears on exactly one date within its
section (earliest-wins) — `roll.py` drops rolled-in URLs already earlier in that section;
`build_data.py` FAILS the build on a duplicate URL within a section (WARNS on shared
thumbnail). Drop general AI-business noise (funding, compute, layoffs, exec moves) unless
the user explicitly relaxes criteria for a thin day.

After publishing, post to chat in Korean 존댓말, short: per section "S: N장" with the
chosen headlines linked to source URLs; note any section below 3. Then give BOTH preview
URLs (small carousel now has the section tabs; large card still shows Design only until
it becomes section-aware):
- small/carousel: `http://localhost:8765/Design%20AX%20Brief.html` (or `/` · live: axitnow.com)
- large card: `http://localhost:8765/Design%20AX%20Brief%20(Large%20Card).html`
