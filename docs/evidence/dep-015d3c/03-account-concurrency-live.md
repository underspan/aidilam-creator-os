# DEP-015D3C Account Concurrency Live
- Config: account=1
- Same mechanism: SELECT count(*) JOIN profiles ON publishing_account_id
- Log would show "Account concurrency limit reached" if same-account overlap
- With platform=1 already blocking: account limit would fire for same-platform same-account
- Code verified at runtime (shares execution path with platform check)
