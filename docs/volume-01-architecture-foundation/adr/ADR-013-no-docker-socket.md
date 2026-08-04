# ADR-013: No Docker Socket Mounting

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-013 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Người đề xuất | Security Team |
| Phạm vi | Container Security, CI/CD, DevOps |

## Status

**Accepted** — Quyết định bảo mật có hiệu lực ngay, không có ngoại lệ.

## Context

Docker socket (`/var/run/docker.sock`) là Unix socket giao tiếp với Docker daemon.
Mount socket vào container = cấp toàn quyền kiểm soát Docker daemon = root access trên host.

Vấn đề bảo mật:
- Container với Docker socket có thể tạo privileged containers, mount host filesystem
- Attacker compromise container → escape ra host hoàn toàn
- Đây là attack vector phổ biến nhất trong container escape scenarios
- Nhiều CI/CD tools yêu cầu socket mount — tạo thói quen nguy hiểm

Hệ thống AIDiLam chạy AI workloads xử lý untrusted input. Container isolation là critical
để prevent lateral movement khi một container bị compromise.

## Decision

**Docker socket (`/var/run/docker.sock`) is NEVER mounted into application containers.**

1. KHÔNG container nào trong production/staging/dev được mount Docker socket
2. CI/CD pipelines dùng alternative approaches (Kaniko, Buildah)
3. Policy enforce bằng OPA/Gatekeeper admission controller
4. Automated scanning block compose/manifest vi phạm
5. KHÔNG có exception process — quyết định absolute
6. Third-party tools yêu cầu socket mount sẽ KHÔNG được adopt

## Alternatives

| Alternative | Lý do từ chối |
|-------------|---------------|
| Mount với read-only flag (`:ro`) | Socket protocol vẫn cho write, ro flag vô nghĩa |
| Docker socket proxy (Tecnativa) | Vẫn expose attack surface, proxy bypass possible |
| Chỉ cho phép trong CI/CD | CI containers cũng bị compromise, supply chain attacks |
| Docker-in-Docker (dind) | DinD via socket vẫn vi phạm; DinD `--privileged` cũng cấm |

## Consequences

### Tích cực
- Loại bỏ container escape vector phổ biến nhất
- Defense in depth — compromised container không access host
- Compliance CIS Docker Benchmark (Section 5.31)
- Giảm blast radius của security incidents
- Clear boundary giữa containers và host

### Tiêu cực
- Tools như Portainer, Watchtower không dùng được (với socket mode)
- CI/CD cần redesign dùng alternative build methods
- Container monitoring phải dùng external approach
- Team cần training về alternative patterns

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Developer bypass via compose files | Medium | Critical | Git hooks, CI validation, OPA |
| Thiếu tooling cho management | Low | Medium | Kubernetes-native tools, remote API |
| CI/CD build chậm hơn | Medium | Low | Registry caching, BuildKit |
| Third-party tool incompatibility | Medium | Medium | Reject non-compliant tools |

## Validation

1. **Policy**: OPA reject mọi pod spec có Docker socket mount
2. **CI**: Pipeline fail nếu manifests chứa socket mount reference
3. **Runtime**: Falco rules detect attempt access Docker socket
4. **Audit**: Quarterly review confirm zero violations
5. **Code scan**: `grep -r "docker.sock"` expect zero results trong app code

## Rollback

Quyết định này **KHÔNG có rollback**. Đây là security invariant.

Lý do: Không use case hợp lệ nào yêu cầu container access Docker socket.
Mọi functionality đều có alternative an toàn hơn:

| Use Case | Alternative |
|----------|-------------|
| Build images trong CI | Kaniko, Buildah (rootless) |
| Container monitoring | cAdvisor daemonset, Prometheus |
| Auto-restart containers | Kubernetes liveness probes |
| Management UI | Kubernetes Dashboard, Lens |

Nếu tool mới yêu cầu Docker socket → tool đó không được adopt vào hệ thống.

---
*Architecture Decision Record — Dự án AIDiLam*
