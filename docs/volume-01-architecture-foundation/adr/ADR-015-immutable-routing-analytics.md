# ADR-015: Immutable Routing Analytics

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-015 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Người đề xuất | Data Architecture Team |
| Phạm vi | Database Design, Routing Engine, Analytics Pipeline |

## Status

**Accepted** — Áp dụng cho tất cả operations trên routing data tables.

## Context

Hệ thống routing engine điều phối content và tasks giữa các AI agents. Mỗi routing
decision ghi lại trong `RoutingExecution`, kết quả phân tích hiệu suất trong
`RoutingAnalytics`. Data phục vụ audit, debugging, optimization, compliance.

Vấn đề:
- Routing decisions cần traceable cho audit và debugging
- Modified analytics data làm sai lệch performance reports
- Compliance yêu cầu immutable audit trail cho automated decisions
- Data tampering che giấu system failures hoặc security incidents
- Historical accuracy then chốt cho ML model training

## Decision

**RoutingExecution and RoutingAnalytics records are immutable. No UPDATE or DELETE allowed.**

1. Tables `routing_execution` và `routing_analytics` chỉ cho phép INSERT
2. UPDATE/DELETE bị block ở database level (triggers + REVOKE privileges)
3. Corrections bằng append-only pattern — thêm correction record mới
4. Soft-delete dùng `superseded_by` field trỏ tới correction record
5. Application DB user KHÔNG có UPDATE/DELETE privilege trên tables này
6. Old data xử lý bằng partition drop (không row-level delete)

## Alternatives

| Alternative | Lý do từ chối |
|-------------|---------------|
| Soft-delete với `is_deleted` flag | Vẫn cho UPDATE, data bị tamper trước soft-delete |
| Audit log riêng biệt | Log có thể bị modify, thêm complexity |
| Blockchain-based immutability | Overkill, performance overhead không cần thiết |
| Time-series DB (InfluxDB) | Thêm infra dependency, team thiếu expertise |

## Consequences

### Tích cực
- Data integrity đảm bảo cho audit và compliance
- Historical data chính xác cho ML training
- Debug routing issues dễ — original data preserved
- Tamper-evident — modification attempt bị detect
- Simplify backup — chỉ cần incremental inserts

### Tiêu cực
- Storage tăng theo thời gian (không delete trực tiếp)
- Correction workflow phức tạp hơn (append thay vì update)
- Application logic cần handle superseded records
- Query performance affected khi table grows
- Developer mindset shift từ CRUD sang append-only

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Table growth ảnh hưởng performance | High | Medium | Monthly partitioning, archive old |
| Developer bypass immutability | Medium | High | DB-level enforcement, no direct access |
| Correction workflow confusion | Medium | Medium | Documentation, helper functions |
| Storage cost tăng | Medium | Low | Compression, cold storage partitions |
| Schema migration difficulty | Low | High | Additive-only changes, nullable columns |

## Validation

1. **DB**: `UPDATE routing_execution SET ...` → permission denied
2. **DB**: `DELETE FROM routing_analytics WHERE ...` → permission denied
3. **Code**: ORM không generate UPDATE/DELETE cho these entities
4. **Privilege**: Application user thiếu UPDATE/DELETE grants
5. **Monitoring**: Alert khi có attempt modify (even if blocked)

Kiểm tra: attempt forbidden operations, review app code, load test large dataset.

## Rollback

### Điều chỉnh nếu cần:

1. **Partial**: Cho phép UPDATE chỉ non-critical fields (metadata tags)
2. **Admin override**: Separate admin role cho emergency fixes
3. **Time-boxed**: Cho phép modification trong 24h sau insert, sau đó lock

### Trigger rollback
- Correction workflow tạo >20% overhead daily operations
- Storage costs vượt budget constraints
- GDPR right to erasure requirement
- Query degradation >50% despite partitioning

### Quy trình
1. Evaluate specific constraint gây issue
2. Design minimal relaxation (partial > full rollback)
3. Update DB policies và grants
4. Update application code
5. Document deviation và compensating controls

---
*Architecture Decision Record — Dự án AIDiLam*
