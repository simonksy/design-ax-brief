import json, os, subprocess, tempfile

# news_data.json is section-keyed; roll.py operates within sections[<section>]
# (default "design"). These helpers wrap/unwrap that so the assertions stay focused.
def wrap(today, days): return {"sections": {"design": {"today": today, "days": days}}}
def g(res): return res["sections"]["design"]

d = tempfile.mkdtemp()
nd = wrap({"date":"2026-06-21","cards":[
        {"id":"vr","tool":"VR","eyebrow":"AI NEWS","headline":"옛 헤드라인","body":"b","source":"SGW","url":"https://old","accent":"#eb367f","motif":"headset"}]},
      [{"date":f"2026-06-1{n}","cards":[]} for n in range(4,9)])  # 5 existing days
json.dump(nd, open(f"{d}/news_data.json","w"), ensure_ascii=False)
cards = {"date":"2026-06-22","cards":[
        {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"새\n헤드라인","mini_headline":"새 미니","body":"b","source":"Figma","url":"https://new","accent":"#0070f3","motif":"frame"}]}
json.dump(cards, open(f"{d}/cards.json","w"), ensure_ascii=False)
media = {"date":"2026-06-22","media":[{"id":"figma","type":"image","src":"pipeline/media/figma.jpg"}]}
json.dump(media, open(f"{d}/media.json","w"), ensure_ascii=False)

subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d}/news_data.json", "--cards", f"{d}/cards.json", "--media", f"{d}/media.json"], check=True)
res = g(json.load(open(f"{d}/news_data.json", encoding="utf-8")))

# new today is the figma card, with image merged in; mini_headline dropped from hero
assert res["today"]["date"] == "2026-06-22"
assert res["today"]["cards"][0]["image"] == "pipeline/media/figma.jpg"
assert "mini_headline" not in res["today"]["cards"][0]
# previous today became newest day; deck cards now keep the full payload (eyebrow/
# body/full) so an opened past card renders the same main-card layout as today's.
assert res["days"][-1]["date"] == "2026-06-21"
mini = res["days"][-1]["cards"][0]
assert set(mini.keys()) == {"id","eyebrow","tool","headline","body","source","url","accent","motif"}
# prev card had no mini_headline and a \n in its headline -> deck uses single line
assert mini["headline"] == "옛 헤드라인"
# days trimmed to 5
assert len(res["days"]) == 5

# --- deck headline source: mini_headline preferred, else \n stripped from headline ---
d2 = tempfile.mkdtemp()
nd2 = wrap({"date":"2026-06-22","cards":[
        {"id":"x","tool":"X","eyebrow":"AI NEWS","headline":"두 줄\n헤드라인","mini_headline":"짧은 미니","body":"b","source":"S","url":"https://x","accent":"#000000","motif":"frame"}]},
       [])
json.dump(nd2, open(f"{d2}/news_data.json","w"), ensure_ascii=False)
nc = {"date":"2026-06-23","cards":[{"id":"y","tool":"Y","headline":"오늘\n둘","body":"b","source":"S","url":"https://y","accent":"#111111","motif":"frame"}]}
json.dump(nc, open(f"{d2}/cards.json","w"), ensure_ascii=False)
json.dump({"date":"2026-06-23","media":[]}, open(f"{d2}/media.json","w"), ensure_ascii=False)
subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d2}/news_data.json", "--cards", f"{d2}/cards.json", "--media", f"{d2}/media.json"], check=True)
r2 = g(json.load(open(f"{d2}/news_data.json", encoding="utf-8")))
assert r2["days"][-1]["cards"][0]["headline"] == "짧은 미니"   # mini_headline wins

# --- re-publishing the same date is idempotent: that date stays in `today`
#     ONLY and never leaks into the deck (no today/deck duplication) ---
nc2 = {"date":"2026-06-23","cards":[{"id":"z","tool":"Z","mini_headline":"재실행","headline":"h","body":"b","source":"S","url":"https://z","accent":"#222222","motif":"frame"}]}
json.dump(nc2, open(f"{d2}/cards2.json","w"), ensure_ascii=False)
subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d2}/news_data.json", "--cards", f"{d2}/cards2.json", "--media", f"{d2}/media.json"], check=True)
r3 = g(json.load(open(f"{d2}/news_data.json", encoding="utf-8")))
dates = [x["date"] for x in r3["days"]]
assert r3["today"]["date"] == "2026-06-23"        # stays today
assert dates.count("2026-06-23") == 0, dates      # never duplicated into the deck

# --- video media: today's card gets video+webm+poster, and the poster doubles
#     as `image`. When today rolls into the deck, mini_card keeps only the still. ---
d3 = tempfile.mkdtemp()
nd3 = wrap({"date":"2026-06-23","cards":[
        {"id":"old","tool":"O","headline":"o","body":"b","source":"S","url":"https://old3","accent":"#000","motif":"frame"}]},
       [])
json.dump(nd3, open(f"{d3}/news_data.json","w"), ensure_ascii=False)
vc = {"date":"2026-06-24","cards":[{"id":"vid","tool":"YouTube","headline":"영상\n카드","body":"b","source":"Ch","url":"https://v","accent":"#ff2d55","motif":"frame"}]}
json.dump(vc, open(f"{d3}/cards.json","w"), ensure_ascii=False)
vm = {"date":"2026-06-24","media":[{"id":"vid","type":"video","src":"pipeline/media/vid.mp4",
       "webm":"pipeline/media/vid.webm","poster":"pipeline/media/vid.jpg"}]}
json.dump(vm, open(f"{d3}/media.json","w"), ensure_ascii=False)
subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d3}/news_data.json", "--cards", f"{d3}/cards.json", "--media", f"{d3}/media.json"], check=True)
r4 = g(json.load(open(f"{d3}/news_data.json", encoding="utf-8")))
tc = r4["today"]["cards"][0]
assert tc["video"] == "pipeline/media/vid.mp4", tc
assert tc["webm"] == "pipeline/media/vid.webm", tc
assert tc["poster"] == "pipeline/media/vid.jpg", tc
assert tc["image"] == "pipeline/media/vid.jpg", tc   # poster doubles as the still
# roll again to push the video day into the deck; mini-card keeps only the still
nc4 = {"date":"2026-06-25","cards":[{"id":"n","tool":"N","headline":"n","body":"b","source":"S","url":"https://n","accent":"#111","motif":"frame"}]}
json.dump(nc4, open(f"{d3}/cards4.json","w"), ensure_ascii=False)
json.dump({"date":"2026-06-25","media":[]}, open(f"{d3}/media4.json","w"), ensure_ascii=False)
subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d3}/news_data.json", "--cards", f"{d3}/cards4.json", "--media", f"{d3}/media4.json"], check=True)
r5 = g(json.load(open(f"{d3}/news_data.json", encoding="utf-8")))
deck_vid = r5["days"][-1]["cards"][0]
assert "video" not in deck_vid and "webm" not in deck_vid, deck_vid  # deck is still-only
assert deck_vid["image"] == "pipeline/media/vid.jpg", deck_vid       # still survives on deck

print("roll OK")
