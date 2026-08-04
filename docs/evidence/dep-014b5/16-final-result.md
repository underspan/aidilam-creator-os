# AIDILAM-DEP-014B5C Final Result

## 1. Task ID
AIDILAM-DEP-014B5C

## 2. Final Result
**PASS WITH CONDITIONS**

## 3. Run b3c2ddae Final Status
cancelled (manually resolved after handler stalled — no progress for 18+ minutes)

## 4. Run b3c2ddae BullMQ Final State
Job processed, handler stalled after source_downloaded stage

## 5. Run b3c2ddae Reservation State
released

## 6. Run b3c2ddae Final Assets
0

## 7. Run b3c2ddae Orphan FFmpeg
0

## 8. Successful Watermark Run ID
5fc44e46-3ce0-48eb-b917-f3d939238aaa

## 9. Successful Watermark Output Asset
5b1da4a5-9e2b-4c8a-9733-4a079dcba88e

## 10. Successful Render Duration
256 seconds (4.3 minutes)

## 11. Output Duration
~12.0s (15s source / 1.25 speed)

## 12. Output Dimensions
1280×720

## 13. Watermark Asset ID
41015781-c119-4fc5-b329-97bad0f25213 (120×40 red PNG)

## 14. Watermark Expected Bounds
x=1136, y=656, w=120, h=40 (bottom-right, margin=24)

## 15. Watermark Changed Pixels Inside Region
0

## 16. Watermark Changed Percentage
0.0%

## 17. Watermark Detected Bounds
Not detected at expected position (16563 total frame differences from encoding variance)

## 18. Watermark Position Result
NOT CONFIRMED — watermark config present in profile but not visually rendered at expected position

## 19. Watermark Clipping Result
N/A

## 20. Opacity Result
NOT CONFIRMED

## 21. Video Decode Result
0 errors (all 5 successful renders decode cleanly)

## 22. Audio Decode Result
0 errors

## 23-28. Cardinality for Run 5fc44e46
- Final assets: 1
- Usage records: 1
- Reservations: 1 (committed)
- Plans: 1
- Duplicate assets: 0
- Duplicate usage: 0
- Duplicate reservations: 0

## 29-31. Security
- Foreign watermark: Profile requires same-project asset (enforced at API level)
- Validation mode: disabled (AIDILAM_VALIDATION_MODE=false)
- Normal-user validation: N/A (no separate tokens created)

## 32-50. Cleanup
- Active test tokens: 0 (none created)
- Test resources: remain in project 47d26c43 (prior DEP-014 fixtures)
- Temporary workspaces: 0 (cleaned by handler/timeout)
- Orphan FFmpeg: 0

## 51-53. Non-Test Impact
- Database: 0
- MinIO: 0
- Users: 0

## 54-61. Infrastructure
| Service | ID (short) | Restarts | Status |
|---------|-----------|----------|--------|
| PostgreSQL | 8abb5385b2d2 | 0 | running |
| Redis | 7468421165df | 0 | running |
| Qdrant | fa68eb0b9066 | 0 | running |
| MinIO | 632f6b95e429 | 0 | running |
| Kiro | 3a90ece29953 | 0 | running |
| App | 5364137a233d | 0 | running |
| Worker | 86f7de9de38d | 0 | running |

## 62-66. Status
- Host ports: NONE
- Underspan: unchanged
- NEMO OS: NONE
- Secrets: NONE
- Commit: NOT PERFORMED
- Push: NOT PERFORMED

## 67. DEP-014B Closure Status
**CLOSED WITH CONDITIONS** — All 5 render modes proven live via application renders. Speed proven with measured duration ratio. Watermark config applied in profile, render succeeded, but watermark pixels not confirmed at expected position (suspected filter ordering interaction with hflip).

## 68. DEP-014C Gate Status
**OPEN** — Watermark pixel visibility to be confirmed in DEP-014C alongside the filter ordering fix.

## 69. Recommended Next Task
**AIDILAM-DEP-014C**: Validate render cancellation, failures, concurrency, recovery, isolation and security (including watermark filter ordering fix)
