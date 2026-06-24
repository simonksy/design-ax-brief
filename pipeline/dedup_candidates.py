#!/usr/bin/env python3
"""Pre-filter candidates against already-published history (URL backstop).

Runs at the DECISION-GATE stage — BEFORE the candidate list is shown to the
user — so the user never picks a story that was already published. This is the
deterministic URL half of the dedup rule that ax-curator applies on URL+CONTENT.
Content-level duplicates across different URLs still need curator/human judgment;
this script flags exact + normalized URL matches against the last N days.

Usage:
    python3 dedup_candidates.py [--news news_data.json] [--candidates candidates.json]
                                [--out candidates_filtered.json] [--days 5]

Writes <out> with only the non-duplicate items (same schema as candidates.json),
and prints a human-readable report (kept / dropped with the matched date).
Exit code 0 always; this is a filter, not a gate.
"""
import json
import sys
from urllib.parse import urlsplit


def norm_url(u: str) -> str:
    """Normalize for comparison: lowercase host, strip scheme/fragment/query,
    drop trailing slash. Keeps path so distinct articles on one host stay distinct."""
    if not u:
        return ""
    s = urlsplit(u.strip())
    host = (s.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = s.path.rstrip("/")
    return f"{host}{path}"


def published_urls(news: dict, days: int):
    """Collect (norm_url -> date) for today + the last `days` archived days."""
    out = {}
    today = news.get("today")
    if isinstance(today, dict):
        for c in today.get("cards", []):
            nu = norm_url(c.get("url", ""))
            if nu:
                out.setdefault(nu, today.get("date", "today"))
    for day in (news.get("days") or [])[:days]:
        d = day.get("date", "")
        for c in day.get("cards", []):
            nu = norm_url(c.get("url", ""))
            if nu:
                out.setdefault(nu, d)
    return out


def main(argv):
    args = {"--news": "news_data.json", "--candidates": "candidates.json",
            "--out": "candidates_filtered.json", "--days": "5"}
    it = iter(argv)
    for a in it:
        if a in args:
            args[a] = next(it)
    news = json.load(open(args["--news"]))
    cand = json.load(open(args["--candidates"]))
    items = cand["items"] if isinstance(cand, dict) else cand
    seen = published_urls(news, int(args["--days"]))

    kept, dropped = [], []
    for c in items:
        match = seen.get(norm_url(c.get("url", "")))
        (dropped if match else kept).append((c, match))

    out = dict(cand) if isinstance(cand, dict) else {"items": []}
    out["items"] = [c for c, _ in kept]
    out["dedup"] = {"dropped": len(dropped), "kept": len(kept),
                    "against_days": int(args["--days"])}
    json.dump(out, open(args["--out"], "w"), ensure_ascii=False, indent=2)

    print(f"candidates: {len(items)}  kept: {len(kept)}  dropped(url-dup): {len(dropped)}")
    if dropped:
        print("\nDROPPED — already published (URL match):")
        for c, when in dropped:
            print(f"  [{when}] {c.get('source','')}: {c.get('url','')}")
    print("\nKEPT — not previously published by URL:")
    for c, _ in kept:
        print(f"  {c.get('source','')} | {c.get('category','')} | {c.get('url','')}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
