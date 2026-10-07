# pipeline/motifs_test.py
"""Every category's motif must be one the app can actually draw.

`Motif({kind})` in axbrief-app.jsx branches on a fixed set of names and falls
through to the last one for anything it does not recognize. So a category that
declares a motif nobody implemented does not fail loudly — it silently renders
some OTHER section's picture. The marketing category shipped with motif "wave",
which is in no branch, so every imageless marketing card drew a VR headset.

Checked both ways: a category cannot name a motif that sources.json does not
declare, and sources.json cannot declare a motif the app does not draw.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def app_motif_kinds():
    """The names Motif() actually draws: every `kind === '<name>'` branch, plus
    the fallback the final return handles (marked by a `// <name>` comment line,
    the only way to name a branch that has no comparison)."""
    src = open(os.path.join(ROOT, "axbrief-app.jsx"), encoding="utf-8").read()
    start = src.index("function Motif(")
    body = src[start:src.index("\n}", start)]
    kinds = set(re.findall(r"kind === '([a-z]+)'", body))
    fallback = re.findall(r"^\s*// ([a-z]+)\s*$", body, re.M)
    return kinds | set(fallback)


def test_every_category_motif_is_declared():
    s = json.load(open(os.path.join(HERE, "sources.json"), encoding="utf-8"))
    declared = set(s["motifs"])
    bad = [(c["category"], c.get("motif")) for c in s["categories"]
           if c.get("motif") not in declared]
    assert not bad, f"categories naming an undeclared motif: {bad} (declared: {sorted(declared)})"


def test_every_declared_motif_is_drawn():
    s = json.load(open(os.path.join(HERE, "sources.json"), encoding="utf-8"))
    drawn = app_motif_kinds()
    missing = sorted(set(s["motifs"]) - drawn)
    assert not missing, f"motifs declared but not drawn by axbrief-app.jsx: {missing} (drawn: {sorted(drawn)})"


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn()
                print(f"ok   {name}")
            except AssertionError as e:
                fails += 1
                print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
