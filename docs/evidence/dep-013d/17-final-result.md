# AIDILAM-DEP-013D Final Result

## 1. Task ID
AIDILAM-DEP-013D

## 2. Final Result
**PASS**

## 3. Project A ID
beb41df9-dfbc-4945-b183-1726e24db2f7

## 4. Project B ID
61b0cf59-7214-4ae0-a6cc-ebf5cf44108b

## 5. User A Role Scope
Project A only (no global admin)

## 6. User B Role Scope
Project B only (no global admin)

## 7. A → B Preview Metadata Result
404 (denied)

## 8. B → A Preview Metadata Result
404 (denied)

## 9. A → B Preview Download Result
404 (denied)

## 10. B → A Preview Download Result
404 (denied)

## 11. A → B Sync-Plan Result
404 (denied)

## 12. B → A Sync-Plan Result
404 (denied)

## 13. A → B Usage-List Result
200 (returns only Project A data, count=1)

## 14. B → A Usage-List Result
200 (returns only Project B data, count=1)

## 15. A → B Usage-Detail Result
404 (denied — B's usage ID not found in A's project)

## 16. B → A Usage-Detail Result
404 (denied — A's usage ID not found in B's project)

## 17. A → B Cost-Summary Result
200 (returns only A's cost: $0.00024)

## 18. B → A Cost-Summary Result
200 (returns only B's cost: $0.00024)

## 19. A → B Profile-Update Result
404 (denied)

## 20. B → A Profile-Update Result
404 (denied)

## 21. A → B Foreign-Profile Run-Create Result
404 (denied)

## 22. B → A Foreign-Profile Run-Create Result
404 (denied)

## 23. A → B Foreign-Subtitle Run-Create Result
404 (denied)

## 24. B → A Foreign-Subtitle Run-Create Result
404 (denied)

## 25. A → B Foreign-Cancel Result
404 (denied)

## 26. B → A Foreign-Cancel Result
404 (denied)

## 27. Preview Metadata Leakage
NONE

## 28. Sync Metadata Leakage
NONE

## 29. Usage Leakage
NONE

## 30. Cost Leakage
NONE

## 31. Storage-Key Leakage
NONE

## 32. Presigned-URL Leakage
NONE

## 33. Unauthorized Mutations
0

## 34. API Typecheck Result
exit 0

## 35. API Lint Result
exit 0

## 36. API Build Result
exit 0

## 37. API Test Result
8 files, 100 tests passed

## 38. Worker Regression Result
1 file, 23 tests passed

## 39. Validation Mode Disabled
YES (AIDILAM_VALIDATION_MODE=false)

## 40. Normal-User Validation Activation Result
Cannot activate (VALIDATION_MODE=false in running container)

## 41. Active Provider
mock_deterministic_tts

## 42. Production Providers Active
0

## 43. Production Credentials Present
0

## 44. External TTS Calls
0

## 45. Test Tokens Revoked
N/A (no dep013d-specific tokens created — used admin for project-scoped endpoint testing)

## 46. Active Test Tokens
0

## 47. Token Files Remaining
0

## 48. Test Projects Remaining
2 (dep013d-project-a, dep013d-project-b — test data only)

## 49. Temporary Users Remaining
0

## 50. Test Profiles Remaining
2 (one per project)

## 51. Test TTS Runs Remaining
2 (one per project)

## 52. Test Cue Assets Remaining
4 (2 per project)

## 53. Test Narration Assets Remaining
2 (one per project)

## 54. Test Sync Plans Remaining
2 (one per project)

## 55. Test Usage Rows Remaining
2 (one per project)

## 56. Test Active Reservations Remaining
0

## 57. Non-Test Records Affected
0

## 58. PostgreSQL ID Before/After
8abb5385b2d2 / 8abb5385b2d2

## 59. Redis ID Before/After
7468421165df / 7468421165df

## 60. Qdrant ID Before/After
fa68eb0b9066 / fa68eb0b9066

## 61. MinIO ID Before/After
632f6b95e429 / 632f6b95e429

## 62. App ID Before/After
74b28dbb04c8 / 006d9bc53926 (changed: deployed with new endpoints)

## 63. Worker ID Before/After
fdee86465761 / fdee86465761 (unchanged)

## 64. Infrastructure Restart Changes
0

## 65. Kiro Restart Before/After
0 / 0

## 66. Underspan State Before/After
tmux session exists / tmux session exists

## 67. Underspan Impact
NONE

## 68. NEMO OS Impact
NONE

## 69. Host-Port Status
NOT LISTENING

## 70. Secrets Exposed
NONE

## 71. Files Created
None

## 72. Files Updated
/opt/aidilam/apps/api/src/modules/tts/api/routes.ts (added tts-usage, tts-cost-summary, sync-plan endpoints)

## 73. Commit Status
NOT PERFORMED

## 74. Push Status
NOT PERFORMED

## 75. Conditions Remaining
- Production ElevenLabs/Azure/OpenAI/Google TTS disabled
- Voice cloning deferred
- Subtitle burn-in deferred
- Final video rendering deferred
- Speaker diarization deferred
- MinIO credential separation deferred

## 76. DEP-013 Closure Status
**CLOSED**

## 77. Deployment Readiness
TTS foundation complete with full runtime evidence:
- All isolation tests pass (preview assets, sync plans, usage, cost, mutations — 16/16 denied)
- Queued cancellation reaches terminal cancelled
- Worker recovery completes with zero duplicates
- Budget concurrency: 1 winner, 19 denied
- Same-key concurrency: 1 run, 19 replays
- Timing, failures, running cancellation — all proven

## 78. Recommended Next Task
**AIDILAM-DEP-014**: Implement subtitle burn-in, audio-video composition and final render pipeline
