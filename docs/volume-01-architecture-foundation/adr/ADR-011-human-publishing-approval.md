# ADR-011: Human Publishing Approval

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-011 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Người đề xuất | Architecture Team |
| Phạm vi | Content Pipeline, Publishing Workflow |

## Status

**Accepted** — Có hiệu lực ngay lập tức cho toàn bộ hệ thống publishing.

## Context

Hệ thống AIDiLam sử dụng AI để tạo content tự động — blog posts, social media updates,
video descriptions, tài liệu marketing. Content được publish lên external platforms như
YouTube, Facebook, LinkedIn, WordPress.

Vấn đề chính:
- AI-generated content có thể chứa hallucination hoặc thông tin sai
- Vi phạm brand guidelines hoặc tone of voice không thể detect tự động
- Content đã publish rất khó thu hồi và gây thiệt hại uy tín
- Compliance với quy định quảng cáo và truyền thông là bắt buộc

## Decision

**Human approval required before any content is published to external platforms.**

1. Mọi content từ AI agent PHẢI qua human review trước khi publish
2. Ít nhất một `content_approver` phải xác nhận trước khi publish
3. Content approved có TTL 72 giờ — hết hạn cần re-approve
4. KHÔNG có chế độ auto-publish bypass cho bất kỳ trường hợp nào
5. Approval state lưu trong database với full audit trail

## Alternatives

| Alternative | Lý do từ chối |
|-------------|---------------|
| Full automation với AI quality gate | Hallucination risk quá cao, không đủ tin cậy |
| Approve lần đầu, auto sau đó | Context thay đổi liên tục, template cũ không phù hợp |
| Tiered approval theo risk level | Khó phân loại risk chính xác bằng automated system |

## Consequences

### Tích cực
- Đảm bảo chất lượng content trước khi đến end users
- Giảm thiểu rủi ro pháp lý và uy tín thương hiệu
- Audit trail rõ ràng cho mọi published content
- Tăng trust của stakeholders vào AI system

### Tiêu cực
- Tăng latency trong pipeline (thêm 1-24 giờ)
- Cần nhân sự dedicated cho content review
- Bottleneck tiềm ẩn khi volume tăng cao
- Chi phí vận hành cao hơn full automation

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Bottleneck khi volume cao | Medium | High | Queue management, SLA review time |
| Reviewer fatigue, rubber-stamping | Medium | High | Rotation schedule, random audit |
| Reviewer unavailable | Low | High | Backup pool, escalation path |
| Content outdated chờ approve | Low | Medium | TTL mechanism, priority queue |

## Validation

1. **Functional**: Không content nào publish mà thiếu approval record
2. **Audit**: Mọi approval có timestamp, reviewer ID, notes
3. **Enforcement**: Publish API kiểm tra approval status trước khi execute
4. **Testing**: Integration test confirm publish rejected khi thiếu approval
5. **Monitoring**: Alert khi có attempt publish bypass approval flow

## Rollback

Quyết định này là **permanent** — không rollback về auto-publish.

Điều chỉnh nếu cần giảm friction:
1. Giảm số approvers từ 2 xuống 1
2. Extend TTL từ 72h lên 168h
3. Batch approval cho multiple items
4. Conditional relaxation cho low-risk platforms

Trigger điều chỉnh: average wait >48h, hoặc AI quality đạt >99.9% qua external audit.

---
*Architecture Decision Record — Dự án AIDiLam*
