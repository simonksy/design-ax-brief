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
from urllib.parse import urlsplit, parse_qs


def norm_url(u: str) -> str:
    """Normalize for comparison: lowercase host, strip scheme/fragment/query,
    drop trailing slash. Keeps path so distinct articles on one host stay distinct.
    YouTube is the exception: the video id lives in the query (?v=) or the youtu.be
    path, so those collapse to youtube.com/watch?v=<id> to keep distinct videos apart."""
    if not u:
        return ""
    s = urlsplit(u.strip())
    host = (s.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = s.path.rstrip("/")
    if host in ("youtube.com", "m.youtube.com") and path == "/watch":
        vid = parse_qs(s.query).get("v", [""])[0]
        if vid:
            return f"youtube.com/watch?v={vid}"
    if host == "youtu.be" and path.lstrip("/"):
        return f"youtube.com/watch?v={path.lstrip('/')}"
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


def ledger_urls(path: str, section: str):
    """Collect (norm_url -> date) from the permanent published-URL ledger.

    news_data.json only keeps ~5 days, but the freshness window runs to 14 days
    for every section except design — so a story can age out of news_data and be
    re-collected as "fresh" a week later. The ledger is the durable record of
    every URL ever published in a section, which is what earliest-wins needs.
    Missing ledger = no extra entries (the filter still works, just narrower)."""
    try:
        led = json.load(open(path))
    except (OSError, ValueError):
        return {}
    return {norm_url(u): d for u, d in (led.get(section) or {}).items() if u}


def main(argv):
    args = {"--news": "news_data.json", "--candidates": "candidates.json",
            "--out": "candidates_filtered.json", "--days": "5", "--section": "design",
            "--ledger": "published_urls.json"}
    it = iter(argv)
    for a in it:
        if a in args:
            args[a] = next(it)
    news = json.load(open(args["--news"]))
    # Section-keyed news_data: dedup only against THIS section's published history.
    # (Falls back to the whole file for the old non-sectioned format.)
    news = (news.get("sections", {}) or {}).get(args["--section"], news)
    cand = json.load(open(args["--candidates"]))
    items = cand["items"] if isinstance(cand, dict) else cand
    seen = ledger_urls(args["--ledger"], args["--section"])
    seen.update(published_urls(news, int(args["--days"])))

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
