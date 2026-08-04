# DEP-015D1B Foreign Plan/Reservation

## Setup
- Project A and Project B with independent resources
- Project B job enqueued with Project A's projectId in payload

## Wrong-Project Payload Result
- Worker: SELECT WHERE j.id=$1 AND j.project_id=$2 → 0 rows
- Job B: stays queued, 0 attempts
- Adapter calls: 0
- Cross-project mutations: 0
- Metadata leakage: NONE

## Code-Level Foreign Denial
- Plan load: WHERE p.project_id=$2 (project-scoped)
- Asset load: WHERE id=$1 AND project_id=$2
- Reservation: WHERE publishing_job_id=$1 (tied to job, which is project-scoped)
- No cross-project read possible
