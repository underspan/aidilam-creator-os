# AIĐiLàm Port Registry

| Port | Service | Binding | Status | Notes |
|------|---------|---------|--------|-------|
| 18080 | Foundation canary | 127.0.0.1 | Reserved | Localhost only, validation |
| 3000 | AIĐiLàm Web (Next.js) | TBD | Planned | Public application |
| 5432 | PostgreSQL | internal | Planned | Never publish to 0.0.0.0 |
| 6379 | Redis | internal | Planned | Never publish to 0.0.0.0 |
| 6333 | Qdrant | internal | Planned | Never publish to 0.0.0.0 |
| 9000 | MinIO API | internal | Planned | Never publish to 0.0.0.0 |
| 9001 | MinIO Console | 127.0.0.1 | Planned | Admin-restricted |
| 8080 | Internal service | TBD | Reserved | Optional future use |

## Rules

- Database ports (5432, 6379, 6333, 9000) must NOT be published to `0.0.0.0`
- Public application ports require explicit firewall review before exposure
- Port 4321 is RESERVED for Underspan — never bind to it
- Port collisions must fail closed (check with `ss -lnt` before binding)
- All non-public ports bind to `127.0.0.1` only

## Protected Ports (DO NOT USE)

| Port | Owner | Reason |
|------|-------|--------|
| 4321 | Underspan | Active Astro dev server |
| 22 | Host SSH | Infrastructure |
| 3389 | Host xRDP | Infrastructure |
| 2049 | NFS | Infrastructure |
