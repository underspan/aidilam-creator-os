# 27. Open Questions và Host Validations — Câu Hỏi Mở và Xác Nhận Hạ Tầng

## Metadata

| Field | Value |
|-------|-------|
| Document ID | VOL01-DOC27 |
| Version | 1.0.0 |
| Created | 2026-07-23 |
| Status | DRAFT |
| Owner | Architecture Team |

---

## 27.1 Mục Đích

Tài liệu này ghi nhận hai nhóm items quan trọng cần giải quyết trước khi deployment:
1. **REQUIRES_HOST_VALIDATION** — 8 items phải được xác nhận trực tiếp trên host machine
2. **Open Decisions** — 8 quyết định kiến trúc chưa được finalize

Các items này KHÔNG THỂ được giải quyết chỉ qua documentation — chúng yêu cầu thực thi commands trên host hoặc quyết định từ stakeholders.

---

## SECTION 1: REQUIRES_HOST_VALIDATION

> Các items dưới đây phải được validate trực tiếp trên production host trước khi bắt đầu deployment.

---

### HV-01: Docker Version trên Host

- **Tag**: `REQUIRES_HOST_VALIDATION`
- **Question**: Docker Engine version trên host có đáp ứng minimum requirement (≥ 24.0) không?
- **Impact**: Docker Compose V2 features, BuildKit support, và security patches phụ thuộc vào version. Version cũ có thể thiếu health check improvements và network features cần thiết.
- **Blocking Phase**: Phase 1 — Infrastructure Setup
- **Validation Command**: `docker --version && docker info --format '{{.ServerVersion}}'`
- **Expected Result**: Docker Engine ≥ 24.0, API version ≥ 1.43
- **Proposed Default**: Nếu chưa install, sử dụng Docker CE latest stable từ official repository
- **Decision Owner**: Infrastructure Team
- **Status**: `PENDING`

---

### HV-02: Docker Compose Availability

- **Tag**: `REQUIRES_HOST_VALIDATION`
- **Question**: Docker Compose V2 plugin đã được install và hoạt động chính xác chưa?
- **Impact**: Toàn bộ orchestration strategy phụ thuộc vào Docker Compose. Thiếu Compose V2 sẽ block tất cả service deployment.
- **Blocking Phase**: Phase 1 — Infrastructure Setup
- **Validation Command**: `docker compose version && docker compose config --quiet`
- **Expected Result**: Docker Compose version ≥ 2.20; config validation passes
- **Proposed Default**: Install docker-compose-plugin từ Docker official repository
- **Decision Owner**: Infrastructure Team
- **Status**: `PENDING`

---

### HV-03: SAN Device Availability và Mounting

- **Tag**: `REQUIRES_HOST_VALIDATION`
- **Question**: SAN storage device có available, properly formatted, và mounted tại expected mount point không?
- **Impact**: Tất cả persistent data (database, media, backups) sẽ được lưu trên SAN. Nếu SAN không available, hệ thống không có data persistence.
- **Blocking Phase**: Phase 1 — Infrastructure Setup
- **Validation Command**: `lsblk | grep san && mount | grep /mnt/san && df -h /mnt/san`
- **Expected Result**: SAN device visible, mounted tại `/mnt/san` (hoặc configured path), adequate free space (≥ 500GB)
- **Proposed Default**: Mount point `/mnt/san` với ext4 filesystem, noatime option
- **Decision Owner**: Infrastructure Team / Storage Admin
- **Status**: `PENDING`

---

### HV-04: Kernel Compatibility với Container Images

- **Tag**: `REQUIRES_HOST_VALIDATION`
- **Question**: Linux kernel version có compatible với tất cả container images planned (đặc biệt là AI/ML images yêu cầu specific kernel features) không?
- **Impact**: Một số container images (đặc biệt NVIDIA GPU containers, hoặc images dùng advanced cgroups) yêu cầu kernel ≥ 5.10. Kernel incompatibility sẽ gây crash hoặc performance degradation.
- **Blocking Phase**: Phase 1 — Infrastructure Setup
- **Validation Command**: `uname -r && cat /proc/version && docker run --rm alpine uname -r`
- **Expected Result**: Kernel ≥ 5.10; cgroup v2 enabled; overlay2 storage driver supported
- **Proposed Default**: Ubuntu 22.04 LTS hoặc newer với HWE kernel
- **Decision Owner**: Infrastructure Team
- **Status**: `PENDING`

---

### HV-05: Firewall Rules

- **Tag**: `REQUIRES_HOST_VALIDATION`
- **Question**: Firewall rules có cho phép required traffic (inbound ports 80, 443; outbound API calls) và block unauthorized access không?
- **Impact**: Misconfigured firewall sẽ hoặc block legitimate traffic (service unavailable) hoặc expose internal services (security risk).
- **Blocking Phase**: Phase 2 — Network Configuration
- **Validation Command**: `ufw status verbose` hoặc `iptables -L -n` hoặc `firewall-cmd --list-all`
- **Expected Result**: Port 80 (HTTP), 443 (HTTPS) open inbound; internal ports (5432, 6379, etc.) blocked from external; outbound allowed cho API providers
- **Proposed Default**: UFW với default deny incoming, allow 80/tcp, allow 443/tcp
- **Decision Owner**: Security Team / Infrastructure Team
- **Status**: `PENDING`

---

### HV-06: Available Ports Confirmation

- **Tag**: `REQUIRES_HOST_VALIDATION`
- **Question**: Các ports cần thiết cho hệ thống có đang available (không bị process khác chiếm) không?
- **Impact**: Port conflicts sẽ prevent services từ starting. Đặc biệt quan trọng cho ports: 80, 443, 5432, 6379, 8080, 9090.
- **Blocking Phase**: Phase 2 — Network Configuration
- **Validation Command**: `ss -tlnp | grep -E ':(80|443|5432|6379|8080|9090)\s'`
- **Expected Result**: Không có process nào đang listen trên required ports
- **Proposed Default**: Nếu có conflict, reconfigure conflicting service hoặc change AiDiLam port mapping
- **Decision Owner**: Infrastructure Team
- **Status**: `PENDING`

---

### HV-07: Docker Network Subnet Conflicts

- **Tag**: `REQUIRES_HOST_VALIDATION`
- **Question**: Docker network subnets planned (172.20.0.0/16, 172.21.0.0/16) có conflict với existing network infrastructure trên host không?
- **Impact**: Subnet conflicts sẽ gây routing issues, services không thể communicate, hoặc worse — traffic bị route sai đến production networks khác.
- **Blocking Phase**: Phase 2 — Network Configuration
- **Validation Command**: `ip route show && docker network ls && docker network inspect bridge`
- **Expected Result**: Planned subnets không overlap với any existing routes hoặc Docker networks
- **Proposed Default**: Sử dụng 172.28.0.0/16 range nếu default range conflict
- **Decision Owner**: Network Team / Infrastructure Team
- **Status**: `PENDING`

---

### HV-08: NFS Backup Target Availability

- **Tag**: `REQUIRES_HOST_VALIDATION`
- **Question**: NFS server cho backup storage có accessible từ host, properly mounted, và có đủ capacity không?
- **Impact**: Không có NFS target nghĩa là backups không thể được stored off-host, violating disaster recovery requirements (RPO/RTO).
- **Blocking Phase**: Phase 3 — Backup Configuration
- **Validation Command**: `showmount -e nfs-server-ip && mount | grep nfs && df -h /mnt/backup`
- **Expected Result**: NFS share accessible, mounted tại `/mnt/backup`, available space ≥ 1TB
- **Proposed Default**: Nếu NFS không available, fallback to local secondary disk với rsync to remote scheduled
- **Decision Owner**: Infrastructure Team / Storage Admin
- **Status**: `PENDING`

---

## SECTION 2: OPEN DECISIONS

> Các quyết định kiến trúc dưới đây chưa được finalize và cần input từ stakeholders trước khi implementation.

---

### OD-01: Single-User vs Multi-Tenant từ Day 1

- **Question**: Hệ thống nên được thiết kế cho single-user (chủ sở hữu duy nhất) hay multi-tenant (nhiều users với data isolation) ngay từ đầu?
- **Impact**: Multi-tenant yêu cầu tenant isolation ở database level (schema per tenant hoặc row-level security), phức tạp hơn đáng kể cho authentication, authorization, và data management. Single-user đơn giản hơn nhưng refactor sang multi-tenant sau rất costly.
- **Blocking Phase**: Phase 1 — Database Schema Design
- **Proposed Default**: Single-user với clean separation layers để dễ migrate sang multi-tenant trong future. Sử dụng user_id foreign key pattern ngay từ đầu.
- **Decision Owner**: Product Owner
- **Decision Deadline**: Trước khi bắt đầu database schema implementation
- **Status**: `OPEN`

---

### OD-02: Transcription Approach — Local Whisper CPU vs API

- **Question**: Sử dụng local Whisper model chạy trên CPU (self-hosted) hay gọi external API (OpenAI Whisper API, Google Speech-to-Text)?
- **Impact**: Local Whisper CPU: chậm hơn (10-30x realtime cho large model), không tốn API cost, data privacy tốt hơn. API: nhanh hơn, accurate hơn, nhưng tốn cost per minute và data leaves premises.
- **Blocking Phase**: Phase 2 — AI Pipeline Implementation
- **Proposed Default**: Bắt đầu với local Whisper medium model trên CPU. Nếu performance không chấp nhận được, fallback sang API. Thiết kế interface abstraction để switch dễ dàng.
- **Decision Owner**: Technical Lead / Product Owner
- **Decision Deadline**: Trước Sprint 3
- **Status**: `OPEN`

---

### OD-03: Translation Provider Selection

- **Question**: Sử dụng translation provider nào cho Vietnamese↔English? Options: Google Translate API, DeepL, local MarianMT model, OpenAI GPT-based translation.
- **Impact**: Mỗi provider có trade-offs khác nhau về quality, cost, latency, và data privacy. Local model: free nhưng lower quality cho Vietnamese. Cloud APIs: better quality nhưng ongoing cost.
- **Blocking Phase**: Phase 2 — AI Pipeline Implementation
- **Proposed Default**: Google Translate API cho production quality, với local MarianMT model làm fallback khi API unavailable. Budget cap $50/month cho translation API.
- **Decision Owner**: Product Owner / Technical Lead
- **Decision Deadline**: Trước Sprint 3
- **Status**: `OPEN`

---

### OD-04: TTS Provider Selection

- **Question**: Sử dụng Text-to-Speech provider nào? Options: Google Cloud TTS, Amazon Polly, Azure Cognitive Services, local Coqui TTS, ElevenLabs.
- **Impact**: Vietnamese TTS quality varies significantly giữa providers. Local options (Coqui) có lower quality cho Vietnamese. Cloud providers tốt hơn nhưng expensive cho large volumes.
- **Blocking Phase**: Phase 2 — AI Pipeline Implementation
- **Proposed Default**: Google Cloud TTS (WaveNet voices cho Vietnamese) với cost monitoring. Evaluate Coqui TTS cho offline capability.
- **Decision Owner**: Product Owner
- **Decision Deadline**: Trước Sprint 4
- **Status**: `OPEN`

---

### OD-05: Domain DNS Configuration

- **Question**: Domain name nào sẽ được sử dụng cho production? DNS sẽ được quản lý ở đâu (Cloudflare, Route53, hoặc domain registrar)?
- **Impact**: TLS certificate (Let's Encrypt) yêu cầu valid domain pointing to server. DNS propagation có thể mất 24-48 hours. CDN configuration phụ thuộc vào DNS provider.
- **Blocking Phase**: Phase 2 — TLS và Reverse Proxy Setup
- **Proposed Default**: Sử dụng Cloudflare cho DNS management (free tier), với subdomain `app.aidilam.com`. Cloudflare proxy mode disabled (direct to origin) ban đầu.
- **Decision Owner**: Product Owner / Infrastructure Team
- **Decision Deadline**: Trước khi configure Traefik TLS
- **Status**: `OPEN`

---

### OD-06: GPU Future Availability

- **Question**: Host machine có kế hoạch add GPU (NVIDIA) trong tương lai cho AI workloads không? Nếu có, timeline và model nào?
- **Impact**: GPU availability sẽ thay đổi hoàn toàn approach cho transcription (Whisper large model real-time), TTS (faster inference), và potentially training custom models. Architecture cần prepare cho NVIDIA Container Toolkit.
- **Blocking Phase**: Non-blocking cho Phase 1-2, blocking cho AI performance optimization
- **Proposed Default**: Design architecture GPU-ready (abstract AI inference layer) nhưng implement CPU-only ban đầu. Không invest vào GPU-specific code cho đến khi hardware confirmed.
- **Decision Owner**: Product Owner / Budget Owner
- **Decision Deadline**: Trước Phase 3 optimization
- **Status**: `OPEN`

---

### OD-07: Backup Automation Tool Selection

- **Question**: Sử dụng tool nào cho backup automation? Options: custom bash scripts + cron, Restic, BorgBackup, Velero (nếu migrate K8s), Duplicati.
- **Impact**: Tool selection ảnh hưởng đến: deduplication efficiency, encryption at rest, restore speed, monitoring/alerting capabilities, và maintenance overhead.
- **Blocking Phase**: Phase 3 — Backup Implementation
- **Proposed Default**: Restic với cron scheduling. Lý do: deduplication tốt, encryption built-in, simple CLI, support multiple backends (local, S3, NFS). Custom wrapper script cho monitoring integration.
- **Decision Owner**: Technical Lead / Operations Lead
- **Decision Deadline**: Trước Sprint 5
- **Status**: `OPEN`

---

### OD-08: Monitoring Stack Selection

- **Question**: Sử dụng monitoring stack nào? Options: Prometheus + Grafana, Datadog, Netdata, cAdvisor + custom dashboards, Uptime Kuma (simple).
- **Impact**: Monitoring stack complexity ảnh hưởng resource usage (RAM/CPU overhead), alerting capabilities, learning curve, và long-term maintainability. Over-engineering monitoring cho small system là waste.
- **Blocking Phase**: Phase 3 — Observability Implementation
- **Proposed Default**: Lightweight approach: Uptime Kuma cho uptime monitoring + cAdvisor cho container metrics + Grafana cho visualization. Không deploy full Prometheus stack ban đầu (quá heavy cho single-host).
- **Decision Owner**: Technical Lead
- **Decision Deadline**: Trước Sprint 6
- **Status**: `OPEN`

---

## 27.3 Decision Tracking Matrix

| ID | Decision | Status | Blocking Phase | Deadline | Owner |
|----|----------|--------|---------------|----------|-------|
| OD-01 | Single vs Multi-tenant | OPEN | Phase 1 | Pre-DB schema | Product Owner |
| OD-02 | Transcription approach | OPEN | Phase 2 | Sprint 3 | Tech Lead |
| OD-03 | Translation provider | OPEN | Phase 2 | Sprint 3 | Product Owner |
| OD-04 | TTS provider | OPEN | Phase 2 | Sprint 4 | Product Owner |
| OD-05 | Domain DNS | OPEN | Phase 2 | Pre-TLS | Product Owner |
| OD-06 | GPU availability | OPEN | Phase 3 | Pre-optimization | Budget Owner |
| OD-07 | Backup tool | OPEN | Phase 3 | Sprint 5 | Tech Lead |
| OD-08 | Monitoring stack | OPEN | Phase 3 | Sprint 6 | Tech Lead |

---

## 27.4 Host Validation Checklist (Quick Reference)

| ID | Item | Command | Status |
|----|------|---------|--------|
| HV-01 | Docker version | `docker --version` | PENDING |
| HV-02 | Compose availability | `docker compose version` | PENDING |
| HV-03 | SAN device | `lsblk \| grep san` | PENDING |
| HV-04 | Kernel compatibility | `uname -r` | PENDING |
| HV-05 | Firewall rules | `ufw status` | PENDING |
| HV-06 | Available ports | `ss -tlnp` | PENDING |
| HV-07 | Network subnets | `ip route show` | PENDING |
| HV-08 | NFS backup target | `showmount -e` | PENDING |

---

## 27.5 Quy Trình Giải Quyết

### Cho Host Validations:
1. SSH vào production host
2. Chạy validation command cho từng item
3. Ghi nhận actual result vào cột "Actual"
4. Nếu PASS → update status, proceed
5. Nếu FAIL → create remediation ticket, assign owner

### Cho Open Decisions:
1. Schedule decision meeting với relevant owners
2. Present options với trade-off analysis
3. Document decision rationale
4. Update status từ OPEN → DECIDED
5. Create implementation tickets based on decision

---

## 27.6 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-07-23 | Architecture Team | Initial 8 host validations + 8 open decisions |

---

*Document End — Host Validations: 8 | Open Decisions: 8 | All Status: PENDING/OPEN*
