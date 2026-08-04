# 18 — Final Result

## Task: AIDILAM-DEP-004
## Date: 2026-07-24T13:18+07:00
## Result: PASS WITH CONDITIONS

---

| # | Field | Value |
|---|-------|-------|
| 1 | Task ID | AIDILAM-DEP-004 |
| 2 | Final result | **PASS WITH CONDITIONS** |
| 3 | Host | s4prddbttf01.truongthanh.com |
| 4 | Compose project | aidilam |
| 5 | App image | aidilam-app:0.1.0 |
| 6 | App image ID | sha256:b33f0355a4e3 (rebuilt with Qdrant fix) |
| 7 | Node version | 22.16.0 |
| 8 | Framework | Fastify 5.3.3 |
| 9 | App container | aidilam-app |
| 10 | Container user | appuser (non-root) |
| 11 | Internal port | 3000 (expose only) |
| 12 | Host port status | **NOT LISTENING** ✅ |
| 13 | Network | aidilam-internal |
| 14 | Network members | postgres, redis, qdrant, minio, app (5) |
| 15 | Liveness result | **200 OK** ✅ |
| 16 | Readiness result | **200 OK** ✅ |
| 17 | Deep-health result | **200 OK** (all deps ok) ✅ |
| 18 | PostgreSQL runtime role | aidilam_runtime |
| 19 | PostgreSQL privilege status | NOSUPERUSER, NOCREATEDB, schema aidilam_app only |
| 20 | PostgreSQL integration | **PASS** (CRUD in aidilam_app schema) ✅ |
| 21 | Redis runtime identity | Shared password (ACL deferred) |
| 22 | Redis integration | **PASS** (authenticated SET/GET/DEL) ✅ |
| 23 | Qdrant runtime-key status | Shared API key (v1.13.6 single-key only) |
| 24 | Qdrant integration | **PASS** (authenticated vector ops) ✅ |
| 25 | MinIO runtime user | aidilam_runtime_key01 |
| 26 | MinIO policy scope | aidilam-private bucket only (Get/Put/Delete/List) |
| 27 | MinIO bucket | aidilam-private |
| 28 | MinIO integration | **PASS** (restricted user object ops) ✅ |
| 29 | Temp-resource cleanup | **PASS** (all removed) ✅ |
| 30 | Privileged | **FALSE** ✅ |
| 31 | Docker socket | **NOT MOUNTED** ✅ |
| 32 | Host-network | **FALSE** ✅ |
| 33 | Root filesystem | **READ-ONLY** ✅ |
| 34 | Runtime UID | appuser (non-root) |
| 35 | Capabilities | ALL dropped ✅ |
| 36 | PIDs limit | 256 ✅ |
| 37 | CPU limit | 2.0 cores |
| 38 | Memory limit | 2 GB |
| 39 | Logging rotation | json-file, 25m, 5 files ✅ |
| 40 | App restart result | **PASS** (recovered, deep health OK) ✅ |
| 41 | PostgreSQL ID before/after | 8abb5385 / 8abb5385 (unchanged) ✅ |
| 42 | Redis ID before/after | 7468421165 / 7468421165 (unchanged) ✅ |
| 43 | Qdrant ID before/after | fa68eb0b / fa68eb0b (unchanged) ✅ |
| 44 | MinIO ID before/after | 632f6b95 / 632f6b95 (unchanged) ✅ |
| 45 | Infrastructure RC changes | 0 (none restarted) ✅ |
| 46 | Kiro restart before/after | 0 / 0 ✅ |
| 47 | Underspan HTTP before/after | 200 / 200 ✅ |
| 48 | Underspan impact | **NONE** |
| 49 | Host listener status | No AIĐiLàm ports on host |
| 50 | Root filesystem before/after | 55G / 55G |
| 51 | Data filesystem | 80M / 600G (1%) |
| 52 | Backup filesystem | 33M / 200G |
| 53 | NEMO OS impact | **NONE** |
| 54 | Runtime changes | +1 app container |
| 55 | Host changes | None |
| 56 | Docker changes | +1 container, +1 image |
| 57 | Secrets exposed | **NONE** |
| 58 | Files created | apps/api/ (full source), secrets (3 runtime) |
| 59 | Files updated | ops/compose/compose.yaml |
| 60 | Commit status | **NOT PERFORMED** |
| 61 | Push status | **NOT PERFORMED** |
| 62 | Conditions remaining | See below |
| 63 | Deployment readiness | **READY** for domain layer |
| 64 | Recommended next task | **AIDILAM-DEP-005** |

---

## Conditions Remaining

1. Redis ACL user separation deferred (shared password)
2. Qdrant per-client API key unsupported in v1.13.6 (shared key)
3. Root SSH access accepted per architecture decision
4. Legacy kernel warnings (swap limit, memory overcommit)
5. Public reverse proxy not yet configured
6. Restore tests pending
7. Qdrant warning: "Api key is used with unsecure connection" (internal bridge, accepted)

## Application Runtime Stats

| Container | CPU | Memory | PIDs |
|-----------|-----|--------|------|
| aidilam-app | 0.02% | 45.5 MiB / 2 GiB | 11 |
| aidilam-postgres | 0.00% | 116.5 MiB / 12 GiB | 7 |
| aidilam-redis | 0.38% | 10.2 MiB / 6 GiB | 6 |
| aidilam-qdrant | 0.03% | 115.2 MiB / 12 GiB | 24 |
| aidilam-minio | 0.00% | 116.6 MiB / 8 GiB | 33 |

## Recommended Next Task

```
AIDILAM-DEP-005
Create internal API foundation, database migration framework and domain skeleton
```
