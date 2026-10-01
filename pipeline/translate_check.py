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

LATIN_MULT = [(r"mil\s+millones", 1e9), (r"millones|millón|million|mn\b|m\b", 1e6),
              (r"billones|billón", 1e12), (r"billion|bn\b|b\b", 1e9), (r"trillion", 1e12),
              (r"thousand|mil\b|k\b", 1e3)]

# CJK magnitude characters are stacked, not chosen from one at a time: "천만" (lit.
# "thousand ten-thousand") means (thousand × ten-thousand) = 10,000,000, the normal
# Korean/Japanese/Chinese way to write $10M-scale numbers — "3천만 달러" is just as
# common as "$30 million". Each character below contributes a multiplicative factor;
# a run of them after one digit (e.g. "천만", "백만", "십억") multiplies together.
# A *second* digit+unit run immediately after (only whitespace, or nothing, between
# them) with a strictly smaller magnitude continues the SAME number rather than
# starting a new one — "1억 2천만" is one number (120,000,000), not two ("1억" and
# "2천만" written separately would be unusual, but when they ARE two separate figures
# — e.g. "20억·50억 달러", two distinct dollar amounts — the magnitudes are equal, not
# strictly decreasing, so they are correctly kept apart).
CJK_UNIT_VALUES = {"조": 1e12, "兆": 1e12, "억": 1e8, "億": 1e8, "亿": 1e8,
                   "만": 1e4, "万": 1e4, "萬": 1e4, "천": 1e3, "千": 1e3,
                   "백": 1e2, "百": 1e2, "십": 1e1, "十": 1e1}
# 拾/佰/仟 (formal/anti-fraud variants of 十/百/千, mainly on Chinese cheques) are
# deliberately not included — real news copy doesn't use them.
_CJK_RUN = "[" + "".join(CJK_UNIT_VALUES) + "]+"

UNIT = "%|" + "|".join(p for p, _ in LATIN_MULT) + "|" + _CJK_RUN
# A thousands separator (",") or European grouping dot (".") only counts as part of
# ONE number when it is followed by exactly three digits and then a non-digit; this
# keeps whitespace from ever being swallowed into a number (a date like "25, 2026"
# must not merge into "252026") since whitespace is no longer in the token's character
# class at all, and keeps a 4+ digit run after a separator from being misread as a
# thousands group.
#
# Deliberately NO lookbehind/lookahead on this regex: an assertion anchored to a
# fixed offset from the END of a greedy \d+ forces the engine to backtrack the digit
# run to whatever shorter prefix satisfies it (e.g. "123kg" would shrink to "12" to
# dodge a trailing-letter lookahead, silently corrupting the value — 123 and 120 both
# collapsed to the same wrong "12"). Letters glued to a number are decided in Python
# instead, by inspecting the plain string around each match (see _scan): a letter
# (optionally letter+hyphen) immediately BEFORE a number means it's not a number at
# all ("Y2K", the "4" in "GPT-4o"); a letter immediately AFTER a number is just a unit
# or suffix ("123kg" is 123, "1990s" is 1990, "100MB" is 100) and never truncates the
# digits — it only blocks a *multiplier* word/abbreviation from applying ("2km" is a
# bare 2, not 2000, because "k" is directly followed by "m").
NUM_CORE = r"\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+(?:[.,]\d+)?"
NUM = re.compile(r"(" + NUM_CORE + r")\s*(" + UNIT + r")?", re.I)
CURRENCY_SYMS = "$€£¥₩"
CURRENCY = re.compile(r"[" + CURRENCY_SYMS + r"]|달러|원|ドル|円|美元|元|dólares|euros|dollars", re.I)


def _latin(ch):
    return bool(ch) and ch.isascii() and ch.isalpha()


def _unit_mult(unit):
    """Multiplier for one matched unit token, and whether it's a CJK magnitude run
    (stackable/chainable) as opposed to a Latin word or bare "%"."""
    if not unit:
        return 1, False
    if all(c in CJK_UNIT_VALUES for c in unit):
        mult = 1.0
        for c in unit:
            mult *= CJK_UNIT_VALUES[c]
        return mult, True
    if unit == "%":
        return 1, False
    low = unit.lower()
    return next((f for p, f in LATIN_MULT if re.fullmatch(p, low, re.I)), 1), False


def _value(raw):
    s = raw.replace(" ", "")
    if re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", s) or re.fullmatch(r"\d+,\d{1,2}", s):
        s = s.replace(".", "").replace(",", ".")      # es/de style 1.200,5 / 30,3
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _scan(text):
    """Yield (value, unit_derived) for every number-ish token in text, honoring the
    bare day/month exemption, the money-adjacency override, and CJK chaining.
    unit_derived is True iff the token's magnitude came from an explicit multiplier
    unit (a Latin word/abbreviation or a CJK magnitude run) rather than being a bare
    digit string."""
    text = text or ""
    matches = []
    for m in NUM.finditer(text):
        start, digit_end = m.start(), m.end(1)
        # Glued to a preceding Latin letter — directly ("Y2K") — means this is not a
        # number at all. A letter-HYPHEN-digit is only glued when the digit run is
        # ALSO immediately followed by a letter, i.e. the full letter-hyphen-digit-
        # letter shape of "GPT-4o" (the "4" sits between "-" and "o"). A bare
        # letter-hyphen-digit with nothing stuck on the other side — "F-35 fighter",
        # "Fortune-500 list" — is a real designator, not a glued-together token: the
        # hyphen there is separating, not fusing, so the number must survive.
        prev = text[start - 1] if start >= 1 else ""
        glued = _latin(prev)
        if not glued and prev == "-" and start >= 2 and _latin(text[start - 2]):
            glued = _latin(text[digit_end: digit_end + 1])
        if glued:
            continue
        v = _value(m.group(1))
        if v is None:
            continue
        unit = m.group(2) or ""
        mult, is_cjk = _unit_mult(unit)
        # A Latin multiplier unit/abbreviation only multiplies when nothing is glued
        # right after it ("5M users" is 5,000,000; "100MB" is a bare 100, since "M" is
        # immediately followed by "B", not a boundary — it's a suffix, not a unit).
        # CJK magnitude units are never affected by this — "100万users" still means
        # 1,000,000, since "万" isn't a Latin abbreviation that a following Latin
        # letter could turn into a mere suffix.
        if unit and mult != 1 and not is_cjk and _latin(text[m.end(): m.end() + 1]):
            mult, is_cjk = 1, False
        matches.append((m.start(), m.end(), v, unit, mult, is_cjk))

    out = []
    i, n = 0, len(matches)
    while i < n:
        start_i, end_i, v_i, unit_i, mult_i, cjk_i = matches[i]
        term = v_i * mult_i
        chain_mult, chain_cjk, j = mult_i, cjk_i, i
        while chain_cjk and chain_mult > 1 and j + 1 < n:
            s2, _e2, v2, _u2, mult2, cjk2 = matches[j + 1]
            gap = text[matches[j][1]: s2]
            if cjk2 and 1 < mult2 < chain_mult and gap.strip() == "":
                term += v2 * mult2
                chain_mult, chain_cjk = mult2, cjk2
                j += 1
            else:
                break
        # the bare day/month exemption only applies to a lone, unmerged, un-multiplied
        # integer — a compound CJK number (mult > 1) is never a date
        if j == i and mult_i == 1 and unit_i != "%":
            # Money overrides the day/month exemption, but only on TIGHT adjacency: a
            # currency symbol immediately before the number (whitespace allowed), or a
            # currency word/symbol immediately after it — after the multiplier unit (if
            # any; already inside [end_i] since the unit is part of the match) and
            # whitespace. A "$" or "5" merely appearing somewhere nearby in the
            # sentence (e.g. "Sonnet 5: $2 per million") must NOT make "5" money.
            head_stripped = text[:start_i].rstrip()
            money_before = bool(head_stripped) and head_stripped[-1] in CURRENCY_SYMS
            tail_stripped = text[end_i:].lstrip()
            money_after = bool(CURRENCY.match(tail_stripped))
            money = money_before or money_after
            if not money and v_i.is_integer() and v_i <= 31:
                i = j + 1
                continue
        out.append((round(term, 2), mult_i != 1))
        i = j + 1
    return out


def numbers(text):
    return {term for term, _ in _scan(text)}


def _is_pow10_ge(value, floor):
    """True iff value is an exact power of ten that is >= floor."""
    if value < floor:
        return False
    t = int(round(value))
    if t <= 0 or t != value:
        return False
    s = str(t)
    return s[0] == "1" and set(s[1:]) <= {"0"}


def _idiomatic_pow10(text):
    """Values that are an exact power of ten >= 10,000 AND came from a digit+unit
    magnitude combo (100만, 1억, 1 million, 1M, …) rather than a bare literal digit
    string. A translation is free to reword that combo idiomatically (e.g. "100만
    토큰당" -> "per million tokens"), dropping the literal digit — that is a style
    choice, not a dropped fact, so it must not fail check()."""
    return {term for term, unit_derived in _scan(text) if unit_derived and _is_pow10_ge(term, 10000)}


# Python's \b is Unicode-aware, so it will NOT split "FTC" from an attached Korean/
# Japanese/Chinese particle like "는" (both count as \w) — Korean grammar glues such
# particles directly onto Latin tokens with no space. Use ASCII-only lookaround instead
# so a CJK neighbor still counts as a boundary.
BRAND = re.compile(r"(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9.+\-]*[A-Za-z0-9](?![A-Za-z0-9])")

# Generic acronyms that read as all-caps brand-shaped tokens but are not names: a
# translation is free to render them natively (Spanish "IA" for "AI", Chinese "界面"
# for "UI") without that counting as a dropped brand/name.
GENERIC_ACRONYMS = {"ai", "ui", "ux", "ceo", "cto", "cfo", "coo", "cpo",
                     "vr", "ar", "xr", "pc", "tv", "os"}


def brand_tokens(text):
    out = set()
    for t in BRAND.findall(text or ""):
        low = t.lower()
        if low in GENERIC_ACRONYMS:
            continue
        mixed = any(c.isupper() for c in t[1:]) and any(c.islower() for c in t)
        if mixed or any(c.isdigit() for c in t) or (t.isupper() and len(t) >= 2):
            out.add(low)
    return out


def _blocks(f):
    return ((f or {}).get("full") or {}).get("blocks") or []


def _headline_text(f):
    return f.get("headline") or ""


def _body_text(f):
    """Text that must carry numbers/brand names intact from the body side: the card
    body plus the long-form article paragraphs. Deliberately excludes image/video
    captions (routinely re-expressed as a plain translated word, e.g. "HQ" -> "본부",
    rather than kept as a literal token)."""
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
    # Per field, not pooled: pooling would let a number/brand that only the headline
    # drops or changes hide behind an unrelated field that still has it (and vice
    # versa) — the headline has its own line-count check above but still carries
    # facts (e.g. a dollar amount) that must survive just like the body's.
    for name, s_text, t_text in (("headline", _headline_text(src), _headline_text(tgt)),
                                  ("body", _body_text(src), _body_text(tgt))):
        s_num, t_num = numbers(s_text), numbers(t_text)
        missing, added = s_num - t_num, t_num - s_num
        # An idiomatic magnitude dropped on translation (see _idiomatic_pow10) is a
        # style choice, not a missing fact — only exempt it from the SOURCE side, so
        # a target that invents a brand-new round number still fails via "added".
        missing -= _idiomatic_pow10(s_text)
        if missing:
            errs.append(f"number(s) missing or changed in {name}: {sorted(missing)}")
        if added:
            errs.append(f"number(s) added in {name}: {sorted(added)}")
        # Brand tokens stay one-directional: a translation is free to add a legitimate
        # latin term (e.g. "AI") that wasn't in the source.
        lost = brand_tokens(s_text) - brand_tokens(t_text)
        lost = {t for t in lost if t not in t_text.lower()}
        if lost:
            errs.append(f"name(s) missing in {name}: {sorted(lost)}")
    sb, tb = _blocks(src), _blocks(tgt)
    if [b.get("t") for b in sb] != [b.get("t") for b in tb]:
        errs.append("full block types/order differ")
    else:
        for a, b in zip(sb, tb):
            if a.get("t") in ("img", "video") and {k: v for k, v in a.items() if k != "cap"} != \
                    {k: v for k, v in b.items() if k != "cap"}:
                errs.append("media block changed")
    return errs
