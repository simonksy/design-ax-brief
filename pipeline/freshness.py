"""Deterministic recency gate. Flat 72h window for all days (Mon-Fri). UTC."""
import sys
from datetime import datetime, timezone

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

def window_hours(now_iso):
    # Unified: previous 72 hours for every day of the week (Mon-Fri).
    return 72

def is_fresh(published_iso, now_iso):
    pub = _parse(published_iso)
    now = _parse(now_iso)
    if pub is None or now is None:
        return False
    age_h = (now - pub).total_seconds() / 3600.0
    if age_h < 0:
        return False
    return age_h <= window_hours(now_iso)

if __name__ == "__main__":
    pub, now = sys.argv[1], sys.argv[2]
    print("FRESH" if is_fresh(pub, now) else "STALE")
