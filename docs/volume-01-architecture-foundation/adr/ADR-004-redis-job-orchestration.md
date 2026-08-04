# ADR-004: Redis Job Orchestration

## Metadata

| Field | Value |
|-------|-------|
| **Ngày tạo** | 2026-07-23 |
| **Người đề xuất** | Architecture Team |
| **Trạng thái** | Accepted |
| **Phiên bản** | 1.0 |

## Status

**Accepted** — Redis-backed job queue là cơ chế giao tiếp async chính giữa application layer và workers.

## Context

Theo ADR-002, Node.js application layer cần gửi tasks cho Python workers asynchronously.
Yêu cầu cho hệ thống job orchestration:

- **Reliable delivery** — jobs không được mất khi worker crash hoặc restart.
- **Priority queues** — một số jobs quan trọng hơn (thumbnail generation vs batch export).
- **Retry mechanism** — tự động retry khi worker fail, với exponential backoff.
- **Visibility** — dashboard để monitor job status, throughput, error rates.
- **Scalability** — horizontal scaling workers không cần config changes.
- **Dead letter queue** — jobs fail vĩnh viễn được capture để investigation.

## Decision

**Sử dụng Redis-backed job queue theo BullMQ pattern cho async worker communication.**

1. **Redis** là transport layer:
   - Lưu trữ job payloads, status, và metadata
   - Pub/Sub cho real-time job events (completion, failure)
   - Sorted sets cho delayed/scheduled jobs

2. **BullMQ** (hoặc compatible library) là abstraction layer:
   - Named queues per concern (media, export, notification)
   - Worker processes subscribe vào specific queues
   - Built-in retry logic với configurable backoff strategies
   - Job progress reporting cho long-running tasks

3. **Queue topology**:
   - `media:thumbnail` — thumbnail generation (priority: high)
   - `media:transcode` — video transcoding (priority: medium)
   - `media:analyze` — ML analysis tasks (priority: low)
   - `export:batch` — batch export operations (priority: low)

4. **Communication contract**:
   - Job payload là JSON serializable object với schema validation
   - Results trả về qua job completion event (stored in Redis)
   - Large results (file paths, URLs) thay vì raw data trong payload

## Alternatives Considered

### 1. RabbitMQ
- **Ưu điểm**: Purpose-built message broker, advanced routing, AMQP protocol.
- **Nhược điểm**: Thêm infrastructure component, không tận dụng Redis đã có cho caching.
- **Lý do bị loại**: Redis đã là dependency bắt buộc, thêm RabbitMQ là redundant.

### 2. AWS SQS / Cloud-native queues
- **Ưu điểm**: Managed service, auto-scaling, high durability.
- **Nhược điểm**: Vendor lock-in, không chạy local dễ, thiếu job progress và priority native.
- **Lý do bị loại**: Cần chạy offline/local, tránh vendor lock-in ở giai đoạn đầu.

### 3. Direct HTTP calls (Node.js → Python API)
- **Ưu điểm**: Đơn giản, synchronous, dễ debug.
- **Nhược điểm**: Tight coupling, no retry, no backpressure, không scale independently.
- **Lý do bị loại**: Vi phạm async-first principle và ADR-002.

### 4. Kafka
- **Ưu điểm**: High throughput, event sourcing, replay capability.
- **Nhược điểm**: Overkill cho job queue, operational complexity rất cao.
- **Lý do bị loại**: Quá phức tạp cho team size và volume hiện tại.

## Consequences

### Tích cực
- **Decoupling hoàn toàn** giữa Node.js và Python — mỗi bên scale độc lập.
- **Fault tolerance** — worker crash không mất jobs, tự động redistribute.
- **Observability** — BullMQ dashboard hiển thị real-time queue metrics.
- **Infrastructure reuse** — Redis đã cần cho caching, không tốn thêm component.

### Tiêu cực
- **Added latency** — async processing thêm delay so với synchronous calls.
- **Complexity trong error handling** — distributed failures khó trace hơn.
- **Redis memory pressure** — large payloads hoặc backlog có thể gây OOM.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Redis OOM khi queue backlog lớn | Trung bình | Cao | Memory limits, backpressure, job TTL, alerting |
| Redis single point of failure | Thấp | Rất cao | Redis Sentinel hoặc Cluster cho HA |
| Job stuck in processing (zombie) | Trung bình | Trung bình | Stalled job detection, automatic cleanup |
| Payload serialization errors | Thấp | Trung bình | Schema validation trước khi enqueue |

## Validation

Quyết định này được coi là thành công khi:

1. **Metric**: Job delivery reliability > 99.9% (no lost jobs).
2. **Metric**: Queue latency (enqueue → worker pickup) p95 < 500ms.
3. **Metric**: Failed job recovery rate > 95% sau automatic retries.
4. **Operational**: Dashboard hiển thị real-time queue health.
5. **Load test**: Handle 1000 concurrent jobs without degradation.

## Rollback / Reversibility

### Mức độ khả thi: Trung bình

- **Chuyển sang RabbitMQ**: Thay queue library, contract (JSON payloads) giữ nguyên. Timeline: 1-2 sprints.
- **Chuyển sang SQS**: Thay transport, mất features cần workaround. Timeline: 2-3 sprints.
- **Synchronous HTTP**: Không khuyến nghị — mất fault tolerance và decoupling.
- **Lưu ý**: Job contracts (payload schema) là stable interface — transport có thể thay đổi.

---

*Tài liệu này tuân theo format Architecture Decision Record (ADR) của Michael Nygard.*
