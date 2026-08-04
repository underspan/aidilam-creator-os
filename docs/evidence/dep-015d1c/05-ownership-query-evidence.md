# DEP-015D1C Ownership Query Evidence

## Job Claim
```sql
SELECT ... FROM publishing_jobs WHERE id = $1 AND project_id = $2 FOR UPDATE
```

## Plan Load
```sql
SELECT ... FROM publishing_plans p WHERE p.publishing_job_id = $1 AND p.project_id = $2
```

## Source Asset
```sql
SELECT ... FROM assets WHERE id = $1 AND project_id = $2
```

## Reservation Check
```sql
SELECT ... FROM publishing_quota_reservations WHERE publishing_job_id = $1 AND status = 'reserved'
```
(Job is already project-scoped by claim)

## Success Settlement
```sql
SELECT status FROM publishing_jobs WHERE id = $1 FOR UPDATE
-- (jobId validated at claim with project_id)
UPDATE publishing_quota_reservations WHERE publishing_job_id = $1 AND status = 'reserved'
INSERT INTO publishing_usage_records (project_id, ...) VALUES ($1, ...)
```

## Failure Settlement
```sql
SELECT status FROM publishing_jobs WHERE id = $1 FOR UPDATE
UPDATE publishing_quota_reservations WHERE publishing_job_id = $1 AND status = 'reserved'
```

All lookups and mutations are project-scoped either directly (AND project_id=$2) or transitively (via job claimed with project_id).
