# pipeline/build_i18n_test.py
import json, os, subprocess, tempfile, shutil
root = tempfile.mkdtemp(); os.makedirs(f"{root}/i18n")
json.dump({"a.x": "가", "a.y": "{n}개"}, open(f"{root}/i18n/ko.json", "w"), ensure_ascii=False)
json.dump({"a.x": "A"}, open(f"{root}/i18n/en.json", "w"))
r = subprocess.run(["python3", os.path.abspath("build_i18n.py"), "--root", root], capture_output=True, text=True)
assert r.returncode == 0 and "missing" in r.stderr and "a.y" in r.stderr
en = open(f"{root}/i18n/en.js", encoding="utf-8").read()
assert en.startswith("window.AX_I18N = ") and '"a.x": "A"' in en and '"a.y": "{n}개"' in en
assert "window.AX_I18N_KO" in open(f"{root}/i18n/ko.js", encoding="utf-8").read()
r = subprocess.run(["python3", os.path.abspath("build_i18n.py"), "--root", root, "--check"], capture_output=True, text=True)
assert r.returncode == 1
print("build_i18n OK")
