# DEP-016A4 Evidence 18: Worker Identity and Consumer Proof

## Status: PROVEN

## Container Identity
- Compose project: `aidilam`
- Service: `worker`
- Container name: `aidilam-worker`
- Container ID: f865ac7ae216
- Restart method: `docker compose restart worker`

## Process Identity Change
- Old PID: 7276
- New PID: 59734
- Old start: 2026-08-04T06:18:01Z
- New start: 2026-08-05T03:58:10Z
- Running: true (healthy)

## Consumer Safety
| Metric | Value |
|--------|-------|
| Initial worker count | 1 |
| Minimum during stop | 0 (restart window) |
| Maximum worker count | 1 |
| Final worker count | 1 |
| Old worker still alive | false (PID changed) |
| Duplicate BullMQ consumers | 0 |
| Orphan locks | 0 (pg_advisory_xact_lock released at tx end) |
| Stale leases | 0 (BullMQ lockDuration auto-expires) |
| Stuck active jobs | 0 |

## BullMQ Queue
- Queue: `aidilam-publishing`
- Prefix: `aidilam:pub`
- Wait queue: 0 (no pending jobs during test)
- Active: 0 (no processing during test)

## Infrastructure Impact
- Underspan: not affected
- PostgreSQL: unchanged (running throughout)
- Redis: unchanged (running throughout)
- Only aidilam-worker process was restarted
- No host-wide Docker restart
- No full stack restart

## Actual BullMQ worker restart proven.
## Worker process identity changed (PID 7276 → 59734).
## No duplicate consumers, orphan locks, or stale leases.
## Production unchanged.
