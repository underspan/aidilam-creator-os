# ADR-017: Browser/Client Không Có Authority Về Routing Decisions

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-017 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Tác giả | Architecture Team |
| Liên quan | ADR-009, ADR-016 |

## Status

**Accepted** — Nguyên tắc bất biến, áp dụng cho mọi client-server interaction trong hệ thống.

## Context

Trong hệ thống AIĐiLàm, routing decisions bao gồm: chọn AI model nào để xử lý request, chọn provider nào (OpenAI, Anthropic, local model), và apply routing rules nào (load balancing, failover, cost optimization). Đây là những quyết định critical ảnh hưởng đến cost, quality, và reliability.

Một số implementation pattern phổ biến cho phép client gửi "preferences" hoặc direct model selection trong request payload. Ví dụ: `{ model: "gpt-4", provider: "openai" }` từ frontend. Pattern này tạo ra nhiều security và consistency risks.

Lý do cần explicit decision:
- Client-side code có thể bị tamper hoặc reverse-engineer
- Routing logic thay đổi thường xuyên theo business rules, cost optimization
- Consistency giữa clients khó đảm bảo khi logic phân tán
- Audit trail cho routing decisions cần centralized

## Decision

**Browser/client KHÔNG BAO GIỜ có authority về model selection, provider selection, hoặc routing decisions.** Server luôn re-resolve từ database cho mỗi request.

Cụ thể:
1. Client request chỉ chứa: user intent, conversation context, và user identity token
2. Server nhận request → resolve routing profile từ database dựa trên user/org/tier
3. Server apply routing rules (model selection, provider selection, failover logic)
4. Client KHÔNG được gửi model name, provider preference, hoặc routing hints
5. Nếu client gửi routing-related fields → server PHẢI ignore và log warning
6. Response trả về cho client KHÔNG chứa internal routing metadata (model used, provider, cost)

API contract enforcement:
- Request validation middleware strip any routing-related fields
- Logging middleware flag requests chứa unauthorized routing fields
- Rate limiting escalation cho clients repeatedly gửi routing fields (potential abuse)

## Alternatives

### Alternative 1: Client Hints Model (Advisory)
- Client gửi "preferred model" nhưng server có quyền override
- **Ưu điểm:** Flexibility cho power users; có thể useful cho testing
- **Nhược điểm:** Tạo ambiguity — khi nào server respect hint vs override? Khó document, khó test
- **Lý do loại bỏ:** Slippery slope — advisory hints dần trở thành expected behavior, clients depend on them

### Alternative 2: Client-side Routing với Server Validation
- Client resolve routing locally, server validate trước khi execute
- **Ưu điểm:** Giảm server round-trips; client có thể show model info trước khi request
- **Nhược điểm:** Routing logic duplicated; client có stale routing rules; validation overhead
- **Lý do loại bỏ:** Violates single source of truth principle; double maintenance burden

### Alternative 3: Expose Routing API cho Client Pre-resolution
- Client gọi separate API để get routing decision trước, rồi gửi execution request
- **Ưu điểm:** Client biết trước model nào sẽ được dùng; better UX cho progress indicators
- **Nhược điểm:** Extra round-trip; routing decision có thể stale giữa pre-resolution và execution
- **Lý do loại bỏ:** Added latency; race condition potential; over-engineering cho current requirements

## Consequences

### Tích cực
- **Security:** Client không thể bypass routing rules để access expensive models hoặc restricted providers
- **Consistency:** Mọi request đều đi qua cùng routing logic, đảm bảo uniform behavior
- **Agility:** Thay đổi routing rules chỉ cần update server-side, không cần client deploy
- **Cost control:** Impossible cho client exploit model selection để inflate costs
- **Auditability:** Tất cả routing decisions logged tại single point (server)

### Tiêu cực
- Client không biết trước model nào sẽ handle request → UX hạn chế cho "model info" display
- Mỗi request phải resolve routing từ database (mitigated bởi ADR-016 cache strategy)
- Testing khó hơn — không thể force specific model từ client side cho debugging
- Tăng server-side complexity vì toàn bộ routing logic tập trung

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Developer bypass trong development environment | Cao | Thấp | Cho phép admin override via internal API với auth; không expose cho regular clients |
| Performance bottleneck tại routing resolution | Trung bình | Trung bình | Version-aware cache (ADR-016); routing resolution target < 5ms |
| Client confusion khi response quality thay đổi | Trung bình | Thấp | Response include quality tier indicator (không phải model name) |
| Third-party integration cần specify model | Thấp | Trung bình | Dedicated integration API với separate auth và explicit ADR justification |
| Future requirement cho user model preference | Trung bình | Trung bình | Handle via "quality tier" abstraction, không direct model selection |

## Validation

Tiêu chí kiểm chứng:
1. **Security test:** Gửi request với `model` field từ client → verify server ignores và logs warning
2. **Penetration test:** Attempt routing bypass qua header injection, query params, body manipulation → all blocked
3. **Integration test:** Verify routing resolution happens server-side cho 100% requests
4. **Audit test:** Verify routing decision log contains server-resolved values, không client-supplied values
5. **Performance test:** Routing resolution latency < 5ms p99 với cache enabled
6. **Code review gate:** PR chứa client-side routing logic phải bị blocked bởi automated check

## Rollback

Nếu cần rollback (rất unlikely vì đây là security principle):
1. Đây là architectural principle — rollback có nghĩa là re-architect significant phần system
2. Nếu cần cho specific use case: tạo separate ADR justify exception với scope giới hạn
3. KHÔNG rollback toàn bộ principle — chỉ grant specific, scoped exceptions
4. Exception phải có: justification, scope limit, security review, và expiry date
5. Mọi exception phải đi qua security team approval

**Estimated rollback time:** N/A — principle-level decision, không designed for rollback
**Data loss risk:** Không — nhưng rollback tạo security risk cần separate assessment
