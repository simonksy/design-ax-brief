"""Roll news_data.json: today -> days (mini-cards), set new today from cards+media."""
import argparse, json

MINI = ("tool","headline","source","url","accent")

def mini_card(c):
    # deck mini-cards are single-line: prefer the writer's mini_headline,
    # else strip the hero headline's \n wrap.
    head = c.get("mini_headline") or c.get("headline", "").replace("\n", " ")
    d = {k: c.get(k, "") for k in MINI}
    d["headline"] = head
    return d

def roll(data, cards, media):
    media_by_id = {m["id"]: m for m in media.get("media", [])}
    prev = data.get("today")
    if prev and prev.get("cards"):
        date = prev["date"]
        days = data.setdefault("days", [])
        days[:] = [d for d in days if d.get("date") != date]  # dedup: re-runs idempotent
        days.append({"date": date, "cards": [mini_card(c) for c in prev["cards"]]})
    data["days"] = data.get("days", [])[-5:]
    new_cards = []
    for c in cards["cards"]:
        c = dict(c)
        m = media_by_id.get(c["id"])
        if m and m.get("type") == "image" and m.get("src"):
            c["image"] = m["src"]
        c.pop("mini_headline", None)  # mini_headline only used for the deck on next roll
        new_cards.append(c)
    data["today"] = {"date": cards["date"], "cards": new_cards}
    return data

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="news_data.json")
    ap.add_argument("--cards", required=True)
    ap.add_argument("--media", required=True)
    a = ap.parse_args()
    data = json.load(open(a.data, encoding="utf-8"))
    cards = json.load(open(a.cards, encoding="utf-8"))
    media = json.load(open(a.media, encoding="utf-8"))
    json.dump(roll(data, cards, media), open(a.data, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
