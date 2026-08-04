# Mô hình Phân quyền (Authorization Model)

## Nguyên tắc

1. **Deny-by-default**: Mọi request không có quyền rõ ràng đều bị từ chối
2. **Explicit permissions**: Quyền truy cập phải được khai báo tường minh cho mỗi route
3. **Project-scoped**: Tài nguyên thuộc project chỉ được truy cập bởi thành viên project

## Thứ tự ưu tiên

```
Explicit deny (tương lai) > Global allow > Project allow > Default deny
```

## Roles

### Global Roles (gán toàn hệ thống)

| Role | Mô tả |
|------|--------|
| system_admin | Toàn quyền quản trị |
| platform_operator | Giám sát và đọc audit |
| service_worker | Xử lý job nền |

### Project Roles (gán theo project)

| Role | Mô tả |
|------|--------|
| project_owner | Toàn quyền trong project |
| project_admin | Quản lý tài nguyên và thành viên |
| project_editor | Tạo và sửa tài nguyên |
| project_viewer | Chỉ đọc |

## Permissions

Format: `<resource>.<action>`

### System
- `system.read`

### Projects
- `projects.create`, `projects.read`, `projects.update`, `projects.archive`, `projects.manage_members`

### Jobs
- `jobs.create`, `jobs.read`, `jobs.cancel`, `jobs.retry`, `jobs.update-status`

### Assets
- `assets.create`, `assets.read`, `assets.delete`

### Workflows
- `workflows.create`, `workflows.read`, `workflows.update`, `workflows.execute`

### Security
- `audit.read`, `security.read`
- `service_accounts.create`, `service_accounts.read`, `service_accounts.update`
- `service_accounts.rotate_token`, `service_accounts.revoke_token`

## Ma trận quyền (Role-Permission Matrix)

| Permission | system_admin | platform_operator | project_owner | project_admin | project_editor | project_viewer | service_worker |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| system.read | ✓ | ✓ | | | | | ✓ |
| projects.create | ✓ | | | | | | |
| projects.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| projects.update | ✓ | | ✓ | ✓ | | | |
| projects.archive | ✓ | | ✓ | | | | |
| jobs.create | ✓ | | ✓ | ✓ | ✓ | | |
| jobs.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| audit.read | ✓ | ✓ | | | | | |
| security.read | ✓ | ✓ | | | | | |
| service_accounts.* | ✓ | | | | | | |

## Cách sử dụng trong code

```typescript
// Yêu cầu global permission
await requirePermission(request, 'projects.create');

// Yêu cầu project-scoped permission
await requireProjectPermission(request, projectId, 'jobs.create');

// Yêu cầu bất kỳ permission nào
await requireAnyPermission(request, ['jobs.read', 'projects.read']);

// Yêu cầu global role
await requireGlobalRole(request, 'system_admin');
```

## Hạn chế hiện tại

- Chưa có explicit deny tables
- Project role assignment cho service account sử dụng user_id field
- Chưa triển khai resource ownership check
- Chưa cache permission resolution (query mỗi request)
