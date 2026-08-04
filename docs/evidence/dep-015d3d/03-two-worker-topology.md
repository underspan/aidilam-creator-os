# DEP-015D3D Two-Worker Topology
- Worker A: aidilam-worker (Compose service)
- Worker B: aidilam-worker-2 (docker run, same network, same config)
- Both share: PostgreSQL, Redis, aidilam-publishing queue
- BullMQ concurrency: 1 per worker (2 total)
- DB global limit: 3
