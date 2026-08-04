# DEP-015D1 Success Settlement

## Transaction
- Lock job (FOR UPDATE)
- Lock attempt (FOR UPDATE)
- Verify job=publishing, attempt=running
- Attempt → succeeded
- Job → succeeded (progress=100, stage=completed)
- Reservation → committed
- Create usage record (ON CONFLICT DO NOTHING for idempotency)
- Persist safe external_publish_id + published_url_safe
- Audit: publishing_job_succeeded

## Live Proof
- Job: succeeded
- Attempt: 1, succeeded
- Usage: 1
- Reservation: committed
- External ID: mock-tiktok-video-{uuid}
- URL: mock://tiktok/{uuid}
