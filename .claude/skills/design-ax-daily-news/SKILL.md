---
name: design-ax-daily-news
description: Run the 6-agent Design AX daily news pipeline — collect, curate, write, illustrate, and publish 5 fresh design×AI cards into the Design AX Brief page.
---

Generate today's Design AX Brief by running six subagents in sequence from the
repo root `/Users/leopard/design-ax-brief`. Determine `now_iso` = current UTC
time; `date` = its calendar date.

Run STRICTLY in order, and after each agent verify its artifact exists and is
non-empty before dispatching the next. If a stage produces nothing usable, stop
and report which stage failed.

**Step 0 — keywords (ask the user first).** Before running any agent, ask the user
in Korean 존댓말 for any additional search keywords. State that the default keywords
come from `pipeline/keyword_pool.json` (a broad, rotating pool of AI/design tools,
models, labs, people, and concepts) and the user may add more (or reply with nothing
to use just the pool). Pass any user-supplied keywords to ax-planner as extra seeds.

1. **ax-planner** — "Today is <date>. Extra seed keywords: <user keywords, or none>.
   Run your steps." (ax-planner reads `pipeline/keyword_pool.json`, always uses its
   `core`, and rotates a subset of the `pool` by date.) → `pipeline/keywords.json`
2. **ax-librarian** — "now_iso = <now_iso>. Run your steps." → `pipeline/candidates.json`
   (aim for ~15–20 fresh candidates)
3. **DECISION GATE — user picks the final 5.** Read `pipeline/candidates.json` and
   present the full candidate list to the user as a numbered list (each line: number,
   source, category, published date, headline/excerpt, and source URL). Ask the user
   in Korean 존댓말 which items to publish (up to 5). Wait for their reply. If the
   user defers ("알아서"/"recommend"/no clear pick), let ax-curator choose.
4. **ax-curator** — "Run your steps. User selection: <chosen numbers/URLs, or 'none —
   you choose'>." → `pipeline/selected.json`
5. **ax-writer** — "Run your steps." → `pipeline/cards.json`
6. **ax-media** — "Run your steps." → `pipeline/media.json`
7. **ax-publisher** — "Today is <date>. Run your steps." → `axbrief-data.js` + archive

Freshness window: ax-librarian applies a flat **72h** window for every day (Mon–Fri)
via `pipeline/freshness.py`. Do NOT pad with stale items — if fewer than 5 fresh
cards exist, publish what there is.

No duplicate news across dates (drop + backfill): each distinct story appears on
exactly one date (earliest-wins). Duplicates are judged by URL + CONTENT, NOT by
image — two items are the SAME story if they share a URL (or canonical/redirect
target), cover the same event via a different outlet/headline, or are same-source
same-topic content-hub posts. A shared `og_image`/thumbnail is NOT a duplicate: two
genuinely different articles (different URL + content) are kept even if a source
serves one site-wide OG banner. To avoid them LOOKING the same, ax-media sources a
distinct in-article lead image for each card (og:image is only a fallback). When
collecting day N, ax-curator filters the ~15–20 candidates against the stories
published on N-1…N-5 and backfills with the next-ranked candidate to reach 5 distinct
stories. Deterministic backstops: `pipeline/roll.py` drops, from a rolled-in day, any
card whose URL already appears earlier; `pipeline/build_data.py` FAILS the build on a
duplicate URL (today + deck) and WARNS on a shared thumbnail.

Weekly deck: shows the **past-day archive only** (today is NOT added to the deck —
it lives in the hero). The app shows a "오늘 소식으로" control while the hero is
displaying a past day, so users can return to today without duplicating today's
cards in the deck.

After publishing, post to chat in Korean 존댓말, short:
"오늘 신선 카드 N개 생성(창: 직전 72h, 게재시각 기준) + 5선" with the chosen
headlines, each linked to its source URL. Note any shortfall. Then give the user the
HTML preview URL `http://localhost:8765/Design%20AX%20Brief.html` (served over HTTP
by the publisher; file:// will not render).

This skill supersedes the older `~/Documents/Claude/Scheduled/design-ax-daily-news/SKILL.md`.
