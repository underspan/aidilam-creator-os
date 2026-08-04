# ADR-003: PostgreSQL as System of Record

## Metadata

| Field | Value |
|-------|-------|
| **Ngày tạo** | 2026-07-23 |
| **Người đề xuất** | Architecture Team |
| **Trạng thái** | Accepted |
| **Phiên bản** | 1.0 |

## Status

**Accepted** — PostgreSQL là single source of truth cho toàn bộ business data của hệ thống Aidilam.

## Context

Hệ thống cần một data store đáng tin cậy để lưu trữ toàn bộ dữ liệu nghiệp vụ: users, projects,
media metadata, workflows, permissions, audit logs, và configurations. Các yêu cầu chính:

- **ACID compliance** — dữ liệu nghiệp vụ cần transactional integrity tuyệt đối.
- **Relational modeling** — domain model có quan hệ phức tạp giữa entities.
- **Querying flexibility** — cần complex queries, aggregations, full-text search.
- **JSON support** — một số data có schema linh hoạt (metadata, settings).
- **Operational maturity** — tooling, monitoring, backup/restore đã proven trong production.

Đồng thời, hệ thống xử lý media (images, videos, documents) với kích thước lớn.
Cần ranh giới rõ ràng giữa structured data và binary data.

## Decision

**PostgreSQL là single source of truth cho toàn bộ business data. Không lưu binary/blob trong PG.**

1. **PostgreSQL lưu trữ**:
   - Toàn bộ business entities (users, projects, media records, etc.)
   - Metadata của media files (filename, size, mime_type, storage_path, checksums)
   - Relationships và foreign keys giữa entities
   - Audit trails và event logs (structured)
   - JSON/JSONB cho semi-structured data (user preferences, flexible metadata)

2. **PostgreSQL KHÔNG lưu trữ**:
   - Binary files (images, videos, audio, documents)
   - Large text blobs (> 1MB)
   - Cached/derived data (thuộc về Redis hoặc search indexes)

3. **Quy tắc tham chiếu**:
   - Media files được tham chiếu bằng storage path/key (`bucket/path/filename.ext`)
   - Mỗi media record chứa: `storage_bucket`, `storage_key`, `content_type`, `size_bytes`
   - Không dùng PostgreSQL `BYTEA` hoặc Large Objects cho application data

4. **Schema organization**:
   - Mỗi bounded context module sở hữu schema riêng (`auth.*`, `media.*`, `project.*`)
   - Migration managed bằng Prisma Migrate hoặc tương đương

## Alternatives Considered

### 1. MongoDB (Document Store)
- **Ưu điểm**: Flexible schema, horizontal scaling native, JSON-native.
- **Nhược điểm**: Weak transactional support, eventual consistency mặc định, schema drift.
- **Lý do bị loại**: Business data cần strong consistency và relational integrity.

### 2. MySQL/MariaDB
- **Ưu điểm**: Phổ biến, mature, nhiều hosting options.
- **Nhược điểm**: JSON support kém hơn PG, partial indexes không có, extension ecosystem nghèo.
- **Lý do bị loại**: PostgreSQL vượt trội về features cho use case này.

### 3. Lưu binary trong PostgreSQL (BYTEA/Large Objects)
- **Ưu điểm**: Single storage, transactional consistency với metadata.
- **Nhược điểm**: Database size phình to, backup chậm, không CDN-friendly, replication nặng.
- **Lý do bị loại**: Binary storage thuộc về object storage (xem ADR-005).

## Consequences

### Tích cực
- **Data integrity** đảm bảo bằng ACID transactions và foreign key constraints.
- **Querying power** — complex joins, CTEs, window functions, full-text search native.
- **JSONB flexibility** cho data có schema thay đổi mà không cần migrations.
- **Database size kiểm soát được** vì không chứa binary — backup nhanh, replication nhẹ.
- **Mature ecosystem** — pgAdmin, pg_stat_statements, pgBouncer, logical replication.

### Tiêu cực
- **Vertical scaling limit** — horizontal sharding phức tạp với PostgreSQL.
- **Single point of failure** nếu không có HA setup (streaming replication + failover).
- **Schema migrations** cần cẩn thận — locking behavior với ALTER TABLE trên bảng lớn.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Database outage ảnh hưởng toàn hệ thống | Thấp | Rất cao | Streaming replication, automated failover (Patroni) |
| Schema migration gây downtime | Trung bình | Cao | Zero-downtime migration patterns, expand-contract |
| Connection exhaustion under load | Trung bình | Cao | pgBouncer connection pooling, limits per module |
| Developer bypass rules (store binary in PG) | Trung bình | Trung bình | Lint rules, schema validation trong CI |

## Validation

Quyết định này được coi là thành công khi:

1. **Metric**: Database size growth tuyến tính với business data (không spike bởi binary).
2. **Metric**: Query p95 latency < 50ms cho standard CRUD operations.
3. **Metric**: Zero BYTEA columns chứa application binary data (kiểm tra bằng schema lint).
4. **Metric**: Backup duration < 10 phút cho full backup.
5. **Operational**: RPO < 1 phút, RTO < 5 phút.

## Rollback / Reversibility

### Mức độ khả thi: Rất thấp

- **Chuyển sang MongoDB**: Cần rewrite toàn bộ data access layer, migration scripts.
  Timeline: 8-12 sprints. Không khuyến nghị.
- **Thêm binary storage vào PG**: Rollback đơn giản nhưng gây technical debt nghiêm trọng.
- **Tách thành multiple PG instances**: Khả thi khi scale. Mỗi bounded context có thể có
  database riêng. Timeline: 2-4 sprints per module.
- **Thực tế**: PostgreSQL là quyết định rất khó thay đổi (data gravity). Cần commit lâu dài.

---

*Tài liệu này tuân theo format Architecture Decision Record (ADR) của Michael Nygard.*
