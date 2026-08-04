# ADR-019: Project Isolation — AIĐiLàm Independence

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-019 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Cập nhật | 2026-07-23 (Isolation Amendment — NEMO OS exclusion) |
| Tác giả | Architecture Team |
| Liên quan | ADR-001, ADR-007 |

## Status

**Accepted** — Nguyên tắc isolation bất biến. AIĐiLàm is independent of all other projects.

## Context

Server SUSE hiện tại chứa:
- **AIĐiLàm:** Private-first AI Creator Operating System — video content repurposing
- **Underspan:** Static marketing website (Astro) — separate product, không có running services

Ngoài ra, tồn tại project **NEMO OS** trên một server khác — hoàn toàn ngoài scope của AIĐiLàm.

**Kiro Management Container** trên server này là công cụ quản lý chuyên dụng cho AIĐiLàm. Nó không phải shared development platform và không được mở rộng để quản lý NEMO OS hay bất kỳ project nào khác.

Nguyên tắc: mỗi project phải independent hoàn toàn — không shared resources, credentials, databases, networks, hay operational ownership.

## Decision

**AIĐiLàm là project độc lập.** Hoàn toàn isolated khỏi Underspan, NEMO OS, và bất kỳ project nào khác.

### Isolation Boundaries

1. **Source code:** Separate Git repositories — không monorepo, không shared libraries
2. **Docker Compose:** Separate project name (`aidilam`), separate compose files
3. **Networks:** Separate Docker networks (prefix `aidilam-`) — không cross-project communication
4. **Volumes:** Separate named volumes (prefix `aidilam-`) — không shared data
5. **Databases:** Separate PostgreSQL instance — separate credentials
6. **Cache:** Separate Redis instance — separate credentials
7. **Credentials:** Separate `.env` files, separate secret management, separate API keys
8. **CI/CD:** Separate pipelines, separate deployment schedules
9. **Monitoring:** Separate dashboards, separate alert channels
10. **DNS/Domains:** Separate domains (aidilam.com), separate TLS certificates

### NEMO OS Exclusion

- NEMO OS is hosted on another server — hoàn toàn ngoài scope
- KHÔNG access, inspect, reference as dependency, modify, deploy, hoặc govern NEMO OS
- KHÔNG share source code, secrets, databases, runtime config, Docker resources, networks, volumes, CI/CD, hoặc operational ownership
- Kiro Management Container KHÔNG quản lý NEMO OS

### Kiro Management Container Scope

Allowed:
- `/opt/aidilam` và approved data/backup paths
- Docker resources owned by AIĐiLàm (identifiable via prefix `aidilam-`)
- Documentation, source, builds, releases belonging to AIĐiLàm

Forbidden:
- Managing NEMO OS or unrelated projects
- Expanding into a shared multi-project development platform
- Accessing resources not conclusively identified as AIĐiLàm-owned (default-deny)

## Alternatives

### Alternative 1: Shared Infrastructure với Logical Isolation
- Cùng PostgreSQL server nhưng separate databases; cùng Redis nhưng separate key prefixes
- **Ưu điểm:** Tiết kiệm resources; giảm operational overhead quản lý ít instances hơn
- **Nhược điểm:** Noisy neighbor problem; security boundary yếu; shared failure domain
- **Lý do loại bỏ:** Cost saving minimal so với risk — một project overload ảnh hưởng project khác

### Alternative 2: Monorepo với Module Boundaries
- Single repository với strict module boundaries và separate build targets
- **Ưu điểm:** Shared tooling, easier code sharing, atomic cross-project changes
- **Nhược điểm:** Accidental coupling qua shared dependencies; blurry ownership boundaries
- **Lý do loại bỏ:** Hai products không liên quan business logic — monorepo chỉ tạo temptation để couple

### Alternative 3: Kubernetes Namespace Isolation
- Cùng cluster nhưng separate namespaces với NetworkPolicies
- **Ưu điểm:** Resource efficient; strong isolation via RBAC và network policies
- **Nhược điểm:** Requires Kubernetes expertise; shared control plane still single failure domain
- **Lý do loại bỏ:** Current scale không justify Kubernetes complexity; Docker Compose sufficient

## Consequences

### Tích cực
- **Blast radius containment:** Outage trong AIĐiLàm KHÔNG affect Underspan và ngược lại
- **Independent scaling:** Mỗi project scale theo nhu cầu riêng mà không compete resources
- **Security isolation:** Credential leak ở một project không compromise project khác
- **Team autonomy:** Mỗi team có thể deploy, upgrade, migrate independently
- **Compliance:** Easier để demonstrate data isolation cho different customer bases

### Tiêu cực
- **Resource overhead:** Chạy duplicate infrastructure (2x PostgreSQL, 2x Redis, etc.)
- **Operational burden:** Maintain và monitor hai separate environments
- **No code sharing:** Utility functions hoặc common patterns phải duplicate hoặc publish as package
- **Cost increase:** Estimated 40-60% increase infrastructure cost so với shared approach
- **Knowledge silos:** Team members cần context switch khi work across projects

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Teams accidentally re-introduce shared resources | Trung bình | Cao | CI check verify Docker network isolation; automated audit monthly |
| Cost pressure force resource sharing | Trung bình | Trung bình | Document cost-benefit analysis; escalation path khi budget tight |
| Duplicate effort maintaining similar infrastructure | Cao | Thấp | Shared infrastructure-as-code templates (nhưng separate instances) |
| Drift giữa hai environments complicate team rotation | Thấp | Thấp | Standardize tooling choices; document differences |
| Emergency cần cross-project data access | Thấp | Trung bình | Defined exception process với approval gate và audit trail |

## Validation

Kiểm chứng isolation:
1. **Network test:** Attempt connection từ AIĐiLàm container đến Underspan container → phải fail
2. **Credential test:** AIĐiLàm credentials không thể authenticate vào Underspan databases
3. **CI audit:** Automated weekly check — scan docker-compose files cho shared network/volume references
4. **Failure injection:** Kill toàn bộ Underspan stack → verify AIĐiLàm unaffected (và ngược lại)
5. **Dependency scan:** No shared npm packages published from one project consumed by other
6. **Git audit:** No cross-repository references hoặc git submodules linking two projects

## Rollback

This is a principle-level decision. Rollback requires a new ADR with strong justification.

1. Partial sharing (e.g., shared monitoring/observability stack) may be considered separately
2. Any shared resource proposal requires:
   - Security review
   - Capacity planning
   - SLA definition
   - Incident response plan for cross-project failures
3. NEMO OS exclusion is permanent — không có rollback path cho cross-server integration
4. Underspan isolation is permanent — Underspan has no running services to share

**Estimated rollback time (if ever approved):** 2-4 tuần cho proper migration
**Data loss risk:** Trung bình — requires comprehensive backup trước khi merge
