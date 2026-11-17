# Trend set polish brief (AX-it NOW Instagram)

You finalize TWO "trend" carousels picked for publishing. A trend set follows one front across several archive cards: card 1 is a `thread` timeline, cards 2–5 each cite one dated item, card 6 is the outro.
Repo: /Users/leopard/Projects/design-ax-brief (main checkout; other agents edit sibling folders concurrently).

## Read first
- social/instagram/README.md (esp. "흐름 회차" and "내용 규칙").
- Finished trend examples: social/instagram/trend/2026-11-12/*2026-11-12-gadgets-trend/ and *2026-11-12-politics-trend/ (cards.json + caption.txt).
- Your folders' cards.json. Each content card has `_id` (site card id) and `_src` (source URL).

## Do, per folder
1. For every content card, look up the site card in pipeline/news_data.json by `_id` (text.ko + full), and fetch the `_src` article (WebFetch; fallback `curl -sL --compressed -A "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36"`). Fact-check every number, name, quote, date. The card's eyebrow/foot date = that article's publish date (YYYY.MM.DD); thread dates (d: "MM.DD") must match. Prefer the primary document (company post, agency release, speech text) over a wire report of it, and attribute statements to whoever made them. Fix errors; note them.
2. Check the set actually reads as ONE front (thread_note + card 1 body state the insight; last content card should land the "so what"). Tighten Korean (humanize: no 번역투, varied rhythm), facts unchanged. Limits: headline ≈12–14 chars per line, max 2 lines, no orphan word on line 2 (prefer one line ≤14); body ≲ 70 chars (3 lines max); quote ≲ 70 chars (explicit "\n" allowed).
3. Media (strict): each card's visual must belong to its own item. NO agency/stock photos (연합·뉴시스·AP·Getty·Reuters·신화 etc.), no photos whose photographer credit would have to be cropped, no outlet overlays/watermarks or outlet-produced videos, no stock-looking logo photos. Allowed: a company's own official press images/videos (credit in caption), CC images with caption credit; otherwise make the card `stat` or `quote` with real numbers/quotes. Stills (jpg/png) may be used by only ONE card in a set; same video only with different `start`. No image already used by another post folder (pipeline/social_media_test.py checks content hashes across ALL folders, including drafts — if your card clashes, switch to stat/quote or use a different in-article image saved under <folder>/src/).
4. meta: keep meta.date = the brief date in the folder name (YYYY.MM.DD) — trend sets are dated by the run; update note (what you cross-checked/corrected), sources = list of "Outlet — title (YYYY.MM.DD)".
5. Write caption.txt in the shape of the examples: title (= meta.issue) / blank / one lead sentence / blank / one "· MM.DD <outlet or subject> — <fact>" bullet per content item / blank / "밀어서 N장 →" (N = card count) / blank / "출처: Outlet · Outlet · …" (+ "사진: …" credit line if media used) / blank / "매일 아침 열 개 분야 AI 뉴스와 분야를 넘나드는 지식 그래프 → axitnow.com (프로필 링크)" / blank / 4–6 hashtags starting #AI ending #axitnow.
6. Verify from repo root:
   - `python3 social/instagram/daily/fitcheck.py "<folder>"` → FIT OK
   - `/usr/bin/python3 -m pytest -q pipeline/social_media_test.py pipeline/social_story_variety_test.py` → fix failures naming YOUR folders; just report others.

## Don't
- No render.py (controller renders sequentially), no folder renames (the leading "!" is the pick mark), don't touch other folders, no git add/commit, no publish/deploy.
- Downloads/scratch go in /Users/leopard/.design-ax-brief/ig-scratch/<your-folder-slug>/.
- Never put the user's email or any personal data in request headers. For Wikimedia use a generic UA like "axitnow-bot/1.0 (https://axitnow.com)".

## Report (short)
Per folder: corrections (with source fact), final headlines 1–5, media changes, test results.
