# ADR-001: Modular Monolith Architecture

## Metadata

| Field | Value |
|-------|-------|
| **Ngày tạo** | 2026-07-23 |
| **Người đề xuất** | Architecture Team |
| **Trạng thái** | Accepted |
| **Phiên bản** | 1.0 |

## Status

**Accepted** — Quyết định này đã được chấp thuận và áp dụng cho toàn bộ hệ thống Aidilam.

## Context

Hệ thống Aidilam đang trong giai đoạn khởi tạo. Đội ngũ phát triển có quy mô nhỏ (2-5 người) và cần
tốc độ phát triển nhanh trong giai đoạn đầu. Chúng ta đối mặt với các thách thức sau:

- Yêu cầu nghiệp vụ chưa ổn định, bounded contexts có thể thay đổi khi hiểu sâu hơn về domain.
- Chi phí vận hành microservices quá cao cho giai đoạn khởi đầu (service mesh, distributed tracing,
  API gateway, container orchestration).
- Đội ngũ nhỏ không có đủ bandwidth để quản lý nhiều deployable units riêng biệt.
- Cần khả năng refactor nhanh khi ranh giới giữa các bounded contexts thay đổi.
- Việc tách microservices quá sớm sẽ dẫn đến distributed monolith — tệ hơn cả monolith thuần túy.

## Decision

**Chúng ta quyết định bắt đầu với kiến trúc modular monolith**, tổ chức dưới dạng packages trong
monorepo, trước khi chuyển sang microservices.

Cụ thể:

1. **Bounded contexts được triển khai dưới dạng packages** (không phải services riêng biệt).
2. Mỗi package có ranh giới rõ ràng với public API (exported interfaces) và internal implementation.
3. Giao tiếp giữa các packages thông qua in-process function calls và event bus nội bộ.
4. Mỗi package sở hữu riêng schema trong cùng một PostgreSQL database (schema-per-module).
5. Không cho phép cross-module database queries trực tiếp — chỉ thông qua public API của module.
6. Monorepo sử dụng workspace (pnpm workspaces hoặc Nx) để quản lý dependencies.
7. Khi một bounded context đủ ổn định và cần scale độc lập, tách thành microservice.

## Alternatives Considered

### 1. Microservices từ đầu
- **Ưu điểm**: Scalability độc lập, technology diversity, team autonomy.
- **Nhược điểm**: Operational complexity quá cao, distributed data management phức tạp,
  network latency giữa services, đội ngũ nhỏ không kham nổi.
- **Lý do bị loại**: Premature optimization — tách quá sớm khi chưa hiểu rõ domain boundaries.

### 2. Traditional monolith (không modular)
- **Ưu điểm**: Đơn giản nhất để bắt đầu, một codebase duy nhất.
- **Nhược điểm**: Không có ranh giới rõ ràng, dễ tạo coupling, khó tách sau này.
- **Lý do bị loại**: Khi cần scale, việc tách từ spaghetti monolith ra microservices cực kỳ đau đớn.

### 3. Serverless-first (AWS Lambda/Cloud Functions)
- **Ưu điểm**: Không cần quản lý infrastructure, auto-scaling.
- **Nhược điểm**: Cold start latency, vendor lock-in, khó debug locally, chi phí khó dự đoán.
- **Lý do bị loại**: Không phù hợp với media processing workloads và long-running tasks.

## Consequences

### Tích cực
- **Tốc độ phát triển cao** trong giai đoạn đầu nhờ giảm operational overhead.
- **Refactoring dễ dàng** vì tất cả code trong cùng monorepo, IDE hỗ trợ tốt.
- **Testing đơn giản hơn** — integration tests chạy in-process, không cần docker-compose phức tạp.
- **Deploy đơn giản** — một artifact duy nhất, một CI/CD pipeline.
- **Đường chuyển đổi rõ ràng** sang microservices khi cần (vì đã có module boundaries).

### Tiêu cực
- **Scaling bị giới hạn** — toàn bộ hệ thống scale cùng nhau (vertical trước, horizontal sau).
- **Single point of failure** — lỗi ở một module có thể ảnh hưởng toàn hệ thống.
- **Kỷ luật cần cao** — developers phải tuân thủ module boundaries, không "shortcut" qua internal APIs.
- **Technology lock-in ở mức ngôn ngữ** — tất cả modules phải dùng cùng runtime (Node.js).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Module boundaries bị vi phạm theo thời gian | Cao | Trung bình | Lint rules, architectural tests (ArchUnit pattern), code review checklist |
| Khó scale khi traffic tăng đột biến | Trung bình | Cao | Horizontal scaling toàn app, caching layer, tách hot modules sớm |
| Đội ngũ mới không hiểu module boundaries | Trung bình | Trung bình | Documentation rõ ràng, onboarding guide, dependency diagrams |
| Circular dependencies giữa modules | Trung bình | Cao | Dependency graph analysis trong CI, strict import rules |

## Validation

Quyết định này được coi là thành công khi:

1. **Metric**: Thời gian từ commit đến production < 15 phút (single pipeline).
2. **Metric**: Không có cross-module direct database access (kiểm tra bằng lint rules).
3. **Metric**: Mỗi module có thể test độc lập với coverage > 80%.
4. **Milestone**: Sau 6 tháng, ít nhất 1 module có thể tách thành service riêng trong < 1 sprint.
5. **Review**: Architectural review hàng quý để đánh giá lại ranh giới modules.

## Rollback / Reversibility

### Mức độ khả thi: Trung bình

- **Chuyển sang microservices**: Vì mỗi module đã có ranh giới rõ ràng, việc extract thành
  service riêng khả thi bằng cách: tạo API layer (REST/gRPC), tách database schema,
  thay in-process calls bằng network calls.
- **Timeline ước tính**: 2-4 sprints cho mỗi module được tách.
- **Trigger để tách**: Khi một module cần scale độc lập, hoặc đội ngũ phát triển module đó
  cần deploy cycle riêng biệt.
- **Lưu ý**: Không rollback về traditional monolith — đó là bước lùi về kiến trúc.

---

*Tài liệu này tuân theo format Architecture Decision Record (ADR) của Michael Nygard.*
