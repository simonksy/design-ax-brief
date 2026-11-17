"""Publish `!` sets one at a time, GAP seconds apart, alternating story/trend.

usage: python3 social/instagram/daily/publish_paced.py [--gap 840] [--date YYYY-MM-DD]
Order comes from publish.marked_posts() (oldest date first, story/trend paired).
publish.publish() never resends after a rate-limit response and renames ! → *.
The last post's kind and time persist in STATE, so the gap and the alternation
carry over between runs (backlog dates, the next morning)."""
import argparse, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import publish as P

STATE = os.path.expanduser("~/.design-ax-brief/ig-last-post")
ap = argparse.ArgumentParser()
ap.add_argument("--gap", type=int, default=840)
ap.add_argument("--date", help="only sets under this date folder")
a = ap.parse_args()
ts = lambda: time.strftime("%H:%M:%S")


def load_state():
    try:
        kind, at = open(STATE).read().split()
        return kind, float(at)
    except Exception:
        return "", 0.0


def mine(p):
    return not a.date or os.path.basename(os.path.dirname(p[2])) == a.date


env = P.load_env()
last, last_at = load_state()
while True:
    posts = [p for p in P.marked_posts() if mine(p)]
    if not posts:
        print(f"{ts()} 끝 — 남은 ! 회차 없음", flush=True); break
    post = next((p for p in posts if p[0] != last), posts[0])
    spec, items, caption, bad = P.check(post, env, verbose=False)
    if bad:
        print(f"{ts()} 규격 실패 — 멈춘다: {post[1]} {bad}", flush=True); sys.exit(1)
    dup = P.already_posted(caption, env)
    if dup:
        d = post[2]
        os.rename(d, os.path.join(os.path.dirname(d), P.MARK_DONE + post[1][1:]))
        print(f"{ts()} 이미 올라가 있음 → 표시만 바꿈 {post[0]}/{post[1]} {dup}", flush=True)
        continue
    wait = last_at + a.gap - time.time()
    if wait > 0:
        print(f"{ts()} {int(wait)}s 대기", flush=True); time.sleep(wait)
    print(f"{ts()} 올림 시작 {post[0]}/{post[1]}", flush=True)
    P.publish(post, items, caption, env)
    last, last_at = post[0], time.time()
    with open(STATE, "w") as f:
        f.write(f"{last} {last_at}")
