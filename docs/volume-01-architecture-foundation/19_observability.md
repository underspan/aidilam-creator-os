# Chương 19: Observability — Quan Sát và Giám Sát Hệ Thống

## 19.1 Tổng Quan

Observability là khả năng hiểu trạng thái nội bộ của hệ thống thông qua các tín hiệu bên ngoài:
logs, metrics, và traces. Trong kiến trúc AI-điều phối phức tạp, observability không phải là
tính năng phụ — nó là nền tảng để vận hành, debug, và tối ưu hóa hệ thống.

Ba trụ cột chính:

1. **Structured Logs** — ghi nhận sự kiện dưới dạng JSON có cấu trúc
2. **Metrics** — đo lường hiệu suất và tài nguyên theo thời gian thực
3. **Traces** — theo dõi luồng request xuyên suốt các service

Chương này tập trung vào thiết kế observability cho hệ thống AI orchestration,
bao gồm correlation tracking, provider monitoring, và bảo mật dữ liệu log.

---

## 19.2 Structured JSON Logs

### 19.2.1 Schema Chuẩn

Mọi log entry PHẢI tuân theo schema JSON sau:

```json
{
  "timestamp": "2026-07-23T13:31:10.971+07:00",
  "level": "INFO",
  "correlation_id": "req-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "service": "router-service",
  "message": "Request routed to provider",
  "metadata": {
    "provider": "openai",
    "model": "gpt-4",
    "latency_ms": 1523,
    "token_count": 450,
    "queue_position": 3
  }
}
```

### 19.2.2 Giải Thích Các Trường

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|-----------|--------|
| `timestamp` | ISO 8601 | ✅ | Thời điểm phát sinh event, bao gồm timezone |
| `level` | enum | ✅ | DEBUG, INFO, WARN, ERROR, FATAL |
| `correlation_id` | UUID v4 | ✅ | Định danh duy nhất cho chuỗi xử lý |
| `service` | string | ✅ | Tên service phát sinh log |
| `message` | string | ✅ | Mô tả ngắn gọn sự kiện |
| `metadata` | object | ❌ | Dữ liệu bổ sung tùy theo ngữ cảnh |

### 19.2.3 Log Levels — Quy Ước Sử Dụng

- **DEBUG**: Chi tiết kỹ thuật dùng cho development, KHÔNG bật trong production
- **INFO**: Sự kiện bình thường — request received, job completed, provider selected
- **WARN**: Tình huống bất thường nhưng hệ thống vẫn hoạt động — retry triggered, fallback activated
- **ERROR**: Lỗi ảnh hưởng đến request cụ thể — provider timeout, validation failure
- **FATAL**: Lỗi nghiêm trọng khiến service không thể tiếp tục hoạt động

### 19.2.4 Ví Dụ Log Theo Ngữ Cảnh

**Request nhận được:**

```json
{
  "timestamp": "2026-07-23T13:31:10.000+07:00",
  "level": "INFO",
  "correlation_id": "req-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "service": "api-gateway",
  "message": "Incoming request received",
  "metadata": {
    "method": "POST",
    "path": "/v1/completions",
    "client_id": "client-xyz",
    "content_length": 2048
  }
}
```

**Provider timeout:**

```json
{
  "timestamp": "2026-07-23T13:31:12.523+07:00",
  "level": "ERROR",
  "correlation_id": "req-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "service": "provider-adapter",
  "message": "Provider request timed out",
  "metadata": {
    "provider": "anthropic",
    "model": "claude-3-opus",
    "timeout_ms": 30000,
    "error_class": "TRANSIENT",
    "retry_attempt": 2
  }
}
```

---

## 19.3 Request/Job/Routing Correlation

### 19.3.1 Correlation Strategy

Mỗi request đi vào hệ thống được gán một `correlation_id` duy nhất tại API Gateway.
ID này được truyền xuyên suốt mọi service trong chuỗi xử lý:

```
Client Request
  → API Gateway (sinh correlation_id)
    → Router Service (kế thừa correlation_id)
      → Provider Adapter (kế thừa correlation_id)
        → Response Processor (kế thừa correlation_id)
```

### 19.3.2 Job Correlation

Với các tác vụ bất đồng bộ (async jobs), hệ thống sử dụng cặp ID:

- `correlation_id`: ID gốc từ request ban đầu
- `job_id`: ID riêng của job trong queue

Điều này cho phép truy vết từ job ngược về request gốc:

```json
{
  "timestamp": "2026-07-23T13:32:00.000+07:00",
  "level": "INFO",
  "correlation_id": "req-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "service": "job-worker",
  "message": "Job processing started",
  "metadata": {
    "job_id": "job-9f8e7d6c-5b4a-3210-fedc-ba9876543210",
    "job_type": "completion",
    "queue": "high-priority",
    "enqueued_at": "2026-07-23T13:31:11.000+07:00"
  }
}
```

### 19.3.3 Routing Decision Logging

Mọi quyết định routing PHẢI được ghi log với đầy đủ lý do:

```json
{
  "timestamp": "2026-07-23T13:31:10.500+07:00",
  "level": "INFO",
  "correlation_id": "req-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "service": "router-service",
  "message": "Routing decision made",
  "metadata": {
    "selected_provider": "openai",
    "selected_model": "gpt-4",
    "reason": "lowest_latency",
    "candidates_evaluated": ["openai/gpt-4", "anthropic/claude-3-opus"],
    "latency_scores": {"openai/gpt-4": 1200, "anthropic/claude-3-opus": 2400}
  }
}
```

---

## 19.4 Metrics

### 19.4.1 Latency Metrics

Đo lường thời gian xử lý tại mọi điểm trong pipeline:

| Metric | Mô tả | Unit |
|--------|--------|------|
| `request_total_latency` | Tổng thời gian từ nhận request đến trả response | ms |
| `provider_response_latency` | Thời gian chờ provider trả kết quả | ms |
| `queue_wait_time` | Thời gian job nằm trong queue | ms |
| `routing_decision_latency` | Thời gian để router chọn provider | ms |
| `token_generation_latency` | Thời gian trung bình để sinh mỗi token | ms/token |

Histogram buckets khuyến nghị: `[50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000]` ms.

### 19.4.2 Queue Depth

Giám sát queue depth cho phép phát hiện bottleneck sớm:

- `queue_depth_current`: Số job đang chờ trong queue
- `queue_depth_by_priority`: Phân theo mức ưu tiên (high, normal, low)
- `queue_enqueue_rate`: Tốc độ job được thêm vào queue (jobs/second)
- `queue_dequeue_rate`: Tốc độ job được xử lý (jobs/second)

**Alert thresholds:**

- WARN: queue depth > 100 jobs trong 5 phút liên tục
- ERROR: queue depth > 500 jobs hoặc tăng > 50% trong 2 phút

### 19.4.3 Worker Heartbeats

Mỗi worker PHẢI gửi heartbeat định kỳ (mặc định: mỗi 30 giây):

```json
{
  "worker_id": "worker-prod-01",
  "timestamp": "2026-07-23T13:31:30.000+07:00",
  "status": "active",
  "current_job": "job-9f8e7d6c-5b4a-3210-fedc-ba9876543210",
  "jobs_processed_total": 15234,
  "uptime_seconds": 86400,
  "memory_usage_mb": 512,
  "cpu_percent": 45.2
}
```

**Worker được coi là DEAD nếu:**
- Không gửi heartbeat trong 3 chu kỳ liên tiếp (90 giây mặc định)
- Hệ thống tự động reassign job của worker đã chết cho worker khác

### 19.4.4 Resource Consumption

| Metric | Mô tả |
|--------|--------|
| `cpu_usage_percent` | CPU sử dụng theo từng service |
| `memory_usage_bytes` | RAM sử dụng thực tế |
| `memory_limit_bytes` | Giới hạn RAM được cấp phát |
| `network_io_bytes` | Lưu lượng mạng vào/ra |
| `open_connections` | Số connection đang mở |
| `goroutines_active` | Số goroutine/thread đang hoạt động |

---

## 19.5 Health Checks và Readiness Checks

### 19.5.1 Health Endpoint (`/health`)

Endpoint `/health` kiểm tra service có đang **sống** hay không (liveness):

```json
{
  "status": "healthy",
  "timestamp": "2026-07-23T13:31:10.000+07:00",
  "version": "2.4.1",
  "uptime_seconds": 172800
}
```

Trả về HTTP 200 nếu service đang chạy, HTTP 503 nếu không.

### 19.5.2 Readiness Endpoint (`/ready`)

Endpoint `/ready` kiểm tra service có **sẵn sàng nhận traffic** hay không:

```json
{
  "status": "ready",
  "timestamp": "2026-07-23T13:31:10.000+07:00",
  "checks": {
    "database": {"status": "ok", "latency_ms": 5},
    "redis": {"status": "ok", "latency_ms": 2},
    "provider_openai": {"status": "ok", "latency_ms": 150},
    "provider_anthropic": {"status": "degraded", "latency_ms": 5200}
  }
}
```

### 19.5.3 Sự Khác Biệt Giữa Health và Ready

| Tiêu chí | `/health` | `/ready` |
|-----------|-----------|----------|
| Mục đích | Kiểm tra process đang sống | Kiểm tra sẵn sàng nhận request |
| Dependency check | Không | Có (DB, cache, providers) |
| Khi fail | Restart container | Ngừng route traffic đến instance |
| Tần suất check | Mỗi 10 giây | Mỗi 5 giây |

---

## 19.6 Provider Latency, Token Usage, và Cost Tracking

### 19.6.1 Provider Latency Monitoring

Theo dõi latency của từng provider theo thời gian thực:

```json
{
  "provider": "openai",
  "model": "gpt-4",
  "metrics": {
    "p50_latency_ms": 1200,
    "p95_latency_ms": 3500,
    "p99_latency_ms": 8000,
    "success_rate": 0.994,
    "timeout_rate": 0.002,
    "error_rate": 0.004
  },
  "window": "5m",
  "recorded_at": "2026-07-23T13:31:00.000+07:00"
}
```

### 19.6.2 Token Usage Tracking

Ghi nhận token sử dụng cho mỗi request:

- `prompt_tokens`: Số token trong input
- `completion_tokens`: Số token trong output
- `total_tokens`: Tổng token sử dụng

Aggregate metrics:
- `tokens_total_hourly`: Tổng token tiêu thụ theo giờ
- `tokens_by_provider`: Phân theo provider
- `tokens_by_client`: Phân theo client/tenant

### 19.6.3 Estimated Cost Tracking

Tính chi phí ước tính dựa trên pricing table cập nhật:

```json
{
  "timestamp": "2026-07-23T13:00:00.000+07:00",
  "window": "1h",
  "costs": {
    "openai_gpt4": {"tokens": 125000, "estimated_usd": 3.75},
    "anthropic_claude3": {"tokens": 80000, "estimated_usd": 2.40},
    "total_estimated_usd": 6.15
  },
  "budget_daily_usd": 200.00,
  "budget_consumed_percent": 12.3
}
```

**Cost alerts:**
- WARN: Budget consumed > 70% trong nửa đầu ngày
- ERROR: Budget consumed > 90% hoặc projected overspend > 20%

---

## 19.7 Error Classification

### 19.7.1 Ba Loại Lỗi

Mọi error PHẢI được phân loại vào một trong ba nhóm:

| Class | Mô tả | Hành động |
|-------|--------|-----------|
| **TRANSIENT** | Lỗi tạm thời, có thể tự hồi phục | Retry với exponential backoff |
| **PERMANENT** | Lỗi cố định, retry không giúp ích | Trả lỗi về client, log chi tiết |
| **CONFIGURATION** | Lỗi do cấu hình sai | Alert ops team, không retry |

### 19.7.2 Ví Dụ Phân Loại

**TRANSIENT:**
- Provider trả HTTP 429 (rate limited)
- Network timeout
- Provider trả HTTP 500/502/503
- Database connection pool exhausted

**PERMANENT:**
- Input validation failure (malformed JSON, token limit exceeded)
- Provider trả HTTP 400 (bad request)
- Model không tồn tại
- Permission denied (HTTP 403)

**CONFIGURATION:**
- API key hết hạn hoặc không hợp lệ
- Endpoint URL sai
- Missing required environment variable
- TLS certificate expired

### 19.7.3 Error Logging Format

```json
{
  "timestamp": "2026-07-23T13:31:12.000+07:00",
  "level": "ERROR",
  "correlation_id": "req-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "service": "provider-adapter",
  "message": "Provider request failed",
  "metadata": {
    "error_class": "TRANSIENT",
    "error_code": "PROVIDER_TIMEOUT",
    "provider": "anthropic",
    "model": "claude-3-opus",
    "retry_attempt": 2,
    "max_retries": 3,
    "next_retry_ms": 4000,
    "original_error": "context deadline exceeded"
  }
}
```

---

## 19.8 Disk Monitoring và Backup Age Alerts

### 19.8.1 Disk Usage Monitoring

| Metric | Alert Level | Threshold |
|--------|-------------|-----------|
| `disk_usage_percent` | WARN | > 75% |
| `disk_usage_percent` | ERROR | > 90% |
| `disk_iops` | WARN | > 80% capacity |
| `disk_write_latency_ms` | WARN | > 20ms sustained |

### 19.8.2 Backup Age Alerts

Hệ thống PHẢI giám sát tuổi của backup gần nhất:

```json
{
  "timestamp": "2026-07-23T13:31:00.000+07:00",
  "level": "WARN",
  "service": "backup-monitor",
  "message": "Backup age exceeds threshold",
  "metadata": {
    "backup_type": "database_full",
    "last_backup_at": "2026-07-22T02:00:00.000+07:00",
    "age_hours": 35.5,
    "threshold_hours": 24,
    "backup_size_gb": 12.4
  }
}
```

**Backup alert rules:**
- Database full backup: WARN nếu > 24 giờ, ERROR nếu > 48 giờ
- Database incremental: WARN nếu > 6 giờ, ERROR nếu > 12 giờ
- Configuration backup: WARN nếu > 7 ngày, ERROR nếu > 14 ngày
- Log archive: WARN nếu > 2 giờ, ERROR nếu > 6 giờ

---

## 19.9 Bảo Mật Dữ Liệu Log — FORBIDDEN Data

### 19.9.1 Danh Sách FORBIDDEN

Các dữ liệu sau **TUYỆT ĐỐI KHÔNG ĐƯỢC** xuất hiện trong log dưới bất kỳ hình thức nào:

| Loại dữ liệu | Ví dụ | Lý do |
|---------------|-------|-------|
| API keys | `sk-abc123...` | Credential theft |
| Cookies | `session_id=...` | Session hijacking |
| Tokens | Bearer tokens, JWT, refresh tokens | Unauthorized access |
| Private keys | RSA/EC private key content | Complete compromise |
| Secrets | Database passwords, encryption keys | Data breach |
| Signed URLs | Pre-signed S3 URLs, SAS tokens | Unauthorized data access |

### 19.9.2 Enforcement Mechanisms

**Compile-time / Lint-time:**
- Sử dụng custom linter rules để phát hiện patterns nguy hiểm
- Từ chối merge nếu phát hiện sensitive data patterns trong log statements

**Runtime:**
- Log sanitizer middleware tự động redact patterns phù hợp
- Regex patterns cho API keys, JWTs, private key headers

```python
REDACTION_PATTERNS = [
    r'(sk-[a-zA-Z0-9]{20,})',           # OpenAI API keys
    r'(Bearer\s+[a-zA-Z0-9\-._~+/]+=*)', # Bearer tokens
    r'(-----BEGIN\s+\w+\s+PRIVATE\s+KEY-----)',  # Private keys
    r'(https?://[^?\s]+\?[^&\s]*(?:Signature|X-Amz-Credential)[^\s]*)',  # Signed URLs
    r'(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)',  # JWT tokens
]
```

**Audit:**
- Quét log storage định kỳ (hàng ngày) để phát hiện rò rỉ
- Alert ngay lập tức nếu phát hiện sensitive data trong log

### 19.9.3 Cách Log Đúng

Thay vì log giá trị thực, log metadata an toàn:

```json
// ❌ SAI — FORBIDDEN
{"message": "Using API key sk-abc123xyz456..."}

// ✅ ĐÚNG — chỉ log identifier
{"message": "Using API key", "metadata": {"key_id": "key-prod-01", "key_prefix": "sk-***456"}}
```

---

## 19.10 Audit Events Là Nguồn Observability

### 19.10.1 Audit Events Schema

Audit events không chỉ phục vụ compliance mà còn là nguồn observability quan trọng:

```json
{
  "timestamp": "2026-07-23T13:31:10.000+07:00",
  "event_type": "configuration.updated",
  "actor": {
    "type": "user",
    "id": "admin-001",
    "ip": "10.0.1.50"
  },
  "resource": {
    "type": "provider_config",
    "id": "openai-primary"
  },
  "action": "update",
  "changes": {
    "max_tokens": {"from": 4096, "to": 8192},
    "timeout_ms": {"from": 30000, "to": 60000}
  },
  "correlation_id": "req-f1e2d3c4-b5a6-7890-1234-567890abcdef"
}
```

### 19.10.2 Audit Events Phục Vụ Observability

Audit events giúp trả lời các câu hỏi vận hành:

- **"Tại sao latency tăng đột biến lúc 14:00?"** → Audit log cho thấy cấu hình timeout được thay đổi lúc 13:58
- **"Ai đã disable provider X?"** → Audit event ghi nhận actor, thời điểm, và lý do
- **"Khi nào model mới được deploy?"** → Audit trail đầy đủ lifecycle

### 19.10.3 Correlation Giữa Audit và Operational Logs

Audit events PHẢI chứa `correlation_id` để có thể join với operational logs:

```
Audit Event (config change) ──correlation_id──→ Operational Logs (behavior change)
```

Điều này cho phép root cause analysis tự động: khi metric bất thường, hệ thống
tự động tìm audit events liên quan trong cùng khoảng thời gian.

---

## 19.11 Tổng Kết và Checklist

### Checklist Triển Khai Observability

- [ ] Tất cả logs sử dụng structured JSON format
- [ ] Mọi request có correlation_id xuyên suốt pipeline
- [ ] Metrics cho latency, queue depth, heartbeats được thu thập
- [ ] Health (`/health`) và readiness (`/ready`) endpoints hoạt động
- [ ] Provider latency và cost tracking được giám sát
- [ ] Errors được phân loại TRANSIENT/PERMANENT/CONFIGURATION
- [ ] Disk usage và backup age được monitor với alert thresholds
- [ ] Log sanitizer chặn mọi FORBIDDEN data
- [ ] Audit events được tích hợp vào observability pipeline
- [ ] Dashboards hiển thị tất cả metrics quan trọng
- [ ] Alert rules được cấu hình và test

### Nguyên Tắc Vàng

1. **Log mọi quyết định** — Routing decisions, retry attempts, fallback activations
2. **Correlate mọi thứ** — Từ request đến job đến provider call
3. **Measure mọi latency** — End-to-end và từng component
4. **Protect mọi secret** — Zero tolerance cho sensitive data trong logs
5. **Alert trước khi fail** — Predictive thresholds, không chỉ reactive

---

*Tài liệu này là một phần của Volume 01: Architecture Foundation.*
*Cập nhật lần cuối: 2026-07-23*
