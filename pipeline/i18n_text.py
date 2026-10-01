"""Per-language card text: resolution order + flattening for the per-language builds.

A card keeps language-independent fields (url, image, accent, …) once and its copy in
`text[lang]` = {headline, body, mini_headline, full}. Cards from before i18n have no
`text`; their top-level fields are Korean. `text["_src"]` holds the original-language
summary when that language is outside the site pool (translation source, never shown).
"""
LANGS = ["en", "ko", "ja", "zh", "es"]
TEXT_FIELDS = ("headline", "body", "mini_headline", "full")


def _top(card):
    return {k: card[k] for k in TEXT_FIELDS if k in card}


def resolve(card, lang):
    text = card.get("text") or {}
    src = card.get("source_lang")
    order = [lang] + ([src] if src in LANGS else []) + ["en"]
    for l in order:
        if text.get(l):
            return text[l], l
    # Top-level copy is Korean only for legacy cards (no source_lang) or Korean-source
    # cards; otherwise it is in the source language (possibly out of pool, e.g. "de").
    if text.get("ko") or not src or src == "ko":
        return _top(card), "ko"
    return _top(card), src


def flatten(card, lang):
    fields, served = resolve(card, lang)
    out = {k: v for k, v in card.items() if k not in ("text", "i18n_status", "_i18n_passed")}
    for k in TEXT_FIELDS:
        out.pop(k, None)
    out.update({k: v for k, v in fields.items() if k in TEXT_FIELDS})
    out["lang"] = served
    if served != lang:
        out["untranslated"] = True
    return out


def source_fields(card):
    text = card.get("text") or {}
    src = card.get("source_lang")
    if src and text.get(src):
        return text[src], src
    if text.get("_src"):
        s = dict(text["_src"])
        return {k: v for k, v in s.items() if k != "lang"}, s.get("lang") or src
    return _top(card), src or "ko"
