# ADR-009: Operation-Based Routing qua RoutingProfile

## Metadata

| Field       | Value                          |
|-------------|--------------------------------|
| ADR ID      | ADR-009                        |
| Ngày tạo    | 2026-07-23                     |
| Trạng thái  | Accepted                       |
| Tác giả     | Architecture Team              |
| Liên quan   | ADR-007, ADR-008, ADR-010      |

---

## Status

**Accepted** — Áp dụng cho tất cả AI operations trong hệ thống.

---

## Context

AiDiLam có nhiều AI operations: text generation, image analysis, summarization, translation,
embedding generation, content moderation. Mỗi operation cần model phù hợp về capability,
latency, cost, và quality.

Vấn đề cần giải quyết:
- **Operation diversity**: Summarization cần comprehension model, translation cần multilingual model.
- **Failure handling**: Khi provider gặp sự cố, operation cần xử lý rõ ràng.
- **Consistency**: Cùng operation type phải route consistent toàn hệ thống.
- **Security**: Operation thiếu config hợp lệ không được execute — tránh unexpected behavior.
- **Observability**: Track operation nào dùng model nào, kết quả ra sao.

Hiện tại mỗi service tự quyết model, không có central routing strategy.

---

## Decision

1. **Each AI operation routes through a RoutingProfile** — Mỗi operation type map đến RoutingProfile cụ thể quyết định model, fallback, và constraints.
2. **Fail-closed on missing config** — Operation không có RoutingProfile hợp lệ FAIL ngay với `RoutingConfigNotFoundException` (HTTP 503). Không fallback to default, không guess model.

```
Request → Lookup RoutingProfile by operation_type
  ├── Found → Route to ModelConfig
  │     ├── Primary success → Return result
  │     └── Primary fail → Try fallbacks (if any)
  └── NOT Found → FAIL: RoutingConfigNotFoundException (503)
```

Mapping ví dụ:
| operation_type   | routing_profile_id | note                    |
|------------------|--------------------|-------------------------|
| text_generation  | rp-001             | General text            |
| summarization    | rp-002             | Document summarization  |
| image_analysis   | rp-003             | Vision model            |
| embedding        | rp-004             | Vector embedding        |

---

## Alternatives

### Alternative 1: Default Model Fallback
- Không có config → dùng default model. **Từ chối**: Dangerous, default có thể không phù hợp, cost explosion, fail-silent che giấu problems.

### Alternative 2: Operation Self-Routing
- Mỗi operation tự chọn model. **Từ chối**: Inconsistency, duplication routing logic, khó audit.

### Alternative 3: Static Routing Table trong Code
- Hardcode mapping. **Từ chối**: Không flexible, cần deploy để thay đổi (xem ADR-007).

---

## Consequences

### Tích cực
- Explicit routing path cho mọi operation, auditable và observable.
- Fail-fast: missing config phát hiện ngay, không side effects khó debug.
- Admin quản lý tất cả routing centrally. Mỗi operation optimized cho model phù hợp.
- Cost management: route cheap operations đến cheaper models.

### Tiêu cực
- Setup overhead: mỗi operation mới cần Admin tạo RoutingProfile trước.
- Developers không thể test AI operations thiếu routing config.
- Admin team có thể thành bottleneck. Config bị xóa → operation ngừng ngay.

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Admin quên tạo profile cho new operation | Medium | High | CI/CD verify all operations have mapping |
| Accidental deletion routing config | Low | Critical | Soft-delete, confirmation, backup |
| Fail-closed cascading failures | Low | High | Circuit breaker, alerting |
| Routing lookup latency | Low | Medium | Aggressive caching, preload startup |

---

## Validation

1. **Fail-closed**: Operation thiếu profile → `RoutingConfigNotFoundException`, HTTP 503.
2. **Routing**: Valid config → verify đúng model được gọi.
3. **Fallback**: Primary fail → verify fallback model used.
4. **CI/CD**: Deploy operation thiếu routing config → pipeline fails.
5. **Performance**: Routing resolution < 3ms cached.
6. **Admin flow**: Create profile → operation immediately available.

---

## Rollback

1. Thêm default RoutingProfile catch-all cho unmapped operations.
2. Chuyển fail-closed sang fail-open với default model.
3. Cho phép operations self-route nếu không tìm profile.
4. Tăng alerting khi operations dùng default. Timeline: 1 sprint Phase 1-2, thêm 2 sprints Phase 3.

**Lưu ý**: Fail-open tăng risk unexpected behavior và cost overrun.
