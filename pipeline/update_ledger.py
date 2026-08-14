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
"""
import json
import sys


def main(argv):
    args = {"--news": "news_data.json", "--ledger": "published_urls.json"}
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
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
