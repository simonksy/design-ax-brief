# social/instagram/publish_poll_test.py
"""기다리는 일에 요청을 쓰면 정작 올릴 요청이 모자란다.

10-14 에 네 벌을 올리는 동안 캐러셀 발행 직후 403(code 4 · 2207051)이 **네 번
모두** 떴다. 게시는 정상이었다 — 한도에 걸린 것은 게시가 아니라 그 앞뒤로
쏟아낸 상태 조회였다. 세 가지가 겹쳤다:

  1. 컨테이너를 만든 **직후에 바로** 물었다. 방금 만든 영상이 FINISHED 일
     수는 없으므로 이 요청은 언제나 버리는 요청이다. 회차마다 두 번씩
     (영상 자식 + 캐러셀 부모) 공짜로 날렸다.
  2. 간격이 10초에서 시작했다. 영상 변환은 30초 넘게 걸리는 쪽이 보통이라
     앞머리의 잦은 조회가 대부분 헛걸음이었다.
  3. 한도에 걸리면 `api()` 가 SystemExit 로 끝냈다. 기다리다 막힌 것은
     회차가 잘못된 게 아니므로, 물러서서 다시 물어야 한다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publish                                                   # noqa: E402

LIMIT_BODY = ('{"error":{"message":"Application request limit reached",'
              '"type":"OAuthException","is_transient":false,"code":4,'
              '"error_subcode":2207051}}')


def test_never_asks_before_waiting():
    """첫 조회가 0초에 오면 반드시 IN_PROGRESS 다 — 버리는 요청이다."""
    plan = publish.poll_plan()
    assert plan, "조회 계획이 비었다"
    assert plan[0] >= 20, f"첫 조회가 {plan[0]}초 — 만들자마자 묻고 있다"


def test_asks_few_times_over_ten_minutes():
    """10분을 덮으면서 조회는 여덟 번 안쪽. 예전 10→20→40→60 은 열두 번이었다."""
    plan = publish.poll_plan()
    assert plan[-1] >= 600, f"{plan[-1]}초까지만 기다린다 — 10분을 못 덮는다"
    assert len(plan) <= 8, f"조회 {len(plan)}번 — 기다리는 데 요청을 너무 쓴다"


def test_gaps_only_widen():
    plan = publish.poll_plan()
    gaps = [b - a for a, b in zip(plan, plan[1:])]
    assert gaps == sorted(gaps), f"간격이 좁아지는 구간이 있다: {gaps}"


class _Limited(publish.urllib.error.HTTPError):
    def __init__(self):
        super().__init__("u", 403, "limited", {}, None)

    def read(self):
        return LIMIT_BODY.encode()


def test_soft_call_reports_the_limit_instead_of_dying():
    """발행은 한도에 걸려도 죽지 말고 알려야 한다 — 죽으면 올라갔는지 못 본다.

    다시 보내면 같은 글이 두 번 올라가므로(10-14 에 네 번 모두 늦게 올라갔다)
    호출한 쪽이 피드를 먼저 확인할 기회를 가져야 한다."""
    real = publish.urllib.request.urlopen
    publish.urllib.request.urlopen = lambda *a, **k: (_ for _ in ()).throw(_Limited())
    try:
        got = publish.api("x/media_publish", {"a": "1"}, "POST", retries=0, soft=True)
    finally:
        publish.urllib.request.urlopen = real
    assert got == {"_limited": True}, f"한도를 알리지 않았다: {got}"


def test_knows_the_rate_limit_body():
    assert publish.is_rate_limited(LIMIT_BODY), "한도 응답을 못 알아본다"
    assert not publish.is_rate_limited('{"error":{"code":190}}'), "토큰 오류를 한도로 본다"
    assert not publish.is_rate_limited("not json"), "쓰레기 응답을 한도로 본다"


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print(f"ok   {name}")
            except (AssertionError, AttributeError) as e:
                fails += 1; print(f"FAIL {name}: {type(e).__name__}: {e}")
    raise SystemExit(1 if fails else 0)
