# ADR-006: Immutable Assets và Lineage Tracking

## Metadata

| Field       | Value                          |
|-------------|--------------------------------|
| ADR ID      | ADR-006                        |
| Ngày tạo    | 2026-07-23                     |
| Trạng thái  | Accepted                       |
| Tác giả     | Architecture Team              |
| Liên quan   | ADR-001, ADR-003               |

---

## Status

**Accepted** — Áp dụng cho toàn bộ hệ thống quản lý media assets.

---

## Context

Hệ thống AiDiLam xử lý lượng lớn media assets (hình ảnh, video, audio, documents). Các assets gốc
thường được transform thành nhiều derived versions (thumbnail, compressed, transcoded, watermarked).

Vấn đề cần giải quyết:
- **Data integrity**: Original asset không được modify sau upload, tránh mất dữ liệu gốc.
- **Traceability**: Cần biết derived asset nào được tạo từ đâu, bằng pipeline nào.
- **Deduplication**: Nhiều users upload cùng file gây lãng phí storage.
- **Compliance**: Giữ nguyên bản gốc cho audit trail và legal hold.

Trước đây hệ thống cho phép overwrite, không track lineage, không dedup — gây data inconsistency.

---

## Decision

1. **Original media assets are immutable** — Sau upload, original không thể modified/overwritten. Mọi thay đổi tạo version mới.
2. **All derived assets track lineage** — Mỗi derived asset reference `parent_asset_id` và `transformation_pipeline_id`.
3. **Checksums for deduplication** — SHA-256 checksum cho mọi asset. Trùng checksum → tạo reference thay vì copy.

```
Original Asset (immutable)
├── Derived A (thumbnail) ─ parent_asset_id → Original
├── Derived B (compressed) ─ parent_asset_id → Original
│   └── Derived C (watermarked) ─ parent_asset_id → B
└── Derived D (transcoded) ─ parent_asset_id → Original
```

---

## Alternatives

### Alternative 1: Mutable Assets với Version History
- Cho phép overwrite, giữ version history. **Từ chối**: Risk mất data khi pruning, phức tạp hơn immutability.

### Alternative 2: Copy-on-Write không Lineage
- Immutable nhưng không track parent-child. **Từ chối**: Mất traceability, không cascade delete.

### Alternative 3: Client-side Dedup Only
- Dedup chỉ ở client. **Từ chối**: Không tin cậy, bypass được, không cover server-side transforms.

---

## Consequences

### Tích cực
- Original assets bảo vệ tuyệt đối, không risk corruption.
- Full traceability từ derived về original source.
- Dedup giảm 20-40% storage costs. Compliance ready cho audit/legal.
- Cache-friendly với content-addressable URLs (immutable = cacheable forever).

### Tiêu cực
- Lineage metadata tăng storage ~5%. Transform pipeline phải aware lineage.
- Soft-delete original cần cascade handling. SHA-256 large files tốn CPU (cần async).

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Orphaned derived assets | Low | Medium | Scheduled integrity checks |
| Checksum collision | Negligible | High | Thêm file size comparison |
| Storage explosion nếu dedup fails | Low | High | Monitoring alerts on growth |
| Checksum bottleneck large files | Medium | Medium | Async streaming computation |

---

## Validation

1. **Immutability test**: Modify original asset → expect `ImmutableAssetException`.
2. **Dedup test**: Upload duplicate → verify 1 physical copy, 2 references.
3. **Lineage test**: Transform asset → verify `parent_asset_id` chain chính xác.
4. **Performance**: Checksum < 500ms cho files < 100MB.
5. **Monthly audit**: Report dedup savings và lineage integrity.

---

## Rollback

1. Disable immutability constraint — cho phép update trên assets table.
2. Migrate lineage metadata sang separate audit log (giữ data).
3. Disable dedup — mỗi upload tạo physical copy mới.
4. Existing lineage data archive, không delete. Timeline: 2 sprints.

**Lưu ý**: Rollback mất dedup savings và traceability capabilities.
