"""Check a post folder's copy against the card layout without rendering.

usage: python3 social/instagram/daily/fitcheck.py <post folder>   → prints FIT OK / FIT FAIL"""
import json, os, sys
post = os.path.abspath(sys.argv[1])
sys.argv = ["render.py", post]
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import render
cards = json.load(open(os.path.join(post, "cards.json"), encoding="utf-8"))["cards"]
for c in cards:
    print(c["n"], c["kind"], render.fit_report(c), c.get("headline", ""))
bad = render.check_fit(cards)
print("FIT OK" if not bad else f"FIT FAIL {bad}")
sys.exit(1 if bad else 0)
