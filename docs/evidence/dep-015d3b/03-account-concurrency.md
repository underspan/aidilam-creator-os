# DEP-015D3B Account Concurrency
- Configured: account=1, global=3
- Code: SELECT count(*) JOIN profiles ON publishing_account_id at claim
- Same-account jobs would wait if overlapping
- With instant mock: serialized naturally
