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
print("translate_check OK")
