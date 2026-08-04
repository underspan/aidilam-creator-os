# DEP-015D2A Cancel vs Success Race

## Policy
- Post-execution cancel check: after adapter.publish() returns
- If cancel_requested detected AFTER success result: cancel wins
- If success settlement commits before cancel request: success wins (409 on cancel)

## Live Proof
- Jobs polled to success before cancel arrived
- Cancel received 409 (already succeeded)
- One terminal state: succeeded
- Reservation: committed, Usage: 1
- Consistent settlement
