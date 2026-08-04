# Runbook: Quản lý RBAC

## Roles hiện có

### Global
- `system_admin` — Toàn quyền
- `platform_operator` — Giám sát và audit
- `service_worker` — Xử lý job nền

### Project-scoped
- `project_owner` — Toàn quyền project
- `project_admin` — Quản lý tài nguyên + thành viên
- `project_editor` — Tạo/sửa tài nguyên
- `project_viewer` — Chỉ đọc

## Gán role cho service account

Hiện tại role resolution cho service accounts dựa trên convention:
- `aidilam-internal-admin` → `system_admin`
- Các service account khác → `service_worker`

Để mở rộng, cần triển khai bảng `service_account_roles`.

## Gán project role

```sql
-- Gán role cho user trong project
INSERT INTO aidilam_app.project_role_assignments (project_id, user_id, role_id, created_by)
VALUES (
  '<project_id>',
  '<user_id>',
  (SELECT id FROM aidilam_app.roles WHERE code = 'project_editor'),
  '<created_by_id>'
);
```

## Kiểm tra quyền

```sql
-- Xem permissions của một role
SELECT p.code, p.description
FROM aidilam_app.role_permissions rp
JOIN aidilam_app.permissions p ON p.id = rp.permission_id
JOIN aidilam_app.roles r ON r.id = rp.role_id
WHERE r.code = '<role_code>';

-- Xem project role assignments
SELECT pra.*, r.code as role_code
FROM aidilam_app.project_role_assignments pra
JOIN aidilam_app.roles r ON r.id = pra.role_id
WHERE pra.project_id = '<project_id>';
```

## Lưu ý an toàn

- KHÔNG gán `system_admin` cho service accounts không cần thiết
- Ưu tiên project-scoped roles thay vì global roles
- Review role assignments định kỳ
- Mọi thay đổi role được ghi audit
