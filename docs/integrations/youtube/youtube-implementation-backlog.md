# YouTube Implementation Backlog

## DEP-016A1 — Discovery and contract (THIS PHASE)
- Adapter interface review
- OAuth model design
- Error classification
- Test plan
- Owner decisions identified

## DEP-016A2 — OAuth credential model
- Secret-store integration design
- Refresh-token storage schema
- Token refresh service
- Credential health check

## DEP-016A3 — Adapter skeleton and validation
- YouTubeAdapter class implementing PublishingAdapter
- validateAccount, validateMedia
- Error classification mapping
- Unit tests with mock HTTP

## DEP-016A4 — Resumable upload implementation
- Session creation
- Chunked upload with checkpoints
- Resume after interruption
- Upload progress reporting

## DEP-016A5 — Polling and reconciliation
- Processing-status polling
- Final URL extraction
- Unknown-result reconciliation

## DEP-016A6 — Cancellation and delete governance
- Cancel during upload
- Delete draft video (with approval gate)
- Owner notification

## DEP-016A7 — Mocked integration tests
- Full lifecycle with mock HTTP
- All 22 test cases
- Concurrency and isolation

## DEP-016A8 — Google sandbox/private upload test
- Real API with test channel
- Private visibility only
- Owner approval required

## DEP-016A9 — Operational readiness and closure
- Monitoring integration
- Runbook updates
- Production enable gate
