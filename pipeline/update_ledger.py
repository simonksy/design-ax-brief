#!/usr/bin/env python3
"""Fold the current news_data.json into the permanent published-URL ledger.

news_data.json only carries ~5 days per section, but freshness windows run to
14 days — so without a durable record a story that scrolls out of news_data
gets re-collected as "fresh" and republished. Run this right after roll.py so
the next day's dedup_candidates.py sees today's URLs forever.

Usage:
    python3 update_ledger.py [--news news_data.json] [--ledger published_urls.json]

Idempotent, append-only: an existing (section, url) keeps its ORIGINAL date, so
earliest-wins survives re-runs.

Also (re)builds story_ledger.json — the same published cards with the English source
title + excerpt (from the curator's selected_*.json files, current and archived under
runs/) and the Korean headline/body (from archive.json). story_dedup.py scores new
candidates against it to catch the same story under a different URL.
"""
import glob
import json
import os
import sys


def build_story_ledger(ledger, base, out_path):
    """{section: [{url, date, title, excerpt, ko}]} for every URL in the ledger."""
    # Curator picks first, then the librarian's candidate files — selected_*.json
    # sometimes omits `title`, the candidates always carry it. First non-empty wins.
    src = {}
    # Seed from the EXISTING story_ledger.json first: runs/ is gitignored/ephemeral, so
    # an environment that lacks it (a fresh worktree, a stale CI checkout) must never
    # blank out titles/excerpts this file already has. Everything below only fills
    # slots that are still empty.
    try:
        for urls in json.load(open(out_path, encoding="utf-8")).values():
            for h in urls:
                u = (h.get("url") or "").strip()
                if u and (h.get("title") or h.get("excerpt")):
                    e = src.setdefault(u, {"title": "", "excerpt": ""})
                    e["title"] = e["title"] or h.get("title") or ""
                    e["excerpt"] = e["excerpt"] or h.get("excerpt") or ""
    except (OSError, ValueError):
        pass
    pats = []
    for kind in ("selected", "candidates"):
        pats += [os.path.join(base, "runs", "*", "*", kind + "_*.json"),
                 os.path.join(base, "runs", "*", kind + "*.json"),
                 os.path.join(base, kind + "_*.json")]
    for f in [f for p in pats for f in sorted(glob.glob(p))]:
        try:
            doc = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        picks = doc if isinstance(doc, list) else (
            doc.get("picks") or doc.get("items") or doc.get("candidates") or [])
        for p in picks:
            u = (p.get("url") or "").strip() if isinstance(p, dict) else ""
            if not u:
                continue
            e = src.setdefault(u, {"title": "", "excerpt": ""})
            e["title"] = e["title"] or p.get("title") or p.get("headline") or ""
            e["excerpt"] = e["excerpt"] or (p.get("excerpt") or "")[:600]
    # Prefer the card's own source-language summary (news_data's `text`) over the
    # English curator/librarian title above — story_dedup should compare like with like.
    try:
        from i18n_text import source_fields
        news_path = os.path.join(base, "news_data.json")
        for sec in (json.load(open(news_path, encoding="utf-8")).get("sections") or {}).values():
            for day in [sec.get("today") or {}] + (sec.get("days") or []):
                for c in day.get("cards", []):
                    if c.get("text") and c.get("url"):
                        f, _ = source_fields(c)
                        e = src.setdefault(c["url"].strip(), {"title": "", "excerpt": ""})
                        e["title"] = e["title"] or (f.get("headline") or "").replace("\n", " ")
                        e["excerpt"] = e["excerpt"] or f.get("body") or ""
    except (OSError, ValueError):
        pass
    ko = {}
    try:
        for c in json.load(open(os.path.join(base, "archive.json"), encoding="utf-8"))["cards"]:
            ko[(c.get("url") or "").strip()] = " ".join(
                [c.get("headline", "").replace("\n", " "), c.get("body", "")])
    except (OSError, ValueError, KeyError):
        pass
    story = {}
    for section, urls in ledger.items():
        story[section] = [dict({"url": u, "date": d, "ko": ko.get(u, "")},
                               **src.get(u, {"title": "", "excerpt": ""}))
                          for u, d in sorted(urls.items(), key=lambda kv: (kv[1], kv[0]))]
    json.dump(story, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with_title = sum(1 for s in story.values() for h in s if h["title"])
    total = sum(len(s) for s in story.values())
    print(f"story ledger: {total} cards ({with_title} with source title) -> {out_path}")


def main(argv):
    args = {"--news": "news_data.json", "--ledger": "published_urls.json",
            "--story": None}
    it = iter(argv)
    for a in it:
        if a in args:
            args[a] = next(it)

    news = json.load(open(args["--news"], encoding="utf-8"))
    try:
        ledger = json.load(open(args["--ledger"], encoding="utf-8"))
    except (OSError, ValueError):
        ledger = {}

    added = 0
    for section, sec in (news.get("sections") or {}).items():
        entry = ledger.setdefault(section, {})
        for day in [sec.get("today") or {}] + (sec.get("days") or []):
            date = day.get("date", "")
            for card in day.get("cards", []):
                url = (card.get("url") or "").strip()
                if url and url not in entry:
                    entry[url] = date
                    added += 1

    ledger = {s: dict(sorted(urls.items())) for s, urls in sorted(ledger.items())}
    json.dump(ledger, open(args["--ledger"], "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"ledger: +{added} new URLs  "
          f"({ {s: len(u) for s, u in ledger.items()} })")
    base = os.path.dirname(os.path.abspath(args["--ledger"]))
    build_story_ledger(ledger, base, args["--story"] or os.path.join(base, "story_ledger.json"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
