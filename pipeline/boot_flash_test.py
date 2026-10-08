# pipeline/boot_flash_test.py
"""새로고침할 때 상단바만 먼저 뜨는 현상을 막는다.

i18n.js는 DOMContentLoaded에 #ax-topbar를 그린다. 그런데 본문은 Babel이
axbrief-app.jsx(152KB)를 컴파일해 React가 붙은 뒤에야 나온다. 그 사이 몇백
밀리초 동안 빈 화면에 로그인·Pro·지구본 세 개만 떠 있다.

그래서 앱이 붙을 때까지 바를 감추고, 앱이 `ax:ready`를 쏘면 드러낸다. 앱이
끝내 못 붙어도 바는 나와야 한다 — 언어 선택과 로그인이 거기 있다. 그래서
안전 타이머를 같이 둔다.

i18n.js를 node의 작은 DOM 흉내 위에서 실제로 돌려 본다. 문자열만 확인하면
클래스를 붙이는 코드가 남아 있어도 동작이 바뀐 걸 못 잡는다.
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

HARNESS = r"""
const fs = require("fs"), vm = require("vm");
const hasRoot = process.argv[2] === "1";
const classes = new Set();
const listeners = {};
let timers = [];
// 너그러운 DOM 흉내 — i18n.js가 무엇을 찾든 요소를 돌려준다. 이 테스트가 보는
// 것은 ax-booting 클래스의 생애이지 바의 내부 구조가 아니다.
const el = (id) => { const e = {
  id, style: {}, textContent: "", innerHTML: "", dataset: {}, value: "",
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild() {}, append() {}, removeChild() {}, setAttribute() {},
  addEventListener() {}, removeEventListener() {}, remove() {},
  parentNode: null, firstChild: null, children: [],
  getBoundingClientRect: () => ({ top: 0, height: 0 }), insertBefore() {} };
  e.querySelector = () => el("x"); e.querySelectorAll = () => [];
  e.closest = () => null; return e; };
const ctx = {
  console,
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  document: {
    readyState: "complete",
    documentElement: { style: {}, classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c) } },
    head: { appendChild() {} }, body: el("body"),
    createElement: (t) => el(t),
    getElementById: (id) => (id === "root" ? (hasRoot ? el("root") : null) : null),
    querySelector: () => el("q"), querySelectorAll: () => [],
    addEventListener() {},
  },
};
ctx.window = ctx;
ctx.window.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
ctx.window.removeEventListener = () => {};
ctx.window.AX_I18N_ON = 1;
ctx.window.AX_LANG = "ko";
ctx.window.AX_I18N = {};
ctx.window.t = (k) => k;
ctx.window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.window.innerWidth = 1280;
ctx.navigator = { language: "ko" };
ctx.location = { pathname: "/", search: "", hash: "", href: "https://x/" };
vm.runInNewContext(fs.readFileSync(process.argv[1], "utf8"), ctx);
const fire = (ev) => (listeners[ev] || []).forEach((f) => f());
const out = { afterMount: [...classes] };
fire("ax:ready");
out.afterReady = [...classes];
classes.clear(); classes.add("ax-booting");
timers.forEach((t) => t.fn());
out.afterTimers = [...classes];
out.timerDelays = timers.map((t) => t.ms);
process.stdout.write(JSON.stringify(out));
"""


def run(has_root):
    r = subprocess.run(["node", "-e", HARNESS, os.path.join(ROOT, "i18n.js"),
                        "1" if has_root else "0"],
                       check=True, capture_output=True, text=True)
    return json.loads(r.stdout)


def test_bar_is_hidden_until_the_app_mounts():
    got = run(True)
    assert "ax-booting" in got["afterMount"], got


def test_ready_event_reveals_the_bar():
    got = run(True)
    assert "ax-booting" not in got["afterReady"], got


def test_a_safety_timer_reveals_it_even_if_the_app_never_mounts():
    """앱이 깨져도 로그인과 언어 선택은 쓸 수 있어야 한다."""
    got = run(True)
    assert "ax-booting" not in got["afterTimers"], got
    assert any(0 < d <= 6000 for d in got["timerDelays"]), got["timerDelays"]


def test_pages_without_the_app_are_untouched():
    """archive처럼 React를 안 쓰는 페이지는 감출 이유가 없다 — 본문이 바로 나온다."""
    got = run(False)
    assert "ax-booting" not in got["afterMount"], got


def test_css_hides_the_bar_and_the_three_buttons():
    """진짜 원인은 바가 아니라 버튼 셋이었다.

    globe/pro/login은 만들어질 때 document.body에 직접 붙는다(151·163·173행).
    그리고 place()는 React 페이지에서 자리(#ax-actions-d)가 아직 없으면 바만
    감추고 early return 한다 — 버튼 셋은 body에 그대로 남아, 빈 화면에 셋만
    떠 있게 된다. 그래서 바와 버튼을 함께 감춘다."""
    css = open(os.path.join(ROOT, "i18n.js"), encoding="utf-8").read()
    flat = css.replace('" +\n      "', "").replace('" +\n        "', "")
    for sel in ("#ax-topbar", "#ax-globe", "#ax-pro", "#ax-login"):
        assert "html.ax-booting " + sel in flat, f"부팅 중 {sel}를 감추는 규칙이 없다"


def test_the_app_announces_when_it_mounts():
    app = open(os.path.join(ROOT, "axbrief-app.jsx"), encoding="utf-8").read()
    assert "ax:ready" in app, "앱이 ax:ready를 쏘지 않으면 바가 타이머까지 기다린다"


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except AssertionError as e:
                fails += 1; print(f"FAIL {name}: {e}")
    raise SystemExit(1 if fails else 0)
