# 26. Acceptance Criteria — Tiêu Chí Nghiệm Thu

## Metadata

| Field | Value |
|-------|-------|
| Document ID | VOL01-DOC26 |
| Version | 1.0.0 |
| Created | 2026-07-23 |
| Status | DRAFT |
| Owner | Architecture Team |

---

## 26.1 Mục Đích

Tài liệu này định nghĩa **37 acceptance criteria** (tiêu chí nghiệm thu) cho toàn bộ hệ thống AiDiLam. Mỗi tiêu chí bao gồm mô tả chi tiết, phương pháp kiểm chứng (verification method), bằng chứng yêu cầu (evidence required), và trạng thái hiện tại. Tất cả tiêu chí phải đạt trạng thái PASSED trước khi hệ thống được coi là production-ready.

---

## 26.2 Quy Ước Trạng Thái

| Status | Ý Nghĩa |
|--------|----------|
| PENDING | Chưa được kiểm chứng |
| IN_PROGRESS | Đang trong quá trình validation |
| PASSED | Đạt yêu cầu |
| FAILED | Không đạt, cần khắc phục |
| BLOCKED | Bị chặn bởi dependency khác |

---

## 26.3 Danh Sách 37 Acceptance Criteria

### AC-01: Docker Container Orchestration

- **Mô tả**: Tất cả services phải chạy trong Docker containers được quản lý bởi Docker Compose với health checks đầy đủ.
- **Verification Method**: Chạy `docker compose up -d` và xác nhận tất cả containers healthy trong 120 giây.
- **Evidence Required**: Screenshot `docker compose ps` hiển thị tất cả services ở trạng thái "healthy".
- **Status**: `PENDING`

### AC-02: Data Persistence trên SAN Storage

- **Mô tả**: Toàn bộ persistent data (database, media files, configurations) phải được lưu trên SAN storage với proper mount points.
- **Verification Method**: Ghi dữ liệu test, restart containers, xác nhận dữ liệu còn nguyên vẹn.
- **Evidence Required**: Log cho thấy data integrity sau container restart; output của `df -h` hiển thị SAN mount.
- **Status**: `PENDING`

### AC-03: Network Isolation

- **Mô tả**: Các services phải được phân tách trên các Docker networks riêng biệt (frontend, backend, database) theo security zones.
- **Verification Method**: Chạy `docker network inspect` cho từng network và xác nhận container membership.
- **Evidence Required**: Network topology diagram tự động generate từ `docker network ls` và inspect output.
- **Status**: `PENDING`

### AC-04: Reverse Proxy với TLS Termination

- **Mô tả**: Traefik phải handle tất cả incoming traffic với TLS termination và automatic certificate renewal.
- **Verification Method**: Curl HTTPS endpoint, kiểm tra certificate validity và redirect HTTP→HTTPS.
- **Evidence Required**: Output `curl -vI https://domain` hiển thị valid certificate; Traefik dashboard screenshot.
- **Status**: `PENDING`

### AC-05: Database Backup Automation

- **Mô tả**: PostgreSQL database phải được backup tự động hàng ngày với retention policy 30 ngày.
- **Verification Method**: Trigger manual backup, verify file trên NFS target, test restore vào database test.
- **Evidence Required**: Cron job configuration; backup file listing với timestamps; successful restore log.
- **Status**: `PENDING`

### AC-06: Audio Upload và Processing Pipeline

- **Mô tả**: Hệ thống phải accept audio upload (MP3, WAV, M4A, OGG) tối đa 500MB và xử lý qua transcription pipeline.
- **Verification Method**: Upload file audio 100MB qua API, xác nhận transcription output trong 10 phút.
- **Evidence Required**: API response với job ID; transcription result JSON; processing time metric.
- **Status**: `PENDING`

### AC-07: Transcription Accuracy

- **Mô tả**: Speech-to-text phải đạt WER (Word Error Rate) ≤ 15% cho tiếng Việt với audio chất lượng tốt.
- **Verification Method**: Chạy benchmark với 10 audio samples có ground truth transcript, tính WER trung bình.
- **Evidence Required**: WER report cho từng sample; average WER; comparison với baseline.
- **Status**: `PENDING`

### AC-08: Translation Quality

- **Mô tả**: Bản dịch Vietnamese↔English phải đạt BLEU score ≥ 0.35 trên test corpus.
- **Verification Method**: Dịch test corpus 100 câu, so sánh với reference translations.
- **Evidence Required**: BLEU score report; sample translations cho manual review.
- **Status**: `PENDING`

### AC-09: Text-to-Speech Output Quality

- **Mô tả**: TTS phải tạo audio output với MOS (Mean Opinion Score) ≥ 3.5/5.0 qua subjective evaluation.
- **Verification Method**: Generate 20 audio samples, đánh giá bởi 5 người nghe.
- **Evidence Required**: MOS evaluation form results; generated audio samples archive.
- **Status**: `PENDING`

### AC-10: API Response Time

- **Mô tả**: API endpoints phải respond trong ≤ 200ms cho read operations và ≤ 500ms cho write operations (P95).
- **Verification Method**: Load test với k6 hoặc wrk, 100 concurrent users, 5 phút.
- **Evidence Required**: Load test report với P50, P95, P99 latency; error rate < 0.1%.
- **Status**: `PENDING`

### AC-11: Authentication và Authorization

- **Mô tả**: Hệ thống phải implement JWT-based authentication với role-based access control (RBAC).
- **Verification Method**: Test unauthorized access bị reject; test role escalation bị block.
- **Evidence Required**: Security test report; API responses cho unauthorized requests (401/403).
- **Status**: `PENDING`

### AC-12: Logging và Observability

- **Mô tả**: Tất cả services phải output structured logs (JSON format) và được aggregate tại central location.
- **Verification Method**: Trigger các operations, verify logs xuất hiện trong log aggregator với correlation IDs.
- **Evidence Required**: Sample log entries; log search query results; correlation ID tracing example.
- **Status**: `PENDING`

### AC-13: Health Check Endpoints

- **Mô tả**: Mỗi service phải expose `/health` và `/ready` endpoints theo Kubernetes-compatible format.
- **Verification Method**: Curl health endpoints của tất cả services, verify JSON response format.
- **Evidence Required**: Health check responses từ mỗi service; Docker healthcheck configuration.
- **Status**: `PENDING`

### AC-14: Graceful Shutdown

- **Mô tả**: Containers phải handle SIGTERM gracefully, hoàn thành in-flight requests trước khi exit.
- **Verification Method**: Gửi request dài, đồng thời stop container, verify request hoàn thành.
- **Evidence Required**: Log showing graceful shutdown sequence; no interrupted requests in test.
- **Status**: `PENDING`

### AC-15: Configuration Management — No Hardcode

- **Mô tả**: Tất cả configuration phải qua environment variables hoặc mounted config files, KHÔNG hardcode trong source.
- **Verification Method**: Hardcode scan (grep cho passwords, API keys, connection strings trong source code).
- **Evidence Required**: Scan report với zero findings; `.env.example` file documentation.
- **Status**: `PENDING`

### AC-16: Secret Management

- **Mô tả**: Secrets (passwords, API keys, tokens) phải được quản lý qua Docker secrets hoặc encrypted env files.
- **Verification Method**: Verify không có secret nào trong plaintext trong repository hoặc container image layers.
- **Evidence Required**: `docker history` output cho mỗi image; git-secrets scan report.
- **Status**: `PENDING`

### AC-17: Resource Limits

- **Mô tả**: Tất cả containers phải có memory limits và CPU limits được define trong docker-compose.yml.
- **Verification Method**: Parse docker-compose.yml, xác nhận mọi service có `deploy.resources.limits`.
- **Evidence Required**: Extracted resource limits table; `docker stats` output under load.
- **Status**: `PENDING`

### AC-18: Volume Backup Integrity

- **Mô tả**: Docker volumes phải được backup và restore đúng cách mà không mất dữ liệu.
- **Verification Method**: Backup volume, destroy volume, restore, verify data checksum match.
- **Evidence Required**: MD5/SHA256 checksums trước và sau restore; restore procedure log.
- **Status**: `PENDING`

### AC-19: Container Image Security

- **Mô tả**: Base images phải được scan vulnerabilities, không có Critical/High CVEs unpatched.
- **Verification Method**: Chạy Trivy hoặc Docker Scout scan trên tất cả images.
- **Evidence Required**: Vulnerability scan report cho mỗi image; remediation plan cho findings.
- **Status**: `PENDING`

### AC-20: Horizontal Scaling Readiness

- **Mô tả**: Stateless services phải có khả năng scale horizontally bằng `docker compose up --scale`.
- **Verification Method**: Scale API service lên 3 instances, verify load balancing hoạt động.
- **Evidence Required**: `docker compose ps` showing multiple instances; request distribution logs.
- **Status**: `PENDING`

### AC-21: Database Migration Management

- **Mô tả**: Database schema changes phải qua migration tool với version control và rollback capability.
- **Verification Method**: Apply migration, verify schema change, rollback, verify revert.
- **Evidence Required**: Migration files listing; successful up/down migration logs.
- **Status**: `PENDING`

### AC-22: File Storage Organization

- **Mô tả**: Media files phải được tổ chức theo cấu trúc thư mục rõ ràng với metadata tracking.
- **Verification Method**: Upload files, verify storage path matches convention, query metadata.
- **Evidence Required**: Directory structure listing; metadata database entries; storage path examples.
- **Status**: `PENDING`

### AC-23: Error Handling và Recovery

- **Mô tả**: Hệ thống phải handle errors gracefully với proper error codes, messages, và automatic retry cho transient failures.
- **Verification Method**: Inject failures (kill database, network timeout), verify system recovers.
- **Evidence Required**: Error response examples; recovery time measurements; retry logs.
- **Status**: `PENDING`

### AC-24: API Documentation

- **Mô tả**: Tất cả API endpoints phải có OpenAPI/Swagger documentation tự động generate từ code.
- **Verification Method**: Access Swagger UI, verify tất cả endpoints documented với examples.
- **Evidence Required**: Swagger UI screenshot; OpenAPI spec file; endpoint coverage report.
- **Status**: `PENDING`

### AC-25: CORS Configuration

- **Mô tả**: CORS phải được configure chính xác, chỉ allow origins đã được whitelist.
- **Verification Method**: Test request từ allowed origin (pass) và unauthorized origin (block).
- **Evidence Required**: CORS headers trong response; test results từ multiple origins.
- **Status**: `PENDING`

### AC-26: Rate Limiting

- **Mô tả**: API phải có rate limiting để prevent abuse (100 requests/minute per user default).
- **Verification Method**: Gửi 150 requests trong 1 phút, verify 429 responses sau threshold.
- **Evidence Required**: Rate limit headers trong response; 429 response after threshold; rate limit config.
- **Status**: `PENDING`

### AC-27: Monitoring Alerts

- **Mô tả**: Hệ thống phải alert khi: CPU > 80%, Memory > 85%, Disk > 90%, Service down > 30s.
- **Verification Method**: Simulate high resource usage, verify alert triggered trong 60 giây.
- **Evidence Required**: Alert configuration; triggered alert examples; notification delivery proof.
- **Status**: `PENDING`

### AC-28: Disaster Recovery Procedure

- **Mô tả**: Phải có documented và tested disaster recovery procedure với RTO ≤ 4 hours, RPO ≤ 24 hours.
- **Verification Method**: Simulate complete system failure, execute DR procedure, measure recovery time.
- **Evidence Required**: DR procedure document; DR drill report với actual RTO/RPO measurements.
- **Status**: `PENDING`

### AC-29: Container Restart Policy

- **Mô tả**: Tất cả containers phải có restart policy `unless-stopped` hoặc `on-failure` với max retries.
- **Verification Method**: Parse docker-compose.yml, verify restart policies; kill container, verify auto-restart.
- **Evidence Required**: Restart policy configuration extract; container restart event logs.
- **Status**: `PENDING`

### AC-30: Timezone Consistency

- **Mô tả**: Tất cả services phải sử dụng UTC internally và convert sang Asia/Ho_Chi_Minh cho display.
- **Verification Method**: Check database timestamps, log timestamps, API response timestamps.
- **Evidence Required**: Sample timestamps từ các layers; timezone configuration evidence.
- **Status**: `PENDING`

### AC-31: Input Validation

- **Mô tả**: Tất cả user inputs phải được validate (type, length, format) trước khi processing.
- **Verification Method**: Submit malformed inputs (SQL injection, XSS, oversized), verify rejection.
- **Evidence Required**: Validation error responses; security test report; input schemas.
- **Status**: `PENDING`

### AC-32: Automated Testing Coverage

- **Mô tả**: Code coverage phải đạt ≥ 70% cho unit tests và ≥ 50% cho integration tests.
- **Verification Method**: Chạy test suite với coverage reporter, verify thresholds.
- **Evidence Required**: Coverage report (HTML/JSON); CI pipeline showing test execution.
- **Status**: `PENDING`

### AC-33: CI/CD Pipeline

- **Mô tả**: Phải có automated pipeline: lint → test → build → scan → deploy staging.
- **Verification Method**: Push code change, verify pipeline executes all stages successfully.
- **Evidence Required**: Pipeline configuration file; successful pipeline run log; stage durations.
- **Status**: `PENDING`

### AC-34: Documentation Completeness

- **Mô tả**: Tất cả documents trong Volume 01 phải hoàn thành với cross-references chính xác.
- **Verification Method**: Verify mỗi document tồn tại, có nội dung > 100 lines, links không broken.
- **Evidence Required**: Document inventory checklist; broken link scan report; word count per doc.
- **Status**: `PENDING`

### AC-35: Hardcode Scan — Zero Secrets trong Source Code

- **Mô tả**: Source code KHÔNG được chứa bất kỳ hardcoded secrets nào: passwords, API keys, tokens, connection strings, private keys.
- **Verification Method**: Chạy automated scan với các patterns: `password\s*=`, `api_key`, `secret`, `token`, `BEGIN.*PRIVATE KEY`, connection string patterns. Scan toàn bộ repository excluding binary files.
- **Evidence Required**: Scan tool output (truffleHog, git-secrets, hoặc custom grep script) với ZERO findings; danh sách patterns đã scan; coverage report cho tất cả files.
- **Status**: `PENDING`

### AC-36: Hardcode Scan — Zero Hardcoded Configuration Values

- **Mô tả**: Không có IP addresses, port numbers, hostnames, hoặc environment-specific values được hardcode trong application code. Tất cả phải externalized qua environment variables hoặc config files.
- **Verification Method**: Grep scan cho IP patterns (`\d+\.\d+\.\d+\.\d+`), hardcoded ports, hostname strings trong source code (excluding documentation và test fixtures).
- **Evidence Required**: Scan report; list of externalized configurations; `.env.example` mapping tất cả required variables.
- **Status**: `PENDING`

### AC-37: Final Control Counts Verification

- **Mô tả**: Xác nhận toàn bộ hệ thống đáp ứng đầy đủ các control counts: 37 acceptance criteria defined, 8 host validation items identified, 8 open decisions documented, tất cả Docker services có health checks, tất cả volumes có backup procedures, tất cả networks có security policies.
- **Verification Method**: Cross-reference document inventory: AC count = 37, host validations = 8, open decisions = 8. Verify docker-compose.yml service count matches architecture document. Verify backup procedures cover all persistent volumes.
- **Evidence Required**: Control count summary table; cross-reference matrix giữa documents; discrepancy report (phải trống); sign-off từ Architecture Owner.
- **Status**: `PENDING`

---

## 26.4 Hardcode Scan Requirements (Chi Tiết)

### Scan Patterns Bắt Buộc

| Pattern Category | Regex Pattern | Scope |
|-----------------|---------------|-------|
| Passwords | `password\s*[=:]\s*['"][^'"]+['"]` | All source files |
| API Keys | `(api[_-]?key\|apikey)\s*[=:]\s*['"][^'"]+['"]` | All source files |
| Tokens | `(token\|bearer)\s*[=:]\s*['"][^'"]+['"]` | All source files |
| Private Keys | `BEGIN\s*(RSA\|EC\|DSA\|OPENSSH)?\s*PRIVATE\s*KEY` | All files |
| Connection Strings | `(postgres\|mysql\|mongodb\|redis):\/\/[^\s]+` | All source files |
| AWS Credentials | `(AKIA\|ASIA)[A-Z0-9]{16}` | All files |
| IP Addresses | `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` | Source code only |
| Hardcoded Ports | `port\s*[=:]\s*\d{4,5}` | Source code only |

### Scan Exclusions (Cho Phép)

- Documentation files (*.md)
- Test fixtures với clearly marked test data
- Docker Compose files (port mappings là configuration, không phải hardcode)
- Localhost references (127.0.0.1) trong development configs

### Scan Tools Được Chấp Nhận

1. **truffleHog** — Git history secret scanning
2. **git-secrets** — Pre-commit hook scanning
3. **gitleaks** — Comprehensive secret detection
4. **Custom grep script** — Với documented patterns ở trên

---

## 26.5 Final Control Counts

| Control Category | Expected Count | Document Reference |
|-----------------|---------------|-------------------|
| Acceptance Criteria | 37 | This document (DOC26) |
| Host Validation Items | 8 | DOC27 Section 1 |
| Open Decisions | 8 | DOC27 Section 2 |
| Docker Services | Per architecture | DOC05, DOC06 |
| Docker Networks | Per security zones | DOC08 |
| Persistent Volumes | Per data requirements | DOC07 |
| Backup Procedures | 1 per volume | DOC14 |
| Health Checks | 1 per service | DOC06 |
| Monitoring Alerts | Per threshold matrix | DOC15 |

---

## 26.6 Acceptance Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Architecture Owner | __________ | __________ | __________ |
| Technical Lead | __________ | __________ | __________ |
| Security Reviewer | __________ | __________ | __________ |
| Operations Lead | __________ | __________ | __________ |

---

## 26.7 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-07-23 | Architecture Team | Initial 37 criteria defined |

---

*Document End — Total Criteria: 37 | All Status: PENDING*
