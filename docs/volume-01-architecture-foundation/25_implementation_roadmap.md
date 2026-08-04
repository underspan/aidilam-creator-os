# 25. Implementation Roadmap — Lộ Trình Triển Khai

## Metadata

| Trường | Giá trị |
|--------|---------|
| Document ID | `AIDILAM-VOL01-025` |
| Version | `1.0.0` |
| Status | `ACTIVE` |
| Created | `2026-07-23` |
| Last Updated | `2026-07-23` |
| Owner | `Project Lead` |
| Classification | `INTERNAL` |
| Total Phases | `33 (Phase 00 → Phase 32)` |

---

## Tổng Quan

Lộ trình triển khai AIĐILÀM gồm 33 phases liên tục, từ Phase 00 (khởi tạo môi trường) đến Phase 32 (vận hành production ổn định). Mỗi phase có objective rõ ràng, acceptance criteria cụ thể, và rollback plan. Các phase được thiết kế để có thể triển khai tuần tự với minimal risk.

---

## Phase 00 — Environment Bootstrap

- **Objective**: Khởi tạo môi trường server cơ bản, xác nhận hardware và OS readiness
- **Scope**: OS verification, user account setup, basic security hardening, SSH configuration
- **Dependencies**: Physical server access, network connectivity, OS installation complete
- **Deliverables**: Configured user accounts, SSH key-based auth, firewall rules, sudo configuration
- **Acceptance Criteria**: SSH login thành công bằng key, root login disabled, firewall active với minimal ports
- **Risks**: RSK-001 (kernel compatibility), RSK-011 (old kernel patches)
- **Rollback**: Re-image server từ base OS image
- **Excluded Work**: Docker installation, application deployment, monitoring setup

---

## Phase 01 — Disk & Storage Configuration

- **Objective**: Cấu hình storage layout, mount points, và partition scheme cho production workload
- **Scope**: Partition verification, mount point creation, fstab configuration, SAN mount, tmpfs setup
- **Dependencies**: Phase 00 complete, SAN credentials available
- **Deliverables**: Mounted filesystems, verified fstab, disk health check script, storage capacity report
- **Acceptance Criteria**: Tất cả mount points accessible, df -h hiển thị đúng capacity, SAN mounted và writable
- **Risks**: RSK-003 (disk exhaustion), RSK-004 (SAN not mounted)
- **Rollback**: Unmount SAN, revert fstab changes từ backup
- **Excluded Work**: RAID configuration, LVM setup, storage encryption

---

## Phase 02 — Network & Firewall Hardening

- **Objective**: Thiết lập network security layers, firewall rules chi tiết, và network segmentation cơ bản
- **Scope**: iptables/nftables rules, fail2ban, port management, DNS configuration, NTP sync
- **Dependencies**: Phase 00 complete, network topology document
- **Deliverables**: Firewall ruleset, fail2ban config, network documentation, connectivity test results
- **Acceptance Criteria**: Chỉ authorized ports open, fail2ban active, DNS resolution works, time synced
- **Risks**: RSK-012 (network partition)
- **Rollback**: Restore default firewall rules, restart networking service
- **Excluded Work**: VPN setup, load balancer, CDN configuration

---

## Phase 03 — Automated Backup System

- **Objective**: Triển khai hệ thống backup tự động đảm bảo data recovery capability
- **Scope**: Backup scripts, scheduling (cron/systemd timers), retention policy, offsite copy, restore testing
- **Dependencies**: Phase 01 complete (storage available), backup target accessible
- **Deliverables**: Backup scripts, cron jobs, restore documentation, first successful backup + restore test
- **Acceptance Criteria**: Daily backup chạy tự động, retention 30 ngày, restore test thành công < 15 phút
- **Risks**: RSK-010 (no automated backup yet — đang giải quyết trong phase này)
- **Rollback**: Disable cron jobs, manual backup fallback
- **Excluded Work**: Point-in-time recovery, continuous replication, cross-region backup

---

## Phase 04 — Docker Engine Installation

- **Objective**: Cài đặt và cấu hình Docker Engine với security best practices
- **Scope**: Docker CE installation, daemon configuration, user permissions, log driver setup, registry access
- **Dependencies**: Phase 00, Phase 01 (storage cho Docker data root)
- **Deliverables**: Docker running, configured daemon.json, docker-compose installed, smoke test passed
- **Acceptance Criteria**: `docker run hello-world` thành công, log rotation configured, non-root user access
- **Risks**: RSK-005 (Docker access unavailable), RSK-001 (kernel compatibility cho overlay2)
- **Rollback**: `apt remove docker-ce`, cleanup /var/lib/docker
- **Excluded Work**: Kubernetes, Docker Swarm, custom registry deployment

---

## Phase 05 — Container Runtime Security

- **Objective**: Hardening Docker runtime với security profiles và resource constraints
- **Scope**: AppArmor/seccomp profiles, resource limits, read-only filesystems, no-new-privileges, image scanning
- **Dependencies**: Phase 04 complete
- **Deliverables**: Security profiles, docker-compose template với security defaults, Trivy scan integration
- **Acceptance Criteria**: Containers chạy với non-root user, resource limits enforced, no known CVEs in base images
- **Risks**: RSK-007 (token leakage trong container environment)
- **Rollback**: Revert to default Docker security settings
- **Excluded Work**: Runtime security monitoring (Falco), network policies, service mesh

---

## Phase 06 — Base Docker Images Build

- **Objective**: Tạo bộ base images tối ưu cho các service types trong hệ thống
- **Scope**: Multi-stage Dockerfiles, image optimization, layer caching strategy, version tagging
- **Dependencies**: Phase 04, Phase 05 (security requirements)
- **Deliverables**: Base images (python, node, nginx), Dockerfile templates, build scripts, size report
- **Acceptance Criteria**: Images < 200MB mỗi cái, no HIGH/CRITICAL CVEs, build reproducible
- **Risks**: RSK-003 (disk space cho images), RSK-015 (dependency vulnerabilities)
- **Rollback**: Remove custom images, fallback to official images
- **Excluded Work**: Application-specific images, CI/CD pipeline, multi-arch builds

---

## Phase 07 — Monitoring Stack Deployment

- **Objective**: Triển khai monitoring và observability stack cho toàn bộ infrastructure
- **Scope**: Prometheus, Grafana, node_exporter, cAdvisor, alerting rules, dashboards
- **Dependencies**: Phase 04 (Docker), Phase 01 (storage cho metrics data)
- **Deliverables**: Running monitoring stack, dashboards, alert rules, runbook cho common alerts
- **Acceptance Criteria**: Metrics collection active, dashboards accessible, test alert fires correctly
- **Risks**: RSK-003 (disk cho metrics retention), RSK-016 (resource contention)
- **Rollback**: `docker-compose down` monitoring stack
- **Excluded Work**: Log aggregation (Phase 08), tracing, APM

---

## Phase 08 — Centralized Logging

- **Objective**: Thiết lập centralized logging cho tất cả containers và system services
- **Scope**: Log collection, structured logging format, retention policy, search capability
- **Dependencies**: Phase 04 (Docker), Phase 07 (monitoring integration)
- **Deliverables**: Log pipeline running, log rotation configured, search interface available
- **Acceptance Criteria**: Logs từ tất cả containers searchable, retention 14 ngày, no log loss under load
- **Risks**: RSK-003 (log storage growth), RSK-006 (FFmpeg log volume)
- **Rollback**: Revert Docker log driver to json-file default
- **Excluded Work**: Log analytics, ML-based anomaly detection, compliance archival

---

## Phase 09 — Reverse Proxy & TLS

- **Objective**: Triển khai reverse proxy với TLS termination cho tất cả web-facing services
- **Scope**: Nginx/Traefik setup, TLS certificate management, virtual hosts, rate limiting
- **Dependencies**: Phase 04 (Docker), Phase 02 (network/firewall)
- **Deliverables**: Running reverse proxy, TLS certificates, routing configuration, security headers
- **Acceptance Criteria**: HTTPS accessible, A+ SSL Labs rating, automatic cert renewal works
- **Risks**: RSK-012 (network issues affect cert renewal)
- **Rollback**: Remove proxy container, expose services directly (temporary)
- **Excluded Work**: WAF, DDoS protection, geographic routing

---

## Phase 10 — Secret Management

- **Objective**: Triển khai hệ thống quản lý secrets an toàn cho toàn bộ services
- **Scope**: Docker secrets, environment variable management, rotation mechanism, access audit
- **Dependencies**: Phase 04 (Docker), Phase 05 (container security)
- **Deliverables**: Secret store configured, rotation scripts, access policy document, audit log
- **Acceptance Criteria**: No plaintext secrets trong code/configs, rotation test thành công, audit trail active
- **Risks**: RSK-007 (session token leakage)
- **Rollback**: Revert to file-based secrets với restricted permissions
- **Excluded Work**: HashiCorp Vault, AWS KMS, hardware security modules

---

## Phase 11 — Database Deployment

- **Objective**: Triển khai database service cho application data persistence
- **Scope**: PostgreSQL/SQLite deployment, schema initialization, connection pooling, backup integration
- **Dependencies**: Phase 04, Phase 01 (persistent storage), Phase 03 (backup), Phase 10 (secrets)
- **Deliverables**: Running database, initial schema, backup verified, connection pool configured
- **Acceptance Criteria**: Database accessible từ application network, backup/restore tested, performance baseline set
- **Risks**: RSK-003 (data growth), RSK-010 (backup coverage)
- **Rollback**: Stop database container, data preserved on volume
- **Excluded Work**: Replication, clustering, read replicas, sharding

---

## Phase 12 — Application Framework Setup

- **Objective**: Thiết lập application framework cơ bản và project structure
- **Scope**: Project scaffolding, dependency management, configuration system, health endpoints
- **Dependencies**: Phase 04, Phase 11 (database), Phase 10 (secrets)
- **Deliverables**: Running application skeleton, health check endpoint, configuration loaded correctly
- **Acceptance Criteria**: `/health` returns 200, config loaded từ environment, connects to database
- **Risks**: RSK-015 (dependency vulnerabilities)
- **Rollback**: Remove application container, no persistent state at this phase
- **Excluded Work**: Business logic, UI, authentication system

---

## Phase 13 — Authentication & Authorization

- **Objective**: Triển khai hệ thống auth cho user management và API access control
- **Scope**: JWT implementation, session management, RBAC, token refresh, logout/revocation
- **Dependencies**: Phase 12 (app framework), Phase 11 (database), Phase 10 (secrets)
- **Deliverables**: Auth endpoints, token lifecycle, role definitions, security test results
- **Acceptance Criteria**: Login/logout works, token expiry enforced, unauthorized access blocked, no token in logs
- **Risks**: RSK-007 (token leakage), RSK-008 (nếu auth integrates với third-party)
- **Rollback**: Disable auth middleware, revert to open access (dev only)
- **Excluded Work**: OAuth2 providers, SSO, multi-factor authentication

---

## Phase 14 — API Gateway & Rate Limiting

- **Objective**: Thiết lập API gateway với rate limiting và request validation
- **Scope**: Route management, rate limiting per user/endpoint, request/response validation, CORS
- **Dependencies**: Phase 09 (reverse proxy), Phase 12 (app framework), Phase 13 (auth)
- **Deliverables**: API gateway config, rate limit rules, validation schemas, documentation
- **Acceptance Criteria**: Rate limits enforced, invalid requests rejected with proper errors, CORS correct
- **Risks**: RSK-008 (ToS violation nếu rate limits không tương thích provider limits)
- **Rollback**: Remove gateway, direct routing to services
- **Excluded Work**: API versioning strategy, GraphQL, WebSocket gateway

---

## Phase 15 — FFmpeg Integration

- **Objective**: Tích hợp FFmpeg cho media processing capabilities
- **Scope**: FFmpeg container setup, temp directory management, job queue, output validation
- **Dependencies**: Phase 04 (Docker), Phase 01 (storage cho temp files), Phase 07 (monitoring)
- **Deliverables**: FFmpeg container running, job processing pipeline, temp cleanup automation, benchmarks
- **Acceptance Criteria**: Transcoding job completes successfully, temp files cleaned after job, disk usage stable
- **Risks**: RSK-006 (FFmpeg temp growth), RSK-003 (disk exhaustion), RSK-002 (no GPU — CPU-only processing)
- **Rollback**: Stop FFmpeg container, queue jobs for later processing
- **Excluded Work**: Hardware acceleration, streaming, real-time processing

---

## Phase 16 — AI Model Integration — Provider APIs

- **Objective**: Tích hợp external AI model providers (OpenAI, Anthropic, etc.) với failover
- **Scope**: API client setup, provider abstraction layer, retry logic, circuit breaker, cost tracking
- **Dependencies**: Phase 12 (app framework), Phase 10 (secrets for API keys), Phase 14 (rate limiting)
- **Deliverables**: Provider clients, abstraction interface, failover config, cost dashboard
- **Acceptance Criteria**: API calls succeed, failover triggers correctly, costs tracked per request
- **Risks**: RSK-008 (ToS violation), RSK-009 (provider outage), RSK-007 (API key leakage)
- **Rollback**: Disable AI features, return static/cached responses
- **Excluded Work**: Local model deployment, fine-tuning, model training

---

## Phase 17 — AI Model Integration — Local Inference

- **Objective**: Deploy local AI models cho offline capability và cost reduction
- **Scope**: Model download, quantization verification, inference server (llama.cpp/ollama), performance tuning
- **Dependencies**: Phase 04, Phase 01 (storage cho model weights), Phase 02 (no external dependency)
- **Deliverables**: Running inference server, model loaded, benchmark results, memory usage profile
- **Acceptance Criteria**: Inference responds < 5s cho simple queries, RAM usage stable, no OOM kills
- **Risks**: RSK-002 (no GPU — CPU inference only), RSK-003 (model weights disk usage), RSK-016 (resource contention)
- **Rollback**: Stop inference container, fallback to provider APIs (Phase 16)
- **Excluded Work**: GPU inference, model fine-tuning, multiple concurrent models

---

## Phase 18 — Queue & Background Jobs

- **Objective**: Triển khai job queue system cho async processing và scheduled tasks
- **Scope**: Queue service (Redis/BullMQ), worker processes, retry logic, dead letter queue, scheduling
- **Dependencies**: Phase 04, Phase 12 (app framework), Phase 07 (monitoring)
- **Deliverables**: Queue service running, worker containers, job dashboard, retry policies documented
- **Acceptance Criteria**: Jobs processed reliably, retries work, failed jobs in DLQ, monitoring visible
- **Risks**: RSK-003 (queue persistence disk), RSK-016 (worker resource contention)
- **Rollback**: Stop workers, queue preserved, jobs processed when workers restart
- **Excluded Work**: Distributed queue, multi-region, event sourcing

---

## Phase 19 — File Upload & Storage Service

- **Objective**: Service xử lý file upload, storage, và retrieval cho user content
- **Scope**: Upload endpoint, virus scanning, file type validation, storage backend, CDN-ready paths
- **Dependencies**: Phase 01 (storage), Phase 12 (app framework), Phase 13 (auth), Phase 14 (rate limiting)
- **Deliverables**: Upload API, storage service, file metadata database, cleanup policies
- **Acceptance Criteria**: Upload/download works, file size limits enforced, invalid types rejected, storage organized
- **Risks**: RSK-003 (disk exhaustion from uploads), RSK-004 (SAN dependency)
- **Rollback**: Disable upload endpoint, existing files remain accessible
- **Excluded Work**: Image processing pipeline, video streaming, CDN deployment

---

## Phase 20 — Notification System

- **Objective**: Hệ thống notification cho internal alerts và user-facing messages
- **Scope**: Notification service, channels (webhook, email), templates, delivery tracking, preferences
- **Dependencies**: Phase 12 (app framework), Phase 18 (queue for async delivery)
- **Deliverables**: Notification service, channel integrations, template engine, delivery reports
- **Acceptance Criteria**: Notifications delivered reliably, preferences respected, delivery tracked
- **Risks**: RSK-009 (nếu notification depends on external service), RSK-012 (network for delivery)
- **Rollback**: Disable notification service, users check status manually
- **Excluded Work**: Push notifications, SMS, real-time WebSocket notifications

---

## Phase 21 — CI/CD Pipeline

- **Objective**: Automated build, test, và deployment pipeline cho tất cả services
- **Scope**: Build automation, test execution, container image build, deployment scripts, rollback automation
- **Dependencies**: Phase 04 (Docker), Phase 06 (base images), Phase 07 (monitoring for deploy verification)
- **Deliverables**: CI/CD config, build scripts, deployment scripts, rollback scripts, pipeline documentation
- **Acceptance Criteria**: Push-to-deploy works, tests run automatically, failed builds block deploy, rollback < 5 min
- **Risks**: RSK-005 (Docker access for builds), RSK-003 (build artifacts disk usage)
- **Rollback**: Manual deployment process using scripts
- **Excluded Work**: Multi-environment promotion, canary deployments, feature flags

---

## Phase 22 — Integration Testing Suite

- **Objective**: Bộ integration tests kiểm tra toàn bộ system interactions
- **Scope**: API tests, database tests, service-to-service tests, performance baselines, test data management
- **Dependencies**: Phase 21 (CI/CD to run tests), Phase 12-20 (services to test)
- **Deliverables**: Test suite, test fixtures, CI integration, coverage report, performance baselines
- **Acceptance Criteria**: >80% endpoint coverage, tests pass in CI, performance regression detected
- **Risks**: RSK-016 (test environment resource usage)
- **Rollback**: Disable tests in CI (not recommended), fix failing tests
- **Excluded Work**: Load testing, chaos engineering, security penetration testing

---

## Phase 23 — Documentation System

- **Objective**: Hệ thống documentation tự động và searchable cho toàn bộ project
- **Scope**: Doc generation, API docs (OpenAPI), architecture diagrams, runbooks, search index
- **Dependencies**: Phase 12 (app framework for API docs), Phase 21 (CI/CD for auto-generation)
- **Deliverables**: Documentation site, API reference, runbooks, architecture diagrams, search functionality
- **Acceptance Criteria**: Docs generated automatically from code, searchable, up-to-date with latest deploy
- **Risks**: RSK-003 (doc build artifacts)
- **Rollback**: Static docs remain available, disable auto-generation
- **Excluded Work**: User-facing docs, tutorial videos, localization

---

## Phase 24 — Performance Optimization

- **Objective**: Tối ưu hiệu năng system-wide dựa trên production metrics
- **Scope**: Profiling, caching strategy, query optimization, resource tuning, connection pooling
- **Dependencies**: Phase 07 (monitoring data), Phase 22 (performance baselines)
- **Deliverables**: Performance report, optimized configs, caching layer, before/after benchmarks
- **Acceptance Criteria**: Response time p95 < 500ms, resource utilization < 70%, no memory leaks
- **Risks**: RSK-016 (resource contention during profiling), RSK-002 (CPU bottleneck without GPU)
- **Rollback**: Revert config changes, disable caching layer
- **Excluded Work**: CDN, edge computing, horizontal scaling

---

## Phase 25 — Disaster Recovery Testing

- **Objective**: Validate disaster recovery procedures và đo RTO/RPO thực tế
- **Scope**: DR drill execution, backup restore test, failover simulation, documentation update
- **Dependencies**: Phase 03 (backup system), Phase 07 (monitoring), Phase 11 (database)
- **Deliverables**: DR test report, measured RTO/RPO, updated runbooks, identified gaps
- **Acceptance Criteria**: Full restore < 1 hour (RTO), data loss < 24 hours (RPO), runbook accurate
- **Risks**: RSK-010 (backup integrity), RSK-013 (single point of failure)
- **Rollback**: DR testing is non-destructive by design (uses separate environment)
- **Excluded Work**: Automated DR failover, multi-site DR, real production failover

---

## Phase 26 — Security Audit & Hardening

- **Objective**: Comprehensive security audit và remediation cho toàn bộ stack
- **Scope**: Vulnerability scan, penetration test, access review, secrets audit, compliance check
- **Dependencies**: Phase 05 (container security), Phase 10 (secrets), Phase 13 (auth)
- **Deliverables**: Security audit report, remediation actions, hardened configs, compliance checklist
- **Acceptance Criteria**: No CRITICAL/HIGH vulnerabilities open, secrets rotated, access minimized
- **Risks**: RSK-007 (token issues found), RSK-011 (kernel patches needed), RSK-015 (dep vulnerabilities)
- **Rollback**: Security changes are typically additive — rollback specific rule if it breaks functionality
- **Excluded Work**: SOC2 certification, external audit firm, bug bounty program

---

## Phase 27 — User Acceptance Testing

- **Objective**: End-to-end testing với real user workflows để validate functionality
- **Scope**: User workflow testing, UX feedback, bug fixing, performance under real usage patterns
- **Dependencies**: Phase 12-20 (all application services), Phase 22 (test infrastructure)
- **Deliverables**: UAT report, bug list, prioritized fixes, user feedback summary
- **Acceptance Criteria**: Critical user flows work end-to-end, no BLOCKER bugs, performance acceptable
- **Risks**: RSK-009 (provider outage during testing), RSK-002 (performance concerns)
- **Rollback**: Return to previous stable version, address feedback in next iteration
- **Excluded Work**: Public beta, A/B testing, analytics integration

---

## Phase 28 — Capacity Planning

- **Objective**: Phân tích capacity requirements và lập kế hoạch scale cho 6-12 tháng tới
- **Scope**: Usage projections, resource modeling, cost analysis, upgrade recommendations, threshold alerts
- **Dependencies**: Phase 07 (historical metrics), Phase 24 (optimization data)
- **Deliverables**: Capacity plan document, growth projections, budget estimate, upgrade timeline
- **Acceptance Criteria**: Projections based on real data, actionable recommendations, budget approved
- **Risks**: RSK-003 (growth faster than expected), RSK-013 (single server limits)
- **Rollback**: Capacity planning is a planning exercise — no system changes to rollback
- **Excluded Work**: Procurement, multi-server deployment, cloud migration planning

---

## Phase 29 — Operational Runbooks

- **Objective**: Tạo comprehensive runbooks cho mọi operational scenario
- **Scope**: Incident response, common fixes, escalation procedures, maintenance windows, on-call guide
- **Dependencies**: Phase 07 (monitoring alerts to respond to), Phase 25 (DR procedures)
- **Deliverables**: Runbook collection, incident response template, escalation matrix, maintenance checklist
- **Acceptance Criteria**: Runbook cho mỗi alert rule, tested by team member unfamiliar with system
- **Risks**: RSK-014 (config drift makes runbooks outdated)
- **Rollback**: Runbooks are documentation — always additive
- **Excluded Work**: Automated remediation, ChatOps, PagerDuty integration

---

## Phase 30 — Production Go-Live

- **Objective**: Chuyển hệ thống sang trạng thái production với full monitoring và support
- **Scope**: Final checklist, go/no-go decision, production flag enable, monitoring verification, team readiness
- **Dependencies**: Phase 00-29 (all previous phases), Phase 26 (security cleared), Phase 27 (UAT passed)
- **Deliverables**: Go-live checklist completed, production status confirmed, incident channel active
- **Acceptance Criteria**: All critical services running, monitoring active, team on-call, no BLOCKER issues
- **Risks**: All previously identified risks apply — mitigations must be in place
- **Rollback**: Revert to pre-production state, disable public access
- **Excluded Work**: Marketing launch, public announcement, user onboarding

---

## Phase 31 — Post-Launch Stabilization

- **Objective**: Stabilize production environment trong 2 tuần đầu sau go-live
- **Scope**: Bug fixes, performance tuning, alert threshold adjustment, documentation updates
- **Dependencies**: Phase 30 (production running), real production traffic and feedback
- **Deliverables**: Stability report, tuned alerts, fixed bugs, updated documentation, lessons learned
- **Acceptance Criteria**: Uptime > 99%, no CRITICAL incidents, alert noise < 5/day, team confident
- **Risks**: RSK-009 (provider outage under real load), RSK-016 (resource contention at scale)
- **Rollback**: Individual hotfixes can be reverted, overall system remains in production
- **Excluded Work**: New feature development, major refactoring, scale-out architecture

---

## Phase 32 — Continuous Improvement Framework

- **Objective**: Thiết lập quy trình continuous improvement cho long-term maintenance và evolution
- **Scope**: Retrospective process, metrics review cadence, upgrade policy, innovation budget, tech debt tracking
- **Dependencies**: Phase 31 (stable production), team operational maturity
- **Deliverables**: Improvement process document, review schedule, tech debt backlog, upgrade policy
- **Acceptance Criteria**: Monthly review meetings scheduled, tech debt tracked, improvement velocity measurable
- **Risks**: RSK-014 (configuration drift over time), RSK-015 (dependency aging)
- **Rollback**: Continuous improvement is a process — revert to ad-hoc management if process too heavy
- **Excluded Work**: Specific feature roadmap, product strategy, team hiring

---

## Dependency Graph (Tóm tắt)

```
Phase 00 (Bootstrap)
├── Phase 01 (Storage) ──→ Phase 03 (Backup)
├── Phase 02 (Network) ──→ Phase 09 (Proxy/TLS)
└── Phase 04 (Docker)
    ├── Phase 05 (Container Security)
    │   └── Phase 06 (Base Images)
    ├── Phase 07 (Monitoring)
    │   └── Phase 08 (Logging)
    ├── Phase 11 (Database)
    │   └── Phase 12 (App Framework)
    │       ├── Phase 13 (Auth)
    │       ├── Phase 14 (API Gateway)
    │       ├── Phase 15 (FFmpeg)
    │       ├── Phase 16 (AI Providers)
    │       ├── Phase 17 (Local Inference)
    │       ├── Phase 18 (Queue)
    │       ├── Phase 19 (File Storage)
    │       └── Phase 20 (Notifications)
    └── Phase 10 (Secrets)

Phase 21 (CI/CD) ← Phase 04, 06, 07
Phase 22 (Integration Tests) ← Phase 21, 12-20
Phase 23 (Documentation) ← Phase 12, 21
Phase 24 (Performance) ← Phase 07, 22
Phase 25 (DR Testing) ← Phase 03, 07, 11
Phase 26 (Security Audit) ← Phase 05, 10, 13
Phase 27 (UAT) ← Phase 12-20, 22
Phase 28 (Capacity) ← Phase 07, 24
Phase 29 (Runbooks) ← Phase 07, 25
Phase 30 (Go-Live) ← Phase 00-29
Phase 31 (Stabilization) ← Phase 30
Phase 32 (Continuous Improvement) ← Phase 31
```

---

## Timeline Estimate

| Group | Phases | Duration ước tính |
|-------|--------|-------------------|
| Foundation | 00-03 | 1-2 tuần |
| Container Platform | 04-06 | 1 tuần |
| Observability | 07-08 | 1 tuần |
| Infrastructure Services | 09-11 | 1 tuần |
| Application Core | 12-14 | 2 tuần |
| Media & AI | 15-17 | 2-3 tuần |
| Supporting Services | 18-20 | 1-2 tuần |
| Quality & Automation | 21-24 | 2 tuần |
| Hardening & Validation | 25-27 | 2 tuần |
| Operations | 28-32 | 2-3 tuần |
| **TOTAL** | 00-32 | **~15-19 tuần** |

---

## Lịch Sử Thay Đổi

| Ngày | Version | Thay đổi | Người thực hiện |
|------|---------|----------|-----------------|
| 2026-07-23 | 1.0.0 | Khởi tạo roadmap 33 phases | Project Lead |

---

## Tài Liệu Liên Quan

- [24_risk_register.md](./24_risk_register.md) — Risk register với mapping đến phases
- [04_constraints.md](./04_constraints.md) — System constraints ảnh hưởng đến timeline
- [05_decisions.md](./05_decisions.md) — Architecture decisions ảnh hưởng đến phase ordering

---

*Roadmap này là living document — timeline và scope có thể điều chỉnh dựa trên lessons learned từ các phases trước đó.*
