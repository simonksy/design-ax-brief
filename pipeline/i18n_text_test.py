# pipeline/i18n_text_test.py
from i18n_text import LANGS, resolve, flatten, source_fields

old = {"id": "a", "url": "u", "headline": "옛\n헤드", "body": "본문", "full": {"blocks": [{"t": "p", "x": "전문"}]}}
assert LANGS == ["en", "ko", "ja", "zh", "es"]
f, served = resolve(old, "en")
assert served == "ko" and f["headline"] == "옛\n헤드"          # text 없는 옛 카드 = ko
assert flatten(old, "en")["untranslated"] is True
assert "untranslated" not in flatten(old, "ko") and flatten(old, "ko")["lang"] == "ko"

new = {"id": "b", "url": "u", "source_lang": "en", "headline": "한\n헤드", "body": "한 본문",
       "text": {"en": {"headline": "En\nhead", "body": "En body", "full": {"blocks": []}},
                "ko": {"headline": "한\n헤드", "body": "한 본문", "full": {"blocks": []}}},
       "i18n_status": {"ja": "fallback"}}
assert resolve(new, "ja") == (new["text"]["en"], "en")             # ja 없음 → source_lang(en)
fl = flatten(new, "ja")
assert fl["headline"] == "En\nhead" and fl["untranslated"] is True and fl["lang"] == "en"
assert "text" not in fl and "i18n_status" not in fl and fl["url"] == "u"
assert flatten(new, "ko")["body"] == "한 본문" and "untranslated" not in flatten(new, "ko")

de = {"id": "c", "source_lang": "de", "headline": "Dt\nKopf", "body": "Dt",
      "text": {"_src": {"lang": "de", "headline": "Dt\nKopf", "body": "Dt"},
               "es": {"headline": "Es\ncab", "body": "Es"}}}
assert resolve(de, "ja")[1] == "ko"   # 풀 밖 원문(de)은 노출 안 함, en 없음 → 최상위(ko 취급)
assert source_fields(de) == ({"headline": "Dt\nKopf", "body": "Dt"}, "de")
assert source_fields(new)[1] == "en" and source_fields(old)[1] == "ko"
print("i18n_text OK")
