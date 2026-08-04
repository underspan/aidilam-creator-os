# Publishing Emergency Procedures

## Worker Not Processing
- Detection: queue depth increasing, no claimed jobs
- Triage: `docker inspect aidilam-worker` health status
- Action: `docker restart aidilam-worker`
- Verify: jobs start processing within 30s
- Escalate if: restart count >3 in 1hr

## Platform Failing
- Detection: repeated permanent failures for one platform
- Triage: check error_code in publishing_attempts
- Action: set platform status='disabled' in publishing_platforms
- Verify: no new jobs enqueued for disabled platform
- Rollback: re-enable platform after resolution

## Emergency Publishing Disable
- Action: set AIDILAM_VALIDATION_MODE=false + restart worker
- Effect: all mock scenarios return default success; no real adapters exist
- For real adapters (future): disable platform in DB

## Reservation Leakage
- Detection: reserved reservations older than 2hr
- Triage: check if job is stuck in publishing
- Action: run recoverStaleJobs() manually
- Verify: reservation settled (committed/released)

## Rollback
- Action: `docker compose up -d` with previous worker image
- Verify: worker starts healthy
- Run: stale recovery for any in-flight jobs
- Check: no duplicate usage after recovery
