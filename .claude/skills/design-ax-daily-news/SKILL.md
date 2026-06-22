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

1. **ax-planner** — "Today is <date>. Run your steps." → `pipeline/keywords.json`
2. **ax-librarian** — "now_iso = <now_iso>. Run your steps." → `pipeline/candidates.json`
3. **ax-curator** — "Run your steps." → `pipeline/selected.json`
4. **ax-writer** — "Run your steps." → `pipeline/cards.json`
5. **ax-media** — "Run your steps." → `pipeline/media.json`
6. **ax-publisher** — "Today is <date>. Run your steps." → `axbrief-data.js` + archive

Freshness window: ax-librarian applies Tue–Fri 24h / Mon 72h via
`pipeline/freshness.py`. Do NOT pad with stale items — if fewer than 5 fresh
cards exist, publish what there is.

After publishing, post to chat in Korean 존댓말, short:
"오늘 신선 카드 N개 생성(창: 24h 또는 월 72h, 게재시각 기준) + 5선" with the 5
headlines, each linked to its source URL. Note any shortfall.

This skill supersedes the older `~/Documents/Claude/Scheduled/design-ax-daily-news/SKILL.md`.
