# Politics — first collection run, 2026-09-13 (INCOMPLETE, resume elsewhere)

The Politics section's first run got through **Step 5 (ax-curator)** and stopped.
Steps 6b / 7 cannot be completed in the environment it was run in. Resume from
**Step 6 (ax-writer)** in an environment with normal outbound HTTPS.

## State

| Step | Status | Artifact |
| --- | --- | --- |
| 1 ax-planner | done | `keywords_politics.json` — 18 working keywords, 28 queries, 3 axes |
| 2 ax-librarian | done, degraded | `candidates_politics.json` — 8 candidates, 72h window |
| 3 dedup | done | `candidates_filtered_politics.json` — 8 kept, 0 dropped (no history) |
| 4 decision gate | done | user hand-picked 5 |
| 5 ax-curator | done | `selected_politics.json` — 5 picks, ordered, neutrality-attributed |
| 6 ax-writer | **not run** | — |
| 6b full + humanize | **BLOCKED** | needs the article bodies |
| 7 ax-media | **BLOCKED** | every `og_image` is null |
| 8 roll / 9 build / 10 verify / 11 deploy | not run | — |

`news_data.json` → `sections.politics` is still empty, so nothing was published and
the Politics tab stays hidden. Re-running Steps 1–3 is NOT required — the human
selection in `selected_politics.json` is the expensive part and it is preserved.

## Why it stopped

The run happened behind an egress proxy that rejects CONNECT for every domain in the
politics `allowed_domains` set (403 at the tunnel, before TLS). Consequences:

1. **No published time was verified by direct fetch — zero out of eight.** Every
   `published_iso` came from search-result metadata plus a corroborating search, and is
   recorded at `00:00:00Z` of the confirmed publication DATE (earliest possible instant,
   so the freshness gate was applied against the worst case). This is weaker than the
   pipeline's normal guarantee of reading `article:published_time` off the page.
   `politico.eu`, `euractiv.com`, `arstechnica.com`, `apnews.com`, `theverge.com` and
   `wired.com` could not even be reached by WebSearch, so they were never swept.
2. **Step 6b cannot run.** The `full` payload is a translation of the article body; with
   no body, the only way to produce one is to paraphrase search snippets and present them
   as the article. That is a provenance fabrication, so it was not done. A card without
   `full` has no Read button, which the skill calls a defect.
3. **Step 7 cannot run.** All five `og_image` fields are null, so ax-media would fall
   through to the SVG motif scene for every card — and because Politics has a single
   category, all five share `accent #3b6bff` + `motif cube`, i.e. five identical
   placeholder visuals.

## Resume instructions

From the repo root, with working outbound HTTPS:

```
cp pipeline/selected_politics.json pipeline/selected.json
```

Then run the skill's Steps 6 → 11 for section `politics`. Two things to re-verify first,
because they were established without a direct fetch:

- **Re-verify all five published times** by fetching each article and reading
  `article:published_time` / JSON-LD. Correct `published_iso` to the real value.
- **Re-apply the freshness gate afterwards.** These are 2026-09-11 and 2026-09-12
  articles against a 72h politics window, so by the time this is resumed most or all of
  them will be genuinely stale. If so, treat this file as a record of the run and
  collect fresh — do not publish stale items to make the first run happen.

## The five picks

1. `politics-ai-auditor-registry` — IAPP, *A view from DC: What will all these AI auditors be auditing?* (policy, CA SB 813 / AB 1405)
2. `politics-claude-state-misuse` — Axios, *Anthropic report: 5 ways Claude was exploited for war, spying and repression* (geopolitics)
3. `politics-uk-worker-voice-ai` — The Register, *Union body tells UK government workers must get a say before AI clocks in* (policy)
4. `politics-us-china-ai-governance` — Tech Policy Press, *AI Governance Reaches Crisis Point Ahead of Trump-Xi Summit* (geopolitics)
5. `politics-house-recess-ai` — Axios, *Scoop: Mike Johnson urged to cancel House recess over AI warnings* (policy)

Note on #5: single-source scoop with no primary document behind it. The curator
attributed it ("Axios reports that…") per the section's neutrality rule; keep that
attribution through the writer stage.

## Coverage note for the next run

The **elections/public-opinion axis returned zero items** inside the 72h window despite
eight dedicated searches (deepfake enforcement, C2PA provenance, platform labeling,
midterm ads, chatbot voting advice, Brennan Center, fact-checker coalitions, state AG
actions). The freshest election-AI material was 2026-09-09/10, just outside. Axis spread
for this run was policy 5 / geopolitics 3 / elections 0. If elections keeps coming back
empty across several runs, consider widening politics from 72h to 7 days in
`pipeline/freshness.py` (`FAST_SECTIONS`) rather than letting the axis go unrepresented.
