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


# 번역은 cards.json에 들어가는데 roll은 그걸 news_data.json으로 옮긴 뒤다. 순서가
# 어긋나면 오늘 카드가 text 없이 남고, 사이트는 멈추지 않는다 — 한국어 독자에게
# 영어 원문이 '미번역' 회색 안내와 함께 그대로 나간다. 조용히 틀리는 쪽이 제일 나쁘다.
def _card(cid, langs):
    full = {"headline": "h", "body": "b"}
    return {"id": cid, "url": f"https://{cid}", "source_lang": "en",
            "text": {l: dict(full) for l in langs}}


def test_untranslated_today_card_is_warned():
    import io, contextlib
    import build_data
    today = {"date": "2026-10-07", "cards": [
        _card("done", ["en", "ko", "ja", "zh", "es"]),
        _card("half", ["en", "es"]),
    ]}
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        build_data.warn_untranslated_today("marketing", today)
    out = err.getvalue()
    assert "half" in out and "marketing" in out, out
    assert "ko" in out and "ja" in out and "zh" in out, out   # 빠진 언어를 이름으로 댄다
    assert "es" not in out.split("(")[1].split(")")[0], out   # 있는 언어는 적지 않는다
    assert "done" not in out, out                             # 다 갖춘 카드는 조용하다


def test_fully_translated_today_is_silent():
    import io, contextlib
    import build_data
    today = {"date": "2026-10-07",
             "cards": [_card("done", ["en", "ko", "ja", "zh", "es"])]}
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        build_data.warn_untranslated_today("marketing", today)
    assert err.getvalue() == "", err.getvalue()


test_untranslated_today_card_is_warned()
test_fully_translated_today_is_silent()


# 함수가 맞아도 호출 '자리'가 틀리면 소용없다 — 처음에 to_js 안에 뒀는데, 거기는
# 언어별 flatten이 끝나 text가 이미 사라진 뒤라 멀쩡한 카드까지 전부 미번역으로
# 경고했다. 그래서 진짜 빌드를 돌려 경고가 '그 한 장만' 나오는지 본다.
def test_build_warns_only_for_the_untranslated_card():
    data = {"sections": {"marketing": {"today": {"date": "2026-10-07", "cards": [
        dict(_card("done", ["en", "ko", "ja", "zh", "es"]),
             tool="T", eyebrow="E", headline="h", body="b", source="S", accent="#111"),
        dict(_card("half", ["en"]),
             tool="T", eyebrow="E", headline="h", body="b", source="S", accent="#222"),
    ]}, "days": []}}}
    dd = tempfile.mkdtemp()
    json.dump(data, open(os.path.join(dd, "news_data.json"), "w"), ensure_ascii=False)
    r = subprocess.run(["python3", os.path.abspath("build_data.py"),
                        "--in", os.path.join(dd, "news_data.json"),
                        "--out", os.path.join(dd, "axbrief-data.js")],
                       check=True, capture_output=True, text=True)
    warns = [l for l in r.stderr.splitlines() if "번역이 없다" in l]
    assert len(warns) == 1, r.stderr
    assert "half" in warns[0], warns


test_build_warns_only_for_the_untranslated_card()
print("build_data untranslated-guard OK")
