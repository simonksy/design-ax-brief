# Design AX Daily News — 6-Agent Pipeline (Design Spec)

**Date:** 2026-06-22
**Status:** Approved (design) → ready for implementation plan
**Owner:** simonksy@gmail.com

## Purpose

Replace the static placeholder content in the **Design AX Brief** card-news page
with **real, freshly-collected design × AI news**, regenerated **every morning at
7am** by an automated multi-agent pipeline. The target audience is a Samsung
design organization's executives — news is selected for usefulness to **designers'
AX (AI transformation)**.

The existing rendered design must be reused as-is (aside from one small,
contained code change to support real images). The pipeline feeds its data
contract; it does not redesign the page.

## Existing system (the target design)

Location: `/Users/leopard/design-ax-brief/`

- `Design AX Brief.html` — entry; loads Geist tokens, Pretendard, React/Babel,
  `axbrief-data.js`, then `axbrief-app.jsx`.
- `axbrief-app.jsx` — themed React app: hero carousel of 5 "today" cards +
  weekly deck timeline (last 5 days × 5 mini-cards). Themes: zen/glass/paper.
- `axbrief-data.js` — the data contract the pipeline writes:
  - `window.AX_NEWS` → 5 today cards:
    `{id, tool, eyebrow, headline (\n-wrapped), body, source, url, accent, motif}`
  - `window.AX_DAYS` → up to 5 past days, each:
    `{date, cards: [{tool, headline, source, url, accent}] }` (5 mini-cards/day)

A prior draft skill exists at
`Documents/Claude/Scheduled/design-ax-daily-news/SKILL.md` (20-card variant,
references a never-created `news_pipeline/`). It is **reference only**; this spec
replaces it.

## Key decisions (from brainstorming)

1. **Output integration:** rolling update of `axbrief-data.js` — new 5 →
   `AX_NEWS`; yesterday's `AX_NEWS` → newest `AX_DAYS` entry; trim `AX_DAYS` to 5.
2. **Media:** real images — fetch article `og:image`; fallback = generated
   `accent + motif` SVG scene (the design's existing visual language).
3. **Orchestration:** one orchestrator skill (daily 7am cloud routine) that
   dispatches 6 subagents sequentially.
4. **Card count:** collect many (~15–20 candidates) → curator selects 5.
5. **Image-gen fallback mechanism:** generated SVG motif scenes (no native
   raster image generator in this environment; zero-dependency, on-brand).
6. **Freshness:** carried over verbatim from the prior draft (published-time
   verification; Tue–Fri 24h window, Mon 72h).
7. **Schedule:** daily 7am via `/schedule` cloud routine. Plan defines it;
   registration happens after plan approval.

## Architecture

### Orchestration

A single **orchestrator skill** (rewrite of
`Documents/Claude/Scheduled/design-ax-daily-news/SKILL.md`) runs daily at 7am.
It dispatches the 6 subagents in sequence, verifies each stage's artifact exists
before advancing, then posts a short Korean (존댓말) summary with source links.

All run-state lives in a new working dir: `design-ax-brief/pipeline/`.

### Data flow

```
keywords.json → candidates.json → selected.json → cards.json → media.json → axbrief-data.js
   (기획)          (사서)            (선별)          (라이터)      (미디어)        (발행)
```

Each stage reads **only** the previous artifact(s) plus design context. Clear
interfaces make every agent independently testable.

### Working directory layout

```
design-ax-brief/
  pipeline/
    sources.json          # seed source/domain list + category taxonomy (static config)
    # (live date is news_data.json.today.date — no separate state.json)
    keywords.json         # planner output
    candidates.json       # librarian output
    selected.json         # curator output (5 picks)
    cards.json            # writer output
    media.json            # media output
    media/                # downloaded og:images + generated SVG scenes
    runs/YYYY-MM-DD/       # per-day archive of all artifacts + backup of prior axbrief-data.js
```

### The 6 agents (Claude Code subagent definitions in `.claude/agents/*.md`)

#### 1. 기획 — `ax-planner`
- **Role:** decide today's search keywords/queries. Rotate across categories
  (Figma · 3D/CAD · CMF/render · design systems · VR/proto · AI workflow),
  avoid repeating yesterday's exact topics, fold in any trending angle.
- **Reads:** `sources.json`, yesterday's `AX_NEWS`/latest `AX_DAYS` entry (for diversity).
- **Output:** `keywords.json` — `[{category, queries[], allowed_domains[]}]`.
- **Tools/skills:** Read, WebSearch (light trend check), Write.

#### 2. 사서 — `ax-librarian`
- **Role:** search & collect candidates using the keywords. For each candidate,
  `web_fetch` the article to **verify real published time** and gather og:image,
  source, body excerpt. Apply freshness window (Tue–Fri 24h, Mon 72h). Drop
  anything whose published time can't be verified (no guessing).
- **Output:** `candidates.json` — ~15–20 fresh candidates, each:
  `{url, source, category, published_iso, og_image, excerpt}`.
- **Tools/skills:** WebSearch, WebFetch, **browse** (social/JS-rendered pages), Write.

#### 3. 선별 — `ax-curator`
- **Role:** score candidates on usefulness to a design org's AX — actionability
  for designers, novelty, source credibility, and diversity across tools/
  categories. Pick **top 5** (≈1–2 max per tool, ensure category spread). Assign
  each pick its `accent` (hex) and `motif`, plus a `tool` label.
- **Output:** `selected.json` — 5 picks with rationale + accent + motif + tool.
- **Tools/skills:** Read, Write.

#### 4. 라이터 — `ax-writer`
- **Role:** write card copy in the design's calm, max-minimal voice:
  Korean headline (1 line, `\n` for a 2-line wrap), 1–2 calm sentences of body,
  `eyebrow` ('AI NEWS'), tool label, source, url. Also a shorter **mini-card
  headline** for the weekly deck.
- **Output:** `cards.json` — 5 cards in the `AX_NEWS` shape minus media.
- **Tools/skills:** Read, Write.

#### 5. 미디어 — `ax-media`
- **Role:** per card, download the og:image to `media/` and validate quality
  (dimensions/aspect via `sips`). If missing or low-quality, generate a branded
  `accent + motif` SVG scene. Produce a per-card visual spec.
- **Output:** `media.json` — per card `{type: 'image'|'svg', src, accent, motif}`.
- **Tools/skills:** WebFetch (download), Bash (`sips`), Write.

#### 6. 발행 — `ax-publisher`
- **Role:** merge `cards.json` + `media.json` into the `AX_NEWS` shape, run the
  **rolling logic**, write `axbrief-data.js`, validate it parses, verify render,
  and archive the run.
- **Output:** updated `axbrief-data.js` + `runs/YYYY-MM-DD/` archive.
- **Tools/skills:** Read/Write/Edit, Bash (`node --check`), **browse** (screenshot verify).

### Rolling logic (발행)

Implemented in `pipeline/roll.py` against `pipeline/news_data.json` (which is the
single source of truth — there is no separate `state.json`; the live date lives in
`news_data.json.today.date`).

1. Read `news_data.json.today.date` (date of the live `AX_NEWS`).
2. Convert the current `today.cards` (yesterday's 5) into mini-cards
   `{tool, headline, source, url, accent}` (deck headline = `mini_headline` else the
   `\n`-stripped headline) and append as the newest `days` entry dated `today.date`,
   deduping any existing entry with that date (re-runs are idempotent).
3. Trim `days` to the 5 newest entries.
4. Set `today` = the new cards (full, with image merged from media; `mini_headline` dropped).
5. Back up the prior `axbrief-data.js` to `runs/YYYY-MM-DD/` before overwrite, then
   regenerate `axbrief-data.js` from `news_data.json` via `build_data.py`.

### Required design-code change

The current `LayoutEditorial` media scene renders an `accent + motif` SVG scene
only. To support real images:
- Add an optional `image` field to the card object.
- In `axbrief-app.jsx`, make the media scene render `<img src={card.image}>`
  when `image` is present (object-fit cover, themed framing), else fall back to
  the existing motif scene.
This is the only change to the rendered design; it is small and contained.

### Error handling

- **<5 fresh candidates:** publish what exists; never pad with stale items.
  Report the shortfall in the summary.
- **og:image fails / low quality:** SVG motif fallback (always succeeds, zero deps).
- **Publisher:** `node --check` the generated `axbrief-data.js` before overwrite;
  keep the prior file backed up for one-step rollback.
- **Orchestrator:** verify each stage's artifact exists and is non-empty before
  dispatching the next agent; abort with a clear report if a stage fails.

### Freshness rules (carried over verbatim)

- Judge by the **article's real published/registered time**, not display/guessed
  dates. Per candidate, `web_fetch` and read, in priority order:
  `article:published_time` (og meta) → JSON-LD `datePublished` →
  `<time datetime>` → (last resort) body-text date. Never trust WebSearch
  snippet dates alone.
- Window by weekday: **Tue/Wed/Thu/Fri = last 24h**, **Mon = last 72h**
  (covers the prior Fri–Sun weekend). Compare in a single timezone (UTC).
- Hour-precision: a calendar "yesterday" item published >24h ago is excluded
  Tue–Fri. If published time can't be found, exclude (no guessing).

### Reporting

At the end the orchestrator posts to chat, in Korean 존댓말, a short summary:
how many fresh cards were generated (with the window used: 24h or Mon 72h),
the 5 selected headlines, and a note if fewer than 5 were available. Every fact
links to its source URL.

## Out of scope (YAGNI)

- Human-selection step + 10-second video loops for selected cards (in the old
  draft) — dropped; media is image-or-SVG only.
- The 20-card variant — replaced by the 5-card hero + weekly deck model.
- Multi-theme switching automation — the page stays on its default theme.
- Real raster image generation — SVG motif fallback only.

## Success criteria

- Running the orchestrator produces a valid `axbrief-data.js` that the page
  renders without errors, showing 5 fresh today-cards + a correctly rolled
  5-day weekly deck.
- Every card traces to a real source URL with a verified published time inside
  the freshness window.
- Each of the 6 agents can be run standalone against a fixture of the previous
  stage's artifact.
- The daily 7am routine runs unattended and reports a Korean summary.
