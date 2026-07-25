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
    premium, premium_locked = bd.split_teaser(data)

    today = data["sections"]["design"]["today"]
    cards = today["cards"]

    # only the free card remains public
    assert len(cards) == 1, "today.cards must be pruned to just the free card"
    free = cards[0]
    assert free["id"] == "alpha"
    assert free["free"] is True

    # free card: teaser-only full (first block + hasMore)
    assert free["full"]["blocks"] == [{"t": "p", "x": "DEEP1"}], "free card keeps only the first block"
    assert free["full"]["hasMore"] is True, "free card had 2 blocks -> hasMore True"
    assert free["hasFull"] is True

    # lockedCount reflects the 2 removed cards (beta, gamma)
    assert today["lockedCount"] == 2, "lockedCount must count the removed cards"

    # locked cards are gone from public cards but present (whole, untruncated) in premium_locked
    ids_public = {c["id"] for c in cards}
    assert "beta" not in ids_public and "gamma" not in ids_public, "locked cards removed from public payload"
    assert premium_locked["design/beta"]["full"]["blocks"] == [{"t": "p", "x": "LOCKED_DEEP"}], \
        "locked card stored whole (front+full) in premium_locked"
    assert premium_locked["design/gamma"]["id"] == "gamma"

    # premium carries the free card's ORIGINAL (untruncated) full
    assert premium["design/alpha"]["blocks"] == [{"t": "p", "x": "DEEP1"}, {"t": "p", "x": "DEEP2"}]

    # archive cards: teased in place (NOT removed/locked), original stashed in premium
    day0 = data["sections"]["design"]["days"][0]
    arch_card = day0["cards"][0]
    assert arch_card["full"]["blocks"] == [{"t": "p", "x": "ARCHIVE1"}], "archive card teased to first block"
    assert arch_card["full"]["hasMore"] is True
    assert arch_card["hasFull"] is True
    assert premium["design/delta"]["blocks"] == [{"t": "p", "x": "ARCHIVE1"}, {"t": "p", "x": "ARCHIVE2"}]

    # public JS must carry lockedCount + hasMore, and never leak locked/deep content
    js = bd.to_js(data)
    assert '"lockedCount": 2' in js, "public JS carries per-section lockedCount"
    assert "DEEP2" not in js, "free card's 2nd paragraph must not leak into public JS"
    assert "LOCKED_DEEP" not in js, "locked card content must not leak into public JS"
    assert "ARCHIVE2" not in js, "archive card's 2nd paragraph must not leak into public JS"
    assert '"hasMore": true' in js, "public JS carries hasMore flag"
    assert '"hasFull"' in js, "public JS carries hasFull flag"

    print("PASS test_split_full")

if __name__ == "__main__":
    try:
        run()
    except AssertionError as e:
        print("FAIL:", e); sys.exit(1)
