# ADR-005: Object Storage with MinIO

## Metadata

| Field | Value |
|-------|-------|
| **Ngày tạo** | 2026-07-23 |
| **Người đề xuất** | Architecture Team |
| **Trạng thái** | Accepted |
| **Phiên bản** | 1.0 |

## Status

**Accepted** — MinIO là giải pháp object storage cho toàn bộ binary media của hệ thống Aidilam.

## Context

Theo ADR-003, PostgreSQL không lưu trữ binary data. Hệ thống cần storage cho:

- **Images**: Thumbnails, avatars, project assets (PNG, JPEG, WebP, SVG)
- **Videos**: Raw uploads, transcoded versions (MP4, WebM, HLS segments)
- **Documents**: PDFs, exports, generated reports
- **Audio**: Podcasts, voice recordings, processed audio files

Yêu cầu: S3-compatible API, self-hosted, chạy local cho dev, bucket-level access control,
presigned URLs cho direct upload/download, lifecycle policies.

## Decision

**MinIO cho toàn bộ binary media storage. Separate buckets per concern.**

1. **MinIO** là object storage layer duy nhất:
   - S3-compatible API — tất cả code dùng AWS S3 SDK standard
   - Self-hosted trên infrastructure của team
   - Có thể migrate sang AWS S3/R2/GCS nhờ API compatibility

2. **Bucket separation strategy**:
   - `media-uploads` — raw user uploads (lifecycle: 7 ngày nếu không processed)
   - `media-processed` — processed/optimized media (thumbnails, transcoded videos)
   - `media-exports` — generated exports, reports (lifecycle: 30 ngày)
   - `media-avatars` — user profile images (long-lived, CDN-cached)
   - `media-backups` — system backups, archival data

3. **Access patterns**:
   - Upload: Client → presigned PUT URL → MinIO (direct, bypass application)
   - Download: Client → presigned GET URL → MinIO (hoặc CDN layer phía trước)
   - Processing: Python worker đọc từ `media-uploads`, ghi vào `media-processed`
   - Metadata: PostgreSQL lưu bucket + key + content_type + size cho mỗi object

4. **Naming convention**:
   - Key format: `{tenant_id}/{entity_type}/{entity_id}/{variant}/{filename}`
   - Ví dụ: `tenant-abc/project/proj-123/thumbnail/cover-480x320.webp`

## Alternatives Considered

### 1. AWS S3 trực tiếp
- **Ưu điểm**: Managed service, 11 nines durability, global CDN integration.
- **Nhược điểm**: Vendor lock-in, chi phí tăng theo volume, data residency concerns.
- **Lý do bị loại**: MinIO cho phép migrate sang S3 sau nhờ API compatibility.

### 2. Local filesystem storage
- **Ưu điểm**: Đơn giản nhất, zero infrastructure overhead.
- **Nhược điểm**: Không scale horizontal, no presigned URLs, no replication, no CDN.
- **Lý do bị loại**: Không production-ready, thiếu features cần thiết.

### 3. Cloudflare R2
- **Ưu điểm**: S3-compatible, no egress fees, global edge.
- **Nhược điểm**: Vendor dependency, không self-hosted, limited local dev.
- **Lý do bị loại**: Tốt cho future migration nhưng không phù hợp giai đoạn self-hosted.

## Consequences

### Tích cực
- **S3 API compatibility** — migrate sang bất kỳ S3-compatible provider nào.
- **Cost control** — self-hosted, chi phí chỉ là hardware, không per-request billing.
- **Local development** — MinIO chạy trong Docker, dev experience giống production.
- **Separation of concerns** — buckets riêng biệt, lifecycle policies rõ ràng.
- **Direct upload/download** — giảm load trên application server nhờ presigned URLs.

### Tiêu cực
- **Operational burden** — team phải manage MinIO (upgrades, monitoring, capacity).
- **Durability thấp hơn S3** — phụ thuộc vào hardware và erasure coding config.
- **No built-in CDN** — cần thêm CDN layer cho global delivery.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data loss do hardware failure | Thấp | Rất cao | Erasure coding, multi-disk, offsite backup |
| Storage capacity exceeded | Trung bình | Cao | Monitoring alerts, lifecycle policies, forecasting |
| MinIO service outage | Thấp | Cao | Multi-node cluster, health checks, auto-restart |
| Presigned URL abuse | Thấp | Trung bình | Short TTL (15 phút), IP restrictions, audit logging |

## Validation

Quyết định này được coi là thành công khi:

1. **Metric**: Upload throughput > 100MB/s sustained cho media ingestion.
2. **Metric**: Presigned URL generation latency < 10ms.
3. **Metric**: Zero data loss incidents trong 12 tháng đầu.
4. **Operational**: Lifecycle policies tự động cleanup expired objects.
5. **Migration test**: Switch sang AWS S3 bằng environment variable change.

## Rollback / Reversibility

### Mức độ khả thi: Cao

- **Chuyển sang AWS S3**: Thay endpoint URL và credentials. Data migration bằng `mc mirror`.
  Timeline: 1 sprint.
- **Chuyển sang Cloudflare R2**: Tương tự S3, thay endpoint. Timeline: 1 sprint.
- **Chuyển sang GCS**: Cần adapter layer vì API khác biệt nhẹ. Timeline: 1-2 sprints.
- **Đây là quyết định dễ rollback nhất** nhờ S3 API là industry standard.

---

*Tài liệu này tuân theo format Architecture Decision Record (ADR) của Michael Nygard.*
