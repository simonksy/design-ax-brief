# pipeline/build_i18n.py
"""i18n/<lang>.json (source of truth) -> i18n/<lang>.js for the browser.
Missing keys fall back to the Korean string (warned); --check makes that an error."""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LANGS = ["en", "ko", "ja", "zh", "es"]


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.dirname(HERE))
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    d = os.path.join(a.root, "i18n")
    ko = json.load(open(os.path.join(d, "ko.json"), encoding="utf-8"))
    missing_any = False
    for lang in LANGS:
        p = os.path.join(d, f"{lang}.json")
        tr = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
        missing = [k for k in ko if k not in tr]
        if missing and lang != "ko":
            missing_any = True
            print(f"[{lang}] missing {len(missing)} key(s): {', '.join(missing[:10])}", file=sys.stderr)
        merged = {k: tr.get(k, v) for k, v in ko.items()}
        js = "window.AX_I18N = " + json.dumps(merged, ensure_ascii=False, indent=1) + ";\n"
        if lang == "ko":
            js += "window.AX_I18N_KO = window.AX_I18N;\n"
        open(os.path.join(d, f"{lang}.js"), "w", encoding="utf-8").write(js)
    return 1 if (a.check and missing_any) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
