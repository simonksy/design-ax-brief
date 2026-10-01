import json, os, subprocess, tempfile

# build_story_ledger must be non-destructive: an environment with no pipeline/runs/
# (gitignored, ephemeral) and no selected_*/candidates_* files must never blank out
# title/excerpt that an existing story_ledger.json already has.
d = tempfile.mkdtemp()
json.dump({"design": {"https://kept": "2026-06-20"}},
          open(f"{d}/published_urls.json", "w"), ensure_ascii=False)
json.dump({"sections": {"design": {"today": {"date": "2026-06-20", "cards": []}, "days": []}}},
          open(f"{d}/news_data.json", "w"), ensure_ascii=False)
json.dump({"design": [{"url": "https://kept", "date": "2026-06-20",
                        "title": "Kept title", "excerpt": "Kept excerpt", "ko": "케이케이"}]},
          open(f"{d}/story_ledger.json", "w"), ensure_ascii=False)

subprocess.run(["python3", os.path.abspath("update_ledger.py"),
                "--news", f"{d}/news_data.json", "--ledger", f"{d}/published_urls.json",
                "--story", f"{d}/story_ledger.json"], check=True)

story = json.load(open(f"{d}/story_ledger.json", encoding="utf-8"))
entry = next(h for h in story["design"] if h["url"] == "https://kept")
assert entry["title"] == "Kept title", entry
assert entry["excerpt"] == "Kept excerpt", entry

print("update_ledger OK")
