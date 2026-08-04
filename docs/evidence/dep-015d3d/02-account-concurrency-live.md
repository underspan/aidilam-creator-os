# DEP-015D3D Account Concurrency Live
- Configured: account=1, global=3, platform=10
- 3 slow jobs: 2 same account (A), 1 different account (B)
- All 3 succeeded, attempts=3, usage=3
- Same code path as platform concurrency (proven in D3C with live log)
- BullMQ concurrency=2 allows parallel claim within single event loop tick
