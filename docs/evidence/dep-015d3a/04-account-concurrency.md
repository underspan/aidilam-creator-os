# DEP-015D3A Per-Account Concurrency
- Configured: account=10 (not restrictive in this test)
- Implementation: SELECT count(*) JOIN profiles ON publishing_account_id
- Code path verified: check added before claim
- Would enforce account=1 if configured (requeues with delay)
