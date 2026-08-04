# DEP-015D1 Migration & Deployment

## Migration 019
- NOT REQUIRED
- Existing schema sufficient (attempts, usage records, reservations)

## Deployment
- Services: aidilam-app + aidilam-worker
- Authorization: I_CONFIRM_DEPLOY_AIDILAM_PUBLISHING_WORKER_CORE
- Result: both healthy after rebuild

## Files Changed
- apps/worker/src/jobs/publishing-worker.ts (new: 521 lines)
- apps/worker/src/index.ts (added publishing worker + scheduler startup/shutdown)
- apps/api/src/modules/publishing/services/enqueue.ts (new: 64 lines)
- apps/api/src/modules/publishing/api/job-routes.ts (added enqueue calls)
- ops/compose/compose.yaml (validation mode toggle)
