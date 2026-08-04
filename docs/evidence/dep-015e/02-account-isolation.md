# DEP-015E Account and Project Isolation

## Proven Evidence
- D3P: API isolation 8/8 (read=404, cancel=404, retry=404, list=own-only)
- D3Q: Recovery cross-project contamination = 0 (attempts, reservations, usage, audit)
- D3G/D3H: Advisory-lock per-account isolation (same-account overlap=0)
- D2B: Wrong-project BullMQ payload: "not found" → skip

## Per Platform
All 6 platforms share the same isolation mechanism:
- Worker claim: WHERE j.id=$1 AND j.project_id=$2
- Plan load: WHERE p.project_id=$2
- Asset load: WHERE id=$1 AND project_id=$2
- Reservation: scoped by publishing_job_id (transitively project-scoped)

## Secret Reference Safety
- credential_reference: opaque vault reference only (e.g., "vault://test")
- Never included in queue payloads, audit, API responses, or logs
- detectCredentialFields() scan before adapter execution
