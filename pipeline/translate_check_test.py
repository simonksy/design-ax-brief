# pipeline/translate_check_test.py
from translate_check import numbers, brand_tokens, check

# 숫자: 표기 달라도 같은 값, 날짜(≤31 정수)는 무시
assert numbers("국방부가 3030만 달러를 요청했다") == {30300000.0}
assert numbers("The Pentagon asked for $30.3 million") == {30300000.0}
assert numbers("国防総省は3,030万ドルを要求") == {30300000.0}
assert numbers("pidió 30,3 millones de dólares") == {30300000.0}
assert numbers("1.200억 원") == {120000000000.0}
assert numbers("9월 28일 발표") == set() and numbers("announced Sept. 28") == set()
assert numbers("지지율 45%") == {45.0} and numbers("2026년") == {2026.0}

# 브랜드 토큰: OpenAI·GPT-6·FTC는 남아야 하고, 일반 대문자 단어(Pentagon)는 대상 아님
assert brand_tokens("OpenAI and the FTC on GPT-6 at the Pentagon") == {"openai", "ftc", "gpt-6"}

src = {"headline": "FTC opens probe\ninto OpenAI safety",
       "body": "The FTC confirmed to Axios it is investigating safety risks in OpenAI products for $2 billion.",
       "full": {"blocks": [{"t": "img", "src": "https://x/i.jpg", "cap": "FTC HQ"}, {"t": "p", "x": "Body"}]}}
ok = {"headline": "FTC, OpenAI\n안전성 조사 착수",
      "body": "FTC는 OpenAI 제품의 20억 달러 규모 안전 위험을 조사 중이다.",
      "full": {"blocks": [{"t": "img", "src": "https://x/i.jpg", "cap": "FTC 본부"}, {"t": "p", "x": "본문"}]}}
assert check(src, ok, "ko") == [], check(src, ok, "ko")

bad = dict(ok, body="FTC는 제품 안전 위험을 조사 중이라고 악시오스에 확인했다고 밝혔다.")
errs = check(src, bad, "ko")
assert any("number" in e for e in errs) and any("openai" in e for e in errs)
assert any("headline" in e for e in check(src, dict(ok, headline="한 줄 헤드라인"), "ko"))
assert any("body length" in e for e in check(src, dict(ok, body="짧다."), "ko"))
moved = dict(ok, full={"blocks": [{"t": "p", "x": "본문"}, {"t": "img", "src": "https://x/i.jpg"}]})
assert any("block" in e for e in check(src, moved, "ko"))

# 숫자는 집합 "일치"다 — tgt가 src에 없던 수를 더해도 실패해야 한다
added = dict(ok, body="FTC는 OpenAI 20억·50억 달러 위험을 조사 중이다.")
assert any("added" in e for e in check(src, added, "ko"))

# 헤드라인 단독 숫자 오류도 잡아야 한다 — 본문이 맞아도 헤드라인이 가려서는 안 됨
src_h = {"headline": "Pentagon wants\n$30M lie detector",
         "body": "Officials seek a faster screening tool for new hires.",
         "full": {"blocks": []}}
tgt_h = {"headline": "국방부, AI 거짓말\n탐지에 5천만 달러",
         "body": "당국은 신규 채용자를 위한 더 빠른 심사 도구를 찾고 있다.",
         "full": {"blocks": []}}
assert any("headline" in e and "number" in e for e in check(src_h, tgt_h, "ko"))

# 겹친 한자/한글 단위("천만","백만","십만","천억","백억","십억")는 체인으로 곱해진다
assert numbers("3천만 달러") == {30000000.0} == numbers("$30 million")
# 인접한 두 단위 그룹(공백 또는 공백 없음)이 내려가는 자릿수면 하나의 수로 합산된다
assert numbers("1억 2천만 원") == {120000000.0}
assert numbers("3억5천만원") == {350000000.0}
# 일본어 쉼표+万, 중국어/일본어 단위도 동일하게 동작
assert numbers("5,000万円") == {50000000.0}
# 숫자 없이 단위만 있는 토큰은 숫자가 아니다
assert numbers("百万ドル") == set()

# 한글 백/십 단위의 한자 대응(百/十)도 빠짐없이 체인에 들어가야 한다
assert numbers("3백만 달러") == {3000000.0}
assert numbers("2십억 원") == {2000000000.0}
assert numbers("2千万円") == {20000000.0}
assert numbers("3百万円") == {3000000.0}
assert numbers("2千億円") == {200000000000.0}
assert numbers("2千亿元") == {200000000000.0}
assert numbers("3十億円") == {3000000000.0}

# 1) 일반 약어(AI/UI 등)는 브랜드 토큰이 아니다 — 스페인어 "IA", 중국어 "界面"처럼
#    언어별로 자연스럽게 옮겨도 "이름 소실"로 잡히면 안 된다
assert brand_tokens("OpenAI and the FTC use AI for UI") == {"openai", "ftc"}
src_ai = {"headline": "Startup launches\nnew AI tool",
          "body": "The startup unveiled a new AI tool for developers this week, aiming at small teams.",
          "full": {"blocks": []}}
tgt_ia = {"headline": "Startup lanza\nnueva herramienta IA",
          "body": "La startup presentó esta semana una nueva herramienta de IA para equipos pequeños de desarrolladores.",
          "full": {"blocks": []}}
assert check(src_ai, tgt_ia, "es") == [], check(src_ai, tgt_ia, "es")

# 2) 글자에 붙은 숫자는 숫자가 아니다 — "Y2K"의 2는 2000이 아니고, "GPT-4o"의 4는
#    숫자 4가 아니다 (뒤에 글자가 바로 붙은 곱수 접미사도 마찬가지)
assert numbers("트리비아 밤용 Y2K 슬라이드") == set()
assert numbers("GPT-4o") == set()
assert numbers("$30.3 million") == {30300000.0}

# 3) 통화 인식은 "바로 앞/뒤"에만 반응한다 — 문장 어딘가에 "$"가 있다는 것만으로
#    멀리 떨어진 맨숫자(여기서는 "Sonnet 5"의 5)를 돈으로 잘못 세면 안 된다
assert numbers("Pricing is unchanged from Sonnet 5: $2 per million input tokens") == {2.0}
assert numbers("10달러") == {10.0}

# 4) 공백은 절대 숫자 토큰에 섞이지 않는다 — 날짜의 쉼표가 뒤 숫자와 합쳐지면 안 된다
assert numbers("announced September 25, 2026") == {2026.0}
assert numbers("1,200 users") == {1200.0}
assert numbers("pidió 30,3 millones de dólares") == {30300000.0}
assert numbers("1.200억 원") == {120000000000.0}

# 5) "100만 토큰당" -> "per million tokens"처럼 관용적으로 숫자를 생략하는 번역은
#    (10,000 이상의 정확한 10의 거듭제곱이, 숫자+단위 조합에서 나온 경우에 한해) 통과해야 한다
src_mil = {"headline": "모델 가격 정책\n새롭게 공개됐다",
           "body": "100만 토큰당 입력 2달러 수준으로 책정됐다고 밝혔다.",
           "full": {"blocks": []}}
tgt_mil = {"headline": "New model pricing\nis now public today",
           "body": "The company priced the new model at $2 per million input tokens, executives said.",
           "full": {"blocks": []}}
assert check(src_mil, tgt_mil, "en") == [], check(src_mil, tgt_mil, "en")

# Fix round 1: a letter glued AFTER a number is a unit/suffix, not a truncation —
# "123kg" is 123, not a lookahead-driven backtrack down to "12". Keeping this at full
# value (rather than silently dropping it like the old regex did) is what lets check()
# notice a real 123 -> 120 content change instead of letting both collapse to nothing.
assert numbers("weighs 123kg") == {123.0}
assert numbers("weighs 120kg") == {120.0}
src_kg = {"headline": "New sensor\nweighs 123kg",
          "body": "Engineers confirmed the new sensor housing weighs 123kg, slightly heavier than the prototype.",
          "full": {"blocks": []}}
tgt_kg = dict(src_kg, body="Engineers confirmed the new sensor housing weighs 120kg, slightly heavier than the prototype.")
assert any("number" in e for e in check(src_kg, tgt_kg, "en"))
assert numbers("a 1000km trip") == {1000.0}
assert numbers("the 1990s") == {1990.0}
assert numbers("100MB") == {100.0}
assert numbers("5M users") == {5000000.0}
# A multiplier letter/word only multiplies when nothing is glued right after it: "km"
# is a unit suffix on "2", not a "k" thousand-multiplier followed by "m" — so this is
# still just the bare, ignorable day/month-range integer "2".
assert numbers("2km") == set()

# Fix round 3: letter-HYPHEN-digit is only glued when the digit run is ALSO
# immediately followed by a letter (the letter-hyphen-digit-letter shape of
# "GPT-4o"). A bare letter-hyphen-digit designator like "F-35" or "Fortune-500" is
# not glued — the hyphen separates, it doesn't fuse — so the number must survive,
# and a real F-35->F-22 or Fortune-500->Fortune-200 mistranslation must get caught.
assert numbers("F-35 fighter") == {35.0}
assert numbers("Fortune-500 list") == {500.0}
assert numbers("GPT-4o") == set()
src_f500 = {"headline": "Startup makes\nFortune-500 list",
            "body": "The company climbed onto the Fortune-500 list this year for the first time, executives said.",
            "full": {"blocks": []}}
tgt_f200 = dict(src_f500, body="The company climbed onto the Fortune-200 list this year for the first time, executives said.")
assert any("number" in e for e in check(src_f500, tgt_f200, "en"))

# Fix round 3: nullifying a multiplier when a Latin letter follows it applies only to
# Latin units (k/m/b/million/…) — a CJK unit like "万" is never a Latin abbreviation
# that a following Latin letter could demote to a mere suffix.
assert numbers("100万users") == {1000000.0}

# Fix round 4: 조/兆 is the ×10^12 multiplier ONLY when money or a smaller CJK
# magnitude unit follows it — Korean/Japanese legal copy uses the same character for
# an "Article" marker ("제4조", "9401조 (3)항", "4조 3항"), which must stay a bare,
# un-multiplied number (and the usual ≤31 bare-integer exemption still applies).
assert numbers("미국 연방법전 15편 9401조 (3)항") == {9401.0}
assert numbers("4조 3항에 따라") == set()
assert numbers("4조 원 규모") == {4e12}
assert numbers("1조 2천억 원") == {1.2e12}
assert numbers("3兆円") == {3e12}
src_art = {"headline": "법 개정안\n9401조 (3)항",
           "body": "9401조 (3)항에 따라 해당 조치가 즉시 시행된다는 설명이 뒤따랐다.",
           "full": {"blocks": []}}
tgt_art = {"headline": "Amendment under\n§ 9401(3) rule",
           "body": "Officials explained that the measure takes effect immediately under § 9401(3) of the code.",
           "full": {"blocks": []}}
assert check(src_art, tgt_art, "en") == [], check(src_art, tgt_art, "en")

# Fix round 4: geographic/organizational acronyms are routinely translated (欧盟,
# 美国, 联合国, ONU, UE, EE. UU.) and are not brand names.
assert brand_tokens("EU and US at the UN") == set()

print("translate_check OK")
