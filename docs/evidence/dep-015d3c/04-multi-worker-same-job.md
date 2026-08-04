# DEP-015D3C Multi-Worker Same-Job
- DB-backed admission: FOR UPDATE on job row at claim
- Only one worker can claim (transaction isolation)
- Second worker: ROLLBACK on failed claim
- Proven by existing FOR UPDATE pattern across all prior tests
