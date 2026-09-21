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
    gout = os.path.join(tmpdir, "archive-graph.js")
    prem = os.path.join(tmpdir, "premium-full.json")
    json.dump(sectioned("design", "2026-09-01", [card("a")]), open(news, "w"))
    for _ in range(2):  # second run must not duplicate
        build_archive.main(["--news", news, "--archive", arch, "--out", out,
                            "--graph-out", gout, "--premium", prem])
    got = json.load(open(arch))["cards"]
    assert len(got) == 1
    assert got[0]["has_full"] is True
    assert os.path.exists(out) and os.path.exists(gout)
    prem_cards = json.load(open(prem))["cards"]
    assert "design/a" in prem_cards and prem_cards["design/a"]["blocks"]
    js = open(out).read()
    assert "프리미엄 전문" not in js, "premium blocks must not leak into public archive JS"
    print("PASS main_idempotent")


def test_premium_merge_keeps_existing(tmpdir):
    prem = os.path.join(tmpdir, "full.json")
    json.dump({"cards": {"design/a": {"blocks": [{"t": "p", "x": "현재 버전"}]}}}, open(prem, "w"))
    keys = build_archive.merge_premium_fulls(
        {"design/a": {"blocks": [{"t": "p", "x": "옛 버전"}]},
         "design/b": {"blocks": [{"t": "p", "x": "복구본"}]}}, prem)
    got = json.load(open(prem))["cards"]
    assert got["design/a"]["blocks"][0]["x"] == "현재 버전"  # setdefault — 덮어쓰지 않음
    assert got["design/b"]["blocks"][0]["x"] == "복구본"
    assert keys == {"design/a", "design/b"}
    print("PASS premium_merge_keeps_existing")


def test_terms():
    t = build_archive._terms({"headline": "DeepSeek가 미국 수출규제를 피했다",
                              "body": "AI 모델 공개, Figma and the tools"})
    assert "deepseek" in t and "figma" in t
    assert "수출규제" in t, t          # josa 를 stripped
    assert "ai" not in t and "the" not in t and "and" not in t
    assert "모델" not in t and "공개" not in t      # Korean stopwords
    assert not any(x.endswith("다") for x in t)     # predicates dropped
    print("PASS terms")


def test_graph():
    archive = []
    mk = lambda cid, hl: card(cid, headline=hl, body="")
    build_archive.fold(archive, sectioned("design", "2026-09-01", [
        mk("a", "DeepSeek 모델 분석"), mk("b", "DeepSeek 후속 보도"),
        mk("c", "무관한 타이포그래피 소식")]))
    g = build_archive.build_graph(archive)
    assert len(g["nodes"]) == 3
    ids = {(l["source"], l["target"]) for l in g["links"]}
    assert ("design/a", "design/b") in ids          # shared rare keyword
    assert not any("design/c" in p for p in ids)    # no shared terms → isolated
    link = g["links"][0]
    assert "deepseek" in link["kw"]
    byid = {n["id"]: n for n in g["nodes"]}
    assert byid["design/a"]["val"] == 2 and byid["design/c"]["val"] == 1
    js = build_archive.graph_to_js(g)
    node = subprocess.run(["node", "--check", "/dev/stdin"], input=js,
                          capture_output=True, text=True,
                          env={**os.environ, "NODE_OPTIONS": ""})
    assert node.returncode == 0, node.stderr
    print("PASS graph")


def test_graph_df_cap():
    # a term above DF_MAX must not wire the graph
    archive = []
    cards = [card(f"c{i}", headline=f"공통어휘 이야기 {i}", body="") for i in range(30)]
    build_archive.fold(archive, sectioned("design", "2026-09-01", cards))
    g = build_archive.build_graph(archive)
    assert g["links"] == [], f"df>{build_archive.DF_MAX} term must create no edges"
    print("PASS graph_df_cap")


if __name__ == "__main__":
    test_terms()
    test_graph()
    test_graph_df_cap()
    test_fold_and_dedup()
    test_full_stripped()
    test_old_schema_and_days()
    test_js_emission()
    with tempfile.TemporaryDirectory() as td:
        test_main_idempotent(td)
    with tempfile.TemporaryDirectory() as td:
        test_premium_merge_keeps_existing(td)
    print("build_archive OK")
