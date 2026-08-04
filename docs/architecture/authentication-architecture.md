# Kiến trúc Xác thực (Authentication Architecture)

## Tổng quan

Hệ thống AIĐiLàm sử dụng mô hình xác thực dựa trên service token cho API nội bộ. Không triển khai đăng nhập người dùng, mật khẩu, hoặc SSO tại giai đoạn này.

## Chế độ xác thực

| Chế độ | Mô tả | Trạng thái |
|--------|--------|------------|
| `disabled_internal` | Bỏ qua xác thực (chỉ cho phát triển nội bộ) | Không được dùng khi PUBLIC_EXPOSURE=true |
| `service_token` | Bearer token cho service accounts | **Đang hoạt động** |
| `future_oidc` | Placeholder cho OIDC trong tương lai | Chưa triển khai |

## Định dạng Token

```
aidl_<prefix>_<secret>
```

- **prefix**: 8 ký tự hex (4 bytes) — dùng để tra cứu token record
- **secret**: 64 ký tự hex (32 bytes / 256 bits) — phần bí mật

## Vòng đời Token

1. **Tạo**: Sinh random prefix + secret → tính HMAC-SHA256(secret, pepper) → lưu hash
2. **Xác thực**: Parse token → tra cứu bằng prefix → xác minh hash → resolve identity
3. **Thu hồi**: Đánh dấu status = 'revoked', token không thể sử dụng
4. **Hết hạn**: Khi expires_at < now(), token bị từ chối

## Lưu trữ Token

- **Plaintext**: KHÔNG BAO GIỜ lưu trong DB, chỉ hiện một lần khi tạo
- **Hash**: HMAC-SHA256 với server-side pepper
- **Pepper**: File `/run/secrets/service_token_pepper`, 32 bytes random, quyền 600

## Mô hình mối đe dọa

| Tấn công | Phòng ngừa |
|----------|------------|
| DB bị lộ | Chỉ có hash + prefix, cần pepper để tấn công |
| Pepper bị lộ | Không có hash, không thể xác minh |
| Cả DB + pepper | 256-bit secret không thể brute force |
| Network sniff | Token truyền qua mạng nội bộ Docker |
| Timing attack | Sử dụng timingSafeEqual |

## Luồng xác thực

```
Request → Parse Authorization header
       → Validate Bearer scheme
       → Parse token format (aidl_prefix_secret)
       → Lookup token by prefix
       → Check token status (active/revoked/expired)
       → Check account status (active/disabled)
       → Verify hash (constant-time)
       → Resolve identity (roles + permissions)
       → Attach identity to request
```

## Endpoint không yêu cầu xác thực

- `GET /health/live` — Liveness probe
- `GET /health/ready` — Readiness probe

## Tích hợp OIDC trong tương lai

Khi triển khai OIDC:
- Thêm adapter trong AUTH_MODE=future_oidc
- Tái sử dụng cùng RequestIdentity interface
- Service token vẫn hoạt động song song
- Không cần thay đổi authorization layer
