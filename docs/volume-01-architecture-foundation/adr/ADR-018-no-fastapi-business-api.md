# ADR-018: Không Sử Dụng FastAPI Cho Business API

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-018 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Tác giả | Architecture Team |
| Liên quan | ADR-003, ADR-012 |

## Status

**Accepted** — Trừ khi có ADR riêng justify, Python services không expose business API endpoints.

## Context

Hệ thống AIĐiLàm có hai technology stacks chính:
- **Node.js (TypeScript):** Business logic, API layer, routing, user management, billing
- **Python:** AI/ML workers xử lý inference, embedding generation, model fine-tuning

Trong quá trình phát triển, đã có proposals để expose FastAPI endpoints từ Python workers nhằm:
- Cung cấp direct API cho model management
- Expose health/metrics endpoints riêng cho ML services
- Tạo admin API cho model configuration

Điều này tạo ra nguy cơ architecture fragmentation — business logic bị split giữa hai runtime environments, tăng operational overhead và giảm consistency.

Ranh giới rõ ràng cần được thiết lập:
- Đâu là trách nhiệm của Node.js API layer?
- Đâu là trách nhiệm của Python workers?
- Giao tiếp giữa hai layers bằng cách nào?

## Decision

**Không có FastAPI business API trừ khi được justify riêng bằng ADR separate.** Python workers giao tiếp qua queue contracts only. Business logic nằm trong Node.js.

Chi tiết:
1. Python workers CHỈ nhận work từ message queue (Redis Queue / BullMQ)
2. Python workers CHỈ trả results qua message queue hoặc callback URL
3. Không có HTTP endpoint nào từ Python service mà business logic depend on
4. Health check endpoint `/health` cho container orchestration là exception duy nhất được phép
5. Prometheus metrics endpoint `/metrics` là exception thứ hai được phép
6. Bất kỳ business API endpoint mới nào trong Python PHẢI có ADR riêng với justification

Queue contract structure:
```
Job Input:  { jobId, type, payload, callbackUrl, priority, timeout }
Job Output: { jobId, status, result, error, processingTime }
```

## Alternatives

### Alternative 1: Hybrid API — Node.js Primary, FastAPI cho ML-specific Endpoints
- FastAPI expose endpoints liên quan trực tiếp đến ML operations
- **Ưu điểm:** Python ecosystem tốt hơn cho ML tooling; direct access không qua queue
- **Nhược điểm:** Hai API surfaces cần maintain; authentication/authorization duplicated; routing complexity
- **Lý do loại bỏ:** Operational overhead không justify benefit; queue-based approach đủ cho current scale

### Alternative 2: GraphQL Federation — Mỗi Service Expose Subgraph
- Sử dụng Apollo Federation để compose multiple service APIs
- **Ưu điểm:** Unified API surface cho clients; mỗi team own subgraph riêng
- **Nhược điểm:** Massive infrastructure overhead; team size không justify federation complexity
- **Lý do loại bỏ:** Over-engineering; team nhỏ không cần service mesh level complexity

### Alternative 3: gRPC Giữa Node.js và Python
- Internal communication qua gRPC thay vì queue
- **Ưu điểm:** Low latency; strong typing với protobuf; bidirectional streaming
- **Nhược điểm:** Synchronous coupling; nếu Python service down thì Node.js blocked; no built-in retry
- **Lý do loại bỏ:** Queue-based approach better cho AI workloads (long-running, variable latency, need retry)

## Consequences

### Tích cực
- **Clear ownership:** Node.js team owns toàn bộ business API surface — single responsibility
- **Simplified auth:** Authentication và authorization chỉ implement một lần trong Node.js layer
- **Resilience:** Python worker crash không cascade thành API failure — jobs retry automatically
- **Scalability:** Workers scale independently dựa trên queue depth, không coupled với API traffic
- **Consistency:** API style, error format, versioning — tất cả consistent vì single technology

### Tiêu cực
- Latency cao hơn cho operations cần synchronous ML results (queue round-trip vs direct call)
- Python developers không thể tự expose API cho features họ build — dependency on Node.js team
- Queue infrastructure (Redis) trở thành critical dependency
- Debugging cross-service issues khó hơn khi communication async qua queue

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Queue becomes bottleneck cho high-throughput operations | Trung bình | Cao | Monitor queue depth; scale workers; implement priority queues |
| Latency unacceptable cho certain use cases | Trung bình | Trung bình | WebSocket streaming results; implement long-polling pattern |
| Python team frustrated bởi dependency on Node.js team | Cao | Thấp | Clear queue contract docs; self-service contract updates |
| Exception creep — quá nhiều ADR exceptions phá vỡ principle | Thấp | Cao | Quarterly review exceptions; strict justification criteria |
| Queue message format versioning issues | Trung bình | Trung bình | Schema registry cho queue contracts; backward-compatible changes only |

## Validation

Kiểm chứng decision:
1. **Architecture review:** Audit codebase quarterly — không có unauthorized HTTP endpoints trong Python services
2. **CI/CD gate:** Automated check fail nếu Python service expose port khác ngoài health/metrics
3. **Contract test:** Queue message schema validated ở cả producer (Node.js) và consumer (Python)
4. **Latency SLA:** Queue round-trip cho standard operations < 500ms p95
5. **Reliability test:** Kill Python worker mid-job → verify job retried successfully
6. **Documentation:** Queue contracts documented và versioned trong shared schema repository

## Rollback

Nếu cần cho phép FastAPI business endpoints:
1. Viết ADR mới justify specific use case (latency requirement, streaming need, etc.)
2. Define scope giới hạn — endpoint nào, authentication mechanism nào, who maintains
3. Implement API gateway routing để FastAPI endpoints đi qua cùng auth layer
4. Add monitoring và alerting cho new API surface
5. Update architecture diagrams và operational runbooks
6. Set review date (3 tháng) để evaluate nếu exception nên become permanent hoặc revert

**Estimated rollback time:** 1-2 sprints cho proper implementation với auth integration
**Data loss risk:** Không — thêm API surface không ảnh hưởng existing data flows
