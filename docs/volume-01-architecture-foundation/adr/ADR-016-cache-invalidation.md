# ADR-016: Cache Invalidation Strategy cho Configuration Data

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-016 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Tác giả | Architecture Team |
| Liên quan | ADR-005, ADR-009 |

## Status

**Accepted** — Áp dụng cho tất cả configuration cache trong hệ thống AIĐiLàm.

## Context

Hệ thống AIĐiLàm sử dụng nhiều configuration data quan trọng bao gồm `ModelConfig` (cấu hình model AI) và `RoutingProfile` (profile định tuyến request). Những configuration này được cache tại application layer để giảm database load và cải thiện response time.

Vấn đề phát sinh khi admin cập nhật configuration trong database — cached data trở nên stale nhưng application vẫn sử dụng phiên bản cũ. Trước đây, giải pháp tạm thời là restart application để clear cache, gây downtime không cần thiết.

Yêu cầu cụ thể:
- Configuration thay đổi phải reflect trong vòng vài giây, không phải phút
- Không được yêu cầu application restart
- Phải đảm bảo consistency giữa các instance trong cluster
- Phải handle gracefully khi database không khả dụng tạm thời

## Decision

**Configuration cache (`ModelConfig`, `RoutingProfile`) sử dụng version-aware invalidation.** Cache entries bao gồm version number; khi database update xảy ra, version increment và stale entries bị evict. Không yêu cầu app restart.

Chi tiết implementation:
1. Mỗi configuration record trong database có trường `version` (integer, auto-increment on update)
2. Cache entry structure: `{ data, version, cachedAt }`
3. Background polling mỗi 5 giây kiểm tra version hiện tại từ database
4. Khi phát hiện version mismatch → evict stale entry → lazy reload on next access
5. Publish invalidation event qua Redis Pub/Sub để notify tất cả instances đồng thời

Cache key format: `config:{type}:{id}:v{version}`

## Alternatives

### Alternative 1: Time-based TTL Expiration
- Cache tự expire sau N giây cố định
- **Ưu điểm:** Đơn giản, không cần thêm infrastructure
- **Nhược điểm:** Trade-off giữa freshness và performance; TTL ngắn = nhiều DB hits, TTL dài = stale data lâu
- **Lý do loại bỏ:** Không đảm bảo configuration thay đổi được apply kịp thời cho critical routing decisions

### Alternative 2: Event-driven Invalidation (Database Triggers)
- Database trigger fire event khi row thay đổi
- **Ưu điểm:** Real-time invalidation
- **Nhược điểm:** Tight coupling với database engine, khó debug, không portable across database engines
- **Lý do loại bỏ:** Tăng operational complexity và lock-in vào specific database

### Alternative 3: Application Restart on Config Change
- Đơn giản deploy lại application khi config thay đổi
- **Ưu điểm:** Guaranteed fresh state
- **Nhược điểm:** Downtime, slow feedback loop, không scalable khi config thay đổi thường xuyên
- **Lý do loại bỏ:** Không chấp nhận được cho production system cần high availability

## Consequences

### Tích cực
- Configuration changes propagate trong vòng 5-10 giây across toàn bộ cluster
- Zero-downtime configuration updates — admin có thể thay đổi routing rules mà không ảnh hưởng traffic
- Giảm database load 90%+ cho configuration reads so với no-cache approach
- Version tracking cho phép audit trail và rollback configuration changes

### Tiêu cực
- Thêm complexity vào codebase — mỗi configuration access cần check version
- Redis Pub/Sub trở thành dependency cho cross-instance invalidation
- Window 5 giây có thể serve stale data trong worst case (polling interval)
- Cần careful handling của race conditions khi multiple updates xảy ra rapid-fire

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Redis Pub/Sub unavailable | Thấp | Trung bình | Fallback sang polling-only mode; cache vẫn invalidate qua version check |
| Version counter overflow | Rất thấp | Thấp | Sử dụng BigInt; reset counter khi đạt threshold với full cache flush |
| Race condition giữa concurrent updates | Trung bình | Thấp | Last-write-wins semantics; version chỉ tăng nên always converge to latest |
| Thundering herd khi cache invalidate | Trung bình | Trung bình | Implement cache stampede protection với mutex/singleflight pattern |
| Stale reads trong 5s window | Cao | Thấp | Acceptable trade-off; critical paths có thể force-refresh bypass cache |

## Validation

Tiêu chí xác nhận decision đúng đắn:
1. **Functional test:** Update `ModelConfig` trong database → verify tất cả instances serve new config within 10 giây
2. **Load test:** Simulate 1000 concurrent requests during cache invalidation → no errors, latency < 50ms p99
3. **Failure test:** Kill Redis → verify system degrades gracefully sang polling-only mode
4. **Consistency test:** Rapid-fire 10 config updates → verify final state consistent across all instances
5. **Monitoring:** Cache hit rate > 95% trong normal operation; invalidation events logged với timestamp

## Rollback

Nếu cần rollback decision này:
1. Disable version-aware invalidation feature flag
2. Revert sang simple TTL-based cache với TTL = 30 giây (conservative)
3. Remove Redis Pub/Sub subscription cho config invalidation channel
4. Giữ lại version column trong database (không cần remove, backward compatible)
5. Update monitoring alerts để track cache staleness thay vì version mismatches

**Estimated rollback time:** 15 phút (feature flag toggle + verify)
**Data loss risk:** Không — rollback chỉ ảnh hưởng caching behavior, không ảnh hưởng persisted data
