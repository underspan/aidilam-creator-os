# 28. Bảng Thuật Ngữ (Glossary)

> **Volume 01 – Architecture Foundation**
> Tài liệu tham chiếu nhanh các thuật ngữ chính được sử dụng xuyên suốt kiến trúc AIĐiLàm.

---

## Mục đích

Bảng thuật ngữ này cung cấp định nghĩa ngắn gọn, nhất quán cho tất cả các khái niệm kỹ thuật
quan trọng trong hệ thống AIĐiLàm. Các thuật ngữ được sắp xếp theo thứ tự bảng chữ cái (A–Z)
để tiện tra cứu.

---

## Quy ước

- **Thuật ngữ gốc tiếng Anh** được giữ nguyên khi chưa có bản dịch phổ biến.
- Giải thích bằng tiếng Việt, kèm ngữ cảnh sử dụng trong kiến trúc AIĐiLàm.
- Tham chiếu chéo được đánh dấu bằng ký hiệu → (xem thêm).

---

## Bảng Thuật Ngữ

### A

**AIĐiLàm**
Nền tảng AI hỗ trợ công việc (AI-powered work assistant platform). Đây là tên chính thức
của hệ thống, kết hợp "AI" + "Đi Làm" — phản ánh sứ mệnh đưa AI vào quy trình làm việc
hàng ngày của người dùng Việt Nam.

**Asset Lineage**
Chuỗi truy vết nguồn gốc tài nguyên (asset). Ghi lại toàn bộ lịch sử biến đổi của một
MediaAsset từ lúc upload gốc, qua các bước xử lý (transcode, crop, enhance), cho đến
phiên bản cuối cùng được phân phối. Hỗ trợ audit và rollback.
→ Xem thêm: MediaAsset

### B

**Bounded Context**
Ngữ cảnh giới hạn — khái niệm từ Domain-Driven Design (DDD). Mỗi Bounded Context trong
AIĐiLàm đại diện cho một miền nghiệp vụ độc lập (ví dụ: Media Processing, Prompt Management,
User Identity) với mô hình dữ liệu và ngôn ngữ riêng.

**BullMQ**
Thư viện quản lý hàng đợi công việc (job queue) dựa trên Redis, được sử dụng trong AIĐiLàm
để điều phối các tác vụ bất đồng bộ như render video, xử lý ảnh, và gọi API provider.
Hỗ trợ retry, priority, rate limiting, và delayed jobs.
→ Xem thêm: Job Orchestration, Redis

### C

**Content Discovery**
Cơ chế khám phá nội dung — module cho phép người dùng tìm kiếm, đề xuất, và duyệt nội dung
(templates, assets, workflows) dựa trên semantic search và collaborative filtering.
→ Xem thêm: Qdrant

### D

**Dead Letter Queue (DLQ)**
Hàng đợi chứa các message/job đã thất bại sau tất cả lần retry. Trong AIĐiLàm, DLQ được
dùng để cô lập lỗi, tránh block pipeline chính, và cho phép đội vận hành phân tích
nguyên nhân lỗi mà không mất dữ liệu.
→ Xem thêm: BullMQ

**Domain Event**
Sự kiện miền — một fact bất biến ghi nhận rằng điều gì đó đã xảy ra trong hệ thống
(ví dụ: `MediaAssetTranscoded`, `PromptExecuted`, `WorkspaceCreated`). Domain Events là
cơ chế giao tiếp chính giữa các Bounded Context, đảm bảo loose coupling.
→ Xem thêm: Bounded Context

### F

**Fail-Closed**
Chiến lược an toàn mặc định: khi một thành phần không thể xác minh hoặc xử lý yêu cầu
(ví dụ: authorization service không phản hồi), hệ thống sẽ TỪ CHỐI thay vì cho phép.
Nguyên tắc này áp dụng cho toàn bộ security layer của AIĐiLàm.

**FFmpeg**
Bộ công cụ mã nguồn mở xử lý multimedia (video, audio, image). AIĐiLàm sử dụng FFmpeg
trong pipeline Media Processing để transcode, cắt ghép, thêm watermark, và tạo thumbnail.
Được chạy trong Non-Root Container với resource limits.
→ Xem thêm: Non-Root Container, Render Preset

### H

**Heartbeat**
Tín hiệu "còn sống" — cơ chế định kỳ (thường mỗi 30 giây) để worker báo cáo trạng thái
hoạt động cho orchestrator. Nếu heartbeat bị miss quá ngưỡng, job sẽ được coi là stuck
và có thể được reassign.
→ Xem thêm: Lease, Job Orchestration

### I

**Idempotency Key**
Khóa đảm bảo tính idempotent — một identifier duy nhất gắn với mỗi request để đảm bảo
rằng việc gửi lại cùng request nhiều lần chỉ tạo ra đúng một side-effect. Trong AIĐiLàm,
idempotency key được yêu cầu cho mọi mutation operation quan trọng.

### J

**Job Orchestration**
Điều phối công việc — hệ thống quản lý lifecycle của các tác vụ bất đồng bộ: tạo job,
phân phối đến worker phù hợp, theo dõi tiến trình, xử lý retry/failure, và ghi nhận kết quả.
BullMQ là implementation chính trong AIĐiLàm.
→ Xem thêm: BullMQ, Heartbeat, Dead Letter Queue

### L

**Lease**
Hợp đồng thuê tạm thời — cơ chế cấp quyền xử lý một job cho worker trong khoảng thời gian
giới hạn. Nếu worker không gia hạn lease (thông qua heartbeat), job sẽ được giải phóng
để worker khác nhận. Tránh tình trạng job bị "kẹt" vĩnh viễn.
→ Xem thêm: Heartbeat

### M

**MediaAsset**
Thực thể trung tâm trong domain Media Processing — đại diện cho một tệp media (video, ảnh,
audio) cùng metadata, trạng thái xử lý, và lịch sử biến đổi (lineage).
→ Xem thêm: Asset Lineage

**MinIO**
Hệ thống object storage tương thích S3 API, được AIĐiLàm sử dụng làm storage layer chính
cho media assets. Hỗ trợ multi-tenant bucket isolation, versioning, và lifecycle policies.
→ Xem thêm: Workspace Isolation

**ModelConfig**
Cấu hình mô hình AI — entity chứa thông tin kết nối, tham số mặc định, giới hạn token,
pricing, và health status của một AI model cụ thể (ví dụ: GPT-4o, Claude 3.5, Gemini Pro).
→ Xem thêm: Model Router

**Model Router**
Bộ định tuyến mô hình — component quyết định model AI nào sẽ xử lý một request cụ thể,
dựa trên RoutingProfile, trạng thái health của provider, cost constraints, và yêu cầu
về capability. Hỗ trợ fallback chain và load balancing.
→ Xem thêm: ModelConfig, RoutingProfile, Provider Adapter

### N

**Non-Root Container**
Container chạy với user không phải root (UID ≠ 0). Đây là yêu cầu bắt buộc trong AIĐiLàm
để giảm thiểu attack surface — đặc biệt quan trọng cho các container xử lý untrusted input
như FFmpeg processing.
→ Xem thêm: FFmpeg

### O

**Operation (routing)**
Đơn vị định tuyến — một thao tác cụ thể mà người dùng yêu cầu AI thực hiện (ví dụ:
`text-generation`, `image-edit`, `code-review`). Model Router sử dụng operation type
để xác định model nào có capability phù hợp.
→ Xem thêm: Model Router

### P

**Platform Session**
Phiên làm việc nền tảng — đại diện cho một session đăng nhập của người dùng, bao gồm
authentication state, workspace context hiện tại, và các quyền đã được resolve.
Có thời gian sống giới hạn và hỗ trợ refresh mechanism.

**Prompt Governance**
Quản trị prompt — tập hợp chính sách và cơ chế kiểm soát việc sử dụng prompt trong tổ chức:
approval workflow, version control, audit trail, cost tracking, và content safety filtering.
→ Xem thêm: PromptTemplate

**PromptTemplate**
Mẫu prompt — entity chứa cấu trúc prompt có thể tái sử dụng với các biến (variables),
metadata (tác giả, phiên bản, tags), và cấu hình thực thi (model preference, temperature).
Là đơn vị cơ bản trong Prompt Management domain.
→ Xem thêm: Prompt Governance

**Provider Adapter**
Bộ chuyển đổi provider — abstraction layer giữa Model Router và từng AI provider cụ thể
(OpenAI, Anthropic, Google, v.v.). Chuẩn hóa request/response format, xử lý authentication,
retry logic, và rate limiting cho mỗi provider.
→ Xem thêm: Model Router

### Q

**Qdrant**
Vector database mã nguồn mở được AIĐiLàm sử dụng cho semantic search, content discovery,
và RAG (Retrieval-Augmented Generation). Lưu trữ embeddings của documents, prompts,
và media metadata.
→ Xem thêm: Content Discovery

### R

**RBAC (Role-Based Access Control)**
Kiểm soát truy cập dựa trên vai trò — mô hình phân quyền trong đó permissions được gán
cho roles, và users được gán roles. AIĐiLàm sử dụng RBAC kết hợp với workspace context
để tạo multi-tenant authorization.
→ Xem thêm: Workspace Isolation

**Redis**
In-memory data store được sử dụng trong AIĐiLàm cho nhiều mục đích: backing store cho
BullMQ, caching layer, session storage, distributed locking, và rate limiting counters.
→ Xem thêm: BullMQ

**Render Preset**
Cấu hình render định sẵn — tập hợp các tham số output cho media processing (resolution,
codec, bitrate, format). Người dùng chọn preset thay vì cấu hình thủ công từng tham số.
Ví dụ: "YouTube 1080p", "Instagram Story", "Thumbnail 320px".
→ Xem thêm: FFmpeg, MediaAsset

**Routing Analytics**
Phân tích định tuyến — module thu thập và phân tích dữ liệu về performance, cost, và
reliability của các routing decision. Cung cấp insights để tối ưu RoutingProfile và
phát hiện anomaly.
→ Xem thêm: Model Router, RoutingProfile

**RoutingProfile**
Hồ sơ định tuyến — cấu hình mô tả chiến lược chọn model cho một workspace hoặc use case:
preferred providers, fallback order, budget limits, latency requirements, và quality thresholds.
→ Xem thêm: Model Router, Routing Analytics

### S

**SAN (Subject Alternative Name)**
Trường mở rộng trong TLS certificate cho phép một certificate phục vụ nhiều domain/subdomain.
Trong AIĐiLàm, SAN được sử dụng cho internal service mesh certificates và multi-tenant
custom domain support.

**Seed Default**
Giá trị mặc định khởi tạo — dữ liệu được tự động tạo khi provision một workspace hoặc
tenant mới (ví dụ: default roles, sample templates, initial settings). Đảm bảo trải nghiệm
onboarding nhất quán.

**SSRF (Server-Side Request Forgery)**
Lỗ hổng bảo mật cho phép attacker khiến server thực hiện request đến địa chỉ không mong muốn
(internal network, metadata endpoints). AIĐiLàm áp dụng allowlist, network segmentation,
và input validation để phòng chống SSRF.
→ Xem thêm: Fail-Closed

### U

**Underspan**
Span con trong distributed tracing — đại diện cho một đơn vị công việc nhỏ hơn bên trong
một parent span. Được sử dụng để đo lường chi tiết performance của từng bước trong pipeline
(ví dụ: thời gian chờ queue, thời gian xử lý FFmpeg, thời gian upload MinIO).

**UUID v7**
Phiên bản 7 của Universally Unique Identifier — format ID kết hợp timestamp (time-ordered)
với random bits. AIĐiLàm sử dụng UUID v7 làm primary key cho hầu hết entities vì:
sắp xếp được theo thời gian, không cần coordination, và tương thích với B-tree indexes.

### W

**Workspace Isolation**
Cách ly workspace — nguyên tắc đảm bảo dữ liệu và tài nguyên của mỗi workspace (tổ chức/
nhóm) hoàn toàn tách biệt. Được thực thi ở nhiều layer: database (row-level security),
storage (bucket prefix), queue (namespace), và network (network policy).
→ Xem thêm: RBAC, MinIO

---

## Tham khảo

- Domain-Driven Design Reference — Eric Evans
- Building Microservices — Sam Newman
- OWASP Application Security Verification Standard (ASVS)

---

*Tài liệu thuộc Volume 01 – Architecture Foundation, dự án AIDILAM-ARCH-001.*
*Cập nhật lần cuối: 2026-07-23*
