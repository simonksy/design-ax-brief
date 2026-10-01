#!/usr/bin/env python3
"""Content-level (story) dedup — "same story, different URL" and running-story follow-ups.

dedup_candidates.py only catches the SAME URL. The leaks we actually see are the same
event reported by another outlet, or a follow-up on a running story (politics is full of
these: a ruling, then the appeal, then the lawsuit), or a pick swapped in AFTER the
curator's check (2026-10-01: a cross-section swap pulled in a story the previous day's
curator had already flagged as a follow-up). Two layers:

1. annotate (before the curator) — a TF-IDF cosine over the English source title +
   excerpt, scored against the section's last 30 days of published cards
   (story_ledger.json, built by update_ledger.py) and against the rest of today's pool.
   Word overlap is precise but misses paraphrase, so it only AUTO-DROPS near-verbatim
   repeats (>= DUP); weaker matches are TAGGED for the curator (`history_match`,
   `cluster`), and the whole 30-day history is attached as `history_digest` so the
   curator's content check covers 30 days instead of news_data's 5.
2. verify (run by roll.py, before anything is published) — recomputes on the FINAL
   picks, so a swapped-in pick is checked too, and fails unless the curator left a
   verdict for every pick in `dedup.checks` (see below). Same-story pairs among the
   picks and near-verbatim repeats of history fail regardless of what the record says.

selected_<section>.json must carry:
    "dedup": {"checks": {"<pick url>": {
        "verdict": "new" | "follow-up",
        "nearest": "<url of the closest published story, or '' if none>",
        "new_action": "<follow-up only: the NEW decision/filing/release it reports>"}}}

Usage:
    python3 story_dedup.py annotate --section S [--candidates candidates_filtered_S.json]
                                    [--out <same>] [--today YYYY-MM-DD]
    python3 story_dedup.py verify   --section S [--selected selected_S.json]
"""
import json
import math
import re
import sys
from collections import Counter
from datetime import date as Date

DUP = 0.50       # near-verbatim repeat of a published story -> auto-drop / hard fail
LIKELY = 0.40    # backtest: most published pairs in 0.40-0.50 were real repeats -> flagged
REVIEW = 0.15    # possibly the same running story -> curator must name it as `nearest`
CLUSTER = 0.30   # two candidates in today's pool look like one story -> tagged
PICK_PAIR = 0.40 # two FINAL picks this similar are the same story -> hard fail
DAYS = 30

STOP = set("""a an the and or but of to in on at for from by with as is are was were be been
being it its this that these those into over after before about than then there their they
them he she his her we our you your i not no new says said say will would could should can may
might has have had do does did just more most also how what why who when where which while
amid via per up out off report reports week today year years one two three first last
ai artificial intelligence""".split())


def tokens(text):
    """Lowercased content words; crude English stemming so 'rules' ~ 'rule'."""
    out = []
    for w in re.findall(r"[a-z0-9]+|[가-힣]+", (text or "").lower()):
        if w in STOP or len(w) < 2 or w.isdigit():
            continue
        if w.isascii():
            for suf in ("ing", "ed", "es", "s"):
                if len(w) > 4 and w.endswith(suf):
                    w = w[: -len(suf)]
                    break
        out.append(w)
    return out


def doc_text(item):
    """English title (x2, it names the event) + excerpt; Korean copy only as fallback —
    it never matches English candidates and would just dilute the vector."""
    title = item.get("title") or item.get("headline") or ""
    excerpt = item.get("excerpt") or ""
    if _head(excerpt) in BOILER:
        excerpt = ""
    if title or excerpt:
        return " ".join([title, title, excerpt])
    return item.get("ko", "")


class Index:
    def __init__(self, docs):
        self.n = len(docs) or 1
        self.df = Counter()
        for d in docs:
            self.df.update(set(tokens(doc_text(d))))

    def vec(self, item):
        tf = Counter(tokens(doc_text(item)))
        v = {w: (1 + math.log(c)) * math.log((self.n + 1) / (self.df.get(w, 0) + 1) + 1)
             for w, c in tf.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {w: x / norm for w, x in v.items()}


def cos(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(w, 0.0) for w, x in a.items())


def norm_url(u):
    from dedup_candidates import norm_url as _n
    return _n(u)


def items_of(doc):
    if isinstance(doc, list):
        return doc
    for k in ("items", "picks", "candidates"):
        if isinstance(doc.get(k), list):
            return doc[k]
    return []


def load_history(ledger_path, section, today, days=DAYS):
    """Published cards of `section` from the `days` days BEFORE `today`."""
    try:
        led = json.load(open(ledger_path, encoding="utf-8"))
    except (OSError, ValueError):
        return []
    t = Date.fromisoformat(today)
    hist = []
    for h in led.get(section, []):
        try:
            age = (t - Date.fromisoformat(h.get("date", ""))).days
        except ValueError:
            continue
        if 1 <= age <= days:
            hist.append(h)
    return hist


BOILER = set()  # excerpt openings shared by 2+ URLs = scraped site chrome


def _head(excerpt):
    return re.sub(r"\s+", " ", excerpt or "")[:60].lower()


def learn_boilerplate(docs):
    """Some scrapes return site chrome as the excerpt (TechRadar: "Weekly newsletters Get
    daily news…"), which makes unrelated articles look identical. An excerpt opening
    shared by 2+ different URLs is chrome, not content — doc_text() then ignores it."""
    by_head = {}
    for d in docs:
        if _head(d.get("excerpt")):
            by_head.setdefault(_head(d.get("excerpt")), set()).add(d.get("url"))
    BOILER.update(h for h, urls in by_head.items() if len(urls) > 1)


def matcher(items, hist):
    learn_boilerplate(hist + items)
    idx = Index(hist + items)
    hvecs = [idx.vec(h) for h in hist]

    def best(item):
        v, top = idx.vec(item), None
        for h, hv in zip(hist, hvecs):
            if norm_url(h.get("url", "")) == norm_url(item.get("url", "")):
                continue  # exact URL repeats are dedup_candidates.py's job
            s = cos(v, hv)
            if top is None or s > top["score"]:
                top = {"score": round(s, 3), "date": h.get("date"), "url": h.get("url"),
                       "title": h.get("title") or h.get("ko", "")}
        return top

    return idx, best


def similar_pairs(vecs, threshold):
    return [(i, j, round(cos(vecs[i], vecs[j]), 3))
            for i in range(len(vecs)) for j in range(i + 1, len(vecs))
            if cos(vecs[i], vecs[j]) >= threshold]


def annotate(section, cand_path, out_path, ledger, today):
    cand = json.load(open(cand_path, encoding="utf-8"))
    items = items_of(cand)
    hist = load_history(ledger, section, today)
    idx, best = matcher(items, hist)

    kept, dropped = [], []
    for c in items:
        c = {k: v for k, v in c.items() if k not in ("history_match", "cluster")}
        m = best(c)
        if m and m["score"] >= DUP:
            dropped.append((c, m))
            continue
        if m and m["score"] >= REVIEW:
            c["history_match"] = dict(m, band="likely-repeat" if m["score"] >= LIKELY
                                      else "related")
        kept.append(c)

    vecs = [idx.vec(c) for c in kept]
    pairs = similar_pairs(vecs, CLUSTER)
    parent = list(range(len(kept)))

    def find(i):
        while parent[i] != i:
            i = parent[i]
        return i

    for i, j, _ in pairs:
        parent[find(j)] = find(i)
    sizes = Counter(find(i) for i in range(len(kept)))
    for i, c in enumerate(kept):
        if sizes[find(i)] > 1:
            c["cluster"] = f"c{find(i)}"

    out = dict(cand) if isinstance(cand, dict) else {}
    out.pop("candidates", None)
    out["items"] = kept
    out["story_dedup"] = {
        "history_days": DAYS,
        "dropped": [{"url": c.get("url"), "title": c.get("title"), "match": m}
                    for c, m in dropped],
        "review": sum(1 for c in kept if "history_match" in c),
        "same_story_pairs": [[kept[i].get("url"), kept[j].get("url"), s] for i, j, s in pairs],
    }
    # What the curator content-checks against: 30 days, not news_data's 5.
    out["history_digest"] = [{"date": h["date"], "title": h.get("title") or h.get("ko", ""),
                              "url": h["url"]} for h in hist]
    json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"story-dedup [{section}] candidates: {len(items)}  kept: {len(kept)}  "
          f"dropped(same story): {len(dropped)}  review: {out['story_dedup']['review']}  "
          f"history: {len(hist)} cards/{DAYS}d")
    for c, m in dropped:
        print(f"  DROP   {c.get('title', '')[:70]}\n         = [{m['date']}] {m['title'][:70]} ({m['score']})")
    for c in kept:
        if "history_match" in c:
            m = c["history_match"]
            print(f"  {'LIKELY' if m['band'] == 'likely-repeat' else 'REVIEW'} {c.get('title', '')[:70]}\n         ~ [{m['date']}] {m['title'][:70]} ({m['score']})")
    for i, j, s in pairs:
        print(f"  SAME-TODAY ({s}) {kept[i].get('title', '')[:50]} <> {kept[j].get('title', '')[:50]}")
    return 0


def verify(section, sel_path, ledger, today=None):
    sel = json.load(open(sel_path, encoding="utf-8"))
    picks = items_of(sel)
    today = today or (sel.get("date") if isinstance(sel, dict) else None) or str(Date.today())
    hist = load_history(ledger, section, today)
    idx, best = matcher(picks, hist)
    errors = []

    dd = sel.get("dedup") if isinstance(sel, dict) else None
    checks = dd.get("checks") if isinstance(dd, dict) else None
    if not isinstance(checks, dict):
        errors.append("no `dedup.checks` record — every pick needs the curator's verdict "
                      "against the 30-day history (see story_dedup.py docstring)")
        checks = {}

    for p in picks:
        url = p.get("url", "")
        m = best(p)
        if m and m["score"] >= DUP:
            errors.append(f"REPEAT {url} = published [{m['date']}] {m['url']} ({m['score']})")
        ck = checks.get(url)
        if checks and not isinstance(ck, dict):
            errors.append(f"NO VERDICT for {url} — added after curation? Re-run the curator's "
                          f"dedup check on it (or swap it out)")
            continue
        if not ck:
            continue
        verdict = ck.get("verdict")
        if verdict not in ("new", "follow-up"):
            errors.append(f"bad verdict {verdict!r} for {url} (new | follow-up)")
        if verdict == "follow-up" and not (str(ck.get("nearest", "")).strip()
                                           and str(ck.get("new_action", "")).strip()):
            errors.append(f"follow-up {url} must name `nearest` (the published story) and "
                          f"`new_action` (the new decision/filing/release)")
        if m and m["score"] >= REVIEW and not str(ck.get("nearest", "")).strip():
            errors.append(f"UNACKNOWLEDGED match: {url} ~ [{m['date']}] {m['url']} "
                          f"({m['score']}) — set `nearest` and decide new vs follow-up")

    vecs = [idx.vec(p) for p in picks]
    for i, j, s in similar_pairs(vecs, PICK_PAIR):
        errors.append(f"SAME STORY twice today ({s}): {picks[i].get('url')} & {picks[j].get('url')}")

    if errors:
        print(f"story-dedup verify [{section}] FAILED ({len(errors)}):")
        for e in errors:
            print("  - " + e)
        return 1
    print(f"story-dedup verify [{section}] OK: {len(picks)} picks vs {len(hist)} published/{DAYS}d")
    return 0


def main(argv):
    if not argv or argv[0] not in ("annotate", "verify"):
        print(__doc__)
        return 2
    args = {"--section": "design", "--candidates": None, "--out": None, "--selected": None,
            "--ledger": "story_ledger.json", "--today": None}
    it = iter(argv[1:])
    for a in it:
        if a in args:
            args[a] = next(it)
    sec = args["--section"]
    if argv[0] == "annotate":
        cand = args["--candidates"] or f"candidates_filtered_{sec}.json"
        doc = json.load(open(cand, encoding="utf-8"))
        today = args["--today"] or (doc.get("date") if isinstance(doc, dict) else None) \
            or str(Date.today())
        return annotate(sec, cand, args["--out"] or cand, args["--ledger"], today)
    return verify(sec, args["--selected"] or f"selected_{sec}.json", args["--ledger"],
                  args["--today"])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
