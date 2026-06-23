import json, os, subprocess, tempfile

d = tempfile.mkdtemp()
nd = {"today":{"date":"2026-06-21","cards":[
        {"id":"vr","tool":"VR","eyebrow":"AI NEWS","headline":"옛 헤드라인","body":"b","source":"SGW","url":"https://old","accent":"#eb367f","motif":"headset"}]},
      "days":[{"date":f"2026-06-1{n}","cards":[]} for n in range(4,9)]}  # 5 existing days
json.dump(nd, open(f"{d}/news_data.json","w"), ensure_ascii=False)
cards = {"date":"2026-06-22","cards":[
        {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"새\n헤드라인","mini_headline":"새 미니","body":"b","source":"Figma","url":"https://new","accent":"#0070f3","motif":"frame"}]}
json.dump(cards, open(f"{d}/cards.json","w"), ensure_ascii=False)
media = {"date":"2026-06-22","media":[{"id":"figma","type":"image","src":"pipeline/media/figma.jpg"}]}
json.dump(media, open(f"{d}/media.json","w"), ensure_ascii=False)

subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d}/news_data.json", "--cards", f"{d}/cards.json", "--media", f"{d}/media.json"], check=True)
res = json.load(open(f"{d}/news_data.json", encoding="utf-8"))

# new today is the figma card, with image merged in; mini_headline dropped from hero
assert res["today"]["date"] == "2026-06-22"
assert res["today"]["cards"][0]["image"] == "pipeline/media/figma.jpg"
assert "mini_headline" not in res["today"]["cards"][0]
# previous today became newest day, as mini-cards (5 fields only)
assert res["days"][-1]["date"] == "2026-06-21"
mini = res["days"][-1]["cards"][0]
assert set(mini.keys()) == {"tool","headline","source","url","accent"}
# prev card had no mini_headline and a \n in its headline -> deck uses single line
assert mini["headline"] == "옛 헤드라인"
# days trimmed to 5
assert len(res["days"]) == 5

# --- deck headline source: mini_headline preferred, else \n stripped from headline ---
d2 = tempfile.mkdtemp()
nd2 = {"today":{"date":"2026-06-22","cards":[
        {"id":"x","tool":"X","eyebrow":"AI NEWS","headline":"두 줄\n헤드라인","mini_headline":"짧은 미니","body":"b","source":"S","url":"https://x","accent":"#000000","motif":"frame"}]},
       "days":[]}
json.dump(nd2, open(f"{d2}/news_data.json","w"), ensure_ascii=False)
nc = {"date":"2026-06-23","cards":[{"id":"y","tool":"Y","headline":"오늘\n둘","body":"b","source":"S","url":"https://y","accent":"#111111","motif":"frame"}]}
json.dump(nc, open(f"{d2}/cards.json","w"), ensure_ascii=False)
json.dump({"date":"2026-06-23","media":[]}, open(f"{d2}/media.json","w"), ensure_ascii=False)
subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d2}/news_data.json", "--cards", f"{d2}/cards.json", "--media", f"{d2}/media.json"], check=True)
r2 = json.load(open(f"{d2}/news_data.json", encoding="utf-8"))
assert r2["days"][-1]["cards"][0]["headline"] == "짧은 미니"   # mini_headline wins

# --- re-publishing the same date is idempotent: that date stays in `today`
#     ONLY and never leaks into the deck (no today/deck duplication) ---
nc2 = {"date":"2026-06-23","cards":[{"id":"z","tool":"Z","mini_headline":"재실행","headline":"h","body":"b","source":"S","url":"https://z","accent":"#222222","motif":"frame"}]}
json.dump(nc2, open(f"{d2}/cards2.json","w"), ensure_ascii=False)
subprocess.run(["python3", os.path.abspath("roll.py"),
  "--data", f"{d2}/news_data.json", "--cards", f"{d2}/cards2.json", "--media", f"{d2}/media.json"], check=True)
r3 = json.load(open(f"{d2}/news_data.json", encoding="utf-8"))
dates = [d["date"] for d in r3["days"]]
assert r3["today"]["date"] == "2026-06-23"        # stays today
assert dates.count("2026-06-23") == 0, dates      # never duplicated into the deck
print("roll OK")
