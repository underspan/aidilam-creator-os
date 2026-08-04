# Runbook: Quản lý Service Token

## Tạo Service Account mới

```bash
./ops/security/create-service-account.sh \
  http://aidilam-app:3000 \
  <ADMIN_TOKEN> \
  <code> \
  "<name>" \
  "[description]"
```

## Tạo Token mới

```bash
./ops/security/create-service-token.sh \
  http://aidilam-app:3000 \
  <ADMIN_TOKEN> \
  <SERVICE_ACCOUNT_ID> \
  "<token_name>" \
  [expires_in_days]
```

⚠️ Token chỉ hiển thị MỘT LẦN. Lưu ngay lập tức.

## Thu hồi Token

```bash
./ops/security/revoke-service-token.sh \
  http://aidilam-app:3000 \
  <ADMIN_TOKEN> \
  <SERVICE_ACCOUNT_ID> \
  <TOKEN_ID>
```

## Xoay (Rotate) Token

1. Tạo token mới cho service account
2. Cập nhật tất cả clients sử dụng token cũ
3. Xác minh clients hoạt động với token mới
4. Thu hồi token cũ

## Bootstrap Token

File: `/opt/aidilam/secrets/bootstrap_internal_admin_token`
- Quyền: 600
- Sử dụng: Chỉ cho khởi tạo ban đầu
- **PHẢI rotate sau lần sử dụng đầu tiên**

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| 401 | Token không hợp lệ | Kiểm tra format, expiration |
| 403 | Thiếu permission | Kiểm tra role assignment |
| 404 | Account không tồn tại | Kiểm tra account ID |
| 409 | Token đã revoked | Tạo token mới |
