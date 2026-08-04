# AIĐiLàm Deployment Capacity Plan

*Read-only recommendation*

## Compute

- **CPU:** 8-16 cores recommended (64 available)
- **Memory:** 32-64GB recommended (244GB available)
- **Reserved headroom:** 50% CPU, 100GB RAM for host/SAP/Underspan

## Storage Recommendation

**Option A (immediate):** Use root FS (/opt/aidilam) — 61GB free

**Option B (recommended):** Provision unused 922G SAN LUN for dedicated AIĐiLàm storage
- Create VG: aidilam
- Create LV: data (~800G), backup (~100G)
- Mount: /data/aidilam
- Add to fstab

## Docker Resources

- **Compose project:** aidilam
- **Container prefix:** aidilam-
- **Network:** aidilam-default (bridge, isolated)
- **Volume prefix:** aidilam-

## Service Ports

| Service | Port | Status |
|---------|------|--------|
| Next.js (frontend) | 3000 | FREE |
| PostgreSQL | 5432 | FREE |
| Redis | 6379 | FREE |
| Qdrant | 6333 | FREE |
| MinIO | 9000 | FREE |
| API/Admin | 8080 | FREE |

## Storage per Service

- **PostgreSQL:** 50-200GB (primary database)
- **Redis:** 2-8GB (cache/queues)
- **Qdrant:** 10-50GB (vector search)
- **MinIO:** 200-500GB (media storage)
- **Docker images/layers:** 10-30GB

## Conditions

- 922G SAN LUN provisioning requires host administrator action
- Kernel 4.4.73 is legacy (2017) — monitor for Docker compatibility
- No swap limit support — resource limits rely on memory.max only
- No firewall restrictions — production hardening needed
