# Runbook: Phản ứng Sự cố Bảo mật

## Phân loại sự cố

| Mức độ | Mô tả | Thời gian phản ứng |
|--------|--------|-------------------|
| Critical | Token bị lộ, truy cập trái phép xác nhận | Ngay lập tức |
| High | Auth bypass nghi ngờ, brute force nhiều | < 1 giờ |
| Medium | Rate limit vượt, auth failures bất thường | < 4 giờ |
| Low | Misconfiguration, single auth failure | Ngày làm việc tiếp |

## Quy trình

### 1. Phát hiện (Detection)

Kiểm tra security events:
```sql
SELECT * FROM aidilam_app.security_events
WHERE severity IN ('high', 'critical')
AND occurred_at > now() - interval '1 hour';
```

### 2. Chặn (Containment)

#### Token bị lộ
```bash
# Thu hồi token ngay lập tức
./ops/security/revoke-service-token.sh \
  http://aidilam-app:3000 <ADMIN_TOKEN> <ACCOUNT_ID> <TOKEN_ID>
```

#### Brute force
Rate limiting tự động chặn sau 10 failures/phút. Nếu cần chặn thủ công:
```bash
# Block tại network level nếu cần
# (Thực hiện trên host, không trong container)
```

### 3. Đánh giá (Assessment)

- Xác định scope: Token nào bị ảnh hưởng?
- Kiểm tra audit logs: Có action nào bất thường không?
- Xác định timeline: Từ khi nào?

```sql
-- Tất cả actions của account bị compromise
SELECT * FROM aidilam_app.audit_events
WHERE actor_id = '<compromised_account_id>'
ORDER BY occurred_at;
```

### 4. Khắc phục (Remediation)

1. Thu hồi TẤT CẢ tokens của account bị ảnh hưởng
2. Disable service account nếu cần:
   ```sql
   UPDATE aidilam_app.service_accounts
   SET status = 'disabled', disabled_at = now()
   WHERE id = '<account_id>';
   ```
3. Tạo token mới cho accounts hợp lệ
4. Review và revert các thay đổi trái phép

### 5. Phục hồi (Recovery)

1. Tạo service account mới nếu cần
2. Gán roles phù hợp
3. Phân phối token mới cho clients
4. Xác minh hoạt động bình thường

### 6. Post-mortem

- Ghi lại timeline đầy đủ
- Xác định root cause
- Đề xuất improvements
- Cập nhật runbook nếu cần

## Liên hệ

- Platform owner: Escalate ngay cho sự cố Critical
- Không tự ý forward-fix dưới áp lực — ưu tiên containment
