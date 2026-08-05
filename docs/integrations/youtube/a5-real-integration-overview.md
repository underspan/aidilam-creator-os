# DEP-016A5: Real YouTube Sandbox Integration Overview

## Status: DISCOVERY COMPLETE — AWAITING OWNER DECISIONS

## Purpose
Define the complete safety, credential, OAuth, secret-store, quota, sandbox,
polling and rollout model before any real Google/YouTube API call is made.

## Current State (post-A4)
- Fake transport: proven (13 scenarios, 161 dedicated tests)
- Migration 019: applied to DEV (upload sessions + checkpoints)
- DB repositories: project-scoped, atomic, monotonic progress
- Worker restart recovery: proven (PID change documented)
- Lifecycle boundary: uploaded ≠ succeeded, polling handoff preserved
- Real transport: DISABLED (gate absent)
- Real adapter: DISABLED (gate absent)
- Public callback: ABSENT
- Production SecretStore: ABSENT

## Gap Matrix

| Capability | Status | Blocking |
|-----------|--------|----------|
| FakeYouTubeUploadTransport | Implemented, proven | — |
| RealYouTubeUploadTransport | Not implemented | A5.4 |
| Google API client (googleapis) | Not added | A5.4 |
| OAuth consent screen | Not configured | Owner action |
| OAuth client credentials | Not created | Owner action |
| Public callback route | Code exists disabled | A5.3 |
| Production SecretStore | Not selected | Owner decision |
| Real token exchange | Not implemented | A5.3 |
| Access token refresh | Not implemented | A5.3 |
| Resumable upload (real) | Not implemented | A5.4 |
| Processing polling (real) | Not implemented | A5.5 |
| Quota tracking | Not implemented | A5.7 |
| Sandbox gate | Not implemented | A5.6 |
| Test channel | Not designated | Owner action |
| Test media | Not created | Owner action |

## Phase Slices

| Slice | Objective | Owner Action |
|-------|-----------|-------------|
| A5.1 | Google Cloud + OAuth owner setup | CREATE project |
| A5.2 | Production SecretStore implementation | SELECT backend |
| A5.3 | Real OAuth transport + callback | APPROVE redirect URI |
| A5.4 | Real YouTube upload transport | APPROVE dependencies |
| A5.5 | Processing-status polling | APPROVE polling budget |
| A5.6 | Sandbox/private upload validation | APPROVE test channel |
| A5.7 | Quota, monitoring, rollback | SET thresholds |
| A5.8 | Owner-approved sandbox UAT | EXECUTE first upload |

## No credentials created. No API calls made. No production changes.
