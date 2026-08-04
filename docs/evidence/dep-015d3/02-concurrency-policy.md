# DEP-015D3 Concurrency Policy
- PUBLISHING_GLOBAL_CONCURRENCY: 2
- PUBLISHING_PROJECT_CONCURRENCY: 3
- PUBLISHING_WORKER_CONCURRENCY: 2
- DB-backed admission: count active publishing jobs at claim time
- If over limit: requeue with 2s delay
- No in-memory-only semaphore
