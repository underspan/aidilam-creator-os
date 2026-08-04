# PostgreSQL Restore Runbook

## Prerequisites

- Backup file exists in `/backup/aidilam/postgres/`
- Verify checksum: `sha256sum -c <backup>.sha256`
- Decide: full restore or selective table restore

## Full Database Restore

```bash
# 1. Stop dependent application services (if running)
# 2. Drop and recreate database
docker exec aidilam-postgres psql -U aidilam_app -d postgres \
  -c "DROP DATABASE IF EXISTS aidilam;"
docker exec aidilam-postgres psql -U aidilam_app -d postgres \
  -c "CREATE DATABASE aidilam OWNER aidilam_app;"

# 3. Restore from custom format dump
docker exec -i aidilam-postgres pg_restore -U aidilam_app -d aidilam \
  < /backup/aidilam/postgres/<backup_file>

# 4. Verify
docker exec aidilam-postgres psql -U aidilam_app -d aidilam \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
```

## Point-in-Time Considerations

WAL archiving is not configured in the foundation. For PITR, configure `archive_mode` and `archive_command` in a later task.

## Emergency Notes

- Never restore over a running production database without a fresh backup first
- Always verify the backup checksum before restore
- Document the restore in evidence after completion
