# DEP-015D2B Cancel vs Poll Success Race
## Cancel wins (proven live in parallel-cancel)
- Job in polling, cancel_requested persisted
- Worker detects cancel_requested at start of next poll iteration
- Calls adapter.cancel() → settles as cancelled
- No further polls after terminal settlement

## Poll-success wins
- If pollStatus returns succeeded before cancel_requested is checked
- settleSuccess commits with FOR UPDATE → success wins
- Cancel arrives later: 409
- One terminal state per job
