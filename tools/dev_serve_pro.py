#!/usr/bin/env python3
"""Dev-only static server that also stubs /api/me as an entitled Pro member,
so the Insights pill (Patreon-gated in production) can be exercised locally.
Usage: python3 tools/dev_serve_pro.py [port]   (default 8766)
"""
import http.server
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        u = urlparse(self.path)
        if u.path == "/api/me":
            return self._json({"loggedIn": True, "entitled": True})
        if u.path == "/api/premium/full":
            q = parse_qs(u.query)
            key = f"{q.get('section', [''])[0]}/{q.get('id', [''])[0]}"
            try:
                with open(os.path.join(ROOT, "premium", "full.json"), encoding="utf-8") as f:
                    cards = json.load(f).get("cards", {})
            except OSError:
                return self._json({"reason": "unavailable"}, 503)
            full = cards.get(key)
            if not full:
                return self._json({"reason": "not_found"}, 404)
            return self._json({"full": full})
        super().do_GET()

    def do_POST(self):
        from urllib.parse import urlparse
        if urlparse(self.path).path == "/api/insights/summary":
            n = int(self.headers.get("Content-Length", 0))
            _ = self.rfile.read(n)
            return self._json({"summary": "이 토픽은 6월 말 텍스트로 3D 형상을 뽑는 실험에서 출발했다. 7월에는 매크로 키패드와 게임용 3D 변환으로 응용이 넓어졌고, 8월 들어 오디오 생성·플러그인 코딩까지 번졌다. 사용자가 선택한 뉴스는 이 흐름의 출발점에 해당한다. 다음 관전 포인트는 도면 자동화가 실무 CAD 워크플로에 얼마나 흡수되느냐다."})
        self.send_response(404); self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
