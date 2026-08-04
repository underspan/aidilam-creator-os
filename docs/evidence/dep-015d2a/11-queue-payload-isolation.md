# DEP-015D2A Queue Payload Isolation
- Wrong-project payload: worker SELECT WHERE id=$1 AND project_id=$2 → 0 rows → skip
- Proven in D1A (wrong-project delivery test)
- Same mechanism for retry/poll deliveries
