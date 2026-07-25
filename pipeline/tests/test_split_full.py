import importlib.util, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("build_data", os.path.join(ROOT, "build_data.py"))
bd = importlib.util.module_from_spec(spec); spec.loader.exec_module(bd)

def sample():
    return {"sections": {"design": {"today": {"cards": [
        {"id": "alpha", "headline": "A", "body": "b", "url": "u1",
         "full": {"mode": "summary", "blocks": [{"t": "p", "x": "DEEP1"}, {"t": "p", "x": "DEEP2"}]}},
        {"id": "beta", "headline": "B", "body": "b", "url": "u2",
         "full": {"mode": "summary", "blocks": [{"t": "p", "x": "LOCKED_DEEP"}]}},
        {"id": "gamma", "headline": "G", "body": "b", "url": "u3"},  # no full, also locked
    ]}, "days": [{"date": "2026-07-24", "cards": [
        {"id": "delta", "headline": "D", "body": "b", "url": "u4",
         "full": {"mode": "full", "blocks": [{"t": "p", "x": "ARCHIVE1"}, {"t": "p", "x": "ARCHIVE2"}]}},
    ]}]}}}

def run():
    data = sample()
    premium = bd.split_teaser(data)

    today = data["sections"]["design"]["today"]
    cards = today["cards"]

    # ALL today cards stay public (v2: locked cards are no longer removed)
    assert len(cards) == 3, "today.cards must keep every card (free + locked) public"

    # free card: COMPLETE, untruncated full — no teaser cutoff, no hasMore
    free = cards[0]
    assert free["id"] == "alpha"
    assert free["free"] is True
    assert free["full"]["blocks"] == [{"t": "p", "x": "DEEP1"}, {"t": "p", "x": "DEEP2"}], \
        "free card keeps ALL its blocks in the public payload"
    assert free["hasFull"] is True
    assert "hasMore" not in free["full"], "v2 free card has no hasMore/teaser cutoff"

    # locked cards: present in public news with front fields, NO full key, locked: True
    beta = next(c for c in cards if c["id"] == "beta")
    gamma = next(c for c in cards if c["id"] == "gamma")
    assert beta["locked"] is True and gamma["locked"] is True
    assert "full" not in beta, "locked card's full must be stripped from the public payload"
    assert "full" not in gamma
    assert beta["headline"] == "B" and beta["body"] == "b" and beta["url"] == "u2", \
        "locked card keeps its front fields public"
    assert beta["hasFull"] is True   # had blocks
    assert gamma["hasFull"] is False  # never had a full at all

    # locked cards' blocks land in the premium map, keyed "<section>/<id>"
    assert premium["design/beta"]["blocks"] == [{"t": "p", "x": "LOCKED_DEEP"}]
    assert "design/gamma" not in premium, "gamma never had blocks, nothing to stash"
    assert "design/alpha" not in premium, "free card needs no premium stash (already public)"

    # lockedCount reflects the 2 locked cards (beta, gamma)
    assert today["lockedCount"] == 2, "lockedCount must count the locked cards"

    # archive cards: fully public — no teaser, no locking
    day0 = data["sections"]["design"]["days"][0]
    arch_card = day0["cards"][0]
    assert arch_card["full"]["blocks"] == [{"t": "p", "x": "ARCHIVE1"}, {"t": "p", "x": "ARCHIVE2"}], \
        "archive card keeps ALL its blocks"
    assert arch_card["hasFull"] is True
    assert "locked" not in arch_card
    assert "design/delta" not in premium, "archive cards need no premium stash (already public)"

    # public JS must carry lockedCount + every card's full front content; only
    # locked-card deep-dive blocks must never leak.
    js = bd.to_js(data)
    assert '"lockedCount": 2' in js, "public JS carries per-section lockedCount"
    assert "DEEP1" in js and "DEEP2" in js, "free card's full deep-dive IS public"
    assert "ARCHIVE1" in js and "ARCHIVE2" in js, "archive card's full deep-dive IS public"
    assert "LOCKED_DEEP" not in js, "locked card's deep-dive must not leak into public JS"
    assert '"locked": true' in js, "public JS marks locked cards"
    assert '"hasFull"' in js, "public JS carries hasFull flag"

    print("PASS test_split_full")

if __name__ == "__main__":
    try:
        run()
    except AssertionError as e:
        print("FAIL:", e); sys.exit(1)
