# 24. Risk Register — Sổ Đăng Ký Rủi Ro

## Metadata

| Trường | Giá trị |
|--------|---------|
| Document ID | `AIDILAM-VOL01-024` |
| Version | `1.0.0` |
| Status | `ACTIVE` |
| Created | `2026-07-23` |
| Last Updated | `2026-07-23` |
| Owner | `Infrastructure Team` |
| Classification | `INTERNAL` |

---

## 1. Mục Đích

Tài liệu này ghi nhận toàn bộ các rủi ro (risk) đã được nhận diện trong quá trình triển khai hệ thống AIĐILÀM. Mỗi rủi ro được đánh giá theo xác suất xảy ra (Probability), mức độ ảnh hưởng (Impact), và được phân loại theo mức độ nghiêm trọng (Classification). Sổ đăng ký rủi ro được cập nhật liên tục trong suốt vòng đời dự án.

---

## 2. Phương Pháp Đánh Giá

### 2.1 Probability (Xác suất xảy ra)

| Mức | Ký hiệu | Mô tả |
|-----|----------|--------|
| High | H | Xác suất xảy ra > 70%, gần như chắc chắn sẽ xảy ra |
| Medium | M | Xác suất xảy ra 30-70%, có khả năng xảy ra |
| Low | L | Xác suất xảy ra < 30%, ít có khả năng xảy ra |

### 2.2 Impact (Mức độ ảnh hưởng)

| Mức | Ký hiệu | Mô tả |
|-----|----------|--------|
| High | H | Gây gián đoạn nghiêm trọng, mất dữ liệu, hoặc hệ thống ngừng hoạt động |
| Medium | M | Gây giảm hiệu năng hoặc ảnh hưởng một phần chức năng |
| Low | L | Ảnh hưởng nhỏ, có thể xử lý mà không gián đoạn dịch vụ |

### 2.3 Classification (Phân loại mức độ nghiêm trọng)

| Phân loại | Điều kiện | Hành động yêu cầu |
|-----------|-----------|-------------------|
| BLOCKER | Probability=H AND Impact=H | Phải giải quyết ngay lập tức trước khi tiếp tục |
| HIGH | Probability=H OR Impact=H | Cần giải quyết trong sprint hiện tại |
| MEDIUM | Probability=M AND Impact=M | Lên kế hoạch giải quyết trong 2-3 sprint tới |
| LOW | Probability=L AND Impact=L | Theo dõi, xử lý khi có thời gian |

---

## 3. Risk Register Table

| ID | Risk | Probability | Impact | Classification | Mitigation | Owner | Status |
|----|------|-------------|--------|----------------|------------|-------|--------|
| RSK-001 | **Kernel Compatibility** — Kernel version hiện tại (5.4.x) có thể không tương thích với một số module cần thiết cho container runtime hoặc overlay filesystem | M | H | HIGH | Kiểm tra kernel compatibility matrix trước khi cài đặt. Chuẩn bị kernel fallback image. Duy trì danh sách kernel modules bắt buộc và kiểm tra tự động bằng script trong CI/CD | Infrastructure Lead | OPEN |
| RSK-002 | **No GPU Available** — Server hiện tại không có GPU, giới hạn khả năng chạy inference models local hoặc xử lý video/audio bằng hardware acceleration | H | M | HIGH | Thiết kế architecture theo hướng CPU-first. Sử dụng quantized models (GGUF format) tối ưu cho CPU. Offload heavy workload sang cloud GPU khi cần thiết. Benchmark hiệu năng CPU inference trước khi commit vào pipeline | ML Engineer | OPEN |
| RSK-003 | **Disk Exhaustion** — Dung lượng disk có thể cạn kiệt do log files, container images, model weights, và temporary files tích lũy theo thời gian | H | H | BLOCKER | Triển khai disk monitoring với alerting tại ngưỡng 80%. Cấu hình log rotation (logrotate + Docker log driver max-size). Scheduled cleanup job cho /tmp và unused Docker images. Thiết lập quotas cho từng service | Infrastructure Lead | IN_PROGRESS |
| RSK-004 | **SAN Not Mounted** — Storage Area Network (SAN) chưa được mount hoặc mất kết nối, dẫn đến thiếu persistent storage cho dữ liệu quan trọng | M | H | HIGH | Implement health check cho mount point trong startup scripts. Cấu hình auto-mount trong /etc/fstab với nofail option. Alert khi mount point không available. Có fallback storage path trên local disk | Infrastructure Lead | OPEN |
| RSK-005 | **Docker Access Unavailable** — Docker daemon không khả dụng hoặc user không có quyền truy cập Docker socket, chặn toàn bộ container deployment | M | H | HIGH | Đảm bảo user nằm trong docker group. Cấu hình Docker daemon với restart policy always. Implement systemd watchdog cho Docker service. Có Podman backup option nếu Docker hoàn toàn không khả dụng | DevOps Engineer | OPEN |
| RSK-006 | **FFmpeg Temp Growth** — FFmpeg tạo temporary files lớn trong quá trình transcoding, có thể nhanh chóng chiếm hết disk space, đặc biệt với video 4K hoặc batch processing | H | M | HIGH | Đặt FFmpeg temp directory vào partition riêng biệt. Implement job-level disk quota. Monitor temp directory size real-time. Auto-cleanup sau mỗi job hoàn thành. Set ulimit cho process FFmpeg | ML Engineer | OPEN |
| RSK-007 | **Session Token Leakage** — Token xác thực (JWT, API keys) có thể bị lộ qua logs, environment variables exposed, hoặc insecure storage | L | H | HIGH | Không log sensitive data (mask tokens trong log output). Sử dụng secret management (Docker secrets hoặc file-based). Rotate tokens định kỳ. Implement token revocation mechanism. Audit access logs | Security Lead | OPEN |
| RSK-008 | **Platform ToS Violation** — Vi phạm Terms of Service của các platform (OpenAI, Anthropic, Google) do sử dụng sai mục đích hoặc vượt rate limits | M | H | HIGH | Đọc kỹ và document ToS requirements cho từng provider. Implement rate limiting ở application layer. Logging tất cả API calls để audit. Có fallback provider khi một provider bị suspend. Không sử dụng cho prohibited use cases | Project Manager | OPEN |
| RSK-009 | **Model Provider Outage** — Nhà cung cấp model AI (OpenAI, Anthropic, etc.) gặp sự cố ngừng hoạt động, gây gián đoạn toàn bộ AI-dependent workflows | M | M | MEDIUM | Implement circuit breaker pattern cho API calls. Cấu hình multiple providers với automatic failover. Cache responses khi có thể. Có graceful degradation mode khi không có AI provider available. Queue requests để retry | Backend Lead | OPEN |
| RSK-010 | **No Automated Backup Yet** — Chưa có hệ thống backup tự động, rủi ro mất dữ liệu nếu xảy ra hardware failure hoặc human error | H | H | BLOCKER | Ưu tiên triển khai automated backup trong Phase 03. Interim: manual backup script chạy daily. Backup targets: configs, databases, model weights, user data. Test restore procedure định kỳ. Offsite backup copy | Infrastructure Lead | IN_PROGRESS |
| RSK-011 | **Old Kernel Security Patches** — Kernel chưa được cập nhật security patches mới nhất, tạo attack surface cho privilege escalation hoặc container escape | M | H | HIGH | Đánh giá CVE list cho kernel version hiện tại. Lên kế hoạch kernel upgrade với maintenance window. Enable automatic security updates cho userspace packages. Implement additional hardening (AppArmor/SELinux profiles, seccomp) | Security Lead | OPEN |

---

## 4. Rủi Ro Bổ Sung (Đang Theo Dõi)

| ID | Risk | Probability | Impact | Classification | Mitigation | Owner | Status |
|----|------|-------------|--------|----------------|------------|-------|--------|
| RSK-012 | **Network Partition** — Mất kết nối mạng nội bộ giữa các service hoặc mất kết nối Internet | L | M | MEDIUM | Health check endpoints, local caching, offline-capable mode | Infrastructure Lead | MONITORING |
| RSK-013 | **Single Point of Failure** — Toàn bộ hệ thống chạy trên single server, không có redundancy | H | H | BLOCKER | Document disaster recovery plan. Xác định RTO/RPO. Kế hoạch multi-node trong tương lai | Infrastructure Lead | ACCEPTED |
| RSK-014 | **Configuration Drift** — Cấu hình thực tế khác biệt với documented configuration do manual changes | M | M | MEDIUM | Infrastructure as Code (IaC). Git-tracked configs. Periodic compliance checks | DevOps Engineer | OPEN |
| RSK-015 | **Dependency Vulnerability** — Third-party dependencies có known vulnerabilities chưa được patch | M | M | MEDIUM | Automated dependency scanning (Trivy, Snyk). Pin versions. Regular update cycle | Security Lead | OPEN |
| RSK-016 | **Resource Contention** — Nhiều services cạnh tranh CPU/RAM trên cùng một host dẫn đến performance degradation | M | M | MEDIUM | Cgroups resource limits cho containers. Priority-based scheduling. Monitoring resource usage per service | DevOps Engineer | OPEN |

---

## 5. Risk Heatmap

```
         │ Low Impact │ Medium Impact │ High Impact │
─────────┼────────────┼───────────────┼─────────────┤
High Prob│            │ RSK-002,006   │ RSK-003,010 │
         │            │               │ RSK-013     │
─────────┼────────────┼───────────────┼─────────────┤
Med Prob │            │ RSK-009,014   │ RSK-001,004 │
         │            │ RSK-015,016   │ RSK-005,008 │
         │            │               │ RSK-011     │
─────────┼────────────┼───────────────┼─────────────┤
Low Prob │            │ RSK-012       │ RSK-007     │
─────────┼────────────┼───────────────┼─────────────┘
```

---

## 6. Quy Trình Quản Lý Rủi Ro

### 6.1 Nhận diện (Identification)
- Mỗi thành viên team có thể báo cáo rủi ro mới
- Review rủi ro trong mỗi sprint planning
- Tự động phát hiện qua monitoring và alerting

### 6.2 Đánh giá (Assessment)
- Sử dụng ma trận Probability × Impact
- Assign classification dựa trên bảng phân loại ở Section 2.3
- Xác định owner chịu trách nhiệm

### 6.3 Xử lý (Treatment)
- **Avoid**: Thay đổi kế hoạch để tránh rủi ro
- **Mitigate**: Giảm xác suất hoặc impact
- **Transfer**: Chuyển rủi ro cho bên thứ ba (insurance, cloud provider)
- **Accept**: Chấp nhận rủi ro với contingency plan

### 6.4 Theo dõi (Monitoring)
- Dashboard cập nhật real-time
- Review hàng tuần trong team standup
- Escalation tự động khi status thay đổi

---

## 7. Lịch Sử Thay Đổi

| Ngày | Version | Thay đổi | Người thực hiện |
|------|---------|----------|-----------------|
| 2026-07-23 | 1.0.0 | Khởi tạo risk register với 16 risks | Infrastructure Team |

---

## 8. Tài Liệu Liên Quan

- [23_security_baseline.md](./23_security_baseline.md) — Chi tiết security controls
- [25_implementation_roadmap.md](./25_implementation_roadmap.md) — Roadmap triển khai với risk mapping
- [04_constraints.md](./04_constraints.md) — Ràng buộc hệ thống ảnh hưởng đến risk profile

---

---

## 9. Escalation Matrix

| Classification | Thời gian phản hồi | Escalation Path | Quyết định bởi |
|----------------|--------------------|-----------------|--------------------|
| BLOCKER | Ngay lập tức (< 1h) | Owner → Project Lead → Stakeholder | Project Lead |
| HIGH | Trong ngày (< 8h) | Owner → Team Lead | Team Lead |
| MEDIUM | Trong sprint (< 2 tuần) | Owner tự xử lý, báo cáo trong standup | Owner |
| LOW | Khi có thời gian | Ghi nhận trong backlog | Owner |

---

## 10. Risk Acceptance Criteria

Một rủi ro được coi là "ACCEPTED" khi thỏa mãn các điều kiện:

1. Đã được đánh giá đầy đủ bởi ít nhất 2 team members
2. Mitigation plan đã được document và approved
3. Residual risk (rủi ro còn lại sau mitigation) ở mức chấp nhận được
4. Owner đã acknowledge và commit vào monitoring plan
5. Stakeholders đã được thông báo về risk và mitigation approach

---

*Tài liệu này là living document — được cập nhật liên tục khi có rủi ro mới được nhận diện hoặc khi trạng thái rủi ro hiện tại thay đổi.*
