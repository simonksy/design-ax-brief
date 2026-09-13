"""Deterministic recency gate (UTC). Window is per-section:
  - design, politics: previous 72 hours (tight — both beats move fast and are dense,
    and a two-week-old ruling or export-control decision is already stale news).
  - other sections (music, movies, games, books, gadgets, science): previous 14 days
    (336h) — these domains publish AI news less often, so a wider window fills 3-5 cards.
Usage: freshness.py <published_iso> <now_iso> [section]   (section defaults to design)
"""
import sys
from datetime import datetime, timezone

FAST_WINDOW_H = 72
SLOW_WINDOW_H = 336  # 14 days
# Sections whose beat is dense enough to sustain the tight window.
FAST_SECTIONS = {"design", "politics"}

def _parse(iso):
    if not iso:
        return None
    try:
        s = iso.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None

def window_hours(now_iso, section="design"):
    return FAST_WINDOW_H if section in FAST_SECTIONS else SLOW_WINDOW_H

def is_fresh(published_iso, now_iso, section="design"):
    pub = _parse(published_iso)
    now = _parse(now_iso)
    if pub is None or now is None:
        return False
    age_h = (now - pub).total_seconds() / 3600.0
    if age_h < 0:
        return False
    return age_h <= window_hours(now_iso, section)

if __name__ == "__main__":
    pub, now = sys.argv[1], sys.argv[2]
    section = sys.argv[3] if len(sys.argv) > 3 else "design"
    print("FRESH" if is_fresh(pub, now, section) else "STALE")
