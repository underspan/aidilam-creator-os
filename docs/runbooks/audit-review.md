# Runbook: Đánh giá Audit

## Xem audit events gần đây

```bash
./ops/security/list-audit-events.sh http://aidilam-app:3000 <ADMIN_TOKEN>
```

## Truy vấn audit trực tiếp (DB)

```sql
-- Sự kiện 24h gần nhất
SELECT occurred_at, actor_display, action, resource_type, resource_id, outcome
FROM aidilam_app.audit_events
WHERE occurred_at > now() - interval '24 hours'
ORDER BY occurred_at DESC;

-- Sự kiện bị từ chối
SELECT occurred_at, actor_display, action, outcome, metadata
FROM aidilam_app.audit_events
WHERE outcome = 'denied'
ORDER BY occurred_at DESC
LIMIT 50;

-- Hoạt động của một actor
SELECT occurred_at, action, resource_type, resource_id, outcome
FROM aidilam_app.audit_events
WHERE actor_id = '<actor_id>'
ORDER BY occurred_at DESC;
```

## Security events

```sql
-- Authentication failures
SELECT occurred_at, event_type, severity, source_ip, details
FROM aidilam_app.security_events
WHERE event_type = 'authentication_failure'
AND occurred_at > now() - interval '1 hour'
ORDER BY occurred_at DESC;

-- Rate limit events
SELECT occurred_at, actor_id, details
FROM aidilam_app.security_events
WHERE event_type = 'rate_limit_exceeded'
ORDER BY occurred_at DESC
LIMIT 20;

-- High severity events
SELECT *
FROM aidilam_app.security_events
WHERE severity IN ('high', 'critical')
ORDER BY occurred_at DESC;
```

## Indicators of Compromise

Kiểm tra các dấu hiệu bất thường:

1. **Nhiều auth failures từ cùng IP**: Brute force attempt
2. **Auth failures với token prefix khác nhau**: Token enumeration
3. **Authorization denied spike**: Privilege escalation attempt
4. **Unusual time patterns**: Off-hours activity
5. **Cross-project access denied**: Lateral movement attempt

## Lưu ý

- Audit records là IMMUTABLE — không sửa/xóa được
- Không chứa plaintext tokens hoặc passwords
- Metadata đã được redact tự động
- Retention tối thiểu 90 ngày
