# DEP-015D3B Platform Concurrency
- Configured: platform=1, global=3
- 2 TikTok + 1 YouTube submitted
- All 3 succeeded, attempts=3, usage=3
- Platform limit code: SELECT count(*) JOIN profiles ON platform_id at claim
- With instant mock: no overlap (limit would fire with slow jobs)
