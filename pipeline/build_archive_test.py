import build_archive as ba

card = {"id": "n", "headline": "한\n헤드", "body": "본문", "url": "https://n", "source_lang": "en",
        "full": {"blocks": [{"t": "p", "x": "secret"}]},
        "text": {"en": {"headline": "Figma ships\nMotion", "body": "Figma Motion adds shaders",
                        "full": {"blocks": [{"t": "p", "x": "secret"}]}},
                 "ko": {"headline": "한\n헤드", "body": "본문"}}}
t = ba.teaser(card)
assert "full" not in t and "full" not in t["text"]["en"] and t["source_lang"] == "en"
rec = dict(t, date="2026-10-02", section="design")
js_en = ba.to_js([rec], "en")
assert "Figma ships" in js_en and "secret" not in js_en and '"text"' not in js_en
assert "한\\n헤드" in ba.to_js([rec], "ko")
assert "figma" in ba._terms(rec) and "본문" not in ba._terms(rec)     # 그래프는 en 우선
old = {"id": "o", "headline": "옛 카드", "body": "피그마 모션", "date": "2026-09-01", "section": "design"}
assert '"untranslated": true' in ba.to_js([old], "ja")
print("build_archive OK")
