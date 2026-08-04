# ADR-007: ModelConfig và RoutingProfile là Database-Backed Entities

## Metadata

| Field       | Value                          |
|-------------|--------------------------------|
| ADR ID      | ADR-007                        |
| Ngày tạo    | 2026-07-23                     |
| Trạng thái  | Accepted                       |
| Tác giả     | Architecture Team              |
| Liên quan   | ADR-008, ADR-009, ADR-010      |

---

## Status

**Accepted** — Nền tảng cho toàn bộ AI routing infrastructure.

---

## Context

AiDiLam tích hợp nhiều AI models từ nhiều providers (OpenAI, Anthropic, Google, AWS Bedrock).
Mỗi model có configuration riêng và mỗi use case cần routing logic khác nhau.

Vấn đề hiện tại:
- **Hardcoded configs**: Model names và endpoints hardcode trong source, thay đổi cần deploy.
- **Không central management**: Developers tự configure, gây inconsistency.
- **Thiếu audit trail**: Không biết ai thay đổi config gì, khi nào.
- **Scaling difficulty**: Thêm provider/model mới requires code changes.
- **No A/B testing**: Không thể route traffic giữa models để compare.

---

## Decision

1. **ModelConfig là database-backed entity** — Schema: `model_id`, `provider`, `model_name`, `default_parameters`, `rate_limits`, `cost_per_token`, `status`.
2. **RoutingProfile là database-backed entity** — Schema: `profile_id`, `name`, `primary_model_config_id`, `fallback_model_config_ids[]`, `routing_strategy`, `constraints`.
3. **Managed by Admin** — Chỉ Admin role có quyền CRUD qua Admin API/UI.
4. **No hardcoded model/provider** — Source code không chứa model name, provider URL, hay API key. Resolve tại runtime từ database.

```
┌─────────────────┐       ┌──────────────────┐
│  RoutingProfile │──────▶│   ModelConfig    │
│  - strategy     │       │   - provider     │
│  - fallbacks    │       │   - model_name   │
└─────────────────┘       └──────────────────┘
        │                          │
        ▼                          ▼
   [Runtime Resolution]     [Provider SDK Call]
```

---

## Alternatives

### Alternative 1: Configuration Files (YAML/JSON)
- Deploy cùng app. **Từ chối**: Thay đổi cần redeploy, không RBAC, không audit trail.

### Alternative 2: Environment Variables
- Model config qua env vars. **Từ chối**: Không scale, khó complex routing, restart required.

### Alternative 3: Feature Flag Service
- Dùng LaunchDarkly. **Từ chối**: Không designed cho complex objects, vendor dependency, cost cao.

### Alternative 4: Hardcoded Constants
- Giữ nguyên. **Từ chối**: Hoàn toàn không flexible, mỗi thay đổi cần PR + deploy.

---

## Consequences

### Tích cực
- Dynamic config thay đổi tức thì, không deploy. Centralized management.
- Audit trail đầy đủ (`who`, `when`, `what`). RBAC enforce Admin-only.
- A/B testing ready với percentage-based routing. Cost visibility per token.

### Tiêu cực
- Database dependency cho AI routing. Cần caching layer tránh DB query mỗi request.
- Migration effort cho existing hardcoded configs. Cần build Admin UI.

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| DB outage → AI unavailable | Low | Critical | Local cache + last-known-good fallback |
| Admin misconfiguration | Medium | High | Validation rules, dry-run, rollback |
| Cache staleness | Medium | Medium | Event-driven invalidation, short TTL |
| DB lookup performance | Low | Medium | L1 in-memory + L2 Redis caching |

---

## Validation

1. **RBAC**: Non-admin CRUD → expect 403 Forbidden.
2. **Dynamic update**: Change config → verify next request uses new config within TTL.
3. **Fallback**: Primary model down → verify routing to fallback.
4. **Audit**: CRUD operations → audit log with full metadata.
5. **Performance**: Config resolution < 5ms cached. DB down → cached configs serve.

---

## Rollback

1. Export ModelConfig/RoutingProfile từ database sang config files.
2. Update app code read từ files thay vì database.
3. Deploy config files cùng application, remove DB dependency.
4. Deprecate Admin UI. Database records archived. Timeline: 3 sprints.

**Lưu ý**: Rollback mất dynamic configuration và audit trail.
