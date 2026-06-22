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
print("build_data OK")
