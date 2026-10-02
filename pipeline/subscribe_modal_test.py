#!/usr/bin/env python3
"""SubscribeModal이 결제 흐름의 핵심 규칙을 지키는지 정적으로 검사한다."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "axbrief-app.jsx"), encoding="utf-8").read()

# 1) 패트레온 흔적이 없어야 한다
assert "patreon" not in src.lower(), "axbrief-app.jsx still mentions Patreon"

# 2) 결제 성공을 프런트가 단정하지 않는다 — setAuth({entitled:true}) 같은 직접 설정 금지
assert not re.search(r"entitled:\s*true", src), \
    "front end must not grant entitlement itself; it must re-read /api/me"

# 3) 체크아웃은 서버에서 price id를 받아온다 (번들에 하드코딩 금지)
assert "/api/billing/checkout" in src, "checkout endpoint not called"
assert not re.search(r"pri_[a-z0-9]{6,}", src), "price id hardcoded in the bundle"

# 4) 결제 후 /api/me를 다시 읽는다
assert src.count("/api/me") >= 2, "no re-read of /api/me after checkout"

# 5) 플랜 두 가지를 모두 제공한다
for key in ("monthly", "yearly"):
    assert f"'{key}'" in src or f'"{key}"' in src, f"plan {key} missing"

# 6) 새 문구 키가 5개 언어에 모두 있다
need = ["paywall.plan_monthly", "paywall.plan_yearly", "paywall.plan_yearly_note",
        "paywall.trial", "paywall.login_first", "paywall.confirming",
        "paywall.confirm_slow", "paywall.checkout_failed"]
for lang in ("ko", "en", "ja", "zh", "es"):
    d = json.load(open(os.path.join(ROOT, "i18n", f"{lang}.json"), encoding="utf-8"))
    missing = [k for k in need if k not in d]
    assert not missing, f"{lang}.json missing {missing}"
    stale = [k for k in ("paywall.login", "paywall.subscribe", "paywall.new_tab")
             if "atreon" in d.get(k, "")]
    assert not stale, f"{lang}.json still says Patreon in {stale}"

# 7) 비로그인 사용자를 위한 로그인 경로가 모달 안에 있다
assert "/api/auth/request" in src, "no login path inside the subscribe modal"

# 8) 구독자에게 관리 링크를 제공한다
assert "/api/billing/portal" in src, "no manage-subscription link"

# 9) 새 문구 키도 5개 언어에 모두 있다
need2 = ["paywall.email_label", "paywall.send_link", "paywall.link_sent", "paywall.manage",
         "paywall.manage_no_subscription", "paywall.manage_unavailable", "paywall.send_link_failed"]
for lang in ("ko", "en", "ja", "zh", "es"):
    d = json.load(open(os.path.join(ROOT, "i18n", f"{lang}.json"), encoding="utf-8"))
    missing = [k for k in need2 if k not in d]
    assert not missing, f"{lang}.json missing {missing}"

print("subscribe modal OK")
