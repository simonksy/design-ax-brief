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
UI dictionary (i18n/ko.json -> i18n/<lang>.json, missing keys only, then build_i18n.py):
    python3 translate.py jobs  --ui [--root R] --out jobs_ui.json
    python3 translate.py apply --jobs jobs_ui.json --answers answers_ui.json
A job gets MAX_ATTEMPTS tries; a language that still fails is recorded in
`i18n_status` and the build serves the fallback language with an "untranslated" label."""
import argparse
import json
import os
import re
import subprocess
import sys

from i18n_text import LANGS, TEXT_FIELDS, source_fields
from translate_check import LIMITS, check

HERE = os.path.dirname(os.path.abspath(__file__))
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


def _news_index(doc, days=None, **_):
    out = {}
    for sec, s in (doc.get("sections") or {}).items():
        all_days = s.get("days") or []
        groups = [s.get("today") or {}] + (all_days[-days:] if days else all_days)
        for day in groups:
            for c in day.get("cards", []):
                if c.get("id"):
                    out[f"{sec}/{c['id']}"] = c
    return out


TARGETS["news"] = _news_index


def _load(path, default=None):
    if default is not None and not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def archive_cards(root):
    """Load pipeline/archive.json's teaser-only records into virtual cards for
    card_jobs/apply_to_card: headline/body/text/source_lang/i18n_status (whichever are
    present) plus, when the source-language full article exists in
    premium/<src>/<section>.json (or the legacy premium/full.json), a `full` block so
    the premium article gets translated too."""
    archive = _load(os.path.join(root, "pipeline", "archive.json"))
    prem = lambda name: (_load(os.path.join(root, "premium", name), default={}).get("cards") or {})
    legacy = prem("full.json")
    cache = {}
    vcards = {}
    for rec in archive.get("cards", []):
        key = f"{rec['section']}/{rec['id']}"
        vc = {k: rec[k] for k in ("headline", "body", "text", "source_lang", "i18n_status") if rec.get(k)}
        src = rec.get("source_lang") or "ko"
        part = cache.setdefault(f"{src}/{rec['section']}", prem(f"{src}/{rec['section']}.json"))
        full = part.get(key) or legacy.get(key)
        if full and full.get("blocks"):
            vc["full"] = {"blocks": full["blocks"]}
            if vc.get("text", {}).get(src) is not None:
                vc["text"][src] = dict(vc["text"][src], full=vc["full"])
        vcards[key] = vc
    return archive, vcards


def commit_archive(root, archive, vcards):
    """Fold each virtual card's translated text back into archive.json (teaser
    headline/body per language, never `_src`) and each language's premium full
    article into premium/<lang>/<section>.json (cumulative, via merge_premium)."""
    from build_data import merge_premium
    by_key = {f"{r['section']}/{r['id']}": r for r in archive.get("cards", [])}
    fulls = {}
    for key, vc in vcards.items():
        rec = by_key[key]
        text = {l: {k: t[k] for k in ("headline", "body") if t.get(k)}
                for l, t in (vc.get("text") or {}).items() if l != "_src"}
        if text:
            rec["text"] = text
        if vc.get("i18n_status"):
            rec["i18n_status"] = vc["i18n_status"]
        for l, t in (vc.get("text") or {}).items():
            blocks = ((t or {}).get("full") or {}).get("blocks")
            if l != "_src" and blocks:
                fulls.setdefault(f"{l}/{rec['section']}", {})[key] = {"blocks": blocks}
    for name, part in fulls.items():
        merge_premium(os.path.join(root, "premium", f"{name}.json"), part)
    _save(os.path.join(root, "pipeline", "archive.json"), archive)


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


UI_RULES = ("- Translate these UI strings of a calm news-briefing website from Korean into {lang}. "
            "Short, natural UI wording.\n- Keep every {{placeholder}} token (like {{date}}) exactly.\n"
            "- Answer with ONLY a JSON object with exactly the same keys.\n")


def _ui_job(lang, todo, attempt=1, errors=None):
    prompt = UI_RULES.format(lang=NAMES[lang])
    if errors:
        prompt += "- Your previous answer failed these checks — fix them: " + "; ".join(errors) + "\n"
    return {"job_id": f"ui|{lang}", "key": "ui", "lang": lang, "attempt": attempt, "src": todo,
            "prompt": prompt + "\nINPUT:\n" + json.dumps(todo, ensure_ascii=False)}


def ui_jobs(root, langs=None):
    """One job per language holding only the i18n/ko.json keys that language lacks."""
    d = os.path.join(root, "i18n")
    ko = _load(os.path.join(d, "ko.json"))
    jobs = []
    for lang in (langs or [l for l in LANGS if l != "ko"]):
        cur = _load(os.path.join(d, f"{lang}.json"), default={})
        todo = {k: v for k, v in ko.items() if k not in cur}
        if todo:
            jobs.append(_ui_job(lang, todo))
    return jobs


def _placeholders(s):
    return sorted(re.findall(r"\{\w+\}", s if isinstance(s, str) else ""))


def apply_ui(root, jobs, answers):
    """Merge passing answers into i18n/<lang>.json (existing translations kept); a missing
    key, a non-string value or a lost {placeholder} sends the whole job back for retry."""
    d = os.path.join(root, "i18n")
    retry = []
    for job in jobs:
        todo, lang = job["src"], job["lang"]
        out, errs = None, []
        if job["job_id"] not in answers:
            errs = ["no answer"]
        else:
            try:
                out = parse_reply(answers[job["job_id"]])
            except ValueError as e:
                errs = [f"invalid reply: {e}"]
        if out is not None:
            errs = [f"{k}: missing" for k in todo if k not in out] + \
                   [f"{k}: not a string" for k in todo if k in out and not isinstance(out[k], str)] + \
                   [f"{k}: placeholder lost" for k in todo if isinstance(out.get(k), str)
                    and _placeholders(todo[k]) != _placeholders(out[k])]
        if out is not None and not errs:
            p = os.path.join(d, f"{lang}.json")
            cur = _load(p, default={})
            cur.update({k: out[k] for k in todo})
            _save(p, cur)
        elif job["attempt"] < MAX_ATTEMPTS:
            retry.append(_ui_job(lang, todo, job["attempt"] + 1, errs))
        else:
            print(f"  [ui] {lang} failed: {'; '.join(errs)} — Korean shown for these keys", file=sys.stderr)
    return retry


def recheck_card(card):
    card = json.loads(json.dumps(card))
    src, src_lang = source_fields(card)
    status = dict(card.get("i18n_status") or {})
    for lang in [l for l in LANGS if l != src_lang and l in (card.get("text") or {})]:
        errs = check(src, card["text"][lang], lang)
        if errs:
            del card["text"][lang]
            status[lang] = "fallback"
            print(f"  [{card.get('id')}] {lang} failed re-check: {'; '.join(errs)}", file=sys.stderr)
    if status:
        card["i18n_status"] = status
    if (card.get("text") or {}).get("ko"):
        card.update({k: v for k, v in card["text"]["ko"].items() if k in TEXT_FIELDS})
    return card


def cmd_check(path):
    doc = _load(path)
    doc["cards"] = [recheck_card(c) for c in doc.get("cards", [])]
    _save(path, doc)
    return 0


def cmd_jobs(kind, path, out, limit=None, offset=0, **kw):
    doc = _load(path)
    jobs = [j for key, c in TARGETS[kind](doc, **kw).items() for j in card_jobs(c, key)]
    jobs = jobs[offset: offset + limit] if limit else jobs[offset:]
    _save(out, {"kind": kind, "target": os.path.abspath(path), "jobs": jobs})
    print(f"{len(jobs)} job(s) -> {out}")
    return 0


def cmd_jobs_ui(root, out):
    jobs = ui_jobs(root)
    _save(out, {"kind": "ui", "target": os.path.abspath(root), "jobs": jobs})
    print(f"{len(jobs)} job(s) -> {out}")
    return 0


def cmd_jobs_archive(root, out, limit=None, offset=0):
    _, vcards = archive_cards(root)
    jobs = [j for key, c in vcards.items() for j in card_jobs(c, key)]
    jobs = jobs[offset: offset + limit] if limit else jobs[offset:]
    _save(out, {"kind": "archive", "target": os.path.abspath(root), "jobs": jobs})
    print(f"{len(jobs)} job(s) -> {out}")
    return 0


def _apply_cards(jf, answers):
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
    return retry


def _apply_archive(jf, answers):
    archive, vcards = archive_cards(jf["target"])
    by_key = {}
    for job in jf["jobs"]:
        by_key.setdefault(job["key"], []).append(job)
    retry = []
    for key, jobs in by_key.items():
        vc = vcards.get(key)
        if vc is None:
            print(f"  [{key}] not found in {jf['target']} — skipped", file=sys.stderr)
            continue
        retry += apply_to_card(vc, jobs, answers)
    commit_archive(jf["target"], archive, vcards)
    return retry


def cmd_apply(jobs_path, answers_path, retry_out=None):
    jf = _load(jobs_path)
    answers = _load_answers(answers_path)
    if jf["kind"] == "ui":
        retry = apply_ui(jf["target"], jf["jobs"], answers)
    elif jf["kind"] == "archive":
        retry = _apply_archive(jf, answers)
    else:
        retry = _apply_cards(jf, answers)
    if retry:
        rp = retry_out or re.sub(r"(\.retry)?\.json$", ".retry.json", jobs_path)
        _save(rp, {"kind": jf["kind"], "target": jf["target"], "jobs": retry})
        print(f"{len(retry)} job(s) need another pass -> {rp}")
        return 10
    print("all jobs resolved")
    if jf["kind"] == "ui":
        subprocess.run([sys.executable, os.path.join(HERE, "build_i18n.py"), "--root", jf["target"]])
    elif jf["kind"] == "archive":
        subprocess.run([sys.executable, os.path.join(HERE, "build_archive.py")])
    return 0


def main(argv):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    j = sub.add_parser("jobs")
    j.add_argument("--cards")
    j.add_argument("--ui", action="store_true", help="translate the i18n/ko.json UI dictionary")
    j.add_argument("--news", help="news_data.json path — recently published cards, backfill in chunks")
    j.add_argument("--archive", action="store_true",
                    help="translate pipeline/archive.json teaser + source-language premium full text, "
                         "backfill in chunks")
    j.add_argument("--days", type=int, default=5, help="with --news: today + last N days (default 5)")
    j.add_argument("--limit", type=int, help="with --news/--archive: keep only this many jobs, for parallel splits")
    j.add_argument("--offset", type=int, default=0, help="with --news/--archive: skip this many jobs before --limit")
    j.add_argument("--root", default=os.path.dirname(HERE), help="repo root holding i18n/ (with --ui/--archive)")
    j.add_argument("--out", required=True)
    a = sub.add_parser("apply")
    a.add_argument("--jobs", required=True)
    a.add_argument("--answers", required=True)
    a.add_argument("--retry-out")
    c = sub.add_parser("check")
    c.add_argument("path")
    args = ap.parse_args(argv)
    if args.cmd == "jobs":
        if args.ui:
            return cmd_jobs_ui(args.root, args.out)
        if args.archive:
            return cmd_jobs_archive(args.root, args.out, limit=args.limit, offset=args.offset)
        if args.news:
            return cmd_jobs("news", args.news, args.out, days=args.days,
                             limit=args.limit, offset=args.offset)
        if not args.cards:
            ap.error("jobs needs --cards, --ui, --news or --archive")
        return cmd_jobs("cards", args.cards, args.out)
    if args.cmd == "check":
        return cmd_check(args.path)
    return cmd_apply(args.jobs, args.answers, args.retry_out)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
