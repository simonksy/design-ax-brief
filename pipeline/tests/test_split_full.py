import importlib.util, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("build_data", os.path.join(ROOT, "build_data.py"))
bd = importlib.util.module_from_spec(spec); spec.loader.exec_module(bd)

def sample():
    return {"sections": {"design": {"today": {"cards": [
        {"id": "alpha", "headline": "A", "body": "b", "url": "u1",
         "full": {"mode": "summary", "blocks": [{"t": "p", "x": "DEEP"}]}},
        {"id": "beta", "headline": "B", "body": "b", "url": "u2"},  # no full
    ]}, "days": [{"date": "2026-07-24", "cards": [
        {"id": "gamma", "headline": "G", "body": "b", "url": "u3",
         "full": {"mode": "full", "blocks": [{"t": "p", "x": "ARCHIVE_DEEP"}]}},
    ]}]}}}

def run():
    data = sample()
    premium = bd.split_full(data)
    cards = data["sections"]["design"]["today"]["cards"]
    assert "full" not in cards[0], "full must be stripped from public card"
    assert cards[0]["hasFull"] is True, "card with full → hasFull True"
    assert cards[1]["hasFull"] is False, "card without full → hasFull False"
    assert premium["design/alpha"]["blocks"][0]["x"] == "DEEP"
    assert premium["design/gamma"]["blocks"][0]["x"] == "ARCHIVE_DEEP", "archive full included"
    js = bd.to_js(data)
    assert "DEEP" not in js, "deep-dive text must not leak into public JS"
    assert '"hasFull"' in js, "public JS carries hasFull flag"
    print("PASS test_split_full")

if __name__ == "__main__":
    try:
        run()
    except AssertionError as e:
        print("FAIL:", e); sys.exit(1)
