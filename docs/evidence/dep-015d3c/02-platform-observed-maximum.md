# DEP-015D3C Platform Observed Maximum
- Config: platform=1, global=3
- 2 TikTok + 1 YouTube with publish_mock_slow_success (3s delay)
- Worker log: "Platform concurrency limit reached, requeuing" active=1, limit=1
- Observed: TikTok max active = 1 (second TikTok requeued until slot free)
- YouTube ran concurrently with TikTok (different platform)
- All 3 eventually succeeded, attempts=3, usage=3
