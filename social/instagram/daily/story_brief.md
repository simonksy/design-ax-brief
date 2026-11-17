# Story set polish brief (AX-it NOW Instagram)

You finalize ONE "story" carousel picked for publishing: 6 cards (cover/content x4/outro), from ONE source article.
Repo: /Users/leopard/Projects/design-ax-brief (main checkout; other agents edit sibling folders concurrently).

## Read first
- social/instagram/README.md (esp. "내용 규칙", card kinds stat/quote/photo/video, `media`, `start`).
- Finished story examples: social/instagram/story/2026-11-12/*2026-11-12-ace-studio-music-v1/ (all stat/quote) and story/2026-11-10/*2026-11-10-agibot-g2-convenience-store/ (with video media). Read cards.json + caption.txt.
- Your folder's cards.json and caption.txt (auto draft: headlines truncated "…", bodies are machine excerpts — rewrite them all).

## Do
1. Fetch the source article (meta.sources) (WebFetch; fallback `curl -sL --compressed -A "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36"`). Find the article's real publish date; meta.date, cover eyebrow date ("AI × <분야> · YYYY.MM.DD") and every card foot = that date. If the article cites a primary source (company post, filing, official release), fetch it too and check numbers against it.
2. Fact-check every number, name, quote, date. Attribute claims to whoever made them. No claims beyond the sources.
3. Rewrite in natural Korean (no 번역투, varied rhythm). Each content card: its own eyebrow (짧은 질문/요점), real headline. Limits: headline ≈12–14 chars per line, max 2 lines, no orphan word on line 2 (prefer one-line ≤14); body ≲ 70 chars (3 lines); quote ≲ 70 chars (explicit "\n" allowed). Stat cards: stat_top → stat_arrow → stat_bottom read as a change/comparison (not a 3-item list); keep stat values short.
4. Media rules (strict): NO agency/stock photos (연합·뉴시스·AP·Getty·Reuters·신화 etc.), no photos where a photographer credit would have to be cropped, no outlet overlays/watermarks, no stock-looking logo photos. Videos/images from an individual's own YouTube or social channel (standard license, not CC) are NOT allowed either — even when that person is the story's subject. Allowed: company's own official press images/videos (credit in caption), CC images with caption credit, otherwise stat/quote cards. Stills may be used by only one card. Save downloaded media under <folder>/src/ and reference relatively like the examples. pipeline/social_media_test.py checks content hashes across ALL folders (incl. drafts) — no reuse of an image another folder uses. When in doubt, use stat/quote.
5. caption.txt in the shape of the examples: title / lead / bullets / "밀어서 6장 →" / "출처: Outlet (YYYY.MM.DD)" (+ "사진: …"/"영상: …" credit line if media used) / axitnow line / 4–6 hashtags #AI … #axitnow.
6. meta.note: what you cross-checked/corrected. meta.sources: "Outlet — title (YYYY.MM.DD)".
7. Verify from repo root:
   - `python3 social/instagram/daily/fitcheck.py "<folder>"` → FIT OK
   - `/usr/bin/python3 -m pytest -q pipeline/social_media_test.py pipeline/social_story_variety_test.py` → fix failures naming YOUR folder; just report others.

## Don't
- No render.py (controller renders sequentially), no folder renames (leading "!" is the pick mark), don't touch other folders, no git add/commit, no publish/deploy.
- Downloads/scratch go in /Users/leopard/.design-ax-brief/ig-scratch/<your-folder-slug>/.
- Never put the user's email or any personal data in request headers. For Wikimedia use a generic UA like "axitnow-bot/1.0 (https://axitnow.com)".

## Report (short)
Corrections (with source fact), article date, final headlines 1–5, media used + credit, test results.
