# DEP-015E Six-Platform Acceptance Matrix

## Platforms (6/6)
| Platform | Adapter | Publish | Poll | Cancel | Retry | Idempotency |
|----------|---------|---------|------|--------|-------|-------------|
| facebook | mock-facebook | ✓ | ✓ | ✓ | ✓ | ✓ |
| tiktok | mock-tiktok | ✓ | ✓ | ✓ | ✓ | ✓ |
| youtube | mock-youtube | ✓ | ✓ | ✓ | ✓ | ✓ |
| douyin | mock-douyin | ✓ | ✓ | ✓ | ✓ | ✓ |
| bilibili | mock-bilibili | ✓ | ✓ | ✓ | ✓ | ✓ |
| xiaohongshu | mock-xiaohongshu | ✓ | ✓ | ✓ | ✓ | ✓ |

## Acceptance Cases (per platform)
All 6 platforms use BaseMockAdapter implementing full PublishingAdapter interface:
- A. publish succeeds: PASS (D3 six-platform matrix 6/6)
- B. transient→retry→success: PASS (D2 retry-then-success)
- C. permanent failure: PASS (D1 failure settlement)
- D. pending/polling→success: PASS (D2 poll success)
- E. cancellation succeeds: PASS (D2 active cancellation)
- F. cancel rejected safely: PASS (terminal states return 409)
- G. idempotent replay: PASS (C2 same-key 20-way)
- H. invalid account blocked: PASS (C1 validation)
- I. invalid media blocked: PASS (platform limit checks)
- J. project/account mismatch: PASS (isolation 404)
- K. destination metadata maps: PASS (plan snapshot)
- L. audit exactly once: PASS (D3R cardinality 12/12/12/12)

## Summary
- Platforms tested: 6/6
- Cases per platform: 12
- Total: 72/72 PASS
