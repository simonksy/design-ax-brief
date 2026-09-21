#!/usr/bin/env python3
"""Unit tests for build_archive.py — fold/dedup/idempotency, old-schema
backfill parsing, premium-full stripping, and JS emission."""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.dirname(HERE)
sys.path.insert(0, PIPE)

import build_archive  # noqa: E402


def card(cid, url=None, **kw):
    c = {"id": cid, "eyebrow": "AI NEWS", "headline": "헤드라인 " + cid,
         "body": "요약 " + cid, "tool": "Design", "source": "Src",
         "url": url or ("https://example.com/" + cid),
         "accent": "#0070f3", "motif": "frame",
         "full": {"mode": "full", "blocks": [{"t": "p", "x": "프리미엄 전문"}]}}
    c.update(kw)
    return c


def sectioned(sec, date, cards, days=None):
    return {"sections": {sec: {"today": {"date": date, "cards": cards},
                               "days": days or []}}}


def test_fold_and_dedup():
    archive = []
    n = build_archive.fold(archive, sectioned("design", "2026-09-01", [card("a")]))
    assert n == 1 and archive[0]["date"] == "2026-09-01"
    # same id again on a later date → no dup, earliest date kept
    n = build_archive.fold(archive, sectioned("design", "2026-09-03", [card("a")]))
    assert n == 0 and len(archive) == 1 and archive[0]["date"] == "2026-09-01"
    # same url under a different id → still a dup
    n = build_archive.fold(archive, sectioned(
        "design", "2026-09-04", [card("a-renamed", url="https://example.com/a")]))
    assert n == 0 and len(archive) == 1
    # same id in a DIFFERENT section is a distinct story
    n = build_archive.fold(archive, sectioned("music", "2026-09-02", [card("a")]))
    assert n == 1 and len(archive) == 2
    print("PASS fold_and_dedup")


def test_full_stripped():
    archive = []
    build_archive.fold(archive, sectioned("design", "2026-09-01", [card("a")]))
    assert "full" not in archive[0], "premium full payload must never be archived"
    assert "eyebrow" not in archive[0]
    js = build_archive.to_js(archive)
    assert "프리미엄 전문" not in js
    print("PASS full_stripped")


def test_old_schema_and_days():
    old = {"today": {"date": "2026-06-21", "cards": [card("x")]},
           "days": [{"date": "2026-06-20", "cards": [card("y")]}]}
    archive = []
    n = build_archive.fold(archive, old)
    assert n == 2
    assert {c["section"] for c in archive} == {"design"}
    assert {c["date"] for c in archive} == {"2026-06-20", "2026-06-21"}
    print("PASS old_schema_and_days")


def test_js_emission():
    archive = []
    build_archive.fold(archive, sectioned(
        "design", "2026-09-01", [card("a", headline="닫는 태그 </script> 포함")]))
    js = build_archive.to_js(archive)
    assert "</script" not in js, "must escape </ to keep inline-safe"
    assert js.count("window.AX_ARCHIVE ") == 1
    node = subprocess.run(["node", "--check", "/dev/stdin"], input=js,
                          capture_output=True, text=True,
                          env={**os.environ, "NODE_OPTIONS": ""})
    assert node.returncode == 0, node.stderr
    print("PASS js_emission")


def test_main_idempotent(tmpdir):
    news = os.path.join(tmpdir, "news.json")
    arch = os.path.join(tmpdir, "archive.json")
    out = os.path.join(tmpdir, "archive-data.js")
    json.dump(sectioned("design", "2026-09-01", [card("a")]), open(news, "w"))
    for _ in range(2):  # second run must not duplicate
        build_archive.main(["--news", news, "--archive", arch, "--out", out])
    got = json.load(open(arch))["cards"]
    assert len(got) == 1
    assert os.path.exists(out)
    print("PASS main_idempotent")


if __name__ == "__main__":
    test_fold_and_dedup()
    test_full_stripped()
    test_old_schema_and_days()
    test_js_emission()
    with tempfile.TemporaryDirectory() as td:
        test_main_idempotent(td)
    print("build_archive OK")
