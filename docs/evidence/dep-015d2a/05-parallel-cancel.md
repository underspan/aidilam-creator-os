# DEP-015D2A Parallel Cancel
- Job: queued
- 20 concurrent cancel requests
- Result: 2×200 + 18×409 + 0×500
- Final: cancelled, reservation=released
- Cancel audit events: 2 (race window)
- Job state: one terminal state (cancelled)
- HTTP 500: 0
