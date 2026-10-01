# pipeline/translate.py
"""Translate card copy from the original-language summary into the site languages —
with no API calls. Claude Code subagents (.claude/agents/ax-translator.md) do the
translating inside the normal pipeline run; this script prepares the work and judges it:

    python3 translate.py jobs  --cards cards_<S>.json --out jobs_<S>.json
    (ax-translator: reads jobs_<S>.json, writes answers_<S>.json)
    python3 translate.py apply --jobs jobs_<S>.json --answers answers_<S>.json
        exit 0  = every job resolved (translated, or recorded as fallback)
        exit 10 = some answers failed translate_check -> jobs_<S>.retry.json (errors fed
                  back into each prompt); run ax-translator on it and apply again.
A job gets MAX_ATTEMPTS tries; a language that still fails is recorded in
`i18n_status` and the build serves the fallback language with an "untranslated" label."""
import argparse
import json
import os
import re
import sys

from i18n_text import LANGS, TEXT_FIELDS, source_fields
from translate_check import LIMITS, check

MAX_ATTEMPTS = 3
NAMES = {"en": "English", "ko": "Korean", "ja": "Japanese", "zh": "Simplified Chinese",
         "es": "Spanish", "de": "German", "fr": "French"}
STYLE = {
    "ko": "Calm Korean editorial voice. No 번역투, no stacked passives, end sentences with 다.",
    "ja": "Calm Japanese editorial voice (だ・である調). Avoid literal translationese.",
    "zh": "Calm Simplified Chinese editorial voice. Avoid literal translationese.",
    "en": "Calm, plain English editorial voice. No hype words.",
    "es": "Calm, neutral Spanish editorial voice (no regionalisms). No hype words.",
}


def build_prompt(src, src_lang, lang, errors=None):
    lim = LIMITS[lang]
    rules = [
        f"Translate this news card from {NAMES.get(src_lang, src_lang)} into {NAMES[lang]}.",
        "Keep every fact, number, date, quote and proper noun exactly; add nothing.",
        "Keep brand/product names in their original Latin spelling (e.g. OpenAI, GPT-6, FTC).",
        f"headline: exactly two lines separated by one \\n, each line at most {lim['line']} characters.",
        f"body: exactly one complete sentence, {lim['body'][0]}-{lim['body'][1]} characters.",
        "mini_headline (if present): one short line.",
        "full.blocks: same blocks in the same order; translate only `x` and `cap`; "
        "copy every other key (src, yt, t) unchanged.",
        STYLE[lang],
        "Answer with ONLY the JSON object, same keys as the input.",
    ]
    if errors:
        rules.append("Your previous answer failed these checks — fix them: " + "; ".join(errors))
    return "\n".join("- " + r for r in rules) + "\n\nINPUT:\n" + json.dumps(src, ensure_ascii=False)


def parse_reply(reply):
    if isinstance(reply, dict):
        return reply
    if not isinstance(reply, str):
        raise ValueError(f"reply is not an object or string: {type(reply).__name__}")
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", (reply or "").strip(), flags=re.M)
    start = t.find("{")
    if start < 0:
        raise ValueError("no JSON object in reply")
    obj, _ = json.JSONDecoder().raw_decode(t[start:])
    if not isinstance(obj, dict):
        raise ValueError("reply is not an object")
    return obj


def ensure_source(card):
    src, src_lang = source_fields(card)
    src = {k: v for k, v in src.items() if k in TEXT_FIELDS}
    text = card.setdefault("text", {})
    if src_lang in LANGS:
        text.setdefault(src_lang, src)
    else:
        text.setdefault("_src", dict(src, lang=src_lang))
    return src, src_lang


def make_job(key, src, src_lang, lang, attempt=1, errors=None):
    return {"job_id": f"{key}|{lang}", "key": key, "src_lang": src_lang, "lang": lang,
            "attempt": attempt, "src": src, "prompt": build_prompt(src, src_lang, lang, errors)}


def card_jobs(card, key, langs=LANGS):
    c = json.loads(json.dumps(card))
    src, src_lang = ensure_source(c)
    status = c.get("i18n_status") or {}
    return [make_job(key, src, src_lang, l) for l in langs
            if l not in c["text"] and status.get(l) != "fallback"]


def judge(job, reply):
    if reply is None:
        return None, ["no answer"]
    try:
        out = parse_reply(reply)
    except ValueError as e:
        return None, [f"invalid reply: {e}"]
    out = {k: v for k, v in out.items() if k in TEXT_FIELDS}
    errs = check(job["src"], out, job["lang"])
    return (None, errs) if errs else (out, [])


def apply_to_card(card, jobs, answers):
    ensure_source(card)
    status = dict(card.get("i18n_status") or {})
    retry = []
    for job in jobs:
        out, errs = judge(job, answers.get(job["job_id"]))
        if out:
            card["text"][job["lang"]] = out
            status.pop(job["lang"], None)
        elif job["attempt"] < MAX_ATTEMPTS:
            retry.append(make_job(job["key"], job["src"], job["src_lang"], job["lang"],
                                  job["attempt"] + 1, errs))
        else:
            status[job["lang"]] = "fallback"
            print(f"  [{job['key']}] {job['lang']} fallback: {'; '.join(errs)}", file=sys.stderr)
    if status:
        card["i18n_status"] = status
    else:
        card.pop("i18n_status", None)
    if card["text"].get("ko"):
        card.update({k: v for k, v in card["text"]["ko"].items() if k in TEXT_FIELDS})
    return retry


def _cards_index(doc, **_):
    return {c.get("id"): c for c in doc.get("cards", [])}


TARGETS = {"cards": _cards_index}


def _load(path, default=None):
    if default is not None and not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def _load_answers(path):
    """Answers files come from an agent, not a schema-checked tool, so they may be
    wrapped in a code fence, have chatter around them, or simply be unparsable. Reuse
    parse_reply's fence-stripping/first-object-decoding instead of a bare json.load, and
    on any failure warn and fall back to {} — every job then reads as "no answer" and
    goes to the retry file, rather than crashing the whole apply run. A missing file
    keeps meaning {}, same as before."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        text = f.read()
    try:
        obj = parse_reply(text)
    except ValueError as e:
        print(f"  answers file unreadable ({e}) — treating as no answers", file=sys.stderr)
        return {}
    return obj


def cmd_jobs(kind, path, out, **kw):
    doc = _load(path)
    jobs = [j for key, c in TARGETS[kind](doc, **kw).items() for j in card_jobs(c, key)]
    _save(out, {"kind": kind, "target": os.path.abspath(path), "jobs": jobs})
    print(f"{len(jobs)} job(s) -> {out}")
    return 0


def cmd_apply(jobs_path, answers_path, retry_out=None):
    jf = _load(jobs_path)
    answers = _load_answers(answers_path)
    doc = _load(jf["target"])
    index = TARGETS[jf["kind"]](doc)
    by_key = {}
    for job in jf["jobs"]:
        by_key.setdefault(job["key"], []).append(job)
    retry = []
    for key, jobs in by_key.items():
        card = index.get(key)
        if card is None:
            print(f"  [{key}] not found in {jf['target']} — skipped", file=sys.stderr)
            continue
        retry += apply_to_card(card, jobs, answers)
    _save(jf["target"], doc)
    if retry:
        rp = retry_out or re.sub(r"(\.retry)?\.json$", ".retry.json", jobs_path)
        _save(rp, {"kind": jf["kind"], "target": jf["target"], "jobs": retry})
        print(f"{len(retry)} job(s) need another pass -> {rp}")
        return 10
    print("all jobs resolved")
    return 0


def main(argv):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    j = sub.add_parser("jobs")
    j.add_argument("--cards", required=True)
    j.add_argument("--out", required=True)
    a = sub.add_parser("apply")
    a.add_argument("--jobs", required=True)
    a.add_argument("--answers", required=True)
    a.add_argument("--retry-out")
    args = ap.parse_args(argv)
    if args.cmd == "jobs":
        return cmd_jobs("cards", args.cards, args.out)
    return cmd_apply(args.jobs, args.answers, args.retry_out)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
