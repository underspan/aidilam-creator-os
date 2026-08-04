# DEP-015E Monitoring and Alerting

## Metrics (available via DB queries + BullMQ inspection)
| Metric | Source | Alert |
|--------|--------|-------|
| Queue depth (waiting) | BullMQ | P2: >50 for 5min |
| Oldest queued age | DB: min(created_at) WHERE status='queued' | P1: >30min |
| Active publishing | DB: count WHERE status='publishing' | Info |
| Retry_wait jobs | DB: count WHERE status='retry_wait' | P2: >20 for 15min |
| Stale publishing | DB: WHERE status='publishing' AND updated_at < now()-120s | P1: >0 |
| Cancel backlog | DB: WHERE status='cancel_requested' AND cancel_requested_at < now()-60s | P2: >0 |
| Permanent failures (rate) | DB: failed jobs per hour | P2: >10/hr |
| Repeated transients | DB: attempts with retryable_failed > 3 | P3: >5 |
| Worker heartbeat | Worker health endpoint :3001 | P0: unhealthy >30s |
| Worker restarts | Docker inspect restart count | P1: >2 in 1hr |
| Redis connectivity | Worker startup + periodic | P0: disconnected |
| PostgreSQL connectivity | Worker startup + periodic | P0: disconnected |
| Reservation leakage | DB: reserved for >2hr without publishing | P2: >0 |

## Alert Severities
- P0: Service down, immediate response (5min SLA)
- P1: Degraded, response within 30min
- P2: Warning, response within 4hr
- P3: Advisory, next business day
