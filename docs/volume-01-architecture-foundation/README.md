# Volume 01 – Architecture Foundation

> **Mã dự án:** AIDILAM-ARCH-001
> **Trạng thái:** Đang phát triển (In Progress)
> **Phiên bản:** 1.0.0-draft

---

## Tổng quan

Volume 01 – Architecture Foundation là tập tài liệu nền tảng kiến trúc cho hệ thống **AIĐiLàm**.
Tập tài liệu này bao gồm các quyết định thiết kế cốt lõi, mô hình domain, chiến lược bảo mật,
và hướng dẫn vận hành — tạo thành "source of truth" cho toàn bộ đội ngũ phát triển.

### Đối tượng sử dụng

- Software Architects & Tech Leads
- Backend / Frontend / DevOps Engineers
- Security Engineers
- Product Managers (phần overview)

### Cách sử dụng

1. Đọc tuần tự từ tài liệu 01 → 28 để hiểu tổng thể kiến trúc.
2. Hoặc tra cứu theo chủ đề qua bảng mục lục bên dưới.
3. Tham khảo phần ADR để hiểu lý do đằng sau mỗi quyết định.

---

## Mục lục tài liệu

| # | Tên tài liệu | Mô tả | Số dòng |
|---|---|---|---|
| 01 | System Overview | Tổng quan hệ thống AIĐiLàm, vision, và high-level architecture | ~150 |
| 02 | Domain Model | Mô hình domain chính, entities, và relationships | ~200 |
| 03 | Bounded Contexts | Phân chia bounded contexts và context mapping | ~180 |
| 04 | Service Architecture | Kiến trúc microservices, communication patterns | ~220 |
| 05 | API Design | Quy chuẩn thiết kế API (REST, gRPC, WebSocket) | ~160 |
| 06 | Authentication & Identity | Xác thực người dùng, identity provider, session management | ~190 |
| 07 | Authorization & RBAC | Phân quyền dựa trên vai trò, policy engine | ~170 |
| 08 | Multi-Tenancy & Workspace Isolation | Chiến lược cách ly dữ liệu giữa các workspace | ~200 |
| 09 | Data Architecture | Thiết kế database, sharding strategy, data modeling | ~210 |
| 10 | Event-Driven Architecture | Domain Events, event bus, eventual consistency | ~180 |
| 11 | Job Orchestration & BullMQ | Hàng đợi công việc, worker management, retry policies | ~190 |
| 12 | Media Processing Pipeline | Pipeline xử lý media: upload, transcode, delivery | ~220 |
| 13 | AI Model Router | Định tuyến model AI, fallback chain, load balancing | ~200 |
| 14 | Prompt Management | Quản lý PromptTemplate, versioning, governance | ~170 |
| 15 | Content Discovery & Search | Tìm kiếm ngữ nghĩa với Qdrant, recommendation engine | ~160 |
| 16 | Storage Architecture (MinIO) | Object storage, bucket strategy, lifecycle policies | ~150 |
| 17 | Caching Strategy (Redis) | Caching layers, invalidation patterns, session store | ~140 |
| 18 | Security Architecture | Threat model, SSRF prevention, Fail-Closed principle | ~230 |
| 19 | Container & Runtime Security | Non-Root containers, image scanning, resource limits | ~160 |
| 20 | Observability & Tracing | Distributed tracing, metrics, logging, Underspan | ~180 |
| 21 | Deployment Architecture | Kubernetes setup, Helm charts, environment strategy | ~190 |
| 22 | CI/CD Pipeline | Build, test, deploy automation, quality gates | ~170 |
| 23 | Disaster Recovery | Backup strategy, RTO/RPO, failover procedures | ~150 |
| 24 | Performance & Scalability | Load testing, auto-scaling, capacity planning | ~160 |
| 25 | Developer Experience | Local dev setup, coding standards, tooling | ~140 |
| 26 | Migration & Versioning | Database migration strategy, API versioning | ~130 |
| 27 | Cost Management | Resource budgeting, provider cost tracking, optimization | ~120 |
| 28 | Glossary (Bảng Thuật Ngữ) | Định nghĩa các thuật ngữ kỹ thuật chính trong kiến trúc | ~180 |

---

## Architecture Decision Records (ADRs)

Các ADR ghi lại quyết định kiến trúc quan trọng, bối cảnh ra quyết định, và hệ quả.

| ADR # | Tiêu đề | Trạng thái | Ngày |
|---|---|---|---|
| ADR-001 | Sử dụng UUID v7 làm primary key | Accepted | 2026-05-10 |
| ADR-002 | Chọn BullMQ thay vì RabbitMQ cho job queue | Accepted | 2026-05-12 |
| ADR-003 | Áp dụng Fail-Closed cho toàn bộ security layer | Accepted | 2026-05-15 |
| ADR-004 | Sử dụng MinIO thay vì cloud-native object storage | Accepted | 2026-05-18 |
| ADR-005 | Chọn Qdrant cho vector search thay vì Pinecone | Accepted | 2026-05-20 |
| ADR-006 | Multi-tenant isolation qua row-level security | Accepted | 2026-05-22 |
| ADR-007 | Model Router pattern thay vì direct provider calls | Accepted | 2026-05-25 |
| ADR-008 | Idempotency Key bắt buộc cho mutation operations | Accepted | 2026-06-01 |
| ADR-009 | Non-Root container policy cho tất cả workloads | Accepted | 2026-06-05 |
| ADR-010 | Event-driven communication giữa bounded contexts | Accepted | 2026-06-10 |

> **Lưu ý:** Chi tiết từng ADR được lưu trong thư mục `./adrs/` với format theo template
> [Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

---

## Cấu trúc thư mục

```
volume-01-architecture-foundation/
├── README.md                  ← Tệp này
├── 01_system_overview.md
├── 02_domain_model.md
├── ...
├── 28_glossary.md
└── adrs/
    ├── ADR-001_uuid-v7.md
    ├── ADR-002_bullmq.md
    └── ...
```

---

## Quy ước viết tài liệu

- **Ngôn ngữ:** Tiếng Việt, giữ nguyên thuật ngữ kỹ thuật tiếng Anh.
- **Format:** Markdown (GitHub Flavored Markdown).
- **Diagrams:** Sử dụng Mermaid hoặc PlantUML inline.
- **Versioning:** Mỗi tài liệu có header ghi ngày cập nhật.

---

## Liên kết

- Volume 02 – Implementation Guide (planned)
- Volume 03 – Operations Runbook (planned)
- Volume 04 – API Reference (planned)

---

*Tài liệu thuộc dự án AIDILAM-ARCH-001.*
*Tạo bởi: Architecture Team – AIĐiLàm*
*Cập nhật lần cuối: 2026-07-23*
