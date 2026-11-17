# Daily Instagram routine (unattended)

This is an unattended scheduled run. Never ask the user anything; decide and note it in the report.
Target date: DATE (folders `social/instagram/story/DATE/` and `social/instagram/trend/DATE/`, 10 + 10 candidates).
Repo: /Users/leopard/Projects/design-ax-brief, branch main. All work happens in this one turn; wait for every agent (foreground, not background) before moving on.

You prepare FOUR sets — 2 story + 2 trend — for publishing. You do NOT publish: the wrapper script publishes the `!` sets after you exit and commits the `*` marks.

## Hard rules
- Never `git add -A social/instagram` or `git add social/instagram`. Add explicit date paths only.
- Never touch `!` / `*` marks or folders of any other date.
- No agency/stock photos (연합·뉴시스·AP·Getty·Reuters·신화 etc., including stock-looking logo photos), never crop a photographer credit, no outlet overlays/watermarks or outlet-produced video. Use official company media with caption credit, CC images with credit, or stat/quote cards.
- Card dates = the article's publish date, not the run date (trend meta.date stays DATE).
- Render one set at a time, never in parallel.
- Never put the user's email or personal data in request headers.
- Skip any story about pathogen enhancement or similar biosecurity research.

## Steps
1. **Pick.** Read `social/instagram/DRAFTS-DATE.md` and each candidate's cards.json + caption.txt. Pick 2 story sets and 2 trend sets:
   - four different sections; avoid the sections posted on the previous posted date (`*` folders of the latest earlier date);
   - story: a concrete, checkable news item with a reachable primary source; trend: items that really read as ONE front.
   - Rename the four folders with a leading `!` (e.g. `mv story/DATE/DATE-x story/DATE/!DATE-x`).
   - If some DATE folders already carry `!` (an earlier attempt), keep those picks and only add what is missing.
2. **Fact-check and polish** with agents, all launched in ONE message and waited on: one general-purpose agent per story folder with `social/instagram/daily/story_brief.md` (tell it its folder path), and one general-purpose agent for both trend folders with `social/instagram/daily/trend_brief.md`. Then read each folder's cards.json yourself: dates match the article, headlines ≤ ~14 chars per line with no orphan word, no forbidden media. If a set cannot be verified (source unreachable, facts don't hold), un-mark it and pick a replacement from the same date, then fact-check that one.
3. **Render** sequentially: for each `!` folder, `rm -rf "<folder>/out"` then `python3 social/instagram/render.py "<folder>"`. Check out/ file count == cards.json card count.
4. **Verify:** `python3 social/instagram/daily/fitcheck.py "<folder>"` → FIT OK for all four; `/usr/bin/python3 -m pytest -q pipeline/social_media_test.py pipeline/social_story_variety_test.py` → pass. Fix and re-render as needed.
5. **Delete the 16 unpicked candidate folders of DATE** (`rm -rf` on the non-`!` folders in the two DATE folders only).
6. **Stage:** `/usr/bin/python3 social/instagram/publish.py --stage`.
7. **Commit + deploy:** `git add social/instagram/story/DATE social/instagram/trend/DATE ig` then commit "chore(ig): DATE story·trend 네 벌 — 원문 대조·기사 날짜로 정정, 나머지 후보 16벌 삭제", `git push origin main` (if rejected: `git pull --rebase origin main` then push), then `bash pipeline/deploy.sh`. After deploy, re-check the DATE folders: if deploy restored deleted candidates, `rm -rf` them again (do not commit anything else).
8. **Check URLs:** for each staged set, `curl -s -o /dev/null -w "%{http_code}" https://axitnow.com/ig/<kind>/<slug>/card1.png` is 200 (poll up to 3 minutes).
9. **Report** — write the whole final message in Korean 존댓말 (not English), short: the four picks (kind, folder, headline, article date), corrections made, test/fit results, commit hash, and any set you swapped or failed. End your final message with the line `IG-PREP-OK` only if all four `!` sets are rendered, verified, committed, deployed and their URLs return 200; otherwise end with `IG-PREP-FAIL: <reason>`.
