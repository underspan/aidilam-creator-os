# ADR-020: Production Approval Gate — Không Deploy Production Không Có Human Approval

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-020 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Tác giả | Architecture Team |
| Liên quan | ADR-014, ADR-019 |

## Status

**Accepted** — Áp dụng bắt buộc cho mọi production deployment trong tất cả projects.

## Context

Hệ thống AIĐiLàm xử lý AI workloads cho paying customers. Production deployment failures có thể gây:
- Service disruption ảnh hưởng trực tiếp đến users
- Data corruption nếu migration chạy sai
- Cost explosion nếu misconfigured model routing đẩy traffic sang expensive providers
- Reputation damage nếu AI responses degrade quality

CI/CD pipeline hiện tại có khả năng auto-deploy khi tests pass. Tuy nhiên, automated tests không thể catch 100% issues — configuration drift, infrastructure state changes, và business logic edge cases cần human judgment.

Staging environment tồn tại để validate changes trước production. Workflow cần đảm bảo:
- Changes được test trong staging environment trước
- Human reviewer confirm staging behavior acceptable
- Production deploy chỉ xảy ra sau explicit approval

## Decision

**Không có production deployment nào xảy ra mà không có explicit human approval.** Staging auto-deploys, production never.

Chi tiết workflow:
1. Code merge vào main branch → automatically deploy to staging
2. Staging deployment trigger automated smoke tests và integration tests
3. Test results notify team via Slack/Discord channel
4. Developer hoặc reviewer manually verify staging behavior
5. Approval request created (GitHub Environment Protection Rule / manual gate)
6. Designated approver (tech lead hoặc on-call engineer) review và approve
7. Chỉ sau approval → production deployment bắt đầu
8. Post-deployment health check tự động chạy; rollback automatic nếu health check fail

Approval criteria:
- Staging smoke tests passed (automated)
- No critical alerts trong staging sau deploy (automated, 10 phút observation)
- Manual spot-check key user flows (human)
- Change scope review — breaking changes cần thêm approval từ second reviewer

## Alternatives

### Alternative 1: Fully Automated Deployment (Continuous Deployment)
- Merge to main → auto-deploy staging → auto-deploy production nếu tests pass
- **Ưu điểm:** Fastest delivery; no human bottleneck; encourages small frequent deploys
- **Nhược điểm:** Single test failure mode cho production; no human safety net
- **Lý do loại bỏ:** Risk quá cao cho AI system — misrouted requests cost real money instantly

### Alternative 2: Scheduled Production Deploys (Weekly Release Train)
- Batch changes và deploy production vào fixed schedule (mỗi thứ Ba)
- **Ưu điểm:** Predictable; team prepared; rollback window planned
- **Nhược điểm:** Slow delivery; urgent fixes blocked until next window; batch size tạo higher risk
- **Lý do loại bỏ:** Quá chậm cho startup pace; hotfixes cần path riêng anyway

### Alternative 3: Canary Deployment Thay Thế Approval Gate
- Auto-deploy production nhưng chỉ 5% traffic ban đầu, gradually increase nếu metrics healthy
- **Ưu điểm:** Fast delivery; automated safety via traffic control; gradual rollout
- **Nhược điểm:** Complex infrastructure requirement; 5% users vẫn affected nếu có issue
- **Lý do loại bỏ:** Infrastructure complexity chưa justify; team size nhỏ có thể review manually

## Consequences

### Tích cực
- **Safety net:** Human judgment catches issues automated tests miss (config drift, UX regressions)
- **Accountability:** Clear audit trail ai approve deployment nào, khi nào
- **Confidence:** Team confident production stable vì mọi change được reviewed
- **Learning opportunity:** Approval process forces deployer document what changed và potential risks
- **Cost protection:** Human verify routing config trước khi deploy giảm risk cost explosion

### Tiêu cực
- **Slower delivery:** Human approval thêm latency vào deployment pipeline (minutes to hours)
- **Bottleneck:** Nếu approver unavailable, deployment blocked — especially off-hours
- **Overhead:** Mỗi deployment cần context switch cho approver để review
- **False security:** Human rubber-stamping approval mà không actually review
- **On-call burden:** Urgent deploys cần approver available immediately

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Approver rubber-stamps mà không review | Trung bình | Cao | Require deployment notes; random audit; rotation approvers |
| Approver unavailable khi urgent deploy needed | Trung bình | Cao | Multiple designated approvers; escalation path; break-glass procedure |
| Staging environment drift từ production | Trung bình | Trung bình | Weekly staging-production parity check; infra-as-code ensure consistency |
| Process fatigue — team skip steps vì "quá chậm" | Trung bình | Cao | Streamline approval UX; minimize friction; measure approval time |
| Emergency hotfix blocked bởi approval gate | Thấp | Cao | Documented break-glass procedure: deploy first, review after, post-mortem required |

## Validation

Kiểm chứng process hoạt động:
1. **Audit trail:** 100% production deployments có associated approval record (approver, timestamp, notes)
2. **Enforcement test:** Attempt deploy production mà không có approval → verify CI/CD blocks deployment
3. **Latency tracking:** Measure time-to-approve — target < 30 phút trong business hours
4. **Quality metric:** Production incident rate giảm sau implement approval gate
5. **Break-glass test:** Quarterly drill — simulate urgent deploy, verify break-glass procedure works
6. **Staging parity:** Weekly automated comparison staging vs production infrastructure configuration

## Rollback

Nếu cần relaxed approval process:
1. Document specific scenarios nào có thể bypass (e.g., security patches, data leak fixes)
2. Implement tiered approval:
   - Low-risk (copy change, non-functional): single approval, no staging wait
   - Medium-risk (feature flag, config change): single approval, 10 phút staging observation
   - High-risk (schema migration, routing change): dual approval, 1 giờ staging observation
3. Automate more approval criteria để giảm manual burden
4. Nếu full automation needed → require comprehensive canary infrastructure first
5. KHÔNG bao giờ remove approval gate hoàn toàn — minimum là notification + auto-rollback

**Estimated rollback time:** Immediate (CI/CD config change để remove gate). **Data loss risk:** Không trực tiếp — nhưng removing gate tăng risk cho subsequent deployments.
