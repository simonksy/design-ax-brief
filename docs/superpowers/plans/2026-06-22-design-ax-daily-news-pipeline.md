# Design AX Daily News — 6-Agent Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static content of the Design AX Brief page with real design×AI news, regenerated every morning at 7am by a 6-agent pipeline (기획→사서→선별→라이터→미디어→발행).

**Architecture:** A daily orchestrator skill dispatches six project-level subagents in sequence, each writing a JSON artifact the next consumes. Three deterministic Python helpers (freshness judging, rolling, JS generation) handle the error-prone mechanics so agents never hand-edit the live data file. The page still loads `axbrief-data.js` unchanged; that file is now *generated* from a JSON source-of-truth.

**Tech Stack:** Claude Code subagents (`.claude/agents/*.md`) + skill (`.claude/skills/`), Python 3 (stdlib only) for helpers, the existing React/Babel page, `/schedule` cloud routine for the 7am trigger.

## Global Constraints

- **Single repo:** everything lives under `/Users/leopard/design-ax-brief/`. Commit there. Initialize git in Task 0.
- **Python:** stdlib only (no pip installs). Use `python3`. Tests are plain `assert` scripts run with `python3`, not pytest.
- **Card count:** collect ~15–20 candidates → curator selects exactly 5 (publish fewer only if fewer fresh items exist; never pad with stale).
- **Freshness:** judge by the article's *real* published time (`article:published_time` → JSON-LD `datePublished` → `<time datetime>` → body date; never WebSearch snippet dates alone). Window: **Tue/Wed/Thu/Fri = 24h, Mon = 72h**. Compare in UTC. If published time unverifiable → exclude.
- **Voice:** Korean, calm, max-minimal. Headline = 1 line (use `\n` for a 2-line wrap). Body = 1–2 short sentences. Eyebrow = `AI NEWS`.
- **Color rule:** `accent` (hex) is the only place color lives per card; carried verbatim through to the generated JS.
- **Reporting:** orchestrator posts a short Korean 존댓말 summary; every fact links to its source URL.
- **Data contract (page-facing, unchanged):**
  - `window.AX_NEWS` → 5 today cards `{id, tool, eyebrow, headline, body, source, url, accent, motif, image?}`
  - `window.AX_DAYS` → ≤5 days `{date, cards:[{tool, headline, source, url, accent}]}`

---

## File Structure

**Create:**
- `pipeline/README.md` — artifact schemas (shared interface contract for all agents)
- `pipeline/sources.json` — category taxonomy, seed domains, accent/motif palette
- `pipeline/news_data.json` — source-of-truth `{today:{date,cards[]}, days[]}` (seeded from current page data)
- `pipeline/freshness.py` + `pipeline/freshness_test.py`
- `pipeline/build_data.py` + `pipeline/build_data_test.py`
- `pipeline/roll.py` + `pipeline/roll_test.py`
- `.claude/agents/ax-planner.md`, `ax-librarian.md`, `ax-curator.md`, `ax-writer.md`, `ax-media.md`, `ax-publisher.md`
- `.claude/skills/design-ax-daily-news/SKILL.md` — orchestrator
- Runtime artifacts (gitignored): `pipeline/keywords.json`, `candidates.json`, `selected.json`, `cards.json`, `media.json`, `pipeline/media/`, `pipeline/runs/`

**Modify:**
- `axbrief-app.jsx` — `MediaScene` renders `<img>` when `item.image` present, else existing motif scene.

**Supersede:** `~/Documents/Claude/Scheduled/design-ax-daily-news/SKILL.md` (old 20-card draft) — leave in place; the new project skill is the live one. Note it in Task 11.

---

## Task 0: Repo init + scaffolding

**Files:**
- Create: `pipeline/README.md`, `pipeline/sources.json`, `pipeline/news_data.json`, `.gitignore`
- Read: `axbrief-data.js` (to seed `news_data.json`)

**Interfaces:**
- Produces: the artifact schemas every later task references, and the seed `news_data.json` consumed by `roll.py`/`build_data.py`.

- [ ] **Step 1: Initialize git**

```bash
cd /Users/leopard/design-ax-brief && git init && git add -A && git commit -m "chore: snapshot existing Design AX Brief before pipeline"
```

- [ ] **Step 2: Write `.gitignore`**

```
pipeline/keywords.json
pipeline/candidates.json
pipeline/selected.json
pipeline/cards.json
pipeline/media.json
pipeline/media/
pipeline/runs/
```

- [ ] **Step 3: Write `pipeline/README.md` (artifact schemas)**

```markdown
# Pipeline artifacts

Stage order: keywords → candidates → selected → cards → media → news_data → axbrief-data.js

## keywords.json (기획)
{ "date":"YYYY-MM-DD", "categories":[ {"category":"figma","queries":["..."],"allowed_domains":["figma.com"]} ] }

## candidates.json (사서)
{ "date":"YYYY-MM-DD","window_hours":24,
  "items":[ {"url":"","source":"","category":"figma","published_iso":"2026-06-22T03:00:00Z","og_image":"","excerpt":""} ] }

## selected.json (선별)
{ "date":"YYYY-MM-DD",
  "picks":[ {"url":"","source":"","tool":"Figma","accent":"#0070f3","motif":"frame","rationale":"","published_iso":"","og_image":"","excerpt":""} ] }
# exactly 5 picks (or fewer if fewer fresh)

## cards.json (라이터)
{ "date":"YYYY-MM-DD",
  "cards":[ {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"한 줄\n또는 두 줄","body":"1~2문장.","mini_headline":"덱용 짧은 헤드라인","source":"Figma","url":"","accent":"#0070f3","motif":"frame"} ] }

## media.json (미디어)
{ "date":"YYYY-MM-DD",
  "media":[ {"id":"figma","type":"image","src":"pipeline/media/figma.jpg"} ] }
# type: "image" -> src is a downloaded file path; "svg" -> no src (page renders motif scene)

## news_data.json (source of truth, rolled by 발행)
{ "today": {"date":"YYYY-MM-DD","cards":[<full card incl. optional image>]},
  "days":  [ {"date":"YYYY-MM-DD","cards":[{"tool","headline","source","url","accent"}]} ] }
```

- [ ] **Step 4: Write `pipeline/sources.json`**

```json
{
  "categories": [
    {"category":"figma","label":"Figma","motif":"frame","accent":"#0070f3","allowed_domains":["figma.com","logrocket.com","uxdesign.cc","dev.to"]},
    {"category":"render","label":"KeyShot","motif":"sphere","accent":"#f5a623","allowed_domains":["cgchannel.com","keyshot.com"]},
    {"category":"cad","label":"Text-to-CAD","motif":"cube","accent":"#7928ca","allowed_domains":["engineering.com","getleo.ai"]},
    {"category":"tokens","label":"Design Tokens","motif":"swatch","accent":"#2ec5c5","allowed_domains":["parallelhq.com","mindstudio.ai"]},
    {"category":"vr","label":"VR Prototype","motif":"headset","accent":"#eb367f","allowed_domains":["sgwdesignworks.com","boston-engineering.com"]},
    {"category":"workflow","label":"AI Workflow","motif":"frame","accent":"#ff5a4d","allowed_domains":["orq.ai","fastcompany.com","cio.com","eleken.co","palettt.com"]}
  ],
  "palette": ["#0070f3","#f5a623","#7928ca","#2ec5c5","#eb367f","#ff5a4d","#3b6bff","#171717"],
  "motifs": ["frame","sphere","cube","swatch","headset"]
}
```

- [ ] **Step 5: Seed `pipeline/news_data.json` from current page data**

Read `axbrief-data.js`. Build `news_data.json` so that:
- `today` = `{ "date":"2026-06-21", "cards": <the 5 window.AX_NEWS objects verbatim> }`
- `days` = `window.AX_DAYS` verbatim (the 5 dated entries, oldest→newest).

The hero (`AX_NEWS`) and the last `AX_DAYS` entry (2026-06-21) overlap in the
current file — that's fine. `roll.py` dedups by date, so the first pipeline run
replaces the seeded 2026-06-21 deck entry rather than duplicating it.

Port the objects exactly (every field, every accent). This file must contain the real current content, not a placeholder. Example of the `today` shape (first card filled; port the other 4 the same way):

```json
{
  "today": { "date": "2026-06-21", "cards": [
    {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"웹페이지 캡처가\n피그마 레이어로","body":"스크린샷을 붙여넣으면 곧바로 수정 가능한 디자인이 됩니다. 시안 첫 단추를 몇 분이면.","source":"Figma","url":"https://www.figma.com/resource-library/ai-tools-for-ux-designers/","accent":"#0070f3","motif":"frame"}
  ]},
  "days": [ ]
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(pipeline): scaffolding, schemas, sources, seed data"
```

---

## Task 1: `freshness.py` — deterministic recency gate

**Files:**
- Create: `pipeline/freshness.py`, `pipeline/freshness_test.py`

**Interfaces:**
- Produces: `is_fresh(published_iso: str, now_iso: str) -> bool` and `window_hours(now_iso: str) -> int`. Consumed by `ax-librarian` via `python3 pipeline/freshness.py <published_iso> <now_iso>` (prints `FRESH` / `STALE`).

- [ ] **Step 1: Write the failing test — `pipeline/freshness_test.py`**

```python
from freshness import is_fresh, window_hours

# Wednesday 2026-06-24T07:00:00Z -> 24h window
assert window_hours("2026-06-24T07:00:00Z") == 24
# Monday 2026-06-22T07:00:00Z -> 72h window
assert window_hours("2026-06-22T07:00:00Z") == 72

# Wed run: article 10h ago is fresh, 30h ago is stale
assert is_fresh("2026-06-23T21:00:00Z", "2026-06-24T07:00:00Z") is True
assert is_fresh("2026-06-23T01:00:00Z", "2026-06-24T07:00:00Z") is False
# Mon run: article 60h ago (Fri) is fresh under 72h window
assert is_fresh("2026-06-19T19:00:00Z", "2026-06-22T07:00:00Z") is True
assert is_fresh("2026-06-18T19:00:00Z", "2026-06-22T07:00:00Z") is False
# Unparseable / empty -> not fresh
assert is_fresh("", "2026-06-24T07:00:00Z") is False
assert is_fresh("not-a-date", "2026-06-24T07:00:00Z") is False
print("freshness OK")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && python3 freshness_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'freshness'`

- [ ] **Step 3: Write `pipeline/freshness.py`**

```python
"""Deterministic recency gate. Tue-Fri=24h window, Mon=72h. UTC."""
import sys
from datetime import datetime, timezone

def _parse(iso):
    if not iso:
        return None
    try:
        s = iso.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None

def window_hours(now_iso):
    now = _parse(now_iso)
    if now is None:
        return 24
    return 72 if now.weekday() == 0 else 24  # Monday == 0

def is_fresh(published_iso, now_iso):
    pub = _parse(published_iso)
    now = _parse(now_iso)
    if pub is None or now is None:
        return False
    age_h = (now - pub).total_seconds() / 3600.0
    if age_h < 0:
        return False
    return age_h <= window_hours(now_iso)

if __name__ == "__main__":
    pub, now = sys.argv[1], sys.argv[2]
    print("FRESH" if is_fresh(pub, now) else "STALE")
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && python3 freshness_test.py`
Expected: `freshness OK`

- [ ] **Step 5: Commit**

```bash
git add pipeline/freshness.py pipeline/freshness_test.py && git commit -m "feat(pipeline): deterministic freshness gate"
```

---

## Task 2: `build_data.py` — generate `axbrief-data.js` from JSON

**Files:**
- Create: `pipeline/build_data.py`, `pipeline/build_data_test.py`
- Writes (at runtime): `axbrief-data.js`

**Interfaces:**
- Consumes: `pipeline/news_data.json`.
- Produces: CLI `python3 pipeline/build_data.py` → writes `axbrief-data.js` with `window.AX_NEWS` (= today.cards) and `window.AX_DAYS` (= days). Used by `ax-publisher`.

- [ ] **Step 1: Write the failing test — `pipeline/build_data_test.py`**

```python
import json, os, subprocess, tempfile, textwrap

DATA = {
  "today": {"date":"2026-06-22","cards":[
    {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"두 줄\n헤드라인","body":"본문.","source":"Figma","url":"https://x","accent":"#0070f3","motif":"frame"}
  ]},
  "days": [
    {"date":"2026-06-21","cards":[{"tool":"VR","headline":"미니","source":"SGW","url":"https://y","accent":"#eb367f"}]}
  ]
}

d = tempfile.mkdtemp()
json.dump(DATA, open(os.path.join(d,"news_data.json"),"w"), ensure_ascii=False)
out = os.path.join(d,"axbrief-data.js")
subprocess.run(["python3", os.path.abspath("build_data.py"),
                "--in", os.path.join(d,"news_data.json"), "--out", out], check=True)
js = open(out, encoding="utf-8").read()
assert "window.AX_NEWS" in js and "window.AX_DAYS" in js
assert "두 줄\\n헤드라인" in js          # newline preserved as \n escape
assert "#0070f3" in js and "#eb367f" in js
# valid JS: node must parse it
subprocess.run(["node","--check", out], check=True)
print("build_data OK")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && python3 build_data_test.py`
Expected: FAIL — `can't open file ... build_data.py` / FileNotFound.

- [ ] **Step 3: Write `pipeline/build_data.py`**

```python
"""Generate axbrief-data.js from news_data.json (JSON source of truth)."""
import argparse, json

HEADER = ("/* AUTO-GENERATED by pipeline/build_data.py — do not hand-edit.\n"
          "   Source of truth: pipeline/news_data.json */\n")

def to_js(data):
    news = data["today"]["cards"]
    days = data["days"]
    def dump(obj):
        return json.dumps(obj, ensure_ascii=False, indent=2)
    return (HEADER +
            "(function () {\n" +
            "  window.AX_NEWS = " + dump(news) + ";\n" +
            "  window.AX_DAYS = " + dump(days) + ";\n" +
            "})();\n")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="news_data.json")
    ap.add_argument("--out", dest="out", default="../axbrief-data.js")
    a = ap.parse_args()
    data = json.load(open(a.inp, encoding="utf-8"))
    open(a.out, "w", encoding="utf-8").write(to_js(data))

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && python3 build_data_test.py`
Expected: `build_data OK`

- [ ] **Step 5: Regression — regenerate the real file and confirm the page still loads**

```bash
cd /Users/leopard/design-ax-brief && python3 pipeline/build_data.py && node --check axbrief-data.js && echo "real data builds"
```
Expected: `real data builds`. (JSON `indent=2` reformats the file but the data is identical; `git diff` shows only formatting.)

- [ ] **Step 6: Commit**

```bash
git add pipeline/build_data.py pipeline/build_data_test.py axbrief-data.js && git commit -m "feat(pipeline): generate axbrief-data.js from JSON source of truth"
```

---

## Task 3: `roll.py` — rolling logic

**Files:**
- Create: `pipeline/roll.py`, `pipeline/roll_test.py`

**Interfaces:**
- Consumes: `news_data.json`, `cards.json`, `media.json`.
- Produces: CLI `python3 pipeline/roll.py --cards cards.json --media media.json` → updates `news_data.json` in place: previous `today` → newest entry in `days` (as mini-cards), `days` trimmed to 5, new `today` = merged cards+media. Used by `ax-publisher`.

- [ ] **Step 1: Write the failing test — `pipeline/roll_test.py`**

```python
import json, os, subprocess, tempfile

d = tempfile.mkdtemp()
nd = {"today":{"date":"2026-06-21","cards":[
        {"id":"vr","tool":"VR","eyebrow":"AI NEWS","headline":"옛 헤드라인","body":"b","source":"SGW","url":"https://old","accent":"#eb367f","motif":"headset"}]},
      "days":[{"date":f"2026-06-1{n}","cards":[]} for n in range(4,9)]}  # 5 existing days
json.dump(nd, open(f"{d}/news_data.json","w"), ensure_ascii=False)
cards = {"date":"2026-06-22","cards":[
        {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"새\n헤드라인","mini_headline":"새 미니","body":"b","source":"Figma","url":"https://new","accent":"#0070f3","motif":"frame"}]}
json.dump(cards, open(f"{d}/cards.json","w"), ensure_ascii=False)
media = {"date":"2026-06-22","media":[{"id":"figma","type":"image","src":"pipeline/media/figma.jpg"}]}
json.dump(media, open(f"{d}/media.json","w"), ensure_ascii=False)

subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d}/news_data.json", "--cards", f"{d}/cards.json", "--media", f"{d}/media.json"], check=True)
res = json.load(open(f"{d}/news_data.json", encoding="utf-8"))

# new today is the figma card, with image merged in; mini_headline dropped from hero
assert res["today"]["date"] == "2026-06-22"
assert res["today"]["cards"][0]["image"] == "pipeline/media/figma.jpg"
assert "mini_headline" not in res["today"]["cards"][0]
# previous today became newest day, as mini-cards (5 fields only)
assert res["days"][-1]["date"] == "2026-06-21"
mini = res["days"][-1]["cards"][0]
assert set(mini.keys()) == {"tool","headline","source","url","accent"}
# prev card had no mini_headline and a \n in its headline -> deck uses single line
assert mini["headline"] == "옛 헤드라인"
# days trimmed to 5
assert len(res["days"]) == 5

# --- deck headline source: mini_headline preferred, else \n stripped from headline ---
d2 = tempfile.mkdtemp()
nd2 = {"today":{"date":"2026-06-22","cards":[
        {"id":"x","tool":"X","eyebrow":"AI NEWS","headline":"두 줄\n헤드라인","mini_headline":"짧은 미니","body":"b","source":"S","url":"https://x","accent":"#000000","motif":"frame"}]},
       "days":[]}
json.dump(nd2, open(f"{d2}/news_data.json","w"), ensure_ascii=False)
nc = {"date":"2026-06-23","cards":[{"id":"y","tool":"Y","headline":"오늘\n둘","body":"b","source":"S","url":"https://y","accent":"#111111","motif":"frame"}]}
json.dump(nc, open(f"{d2}/cards.json","w"), ensure_ascii=False)
json.dump({"date":"2026-06-23","media":[]}, open(f"{d2}/media.json","w"), ensure_ascii=False)
subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d2}/news_data.json", "--cards", f"{d2}/cards.json", "--media", f"{d2}/media.json"], check=True)
r2 = json.load(open(f"{d2}/news_data.json", encoding="utf-8"))
assert r2["days"][-1]["cards"][0]["headline"] == "짧은 미니"   # mini_headline wins

# --- dedup by date: rolling the same date twice does not duplicate the day ---
nc2 = {"date":"2026-06-23","cards":[{"id":"z","tool":"Z","mini_headline":"재실행","headline":"h","body":"b","source":"S","url":"https://z","accent":"#222222","motif":"frame"}]}
json.dump(nc2, open(f"{d2}/cards2.json","w"), ensure_ascii=False)
subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d2}/news_data.json", "--cards", f"{d2}/cards2.json", "--media", f"{d2}/media.json"], check=True)
r3 = json.load(open(f"{d2}/news_data.json", encoding="utf-8"))
dates = [d["date"] for d in r3["days"]]
assert dates.count("2026-06-23") == 1, dates   # 06-23 appears once, not twice
print("roll OK")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pipeline && python3 roll_test.py`
Expected: FAIL — FileNotFound for `roll.py`.

- [ ] **Step 3: Write `pipeline/roll.py`**

```python
"""Roll news_data.json: today -> days (mini-cards), set new today from cards+media."""
import argparse, json

MINI = ("tool","headline","source","url","accent")

def mini_card(c):
    # deck mini-cards are single-line: prefer the writer's mini_headline,
    # else strip the hero headline's \n wrap.
    head = c.get("mini_headline") or c.get("headline", "").replace("\n", " ")
    d = {k: c.get(k, "") for k in MINI}
    d["headline"] = head
    return d

def roll(data, cards, media):
    media_by_id = {m["id"]: m for m in media.get("media", [])}
    prev = data.get("today")
    if prev and prev.get("cards"):
        date = prev["date"]
        days = data.setdefault("days", [])
        days[:] = [d for d in days if d.get("date") != date]  # dedup: re-runs idempotent
        days.append({"date": date, "cards": [mini_card(c) for c in prev["cards"]]})
    data["days"] = data.get("days", [])[-5:]
    new_cards = []
    for c in cards["cards"]:
        c = dict(c)
        m = media_by_id.get(c["id"])
        if m and m.get("type") == "image" and m.get("src"):
            c["image"] = m["src"]
        c.pop("mini_headline", None)  # mini_headline only used for the deck on next roll
        new_cards.append(c)
    data["today"] = {"date": cards["date"], "cards": new_cards}
    return data

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="news_data.json")
    ap.add_argument("--cards", required=True)
    ap.add_argument("--media", required=True)
    a = ap.parse_args()
    data = json.load(open(a.data, encoding="utf-8"))
    cards = json.load(open(a.cards, encoding="utf-8"))
    media = json.load(open(a.media, encoding="utf-8"))
    json.dump(roll(data, cards, media), open(a.data, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
```

Note on `mini_headline`: the hero `headline` carries a `\n` two-line wrap, but the
weekly deck mini-cards are single-line. So `mini_card` uses `mini_headline` when the
writer provided one, otherwise strips the `\n` from `headline`. `mini_headline` is
dropped from the hero card itself (it only matters once the card rolls into the deck).

- [ ] **Step 4: Run to verify it passes**

Run: `cd pipeline && python3 roll_test.py`
Expected: `roll OK`

- [ ] **Step 5: Commit**

```bash
git add pipeline/roll.py pipeline/roll_test.py && git commit -m "feat(pipeline): rolling logic for daily news_data"
```

---

## Task 4: Image support in the page (`axbrief-app.jsx`)

**Files:**
- Modify: `axbrief-app.jsx` — `MediaScene` (currently at ~line 140).

**Interfaces:**
- Consumes: card may now carry an `image` string (file path or URL).
- Produces: media scene renders `<img>` when `item.image` is set, else the existing motif scene. No other component changes.

- [ ] **Step 1: Add the image branch at the top of `MediaScene`**

In `axbrief-app.jsx`, find:

```javascript
function MediaScene({ item, active, bold }) {
  const a = item.accent;
  const cls = 'ax-scene' + (active ? ' ax-active' : '');
```

Insert immediately after that opening line block, before `const op = ...`:

```javascript
  if (item.image) {
    return (
      <div className={cls} style={{ background: '#efe9e1' }}>
        <img src={item.image} alt="" loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                   objectFit: 'cover', display: 'block' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div className="ax-grain" style={{ opacity: bold ? 0.06 : 0.08 }} />
      </div>
    );
  }
```

The existing SVG-scene return stays as the fallback below it.

- [ ] **Step 2: Verify render with a temporary image card**

Temporarily set one card's `image` in `axbrief-data.js` (or news_data.json + rebuild) to a known URL, then:

```bash
cd /Users/leopard/design-ax-brief && node --check axbrief-data.js
```
Then open `Design AX Brief.html` (or use the browse skill) and confirm: card with `image` shows the photo full-bleed in the 4:3 media area; cards without `image` still show their motif scene. Revert the temporary change.

- [ ] **Step 3: Commit**

```bash
git add axbrief-app.jsx && git commit -m "feat(page): MediaScene renders real image when card.image set"
```

---

## Task 5: 기획 agent — `ax-planner`

**Files:**
- Create: `.claude/agents/ax-planner.md`

**Interfaces:**
- Consumes: `pipeline/sources.json`, `pipeline/news_data.json` (recent topics to avoid repeating).
- Produces: `pipeline/keywords.json` (schema in `pipeline/README.md`).

- [ ] **Step 1: Write `.claude/agents/ax-planner.md`**

```markdown
---
name: ax-planner
description: Plan today's design×AI news search keywords for the Design AX Brief. Rotates categories, avoids repeating recent topics.
tools: Read, WebSearch, Write
---

You are the planning (기획) agent for a daily "Design AX" news brief read by a
Samsung design organization. Decide today's search plan.

Steps:
1. Read `pipeline/sources.json` (categories + allowed domains) and
   `pipeline/news_data.json` (recent `today` + `days` headlines).
2. Build a search plan covering ALL categories in sources.json, with 2–4 concrete
   English/Korean queries per category aimed at NEWS useful to working designers'
   AI transformation (new tool releases, features, workflow shifts, case studies).
3. Avoid topics whose headline already appears in the last 2 days of news_data.json
   — push for fresh angles. You may add 1 extra "wildcard" trending query.
4. Each category's `allowed_domains` = the sources.json domains for that category
   plus any obvious authoritative source.
5. Write `pipeline/keywords.json` exactly in the README schema. Today's date =
   the date passed in your prompt (the orchestrator provides it).

Output: write the file, then reply with one line: how many categories / queries planned.
Your final message IS data for the orchestrator — keep it to that one line.
```

- [ ] **Step 2: Verify by dispatching against current data**

Dispatch the `ax-planner` agent with prompt: "Today is 2026-06-22. Run your steps." Then:

```bash
cd /Users/leopard/design-ax-brief && python3 -c "import json;d=json.load(open('pipeline/keywords.json'));assert d['categories'] and all(c['queries'] for c in d['categories']);print('keywords OK', len(d['categories']))"
```
Expected: `keywords OK <n>` with n == number of categories in sources.json.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ax-planner.md && git commit -m "feat(agent): ax-planner (기획)"
```

---

## Task 6: 사서 agent — `ax-librarian`

**Files:**
- Create: `.claude/agents/ax-librarian.md`

**Interfaces:**
- Consumes: `pipeline/keywords.json`, `pipeline/freshness.py`.
- Produces: `pipeline/candidates.json` (~15–20 fresh items, each with verified `published_iso`).

- [ ] **Step 1: Write `.claude/agents/ax-librarian.md`**

```markdown
---
name: ax-librarian
description: Search and collect fresh design×AI news candidates, verifying each article's real published time against the freshness window.
tools: Read, WebSearch, WebFetch, Bash, Write
---

You are the librarian (사서) agent. Collect a pool of FRESH candidate articles.

Inputs: `pipeline/keywords.json`, today's date (from your prompt as `now_iso`,
e.g. 2026-06-22T07:00:00Z).

Steps:
1. For each category's queries, run WebSearch (restrict to that category's
   allowed_domains where possible). Gather candidate URLs.
2. For EACH candidate, WebFetch the article and extract the REAL published time,
   in priority order: og `article:published_time` → JSON-LD `datePublished` →
   `<time datetime>` → body-text date. Never trust the search snippet date alone.
   Also extract: source name, a 1–2 sentence excerpt, and og:image URL if present.
3. Gate freshness deterministically — do NOT eyeball it. For each candidate run:
   `python3 pipeline/freshness.py "<published_iso>" "<now_iso>"`
   Keep only those that print FRESH. If you cannot find a published time, DROP it.
4. Aim for ~15–20 fresh candidates spread across categories. Tag each with its
   `category`.
5. Write `pipeline/candidates.json` per the README schema, setting
   `window_hours` from `python3 -c "import sys;sys.path.insert(0,'pipeline');from freshness import window_hours;print(window_hours('<now_iso>'))"`.

For JS-rendered or social sources where WebFetch returns empty, use the browse
skill to render the page, then apply the same published-time + freshness gate.

Output: write the file, then reply one line: "N fresh candidates (window Xh)".
```

- [ ] **Step 2: Verify**

Dispatch `ax-librarian` with prompt: "now_iso = 2026-06-22T07:00:00Z. Run your steps." Then:

```bash
cd /Users/leopard/design-ax-brief && python3 -c "
import json,sys; sys.path.insert(0,'pipeline'); from freshness import is_fresh
d=json.load(open('pipeline/candidates.json')); now='2026-06-22T07:00:00Z'
assert d['items'], 'no items'
assert all(is_fresh(i['published_iso'], now) for i in d['items']), 'stale item present'
print('candidates OK', len(d['items']))"
```
Expected: `candidates OK <n>` (every item passes the freshness gate).

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ax-librarian.md && git commit -m "feat(agent): ax-librarian (사서)"
```

---

## Task 7: 선별 agent — `ax-curator`

**Files:**
- Create: `.claude/agents/ax-curator.md`

**Interfaces:**
- Consumes: `pipeline/candidates.json`, `pipeline/sources.json`.
- Produces: `pipeline/selected.json` (exactly 5 picks, each with `tool`, `accent`, `motif`, `rationale`).

- [ ] **Step 1: Write `.claude/agents/ax-curator.md`**

```markdown
---
name: ax-curator
description: Select the 5 candidate news items most useful to a design org's AI transformation, assigning accent color and motif to each.
tools: Read, Write
---

You are the curator (선별) agent. Pick the best 5 for designers' AX.

Inputs: `pipeline/candidates.json`, `pipeline/sources.json`.

Score each candidate on:
- Actionability — does it change how a designer works tomorrow?
- Novelty — new release/feature/insight, not evergreen rehash.
- Credibility — reputable source.
- Diversity — spread across tools/categories; max 1–2 per category.

Pick the top 5 (fewer ONLY if fewer fresh candidates exist — never pad). For each
pick assign, from sources.json: `tool` (the category label), `accent` (the
category accent hex), `motif` (the category motif). If two picks share a category,
give the second a distinct accent from sources.json `palette`. Carry through
`url`, `source`, `published_iso`, `og_image`, `excerpt`.

Write `pipeline/selected.json` per the README schema (include a one-line
`rationale` per pick).

Output: write the file, then reply with the 5 chosen tool+headline pairs, one per line.
```

- [ ] **Step 2: Verify**

Dispatch `ax-curator` with prompt "Run your steps." Then:

```bash
cd /Users/leopard/design-ax-brief && python3 -c "
import json,re;d=json.load(open('pipeline/selected.json'));p=d['picks']
assert 1<=len(p)<=5
for x in p:
  assert re.match(r'^#[0-9a-fA-F]{6}\$', x['accent']), x
  assert x['motif'] in ['frame','sphere','cube','swatch','headset']
  assert x['tool'] and x['url']
print('selected OK', len(p))"
```
Expected: `selected OK <n>` with n ≤ 5.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ax-curator.md && git commit -m "feat(agent): ax-curator (선별)"
```

---

## Task 8: 라이터 agent — `ax-writer`

**Files:**
- Create: `.claude/agents/ax-writer.md`

**Interfaces:**
- Consumes: `pipeline/selected.json`.
- Produces: `pipeline/cards.json` (cards in the README schema; carries `accent`, `motif`, `id`).

- [ ] **Step 1: Write `.claude/agents/ax-writer.md`**

```markdown
---
name: ax-writer
description: Write calm, minimal Korean card copy for the Design AX Brief from selected news items.
tools: Read, Write
---

You are the writer (라이터) agent. Turn each selected item into card copy.

Input: `pipeline/selected.json`.

Voice: Korean, calm, max-minimal — like a quiet editorial brief, not marketing.
For each pick produce:
- `id`: short lowercase slug (e.g. "figma", "keyshot2").
- `eyebrow`: always "AI NEWS".
- `headline`: ONE line; if it would wrap, insert a single `\n` for a balanced
  2-line break. No trailing punctuation. ~16–22 Korean chars per visual line.
- `body`: 1–2 short, plain sentences — what changed and why a designer cares.
- `mini_headline`: a shorter (~10–14 char) headline for the weekly deck.
- Carry through verbatim from selected.json: `tool`, `source`, `url`, `accent`, `motif`.

Write `pipeline/cards.json` per the README schema (same order as selected.json).
Do NOT invent facts beyond the excerpt; keep claims supported by the source.

Output: write the file, then reply with each card's headline, one per line.
```

- [ ] **Step 2: Verify**

Dispatch `ax-writer` with "Run your steps." Then:

```bash
cd /Users/leopard/design-ax-brief && python3 -c "
import json;d=json.load(open('pipeline/cards.json'));c=d['cards']
assert c
for x in c:
  assert x['eyebrow']=='AI NEWS' and x['id'] and x['headline'] and x['body']
  assert x['accent'] and x['motif'] and x['url'] and x.get('mini_headline')
print('cards OK', len(c))"
```
Expected: `cards OK <n>`.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ax-writer.md && git commit -m "feat(agent): ax-writer (라이터)"
```

---

## Task 9: 미디어 agent — `ax-media`

**Files:**
- Create: `.claude/agents/ax-media.md`

**Interfaces:**
- Consumes: `pipeline/selected.json` (for `og_image`), `pipeline/cards.json` (for `id`).
- Produces: `pipeline/media.json` + downloaded files under `pipeline/media/`.

- [ ] **Step 1: Write `.claude/agents/ax-media.md`**

```markdown
---
name: ax-media
description: Acquire a visual for each card — download the article og:image and quality-check it, else fall back to the generated SVG motif scene.
tools: Read, WebFetch, Bash, Write
---

You are the media (미디어) agent. Give each card a visual.

Inputs: `pipeline/selected.json` (has `og_image`), `pipeline/cards.json` (has `id`, `motif`, `accent`).
Ensure `pipeline/media/` exists: `mkdir -p pipeline/media`.

For each card (matched by `id` / order):
1. If the item has an `og_image` URL, download it:
   `curl -sL -o pipeline/media/<id>.<ext> "<og_image>"`.
2. Quality-check with sips: `sips -g pixelWidth -g pixelHeight pipeline/media/<id>.<ext>`.
   Accept if width ≥ 600 AND height ≥ 315 (decent card image). Otherwise discard.
3. If accepted → record `{"id":<id>,"type":"image","src":"pipeline/media/<id>.<ext>"}`.
   If no og:image, download fails, or it fails the quality check → record
   `{"id":<id>,"type":"svg"}` (the page renders the accent+motif scene for these —
   no file needed).

Write `pipeline/media.json` per the README schema (one entry per card).

Output: write the file, then reply one line: "K images, M svg fallbacks".
```

- [ ] **Step 2: Verify**

Dispatch `ax-media` with "Run your steps." Then:

```bash
cd /Users/leopard/design-ax-brief && python3 -c "
import json,os;d=json.load(open('pipeline/media.json'));m=d['media']
assert m
for x in m:
  assert x['type'] in ('image','svg')
  if x['type']=='image': assert os.path.exists(x['src']), x['src']
print('media OK', sum(1 for x in m if x['type']=='image'),'img', sum(1 for x in m if x['type']=='svg'),'svg')"
```
Expected: `media OK <i> img <s> svg`; every image file exists on disk.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ax-media.md && git commit -m "feat(agent): ax-media (미디어)"
```

---

## Task 10: 발행 agent — `ax-publisher`

**Files:**
- Create: `.claude/agents/ax-publisher.md`

**Interfaces:**
- Consumes: `pipeline/cards.json`, `pipeline/media.json`, `pipeline/news_data.json`, `pipeline/roll.py`, `pipeline/build_data.py`.
- Produces: rolled `pipeline/news_data.json`, regenerated `axbrief-data.js`, archived run under `pipeline/runs/<date>/`.

- [ ] **Step 1: Write `.claude/agents/ax-publisher.md`**

```markdown
---
name: ax-publisher
description: Merge cards+media, roll the daily data, regenerate axbrief-data.js, validate it parses and renders, and archive the run.
tools: Read, Write, Edit, Bash
---

You are the publisher (발행) agent. Commit the day's brief into the live page.

Inputs: `pipeline/cards.json`, `pipeline/media.json`, `pipeline/news_data.json`.
Today's date comes from your prompt.

Steps (run from the repo root /Users/leopard/design-ax-brief):
1. Back up the current live file:
   `mkdir -p pipeline/runs/<date> && cp axbrief-data.js pipeline/runs/<date>/axbrief-data.prev.js`
2. Roll the source of truth:
   `python3 pipeline/roll.py --cards pipeline/cards.json --media pipeline/media.json`
   (this moves the previous `today` into `days`, trims to 5, sets the new `today`).
3. Regenerate the page data: `python3 pipeline/build_data.py`
4. Validate: `node --check axbrief-data.js`. If it fails, restore the backup
   (`cp pipeline/runs/<date>/axbrief-data.prev.js axbrief-data.js`) and STOP with an error.
5. Verify render with the browse skill: open `Design AX Brief.html`, confirm 5 hero
   cards render and the weekly deck shows the rolled day. Save a screenshot to
   `pipeline/runs/<date>/render.png`.
6. Archive the run: copy keywords/candidates/selected/cards/media .json into
   `pipeline/runs/<date>/`.

Output: write/commit files, then reply one line: "발행 완료 — N장, 렌더 확인".
If <5 cards, say so.
```

- [ ] **Step 2: Verify end-to-end mechanics with the real artifacts**

Dispatch `ax-publisher` with "Today is 2026-06-22. Run your steps." Then:

```bash
cd /Users/leopard/design-ax-brief && node --check axbrief-data.js && python3 -c "
import json;d=json.load(open('pipeline/news_data.json'))
assert d['today']['date']=='2026-06-22'
assert len(d['days'])<=5
print('publish OK — today',len(d['today']['cards']),'cards, days',len(d['days']))" && ls pipeline/runs/2026-06-22/
```
Expected: `publish OK — today <n> cards, days <m>` and the run archive lists the json files + render.png.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/ax-publisher.md axbrief-data.js pipeline/news_data.json && git commit -m "feat(agent): ax-publisher (발행)"
```

---

## Task 11: Orchestrator skill — `design-ax-daily-news`

**Files:**
- Create: `.claude/skills/design-ax-daily-news/SKILL.md`

**Interfaces:**
- Consumes: all six agents + the pipeline helpers.
- Produces: a daily run + a Korean chat summary.

- [ ] **Step 1: Write `.claude/skills/design-ax-daily-news/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Verify the skill is discoverable and runs the chain**

Invoke the `design-ax-daily-news` skill in a session whose cwd is the repo. Confirm it dispatches all six agents in order and ends with the Korean summary. (This is the full dry run; it will overwrite today's data — that's expected.)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/design-ax-daily-news/SKILL.md && git commit -m "feat(skill): design-ax-daily-news orchestrator"
```

---

## Task 12: End-to-end run + register the 7am routine

**Files:** none (operational).

- [ ] **Step 1: Full clean dry run**

From a fresh session at the repo root, invoke `design-ax-daily-news`. Confirm:
- All six artifacts are produced in `pipeline/`.
- `node --check axbrief-data.js` passes.
- The page renders 5 hero cards (images where available, motif scenes otherwise) and the weekly deck shows the newly rolled day.
- The Korean summary lists 5 (or fewer, with shortfall noted) source-linked headlines.

- [ ] **Step 2: Commit the day's output**

```bash
cd /Users/leopard/design-ax-brief && git add -A && git commit -m "chore: first full pipeline run output"
```

- [ ] **Step 3: Register the 7am cloud routine**

Use the `/schedule` skill to create a daily routine at **07:00 (local)** whose task is: "cd /Users/leopard/design-ax-brief and run the design-ax-daily-news skill." Confirm it appears in the routine list. (This step is operational and requires user confirmation — do not auto-create without it.)

---

## Self-Review

**Spec coverage:**
- Rolling update of axbrief-data.js → Tasks 2, 3, 10. ✓
- Real images + SVG fallback → Tasks 4, 9. ✓
- 6 agents with attached tools/skills → Tasks 5–10. ✓
- Collect ~15–20 → select 5 → Tasks 6, 7. ✓
- Freshness rules (published-time, 24h/Mon 72h) → Task 1 + Task 6. ✓
- Orchestrator skill, daily 7am → Tasks 11, 12. ✓
- Error handling (parse-check, backup/rollback, no padding, per-stage gate) → Tasks 10, 11. ✓
- Korean summary with source links → Task 11. ✓

**Placeholder scan:** Agent `.md` bodies are complete deliverables; Python tasks show full code; the one bulk-port (Task 0 Step 5) is a mechanical copy from an in-repo file, with shape shown. No TBD/TODO.

**Type consistency:** `id` flows selected→cards→media→roll (matched by `id`); `roll.py` reads `media[].type`/`src` and `cards[].id` as written by `ax-media`/`ax-writer`; `build_data.py` reads `today.cards`/`days` as written by `roll.py`; `freshness.is_fresh/window_hours` signatures match across Tasks 1/6. Mini-card field set `{tool,headline,source,url,accent}` is consistent in `roll.py` and `build_data` output and matches the page's `AX_DAYS` contract. ✓
