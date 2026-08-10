# Publishing Incident Response

## Severity Levels

### SEV-1 (Critical)
- Cross-project publishing (data leaked to wrong project)
- Credential leakage in logs/API/queue
- Duplicate external publishing (same content published twice)
- Widespread false-success settlement (usage/billing incorrect)

### SEV-2 (High)
- Queue processing completely stopped
- High failure rate (>20% for >10min)
- Recovery loop (same job repeatedly recovered)
- Reservation leak (active reservation with terminal job)
- Platform-wide adapter failure

### SEV-3 (Normal)
- Individual job failure
- Individual credential issue
- Single destination configuration issue
- Transient retry exhaustion

## Containment

### SEV-1
1. **Immediately**: Stop publishing worker (`docker compose stop worker`)
2. Capture evidence (logs, DB state, audit events)
3. Assess blast radius (which projects/jobs affected)
4. Notify stakeholders

### SEV-2
1. Check worker health and logs
2. Check Redis/Postgres connectivity
3. If recovery loop: pause scheduler, investigate root cause
4. If adapter failure: check platform status

### SEV-3
1. Check job error_code and error_message_safe
2. Check attempt history
3. Verify credential/destination configuration

## Evidence Capture
```bash
# Job state
SELECT * FROM aidilam_app.publishing_jobs WHERE id='<job_id>';
SELECT * FROM aidilam_app.publishing_attempts WHERE publishing_job_id='<job_id>';
SELECT * FROM aidilam_app.publishing_audit_events WHERE publishing_job_id='<job_id>';

# Worker logs
docker logs aidilam-worker --since 10m 2>&1 | grep -i "error\|fail\|publish"

# Queue state
docker exec aidilam-redis redis-cli -a $PW keys 'aidilam:queue:*' | wc -l
```

## Safe Worker Drain
```bash
# Graceful: let current jobs finish
docker compose stop worker  # sends SIGTERM, grace period applies

# Verify drain complete
SELECT count(*) FROM aidilam_app.publishing_attempts WHERE status='running';
```

## Recovery After Incident
1. Fix root cause
2. Deploy fixed worker
3. Run `reconcileMissingEnqueues()` for any orphaned jobs
4. Verify stale recovery catches any stuck jobs
5. Check audit for duplicate terminal events

## Rollback
1. Stop worker
2. Deploy previous worker image
3. Start worker
4. Verify queue connectivity
5. Run reconciliation

## Post-Incident Verification
```sql
-- No duplicate settlements
SELECT publishing_job_id, count(*) FROM aidilam_app.publishing_audit_events
WHERE event_type='publishing_job_succeeded' GROUP BY publishing_job_id HAVING count(*)>1;

-- No orphan reservations
SELECT r.id FROM aidilam_app.publishing_quota_reservations r
JOIN aidilam_app.publishing_jobs j ON j.id=r.publishing_job_id
WHERE r.status='reserved' AND j.status IN ('succeeded','failed','cancelled');

-- No cross-project contamination
SELECT ae.project_id, j.project_id FROM aidilam_app.publishing_audit_events ae
JOIN aidilam_app.publishing_jobs j ON j.id=ae.publishing_job_id
WHERE ae.project_id != j.project_id;
```
