# Chương 14: Security Architecture

> **Phiên bản:** 2.0  
> **Cập nhật:** 2026-07-23  
> **Tác giả:** AIĐiLàm Platform Team  
> **Phân loại:** NỘI BỘ – KHÔNG CHIA SẺ VỚI BÊN THỨ BA

---

## 14.1 Tổng Quan

Kiến trúc bảo mật của AIĐiLàm được thiết kế theo nguyên tắc **Defense in Depth** —
nhiều lớp phòng thủ chồng chéo nhau, đảm bảo rằng khi một lớp bị xuyên thủng,
các lớp còn lại vẫn bảo vệ được hệ thống. Tài liệu này mô tả chi tiết từng
layer bảo mật từ access control, container hardening, secret management,
encryption, input validation, network isolation cho đến audit logging.

### Nguyên tắc cốt lõi

1. **Least Privilege** — Mỗi component chỉ có quyền tối thiểu cần thiết
2. **Zero Trust** — Không tin tưởng bất kỳ request nào mà không xác thực
3. **Separation of Concerns** — Tách biệt hoàn toàn giữa các workspace
4. **Credential Isolation** — Thông tin xác thực AIĐiLàm KHÔNG BAO GIỜ được chia sẻ với Underspan
5. **Immutable Audit** — Mọi hành động đều được ghi log không thể thay đổi

---

## 14.2 Role-Based Access Control (RBAC)

### 14.2.1 Hệ thống vai trò

AIĐiLàm triển khai RBAC với 4 vai trò chính, mỗi vai trò kế thừa quyền
từ vai trò thấp hơn:

| Vai trò    | Mô tả                              | Quyền chính                                    |
|------------|-------------------------------------|-------------------------------------------------|
| **OWNER**  | Chủ sở hữu workspace               | Toàn quyền, xóa workspace, quản lý billing     |
| **ADMIN**  | Quản trị viên                       | Quản lý members, settings, không xóa workspace  |
| **EDITOR** | Người chỉnh sửa                    | Tạo/sửa/xóa content, upload media              |
| **VIEWER** | Người xem                           | Chỉ đọc, không thay đổi dữ liệu               |

### 14.2.2 Permission Matrix

```
Action                  OWNER   ADMIN   EDITOR   VIEWER
─────────────────────────────────────────────────────────
workspace.delete          ✓       ✗       ✗        ✗
workspace.settings        ✓       ✓       ✗        ✗
member.invite             ✓       ✓       ✗        ✗
member.remove             ✓       ✓       ✗        ✗
content.create            ✓       ✓       ✓        ✗
content.edit              ✓       ✓       ✓        ✗
content.delete            ✓       ✓       ✓        ✗
content.view              ✓       ✓       ✓        ✓
media.upload              ✓       ✓       ✓        ✗
media.download            ✓       ✓       ✓        ✓
billing.manage            ✓       ✗       ✗        ✗
api_key.manage            ✓       ✓       ✗        ✗
audit_log.view            ✓       ✓       ✗        ✗
```

### 14.2.3 Workspace Isolation với Row-Level Security (RLS)

Mỗi bản ghi trong database đều chứa trường `workspace_id`. PostgreSQL RLS
được kích hoạt để đảm bảo rằng mọi query đều tự động filter theo workspace
của user hiện tại:

```sql
-- Tạo RLS policy cho bảng projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON projects
    USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

-- Tạo RLS policy cho bảng media_assets
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON media_assets
    USING (workspace_id = current_setting('app.current_workspace_id')::uuid);
```

Middleware sẽ set `app.current_workspace_id` trước mỗi request:

```typescript
// middleware/workspace-context.ts
async function setWorkspaceContext(req: Request, res: Response, next: NextFunction) {
  const workspaceId = req.headers['x-workspace-id'];
  const membership = await verifyMembership(req.user.id, workspaceId);

  if (!membership) {
    return res.status(403).json({ error: 'ACCESS_DENIED' });
  }

  await db.query(`SET LOCAL app.current_workspace_id = '${workspaceId}'`);
  req.workspace = { id: workspaceId, role: membership.role };
  next();
}
```

> **Quan trọng:** RLS đảm bảo rằng ngay cả khi có bug trong application code,
> dữ liệu workspace A không thể bị truy cập từ workspace B ở tầng database.

---

## 14.3 Container Security

### 14.3.1 Non-root Containers (UID 1000+)

Tất cả container trong hệ thống AIĐiLàm chạy với user non-root (UID >= 1000):

```dockerfile
# Dockerfile cho backend service
FROM node:20-alpine AS runtime

# Tạo user non-root
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser

# Set ownership
COPY --chown=appuser:appgroup ./dist /app
WORKDIR /app

# Chuyển sang non-root user
USER appuser

EXPOSE 3000
CMD ["node", "server.js"]
```

```dockerfile
# Dockerfile cho FFmpeg worker
FROM jrottenberg/ffmpeg:6-alpine AS runtime

RUN addgroup -g 1001 ffmpeggroup && \
    adduser -u 1001 -G ffmpeggroup -s /bin/sh -D ffmpeguser

USER ffmpeguser
```

### 14.3.2 Docker Socket Prohibition

**TUYỆT ĐỐI CẤM** mount Docker socket (`/var/run/docker.sock`) vào bất kỳ
container nào. Điều này ngăn chặn container escape attacks:

```yaml
# docker-compose.yml — KHÔNG BAO GIỜ làm điều này:
# volumes:
#   - /var/run/docker.sock:/var/run/docker.sock  ← CẤM

# Security policy trong CI/CD
services:
  backend:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

### 14.3.3 Container Hardening Checklist

- [x] `USER` directive trong mọi Dockerfile (UID >= 1000)
- [x] `no-new-privileges` security option
- [x] `read_only` filesystem (dùng tmpfs cho /tmp)
- [x] `cap_drop: ALL` rồi chỉ add lại capabilities cần thiết
- [x] Không mount Docker socket
- [x] Không chạy `--privileged`
- [x] Base image scan với Trivy trong CI pipeline

---

## 14.4 Secret Management

### 14.4.1 Secret References via Environment Variables / Vault

Secrets KHÔNG BAO GIỜ được hardcode trong source code hoặc commit vào git.
Thay vào đó, sử dụng references:

```yaml
# docker-compose.yml
services:
  backend:
    environment:
      - DATABASE_URL=${DATABASE_URL}          # Từ .env file
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - S3_ACCESS_KEY=${S3_ACCESS_KEY}
    env_file:
      - .env.production                       # File permissions 600
```

Với môi trường production, sử dụng HashiCorp Vault hoặc AWS Secrets Manager:

```typescript
// config/secrets.ts
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

async function loadSecrets(): Promise<AppSecrets> {
  const client = new SecretsManager({ region: 'ap-southeast-1' });

  const response = await client.getSecretValue({
    SecretId: 'aidilam/production/app-secrets'
  });

  return JSON.parse(response.SecretString!);
}
```

### 14.4.2 Environment File Permissions

Tất cả file chứa secrets phải có permission `600` (chỉ owner đọc/ghi):

```bash
# Set permissions cho environment files
chmod 600 .env.production
chmod 600 .env.staging

# Verify
ls -la .env.*
# -rw------- 1 deploy deploy 1024 Jul 23 .env.production
# -rw------- 1 deploy deploy  512 Jul 23 .env.staging

# Trong CI/CD pipeline
- name: Secure env files
  run: |
    chmod 600 ${{ secrets.ENV_FILE_PATH }}
    chown deploy:deploy ${{ secrets.ENV_FILE_PATH }}
```

### 14.4.3 Git Protection

```gitignore
# .gitignore — Bảo vệ secrets
.env
.env.*
!.env.example
*.pem
*.key
credentials.json
service-account.json
```

---

## 14.5 Session Encryption & Key Rotation

### 14.5.1 Platform Session Encryption (AES-256-GCM)

Mọi session data được mã hóa bằng AES-256-GCM trước khi lưu vào Redis:

```typescript
// lib/session-encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96 bits cho GCM
const TAG_LENGTH = 16; // 128 bits authentication tag

export function encryptSession(data: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptSession(payload: string, key: Buffer): string {
  const [ivHex, tagHex, encryptedData] = payload.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### 14.5.2 Key Rotation Strategy

Key rotation được thực hiện mỗi 90 ngày hoặc khi có sự cố bảo mật:

```typescript
// lib/key-rotation.ts
interface EncryptionKey {
  id: string;
  key: Buffer;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'rotating' | 'retired';
}

class KeyRotationManager {
  private keys: Map<string, EncryptionKey> = new Map();

  async rotateKey(): Promise<void> {
    // 1. Tạo key mới
    const newKey = await this.generateKey();

    // 2. Mark key cũ là 'rotating'
    const currentKey = this.getActiveKey();
    currentKey.status = 'rotating';

    // 3. Re-encrypt sessions đang active với key mới
    await this.reEncryptActiveSessions(currentKey, newKey);

    // 4. Retire key cũ sau grace period (24h)
    setTimeout(() => {
      currentKey.status = 'retired';
    }, 24 * 60 * 60 * 1000);
  }

  // Decrypt thử với active key, fallback sang rotating keys
  async decryptWithFallback(payload: string): Promise<string> {
    const keys = [this.getActiveKey(), ...this.getRotatingKeys()];
    for (const key of keys) {
      try {
        return decryptSession(payload, key.key);
      } catch {
        continue;
      }
    }
    throw new Error('SESSION_DECRYPT_FAILED');
  }
}
```

---

## 14.6 Upload Validation & Input Security

### 14.6.1 File Upload Validation Pipeline

Mỗi file upload phải qua 4 bước validation:

```
┌──────────┐    ┌───────────┐    ┌─────────────┐    ┌───────────────┐
│ Whitelist │───▶│ Size Check│───▶│ Magic Bytes │───▶│ MIME Validate │
│  Check    │    │           │    │   Verify    │    │               │
└──────────┘    └───────────┘    └─────────────┘    └───────────────┘
                                                            │
                                                            ▼
                                                    ┌───────────────┐
                                                    │   Filename    │
                                                    │ Normalization │
                                                    └───────────────┘
```

### 14.6.2 Extension Whitelist

Chỉ cho phép các extension đã được xác định trước:

```typescript
// validators/upload.ts
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  video: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
  audio: ['.mp3', '.wav', '.aac', '.flac', '.ogg'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  document: ['.pdf', '.docx', '.xlsx', '.pptx'],
  subtitle: ['.srt', '.vtt', '.ass'],
};

const ALL_ALLOWED = Object.values(ALLOWED_EXTENSIONS).flat();

function validateExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALL_ALLOWED.includes(ext);
}
```

### 14.6.3 Size Limits

```typescript
const SIZE_LIMITS: Record<string, number> = {
  video:    5 * 1024 * 1024 * 1024,  // 5 GB
  audio:    500 * 1024 * 1024,        // 500 MB
  image:    50 * 1024 * 1024,         // 50 MB
  document: 100 * 1024 * 1024,        // 100 MB
  subtitle: 10 * 1024 * 1024,         // 10 MB
};
```

### 14.6.4 Magic Bytes Verification

Kiểm tra file header (magic bytes) để xác nhận file type thực sự,
ngăn chặn việc đổi extension:

```typescript
// validators/magic-bytes.ts
import { fileTypeFromBuffer } from 'file-type';

const MAGIC_BYTE_MAP: Record<string, string[]> = {
  '.mp4':  ['video/mp4'],
  '.mov':  ['video/quicktime'],
  '.png':  ['image/png'],
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif':  ['image/gif'],
  '.webp': ['image/webp'],
  '.pdf':  ['application/pdf'],
  '.mp3':  ['audio/mpeg'],
  '.wav':  ['audio/wav', 'audio/x-wav'],
};

async function validateMagicBytes(buffer: Buffer, declaredExt: string): Promise<boolean> {
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected) {
    return false; // Không nhận diện được → reject
  }

  const allowedMimes = MAGIC_BYTE_MAP[declaredExt];
  if (!allowedMimes) return false;

  return allowedMimes.includes(detected.mime);
}
```

### 14.6.5 MIME Type Validation

```typescript
// Double-check MIME type từ Content-Type header vs actual content
function validateMimeConsistency(
  declaredMime: string,
  detectedMime: string,
  extension: string
): ValidationResult {
  const expectedMimes = MAGIC_BYTE_MAP[extension];

  if (!expectedMimes?.includes(declaredMime)) {
    return { valid: false, reason: 'MIME_MISMATCH_DECLARED' };
  }

  if (!expectedMimes?.includes(detectedMime)) {
    return { valid: false, reason: 'MIME_MISMATCH_DETECTED' };
  }

  return { valid: true };
}
```

### 14.6.6 Filename Normalization

Filename được sanitize để ngăn path traversal và injection:

```typescript
// validators/filename.ts
function normalizeFilename(originalName: string): string {
  // 1. Loại bỏ path components
  let name = path.basename(originalName);

  // 2. Loại bỏ ký tự nguy hiểm
  name = name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // 3. Loại bỏ multiple dots (ngăn .php.jpg attacks)
  const ext = path.extname(name);
  const base = path.basename(name, ext).replace(/\./g, '_');

  // 4. Truncate nếu quá dài
  const truncatedBase = base.slice(0, 100);

  // 5. Thêm unique prefix
  const uniqueId = randomUUID().slice(0, 8);

  return `${uniqueId}_${truncatedBase}${ext}`;
}
```

---

## 14.7 Path Traversal & SSRF Prevention

### 14.7.1 Path Traversal Prevention

```typescript
// security/path-safety.ts
import path from 'path';

const UPLOAD_BASE_DIR = '/data/uploads';

function resolveSafePath(userInput: string): string | null {
  // Normalize và resolve path
  const resolved = path.resolve(UPLOAD_BASE_DIR, userInput);

  // Kiểm tra resolved path vẫn nằm trong base directory
  if (!resolved.startsWith(UPLOAD_BASE_DIR + '/')) {
    // Path traversal detected!
    logger.warn('Path traversal attempt', { userInput, resolved });
    return null;
  }

  // Kiểm tra thêm: không chứa symlinks ra ngoài
  const realPath = fs.realpathSync(resolved);
  if (!realPath.startsWith(UPLOAD_BASE_DIR)) {
    logger.warn('Symlink escape attempt', { userInput, realPath });
    return null;
  }

  return resolved;
}
```

### 14.7.2 SSRF Prevention (URL Allowlist)

Khi hệ thống cần fetch external URLs (thumbnails, webhooks, imports),
áp dụng strict allowlist:

```typescript
// security/ssrf-prevention.ts
import { URL } from 'url';
import dns from 'dns/promises';

const ALLOWED_HOSTS = [
  'storage.googleapis.com',
  's3.ap-southeast-1.amazonaws.com',
  'cdn.aidilam.com',
  'api.aidilam.com',
];

const BLOCKED_IP_RANGES = [
  '127.0.0.0/8',     // Loopback
  '10.0.0.0/8',      // Private
  '172.16.0.0/12',   // Private
  '192.168.0.0/16',  // Private
  '169.254.0.0/16',  // Link-local
  '0.0.0.0/8',       // Non-routable
];

async function validateExternalUrl(urlString: string): Promise<boolean> {
  const url = new URL(urlString);

  // 1. Chỉ cho phép HTTPS
  if (url.protocol !== 'https:') {
    return false;
  }

  // 2. Kiểm tra host allowlist
  if (!ALLOWED_HOSTS.includes(url.hostname)) {
    return false;
  }

  // 3. DNS resolution — kiểm tra không resolve về private IP
  const addresses = await dns.resolve4(url.hostname);
  for (const addr of addresses) {
    if (isPrivateIP(addr)) {
      logger.warn('SSRF attempt: DNS rebinding', { url: urlString, addr });
      return false;
    }
  }

  return true;
}
```

---

## 14.8 Network Isolation

### 14.8.1 Docker Network Architecture

AIĐiLàm sử dụng multiple Docker networks để tách biệt các lớp:

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOST MACHINE                              │
│                                                                  │
│  ┌──────────── frontend_net ────────────┐                       │
│  │                                       │                       │
│  │   ┌─────────┐      ┌──────────────┐  │                       │
│  │   │  Nginx  │      │  Frontend    │  │                       │
│  │   │ (proxy) │◄────▶│  (Next.js)   │  │                       │
│  │   └────┬────┘      └──────────────┘  │                       │
│  │        │                              │                       │
│  └────────┼──────────────────────────────┘                       │
│           │                                                      │
│  ┌────────┼──────── backend_net ─────────────────────────┐      │
│  │        ▼                                               │      │
│  │   ┌─────────┐    ┌───────────┐    ┌───────────────┐  │      │
│  │   │ Backend │───▶│  Worker   │───▶│ FFmpeg Worker │  │      │
│  │   │  (API)  │    │  (Queue)  │    │               │  │      │
│  │   └────┬────┘    └─────┬─────┘    └───────────────┘  │      │
│  │        │                │                              │      │
│  │   ┌────▼────┐    ┌─────▼─────┐                       │      │
│  │   │PostgreSQL│    │   Redis   │                       │      │
│  │   │ (5432)  │    │  (6379)   │                       │      │
│  │   └─────────┘    └───────────┘                       │      │
│  │                                                       │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 14.8.2 Docker Compose Network Configuration

```yaml
# docker-compose.yml
networks:
  frontend_net:
    driver: bridge
    internal: false   # Cho phép egress ra internet (CDN, etc.)
  backend_net:
    driver: bridge
    internal: true    # KHÔNG có egress ra internet

services:
  nginx:
    networks:
      - frontend_net
    ports:
      - "443:443"     # Chỉ expose HTTPS

  frontend:
    networks:
      - frontend_net

  backend:
    networks:
      - frontend_net  # Nhận request từ nginx
      - backend_net   # Truy cập DB, Redis

  worker:
    networks:
      - backend_net   # Chỉ truy cập internal services

  ffmpeg-worker:
    networks:
      - backend_net

  postgres:
    networks:
      - backend_net   # KHÔNG expose ra frontend_net hoặc host
    # KHÔNG có section 'ports' → không bind ra host

  redis:
    networks:
      - backend_net   # KHÔNG expose ra frontend_net hoặc host
    # KHÔNG có section 'ports' → không bind ra host
```

### 14.8.3 Database & Redis Non-Exposure

PostgreSQL và Redis **KHÔNG** expose port ra host machine:

```yaml
# ❌ SAI — Expose ra host
postgres:
  ports:
    - "5432:5432"   # NGUY HIỂM: Truy cập được từ bên ngoài

# ✓ ĐÚNG — Chỉ internal network
postgres:
  networks:
    - backend_net
  # Không có 'ports' section
  # Chỉ các services trong backend_net mới truy cập được
```

Nếu cần debug database trong development:

```yaml
# docker-compose.override.yml (KHÔNG dùng trong production)
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"  # Chỉ bind localhost
```

---

## 14.9 FFmpeg Security

### 14.9.1 Parameterized Commands — No Shell Interpolation

FFmpeg commands **PHẢI** được xây dựng bằng array parameters, KHÔNG BAO GIỜ
dùng string interpolation hay shell execution:

```typescript
// ❌ NGUY HIỂM — Shell injection vulnerability
const cmd = `ffmpeg -i ${inputFile} -vf "scale=${width}:${height}" ${outputFile}`;
exec(cmd); // TUYỆT ĐỐI CẤM

// ✓ AN TOÀN — Parameterized command
import { spawn } from 'child_process';

function transcodeVideo(params: TranscodeParams): ChildProcess {
  const args = [
    '-i', params.inputPath,           // Input file (validated path)
    '-vf', `scale=${Number(params.width)}:${Number(params.height)}`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(Number(params.crf)),
    '-c:a', 'aac',
    '-movflags', '+faststart',
    '-y',                             // Overwrite output
    params.outputPath                 // Output file (validated path)
  ];

  // spawn() KHÔNG dùng shell — an toàn
  return spawn('ffmpeg', args, {
    shell: false,        // Quan trọng: KHÔNG dùng shell
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 3600000,    // 1 hour max
  });
}
```

### 14.9.2 Input Validation cho FFmpeg Parameters

```typescript
// validators/ffmpeg-params.ts
function validateTranscodeParams(params: unknown): TranscodeParams {
  const schema = z.object({
    inputPath: z.string().refine(p => resolveSafePath(p) !== null),
    outputPath: z.string().refine(p => resolveSafePath(p) !== null),
    width: z.number().int().min(1).max(7680),     // Max 8K
    height: z.number().int().min(1).max(4320),
    crf: z.number().int().min(0).max(51),
    preset: z.enum(['ultrafast', 'fast', 'medium', 'slow', 'veryslow']),
  });

  return schema.parse(params);
}
```

### 14.9.3 FFmpeg Process Isolation

```yaml
# FFmpeg worker container hardening
ffmpeg-worker:
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  ulimits:
    nproc: 64        # Giới hạn số process
    nofile:
      soft: 1024
      hard: 2048
  deploy:
    resources:
      limits:
        cpus: '4'
        memory: 8G
      reservations:
        cpus: '1'
        memory: 2G
  tmpfs:
    - /tmp:size=2G   # Tmp storage cho processing
```

---

## 14.10 Audit Logging & Data Security

### 14.10.1 Audit Log Immutability

Audit logs được thiết kế KHÔNG THỂ sửa đổi hoặc xóa:

```sql
-- Bảng audit_logs với immutability constraints
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    workspace_id UUID NOT NULL,
    user_id     UUID NOT NULL,
    action      VARCHAR(100) NOT NULL,
    resource    VARCHAR(200) NOT NULL,
    resource_id UUID,
    details     JSONB,
    ip_address  INET,
    user_agent  TEXT,
    checksum    VARCHAR(64) NOT NULL  -- SHA-256 của row content
);

-- Chặn UPDATE và DELETE
CREATE RULE no_update_audit AS ON UPDATE TO audit_logs
    DO INSTEAD NOTHING;

CREATE RULE no_delete_audit AS ON DELETE TO audit_logs
    DO INSTEAD NOTHING;

-- Partition theo tháng để quản lý retention
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

### 14.10.2 Sanitized Error Responses

Errors trả về cho client KHÔNG BAO GIỜ chứa internal details:

```typescript
// middleware/error-handler.ts
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  // Log full error internally
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.id,
    path: req.path,
  });

  // Trả về sanitized response
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.code,           // e.g., 'UPLOAD_TOO_LARGE'
      message: err.publicMessage, // User-friendly message
      requestId: req.id,         // Để support có thể trace
    });
  }

  // Generic error — KHÔNG leak internal details
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    requestId: req.id,
  });
}
```

### 14.10.3 Data Retention Policy

| Loại dữ liệu        | Retention Period | Sau khi hết hạn         |
|---------------------|-----------------|------------------------|
| Audit logs          | 3 năm           | Archive sang cold storage |
| Session data        | 30 ngày         | Tự động xóa            |
| Uploaded media      | Theo workspace  | Xóa khi workspace xóa  |
| Temp/processing     | 24 giờ          | Tự động xóa            |
| User PII            | Theo GDPR       | Anonymize khi request   |
| Backup data         | 90 ngày         | Rotate và xóa          |

### 14.10.4 Backup Encryption

Tất cả backup đều được mã hóa trước khi lưu trữ:

```bash
#!/bin/bash
# scripts/backup-database.sh

BACKUP_KEY="/etc/aidilam/backup-encryption.key"  # chmod 600
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="aidilam_backup_${TIMESTAMP}.sql.gz.enc"

# 1. Dump database
pg_dump -h postgres -U aidilam_app aidilam_db | \
  # 2. Compress
  gzip | \
  # 3. Encrypt với AES-256
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -pass file:${BACKUP_KEY} \
    -out "/backups/${BACKUP_FILE}"

# 4. Upload to S3 (server-side encryption enabled)
aws s3 cp "/backups/${BACKUP_FILE}" \
  "s3://aidilam-backups/${BACKUP_FILE}" \
  --sse aws:kms \
  --sse-kms-key-id alias/aidilam-backup-key

# 5. Xóa local file
shred -u "/backups/${BACKUP_FILE}"
```

---

## 14.11 Credential Isolation: AIĐiLàm vs Underspan

### 14.11.1 Nguyên Tắc Tuyệt Đối

> **⚠️ CRITICAL POLICY: Thông tin xác thực (credentials) của AIĐiLàm
> KHÔNG BAO GIỜ được chia sẻ với Underspan hoặc bất kỳ bên thứ ba nào.**

Điều này bao gồm nhưng không giới hạn:

- Database credentials (connection strings, passwords)
- API keys và secrets
- JWT signing keys
- Encryption keys
- Cloud provider credentials (AWS, GCP)
- OAuth client secrets
- Service account tokens
- SSL/TLS private keys

### 14.11.2 Tách Biệt Hoàn Toàn

```
┌──────────────────────┐          ┌──────────────────────┐
│      AIĐiLàm         │          │      Underspan       │
│                      │          │                      │
│  • DB credentials    │    ✗     │  • DB credentials    │
│  • API keys          │◄──┼────►│  • API keys          │
│  • JWT secrets       │   NO     │  • JWT secrets       │
│  • Cloud IAM         │  SHARE   │  • Cloud IAM         │
│  • Encryption keys   │          │  • Encryption keys   │
│                      │          │                      │
└──────────────────────┘          └──────────────────────┘
```

### 14.11.3 Enforcement Mechanisms

```typescript
// Separate secret stores
const AIDILAM_VAULT_PATH = 'secret/aidilam/';      // AIĐiLàm only
const UNDERSPAN_VAULT_PATH = 'secret/underspan/';  // Underspan only

// Vault policies
// aidilam-policy.hcl
// path "secret/aidilam/*" { capabilities = ["read", "list"] }
// path "secret/underspan/*" { capabilities = ["deny"] }   ← EXPLICIT DENY

// CI/CD: Separate pipelines, separate credential stores
// AIĐiLàm GitHub Actions → AIĐiLàm AWS Account
// Underspan GitHub Actions → Underspan AWS Account
// KHÔNG BAO GIỜ cross-reference
```

### 14.11.4 Audit cho Credential Access

Mọi truy cập vào credential store đều được logged:

```typescript
// Vault audit log entry
{
  "type": "response",
  "auth": { "token_type": "service", "entity_id": "aidilam-backend" },
  "request": {
    "path": "secret/aidilam/database-credentials",
    "operation": "read"
  },
  "response": { "status": 200 }
}
// Alert ngay lập tức nếu có cross-access attempt
```

---

## 14.12 Threat Model

### 14.12.1 Bảng Phân Tích Mối Đe Dọa

| # | Threat | Risk Level | Attack Vector | Impact | Mitigation |
|---|--------|-----------|---------------|--------|------------|
| T1 | SQL Injection | **Critical** | Malicious input trong query params | Data breach, data loss | Parameterized queries, ORM, input validation |
| T2 | Cross-Workspace Data Leak | **Critical** | Manipulate workspace_id header | Unauthorized data access | RLS at database level, middleware verification |
| T3 | Container Escape | **High** | Exploit kernel vulnerability | Host compromise | Non-root, no docker.sock, cap_drop ALL, seccomp |
| T4 | Path Traversal | **High** | `../../etc/passwd` trong filename | File system access | Path normalization, jail to upload dir, symlink check |
| T5 | SSRF | **High** | Internal URL trong webhook/import | Internal network scan | URL allowlist, private IP block, DNS rebinding check |
| T6 | Shell Injection via FFmpeg | **High** | Malicious filename/params | RCE on worker | spawn() without shell, parameterized args |
| T7 | Credential Leakage | **Critical** | Exposed .env, git commit | Full system compromise | chmod 600, .gitignore, vault references, rotation |
| T8 | Session Hijacking | **High** | Stolen session token | Account takeover | AES-256-GCM encryption, short TTL, IP binding |
| T9 | Malicious File Upload | **Medium** | Executable disguised as media | Code execution | Magic bytes check, MIME validation, isolated processing |
| T10 | DDoS on Upload Endpoint | **Medium** | Flood large file uploads | Service unavailability | Rate limiting, file size limits, queue-based processing |
| T11 | Insider Threat | **High** | Malicious employee action | Data exfiltration | RBAC, audit logs, least privilege, credential rotation |
| T12 | Backup Data Breach | **Medium** | Unencrypted backup stolen | Historical data exposure | AES-256 backup encryption, KMS, access controls |
| T13 | Cross-Platform Credential Share | **Critical** | AIĐiLàm creds used by Underspan | Unauthorized platform access | Separate vault paths, explicit deny policies, alerts |
| T14 | Audit Log Tampering | **Medium** | Attacker covers tracks | Loss of forensic evidence | Immutable logs (no UPDATE/DELETE rules), checksums |
| T15 | DNS Rebinding | **Medium** | Bypass SSRF allowlist | Internal service access | Resolve DNS before request, verify IP post-resolution |

### 14.12.2 Risk Assessment Matrix

```
                    ┌─────────────────────────────────────────┐
                    │              IMPACT                       │
                    │    Low      Medium     High    Critical  │
         ┌──────────┼─────────────────────────────────────────┤
         │ High     │           │  T10     │  T3,T4 │ T1,T2  │
LIKELI-  │          │           │  T12     │  T5,T6 │ T7,T13 │
HOOD     │ Medium   │           │  T9,T14  │  T8,T11│         │
         │          │           │  T15     │        │         │
         │ Low      │           │          │        │         │
         └──────────┼─────────────────────────────────────────┘
```

---

## 14.13 Security Checklist cho Deployment

### Pre-deployment

- [ ] Tất cả containers chạy non-root (UID >= 1000)
- [ ] Không có Docker socket mount
- [ ] Environment files có permission 600
- [ ] Secrets được reference qua vault/env, không hardcode
- [ ] RLS enabled trên tất cả bảng có workspace_id
- [ ] PostgreSQL và Redis không expose port ra host
- [ ] Network isolation đúng (frontend_net / backend_net)
- [ ] FFmpeg commands dùng spawn() không có shell
- [ ] Upload validation pipeline hoàn chỉnh
- [ ] SSRF prevention với URL allowlist
- [ ] Session encryption keys đã rotate (< 90 ngày)
- [ ] Backup encryption verified
- [ ] Audit logs immutability confirmed
- [ ] AIĐiLàm và Underspan credentials hoàn toàn tách biệt
- [ ] Error responses không leak internal details
- [ ] Trivy scan passed (no critical/high vulnerabilities)

### Post-deployment

- [ ] Penetration test passed
- [ ] Verify RLS bằng cross-workspace access test
- [ ] Verify network isolation bằng nmap từ frontend container
- [ ] Verify audit log immutability bằng UPDATE/DELETE attempts
- [ ] Monitor credential access logs cho anomalies

---

## 14.14 Kết Luận

Kiến trúc bảo mật của AIĐiLàm được xây dựng trên nhiều lớp phòng thủ,
từ application-level (RBAC, input validation) đến infrastructure-level
(container hardening, network isolation) và data-level (encryption, RLS,
immutable audit). Mỗi lớp hoạt động độc lập, đảm bảo rằng việc bypass
một lớp không dẫn đến compromise toàn hệ thống.

Nguyên tắc **credential isolation** giữa AIĐiLàm và Underspan là
non-negotiable và được enforce ở cả technical level (separate vault paths,
explicit deny policies) lẫn organizational level (separate CI/CD pipelines,
separate cloud accounts).

---

*Tài liệu này được review và cập nhật mỗi quý hoặc sau mỗi security incident.*
*Lần review tiếp theo: Q4 2026.*
