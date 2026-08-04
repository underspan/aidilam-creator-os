# ADR-014: Non-Root Containers

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-014 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Người đề xuất | Security Team |
| Phạm vi | Container Security, Dockerfile Standards, Deployment |

## Status

**Accepted** — Bắt buộc cho tất cả application containers, mọi environment.

## Context

Mặc định Docker containers chạy as root (UID 0). Nếu attacker escape container isolation,
họ có root trên host. Flag `--privileged` còn nguy hiểm hơn — disable seccomp, AppArmor,
và tất cả capability restrictions.

Vấn đề:
- Root trong container = potential root trên host (kernel exploit)
- Nhiều CVEs cho phép container escape khi running as root
- `--privileged` disable hầu hết security features của runtime
- Compliance frameworks (SOC2, ISO 27001) yêu cầu least privilege
- Official images (nginx, redis) mặc định chạy root — tạo bad habit

## Decision

**All application containers run as non-root user (UID 1000+). No --privileged.**

1. Mọi Dockerfile PHẢI có `USER` instruction với UID >= 1000
2. `--privileged` flag bị cấm tuyệt đối trong mọi environment
3. Pod specs bắt buộc `runAsNonRoot: true`, `allowPrivilegeEscalation: false`
4. KHÔNG cấp `CAP_SYS_ADMIN` hoặc dangerous capabilities
5. Base images dùng non-root variants (e.g., `nginx-unprivileged`)
6. OPA/Gatekeeper enforce policy tại admission level

## Alternatives

| Alternative | Lý do từ chối |
|-------------|---------------|
| Root + dropped capabilities | Vẫn UID 0, kernel exploits vẫn effective |
| User namespace remapping | Complexity cao, feature incompatibilities |
| Chỉ enforce production | Dev/prod parity, bugs phát hiện muộn |
| Case-by-case exceptions | Dễ lạm dụng, mỗi exception = security hole |

## Consequences

### Tích cực
- Giảm impact container escape vulnerabilities
- Defense in depth — thêm layer bảo mật
- Compliance CIS Docker Benchmark (Section 4.1)
- Force Dockerfile best practices
- Giảm blast radius khi compromise xảy ra

### Tiêu cực
- Port <1024 cần reconfigure (nginx: 8080 thay vì 80)
- File permissions cần careful management trong Dockerfile
- Build process phức tạp hơn (chown/chmod steps)
- Third-party images cần modification hoặc replacement
- Debug khó hơn với restricted resources

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Permission errors ban đầu | High | Medium | Testing, Dockerfile guidelines |
| Developer frustration | Medium | Medium | Training, pre-built base images |
| Third-party incompatibility | Medium | Low | Internal registry patched images |
| Init container cần root | Medium | Low | Scoped initContainers, specific UID |

## Validation

1. **Build**: Hadolint reject Dockerfile thiếu USER instruction
2. **Registry**: Image scanner verify running user ≠ root
3. **Admission**: OPA reject `runAsUser: 0` hoặc `privileged: true`
4. **Runtime**: `docker run --rm <image> id` → UID ≥ 1000
5. **Audit**: Monthly scan confirm all running containers compliant

## Rollback

Quyết định này **KHÔNG rollback** — đây là security baseline.

### Xử lý edge cases cần elevated privileges:

1. Xác nhận không có alternative nào khác
2. Isolate: dedicated node với taint/toleration
3. Minimize: chỉ grant specific capabilities (KHÔNG `--privileged`)
4. Monitor: enhanced alerting cho container đó
5. Document: separate ADR cho exception

### Dockerfile template chuẩn

```dockerfile
FROM node:20-slim
RUN groupadd -r appuser && useradd -r -g appuser -u 1000 appuser
WORKDIR /app
COPY --chown=appuser:appuser . .
USER appuser
CMD ["node", "server.js"]
```

Infrastructure containers (CNI, storage drivers) nằm ngoài scope — đó là host concerns.

---
*Architecture Decision Record — Dự án AIDiLam*
