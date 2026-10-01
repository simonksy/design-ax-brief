# pipeline/translate_check.py
"""Deterministic checks a translation must pass before it is published.

Facts must survive translation, but number formats differ by language (3030만 달러 /
$30.3 million / 3,030万ドル / 30,3 millones), so numbers are compared as VALUES with
their multiplier applied. Bare integers ≤ 31 are ignored — they are day/month numbers
whose form changes with the language's date style ("9월 28일" vs "Sept. 28")."""
import re

LIMITS = {"ko": {"line": 14, "body": (28, 46)}, "ja": {"line": 14, "body": (28, 46)},
          "zh": {"line": 14, "body": (28, 46)}, "en": {"line": 32, "body": (70, 120)},
          "es": {"line": 32, "body": (70, 120)}}

MULT = [(r"mil\s+millones", 1e9), (r"millones|millón|million|mn\b|m\b", 1e6),
        (r"billones|billón", 1e12), (r"billion|bn\b|b\b", 1e9), (r"trillion", 1e12),
        (r"thousand|mil\b|k\b", 1e3), (r"조|兆", 1e12), (r"억|億|亿", 1e8),
        (r"만|万|萬", 1e4), (r"천|千", 1e3)]
NUM = re.compile(r"(\d[\d,.\s]*\d|\d)\s*(%|" + "|".join(p for p, _ in MULT) + r")?", re.I)
CURRENCY = re.compile(r"[$€£¥₩]|달러|원|ドル|円|美元|元|dólares|euros|dollars", re.I)


def _value(raw, lang_hint=None):
    s = raw.replace(" ", "")
    if re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", s) or re.fullmatch(r"\d+,\d{1,2}", s):
        s = s.replace(".", "").replace(",", ".")      # es/de style 1.200,5 / 30,3
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def numbers(text):
    out = set()
    for m in NUM.finditer(text or ""):
        v = _value(m.group(1))
        if v is None:
            continue
        unit = (m.group(2) or "").lower()
        mult = next((f for p, f in MULT if unit and re.fullmatch(p, unit, re.I)), 1)
        tail = text[m.end(): m.end() + 12]
        head = text[max(0, m.start() - 2): m.start()]
        money = bool(CURRENCY.search(tail) or CURRENCY.search(head))
        if mult == 1 and unit != "%" and not money and v.is_integer() and v <= 31:
            continue
        out.add(round(v * mult, 2))
    return out


# Python's \b is Unicode-aware, so it will NOT split "FTC" from an attached Korean/
# Japanese/Chinese particle like "는" (both count as \w) — Korean grammar glues such
# particles directly onto Latin tokens with no space. Use ASCII-only lookaround instead
# so a CJK neighbor still counts as a boundary.
BRAND = re.compile(r"(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9.+\-]*[A-Za-z0-9](?![A-Za-z0-9])")


def brand_tokens(text):
    out = set()
    for t in BRAND.findall(text or ""):
        mixed = any(c.isupper() for c in t[1:]) and any(c.islower() for c in t)
        if mixed or any(c.isdigit() for c in t) or (t.isupper() and len(t) >= 2):
            out.add(t.lower())
    return out


def _blocks(f):
    return ((f or {}).get("full") or {}).get("blocks") or []


def _fact_text(f):
    """Text that must carry numbers/brand names intact: the card body plus the
    long-form article paragraphs. Deliberately excludes the headline (it has its own
    line-count/length check and may legitimately keep an original-language fragment
    without that making the body's translation "safe") and image/video captions
    (routinely re-expressed as a plain translated word, e.g. "HQ" -> "본부", rather
    than kept as a literal token)."""
    parts = [f.get("body", "")]
    for b in _blocks(f):
        parts.append(b.get("x", ""))
    return " ".join(p for p in parts if p)


def check(src, tgt, lang):
    errs = []
    lim = LIMITS[lang]
    head = tgt.get("headline") or ""
    if head.count("\n") != 1:
        errs.append("headline must have exactly one line break")
    elif any(len(line) > lim["line"] for line in head.split("\n")):
        errs.append(f"headline line longer than {lim['line']} chars")
    body = (tgt.get("body") or "").strip()
    lo, hi = lim["body"]
    if not lo <= len(body) <= hi:
        errs.append(f"body length {len(body)} not in {lo}-{hi}")
    missing = numbers(_fact_text(src)) - numbers(_fact_text(tgt))
    if missing:
        errs.append(f"number(s) missing or changed: {sorted(missing)}")
    lost = brand_tokens(_fact_text(src)) - {t for t in brand_tokens(_fact_text(tgt))}
    lost = {t for t in lost if t not in _fact_text(tgt).lower()}
    if lost:
        errs.append(f"name(s) missing: {sorted(lost)}")
    sb, tb = _blocks(src), _blocks(tgt)
    if [b.get("t") for b in sb] != [b.get("t") for b in tb]:
        errs.append("full block types/order differ")
    else:
        for a, b in zip(sb, tb):
            if a.get("t") in ("img", "video") and {k: v for k, v in a.items() if k != "cap"} != \
                    {k: v for k, v in b.items() if k != "cap"}:
                errs.append("media block changed")
    return errs
