# ADR-002: Node.js Application Layer + Python Workers

## Metadata

| Field | Value |
|-------|-------|
| **Ngày tạo** | 2026-07-23 |
| **Người đề xuất** | Architecture Team |
| **Trạng thái** | Accepted |
| **Phiên bản** | 1.0 |

## Status

**Accepted** — Quyết định này đã được chấp thuận và áp dụng cho phân chia trách nhiệm runtime.

## Context

Hệ thống Aidilam có hai loại workload chính với đặc tính rất khác nhau:

- **Business logic**: CRUD, auth, API routing, WebSocket, workflow orchestration — cần high concurrency, low latency.
- **Media processing**: Image manipulation, video transcoding, ML inference, OCR — cần CPU-intensive computation.

Mỗi loại workload có ecosystem tối ưu riêng. Việc ép cả hai vào một runtime duy nhất sẽ
dẫn đến trade-offs không cần thiết.

## Decision

**Node.js/TypeScript sở hữu toàn bộ business logic. Python sở hữu media processing.
Không xây dựng FastAPI business API.**

1. **Node.js/TypeScript** là application layer duy nhất:
   - API endpoints (REST + GraphQL nếu cần)
   - Authentication, Authorization, business rules và domain logic
   - Real-time features (WebSocket via Socket.io hoặc ws)
   - Job dispatching (enqueue tasks cho Python workers)
   - Database access layer (Prisma/Drizzle)

2. **Python** chỉ đóng vai trò worker:
   - Nhận jobs từ queue (Redis/BullMQ pattern)
   - Xử lý media: resize images, transcode video, generate thumbnails
   - ML inference: classification, OCR, content moderation
   - Trả kết quả về queue hoặc callback URL
   - **Không expose HTTP API cho business logic**

3. **Ranh giới giao tiếp**:
   - Node.js → Python: thông qua job queue (Redis)
   - Python → Node.js: thông qua job completion events hoặc webhook callbacks
   - Không có synchronous HTTP calls giữa hai runtime trong production flow

## Alternatives Considered

### 1. Python (FastAPI) cho toàn bộ hệ thống
- **Ưu điểm**: Một ngôn ngữ duy nhất, ecosystem ML/AI mạnh.
- **Nhược điểm**: GIL limitation, async I/O chưa mature bằng Node.js, web/realtime ecosystem yếu hơn.
- **Lý do bị loại**: Node.js vượt trội cho I/O-bound web applications, event-driven architecture.

### 2. Node.js cho toàn bộ (bao gồm media processing)
- **Ưu điểm**: Một runtime duy nhất, đơn giản hóa deployment.
- **Nhược điểm**: Ecosystem media nghèo, không có PyTorch/TensorFlow/OpenCV native.
- **Lý do bị loại**: Python dominates media/ML processing ecosystem hoàn toàn.

### 3. Dual API (Node.js + FastAPI song song)
- **Ưu điểm**: Flexibility cao cho mỗi team.
- **Nhược điểm**: Hai sources of truth cho business logic, duplicated auth logic.
- **Lý do bị loại**: Vi phạm nguyên tắc single source of truth cho business rules.

## Consequences

### Tích cực
- **Tận dụng strengths** của mỗi runtime cho đúng use case.
- **Team clarity** — backend devs làm TypeScript, ML/media engineers làm Python.
- **Scaling độc lập** — Python workers scale horizontal theo media workload không ảnh hưởng API.
- **Single source of truth** cho business logic tại Node.js layer, không bị phân tán.
- **Development velocity cao** — TypeScript tooling rất productive cho web APIs.

### Tiêu cực
- **Hai ecosystems cần maintain** — packages, versions, CI pipelines cho cả hai.
- **Cross-language debugging** khó hơn khi trace request flow từ API đến worker.
- **Hiring cần đa dạng** — team cần cả TypeScript và Python developers.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Business logic bị leak vào Python workers | Trung bình | Cao | Code review strict, lint rules, architectural tests |
| Queue bottleneck khi media volume cao | Trung bình | Trung bình | Redis cluster, priority queues, autoscaling workers |
| Python worker failures không được handle | Thấp | Cao | Dead letter queue, retry policies, alerting |
| Skill gap — team thiếu Python expertise | Thấp | Trung bình | Hiring plan, pair programming, documentation |

## Validation

Quyết định này được coi là thành công khi:

1. **Metric**: API response time p95 < 200ms cho business endpoints (Node.js).
2. **Metric**: Media processing throughput đạt target SLA (100 images/minute/worker).
3. **Metric**: Zero business logic code trong Python worker codebase.
4. **Metric**: Job failure rate < 1% sau retries.
5. **Architecture test**: Dependency analysis confirm Python không import business modules.

## Rollback / Reversibility

### Mức độ khả thi: Thấp-Trung bình

- **Chuyển media processing sang Node.js**: Khả thi cho basic operations (sharp, fluent-ffmpeg)
  nhưng mất ML capabilities. Timeline: 2-3 sprints, không khả thi cho ML workloads.
- **Chuyển business logic sang Python (FastAPI)**: Timeline 4-8 sprints. Cần rewrite toàn bộ API.
- **Thêm FastAPI business API**: Không nên — tạo hai sources of truth.
- **Khuyến nghị**: Nếu cần thay đổi, ưu tiên consolidate chứ không split thêm.

---

*Tài liệu này tuân theo format Architecture Decision Record (ADR) của Michael Nygard.*
