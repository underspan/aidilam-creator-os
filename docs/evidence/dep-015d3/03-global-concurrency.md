# DEP-015D3 Global Concurrency
- Configured: global=2
- 6 jobs submitted simultaneously
- Worker processed 2 at a time (BullMQ concurrency + DB admission)
- All 6 eventually succeeded
- Duplicate attempts: 0
