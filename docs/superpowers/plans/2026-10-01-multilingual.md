# 다국어화 (5개 언어) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카드뉴스 요약·전문과 UI를 en/ko/ja/zh/es 5개 언어로 발행하고, 사이트에서 언어를 골라 읽게 한다.

**Architecture:** 카드는 언어 무관 필드 + `text[lang]` 맵을 갖는다. 작성 단계가 원문 언어로 요약하고, Claude Code 서브에이전트(`ax-translator`)가 나머지 언어로 번역하며 `translate.py`가 작업 파일을 만들고 결과를 검증·반영한다(API 호출·API 키 없음). 빌드는 언어마다 기존과 같은 모양의 평탄화된 산출물(`axbrief-data.{lang}.js` 등)을 내므로 앱은 데이터 모양을 바꾸지 않고 로드할 파일과 UI 사전만 바꾼다. Worker가 `/{lang}/*` 경로를 같은 HTML로 서빙하며 언어를 주입한다.

**Tech Stack:** Python 3 표준 라이브러리(파이프라인, 테스트는 assert 스크립트), Claude Code 서브에이전트(번역, API 크레딧 미사용), Cloudflare Workers + HTMLRewriter, vitest(`@cloudflare/vitest-pool-workers`), React 18 UMD + Babel standalone(앱).

**Spec:** `docs/superpowers/specs/2026-10-01-multilingual-design.md`

## Global Constraints

- 언어 풀(순서 고정): `["en", "ko", "ja", "zh", "es"]`. `zh` = 简体中文.
- 폴백 순서(카드 텍스트): 요청 언어 → `source_lang`(풀 안일 때) → `en` → 최상위 필드(`ko`).
- 길이 한도: ko/ja/zh 헤드라인 줄당 ≤ 14자, 본문 28–46자 한 문장 / en/es 헤드라인 줄당 ≤ 32자, 본문 70–120자 한 문장 (en/es 값은 Task 12에서 렌더로 확정). 헤드라인은 `\n` 정확히 1개.
- 사실·수치·날짜·인용·고유명사 불변. 이미지·영상 블록은 `cap` 외 불변.
- 번역은 Claude Code 서브에이전트 `ax-translator`가 한다 — API 호출·API 키 없음. 작업(카드×언어)당 최대 3회 시도(최초 + 재시도 2), 실패는 `i18n_status[lang] = "fallback"`. 같은 대상 파일에 대한 `apply`는 순차 실행(병렬 금지).
- 기존 공유 링크 `/s/{section}/{id}`와 `axbrief-data.js`·`premium/full.json`은 유지(ko).
- 쿠키: 언어 `ax_lang`(1년), 비공개 플래그 `ax_i18n=1`. 공개 스위치는 Worker env `I18N_PUBLIC="1"`.
- 파이썬 테스트는 `pipeline/*_test.py`(assert 스크립트, `cd pipeline && python3 X_test.py`), Worker 테스트는 `npm test`.
- 모든 커밋 메시지 끝에 세션 attribution 두 줄(Co-Authored-By / Claude-Session)을 붙인다.

## Review Focus

1. **숫자 표기가 언어마다 다름** (`3030만 달러` ↔ `$30.3 million` ↔ `3,030万ドル` ↔ `30,3 millones`) — 검증기가 같은 값으로 보고 통과시켜야 한다. 날짜(`9월 28일` ↔ `Sept. 28`)는 오탐하지 않아야 한다. → Task 2 테스트.
2. **`zh-TW`/`zh-HK`·`es-419`·`pt-BR` 같은 브라우저 언어** — zh-*는 zh, es-*는 es, 풀 밖은 en으로 가야 한다. → Task 7 테스트.
3. **`text`가 없는 옛 카드와 일부 언어만 있는 카드가 섞인 덱** — 빌드·롤·아카이브가 깨지지 않고 해당 칸만 `untranslated` 표시. → Task 1·4·5·6 테스트.
4. **`/en/` 아래 상대 경로 자산** (`_ds/...`, `axbrief-app.jsx`) — `<base href="/">` 주입으로 루트 기준 로드돼야 한다. → Task 7 테스트.
5. **번역 에이전트가 답을 코드펜스·문자열로 쓰거나 일부 job을 빠뜨림** — `apply`가 견디고, 빠지거나 깨진 답은 재시도 작업으로 간다. → Task 3 테스트.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `pipeline/i18n_text.py` (신규) | 언어 풀, 카드 텍스트 해석·폴백, 언어별 평탄화 |
| `pipeline/translate_check.py` (신규) | 번역 검증기(숫자·브랜드 토큰·블록 구조·길이) |
| `pipeline/translate.py` (신규) | 번역 작업 파일 생성(jobs)·답 검증 반영(apply)·재검증(check) — 카드/뉴스/UI/아카이브 대상 |
| `.claude/agents/ax-translator.md` (신규) | 작업 파일을 읽고 답 파일을 쓰는 번역 서브에이전트 |
| `pipeline/roll.py` (수정) | 덱 이동 시 `text`/`source_lang`/`i18n_status` 보존 |
| `pipeline/update_ledger.py` (수정) | 스토리 원장이 원문 언어 요약을 우선 사용 |
| `pipeline/build_data.py` (수정) | 언어별 데이터 JS·프리미엄 분할·언어별 공유 페이지 |
| `pipeline/build_archive.py` (수정) | 아카이브 `text` 티저 보존, 언어별 아카이브 JS, 그래프 키워드 en 우선 |
| `pipeline/build_i18n.py` (신규) | `i18n/{lang}.json` → `i18n/{lang}.js` |
| `i18n/{ko,en,ja,zh,es}.json` (신규) | UI 사전 |
| `i18n.js` (신규) | 브라우저 `t()`·날짜 포맷·언어 메뉴 이동 |
| `worker/lib/lang.js` (신규) | 언어 선택·경로 파싱 |
| `worker/index.js` (수정) | `/`·`/{lang}/*` 라우팅, HTML 주입, 프리미엄·insights 언어 |
| `wrangler.jsonc` (수정) | `run_worker_first`에 HTML 경로 추가 |
| `index.html`, `large.html`, `archive.html`, `axbrief-app.jsx`, `axbrief-app-large.jsx` (수정) | 언어별 데이터·사전 로드, `t()` 사용, 언어 메뉴, 미번역 라벨 |
| `.claude/agents/ax-writer.md`, `.claude/skills/design-ax-daily-news/SKILL.md`, `~/.design-ax-brief/automation/run_daily_news.sh` (수정) | 원문 언어 작성·번역 단계 편입 |

---

### Task 1: 카드 텍스트 모델 (`i18n_text.py`)

**Files:**
- Create: `pipeline/i18n_text.py`
- Test: `pipeline/i18n_text_test.py`

**Interfaces:**
- Produces:
  - `LANGS: list[str]` = `["en","ko","ja","zh","es"]`
  - `TEXT_FIELDS: tuple` = `("headline","body","mini_headline","full")`
  - `resolve(card: dict, lang: str) -> tuple[dict, str]` — (해당 언어 텍스트 필드 dict, 실제 반환 언어)
  - `flatten(card: dict, lang: str) -> dict` — `text`·`i18n_status` 제거, 최상위 텍스트 필드를 해석 결과로 교체, `lang` 키에 실제 언어, 요청과 다르면 `untranslated: True`
  - `source_fields(card: dict) -> tuple[dict, str]` — 번역 원천 (원문 언어 요약, 언어 코드). `text[source_lang]` → `text["_src"]` → 최상위 필드(언어 = `source_lang` 또는 `"ko"`)

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 i18n_text_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'i18n_text'`

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/i18n_text.py
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
    return _top(card), "ko"


def flatten(card, lang):
    fields, served = resolve(card, lang)
    out = {k: v for k, v in card.items() if k not in ("text", "i18n_status")}
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python3 i18n_text_test.py`
Expected: `i18n_text OK`

- [ ] **Step 5: Commit**

```bash
git add pipeline/i18n_text.py pipeline/i18n_text_test.py
git commit -m "feat(i18n): 카드 언어별 텍스트 해석·폴백·평탄화"
```

---

### Task 2: 번역 검증기 (`translate_check.py`)

**Files:**
- Create: `pipeline/translate_check.py`
- Test: `pipeline/translate_check_test.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `LIMITS: dict[str, dict]` — `{"ko": {"line": 14, "body": (28, 46)}, ...}`
  - `numbers(text: str) -> set[float]` — 값이 31 초과이거나 소수이거나 %·통화·배수(만/억/million…)가 붙은 숫자만, 배수 적용한 값
  - `brand_tokens(text: str) -> set[str]` — 소문자화한 브랜드형 라틴 토큰(대소문자 혼합·숫자 포함·2자 이상 전부 대문자)
  - `check(src: dict, tgt: dict, lang: str) -> list[str]` — 오류 메시지 목록(빈 목록 = 통과). `src`/`tgt` = `{"headline","body","full"?,"mini_headline"?}`

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 translate_check_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'translate_check'`

- [ ] **Step 3: Write minimal implementation**

```python
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


BRAND = re.compile(r"\b[A-Za-z][A-Za-z0-9.+\-]*[A-Za-z0-9]\b")


def brand_tokens(text):
    out = set()
    for t in BRAND.findall(text or ""):
        mixed = any(c.isupper() for c in t[1:]) and any(c.islower() for c in t)
        if mixed or any(c.isdigit() for c in t) or (t.isupper() and len(t) >= 2):
            out.add(t.lower())
    return out


def _blocks(f):
    return ((f or {}).get("full") or {}).get("blocks") or []


def _all_text(f):
    parts = [f.get("headline", ""), f.get("body", "")]
    for b in _blocks(f):
        parts += [b.get("x", ""), b.get("cap", "")]
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
    missing = numbers(_all_text(src)) - numbers(_all_text(tgt))
    if missing:
        errs.append(f"number(s) missing or changed: {sorted(missing)}")
    lost = brand_tokens(_all_text(src)) - {t for t in brand_tokens(_all_text(tgt))}
    lost = {t for t in lost if t not in _all_text(tgt).lower()}
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python3 translate_check_test.py`
Expected: `translate_check OK`. 실패하면 실패한 assert의 입력으로 `numbers()`를 직접 찍어 정규식을 고친다(테스트를 고치지 말 것 — 테스트 값이 스펙이다).

- [ ] **Step 5: Commit**

```bash
git add pipeline/translate_check.py pipeline/translate_check_test.py
git commit -m "feat(i18n): 번역 검증기 — 숫자 값·브랜드 토큰·블록 구조·길이"
```

---

### Task 3: 번역 작업 파일·판정 (`translate.py jobs/apply`) + 번역 에이전트

번역은 API 호출 없이 Claude Code 서브에이전트(`ax-translator`)가 한다. 이 스크립트는 **작업 파일을 만들고(jobs)**, 에이전트가 쓴 **답 파일을 검증해 반영(apply)**할 뿐이다.

**Files:**
- Create: `pipeline/translate.py`
- Create: `.claude/agents/ax-translator.md`
- Test: `pipeline/translate_test.py`

**Interfaces:**
- Consumes: `i18n_text.LANGS`, `i18n_text.TEXT_FIELDS`, `i18n_text.source_fields`, `translate_check.LIMITS`, `translate_check.check`
- Produces:
  - `MAX_ATTEMPTS = 3` (최초 + 재시도 2)
  - `NAMES: dict[str, str]` (언어 코드 → 영어 언어명), `STYLE: dict[str, str]`
  - `build_prompt(src: dict, src_lang: str, lang: str, errors: list[str] | None = None) -> str` — 에이전트가 그대로 따를 완결된 지시문(입력 JSON 포함). 재시도면 `"Your previous answer failed these checks — fix them: …"` 줄 포함
  - `parse_reply(reply: str | dict) -> dict` — dict면 그대로, 문자열이면 코드펜스·앞뒤 잡문 제거 후 첫 JSON 객체. 실패 시 `ValueError`
  - `ensure_source(card: dict) -> tuple[dict, str]` — **카드를 수정**: 원문 언어 요약을 `text[src_lang]`(풀 안) 또는 `text["_src"]`(풀 밖, `lang` 키 포함)에 넣고 `(src, src_lang)` 반환
  - `make_job(key, src, src_lang, lang, attempt=1, errors=None) -> dict` — `{"job_id": f"{key}|{lang}", "key", "src_lang", "lang", "attempt", "src", "prompt"}`
  - `card_jobs(card: dict, key: str, langs=LANGS) -> list[dict]` — 카드를 수정하지 않음. `text`에 없고 `i18n_status[lang] != "fallback"`인 언어만
  - `judge(job: dict, reply) -> tuple[dict | None, list[str]]` — `None` 답 = `["no answer"]`
  - `apply_to_card(card: dict, jobs: list[dict], answers: dict) -> list[dict]` — 카드를 수정, 재시도 job 목록 반환. 성공 → `text[lang]`; 실패 & `attempt < MAX_ATTEMPTS` → `make_job(..., attempt+1, errs)`; 실패 & 마지막 → `i18n_status[lang] = "fallback"`. 끝에 최상위 텍스트 필드 = `text["ko"]`(있으면)
  - `TARGETS: dict[str, callable]` — `kind` → `(doc, **kw) -> dict[key, card]` (수정 가능한 참조). 이 태스크는 `"cards"`(key = 카드 `id`)만. Task 12가 `"news"`, Task 14가 `"archive"`를 추가
  - 작업 파일 형식: `{"kind": "cards", "target": "<abs path>", "jobs": [job, …]}` / 답 파일: `{"<job_id>": {번역 객체} | "<문자열>"}`
  - CLI (`argparse` 서브커맨드):
    - `python3 translate.py jobs --cards FILE --out JOBS` → 작업 수 출력, 종료코드 0
    - `python3 translate.py apply --jobs JOBS --answers ANSWERS [--retry-out PATH]` → 대상 파일을 제자리 갱신. 모두 해결 = 종료코드 0 (`all jobs resolved`), 재시도 남음 = 종료코드 10 + `JOBS`의 `.json`을 `.retry.json`으로 바꾼 경로(이미 `.retry.json`이면 덮어씀)에 재시도 작업 파일

- [ ] **Step 1: Write the failing test**

```python
# pipeline/translate_test.py
import json, os, subprocess, tempfile
import translate as tr

SRC = {"headline": "FTC opens probe\ninto OpenAI safety",
       "body": "The FTC confirmed to Axios it is investigating safety risks in OpenAI products for $2 billion.",
       "full": {"mode": "summary", "blocks": [{"t": "p", "x": "The FTC sent civil investigative demands."}]}}
KO = {"headline": "FTC, OpenAI\n안전성 조사 착수",
      "body": "FTC는 OpenAI 제품의 20억 달러 규모 안전 위험을 조사 중이라고 확인했다.",
      "full": {"mode": "summary", "blocks": [{"t": "p", "x": "FTC는 민사 조사 요구서를 보냈다."}]}}

# parse_reply: dict, fenced and chatty replies
assert tr.parse_reply(KO) == KO
assert tr.parse_reply("```json\n" + json.dumps(KO, ensure_ascii=False) + "\n```") == KO
assert tr.parse_reply("Here you go:\n" + json.dumps(KO, ensure_ascii=False) + "\nDone.") == KO
try:
    tr.parse_reply("not json"); raise AssertionError("should fail")
except ValueError:
    pass

p = tr.build_prompt(SRC, "en", "ko", ["body length 10 not in 28-46"])
assert "Korean" in p and "body length 10" in p and "OpenAI" in p and "previous answer failed" in p

# card_jobs: one job per missing language, input untouched
card = dict(SRC, id="ftc", url="https://x", source_lang="en")
jobs = tr.card_jobs(card, "ftc")
assert [j["lang"] for j in jobs] == ["ko", "ja", "zh", "es"] and all(j["attempt"] == 1 for j in jobs)
assert jobs[1]["job_id"] == "ftc|ja" and "Japanese" in jobs[1]["prompt"]
assert card.get("text") is None

# apply_to_card: pass / garbage / missing / fails checks -> retries with errors, then fallback
c = json.loads(json.dumps(card))
answers = {"ftc|ko": KO, "ftc|ja": "garbage", "ftc|es": json.dumps(KO, ensure_ascii=False)}
retry = tr.apply_to_card(c, jobs, answers)
assert c["text"]["en"]["headline"] == SRC["headline"] and c["text"]["ko"] == KO
assert sorted(j["lang"] for j in retry) == ["es", "ja", "zh"] and all(j["attempt"] == 2 for j in retry)
assert "previous answer failed" in next(j for j in retry if j["lang"] == "es")["prompt"]
assert c["headline"] == KO["headline"] and c["body"] == KO["body"] and "i18n_status" not in c
assert tr.apply_to_card(c, [dict(j, attempt=3) for j in retry], {}) == []
assert c["i18n_status"] == {"ja": "fallback", "zh": "fallback", "es": "fallback"}
assert tr.card_jobs(c, "ftc") == []          # done + fallback languages are not re-queued

# out-of-pool source language goes to text["_src"], never to a visible language
de = {"id": "de", "source_lang": "de", "headline": "Dt\nKopf", "body": "Dt"}
src, sl = tr.ensure_source(de)
assert sl == "de" and de["text"]["_src"]["lang"] == "de" and "de" not in de["text"]

# CLI round trip
d = tempfile.mkdtemp()
f, j, a = (os.path.join(d, n) for n in ("cards_x.json", "jobs_x.json", "answers_x.json"))
json.dump({"date": "2026-10-02", "cards": [card]}, open(f, "w"))
run = lambda *args: subprocess.run(["python3", "translate.py", *args], capture_output=True, text=True)
r = run("jobs", "--cards", f, "--out", j)
assert r.returncode == 0, r.stderr
assert len(json.load(open(j))["jobs"]) == 4 and json.load(open(j))["kind"] == "cards"
json.dump({"ftc|ko": KO}, open(a, "w"), ensure_ascii=False)
r = run("apply", "--jobs", j, "--answers", a)
assert r.returncode == 10, r.stdout + r.stderr
saved = json.load(open(f))["cards"][0]
assert saved["text"]["ko"] == KO and saved["body"] == KO["body"]
assert len(json.load(open(os.path.join(d, "jobs_x.retry.json")))["jobs"]) == 3
print("translate OK")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 translate_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'translate'`

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/translate.py
"""Translate card copy from the original-language summary into the site languages —
with no API calls. Claude Code subagents (.claude/agents/ax-translator.md) do the
translating inside the normal pipeline run; this script prepares the work and judges it:

    python3 translate.py jobs  --cards cards_<S>.json --out jobs_<S>.json
    (ax-translator: reads jobs_<S>.json, writes answers_<S>.json)
    python3 translate.py apply --jobs jobs_<S>.json --answers answers_<S>.json
        exit 0  = every job resolved (translated, or recorded as fallback)
        exit 10 = some answers failed translate_check -> jobs_<S>.retry.json (errors fed
                  back into each prompt); run ax-translator on it and apply again.
A job gets MAX_ATTEMPTS tries; a language that still fails is recorded in
`i18n_status` and the build serves the fallback language with an "untranslated" label."""
import argparse
import json
import os
import re
import sys

from i18n_text import LANGS, TEXT_FIELDS, source_fields
from translate_check import LIMITS, check

MAX_ATTEMPTS = 3
NAMES = {"en": "English", "ko": "Korean", "ja": "Japanese", "zh": "Simplified Chinese",
         "es": "Spanish", "de": "German", "fr": "French"}
STYLE = {
    "ko": "Calm Korean editorial voice. No 번역투, no stacked passives, end sentences with 다.",
    "ja": "Calm Japanese editorial voice (だ・である調). Avoid literal translationese.",
    "zh": "Calm Simplified Chinese editorial voice. Avoid literal translationese.",
    "en": "Calm, plain English editorial voice. No hype words.",
    "es": "Calm, neutral Spanish editorial voice (no regionalisms). No hype words.",
}


def build_prompt(src, src_lang, lang, errors=None):
    lim = LIMITS[lang]
    rules = [
        f"Translate this news card from {NAMES.get(src_lang, src_lang)} into {NAMES[lang]}.",
        "Keep every fact, number, date, quote and proper noun exactly; add nothing.",
        "Keep brand/product names in their original Latin spelling (e.g. OpenAI, GPT-6, FTC).",
        f"headline: exactly two lines separated by one \\n, each line at most {lim['line']} characters.",
        f"body: exactly one complete sentence, {lim['body'][0]}-{lim['body'][1]} characters.",
        "mini_headline (if present): one short line.",
        "full.blocks: same blocks in the same order; translate only `x` and `cap`; "
        "copy every other key (src, yt, t) unchanged.",
        STYLE[lang],
        "Answer with ONLY the JSON object, same keys as the input.",
    ]
    if errors:
        rules.append("Your previous answer failed these checks — fix them: " + "; ".join(errors))
    return "\n".join("- " + r for r in rules) + "\n\nINPUT:\n" + json.dumps(src, ensure_ascii=False)


def parse_reply(reply):
    if isinstance(reply, dict):
        return reply
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", (reply or "").strip(), flags=re.M)
    start = t.find("{")
    if start < 0:
        raise ValueError("no JSON object in reply")
    obj, _ = json.JSONDecoder().raw_decode(t[start:])
    if not isinstance(obj, dict):
        raise ValueError("reply is not an object")
    return obj


def ensure_source(card):
    src, src_lang = source_fields(card)
    src = {k: v for k, v in src.items() if k in TEXT_FIELDS}
    text = card.setdefault("text", {})
    if src_lang in LANGS:
        text.setdefault(src_lang, src)
    else:
        text.setdefault("_src", dict(src, lang=src_lang))
    return src, src_lang


def make_job(key, src, src_lang, lang, attempt=1, errors=None):
    return {"job_id": f"{key}|{lang}", "key": key, "src_lang": src_lang, "lang": lang,
            "attempt": attempt, "src": src, "prompt": build_prompt(src, src_lang, lang, errors)}


def card_jobs(card, key, langs=LANGS):
    c = json.loads(json.dumps(card))
    src, src_lang = ensure_source(c)
    status = c.get("i18n_status") or {}
    return [make_job(key, src, src_lang, l) for l in langs
            if l not in c["text"] and status.get(l) != "fallback"]


def judge(job, reply):
    if reply is None:
        return None, ["no answer"]
    try:
        out = parse_reply(reply)
    except ValueError as e:
        return None, [f"invalid reply: {e}"]
    out = {k: v for k, v in out.items() if k in TEXT_FIELDS}
    errs = check(job["src"], out, job["lang"])
    return (None, errs) if errs else (out, [])


def apply_to_card(card, jobs, answers):
    ensure_source(card)
    status = dict(card.get("i18n_status") or {})
    retry = []
    for job in jobs:
        out, errs = judge(job, answers.get(job["job_id"]))
        if out:
            card["text"][job["lang"]] = out
            status.pop(job["lang"], None)
        elif job["attempt"] < MAX_ATTEMPTS:
            retry.append(make_job(job["key"], job["src"], job["src_lang"], job["lang"],
                                  job["attempt"] + 1, errs))
        else:
            status[job["lang"]] = "fallback"
            print(f"  [{job['key']}] {job['lang']} fallback: {'; '.join(errs)}", file=sys.stderr)
    if status:
        card["i18n_status"] = status
    else:
        card.pop("i18n_status", None)
    if card["text"].get("ko"):
        card.update({k: v for k, v in card["text"]["ko"].items() if k in TEXT_FIELDS})
    return retry


def _cards_index(doc, **_):
    return {c.get("id"): c for c in doc.get("cards", [])}


TARGETS = {"cards": _cards_index}


def _load(path, default=None):
    if default is not None and not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def cmd_jobs(kind, path, out, **kw):
    doc = _load(path)
    jobs = [j for key, c in TARGETS[kind](doc, **kw).items() for j in card_jobs(c, key)]
    _save(out, {"kind": kind, "target": os.path.abspath(path), "jobs": jobs})
    print(f"{len(jobs)} job(s) -> {out}")
    return 0


def cmd_apply(jobs_path, answers_path, retry_out=None):
    jf = _load(jobs_path)
    answers = _load(answers_path, default={})
    doc = _load(jf["target"])
    index = TARGETS[jf["kind"]](doc)
    by_key = {}
    for job in jf["jobs"]:
        by_key.setdefault(job["key"], []).append(job)
    retry = []
    for key, jobs in by_key.items():
        card = index.get(key)
        if card is None:
            print(f"  [{key}] not found in {jf['target']} — skipped", file=sys.stderr)
            continue
        retry += apply_to_card(card, jobs, answers)
    _save(jf["target"], doc)
    if retry:
        rp = retry_out or re.sub(r"(\.retry)?\.json$", ".retry.json", jobs_path)
        _save(rp, {"kind": jf["kind"], "target": jf["target"], "jobs": retry})
        print(f"{len(retry)} job(s) need another pass -> {rp}")
        return 10
    print("all jobs resolved")
    return 0


def main(argv):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    j = sub.add_parser("jobs")
    j.add_argument("--cards", required=True)
    j.add_argument("--out", required=True)
    a = sub.add_parser("apply")
    a.add_argument("--jobs", required=True)
    a.add_argument("--answers", required=True)
    a.add_argument("--retry-out")
    args = ap.parse_args(argv)
    if args.cmd == "jobs":
        return cmd_jobs("cards", args.cards, args.out)
    return cmd_apply(args.jobs, args.answers, args.retry_out)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python3 translate_test.py && for t in *_test.py; do python3 $t >/dev/null || echo FAIL $t; done`
Expected: `translate OK` (stderr에 `fallback` 3줄이 보이는 것이 정상), FAIL 줄 없음

- [ ] **Step 5: 번역 에이전트 정의** — `.claude/agents/ax-translator.md` 생성:

```markdown
---
name: ax-translator
description: Translate Design AX Brief card copy or UI strings listed in a jobs file into their target languages, writing one answers file. Needs no web access.
tools: Read, Write
---

You are the translator (번역가) agent for the Design AX Brief.

Your prompt gives you two paths: a JOBS file (input) and an ANSWERS file (output).

1. Read the JOBS file. It is JSON: {"kind": …, "target": …, "jobs": [ … ]}.
2. For EVERY job in `jobs`: its `prompt` field is the complete instruction for that job,
   including the input JSON at the end. Produce exactly the JSON object it asks for.
3. Write the ANSWERS file once, as ONE JSON object mapping each `job_id` to your answer
   object: {"<job_id>": { … }, "<job_id>": { … }}. Values are JSON objects (not strings).
   Nothing else in the file — no comments, no markdown.

Rules that hold for every job (they are also in each prompt):
- Facts, numbers, dates, quotes and proper nouns stay exactly as in the input; add nothing.
- Brand and product names keep their original Latin spelling (OpenAI, GPT-6, FTC).
- Same keys as the input. In `full.blocks`, keep every block in the same order and
  translate only `x` and `cap`; copy `t`, `src`, `yt` unchanged.
- Length and line rules in the prompt are hard limits — count the characters of each
  headline line and of the body before you write them.
- If a prompt says "Your previous answer failed these checks", fix exactly those problems.
- Never skip a job. If one is hard, still write your best attempt — the checker decides.
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/translate.py pipeline/translate_test.py .claude/agents/ax-translator.md
git commit -m "feat(i18n): translate.py jobs/apply — 번역 작업 파일·판정·재시도·폴백 + ax-translator 에이전트"
```

- [ ] **Step 7 (컨트롤러 전용 — 구현자는 건너뜀): 실제 에이전트 스모크** — 컨트롤러가 오늘자 카드 1장으로 `translate.py jobs` → `ax-translator` 디스패치 → `translate.py apply`를 돌려 통과율과 실패 유형을 원장에 기록한다(한도 조정 근거, Task 12 Step 6에서 사용).

---

### Task 4: 롤·원장이 언어 필드를 보존

**Files:**
- Modify: `pipeline/roll.py:7-18` (`MINI`, `mini_card`)
- Modify: `pipeline/update_ledger.py` (`build_story_ledger`의 `ko` 텍스트 수집부)
- Test: `pipeline/roll_test.py` (끝에 케이스 추가)

**Interfaces:**
- Consumes: `i18n_text.source_fields`
- Produces: 덱 카드(`days[].cards[]`)에 `text`·`source_lang`·`i18n_status`가 그대로 남는다. `text` 안 각 언어의 `headline`은 덱용 한 줄(`\n` 제거), `mini_headline` 우선.

- [ ] **Step 1: Write the failing test** — `pipeline/roll_test.py` 맨 끝(`print("roll OK")` 바로 위)에 추가:

```python
# --- i18n: deck cards keep text/source_lang/i18n_status; per-language deck headline is one line
d5 = tempfile.mkdtemp()
prev_card = {"id": "p", "tool": "T", "eyebrow": "AI NEWS", "headline": "한\n줄", "body": "b",
             "source": "S", "url": "https://p", "accent": "#000", "motif": "frame",
             "source_lang": "en", "i18n_status": {"ja": "fallback"},
             "text": {"en": {"headline": "Two\nlines", "mini_headline": "Mini", "body": "eb"},
                      "ko": {"headline": "한\n줄", "body": "b"}}}
json.dump(wrap({"date": "2026-06-21", "cards": [prev_card]}, []), open(f"{d5}/news_data.json", "w"), ensure_ascii=False)
json.dump({"date": "2026-06-22", "cards": [dict(prev_card, id="n", url="https://n")]}, open(f"{d5}/cards.json", "w"), ensure_ascii=False)
json.dump({"media": []}, open(f"{d5}/media.json", "w"))
subprocess.run(["python3", os.path.abspath("roll.py"), "--no-story-check", "--data", f"{d5}/news_data.json",
                "--cards", f"{d5}/cards.json", "--media", f"{d5}/media.json"], check=True)
deck = g(json.load(open(f"{d5}/news_data.json", encoding="utf-8")))["days"][-1]["cards"][0]
assert deck["source_lang"] == "en" and deck["i18n_status"] == {"ja": "fallback"}
assert deck["text"]["en"]["headline"] == "Mini" and deck["text"]["ko"]["headline"] == "한 줄"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 roll_test.py`
Expected: FAIL — `KeyError: 'source_lang'`

- [ ] **Step 3: Write minimal implementation** — `pipeline/roll.py`의 `mini_card`를 교체:

```python
def mini_card(c):
    # deck headline stays single-line (deck thumbnails are compact)
    head = c.get("mini_headline") or c.get("headline", "").replace("\n", " ")
    d = {k: c.get(k, "") for k in MINI}
    d["headline"] = head
    if c.get("image"):           # source banner image on the deck card
        d["image"] = c["image"]
    if c.get("full"):            # the translated article, so the opened card can flip to Read
        d["full"] = c["full"]
    for k in ("source_lang", "i18n_status"):
        if c.get(k):
            d[k] = c[k]
    if c.get("text"):            # every language keeps its own one-line deck headline
        d["text"] = {}
        for lang, t in c["text"].items():
            t = dict(t)
            t["headline"] = t.pop("mini_headline", None) or (t.get("headline") or "").replace("\n", " ")
            d["text"][lang] = t
    return d
```

`pipeline/update_ledger.py`의 `build_story_ledger`에서, `src` 채우는 루프 뒤에 원문 언어 요약을 우선 적용하는 블록을 추가(news_data의 `text`가 있으면 영문 원제 대신 원문 언어 요약을 비교 텍스트로 쓴다):

```python
    try:
        from i18n_text import source_fields
        news_path = os.path.join(base, "news_data.json")
        for sec in (json.load(open(news_path, encoding="utf-8")).get("sections") or {}).values():
            for day in [sec.get("today") or {}] + (sec.get("days") or []):
                for c in day.get("cards", []):
                    if c.get("text") and c.get("url"):
                        f, _ = source_fields(c)
                        e = src.setdefault(c["url"].strip(), {"title": "", "excerpt": ""})
                        e["title"] = e["title"] or (f.get("headline") or "").replace("\n", " ")
                        e["excerpt"] = e["excerpt"] or f.get("body") or ""
    except (OSError, ValueError):
        pass
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && python3 roll_test.py && python3 story_dedup_test.py && python3 update_ledger.py --news news_data.json --ledger published_urls.json`
Expected: `roll OK`, `story_dedup OK`, `story ledger: … cards` (오류 없음)

- [ ] **Step 5: Commit**

```bash
git add pipeline/roll.py pipeline/roll_test.py pipeline/update_ledger.py pipeline/story_ledger.json
git commit -m "feat(i18n): roll·스토리 원장이 언어별 텍스트 보존"
```

---

### Task 5: 언어별 빌드 (`build_data.py`)

**Files:**
- Modify: `pipeline/build_data.py` (`to_js`, `split_teaser` 호출부, `SHARE_TMPL`, `emit_share_pages`, `main`)
- Test: `pipeline/build_data_test.py` (끝에 케이스 추가)

**Interfaces:**
- Consumes: `i18n_text.LANGS`, `i18n_text.flatten`
- Produces:
  - `localize(data: dict, lang: str) -> dict` — news_data 깊은 복사, 모든 카드를 `flatten(card, lang)`으로
  - 산출물: `axbrief-data.{lang}.js`(5개) + `axbrief-data.js`(= ko, 기존 경로), `premium/{lang}/{section}.json`(`{"cards": {"<section>/<id>": {"blocks": [...]}}}`, 누적 병합), 기존 `premium/full.json`(ko, 누적 유지), `s/{lang}/{section}/{id}.html` + 기존 `s/{section}/{id}.html`(ko)
  - 공유 페이지: `<html lang>`, `og:locale`(`en_US, ko_KR, ja_JP, zh_CN, es_ES`), 앱 URL `/{lang}/?c={section}:{id}`(구 경로 페이지는 `/?c=`)

- [ ] **Step 1: Write the failing test** — `pipeline/build_data_test.py` 끝에 추가:

```python
# --- i18n: per-language data JS, premium split, per-language share pages
import json as _j, os as _o, subprocess as _sp, tempfile as _t
d9 = _t.mkdtemp()
card = lambda i, **kw: dict({"id": i, "tool": "T", "eyebrow": "AI NEWS", "headline": f"{i} 한\n헤드",
                             "body": "한국어 본문", "source": "S", "url": f"https://{i}", "accent": "#000",
                             "motif": "frame", "image": f"pipeline/media/{i}.jpg",
                             "full": {"blocks": [{"t": "p", "x": "한 전문"}]}}, **kw)
new = card("n", source_lang="en", text={
    "en": {"headline": "N en\nhead", "body": "English body", "full": {"blocks": [{"t": "p", "x": "en full"}]}},
    "ko": {"headline": "n 한\n헤드", "body": "한국어 본문", "full": {"blocks": [{"t": "p", "x": "한 전문"}]}}})
nd = {"sections": {"design": {"today": {"date": "2026-10-02", "cards": [card("free"), new]},
                              "days": [{"date": "2026-10-01", "cards": [card("old")]}]}}}
_j.dump(nd, open(f"{d9}/news_data.json", "w"), ensure_ascii=False)
_sp.run(["python3", _o.path.abspath("build_data.py"), "--in", f"{d9}/news_data.json",
         "--out", f"{d9}/axbrief-data.js", "--share-root", d9, "--base-url", "https://ax.test"], check=True)
for lang in ["en", "ko", "ja", "zh", "es"]:
    assert _o.path.exists(f"{d9}/axbrief-data.{lang}.js"), lang
    assert _o.path.exists(f"{d9}/premium/{lang}/design.json"), lang
en_js = open(f"{d9}/axbrief-data.en.js", encoding="utf-8").read()
assert "N en\\nhead" in en_js and '"untranslated": true' in en_js      # free/old 카드는 ko 폴백
assert '"text"' not in en_js                                             # 맵은 공개 JS에 안 나감
assert open(f"{d9}/axbrief-data.js", encoding="utf-8").read() == open(f"{d9}/axbrief-data.ko.js", encoding="utf-8").read()
prem_en = _j.load(open(f"{d9}/premium/en/design.json"))["cards"]
assert prem_en["design/n"]["blocks"][0]["x"] == "en full" and "design/old" in prem_en
assert _j.load(open(f"{d9}/premium/full.json"))["cards"]["design/n"]["blocks"][0]["x"] == "한 전문"
sh = open(f"{d9}/s/en/design/n.html", encoding="utf-8").read()
assert '<html lang="en">' in sh and 'og:locale" content="en_US"' in sh and "https://ax.test/en/?c=design:n" in sh
assert "N en head" in sh
legacy = open(f"{d9}/s/design/n.html", encoding="utf-8").read()
assert '<html lang="ko">' in legacy and "https://ax.test/?c=design:n" in legacy
print("build_data i18n OK")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 build_data_test.py`
Expected: FAIL — `AssertionError: en`

- [ ] **Step 3: Write minimal implementation** — `pipeline/build_data.py`:

1) import 추가: `from i18n_text import LANGS, flatten` (파일 상단 `import argparse, …` 다음 줄). 스크립트를 다른 cwd에서 돌려도 되도록 그 위에 `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))`.

2) `SHARE_TMPL`의 `<html lang="ko">` → `<html lang="{lang}">`, `og:locale" content="ko_KR"` → `og:locale" content="{locale}"`, 본문 링크 문구 `AX-it NOW — 카드 열기 →` → `{open_label}`.

3) 함수 추가(`emit_share_pages` 위):

```python
LOCALES = {"en": "en_US", "ko": "ko_KR", "ja": "ja_JP", "zh": "zh_CN", "es": "es_ES"}
OPEN_LABEL = {"en": "AX-it NOW — open card →", "ko": "AX-it NOW — 카드 열기 →",
              "ja": "AX-it NOW — カードを開く →", "zh": "AX-it NOW — 打开卡片 →",
              "es": "AX-it NOW — abrir tarjeta →"}


def localize(data, lang):
    """Deep copy of news_data with every card flattened to `lang` (see i18n_text)."""
    out = json.loads(json.dumps(data))
    for s in (out.get("sections") or {}).values():
        today = s.get("today") or {}
        today["cards"] = [flatten(c, lang) for c in today.get("cards", [])]
        for day in s.get("days", []):
            day["cards"] = [flatten(c, lang) for c in day.get("cards", [])]
    return out


def merge_premium(path, premium):
    merged = {}
    if os.path.exists(path):
        try:
            old = json.load(open(path, encoding="utf-8"))
            merged = dict(old.get("cards", old) or {})
        except (json.JSONDecodeError, OSError):
            merged = {}
    merged.update(premium)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"cards": merged}, f, ensure_ascii=False, indent=2)
```

4) `emit_share_pages(sections, base_url, share_root)` 시그니처를 `emit_share_pages(sections, base_url, share_root, lang="ko", legacy=False)`로 바꾸고:
   - `shutil.rmtree`는 호출자가 한 번만 하도록 함수 밖으로 옮긴다(`main`에서 `shutil.rmtree(os.path.join(share_root, "s"), ignore_errors=True)`).
   - 경로: `legacy`면 `s/{sec}/{cid}.html`, `ogurl = f"{base}/s/{sec}/{cid}"`, `appurl = f"{base}/?c={sec}:{cid}"`; 아니면 `s/{lang}/{sec}/{cid}.html`, `ogurl = f"{base}/s/{lang}/{sec}/{cid}"`, `appurl = f"{base}/{lang}/?c={sec}:{cid}"`.
   - `SHARE_TMPL.format(...)`에 `lang=lang, locale=LOCALES[lang], open_label=OPEN_LABEL[lang]` 추가.

5) `main()`의 본문을 다음으로 교체(인자 파싱은 그대로):

```python
    data = json.load(open(a.inp, encoding="utf-8"))
    out_dir = os.path.dirname(os.path.abspath(a.out))
    prem_dir = os.path.join(out_dir, "premium")
    if a.share_root:
        shutil.rmtree(os.path.join(a.share_root, "s"), ignore_errors=True)
    for lang in LANGS:
        ldata = localize(data, lang)
        premium = split_teaser(ldata)
        js = to_js(ldata)
        open(os.path.join(out_dir, f"axbrief-data.{lang}.js"), "w", encoding="utf-8").write(js)
        by_sec = {}
        for key, v in premium.items():
            by_sec.setdefault(key.split("/", 1)[0], {})[key] = v
        for sec, part in by_sec.items():
            merge_premium(os.path.join(prem_dir, lang, f"{sec}.json"), part)
        if lang == "ko":
            open(a.out, "w", encoding="utf-8").write(js)              # legacy path
            merge_premium(os.path.join(prem_dir, "full.json"), premium)  # legacy ko map
        if a.share_root:
            norm = {sec: {"news": (s.get("today") or {}).get("cards", []), "days": s.get("days", [])}
                    for sec, s in (ldata.get("sections") or {}).items()}
            n = emit_share_pages(norm, a.base_url, a.share_root, lang=lang)
            if lang == "ko":
                emit_share_pages(norm, a.base_url, a.share_root, lang="ko", legacy=True)
            print(f"share pages [{lang}]: {n}")
```

(옛 비섹션 포맷 분기는 삭제한다 — news_data는 2026-07부터 섹션형이고 `split_teaser`/`to_js`가 여전히 자체 폴백을 갖는다.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && python3 build_data_test.py && python3 roll_test.py`
Expected: 기존 출력 + `build_data i18n OK`

- [ ] **Step 5: Real-data dry run**

Run: `cd /Users/leopard/Projects/design-ax-brief && python3 pipeline/build_data.py --in pipeline/news_data.json --out axbrief-data.js --share-root . --base-url https://axitnow.com && for l in en ko ja zh es; do node --check axbrief-data.$l.js || exit 1; done && git diff --quiet axbrief-data.js && echo "ko unchanged"`
Expected: `share pages [xx]: …` 5줄, `node --check` 무출력, `ko unchanged`(아직 `text` 있는 카드가 없으므로 ko는 그대로). `git status`로 `s/en/…` 등 새 파일만 생긴 것을 확인 후 생성물은 커밋하지 않고 `git checkout -- . && git clean -fd s/en s/ja s/zh s/es premium/en premium/ja premium/zh premium/es premium/ko && rm -f axbrief-data.*.js` 로 되돌린다(배포는 Task 12).

- [ ] **Step 6: Commit**

```bash
git add pipeline/build_data.py pipeline/build_data_test.py
git commit -m "feat(i18n): 언어별 데이터 JS·프리미엄 분할·언어별 공유 페이지"
```

---

### Task 6: 언어별 아카이브·그래프 (`build_archive.py`)

**Files:**
- Modify: `pipeline/build_archive.py` (`KEEP`/`teaser`, `to_js`, `_terms`, `main`)
- Test: `pipeline/build_archive_test.py` (신규)

**Interfaces:**
- Consumes: `i18n_text.LANGS`, `i18n_text.flatten`
- Produces:
  - 아카이브 레코드에 `text`(언어별 `headline`·`body`만 — `full` 절대 불포함)와 `source_lang` 보존
  - `to_js(archive, lang="ko") -> str` — 레코드를 `flatten(rec, lang)` 한 `AX_ARCHIVE`
  - 산출물 `archive-data.{lang}.js`(5개) + 기존 `archive-data.js`(= ko)
  - `_terms(card)`는 `text["en"]`이 있으면 그 headline/body로 키워드를 뽑는다(그래프는 언어 무관 1개)

- [ ] **Step 1: Write the failing test**

```python
# pipeline/build_archive_test.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 build_archive_test.py`
Expected: FAIL — `KeyError: 'text'` (teaser가 text를 버림)

- [ ] **Step 3: Write minimal implementation**

`pipeline/build_archive.py`:

```python
from i18n_text import LANGS, flatten   # 파일 상단 import 블록에 추가 (sys.path에 HERE가 이미 있음)

KEEP = ("id", "headline", "body", "tool", "source", "url", "accent", "motif",
        "image", "source_lang")


def teaser(card):
    """Strip a card to archive fields — the premium `full` payload must never
    reach the public archive (in any language)."""
    rec = {k: card.get(k) for k in KEEP if card.get(k) is not None}
    if card.get("text"):
        rec["text"] = {l: {k: t[k] for k in ("headline", "body") if t.get(k)}
                       for l, t in card["text"].items() if l != "_src"}
    return rec
```

`to_js(archive)` → `to_js(archive, lang="ko")`, 정렬 뒤 `cards = [flatten(c, lang) for c in cards]` 한 줄 추가.

`_terms(card)`의 `text = ...` 줄을 교체:

```python
    src = (card.get("text") or {}).get("en") or card
    text = (src.get("headline") or "").replace("\n", " ") + " " + (src.get("body") or "")
```

`main()`에서 `archive-data.js`를 쓰는 부분을 언어 루프로 교체(같은 자리, 같은 `ROOT` 기준 경로):

```python
    for lang in LANGS:
        js = to_js(archive, lang)
        open(os.path.join(ROOT, f"archive-data.{lang}.js"), "w", encoding="utf-8").write(js)
        if lang == "ko":
            open(os.path.join(ROOT, "archive-data.js"), "w", encoding="utf-8").write(js)
```

`fold()`의 earliest-wins 분기: 이미 있는 레코드라도 새 카드에 `text`가 있고 레코드에 없으면 `old["text"] = teaser(card)["text"]`, `old["source_lang"]`도 채운다(백필한 번역이 아카이브에 들어가게):

```python
        if old:
            if date < old["date"]:  # earliest-wins if history replays out of order
                old["date"] = date
            fresh = teaser(card)
            for k in ("text", "source_lang"):
                if fresh.get(k) and not old.get(k):
                    old[k] = fresh[k]
            continue
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && python3 build_archive_test.py && cd .. && python3 pipeline/build_archive.py && for l in en ko ja zh es; do node --check archive-data.$l.js || exit 1; done && git diff --quiet archive-data.js && echo "ko unchanged"`
Expected: `build_archive OK`, 빌드 출력, `ko unchanged`. 생성된 `archive-data.{en,ja,zh,es,ko}.js`는 지운다(`rm -f archive-data.*.js`; 배포는 Task 12).

- [ ] **Step 5: Commit**

```bash
git add pipeline/build_archive.py pipeline/build_archive_test.py
git commit -m "feat(i18n): 언어별 아카이브 데이터, 그래프 키워드 en 우선"
```

---

### Task 7: Worker 언어 라우팅

**Files:**
- Create: `worker/lib/lang.js`
- Modify: `worker/index.js` (fetch 맨 앞 라우팅 + `serveHtml`)
- Modify: `wrangler.jsonc` (`assets.run_worker_first`)
- Test: `worker/test/lang.test.js` (신규)

**Interfaces:**
- Produces:
  - `LANGS = ["en","ko","ja","zh","es"]`
  - `pickLang(cookieLang: string|undefined, acceptLanguage: string|null) -> string`
  - `splitLangPath(pathname: string) -> {lang: string, rest: string} | null` — `/en/`→`{lang:"en",rest:"/"}`, `/ja/large`→`{rest:"/large"}`, 그 외 null
  - HTML 응답에 주입: `<html lang>`, `<head>` 맨 앞 `<base href="/">` + `<script>window.AX_LANG="xx";window.AX_I18N_ON=true|false;</script>`, `<head>` 끝에 `hreflang` 5개 + `x-default`(=`/en/…`) `<link rel="alternate">`
  - 페이지 매핑: rest `/`→`/index.html`, `/large`→`/large.html`, `/archive`→`/archive.html`
  - `/` (정확히): `env.I18N_PUBLIC === "1"`이면 `302 /{pickLang}/`, 아니면 ko로 index.html 주입 서빙
  - 어떤 경로든 `?i18n=1`이면 응답에 `ax_i18n=1` 쿠키(1년) 추가, 이 요청부터 `AX_I18N_ON=true`

- [ ] **Step 1: Write the failing test**

```js
// worker/test/lang.test.js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index.js";
import { pickLang, splitLangPath } from "../lib/lang.js";

async function call(path, init = {}, extraEnv = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("http://localhost" + path, { redirect: "manual", ...init }),
                                 { ...env, ...extraEnv }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("pickLang", () => {
  it("cookie wins, then Accept-Language, then en", () => {
    expect(pickLang("ja", "es-ES,es;q=0.9")).toBe("ja");
    expect(pickLang(undefined, "zh-TW,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(pickLang(undefined, "es-419,es;q=0.9")).toBe("es");
    expect(pickLang(undefined, "pt-BR,pt;q=0.9")).toBe("en");
    expect(pickLang(undefined, "pt-BR,ko;q=0.5")).toBe("ko");
    expect(pickLang("xx", null)).toBe("en");
  });
  it("splitLangPath", () => {
    expect(splitLangPath("/en/")).toEqual({ lang: "en", rest: "/" });
    expect(splitLangPath("/ja/large")).toEqual({ lang: "ja", rest: "/large" });
    expect(splitLangPath("/s/en/design/x")).toBe(null);
    expect(splitLangPath("/enx/")).toBe(null);
  });
});

describe("html routing", () => {
  it("/ stays ko (no redirect) while I18N_PUBLIC is off", async () => {
    const r = await call("/", { headers: { "accept-language": "ja" } });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('<html lang="ko"');
    expect(html).toContain('window.AX_LANG="ko"');
    expect(html).toContain("window.AX_I18N_ON=false");
  });
  it("/ redirects by cookie/header once public", async () => {
    let r = await call("/", { headers: { "accept-language": "ja-JP" } }, { I18N_PUBLIC: "1" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/ja/");
    r = await call("/", { headers: { cookie: "ax_lang=es", "accept-language": "ja" } }, { I18N_PUBLIC: "1" });
    expect(r.headers.get("location")).toBe("/es/");
  });
  it("/{lang}/ pages get base href + lang", async () => {
    for (const [path, marker] of [["/en/", "axbrief-app.jsx"], ["/zh/large", "axbrief-app-large.jsx"], ["/es/archive", "archive-data"]]) {
      const r = await call(path);
      expect(r.status).toBe(200);
      const html = await r.text();
      expect(html).toMatch(/<head>\s*<base href="\/">/);
      expect(html).toContain(`window.AX_LANG="${path.split("/")[1]}"`);
      expect(html).toContain(marker);
    }
    const html = await (await call("/ja/large")).text();
    for (const l of ["en", "ko", "ja", "zh", "es"])
      expect(html).toContain(`<link rel="alternate" hreflang="${l}" href="http://localhost/${l}/large">`);
    expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="http://localhost/en/large">`);
  });
  it("?i18n=1 sets the preview cookie and turns the menu on", async () => {
    const r = await call("/en/?i18n=1");
    expect(r.headers.get("set-cookie")).toMatch(/ax_i18n=1/);
    expect(await r.text()).toContain("window.AX_I18N_ON=true");
    const r2 = await call("/en/", { headers: { cookie: "ax_i18n=1" } });
    expect(await r2.text()).toContain("window.AX_I18N_ON=true");
  });
  it("legacy share pages are untouched", async () => {
    const r = await call("/s/design/does-not-exist");
    expect(r.status).not.toBe(302);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- worker/test/lang.test.js`
Expected: FAIL — `Failed to load url ../lib/lang.js`

- [ ] **Step 3: Write minimal implementation**

```js
// worker/lib/lang.js
export const LANGS = ["en", "ko", "ja", "zh", "es"];

export function pickLang(cookieLang, acceptLanguage) {
  if (LANGS.includes(cookieLang)) return cookieLang;
  const prefs = String(acceptLanguage || "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? parseFloat(q.slice(2)) || 0 : 1 };
    })
    .filter((x) => x.base)
    .sort((a, b) => b.q - a.q);
  const hit = prefs.find((x) => LANGS.includes(x.base));
  return hit ? hit.base : "en";
}

export function splitLangPath(pathname) {
  const m = /^\/(en|ko|ja|zh|es)(\/.*)$/.exec(pathname);
  return m ? { lang: m[1], rest: m[2] } : null;
}
```

`worker/index.js` — import 추가: `import { LANGS, pickLang, splitLangPath } from "./lib/lang.js";`. `fetch` 안 `const p = url.pathname;` 바로 다음에:

```js
    const cookies = parseCookies(request.headers.get("cookie"));
    const previewOn = url.searchParams.get("i18n") === "1";
    const i18nOn = env.I18N_PUBLIC === "1" || previewOn || cookies.ax_i18n === "1";
    const PAGES = { "/": "/index.html", "/large": "/large.html", "/archive": "/archive.html" };

    if (p === "/" || p === "/index.html") {
      if (env.I18N_PUBLIC === "1")
        return new Response(null, { status: 302, headers: {
          location: `/${pickLang(cookies.ax_lang, request.headers.get("accept-language"))}/` } });
      return serveHtml(env, "/index.html", "ko", i18nOn, previewOn);
    }
    const lp = splitLangPath(p);
    if (lp && PAGES[lp.rest]) return serveHtml(env, PAGES[lp.rest], lp.lang, i18nOn, previewOn);
```

파일 하단(`export default` 위)에:

```js
async function serveHtml(env, file, lang, i18nOn, previewOn) {
  const res = await env.ASSETS.fetch(new Request(new URL(file, env.BASE_URL)));
  const sub = { "/index.html": "", "/large.html": "large", "/archive.html": "archive" }[file] ?? "";
  const base = String(env.BASE_URL).replace(/\/$/, "");
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${base}/${l}/${sub}">`).join("")
    + `<link rel="alternate" hreflang="x-default" href="${base}/en/${sub}">`;
  const out = new HTMLRewriter()
    .on("html", { element(e) { e.setAttribute("lang", lang); } })
    .on("head", { element(e) {
      e.prepend(`<base href="/"><script>window.AX_LANG=${JSON.stringify(lang)};window.AX_I18N_ON=${i18nOn};</script>`,
                { html: true });
      e.append(alts, { html: true });
    } })
    .transform(res);
  const headers = new Headers(out.headers);
  headers.set("content-language", lang);
  if (previewOn) headers.append("set-cookie", "ax_i18n=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  return new Response(out.body, { status: res.status, headers });
}
```

주의: `env.ASSETS.fetch`로 `/index.html`을 요청하면 Cloudflare assets가 `html_handling` 기본값에 따라 `/`로 307을 줄 수 있다. 테스트에서 307이 나오면 `file`을 `"/"`·`"/large"`·`"/archive"`(확장자 없는 경로)로 바꿔 요청한다 — 그때 `PAGES` 값을 `"/"`,`"/large"`,`"/archive"`로 교체.

`wrangler.jsonc`의 `run_worker_first`를 교체:

```jsonc
    "run_worker_first": ["/api/*", "/premium/*", "/", "/index.html",
                         "/en/*", "/ko/*", "/ja/*", "/zh/*", "/es/*"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 기존 테스트 + `lang.test.js` 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add worker/lib/lang.js worker/index.js worker/test/lang.test.js wrangler.jsonc
git commit -m "feat(i18n): Worker 언어 라우팅 — /{lang}/ 서빙·언어 감지·미리보기 플래그"
```

---

### Task 8: Worker 프리미엄·인사이트 언어

**Files:**
- Modify: `worker/index.js` (`/api/premium/full`, `/api/insights/summary`)
- Test: `worker/test/premium.test.js` (케이스 추가)

**Interfaces:**
- Consumes: `LANGS` (Task 7)
- Produces:
  - `GET /api/premium/full?lang=xx&section=s&id=i` → `{ full, lang }`. 순서: `premium/{lang}/{s}.json` → `premium/{source}/{s}.json`이 아니라 단순히 `premium/en/{s}.json` → `premium/ko/{s}.json` → `premium/full.json`. `lang` 미지정 = `ko`. 응답 `lang` = 실제로 찾은 파일의 언어(`full.json`이면 `"ko"`).
  - `POST /api/insights/summary` body에 `lang` 추가(기본 `ko`). 프롬프트 출력 언어 지정, 캐시 키 `insum:{lang}:{hash}`.

- [ ] **Step 1: Write the failing test** — 먼저 `worker/test/premium.test.js`를 읽어 기존 테스트가 `env.ASSETS`를 어떻게 다루는지(스텁 여부) 확인한다. 기존 방식대로 ASSETS 응답을 스텁하는 헬퍼를 쓰고, 없으면 아래처럼 `extraEnv`로 덮는다. 추가할 테스트:

```js
// worker/test/premium.test.js 에 추가 (파일의 기존 import/로그인 헬퍼를 재사용)
const fakeAssets = (files) => ({ fetch: async (req) => {
  const p = new URL(req.url || req).pathname;
  return p in files ? new Response(JSON.stringify(files[p]), { status: 200 }) : new Response("nf", { status: 404 });
} });

describe("premium full by language", () => {
  const files = {
    "/premium/en/design.json": { cards: { "design/a": { blocks: [{ t: "p", x: "en" }] } } },
    "/premium/ko/design.json": { cards: { "design/a": { blocks: [{ t: "p", x: "ko" }] },
                                          "design/b": { blocks: [{ t: "p", x: "ko-b" }] } } },
    "/premium/full.json": { cards: { "design/c": { blocks: [{ t: "p", x: "legacy" }] } } },
  };
  it("serves the requested language, then en, ko, legacy", async () => {
    const cookie = await loginPaid();          // 파일의 기존 헬퍼(유료 세션 쿠키) 사용
    const get = async (q) => (await callWith(`/api/premium/full?${q}`, { headers: { cookie } },
                                             { ASSETS: fakeAssets(files) })).json();
    expect(await get("lang=en&section=design&id=a")).toEqual({ full: files["/premium/en/design.json"].cards["design/a"], lang: "en" });
    expect((await get("lang=ja&section=design&id=a")).lang).toBe("en");
    expect((await get("lang=ja&section=design&id=b")).lang).toBe("ko");
    expect(await get("section=design&id=c")).toEqual({ full: files["/premium/full.json"].cards["design/c"], lang: "ko" });
  });
});
```

(`loginPaid`/`callWith`가 파일에 없으면 `auth.test.js`의 매직링크 로그인 흐름과 `lang.test.js`의 `call(path, init, extraEnv)`를 이 파일 상단에 같은 이름으로 정의한다.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- worker/test/premium.test.js`
Expected: FAIL — 응답에 `lang` 없음

- [ ] **Step 3: Write minimal implementation** — `/api/premium/full` 블록에서 `const res = await env.ASSETS.fetch(...)`부터 `return json({ full });`까지를 교체:

```js
      const want = LANGS.includes(url.searchParams.get("lang")) ? url.searchParams.get("lang") : "ko";
      const key = `${section}/${id}`;
      const tries = [...new Set([want, "en", "ko"])].map((l) => [l, `/premium/${l}/${section}.json`]);
      tries.push(["ko", "/premium/full.json"]);
      for (const [l, path] of tries) {
        if (!/^[a-z]+$/.test(section || "")) break;
        const res = await env.ASSETS.fetch(new Request(new URL(path, env.BASE_URL)));
        if (!res.ok) continue;
        const map = await res.json();
        const full = (map.cards || map)[key];
        if (full) return json({ full, lang: l });
      }
      return json({ reason: "not_found" }, 404);
```

import 줄을 `import { LANGS, pickLang, splitLangPath } from "./lib/lang.js";`로.

`/api/insights/summary`: `const items = …` 다음에 `const lang = LANGS.includes(body.lang) ? body.lang : "ko";`, `cacheKey`를 `` `insum:${lang}:${hash}` ``로, 프롬프트 맨 끝 `클러스터:\n${lines}` 앞에 한 줄 `- 출력 언어: ${{ en: "English", ko: "한국어", ja: "日本語", zh: "简体中文", es: "Español" }[lang]}. 고유명사·수치는 그대로.`를 규칙 목록에 추가.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add worker/index.js worker/test/premium.test.js
git commit -m "feat(i18n): 프리미엄 전문·인사이트 요약 언어 지원 + 폴백"
```

---

### Task 9: UI 사전과 `t()` — 한국어 문구 추출 (동작 불변)

**Files:**
- Create: `i18n/ko.json`, `i18n.js`, `pipeline/build_i18n.py`, `pipeline/build_i18n_test.py`
- Modify: `axbrief-app.jsx`, `axbrief-app-large.jsx`, `archive.html` (문구 → `t()`), `index.html`, `large.html`, `archive.html` (스크립트 로드)

**Interfaces:**
- Produces:
  - `i18n/{lang}.json`: 평평한 `{ "key": "문구" }`. 키는 `영역.이름` (예: `paywall.subscribe`, `nav.prev`, `deck.yesterday`, `card.untranslated`). 보간은 `{name}` (예: `"deck.viewing": "{date} 소식 보는 중"`).
  - `pipeline/build_i18n.py`: `i18n/*.json` → `i18n/{lang}.js` = `window.AX_I18N = {...};`. 누락 키는 ko 값으로 채우고 경고. `--check`는 누락 키가 있으면 종료코드 1.
  - `i18n.js` (브라우저 전역):
    - `window.AX_LANG` 기본값 `"ko"`
    - `window.t(key, vars?) -> string` — 사전 → ko 사전 내장본(`window.AX_I18N_KO`) → key
    - `window.axDate(dateStr, style)` — `Intl.DateTimeFormat(AX_LANG_TAG, …)`; `style`: `"md"`(10.02 / Oct 2), `"weekday"`(수 / Wed)
    - `window.axSetLang(lang)` — `ax_lang` 쿠키(1년) 설정 후 `/{lang}` + 현재 페이지 하위경로(`/large`·`/archive`) + `location.search`로 이동
    - `AX_LANG_TAG = {en:"en-US", ko:"ko-KR", ja:"ja-JP", zh:"zh-CN", es:"es-ES"}`
- 이 태스크는 **ko 화면이 바이트 단위로 같은 문구를 내야 한다**(번역은 Task 10).

- [ ] **Step 1: Write the failing test**

```python
# pipeline/build_i18n_test.py
import json, os, subprocess, tempfile, shutil
root = tempfile.mkdtemp(); os.makedirs(f"{root}/i18n")
json.dump({"a.x": "가", "a.y": "{n}개"}, open(f"{root}/i18n/ko.json", "w"), ensure_ascii=False)
json.dump({"a.x": "A"}, open(f"{root}/i18n/en.json", "w"))
r = subprocess.run(["python3", os.path.abspath("build_i18n.py"), "--root", root], capture_output=True, text=True)
assert r.returncode == 0 and "missing" in r.stderr and "a.y" in r.stderr
en = open(f"{root}/i18n/en.js", encoding="utf-8").read()
assert en.startswith("window.AX_I18N = ") and '"a.x": "A"' in en and '"a.y": "{n}개"' in en
assert "window.AX_I18N_KO" in open(f"{root}/i18n/ko.js", encoding="utf-8").read()
r = subprocess.run(["python3", os.path.abspath("build_i18n.py"), "--root", root, "--check"], capture_output=True, text=True)
assert r.returncode == 1
print("build_i18n OK")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 build_i18n_test.py`
Expected: FAIL — `can't open file … build_i18n.py`

- [ ] **Step 3: Implement `build_i18n.py`**

```python
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
```

Run: `cd pipeline && python3 build_i18n_test.py` → `build_i18n OK`

- [ ] **Step 4: Implement `i18n.js`** (저장소 루트)

```js
// i18n.js — loaded right after i18n/<lang>.js on every page.
(function () {
  var LANG = window.AX_LANG || "ko";
  window.AX_LANG = LANG;
  var TAGS = { en: "en-US", ko: "ko-KR", ja: "ja-JP", zh: "zh-CN", es: "es-ES" };
  window.AX_LANG_TAG = TAGS[LANG] || "ko-KR";
  window.t = function (key, vars) {
    var s = (window.AX_I18N && window.AX_I18N[key]) || (window.AX_I18N_KO && window.AX_I18N_KO[key]) || key;
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  };
  window.axDate = function (dateStr, style) {
    var d = new Date(dateStr);
    if (style === "weekday") return new Intl.DateTimeFormat(window.AX_LANG_TAG, { weekday: "short" }).format(d);
    if (LANG === "ko") return (d.getMonth() + 1) + "." + String(d.getDate()).padStart(2, "0");
    return new Intl.DateTimeFormat(window.AX_LANG_TAG, { month: "short", day: "numeric" }).format(d);
  };
  window.axSetLang = function (lang) {
    document.cookie = "ax_lang=" + lang + "; Path=/; Max-Age=31536000; SameSite=Lax";
    var sub = (location.pathname.match(/\/(large|archive)(\.html)?$/) || [])[1];
    location.href = "/" + lang + "/" + (sub || "") + location.search;
  };
})();
```

주의: ko의 `axDate(…, "md")`는 기존 앱의 `M.DD` 표기와 같아야 한다 — 기존 코드(`axbrief-app.jsx:2255` 근처 `${getMonth()+1}.${padStart}`)와 동일 형식인지 확인. 요일은 ko에서 `Intl`이 `수`를 내므로 기존 `['일','월',…]` 배열과 같다.

- [ ] **Step 5: 페이지 셸이 사전·언어별 데이터를 로드** — `index.html`의 데이터 로더 스크립트를 교체:

```html
<script>(function () {
  var v = Date.now(), L = window.AX_LANG || 'ko';
  document.write('<scr' + 'ipt src="i18n/' + L + '.js?v=' + v + '"><\/scr' + 'ipt>');
  document.write('<scr' + 'ipt src="i18n.js?v=' + v + '"><\/scr' + 'ipt>');
  document.write('<scr' + 'ipt src="axbrief-data.' + L + '.js?v=' + v + '"><\/scr' + 'ipt>');
  document.write('<scr' + 'ipt type="text/babel" src="axbrief-app.jsx?v=' + v + '"><\/scr' + 'ipt>');
})();</script>
```

`large.html`·`archive.html`도 같은 방식(각자의 데이터 파일: `axbrief-data.{L}.js`·`archive-data.{L}.js`, 그래프 `archive-graph.js`는 그대로). Task 5/6 산출물이 없는 로컬에선 `axbrief-data.ko.js`가 없으니 Step 7 전에 `python3 pipeline/build_data.py …`·`python3 pipeline/build_archive.py`·`python3 pipeline/build_i18n.py`를 돌려 생성한다.

- [ ] **Step 6: 문구 추출** — 세 파일에서 사용자에게 보이는 한국어 리터럴을 모두 `t('key')`로 바꾸고 원문을 `i18n/ko.json`에 같은 키로 넣는다.
  - 대상 찾기: `grep -n -E "[가-힣]" axbrief-app.jsx axbrief-app-large.jsx archive.html | grep -v -E "^\S+:\s*(//|\*|/\*)"` — 주석 줄 제외 전부.
  - 요일 배열 `['일','월','화','수','목','금','토'][d.getDay()]` → `axDate(dateStr, 'weekday')`. `M.DD` 조립 → `axDate(dateStr, 'md')`. 템플릿 문자열 안 문구는 보간 키로 (`` `${md} 소식 보는 중` `` → `t('deck.viewing', { date: md })`).
  - 데모/플레이스홀더 카피(예: `axbrief-app.jsx:374-382`의 디자인 카테고리 설명)도 키로 뺀다(`demo.*`).
  - **문구는 한 글자도 바꾸지 않는다.** 이 단계는 추출만.
  - 끝나면 위 grep이 주석 외 0줄이어야 한다.

- [ ] **Step 7: 동작 불변 검증**

Run:
```bash
cd /Users/leopard/Projects/design-ax-brief && python3 pipeline/build_i18n.py && \
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1280,1600 --virtual-time-budget=6000 --dump-dom "http://localhost:8765/index.html" > /tmp/ax_after.html 2>/dev/null && \
git stash -q && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1280,1600 --virtual-time-budget=6000 --dump-dom "http://localhost:8765/index.html" > /tmp/ax_before.html 2>/dev/null; \
git stash pop -q && python3 - <<'PY'
import re
strip = lambda s: re.sub(r"\?v=\d+", "", re.sub(r"<script[\s\S]*?</script>", "", s))
a, b = strip(open('/tmp/ax_before.html').read()), strip(open('/tmp/ax_after.html').read())
ka = set(re.findall(r"[가-힣][가-힣 ·,.!?~…'’]*", a)); kb = set(re.findall(r"[가-힣][가-힣 ·,.!?~…'’]*", b))
print("only-before:", sorted(ka - kb)[:20]); print("only-after:", sorted(kb - ka)[:20])
assert ka == kb, "visible Korean text changed"
print("ko UI unchanged")
PY
```
Expected: `ko UI unchanged`. (8765 서버는 항상 떠 있다 — 끄지 말 것. 다르면 `only-*` 목록의 문구를 사전/키에서 고친다.) 같은 검증을 `large.html`·`archive.html`에도 URL만 바꿔 실행.

- [ ] **Step 8: Commit**

```bash
git add i18n/ko.json i18n/ko.js i18n.js pipeline/build_i18n.py pipeline/build_i18n_test.py \
        axbrief-app.jsx axbrief-app-large.jsx archive.html index.html large.html
git commit -m "refactor(i18n): UI 한국어 문구를 i18n/ko.json 사전으로 추출 (화면 불변)"
```

---

### Task 10: 언어 메뉴·미번역 라벨·프리미엄 언어 요청 + UI 사전 번역

**Files:**
- Modify: `axbrief-app.jsx` (헤더 언어 메뉴, 카드 라벨, `/api/premium/full` 호출, insights 호출), `axbrief-app-large.jsx` (라벨), `archive.html` (메뉴·라벨)
- Modify: `pipeline/translate.py` (`--ui` 추가), `pipeline/translate_test.py`
- Create: `i18n/{en,ja,zh,es}.json` (+ 생성물 `i18n/*.js`)

**Interfaces:**
- Consumes: `window.t`, `window.axSetLang`, `window.AX_I18N_ON`, 카드의 `untranslated`·`lang` (Task 5 평탄화 결과), `/api/premium/full` 응답의 `lang`
- Produces:
  - `ui_jobs(root, langs=None) -> list[dict]` — 언어마다 `i18n/ko.json` 키 중 그 언어 파일에 없는 것만 담은 job 1개(`job_id` = `ui|{lang}`)
  - `apply_ui(root, jobs, answers) -> list[dict]` — 키 누락·보간 토큰(`{name}`) 손실이면 재시도 job, 통과분은 `i18n/{lang}.json`에 병합(기존 번역 보존)
  - CLI: `translate.py jobs --ui [--root R] --out J` (kind `"ui"`), `apply`가 kind `"ui"`를 처리하고 성공 시 `build_i18n.py` 실행
  - 새 사전 키: `lang.menu`(“Language”), `card.untranslated`(“번역 준비 중”)

- [ ] **Step 1: Write the failing test** — `pipeline/translate_test.py`의 `print("translate OK")` 위에:

```python
# UI dictionary jobs: only missing keys are sent, {placeholders} must survive, existing kept
d2 = tempfile.mkdtemp(); os.makedirs(f"{d2}/i18n")
json.dump({"a.x": "구독하기", "a.y": "{date} 소식 보는 중"}, open(f"{d2}/i18n/ko.json", "w"), ensure_ascii=False)
json.dump({"a.x": "Subscribe (kept)"}, open(f"{d2}/i18n/en.json", "w"))
uj = tr.ui_jobs(d2, langs=["en", "ja"])
assert [(x["job_id"], sorted(x["src"])) for x in uj] == [("ui|en", ["a.y"]), ("ui|ja", ["a.x", "a.y"])]
assert "Japanese" in uj[1]["prompt"] and "{placeholder}" in uj[1]["prompt"]
retry = tr.apply_ui(d2, uj, {"ui|en": {"a.y": "Viewing {date}"},
                             "ui|ja": {"a.x": "購読", "a.y": "ニュースを表示中"}})   # {date} lost
assert json.load(open(f"{d2}/i18n/en.json")) == {"a.x": "Subscribe (kept)", "a.y": "Viewing {date}"}
assert [x["job_id"] for x in retry] == ["ui|ja"] and "placeholder" in retry[0]["prompt"]
assert not os.path.exists(f"{d2}/i18n/ja.json")
assert tr.apply_ui(d2, retry, {"ui|ja": {"a.x": "購読", "a.y": "{date}のニュースを表示中"}}) == []
assert json.load(open(f"{d2}/i18n/ja.json"))["a.y"] == "{date}のニュースを表示中"
r = run("jobs", "--ui", "--root", d2, "--out", os.path.join(d2, "jobs_ui.json"))
assert r.returncode == 0 and json.load(open(os.path.join(d2, "jobs_ui.json")))["kind"] == "ui"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 translate_test.py`
Expected: FAIL — `AttributeError: module 'translate' has no attribute 'ui_jobs'`

- [ ] **Step 3: Implement UI jobs** — `pipeline/translate.py`에 추가:

```python
UI_RULES = ("- Translate these UI strings of a calm news-briefing website from Korean into {lang}. "
            "Short, natural UI wording.\n- Keep every {{placeholder}} token (like {{date}}) exactly.\n"
            "- Answer with ONLY a JSON object with exactly the same keys.\n")


def _ui_job(lang, todo, attempt=1, errors=None):
    prompt = UI_RULES.format(lang=NAMES[lang])
    if errors:
        prompt += "- Your previous answer failed these checks — fix them: " + "; ".join(errors) + "\n"
    return {"job_id": f"ui|{lang}", "key": "ui", "lang": lang, "attempt": attempt, "src": todo,
            "prompt": prompt + "\nINPUT:\n" + json.dumps(todo, ensure_ascii=False)}


def ui_jobs(root, langs=None):
    d = os.path.join(root, "i18n")
    ko = _load(os.path.join(d, "ko.json"))
    jobs = []
    for lang in (langs or [l for l in LANGS if l != "ko"]):
        cur = _load(os.path.join(d, f"{lang}.json"), default={})
        todo = {k: v for k, v in ko.items() if k not in cur}
        if todo:
            jobs.append(_ui_job(lang, todo))
    return jobs


def apply_ui(root, jobs, answers):
    d = os.path.join(root, "i18n")
    retry = []
    for job in jobs:
        todo, lang = job["src"], job["lang"]
        try:
            out = parse_reply(answers[job["job_id"]]) if job["job_id"] in answers else None
        except ValueError as e:
            out, errs = None, [f"invalid reply: {e}"]
        if out is None and job["job_id"] not in answers:
            errs = ["no answer"]
        elif out is not None:
            ph = lambda s: sorted(re.findall(r"\{\w+\}", s or ""))
            errs = [f"{k}: missing" for k in todo if k not in out] + \
                   [f"{k}: placeholder lost" for k in todo if k in out and ph(todo[k]) != ph(out[k])]
        if out is not None and not errs:
            p = os.path.join(d, f"{lang}.json")
            cur = _load(p, default={})
            cur.update({k: out[k] for k in todo})
            _save(p, cur)
        elif job["attempt"] < MAX_ATTEMPTS:
            retry.append(_ui_job(lang, todo, job["attempt"] + 1, errs))
        else:
            print(f"  [ui] {lang} failed: {'; '.join(errs)} — Korean shown for these keys", file=sys.stderr)
    return retry
```

`cmd_jobs`/`cmd_apply`/`main` 연결:
- `jobs` 서브커맨드: `--cards`를 `required=False`로 바꾸고 `--ui`(flag)와 `--root`(기본 저장소 루트 = `os.path.dirname(os.path.dirname(os.path.abspath(__file__)))`) 추가. `--ui`면 `_save(out, {"kind": "ui", "target": os.path.abspath(root), "jobs": ui_jobs(root)})` 후 작업 수 출력.
- `cmd_apply`: `jf["kind"] == "ui"`면 `retry = apply_ui(jf["target"], jf["jobs"], answers)`로 처리하고(대상 문서 로드/저장 생략), 재시도 파일/종료코드 규칙은 카드와 같게. 성공 시 `subprocess.run([sys.executable, os.path.join(HERE, "build_i18n.py"), "--root", jf["target"]])` (`HERE = os.path.dirname(os.path.abspath(__file__))`, `import subprocess`).

Run: `cd pipeline && python3 translate_test.py` → `translate OK`

- [ ] **Step 4: 앱 기능 연결** (`axbrief-app.jsx`)
  - **언어 메뉴:** 섹션 탭 줄 오른쪽 끝에 `window.AX_I18N_ON`일 때만 렌더되는 `<select aria-label={t('lang.menu')}>` — 옵션 `en: English, ko: 한국어, ja: 日本語, zh: 中文, es: Español`(언어 이름은 번역하지 않는 고정 라벨), `value={window.AX_LANG}`, `onChange={(e) => axSetLang(e.target.value)}`. 기존 탭 스타일 토큰을 따라 작게.
  - **미번역 라벨:** 카드 앞면 출처 줄(`SourceLine` 근처)에 `item.untranslated &&` 작은 회색 텍스트 `t('card.untranslated')`. 대형 카드·아카이브 카드에도 같은 조건으로.
  - **프리미엄:** `axbrief-app.jsx:625`의 fetch URL에 `&lang=${encodeURIComponent(window.AX_LANG || 'ko')}` 추가. 응답 `lang`이 `window.AX_LANG`과 다르면 백면 상단에 `t('card.untranslated')` 표시.
  - **insights:** `/api/insights/summary` POST body에 `lang: window.AX_LANG || 'ko'` 추가 (`archive.html`의 호출부).
  - 새 키 `lang.menu`, `card.untranslated`를 `i18n/ko.json`에 추가.

- [ ] **Step 5 (컨트롤러): UI 사전 번역 + 사람 검토** — `python3 pipeline/translate.py jobs --ui --out pipeline/jobs_ui.json` → `ax-translator`(JOBS=`pipeline/jobs_ui.json`, ANSWERS=`pipeline/answers_ui.json`) → `python3 pipeline/translate.py apply --jobs pipeline/jobs_ui.json --answers pipeline/answers_ui.json` (종료코드 10이면 `.retry.json`으로 최대 2번 더) → `python3 pipeline/build_i18n.py --check` 종료코드 0. 그다음 `git diff i18n/en.json`을 사용자에게 보여주고 어색한 문구를 함께 고친다(사람 검토 = 스펙 요구사항).

- [ ] **Step 6: 렌더 검증 (5개 언어)**

Run: `for l in en ko ja zh es; do "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --window-size=1280,1600 --virtual-time-budget=6000 --screenshot=/tmp/ax_$l.png "http://localhost:8787/$l/?i18n=1" 2>/dev/null; done` (`npx wrangler dev --port 8787`를 백그라운드로 먼저 띄운다 — Worker 라우팅이 필요하므로 8765 정적 서버로는 안 됨. 8765/4321은 건드리지 않는다.)
Expected: 5장 모두 해당 언어 UI, 언어 메뉴 보임, ko 화면은 Task 9와 동일. 스크린샷을 Read로 열어 확인.

- [ ] **Step 7: Commit**

```bash
git add axbrief-app.jsx axbrief-app-large.jsx archive.html i18n/ pipeline/translate.py pipeline/translate_test.py
git commit -m "feat(i18n): 언어 메뉴(미리보기 플래그)·미번역 라벨·프리미엄/인사이트 언어 + UI 사전 4개 언어"
```

---

### Task 11: 파이프라인 편입 (원문 언어 작성 → 번역 → 한국어 윤문)

**Files:**
- Modify: `.claude/agents/ax-writer.md`
- Modify: `.claude/skills/design-ax-daily-news/SKILL.md` (Step 6, 6b, 8~9, Korean voice 문단)
- Modify: `~/.design-ax-brief/automation/run_daily_news.sh` (키 로드 + 프롬프트 규칙)
- Modify: `pipeline/translate.py` (`--check` 추가), `pipeline/translate_test.py`

**Interfaces:**
- Consumes: `translate.py jobs/apply`, `ax-translator` (Task 3)
- Produces:
  - 작성 단계 산출물 `cards_S.json`: 최상위 텍스트 필드가 **원문 언어**, 각 카드에 `source_lang`.
  - `translate.py check FILE` — 각 카드의 `text[lang]`(ko 포함)을 원천 대비 `check()`로 재검증. 실패 언어는 `text`에서 빼고 `i18n_status`에 `fallback`. 최상위 필드를 `text["ko"]`로 동기화. 한국어 윤문(사람/에이전트 편집) 뒤에 반드시 실행.

- [ ] **Step 1: (삭제됨 — 서브에이전트 번역이라 API 키 불필요)**

- [ ] **Step 2: Write the failing test** — `pipeline/translate_test.py`의 `print("translate OK")` 위에:

```python
# check: re-validate after Korean humanize edits; broken language -> fallback; top-level = ko
d3 = tempfile.mkdtemp(); f3 = os.path.join(d3, "cards_y.json")
c3 = dict(card, text={"en": SRC, "ko": dict(KO, body="짧다.")})
json.dump({"date": "2026-10-02", "cards": [c3]}, open(f3, "w"), ensure_ascii=False)
assert tr.main(["check", f3]) == 0
c3o = json.load(open(f3))["cards"][0]
assert "ko" not in c3o["text"] and c3o["i18n_status"] == {"ko": "fallback"}
c4 = dict(card, text={"en": SRC, "ko": KO})
json.dump({"date": "2026-10-02", "cards": [c4]}, open(f3, "w"), ensure_ascii=False)
tr.main(["check", f3])
assert json.load(open(f3))["cards"][0]["body"] == KO["body"]
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pipeline && python3 translate_test.py`
Expected: FAIL — argparse `invalid choice: 'check'` (SystemExit 2)

- [ ] **Step 4: Implement `check`** — `pipeline/translate.py`:

```python
def recheck_card(card):
    card = json.loads(json.dumps(card))
    src, src_lang = source_fields(card)
    status = dict(card.get("i18n_status") or {})
    for lang in [l for l in LANGS if l != src_lang and l in (card.get("text") or {})]:
        errs = check(src, card["text"][lang], lang)
        if errs:
            del card["text"][lang]
            status[lang] = "fallback"
            print(f"  [{card.get('id')}] {lang} failed re-check: {'; '.join(errs)}", file=sys.stderr)
    if status:
        card["i18n_status"] = status
    if (card.get("text") or {}).get("ko"):
        card.update({k: v for k, v in card["text"]["ko"].items() if k in TEXT_FIELDS})
    return card
```

`main`에 서브커맨드 `check`(위치 인자 `path`) 추가: `doc = _load(path); doc["cards"] = [recheck_card(c) for c in doc.get("cards", [])]; _save(path, doc); return 0`.

Run: `cd pipeline && python3 translate_test.py` → `translate OK`

- [ ] **Step 5: ax-writer를 원문 언어 작성으로** — `.claude/agents/ax-writer.md`:
  - description: `Write calm, minimal card copy in the ORIGINAL article's language for the Design AX Brief from selected news items.`
  - "Voice: Korean, …" 문단 → `Voice: the source article's own language (record it as \`source_lang\`, a BCP-47 base code: en, ja, ko, de, fr, …), calm, max-minimal — a quiet editorial brief, not marketing.`
  - `headline` 규칙: 두 줄(`\n` 1개) — 줄당 길이는 `translate_check.LIMITS[source_lang]`(풀 밖 언어는 en 값), 단어 중간 줄바꿈 금지(유지).
  - `body` 규칙: 한 문장, 길이는 같은 표의 `body` 범위, 언어의 정상 문장 종결.
  - "Korean voice — humanize (REQUIRED)" 문단 삭제(번역 뒤 단계로 이동).
  - 출력 필드에 `source_lang` 추가.

- [ ] **Step 6: SKILL.md 단계 갱신** — `.claude/skills/design-ax-daily-news/SKILL.md`:
  - Step 6: `**ax-writer** — writes card copy in the source article's language (+ \`source_lang\`).`
  - Step 6b 첫 문장: `full` = 원문 언어 그대로의 구조 미러 요약(번역하지 않음). 사실 검증은 같은 언어로 원문과 대조. 마지막의 humanize 문장 삭제.
  - Step 6c 신설:
    ```
    6c. **translate (no API — subagents)** —
        python3 pipeline/translate.py jobs --cards pipeline/cards_S.json --out pipeline/jobs_S.json
        → dispatch **ax-translator** with JOBS=pipeline/jobs_S.json, ANSWERS=pipeline/answers_S.json
        → python3 pipeline/translate.py apply --jobs pipeline/jobs_S.json --answers pipeline/answers_S.json
        Exit 10 = some answers failed the checks: dispatch ax-translator again on
        pipeline/jobs_S.retry.json (ANSWERS=pipeline/answers_S.retry.json) and apply that; at most
        2 retry passes — whatever still fails is recorded as fallback and publishes with the label.
        Then humanize **only `text.ko`** with the humanize-korean skill (facts byte-identical) and run
        python3 pipeline/translate.py check pipeline/cards_S.json  (re-validates every language and
        syncs the top-level fields to ko).
    ```
  - Step 9 build 문단에 `python3 pipeline/build_i18n.py` 추가, `node --check`를 `axbrief-data.{en,ko,ja,zh,es}.js archive-data.{…}.js`까지.
  - 하단 "Korean voice" 문단: 대상이 `text.ko`임을 명시.

- [ ] **Step 7: 자동 실행 스크립트 (병합 후 적용 — 원장 Ruling)** — `~/.design-ax-brief/automation/run_daily_news.sh`의 프롬프트만 고친다(API 키 불필요):
  - (4) 문장 교체: `(4) 각 섹션 Step 5~10(큐레이터 → 원문 언어 작성 → full 페이로드(원문 언어)·사실 검증 → translate.py jobs → ax-translator → translate.py apply(재시도 최대 2회) → text.ko만 humanize-korean 윤문 → translate.py check → 미디어 → roll → 아카이브)을 완주한다.`
  - (10) 보고에 `언어별 폴백 수(i18n_status)` 한 줄 추가.
  - `zsh -n`으로 문법 확인. (홈 디렉터리 파일이라 git 커밋 대상 아님.)

- [ ] **Step 8: Commit**

```bash
git add .claude/agents/ax-writer.md .claude/skills/design-ax-daily-news/SKILL.md pipeline/translate.py pipeline/translate_test.py
git commit -m "feat(i18n): 파이프라인 편입 — 원문 언어 작성, 5개 언어 번역, ko 윤문 후 재검증"
```

---

### Task 12: 최근 노출분 백필 + 길이 한도 확정 + 미리보기 배포

**Files:**
- Modify: `pipeline/translate.py` (`--news`·`--days`·`--limit`·`--offset`), `pipeline/translate_test.py`
- Modify: `pipeline/translate_check.py` (`LIMITS` en/es 확정값), `pipeline/translate_check_test.py`
- Generated: `pipeline/news_data.json`, `axbrief-data.*.js`, `archive-data.*.js`, `premium/*/`, `s/*/`, `i18n/*.js`

**Interfaces:**
- Consumes: `card_jobs`, `apply_to_card`, `TARGETS`, `cmd_jobs`/`cmd_apply` (Task 3), 빌드(Task 5·6·9)
- Produces:
  - `TARGETS["news"](doc, days=None)` — key `"{section}/{id}"` → 카드 참조. `days=N`이면 각 섹션 `today` + 마지막 N개 `days`, `None`이면 전부(apply는 항상 전부로 찾는다)
  - `jobs --news FILE [--days 5] [--limit N] [--offset K]` — 작업 목록을 만든 뒤 `[offset:offset+limit]`만 저장(병렬 에이전트용 분할). 이미 모든 언어가 있거나 fallback인 카드는 작업이 없다 → 같은 명령을 반복하면 남은 것만 나온다
  - 옛 카드(원천 = 최상위 ko)는 `source_lang`이 없으므로 원천 언어 ko로 번역된다(스펙 §8 백필; 원문 재수집 없음)

- [ ] **Step 1: Write the failing test** — `pipeline/translate_test.py`의 `print("translate OK")` 위에:

```python
# news target: only today + last N days, only cards missing languages; limit/offset split
d4 = tempfile.mkdtemp(); f4 = os.path.join(d4, "news_data.json"); j4 = os.path.join(d4, "jobs_n.json")
old_card = {"id": "o", "url": "https://o", "headline": KO["headline"], "body": KO["body"], "full": KO["full"]}
done = dict(card, id="d", url="https://d", text={l: KO for l in ["en", "ko", "ja", "zh", "es"]})
nd = {"sections": {"design": {"today": {"date": "2026-10-02", "cards": [old_card, done]},
                              "days": [{"date": "2026-09-01", "cards": [dict(old_card, id="far")]},
                                       {"date": "2026-10-01", "cards": [dict(old_card, id="near")]}]}}}
json.dump(nd, open(f4, "w"), ensure_ascii=False)
r = run("jobs", "--news", f4, "--days", "1", "--out", j4)
assert r.returncode == 0, r.stderr
jobs4 = json.load(open(j4))["jobs"]
assert {x["key"] for x in jobs4} == {"design/o", "design/near"} and len(jobs4) == 8   # 4 langs each (src ko)
assert all(x["src_lang"] == "ko" for x in jobs4)
r = run("jobs", "--news", f4, "--days", "1", "--limit", "3", "--offset", "6", "--out", j4)
assert len(json.load(open(j4))["jobs"]) == 2
r = run("jobs", "--news", f4, "--days", "1", "--out", j4)
ans = {x["job_id"]: KO for x in json.load(open(j4))["jobs"] if x["lang"] in ("ja", "zh")}
json.dump(ans, open(os.path.join(d4, "a.json"), "w"), ensure_ascii=False)
r = run("apply", "--jobs", j4, "--answers", os.path.join(d4, "a.json"))
assert r.returncode == 10                                         # en/es unanswered -> retry
res = json.load(open(f4))["sections"]["design"]
assert res["today"]["cards"][0]["text"]["ja"] == KO and res["days"][1]["cards"][0]["text"]["zh"] == KO
assert res["days"][0]["cards"][0].get("text") is None             # outside --days
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 translate_test.py`
Expected: FAIL — argparse `unrecognized arguments: --news`

- [ ] **Step 3: Implement the news target**

```python
def _news_index(doc, days=None, **_):
    out = {}
    for sec, s in (doc.get("sections") or {}).items():
        all_days = s.get("days") or []
        groups = [s.get("today") or {}] + (all_days[-days:] if days else all_days)
        for day in groups:
            for c in day.get("cards", []):
                if c.get("id"):
                    out[f"{sec}/{c['id']}"] = c
    return out


TARGETS["news"] = _news_index
```

`cmd_jobs(kind, path, out, limit=None, offset=0, **kw)`: 작업 목록을 만든 뒤 `jobs = jobs[offset: offset + limit] if limit else jobs[offset:]`. `jobs` 서브커맨드에 `--news`, `--days`(int, 기본 5), `--limit`(int), `--offset`(int, 기본 0) 추가; `--news`면 `cmd_jobs("news", args.news, args.out, days=args.days, limit=args.limit, offset=args.offset)`. `cmd_apply`는 `TARGETS[kind](doc)`(days=None → 전부)를 그대로 쓴다.

Run: `cd pipeline && python3 translate_test.py` → `translate OK`

- [ ] **Step 4 (컨트롤러): 백필 실행 (최근 노출분)** — 구현자가 아니라 컨트롤러가 돌린다(에이전트 디스패치 필요):
  1. `cp pipeline/news_data.json pipeline/runs/news_data.pre-i18n.json`
  2. `python3 pipeline/translate.py jobs --news pipeline/news_data.json --days 5 --out /tmp/ax_jobs_all.json` → 총 작업 수 확인(약 240장 × 4 = 960).
  3. 20개씩 나눠 `--limit 20 --offset 0/20/40/60`으로 4개 작업 파일 생성 → `ax-translator` 4개를 **동시에** 디스패치(각자 다른 JOBS/ANSWERS 경로) → 끝나면 `apply`를 **순서대로** 실행(같은 news_data.json을 고치므로 병렬 금지).
  4. `.retry.json`이 생기면 같은 방식으로 재시도 패스. 2번이 끝나면 다음 묶음(`jobs`를 다시 만들면 완료분은 빠진다)으로 반복, 작업 0개가 될 때까지.
  5. 진행은 원장에 묶음 단위로 기록(중단 시 재개 지점).

- [ ] **Step 5: 폴백 비율 확인**

```bash
python3 -c "
import json,collections;d=json.load(open('pipeline/news_data.json'))['sections'];c=collections.Counter();t=0
for s in d.values():
  for day in [s['today']]+s['days']:
    for x in day['cards']:
      t+=1;[c.update([l]) for l in (x.get('i18n_status') or {})]
print('cards',t,'fallback',dict(c))"
```
Expected: 언어별 fallback이 카드 수의 5% 이하. 넘으면 stderr 오류 유형을 모아 Step 6에서 한도를 조정한 뒤, 해당 카드들의 `i18n_status`를 지우고 Step 4를 다시 돈다(fallback 언어는 작업에서 빠지므로 지워야 재시도된다).

- [ ] **Step 6: en/es 길이 한도 확정** — 빌드 후 5개 언어 렌더(Task 10 Step 6 명령)에서 en/es 카드 본문이 2줄을 넘거나 1줄로 끝나는지 본다. 화면 기준으로 `translate_check.LIMITS["en"|"es"]`를 고치고, `translate_check_test.py`를 그 값에 맞게 갱신해 통과시킨다. 고친 값은 스펙 §2 표에도 반영.

- [ ] **Step 7: 빌드 + 미리보기 배포**

Run:
```bash
cd /Users/leopard/Projects/design-ax-brief && python3 pipeline/build_data.py --in pipeline/news_data.json --out axbrief-data.js --share-root . --base-url https://axitnow.com && \
python3 pipeline/build_archive.py && python3 pipeline/build_i18n.py --check && \
for f in axbrief-data*.js archive-data*.js archive-graph.js i18n/*.js; do node --check "$f" || exit 1; done && \
cd pipeline && for t in *_test.py; do python3 $t >/dev/null || { echo FAIL $t; exit 1; }; done && cd .. && npm test
```
Expected: 전부 통과. 그다음 커밋 → `git push origin main` → `bash pipeline/deploy.sh`. `I18N_PUBLIC`은 설정하지 않는다(미리보기).
배포 확인: `https://axitnow.com/`이 이전과 같은 ko 화면, `https://axitnow.com/en/?i18n=1`에서 영어 화면·언어 메뉴, `https://axitnow.com/s/en/<section>/<id>` 200. (`/s/` 신규 페이지는 배포 직후 ~1분 404일 수 있다 — 스크립트 파일로 폴링.)

- [ ] **Step 8: Commit** (Step 7의 배포 전에)

```bash
git add pipeline/translate.py pipeline/translate_test.py pipeline/translate_check.py pipeline/translate_check_test.py \
        pipeline/news_data.json pipeline/archive.json axbrief-data*.js archive-data*.js archive-graph.js \
        premium/ s/ i18n/ docs/superpowers/specs/2026-10-01-multilingual-design.md
git commit -m "feat(i18n): 최근 노출분 5개 언어 백필, en/es 길이 한도 확정, 미리보기 배포"
```

- [ ] **Step 9: 사용자 검토 게이트** — 사용자에게 `https://axitnow.com/{en,ja,zh,es}/?i18n=1`을 확인받는다. 승인 전에는 Task 13(공개)로 넘어가지 않는다.

---

### Task 13: 공개 전환

**Files:**
- Modify: `wrangler.jsonc` (`vars.I18N_PUBLIC`)

- [ ] **Step 1: 공개 스위치** — `wrangler.jsonc`의 `vars`에 `"I18N_PUBLIC": "1"` 추가.

- [ ] **Step 2: 테스트**

Run: `npm test`
Expected: PASS (`lang.test.js`는 env를 테스트마다 덮으므로 기본값 변화와 무관해야 한다. 실패하면 "stays ko" 테스트에 `{ I18N_PUBLIC: "0" }`을 명시).

- [ ] **Step 3: 배포·확인** — 커밋 → `git push origin main` → `bash pipeline/deploy.sh`. 확인: `curl -sI -H 'accept-language: ja' https://axitnow.com/ | grep -i location` → `/ja/`, 쿠키 없는 영어 브라우저 → `/en/`, 기존 링크 `https://axitnow.com/s/<section>/<id>` 200(ko).

- [ ] **Step 4: Commit**

```bash
git add wrangler.jsonc
git commit -m "feat(i18n): 다국어 공개 — / 언어 감지 리다이렉트 + 언어 메뉴 노출"
```

---

### Task 14: 전체 아카이브 백필 (서브에이전트, 여러 날에 나눠 실행)

**Files:**
- Modify: `pipeline/translate.py` (`archive` 대상), `pipeline/translate_test.py`
- Modify (생성): `pipeline/archive.json`, `premium/{lang}/{section}.json`

**Interfaces:**
- Consumes: `card_jobs`, `apply_to_card`, `cmd_jobs`의 `limit/offset` (Task 3·12), `build_data.merge_premium` (Task 5)
- Produces:
  - `archive_cards(root: str) -> tuple[dict, dict[str, dict]]` — (`archive.json` 문서, key `"{section}/{id}"` → 가상 카드). 가상 카드 = 레코드의 `headline`·`body`·`text`·`source_lang`·`i18n_status` + 전문 `full`(원천 언어 `premium/{src}/{section}.json`, 없으면 `premium/full.json`의 ko 전문). 전문이 없는 레코드는 `full` 없이.
  - `commit_archive(root, archive, vcards) -> None` — 각 가상 카드의 `text[lang]`에서 `headline`·`body`만 레코드 `text`로(`_src` 제외), `i18n_status` 반영; `full`이 있으면 `merge_premium(f"{root}/premium/{lang}/{section}.json", {key: {"blocks": …}})`; `archive.json` 저장
  - `jobs --archive [--root ROOT] [--limit N] [--offset K] --out JOBS` (kind `"archive"`, target = root), `apply`는 kind `"archive"`면 `archive_cards` → `apply_to_card` → `commit_archive` 후 `python3 build_archive.py` 실행

- [ ] **Step 1: Write the failing test** — `pipeline/translate_test.py`의 `print("translate OK")` 위에:

```python
# archive target: teaser text into archive.json, full into premium/<lang>/<section>.json
d5 = tempfile.mkdtemp(); os.makedirs(f"{d5}/pipeline"); os.makedirs(f"{d5}/premium")
json.dump({"cards": [{"id": "o", "section": "design", "date": "2026-08-01", "url": "https://o",
                      "headline": KO["headline"], "body": KO["body"]}]},
          open(f"{d5}/pipeline/archive.json", "w"), ensure_ascii=False)
json.dump({"cards": {"design/o": {"blocks": KO["full"]["blocks"]}}}, open(f"{d5}/premium/full.json", "w"), ensure_ascii=False)
arch, vc = tr.archive_cards(d5)
assert vc["design/o"]["full"]["blocks"] == KO["full"]["blocks"]
aj = [x for k, c in vc.items() for x in tr.card_jobs(c, k)]
assert {x["lang"] for x in aj} == {"en", "ja", "zh", "es"}
ja = next(x for x in aj if x["lang"] == "ja")
assert tr.apply_to_card(vc["design/o"], [ja], {ja["job_id"]: KO}) == []
tr.commit_archive(d5, arch, vc)
rec = json.load(open(f"{d5}/pipeline/archive.json"))["cards"][0]
assert rec["text"]["ja"] == {"headline": KO["headline"], "body": KO["body"]} and "_src" not in rec["text"]
assert json.load(open(f"{d5}/premium/ja/design.json"))["cards"]["design/o"]["blocks"] == KO["full"]["blocks"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python3 translate_test.py`
Expected: FAIL — `no attribute 'archive_cards'`

- [ ] **Step 3: Implement**

```python
def archive_cards(root):
    archive = _load(os.path.join(root, "pipeline", "archive.json"))
    prem = lambda name: (_load(os.path.join(root, "premium", name), default={}).get("cards") or {})
    legacy = prem("full.json")
    cache = {}
    vcards = {}
    for rec in archive.get("cards", []):
        key = f"{rec['section']}/{rec['id']}"
        vc = {k: rec[k] for k in ("headline", "body", "text", "source_lang", "i18n_status") if rec.get(k)}
        src = rec.get("source_lang") or "ko"
        part = cache.setdefault(f"{src}/{rec['section']}", prem(f"{src}/{rec['section']}.json"))
        full = part.get(key) or legacy.get(key)
        if full and full.get("blocks"):
            vc["full"] = {"blocks": full["blocks"]}
            if vc.get("text", {}).get(src) is not None:
                vc["text"][src] = dict(vc["text"][src], full=vc["full"])
        vcards[key] = vc
    return archive, vcards


def commit_archive(root, archive, vcards):
    from build_data import merge_premium
    by_key = {f"{r['section']}/{r['id']}": r for r in archive.get("cards", [])}
    fulls = {}
    for key, vc in vcards.items():
        rec = by_key[key]
        text = {l: {k: t[k] for k in ("headline", "body") if t.get(k)}
                for l, t in (vc.get("text") or {}).items() if l != "_src"}
        if text:
            rec["text"] = text
        if vc.get("i18n_status"):
            rec["i18n_status"] = vc["i18n_status"]
        for l, t in (vc.get("text") or {}).items():
            blocks = ((t or {}).get("full") or {}).get("blocks")
            if l != "_src" and blocks:
                fulls.setdefault(f"{l}/{rec['section']}", {})[key] = {"blocks": blocks}
    for name, part in fulls.items():
        merge_premium(os.path.join(root, "premium", f"{name}.json"), part)
    _save(os.path.join(root, "pipeline", "archive.json"), archive)
```

CLI: `jobs`에 `--archive`(flag)와 `--root`(Task 10과 공유) — `vcards`로 작업을 만들고 `limit/offset` 적용, `{"kind": "archive", "target": root, ...}` 저장. `cmd_apply`에서 kind `"archive"`면 `archive, vcards = archive_cards(target)` → 키별 `apply_to_card(vcards[key], jobs, answers)` → `commit_archive(target, archive, vcards)` → `subprocess.run([sys.executable, os.path.join(HERE, "build_archive.py")])`. 재시도 파일·종료코드 규칙은 같다.

Run: `cd pipeline && python3 translate_test.py` → `translate OK`

- [ ] **Step 4: Commit**

```bash
git add pipeline/translate.py pipeline/translate_test.py
git commit -m "feat(i18n): 아카이브 백필 대상 — 티저는 archive.json, 전문은 언어별 premium"
```

- [ ] **Step 5 (컨트롤러): 소규모 실행 (20장 = 80작업)** — `jobs --archive --limit 80 --out /tmp/ax_arch_1.json` → ax-translator 4개 병렬(20작업씩, `--offset`) → apply 순차 → 재시도. 통과율(≥ 95%)·소요 시간·사용량을 사용자에게 보고하고 전체 일정(하루 몇 묶음)을 합의한다.

- [ ] **Step 6 (컨트롤러): 전체 실행** — 합의한 일정대로 여러 날에 걸쳐 묶음 반복(작업 0개가 될 때까지). 매 묶음 뒤 `node --check archive-data.*.js`, 하루 끝에 커밋 → push → `deploy.sh`. 확인: `/en/archive`에서 `AX_ARCHIVE.filter(c=>c.untranslated).length`가 0 또는 fallback분만.
