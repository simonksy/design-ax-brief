import json, os, subprocess, tempfile, textwrap

DATA = {
  "today": {"date":"2026-06-22","cards":[
    {"id":"figma","tool":"Figma","eyebrow":"AI NEWS","headline":"두 줄\n헤드라인","body":"본문.","source":"Figma","url":"https://x","accent":"#0070f3","motif":"frame"}
  ]},
  "days": [
    {"date":"2026-06-21","cards":[{"tool":"VR","headline":"미니","source":"SGW","url":"https://y","accent":"#eb367f"}]}
  ]
}

d = tempfile.mkdtemp()
json.dump(DATA, open(os.path.join(d,"news_data.json"),"w"), ensure_ascii=False)
out = os.path.join(d,"axbrief-data.js")
subprocess.run(["python3", os.path.abspath("build_data.py"),
                "--in", os.path.join(d,"news_data.json"), "--out", out], check=True)
js = open(out, encoding="utf-8").read()
assert "window.AX_NEWS" in js and "window.AX_DAYS" in js
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
build_data.assert_no_duplicates(shared_img)   # should pass (warns only)
# shared url -> hard duplicate, must raise
dup_url = {"today":{"date":"2026-06-23","cards":[{"id":"a","headline":"A","source":"S","url":"https://same","accent":"#1"}]},
  "days":[{"date":"2026-06-22","cards":[{"tool":"T","headline":"B","source":"S","url":"https://same","accent":"#2"}]}]}
try:
    build_data.assert_no_duplicates(dup_url); raise SystemExit("FAIL: shared url not caught")
except build_data.DuplicateCardError as e:
    assert "duplicate URL" in str(e)
print("build_data OK")
