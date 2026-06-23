from freshness import is_fresh, window_hours

# Unified 72h window for every day of the week.
assert window_hours("2026-06-24T07:00:00Z") == 72  # Wednesday
assert window_hours("2026-06-22T07:00:00Z") == 72  # Monday
assert window_hours("2026-06-26T07:00:00Z") == 72  # Friday

# Any run: article within 72h is fresh, beyond 72h is stale
assert is_fresh("2026-06-23T21:00:00Z", "2026-06-24T07:00:00Z") is True   # 10h ago
assert is_fresh("2026-06-22T21:00:00Z", "2026-06-24T07:00:00Z") is True   # 34h ago, fresh under 72h
assert is_fresh("2026-06-20T21:00:00Z", "2026-06-24T07:00:00Z") is False  # ~82h ago, stale
# Mon run: article 60h ago (Fri) is fresh under 72h window
assert is_fresh("2026-06-19T19:00:00Z", "2026-06-22T07:00:00Z") is True
assert is_fresh("2026-06-18T19:00:00Z", "2026-06-22T07:00:00Z") is False
# Unparseable / empty -> not fresh
assert is_fresh("", "2026-06-24T07:00:00Z") is False
assert is_fresh("not-a-date", "2026-06-24T07:00:00Z") is False
print("freshness OK")
