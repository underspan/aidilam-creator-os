# DEP-015D1 Live Scheduler

## Setup
- Created scheduled job (far future: 2026-08-10)
- Status: scheduled
- BullMQ items: 0

## Promotion
- Shifted scheduled_at to past (now - 1 minute)
- Scheduler cycle ran within 12s
- Job promoted: scheduled → queued
- Audit: publishing_scheduled_job_promoted
- BullMQ item created

## Worker Execution
- Terminal: succeeded
- Attempt: 1
- Usage: 1
- Reservation: committed
