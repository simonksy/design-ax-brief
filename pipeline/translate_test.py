# pipeline/translate_test.py
import json, os, subprocess, tempfile
import translate as tr

SRC = {"headline": "FTC opens probe\ninto OpenAI safety",
       "body": "The FTC confirmed to Axios it is investigating safety risks in OpenAI products for $2 billion.",
       "full": {"mode": "summary", "blocks": [{"t": "p", "x": "The FTC sent civil investigative demands."}]}}
KO = {"headline": "FTC, OpenAI\n안전성 조사 착수",
      "body": "FTC는 OpenAI 제품의 20억 달러 규모 안전 위험을 조사 중이라고 확인했다.",
      "full": {"mode": "summary", "blocks": [{"t": "p", "x": "FTC는 민사 조사 요구서를 보냈다."}]}}

# parse_reply: dict, fenced and chatty replies
assert tr.parse_reply(KO) == KO
assert tr.parse_reply("```json\n" + json.dumps(KO, ensure_ascii=False) + "\n```") == KO
assert tr.parse_reply("Here you go:\n" + json.dumps(KO, ensure_ascii=False) + "\nDone.") == KO
try:
    tr.parse_reply("not json"); raise AssertionError("should fail")
except ValueError:
    pass

p = tr.build_prompt(SRC, "en", "ko", ["body length 10 not in 28-46"])
assert "Korean" in p and "body length 10" in p and "OpenAI" in p and "previous answer failed" in p

# card_jobs: one job per missing language, input untouched
card = dict(SRC, id="ftc", url="https://x", source_lang="en")
jobs = tr.card_jobs(card, "ftc")
assert [j["lang"] for j in jobs] == ["ko", "ja", "zh", "es"] and all(j["attempt"] == 1 for j in jobs)
assert jobs[1]["job_id"] == "ftc|ja" and "Japanese" in jobs[1]["prompt"]
assert card.get("text") is None

# apply_to_card: pass / garbage / missing / fails checks -> retries with errors, then fallback
c = json.loads(json.dumps(card))
answers = {"ftc|ko": KO, "ftc|ja": "garbage", "ftc|es": json.dumps(KO, ensure_ascii=False)}
retry = tr.apply_to_card(c, jobs, answers)
assert c["text"]["en"]["headline"] == SRC["headline"] and c["text"]["ko"] == KO
assert sorted(j["lang"] for j in retry) == ["es", "ja", "zh"] and all(j["attempt"] == 2 for j in retry)
assert "previous answer failed" in next(j for j in retry if j["lang"] == "es")["prompt"]
assert c["headline"] == KO["headline"] and c["body"] == KO["body"] and "i18n_status" not in c
assert tr.apply_to_card(c, [dict(j, attempt=3) for j in retry], {}) == []
assert c["i18n_status"] == {"ja": "fallback", "zh": "fallback", "es": "fallback"}
assert tr.card_jobs(c, "ftc") == []          # done + fallback languages are not re-queued

# out-of-pool source language goes to text["_src"], never to a visible language
de = {"id": "de", "source_lang": "de", "headline": "Dt\nKopf", "body": "Dt"}
src, sl = tr.ensure_source(de)
assert sl == "de" and de["text"]["_src"]["lang"] == "de" and "de" not in de["text"]

# CLI round trip
d = tempfile.mkdtemp()
f, j, a = (os.path.join(d, n) for n in ("cards_x.json", "jobs_x.json", "answers_x.json"))
json.dump({"date": "2026-10-02", "cards": [card]}, open(f, "w"))
run = lambda *args: subprocess.run(["python3", "translate.py", *args], capture_output=True, text=True)
r = run("jobs", "--cards", f, "--out", j)
assert r.returncode == 0, r.stderr
assert len(json.load(open(j))["jobs"]) == 4 and json.load(open(j))["kind"] == "cards"
json.dump({"ftc|ko": KO}, open(a, "w"), ensure_ascii=False)
r = run("apply", "--jobs", j, "--answers", a)
assert r.returncode == 10, r.stdout + r.stderr
saved = json.load(open(f))["cards"][0]
assert saved["text"]["ko"] == KO and saved["body"] == KO["body"]
assert len(json.load(open(os.path.join(d, "jobs_x.retry.json")))["jobs"]) == 3
# UI dictionary jobs: only missing keys are sent, {placeholders} must survive, existing kept
d2 = tempfile.mkdtemp(); os.makedirs(f"{d2}/i18n")
json.dump({"a.x": "구독하기", "a.y": "{date} 소식 보는 중"}, open(f"{d2}/i18n/ko.json", "w"), ensure_ascii=False)
json.dump({"a.x": "Subscribe (kept)"}, open(f"{d2}/i18n/en.json", "w"))
uj = tr.ui_jobs(d2, langs=["en", "ja"])
assert [(x["job_id"], sorted(x["src"])) for x in uj] == [("ui|en", ["a.y"]), ("ui|ja", ["a.x", "a.y"])]
assert "Japanese" in uj[1]["prompt"] and "{placeholder}" in uj[1]["prompt"]
retry = tr.apply_ui(d2, uj, {"ui|en": {"a.y": "Viewing {date}"},
                             "ui|ja": {"a.x": "購読", "a.y": "ニュースを表示中"}})   # {date} lost
assert json.load(open(f"{d2}/i18n/en.json")) == {"a.x": "Subscribe (kept)", "a.y": "Viewing {date}"}
assert [x["job_id"] for x in retry] == ["ui|ja"] and "placeholder" in retry[0]["prompt"]
assert not os.path.exists(f"{d2}/i18n/ja.json")
assert tr.apply_ui(d2, retry, {"ui|ja": {"a.x": "購読", "a.y": "{date}のニュースを表示中"}}) == []
assert json.load(open(f"{d2}/i18n/ja.json"))["a.y"] == "{date}のニュースを表示中"
r = run("jobs", "--ui", "--root", d2, "--out", os.path.join(d2, "jobs_ui.json"))
assert r.returncode == 0 and json.load(open(os.path.join(d2, "jobs_ui.json")))["kind"] == "ui"
# check: re-validate after Korean humanize edits; broken language -> fallback; top-level = ko
d3 = tempfile.mkdtemp(); f3 = os.path.join(d3, "cards_y.json")
c3 = dict(card, text={"en": SRC, "ko": dict(KO, body="짧다.")})
json.dump({"date": "2026-10-02", "cards": [c3]}, open(f3, "w"), ensure_ascii=False)
assert tr.main(["check", f3]) == 0
c3o = json.load(open(f3))["cards"][0]
assert "ko" not in c3o["text"] and c3o["i18n_status"] == {"ko": "fallback"}
c4 = dict(card, text={"en": SRC, "ko": KO})
json.dump({"date": "2026-10-02", "cards": [c4]}, open(f3, "w"), ensure_ascii=False)
tr.main(["check", f3])
assert json.load(open(f3))["cards"][0]["body"] == KO["body"]

print("translate OK")

# Fix round 1: malformed answers files and non-str/dict replies must not crash

# (a) answers file whose whole content is fenced JSON still applies
d2 = tempfile.mkdtemp()
f2, j2, a2 = (os.path.join(d2, n) for n in ("cards_y.json", "jobs_y.json", "answers_y.json"))
json.dump({"date": "2026-10-02", "cards": [card]}, open(f2, "w"))
r = run("jobs", "--cards", f2, "--out", j2)
assert r.returncode == 0, r.stderr
open(a2, "w", encoding="utf-8").write("```json\n" + json.dumps({"ftc|ko": KO}, ensure_ascii=False) + "\n```")
r = run("apply", "--jobs", j2, "--answers", a2)
assert r.returncode == 10 and "Traceback" not in r.stderr, r.stdout + r.stderr
saved2 = json.load(open(f2))["cards"][0]
assert saved2["text"]["ko"] == KO and saved2["body"] == KO["body"]

# (b) answers file that is pure garbage text -> every job retried, no crash
d3 = tempfile.mkdtemp()
f3, j3, a3 = (os.path.join(d3, n) for n in ("cards_z.json", "jobs_z.json", "answers_z.json"))
json.dump({"date": "2026-10-02", "cards": [card]}, open(f3, "w"))
r = run("jobs", "--cards", f3, "--out", j3)
assert r.returncode == 0, r.stderr
n_jobs = len(json.load(open(j3))["jobs"])
open(a3, "w", encoding="utf-8").write("this is not json at all, just garbage prose.")
r = run("apply", "--jobs", j3, "--answers", a3)
assert r.returncode == 10 and "Traceback" not in r.stderr, r.stdout + r.stderr
retry3 = json.load(open(os.path.join(d3, "jobs_z.retry.json")))["jobs"]
assert len(retry3) == n_jobs

# (c) non-dict, non-str reply values are judged (not an AttributeError crash)
for bad in (123, ["a"], True):
    out, errs = tr.judge(jobs[0], bad)
    assert out is None and any("invalid reply" in e for e in errs), (bad, errs)

# news target: only today + last N days, only cards missing languages; limit/offset split
d4 = tempfile.mkdtemp(); f4 = os.path.join(d4, "news_data.json"); j4 = os.path.join(d4, "jobs_n.json")
old_card = {"id": "o", "url": "https://o", "headline": KO["headline"], "body": KO["body"], "full": KO["full"]}
done = dict(card, id="d", url="https://d", text={l: KO for l in ["en", "ko", "ja", "zh", "es"]})
nd = {"sections": {"design": {"today": {"date": "2026-10-02", "cards": [old_card, done]},
                              "days": [{"date": "2026-09-01", "cards": [dict(old_card, id="far")]},
                                       {"date": "2026-10-01", "cards": [dict(old_card, id="near")]}]}}}
json.dump(nd, open(f4, "w"), ensure_ascii=False)
r = run("jobs", "--news", f4, "--days", "1", "--out", j4)
assert r.returncode == 0, r.stderr
jobs4 = json.load(open(j4))["jobs"]
assert {x["key"] for x in jobs4} == {"design/o", "design/near"} and len(jobs4) == 8   # 4 langs each (src ko)
assert all(x["src_lang"] == "ko" for x in jobs4)
r = run("jobs", "--news", f4, "--days", "1", "--limit", "3", "--offset", "6", "--out", j4)
assert len(json.load(open(j4))["jobs"]) == 2
r = run("jobs", "--news", f4, "--days", "1", "--out", j4)
ans = {x["job_id"]: KO for x in json.load(open(j4))["jobs"] if x["lang"] in ("ja", "zh")}
json.dump(ans, open(os.path.join(d4, "a.json"), "w"), ensure_ascii=False)
r = run("apply", "--jobs", j4, "--answers", os.path.join(d4, "a.json"))
assert r.returncode == 10                                         # en/es unanswered -> retry
res = json.load(open(f4))["sections"]["design"]
assert res["today"]["cards"][0]["text"]["ja"] == KO and res["days"][1]["cards"][0]["text"]["zh"] == KO
assert res["days"][0]["cards"][0].get("text") is None             # outside --days

print("translate fix-1 OK")
