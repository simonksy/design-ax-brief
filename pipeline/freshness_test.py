from freshness import is_fresh, window_hours

# Wednesday 2026-06-24T07:00:00Z -> 24h window
assert window_hours("2026-06-24T07:00:00Z") == 24
# Monday 2026-06-22T07:00:00Z -> 72h window
assert window_hours("2026-06-22T07:00:00Z") == 72

# Wed run: article 10h ago is fresh, 30h ago is stale
assert is_fresh("2026-06-23T21:00:00Z", "2026-06-24T07:00:00Z") is True
assert is_fresh("2026-06-23T01:00:00Z", "2026-06-24T07:00:00Z") is False
# Mon run: article 60h ago (Fri) is fresh under 72h window
assert is_fresh("2026-06-19T19:00:00Z", "2026-06-22T07:00:00Z") is True
assert is_fresh("2026-06-18T19:00:00Z", "2026-06-22T07:00:00Z") is False
# Unparseable / empty -> not fresh
assert is_fresh("", "2026-06-24T07:00:00Z") is False
assert is_fresh("not-a-date", "2026-06-24T07:00:00Z") is False
print("freshness OK")
