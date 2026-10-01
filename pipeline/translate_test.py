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
print("translate OK")
