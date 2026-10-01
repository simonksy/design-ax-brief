"""Regression tests for story_dedup.py + the roll.py story gate.

Texts are the real cases that leaked or nearly leaked (2026-07..10): the same Beeble
release published twice, Ars vs WIRED on one Anthropic ruling, TechRadar site chrome as
an excerpt, and the 2026-10-01 politics card swapped in after curation."""
import json, os, subprocess, tempfile

import story_dedup as sd

HERE = os.path.dirname(os.path.abspath(__file__))
d = tempfile.mkdtemp()
P = lambda n: os.path.join(d, n)

ledger = {"movies": [
    {"url": "https://a.example/beeble-switchx-2", "date": "2026-09-13", "ko": "",
     "title": "Beeble introduces SwitchX 2.0 with native 4K, longer shots and a Reframe tool",
     "excerpt": "Beeble's SwitchX 2.0 relights live-action footage at native 4K, extends clips to 20 seconds and adds Reframe."},
    {"url": "https://a.example/otoy-2026-4", "date": "2026-09-10", "ko": "",
     "title": "Otoy releases OctaneRender 2026.4", "excerpt": "The GPU renderer adds AI denoising."},
], "politics": [
    {"url": "https://www.wired.com/story/openai-pauses-training", "date": "2026-09-29", "ko": "",
     "title": "OpenAI Pauses Training Its Most Powerful Models After Rogue Agents Target Government Sites",
     "excerpt": "Sam Altman said the company's response was not as fast as he wanted after agents probed government websites."},
]}
# realistic IDF: with only two history docs every shared word looks rare
FILLER = ["Adobe releases Firefly video model update", "Runway releases Gen-5 for studios",
          "Netflix tests generative trailers", "Sony releases new camera with AI autofocus",
          "Blackmagic releases DaVinci Resolve beta", "Autodesk releases Flow Studio tools",
          "Pika releases lip sync model", "Luma releases Ray 3 video model",
          "Google releases Veo update for creators", "Kling releases 3.0 with longer shots"]
ledger["movies"] += [{"url": f"https://f.example/{i}", "date": "2026-09-05", "ko": "",
                      "title": t, "excerpt": t + " with new features for editors."}
                     for i, t in enumerate(FILLER)]
json.dump(ledger, open(P("story_ledger.json"), "w"))

# --- annotate: near-verbatim repeat is dropped; a new version of a product is only flagged
cand = {"date": "2026-09-22", "items": [
    {"url": "https://b.example/switchx-2-0", "title": "Beeble SwitchX 2.0: native 4K, 20-second clips and a Reframe tool",
     "excerpt": "SwitchX 2.0 from Beeble relights footage at native 4K with 20 second clips and Reframe."},
    {"url": "https://b.example/otoy-2027-1", "title": "Otoy releases OctaneRender 2027.1 in alpha",
     "excerpt": "The new alpha brings neural rendering."},
    {"url": "https://www.techradar.com/x", "title": "I tried Peloton's redesigned Tread Vision",
     "excerpt": "Weekly newsletters Get daily news, weekly deals and the week's top tech stories Commenting access"},
    {"url": "https://www.techradar.com/y", "title": "Freckle Phone has a kid-friendly name",
     "excerpt": "Weekly newsletters Get daily news, weekly deals and the week's top tech stories Commenting access"},
]}
json.dump(cand, open(P("cand.json"), "w"))
sd.annotate("movies", P("cand.json"), P("out.json"), P("story_ledger.json"), "2026-09-22")
out = json.load(open(P("out.json")))
urls = [c["url"] for c in out["items"]]
assert "https://b.example/switchx-2-0" not in urls, "same Beeble release must be dropped"
assert out["story_dedup"]["dropped"][0]["match"]["url"] == "https://a.example/beeble-switchx-2"
otoy = next(c for c in out["items"] if "otoy" in c["url"])
assert otoy["history_match"]["url"] == "https://a.example/otoy-2026-4"   # flagged, kept
assert not any("cluster" in c for c in out["items"]), "shared site chrome is not a story match"
assert len(out["history_digest"]) == 12                                    # 30-day digest

# --- verify: the curator's per-pick verdict is mandatory
ars = {"url": "https://arstechnica.com/court-rules-trump-can-blacklist-anthropic",
       "title": "Court rules Trump can blacklist Anthropic for refusing to enable Claude features",
       "excerpt": "A divided appeals court panel let the Pentagon keep its supply-chain risk designation of Anthropic."}
wired = {"url": "https://www.wired.com/story/appeals-court-lets-pentagon-designate-anthropic",
         "title": "Appeals Court Lets the Pentagon Designate Anthropic a Supply-Chain Risk",
         "excerpt": "The appeals court panel let the Pentagon keep the supply-chain risk designation for Anthropic."}
suit = {"url": "https://arstechnica.com/lawsuit-demands-openai-halt",
        "title": "\"An AI did it\" is no defense, says nonprofit suing OpenAI over Hugging Face hack",
        "excerpt": "LASST seeks an injunction barring OpenAI agents from accessing third-party systems."}

def sel(picks, checks):
    doc = {"date": "2026-10-01", "section": "politics", "picks": picks}
    if checks is not None:
        doc["dedup"] = {"checks": checks}
    json.dump(doc, open(P("sel.json"), "w"))
    return sd.verify("politics", P("sel.json"), P("story_ledger.json"))

new = lambda: {"verdict": "new", "nearest": "", "new_action": ""}
assert sel([ars], None) == 1                                    # no record at all
assert sel([ars], {ars["url"]: new()}) == 0
assert sel([ars, wired], {ars["url"]: new(), wired["url"]: new()}) == 1   # same story twice
assert sel([ars, suit], {ars["url"]: new()}) == 1               # suit added after curation
assert sel([suit], {suit["url"]: {"verdict": "follow-up", "nearest": "", "new_action": ""}}) == 1
assert sel([suit], {suit["url"]: {"verdict": "follow-up",
                                  "nearest": "https://www.wired.com/story/openai-pauses-training",
                                  "new_action": "LASST filed suit seeking an injunction"}}) == 0

# --- roll.py gate: a card that is not in the selection never gets rolled
nd = {"sections": {"politics": {"today": {"date": "2026-09-30", "cards": []}, "days": []}}}
json.dump(nd, open(P("news_data.json"), "w"))
card = lambda p, i: {"id": i, "tool": "Politics", "eyebrow": "AI NEWS", "headline": "h", "body": "b",
                     "source": "S", "url": p["url"], "accent": "#000", "motif": "cube"}
json.dump({"date": "2026-10-01", "cards": [card(ars, "a"), card(suit, "s")]}, open(P("cards.json"), "w"))
json.dump({"media": []}, open(P("media.json"), "w"))
sel([ars], {ars["url"]: new()})
roll = lambda: subprocess.run(["python3", os.path.join(HERE, "roll.py"), "--section", "politics",
                               "--data", P("news_data.json"), "--cards", P("cards.json"),
                               "--media", P("media.json"), "--selected", P("sel.json"),
                               "--story-ledger", P("story_ledger.json")],
                              capture_output=True, text=True)
r = roll()
assert r.returncode != 0 and "not in the curator's selection" in r.stderr, r.stderr
assert json.load(open(P("news_data.json")))["sections"]["politics"]["today"]["cards"] == []
sel([ars, suit], {ars["url"]: new(), suit["url"]: new()})
r = roll()
assert r.returncode == 0, r.stdout + r.stderr
assert len(json.load(open(P("news_data.json")))["sections"]["politics"]["today"]["cards"]) == 2
print("story_dedup OK")
