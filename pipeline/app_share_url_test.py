# pipeline/app_share_url_test.py
"""The app's share link follows the route: /<lang>/... -> /s/<lang>/<sec>/<id>,
legacy / -> /s/<sec>/<id>. Runs the shareUrl expression from axbrief-app.jsx in node."""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = open(os.path.join(ROOT, "axbrief-app.jsx"), encoding="utf-8").read()
m = re.search(r"(  const shareLang = .*?\n  const shareUrl = .*?: '';)", app, re.S)
assert m, "shareLang/shareUrl block not found in axbrief-app.jsx"
snippet = m.group(1)

HARNESS = r"""
const vm = require("vm");
const [code, lang, path] = process.argv.slice(1);
const window = { AX_LANG: lang || undefined, location: { origin: "https://ax.test", pathname: path } };
const ctx = { window, item: { id: "card-1" }, section: "music" };
vm.runInNewContext(code.replace(/\bconst /g, "var "), ctx);
process.stdout.write(JSON.stringify(ctx.shareUrl));
"""


def share(lang, path):
    r = subprocess.run(["node", "-e", HARNESS, snippet, lang, path],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


assert share("ja", "/ja/") == "https://ax.test/s/ja/music/card-1"
assert share("en", "/en/large") == "https://ax.test/s/en/music/card-1"
assert share("ko", "/ko/") == "https://ax.test/s/ko/music/card-1"
assert share("ko", "/") == "https://ax.test/s/music/card-1"            # legacy route
assert share("ko", "/index.html") == "https://ax.test/s/music/card-1"
assert share("", "/") == "https://ax.test/s/music/card-1"              # no AX_LANG at all
assert share("en", "/english/") == "https://ax.test/s/music/card-1"    # prefix must be /<lang>/
print("app share url OK")
