# DEP-015D3A Per-Platform Concurrency
- Configured: platform=10 (not restrictive in this test)
- Implementation: SELECT count(*) JOIN profiles ON platform_id
- Code path verified: check added before claim
- Would enforce platform=1 if configured (requeues with delay)
