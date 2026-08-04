# Ranh giới Bảo mật (Security Boundaries)

## Mô hình triển khai

```
┌─────────────────────────────────────┐
│         Docker Network              │
│         (aidilam-internal)          │
│                                     │
│  ┌─────────────┐   ┌────────────┐  │
│  │ aidilam-app │   │  postgres  │  │
│  │  (port 3000)│   │ (port 5432)│  │
│  └─────────────┘   └────────────┘  │
│                                     │
│  ┌─────────────┐   ┌────────────┐  │
│  │    redis    │   │   qdrant   │  │
│  │  (port 6379)│   │ (port 6333)│  │
│  └─────────────┘   └────────────┘  │
│                                     │
│  ┌─────────────┐                    │
│  │    minio    │                    │
│  │  (port 9000)│                    │
│  └─────────────┘                    │
└─────────────────────────────────────┘
          │
          │ KHÔNG port nào exposed ra host
          │
```

## Ranh giới hiện tại

### Network
- Tất cả services trên Docker bridge network `aidilam-internal`
- KHÔNG expose port ra host (sử dụng `expose`, không `ports`)
- KHÔNG public DNS, reverse proxy, hoặc external TLS

### Authentication
- Mọi `/api/v1/*` route yêu cầu xác thực
- Chỉ `/health/live` và `/health/ready` không cần token
- Token Bearer scheme duy nhất được chấp nhận

### Authorization
- Deny-by-default: request không có permission bị từ chối
- Project isolation: không thể truy cập tài nguyên cross-project
- Role-based: permission gán qua roles, không trực tiếp

### Data
- Token plaintext KHÔNG lưu trong DB
- Audit records immutable (trigger + privilege enforcement)
- Secrets mount read-only từ Docker secrets
- Pepper riêng biệt cho token hashing

### Container Security
- Non-root user (UID 1000+)
- Read-only root filesystem
- All capabilities dropped
- No Docker socket mount
- No host networking
- No privileged mode

## Nợ bảo mật (Security Debt)

| Item | Rủi ro | Kế hoạch |
|------|--------|---------|
| Redis shared password | Medium | Redis ACL trong DEP-007+ |
| Qdrant shared API key | Medium | Per-client key khi Qdrant hỗ trợ |
| Root SSH trên host | High | Chuyển sang key-based non-root |
| Không có external IdP | Low | OIDC adapter khi cần |
| Không rate limit per-route | Low | Nâng cấp khi có usage patterns |
| Bootstrap token chưa rotate | Medium | Rotate sau first use |

## Các thứ KHÔNG làm

- ❌ Expose application port trên host
- ❌ Lưu plaintext token trong DB hoặc logs
- ❌ Cho phép anonymous truy cập API
- ❌ Chia sẻ secrets với Underspan
- ❌ Mount Docker socket
- ❌ Sử dụng host networking
- ❌ Log authorization internals cho client
