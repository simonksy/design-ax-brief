import json, os, subprocess, tempfile, textwrap

DESIGN = {
  "today": {"date":"2026-06-22","cards":[
    {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"두 줄\n헤드라인","body":"본문.","source":"Figma","url":"https://x","accent":"#0070f3","motif":"frame"}
  ]},
  "days": [
    {"date":"2026-06-21","cards":[{"tool":"VR","headline":"미니","source":"SGW","url":"https://y","accent":"#eb367f"}]}
  ]
}
DATA = {"sections": {"design": DESIGN, "music": {"today":{"date":None,"cards":[]},"days":[]}}}

d = tempfile.mkdtemp()
json.dump(DATA, open(os.path.join(d,"news_data.json"),"w"), ensure_ascii=False)
out = os.path.join(d,"axbrief-data.js")
subprocess.run(["python3", os.path.abspath("build_data.py"),
                "--in", os.path.join(d,"news_data.json"), "--out", out], check=True)
js = open(out, encoding="utf-8").read()
assert "window.AX_SECTIONS" in js                       # section-keyed output
assert "window.AX_NEWS" in js and "window.AX_DAYS" in js  # back-compat (design)
assert "두 줄\\n헤드라인" in js          # newline preserved as \n escape
assert "#0070f3" in js and "#eb367f" in js
# valid JS: node must parse it
subprocess.run(["node","--check", out], check=True)

# --- duplicate guard: only a shared URL fails the build. A shared image is allowed
#     (distinct articles, different URLs) — it only warns, never raises. ---
import build_data
# shared image but different urls/content -> NOT a duplicate (must NOT raise)
shared_img = {"today":{"date":"2026-06-23","cards":[
    {"id":"a","headline":"A","source":"Leo","url":"https://a","accent":"#111","image":"pipeline/media/deck/x.png"}]},
  "days":[{"date":"2026-06-22","cards":[
    {"tool":"T","headline":"B","source":"Leo","url":"https://b","accent":"#222","image":"pipeline/media/deck/x.png"}]}]}
build_data.assert_no_duplicates("design", shared_img["today"], shared_img["days"])   # should pass (warns only)
# shared url -> hard duplicate, must raise
dup_url = {"today":{"date":"2026-06-23","cards":[{"id":"a","headline":"A","source":"S","url":"https://same","accent":"#1"}]},
  "days":[{"date":"2026-06-22","cards":[{"tool":"T","headline":"B","source":"S","url":"https://same","accent":"#2"}]}]}
try:
    build_data.assert_no_duplicates("design", dup_url["today"], dup_url["days"]); raise SystemExit("FAIL: shared url not caught")
except build_data.DuplicateCardError as e:
    assert "duplicate URL" in str(e)
print("build_data OK")

# --- i18n: per-language data JS, premium split, per-language share pages
import json as _j, os as _o, subprocess as _sp, tempfile as _t
d9 = _t.mkdtemp()
card = lambda i, **kw: dict({"id": i, "tool": "T", "eyebrow": "AI NEWS", "headline": f"{i} 한\n헤드",
                             "body": "한국어 본문", "source": "S", "url": f"https://{i}", "accent": "#000",
                             "motif": "frame", "image": f"pipeline/media/{i}.jpg",
                             "full": {"blocks": [{"t": "p", "x": "한 전문"}]}}, **kw)
new = card("n", source_lang="en", text={
    "en": {"headline": "N en\nhead", "body": "English body", "full": {"blocks": [{"t": "p", "x": "en full"}]}},
    "ko": {"headline": "n 한\n헤드", "body": "한국어 본문", "full": {"blocks": [{"t": "p", "x": "한 전문"}]}}},
    _i18n_passed={"ko": {"headline": "n 한\n헤드", "body": "한국어 본문"}})
nd = {"sections": {"design": {"today": {"date": "2026-10-02", "cards": [card("free"), new]},
                              "days": [{"date": "2026-10-01", "cards": [card("old")]}]}}}
_j.dump(nd, open(f"{d9}/news_data.json", "w"), ensure_ascii=False)
_sp.run(["python3", _o.path.abspath("build_data.py"), "--in", f"{d9}/news_data.json",
         "--out", f"{d9}/axbrief-data.js", "--share-root", d9, "--base-url", "https://ax.test"], check=True)
for lang in ["en", "ko", "ja", "zh", "es"]:
    assert _o.path.exists(f"{d9}/axbrief-data.{lang}.js"), lang
    assert _o.path.exists(f"{d9}/premium/{lang}/design.json"), lang
en_js = open(f"{d9}/axbrief-data.en.js", encoding="utf-8").read()
assert "N en\\nhead" in en_js and '"untranslated": true' in en_js      # free/old 카드는 ko 폴백
assert '"text"' not in en_js                                             # 맵은 공개 JS에 안 나감
for _l in ["en", "ko", "ja", "zh", "es"]:                                # 통과본 스냅샷도 공개 JS에 안 나감
    assert "_i18n_passed" not in open(f"{d9}/axbrief-data.{_l}.js", encoding="utf-8").read(), _l
assert "_i18n_passed" not in open(f"{d9}/axbrief-data.js", encoding="utf-8").read()
assert open(f"{d9}/axbrief-data.js", encoding="utf-8").read() == open(f"{d9}/axbrief-data.ko.js", encoding="utf-8").read()
prem_en = _j.load(open(f"{d9}/premium/en/design.json"))["cards"]
assert prem_en["design/n"]["blocks"][0]["x"] == "en full" and "design/old" in prem_en
assert _j.load(open(f"{d9}/premium/full.json"))["cards"]["design/n"]["blocks"][0]["x"] == "한 전문"
sh = open(f"{d9}/s/en/design/n.html", encoding="utf-8").read()
assert '<html lang="en">' in sh and 'og:locale" content="en_US"' in sh and "https://ax.test/en/?c=design:n" in sh
assert "N en head" in sh
legacy = open(f"{d9}/s/design/n.html", encoding="utf-8").read()
assert '<html lang="ko">' in legacy and "https://ax.test/?c=design:n" in legacy
print("build_data i18n OK")
