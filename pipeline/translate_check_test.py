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
print("translate_check OK")
