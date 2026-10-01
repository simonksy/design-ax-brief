"""Roll news_data.json: today -> days (mini-cards), set new today from cards+media."""
import argparse, json, os, sys

# Deck cards keep the FULL card payload (eyebrow/body/full) so that opening a past
# card shows the exact same main-card layout — thumbnail · headline · summary · Read —
# as today's cards. The deck thumbnail itself only renders headline+image.
MINI = ("id","eyebrow","tool","headline","body","source","url","accent","motif")

def mini_card(c):
    # deck headline stays single-line (deck thumbnails are compact)
    head = c.get("mini_headline") or c.get("headline", "").replace("\n", " ")
    d = {k: c.get(k, "") for k in MINI}
    d["headline"] = head
    if c.get("image"):           # source banner image on the deck card
        d["image"] = c["image"]
    if c.get("full"):            # the translated article, so the opened card can flip to Read
        d["full"] = c["full"]
    return d

def roll(data, cards, media):
    media_by_id = {m["id"]: m for m in media.get("media", [])}
    prev = data.get("today")
    new_date = cards["date"]
    # Only archive the previous today if it's a DIFFERENT day. Re-publishing the
    # same date must be idempotent (never push today's date into the deck).
    if prev and prev.get("cards") and prev["date"] != new_date:
        date = prev["date"]
        days = data.setdefault("days", [])
        days[:] = [d for d in days if d.get("date") != date]  # dedup: re-runs idempotent
        # cross-day + intra-day dedup (earliest-wins): a story already shown on an
        # earlier day is dropped so the same news never repeats. Matched by URL only —
        # a shared thumbnail is NOT a duplicate (distinct articles can share a
        # source's site-wide OG image; ax-media gives each a distinct in-article one).
        seen_url = {c.get("url") for day in days for c in day.get("cards", [])}
        fresh = []
        for c in prev["cards"]:
            mc = mini_card(c)
            if mc.get("url") in seen_url:
                continue
            fresh.append(mc)
            seen_url.add(mc.get("url"))
        days.append({"date": date, "cards": fresh})
    # the new today's date must never live in the deck (it lives in `today`)
    data["days"] = [d for d in data.get("days", []) if d.get("date") != new_date][-5:]
    new_cards = []
    for c in cards["cards"]:
        c = dict(c)
        m = media_by_id.get(c["id"])
        if m and m.get("src"):
            if m.get("type") == "video":
                # Video plays only on today's active hero card. We also keep the
                # poster still as `image` so the deck/archive mini-cards (which never
                # carry `video`), the build-time thumbnail check, and any <video>
                # fallback all have a still. og:image is the poster's last resort.
                c["video"] = m["src"]
                if m.get("webm"):
                    c["webm"] = m["webm"]
                poster = m.get("poster") or m.get("og_image")
                if poster:
                    c["poster"] = poster
                    c["image"] = poster
            elif m.get("type") == "image":
                c["image"] = m["src"]
        c.pop("mini_headline", None)  # mini_headline only used for the deck on next roll
        new_cards.append(c)
    data["today"] = {"date": cards["date"], "cards": new_cards}
    return data

def story_gate(a, cards):
    """Refuse to roll unless every card went through the curator's story-dedup check.

    2026-10-01: a cross-section swap put a card in after curation, and it repeated a
    running story the previous day had already flagged. So the gate checks the FINAL
    cards: each must be a pick in selected_<section>.json, and that selection must pass
    story_dedup.verify (verdict per pick, no repeat of the 30-day history, no two picks
    on one story)."""
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    import story_dedup
    sel_path = a.selected or os.path.join(os.path.dirname(os.path.abspath(a.cards)),
                                          f"selected_{a.section}.json")
    if not os.path.exists(sel_path):
        sys.exit(f"roll: story gate — {sel_path} not found (pass --selected, or "
                 f"--no-story-check for a manual repair)")
    sel = json.load(open(sel_path, encoding="utf-8"))
    picked = {p.get("url") for p in story_dedup.items_of(sel)}
    stray = [c.get("url") for c in cards.get("cards", []) if c.get("url") not in picked]
    if stray:
        sys.exit("roll: story gate — card(s) not in the curator's selection (swapped in "
                 "after curation? re-run the curator's dedup check):\n  " + "\n  ".join(stray))
    ledger = a.story_ledger or os.path.join(here, "story_ledger.json")
    if story_dedup.verify(a.section, sel_path, ledger, cards.get("date")):
        sys.exit("roll: story gate FAILED — fix the selection (see above); nothing rolled")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="news_data.json")
    ap.add_argument("--cards", required=True)
    ap.add_argument("--media", required=True)
    ap.add_argument("--section", default="design")
    ap.add_argument("--selected", help="curator selection to gate on "
                    "(default: selected_<section>.json next to --cards)")
    ap.add_argument("--story-ledger", help="default: story_ledger.json next to this script")
    ap.add_argument("--no-story-check", action="store_true",
                    help="skip the story-dedup gate (tests / manual repair only)")
    a = ap.parse_args()
    data = json.load(open(a.data, encoding="utf-8"))
    cards = json.load(open(a.cards, encoding="utf-8"))
    if not a.no_story_check:
        story_gate(a, cards)
    media = json.load(open(a.media, encoding="utf-8"))
    # Section-keyed news_data: roll only within sections[<section>].
    sections = data.setdefault("sections", {})
    sec = sections.setdefault(a.section, {"today": {"date": None, "cards": []}, "days": []})
    roll(sec, cards, media)   # mutates sec["today"]/sec["days"] in place
    json.dump(data, open(a.data, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
