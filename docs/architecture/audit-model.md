# Mô hình Kiểm toán (Audit Model)

## Nguyên tắc

1. **Append-only**: Audit records không thể sửa hoặc xóa bởi runtime
2. **Bảo mật tại nguồn**: Không lưu tokens, passwords, hoặc secrets
3. **Transaction-safe**: Ghi audit trong cùng transaction với business change khi có thể
4. **Non-blocking**: Lỗi ghi audit không ảnh hưởng đến request

## Audit Events

Bảng `aidilam_app.audit_events` ghi lại các thay đổi trạng thái:

| Field | Mô tả |
|-------|--------|
| occurred_at | Thời điểm sự kiện |
| request_id | ID request (traceability) |
| actor_type | user / service_account / system / anonymous |
| actor_id | UUID của actor |
| action | Hành động (vd: project.create, job.cancel) |
| resource_type | Loại tài nguyên |
| resource_id | ID tài nguyên |
| project_id | Project liên quan |
| outcome | success / denied / failure |
| metadata | Thông tin bổ sung (đã redact) |
| previous_values | Giá trị trước thay đổi |
| new_values | Giá trị sau thay đổi |

## Security Events

Bảng `aidilam_app.security_events` ghi lại các sự kiện bảo mật:

| Event Type | Severity | Mô tả |
|-----------|----------|--------|
| authentication_success | info | Xác thực thành công |
| authentication_failure | warning | Xác thực thất bại |
| token_expired | warning | Token hết hạn |
| token_revoked | warning | Sử dụng token đã thu hồi |
| authorization_denied | warning | Từ chối phân quyền |
| invalid_request | warning | Request không hợp lệ |
| rate_limit_exceeded | warning | Vượt rate limit |
| configuration_error | high | Lỗi cấu hình bảo mật |

## Tính bất biến (Immutability)

### Database level
- Runtime role (`aidilam_runtime`) chỉ có INSERT + SELECT trên audit tables
- Không có UPDATE, DELETE, TRUNCATE permission
- Trigger `trg_audit_events_immutable` ngăn UPDATE/DELETE

### Application level
- Không có API endpoint cho UPDATE/DELETE audit records
- Redaction xảy ra trước khi ghi, không sau

## Redaction

Các key/value sau được tự động redact:

- Key chứa: token, secret, password, key, pepper, authorization, cookie, credential
- Value bắt đầu bằng: `aidl_` (token format)

## Hành động được ghi audit

- Service account: create, update
- Service token: create, revoke
- Project: create, update, archive
- Job: create, cancel, retry
- Membership: change
- Authorization: denied

## Retention

- Tối thiểu 90 ngày (cấu hình)
- Hard delete chỉ bởi retention job chạy bởi DBA
- Không có down-migration cho audit tables
