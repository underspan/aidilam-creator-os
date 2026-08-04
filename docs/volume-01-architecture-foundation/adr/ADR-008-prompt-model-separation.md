# ADR-008: Tách biệt PromptTemplate Content khỏi Model Configuration

## Metadata

| Field       | Value                          |
|-------------|--------------------------------|
| ADR ID      | ADR-008                        |
| Ngày tạo    | 2026-07-23                     |
| Trạng thái  | Accepted                       |
| Tác giả     | Architecture Team              |
| Liên quan   | ADR-007, ADR-009               |

---

## Status

**Accepted** — Áp dụng cho toàn bộ prompt management system.

---

## Context

PromptTemplates là core building blocks cho mọi AI operation trong AiDiLam. Mỗi template chứa
instructions, variables, và expected output schema.

Vấn đề khi prompt content coupling với model configuration:
- **Portability**: Prompt tốt nên work trên nhiều models. Model-specific info phá portability.
- **Version noise**: Checksum bao gồm model info → thay đổi model tạo version mới không cần thiết.
- **Testing**: Muốn compare cùng prompt trên nhiều models, coupling gây phức tạp.
- **Separation of concerns**: Prompt engineers focus content, infra team focus model selection.
- **Checksum reliability**: Nên reflect content changes, không phải infrastructure changes.

Hiện tại PromptTemplate chứa cả `content`, `model_name`, `provider`, `temperature` cùng record.

---

## Decision

1. **PromptTemplate content separated from model configuration** — Chỉ chứa: `template_id`, `name`, `content`, `variables[]`, `output_schema`, `version`, `checksum`.
2. **Model configuration lives in ModelConfig** (ADR-007) — Tham chiếu qua RoutingProfile, không embed.
3. **Checksum excludes model/provider info** — `checksum = SHA-256(content + variables + output_schema)`. Routing changes không tạo new version.

```
PromptTemplate (content-focused)        ModelConfig (infra-focused)
├── template_id                         ├── model_id
├── name                                ├── provider
├── content                             ├── model_name
├── variables[]                         └── parameters
├── output_schema
├── version (increment on content change)
└── checksum (content fields only)
```

Runtime binding: `Operation → RoutingProfile → (PromptTemplate + ModelConfig)`

---

## Alternatives

### Alternative 1: Embedded Model Info trong PromptTemplate
- Giữ nguyên. **Từ chối**: Tight coupling, false checksum changes, no portability.

### Alternative 2: Separate nhưng Checksum Include Model Info
- Tách entity, checksum vẫn include model. **Từ chối**: False version bumps khi routing changes.

### Alternative 3: PromptTemplate per Model
- Mỗi model có prompt riêng. **Từ chối**: Massive duplication, maintenance nightmare.

---

## Consequences

### Tích cực
- Clean separation: prompt engineers và infra engineers work independently.
- Reliable checksum chỉ reflect actual content changes. Model portability tốt.
- Simpler versioning phản ánh content evolution. A/B test cùng prompt nhiều models.
- Stable checksum → better response caching.

### Tiêu cực
- Runtime cần resolve cả PromptTemplate + ModelConfig (thêm lookup).
- Migration effort extract model info. Potential mismatch prompt-model compatibility.
- Team cần training hiểu separation boundary.

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Prompt incompatible với routed model | Medium | Medium | Compatibility matrix, pre-bind validation |
| Orphaned prompts không referenced | Low | Low | Cleanup job, usage tracking |
| Performance overhead separate lookups | Low | Low | Eager loading, cache together |
| Migration bugs extract model info | Medium | Medium | Phased migration, dual-read period |

---

## Validation

1. **Checksum stability**: Change RoutingProfile → prompt checksum unchanged.
2. **Checksum change**: Modify content → checksum changes, version increments.
3. **Portability**: Same prompt bind 3+ ModelConfigs → all produce valid output.
4. **Schema compliance**: PromptTemplate entity has zero model/provider fields.
5. **Performance**: Template + Config resolution < 10ms end-to-end.

---

## Rollback

1. Add model/provider fields back vào PromptTemplate entity.
2. Populate model info từ current RoutingProfile bindings.
3. Update checksum calculation include model info. Recalculate all checksums.
4. ModelConfig records giữ nguyên (used by ADR-007). Timeline: 2 sprints.

**Lưu ý**: Rollback reintroduce coupling, mất portability benefits.
