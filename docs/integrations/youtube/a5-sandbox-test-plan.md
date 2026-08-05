# A5.7: Sandbox Test Plan

## Sandbox Execution Gate

Every real upload requires ALL of:
1. Named owner approval (recorded in audit)
2. Approved channel ID (matches credential binding)
3. Approved media checksum (verified before upload)
4. Privacy = private (enforced, not configurable)
5. Title prefix: `[AIDILAM-TEST]` (deterministic identification)
6. Quota budget check passes
7. Active credential binding
8. No duplicate logical upload
9. Rollback plan documented
10. Evidence capture enabled

### Prohibited During Sandbox
- Public visibility
- Batch upload
- Unattended scheduling
- Production customer content
- Copyrighted media
- Personal/sensitive media without approval

## Test Media Specification

| Attribute | Requirement |
|-----------|-------------|
| Format | MP4 (H.264 + AAC) |
| Duration | 10-30 seconds |
| Resolution | 720p (1280×720) |
| File size | 5-20 MB |
| Content | Synthetic (color bars, counter, tone) |
| Copyright | None (self-generated) |
| Faces | None |
| Personal data | None |
| Checksum | Pre-computed SHA-256 |
| Filename | `aidilam-test-upload-v1.mp4` |

### Generation Method
- FFmpeg-generated synthetic clip
- Deterministic (same command = same output with fixed seed)
- Example: `ffmpeg -f lavfi -i testsrc2=duration=15:size=1280x720 -f lavfi -i sine=frequency=440:duration=15 -c:v libx264 -c:a aac -shortest output.mp4`

## Pilot Channel Requirements

| Requirement | Rationale |
|-------------|-----------|
| Dedicated test channel | No risk to production content |
| Not monetized | No revenue impact |
| No existing audience | No accidental public exposure impact |
| Owner-controlled | Emergency access guaranteed |
| Backup owner configured | Redundant access |
| 2FA enabled | Security |
| Channel ID recorded | Binding verification |

## Sandbox Test Cases

### Case 1: Happy Path
1. Owner approves upload
2. OAuth token refreshed successfully
3. Resumable session created
4. All chunks uploaded
5. Processing polling succeeds
6. Video appears as private in YouTube Studio
7. Status: succeeded
8. Cleanup: manual delete after verification

### Case 2: Auth Refresh
1. Access token intentionally expired (wait >1hr or revoke)
2. Upload starts
3. 401 received
4. Auto-refresh succeeds
5. Upload continues
6. Status: succeeded

### Case 3: Network Interruption Simulation
1. Upload starts (large enough for multiple chunks)
2. Interrupt network mid-upload (e.g., iptables drop)
3. Worker detects timeout
4. Session enters interrupted state
5. Restore network
6. Recovery resumes from checkpoint
7. Upload completes

### Case 4: Quota Boundary
1. Check remaining quota
2. If insufficient: verify soft-limit blocks upload start
3. If sufficient: upload normally
4. Verify quota counter incremented

## Evidence Capture
- Screenshot of YouTube Studio showing private video
- API response (redacted: no tokens) showing videoId
- DB state showing session=uploaded, job=succeeded
- Audit log showing exactly-once events
- Quota counter change

## Owner Decisions Required
1. Designate test YouTube channel
2. Approve test media specification
3. Approve first test date
4. Confirm manual delete policy for test videos

## No uploads performed. No test media created yet.
