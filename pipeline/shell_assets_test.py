# pipeline/shell_assets_test.py
"""Every page shell must only load scripts that actually ship.

For each root-level HTML shell, run its inline loader (the document.write block) in
node with window.AX_LANG set, collect every local script it writes, plus static
<script src> tags and archive.html's loadScript("...") calls. For ko (what `/` serves
today) every referenced file must be committed to git or be a builder's legacy output
(build_data/build_archive/build_i18n default --out). For the other languages a file
must be committed or match a per-language build output pattern. A shell referencing a
file nobody produces fails here instead of rendering empty in production.
"""
import json
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LANGS = ["en", "ko", "ja", "zh", "es"]

NODE_HARNESS = r"""
const vm = require("vm");
const [code, lang] = [process.argv[1], process.argv[2]];
const out = [];
const ctx = { window: { AX_LANG: lang }, document: { write: (s) => out.push(s) },
              Date: { now: () => 0 } };
vm.runInNewContext(code, ctx);
process.stdout.write(JSON.stringify(out));
"""


def _local(src):
    src = src.split("?")[0].split("#")[0]
    return None if re.match(r"^(https?:)?//", src) or not src else src.lstrip("/")


def referenced_scripts(html, lang):
    refs = set()
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        src = re.search(r"""\bsrc\s*=\s*["']([^"']+)["']""", attrs)
        if src:
            refs.add(_local(src.group(1)))
        if "document.write" in body:
            res = subprocess.run(["node", "-e", NODE_HARNESS, body, lang],
                                 capture_output=True, text=True, check=True)
            for tag in json.loads(res.stdout):
                s = re.search(r"""\bsrc\s*=\s*["']([^"']+)["']""", tag)
                if s:
                    refs.add(_local(s.group(1)))
        for s in re.findall(r"""loadScript\(\s*["']([^"']+)["']""", body):
            refs.add(_local(s))
    refs.discard(None)
    return refs


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True,
                         check=True).stdout.decode()
    return set(f for f in out.split("\0") if f)


def legacy_outputs():
    """Files the builders write at their legacy (non-language-suffixed) default paths."""
    outs = set()
    for builder in ("build_data.py", "build_archive.py"):
        src = open(os.path.join(HERE, builder), encoding="utf-8").read()
        for m in re.finditer(r"""add_argument\("--(?:out|graph-out)"[^)]*default=([^)]*)\)""", src):
            name = re.findall(r"""["']([^"']*\.js)["']""", m.group(1))
            outs.update(os.path.basename(n) for n in name)
    if os.path.exists(os.path.join(HERE, "build_i18n.py")):
        outs.update(f"i18n/{l}.js" for l in LANGS)
    return outs


def per_lang_output(path, lang):
    return path in (f"axbrief-data.{lang}.js", f"archive-data.{lang}.js", f"i18n/{lang}.js")


def problems(shell, html, tracked, legacy):
    errs = []
    for lang in LANGS:
        for ref in sorted(referenced_scripts(html, lang)):
            if ref in tracked:
                continue
            if lang == "ko" and ref in legacy:
                continue
            if lang != "ko" and per_lang_output(ref, lang):
                continue
            errs.append(f"{shell} [{lang}] loads {ref}: not committed and no builder emits it")
    return errs


tracked = tracked_files()
legacy = legacy_outputs()
assert {"axbrief-data.js", "archive-data.js", "archive-graph.js"} <= legacy, legacy

# Self-check: the checker must flag a shell that loads a file nobody produces.
fake = """<script>(function () { var L = window.AX_LANG || 'ko';
  document.write('<scr' + 'ipt src="axbrief-data.' + L + '.js?v=1"><\\/scr' + 'ipt>');
  document.write('<scr' + 'ipt src="nobody-builds-this.js"><\\/scr' + 'ipt>'); })();</script>"""
# (checked against a tracked set without axbrief-data.ko.js: the backfill commits it,
# but the shells must not depend on that.)
fe = problems("fake.html", fake, tracked - {"axbrief-data.ko.js"}, legacy)
assert any("[ko] loads axbrief-data.ko.js" in e for e in fe), fe     # the original Critical bug
assert any("nobody-builds-this.js" in e for e in fe), fe
assert not any("[en] loads axbrief-data.en.js" in e for e in fe), fe  # per-language build output

shells = sorted(f for f in tracked if "/" not in f and f.endswith(".html"))
for must in ("index.html", "large.html", "archive.html",
             "Design AX Brief.html", "Design AX Brief (Large Card).html"):
    assert must in shells, must
errors = []
checked = 0
for shell in shells:
    html = open(os.path.join(ROOT, shell), encoding="utf-8").read()
    errors += problems(shell, html, tracked, legacy)
    checked += 1
# The ko path of the main shells must load the committed legacy data files.
assert "axbrief-data.js" in referenced_scripts(open(os.path.join(ROOT, "index.html"), encoding="utf-8").read(), "ko")
assert "archive-data.js" in referenced_scripts(open(os.path.join(ROOT, "archive.html"), encoding="utf-8").read(), "ko")
assert "axbrief-data.en.js" in referenced_scripts(open(os.path.join(ROOT, "large.html"), encoding="utf-8").read(), "en")
assert not errors, "\n".join(errors)
print(f"shell assets OK ({checked} shells)")
