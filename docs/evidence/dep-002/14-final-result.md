# 14 — Final Result

## Task: AIDILAM-DEP-002
## Date: 2026-07-24T12:33+07:00
## Result: PASS WITH CONDITIONS

---

| # | Field | Value |
|---|-------|-------|
| 1 | Task ID | AIDILAM-DEP-002 |
| 2 | Final result | **PASS WITH CONDITIONS** |
| 3 | Host | s4prddbttf01.truongthanh.com |
| 4 | Compose project | aidilam |
| 5 | PostgreSQL image | postgres:16.9-bookworm |
| 6 | PostgreSQL digest | sha256:00d06ace1e0b51d5ef8170bbc38557092c83253c9f21ad68a85a49d46c825ce0 |
| 7 | PostgreSQL container | aidilam-postgres |
| 8 | PostgreSQL version | 16.9 (Debian 16.9-1.pgdg120+1) |
| 9 | PostgreSQL database | aidilam |
| 10 | PostgreSQL app user | aidilam_app |
| 11 | PostgreSQL data path | /data/aidilam/postgres |
| 12 | PostgreSQL backup path | /backup/aidilam/postgres |
| 13 | PostgreSQL health | **healthy** ✅ |
| 14 | PostgreSQL functional test | **PASS** (CRUD verified) |
| 15 | PostgreSQL persistence test | **PASS** (survived restart) |
| 16 | PostgreSQL backup result | **PASS** (870 bytes, checksum verified) |
| 17 | Redis image | redis:7.4.4-bookworm |
| 18 | Redis digest | sha256:17c1c1b96fd1685968790c7fcab311e5bc49c809efe9744af262640a559c4cf2 |
| 19 | Redis container | aidilam-redis |
| 20 | Redis version | 7.4.4 |
| 21 | Redis data path | /data/aidilam/redis |
| 22 | Redis backup path | /backup/aidilam/redis |
| 23 | Redis health | **healthy** ✅ |
| 24 | Redis unauthenticated test | **DENIED** (NOAUTH) ✅ |
| 25 | Redis authenticated test | **PONG** ✅ |
| 26 | Redis persistence test | **PASS** (AOF + RDB) |
| 27 | Redis backup result | **PASS** (BGSAVE, dump.rdb created) |
| 28 | Host port 5432 status | **NOT LISTENING** ✅ |
| 29 | Host port 6379 status | **NOT LISTENING** ✅ |
| 30 | Network | aidilam-internal (bridge) |
| 31 | Network members | aidilam-postgres, aidilam-redis |
| 32 | Privileged status | **FALSE** ✅ |
| 33 | Docker socket status | **NOT MOUNTED** ✅ |
| 34 | Host-network status | **FALSE** ✅ |
| 35 | Underspan mount status | **NONE** ✅ |
| 36 | PostgreSQL CPU limit | 4.0 cores |
| 37 | PostgreSQL memory limit | 12 GB |
| 38 | Redis CPU limit | 2.0 cores |
| 39 | Redis memory limit | 6 GB |
| 40 | Logging rotation | json-file with max-size/max-file ✅ |
| 41 | Secrets status | File-based, 600 permissions, not in compose |
| 42 | Root filesystem before | 56G free |
| 43 | Root filesystem after | 56G free |
| 44 | Data filesystem usage | 81M / 600G (1%) |
| 45 | Backup filesystem usage | 33M / 200G (1%) |
| 46 | Kiro restart count before | 0 |
| 47 | Kiro restart count after | **0** ✅ |
| 48 | Underspan port before | LISTENING (4321) |
| 49 | Underspan port after | **LISTENING (4321)** ✅ |
| 50 | Underspan HTTP before | 200 OK |
| 51 | Underspan HTTP after | **200 OK** ✅ |
| 52 | Underspan impact | **NONE** |
| 53 | NEMO OS impact | **NONE** |
| 54 | Runtime changes | PostgreSQL + Redis deployed |
| 55 | Host changes | Directory permissions (redis data) |
| 56 | Docker changes | 2 containers + 1 network + 2 images added |
| 57 | Secrets exposed | **NONE** |
| 58 | Files created | See below |
| 59 | Files updated | compose.yaml, .gitignore |
| 60 | Commit status | **NOT PERFORMED** |
| 61 | Push status | **NOT PERFORMED** |
| 62 | Conditions remaining | See below |
| 63 | Deployment readiness | **READY** for next services |
| 64 | Recommended next task | **AIDILAM-DEP-003 — Deploy isolated Qdrant and MinIO foundation** |

---

## Conditions Remaining

1. Root SSH access (rather than dedicated ops user) — accepted per ARCH-003
2. Legacy kernel warnings: no swap limit, memory overcommit (informational)
3. Redis data dir requires 775 permissions for entrypoint user-switching
4. Restore testing deferred to a separate task
5. Dedicated application role hardening (restrict beyond aidilam_app) — future

## Files Created

- /opt/aidilam/config/image-version-policy.md
- /opt/aidilam/config/postgres/postgresql.conf
- /opt/aidilam/config/postgres/pg_hba.conf
- /opt/aidilam/config/redis/redis.conf
- /opt/aidilam/secrets/postgres_password
- /opt/aidilam/secrets/redis_password
- /opt/aidilam/ops/backup/postgres-backup.sh
- /opt/aidilam/ops/backup/redis-backup.sh
- /opt/aidilam/docs/runbooks/postgres-restore.md
- /opt/aidilam/docs/runbooks/redis-restore.md
- /opt/aidilam/docs/evidence/dep-002/14-final-result.md

## Resource Usage (post-deployment)

| Container | CPU | Memory | PIDs |
|-----------|-----|--------|------|
| aidilam-postgres | 0.06% | 114.6 MiB / 12 GiB | 6 |
| aidilam-redis | 0.27% | 10.3 MiB / 6 GiB | 6 |
| kiro | 61.36% | 8.7 GiB / 251.8 GiB | 1435 |
