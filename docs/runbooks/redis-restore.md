# Redis Restore Runbook

## Prerequisites

- Backup file exists in `/backup/aidilam/redis/`
- Verify checksum: `sha256sum -c <backup>.sha256`

## RDB Restore

```bash
# 1. Stop Redis container
docker compose --project-name aidilam --file /opt/aidilam/ops/compose/compose.yaml stop redis

# 2. Replace data file
cp /backup/aidilam/redis/<backup_file>.rdb /data/aidilam/redis/dump.rdb
chown 999:999 /data/aidilam/redis/dump.rdb

# 3. Start Redis
docker compose --project-name aidilam --file /opt/aidilam/ops/compose/compose.yaml start redis

# 4. Verify
docker exec aidilam-redis redis-cli -a "$(cat /opt/aidilam/secrets/redis_password)" DBSIZE
```

## AOF Restore

```bash
# 1. Stop Redis
# 2. Replace appendonlydir contents from backup tar
tar xzf /backup/aidilam/redis/<backup>.aof.tar.gz -C /data/aidilam/redis/
chown -R 999:999 /data/aidilam/redis/appendonlydir
# 3. Start Redis
```

## Emergency Notes

- Always stop Redis before replacing data files
- Ensure correct ownership (999:999) after copy
- Verify health after restart
