# Chương 18 — API Architecture

> Kiến trúc API của hệ thống AIDiLam: nguyên tắc thiết kế, bảo mật, và contract
> giữa client–server–worker.

---

## 18.1 Nguyên Tắc Thiết Kế Tổng Quan

Hệ thống API được xây dựng trên các nguyên tắc cốt lõi:

1. **Server là nguồn sự thật duy nhất** — Browser KHÔNG bao giờ authoritative cho bất kỳ
   quyết định nào liên quan đến nghiệp vụ.
2. **Security by default** — Mọi endpoint đều yêu cầu authentication trừ khi được
   whitelist rõ ràng.
3. **Idempotency** — Mọi mutation đều hỗ trợ idempotency key để đảm bảo exactly-once
   semantics.
4. **Consistency trong response format** — Tất cả API trả về cùng error envelope.
5. **Auditability** — Mọi request đều mang correlation ID và audit context.

---

## 18.2 Versioning Strategy

Toàn bộ public API tuân theo versioning scheme:

```
/api/v1/resources
/api/v1/resources/:id
/api/v1/resources/:id/actions
```

### Quy tắc versioning:

- Major version trong URL path: `/api/v1`, `/api/v2`
- Minor/patch changes KHÔNG tạo version mới — chỉ additive changes
- Breaking changes BẮT BUỘC tăng major version
- Deprecated endpoints trả header `Deprecation: true` và `Sunset: <date>`
- Tối thiểu 6 tháng deprecation period trước khi loại bỏ version cũ

```typescript
// Route registration pattern
const v1Router = express.Router();
app.use('/api/v1', v1Router);

v1Router.use('/conversations', conversationRoutes);
v1Router.use('/providers', providerRoutes);
v1Router.use('/models', modelRoutes);
v1Router.use('/jobs', jobRoutes);
```

---

## 18.3 Authentication — Server-Side JWT với httpOnly Cookies

### Nguyên tắc bất di bất dịch

Browser KHÔNG authoritative cho: **identity, auth, provider, model, endpoint,
credential, price, routing, job state**. Toàn bộ các giá trị này do server quản lý,
xác thực, và enforce.

### Flow authentication:

```
[Login Request] → Server validates credentials
                → Server issues JWT
                → JWT stored in httpOnly secure cookie
                → Cookie sent automatically with every request
                → Server validates JWT on each request
```

### Cookie configuration:

```typescript
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,        // JavaScript KHÔNG thể đọc
  secure: true,          // Chỉ gửi qua HTTPS
  sameSite: 'strict',    // Chống CSRF
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 phút - access token
  domain: process.env.COOKIE_DOMAIN,
};
```

### Tại sao httpOnly cookie thay vì localStorage:

| Tiêu chí | httpOnly Cookie | localStorage |
|-----------|----------------|--------------|
| XSS protection | ✅ Immune | ❌ Vulnerable |
| CSRF protection | Cần SameSite + token | N/A |
| Auto-sent | ✅ Tự động | ❌ Manual header |
| Server control | ✅ Revoke bất kỳ lúc nào | ❌ Client-side |

### Token refresh strategy:

- Access token: 15 phút expiry, stored trong httpOnly cookie
- Refresh token: 7 ngày expiry, stored trong separate httpOnly cookie với path `/api/v1/auth/refresh`
- Silent refresh trước khi access token hết hạn
- Refresh token rotation: mỗi lần dùng refresh token sẽ issue cặp token mới

---

## 18.4 RBAC Enforcement Middleware

Authorization được enforce tại middleware layer, KHÔNG phải ở application logic:

```typescript
// Middleware chain cho mọi protected route
router.get(
  '/providers',
  authenticate,          // Verify JWT, extract user context
  authorize('providers:read'),  // Check RBAC permission
  auditLog,             // Ghi audit trail
  rateLimiter,          // Rate limiting
  validateRequest(schema), // Input validation
  handler               // Business logic
);
```

### RBAC model:

```typescript
interface Permission {
  resource: string;    // 'providers', 'models', 'conversations'
  action: string;      // 'read', 'write', 'delete', 'admin'
}

interface Role {
  name: string;
  permissions: Permission[];
  inherits?: string[]; // Role hierarchy
}

// Middleware implementation
function authorize(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPermissions = req.user.effectivePermissions;
    const hasAll = requiredPermissions.every(p =>
      userPermissions.includes(p)
    );
    if (!hasAll) {
      throw new ForbiddenError('Insufficient permissions', {
        required: requiredPermissions,
        correlationId: req.correlationId,
      });
    }
    next();
  };
}
```

### Nguyên tắc RBAC:

- Permissions gắn với Role, KHÔNG gắn trực tiếp với User
- User có thể có nhiều Roles
- Role hỗ trợ inheritance (admin inherits tất cả permissions của editor)
- Permission check tại middleware — business logic KHÔNG cần biết về auth

---

## 18.5 Request Validation với Zod Schemas

Mọi input từ client đều được validate bằng Zod schema TRƯỚC KHI đến business logic:

```typescript
import { z } from 'zod';

// Schema definition
const CreateConversationSchema = z.object({
  title: z.string().min(1).max(200),
  modelId: z.string().uuid(),
  systemPrompt: z.string().max(10000).optional(),
  parameters: z.object({
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().min(1).max(128000).optional(),
    topP: z.number().min(0).max(1).default(1),
  }).optional(),
});

// Validation middleware factory
function validateRequest<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError('Invalid request body', {
        errors: result.error.flatten(),
        correlationId: req.correlationId,
      });
    }
    req.validated = result.data;
    next();
  };
}
```

### Validation layers:

1. **Transport layer**: Content-Type check, body size limit
2. **Schema layer**: Zod validation — type, format, constraints
3. **Business layer**: Uniqueness checks, relationship validation
4. **Database layer**: Constraints cuối cùng (unique, FK, check)

---

## 18.6 Idempotency Keys cho Mutations

Mọi mutation (POST, PUT, PATCH, DELETE) đều hỗ trợ idempotency key:

```typescript
// Client gửi header
// Idempotency-Key: <client-generated-uuid>

interface IdempotencyRecord {
  key: string;
  userId: string;
  endpoint: string;
  requestHash: string;    // Hash của request body
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
  expiresAt: Date;        // 24 giờ
}

async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['idempotency-key'];
  if (!key) {
    // POST bắt buộc có idempotency key
    if (req.method === 'POST') {
      throw new BadRequestError('Idempotency-Key header required for POST');
    }
    return next();
  }

  const existing = await idempotencyStore.get(key, req.user.id);
  if (existing) {
    // Trả về cached response — exactly-once semantics
    res.status(existing.responseStatus).json(existing.responseBody);
    return;
  }

  // Proceed và cache response
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    idempotencyStore.set(key, req.user.id, {
      endpoint: req.path,
      requestHash: hash(req.body),
      responseStatus: res.statusCode,
      responseBody: body,
      expiresAt: addHours(new Date(), 24),
    });
    return originalJson(body);
  };
  next();
}
```

---

## 18.7 Pagination — Cursor-Based

Hệ thống sử dụng **cursor-based pagination** thay vì offset-based:

### Tại sao cursor-based:

- **Stable results**: Không bị skip/duplicate khi data thay đổi
- **Performance**: Không cần COUNT(*) hoặc OFFSET scan
- **Infinite scroll friendly**: Phù hợp UX của chat application

### Response format:

```typescript
interface PaginatedResponse<T> {
  success: true;
  data: {
    items: T[];
    pagination: {
      cursor: string | null;   // Cursor cho page tiếp theo
      hasMore: boolean;
      limit: number;
    };
  };
}

// Cursor là encrypted composite key
// Ví dụ: base64(JSON.stringify({ id: "abc", createdAt: "2026-01-01" }))
```

### Query pattern:

```typescript
// Client request
GET /api/v1/conversations?limit=20&cursor=eyJpZCI6ImFiYyJ9

// Server implementation
async function paginate<T>(
  query: SelectQueryBuilder<T>,
  cursor: string | undefined,
  limit: number = 20
): Promise<PaginatedResponse<T>> {
  const maxLimit = Math.min(limit, 100); // Hard cap tại 100

  if (cursor) {
    const decoded = decodeCursor(cursor);
    query.where('created_at < :createdAt', { createdAt: decoded.createdAt })
         .orWhere('created_at = :createdAt AND id < :id', decoded);
  }

  const items = await query
    .orderBy('created_at', 'DESC')
    .addOrderBy('id', 'DESC')
    .limit(maxLimit + 1) // Fetch thêm 1 để check hasMore
    .getMany();

  const hasMore = items.length > maxLimit;
  if (hasMore) items.pop();

  return {
    success: true,
    data: {
      items,
      pagination: {
        cursor: hasMore ? encodeCursor(items[items.length - 1]) : null,
        hasMore,
        limit: maxLimit,
      },
    },
  };
}
```

---

## 18.8 Error Envelope

Mọi API response tuân theo envelope format thống nhất:

```typescript
// Success response
interface SuccessResponse<T> {
  success: true;
  data: T;
}

// Error response
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Machine-readable: 'VALIDATION_ERROR', 'FORBIDDEN'
    message: string;        // Human-readable message
    correlation_id: string; // Trace request across services
    details?: unknown;      // Additional context (validation errors, etc.)
  };
}

// Ví dụ error response thực tế
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body contains invalid fields",
    "correlation_id": "req_01H5X3KBVF8C2DNMJ4QR6TYP",
    "details": {
      "fieldErrors": {
        "temperature": ["Number must be less than or equal to 2"]
      }
    }
  }
}
```

### Error code catalog:

| Code | HTTP Status | Mô tả |
|------|-------------|--------|
| `VALIDATION_ERROR` | 400 | Input không hợp lệ |
| `UNAUTHORIZED` | 401 | Chưa authenticate |
| `FORBIDDEN` | 403 | Không đủ quyền |
| `NOT_FOUND` | 404 | Resource không tồn tại |
| `CONFLICT` | 409 | Trùng lặp / race condition |
| `RATE_LIMITED` | 429 | Vượt quá rate limit |
| `INTERNAL_ERROR` | 500 | Lỗi server không xác định |
| `SERVICE_UNAVAILABLE` | 503 | Dependency không khả dụng |

---

## 18.9 Correlation ID và Audit Context

### Correlation ID:

Mỗi request được gắn một unique correlation ID, truyền xuyên suốt toàn bộ call chain:

```typescript
function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Client có thể gửi correlation ID (cho tracing end-to-end)
  // hoặc server tự generate
  const correlationId = req.headers['x-correlation-id'] as string
    || `req_${generateId()}`;

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  // Inject vào logger context
  req.logger = logger.child({ correlationId, userId: req.user?.id });

  next();
}
```

### Audit context:

```typescript
interface AuditContext {
  correlationId: string;
  userId: string;
  userAgent: string;
  ipAddress: string;
  timestamp: Date;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

// Audit middleware tự động ghi lại mọi mutation
function auditLog(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        auditService.log({
          correlationId: req.correlationId,
          userId: req.user.id,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          timestamp: new Date(),
          action: `${req.method} ${req.route.path}`,
          resource: req.baseUrl.split('/').pop(),
          resourceId: req.params.id,
        });
      }
    });
  }
  next();
}
```

---

## 18.10 Rate Limiting

Rate limiting được áp dụng ở nhiều layer:

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';

// Global rate limiter
const globalLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:global',
  points: 100,          // 100 requests
  duration: 60,         // per 60 seconds
  blockDuration: 60,    // Block 60 seconds khi vượt
});

// Per-endpoint rate limiter cho expensive operations
const aiCompletionLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:ai',
  points: 10,           // 10 requests
  duration: 60,         // per 60 seconds
});

// Rate limit response headers
res.setHeader('X-RateLimit-Limit', limiterRes.points);
res.setHeader('X-RateLimit-Remaining', limiterRes.remainingPoints);
res.setHeader('X-RateLimit-Reset', new Date(Date.now() + limiterRes.msBeforeNext));
```

---

## 18.11 Upload Workflow — Presigned URLs tới MinIO

Upload KHÔNG đi qua application server. Client upload trực tiếp tới MinIO thông qua
presigned URL:

```
[Client] → POST /api/v1/uploads/presign → [Server generates presigned URL]
[Client] → PUT presigned-url (file body) → [MinIO]
[Client] → POST /api/v1/uploads/confirm   → [Server verifies & records]
```

### Implementation:

```typescript
// Step 1: Request presigned upload URL
router.post('/uploads/presign', authenticate, async (req, res) => {
  const { filename, contentType, size } = req.validated;

  // Validate file constraints
  if (size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('File too large');
  }

  const objectKey = `uploads/${req.user.id}/${ulid()}/${sanitize(filename)}`;

  const presignedUrl = await minioClient.presignedPutObject(
    BUCKET_NAME,
    objectKey,
    PRESIGN_EXPIRY_SECONDS // 15 phút
  );

  // Lưu pending upload record
  await uploadStore.createPending({
    objectKey,
    userId: req.user.id,
    filename,
    contentType,
    expectedSize: size,
    expiresAt: addMinutes(new Date(), 15),
  });

  res.json({
    success: true,
    data: { uploadUrl: presignedUrl, objectKey },
  });
});

// Step 2: Confirm upload
router.post('/uploads/confirm', authenticate, async (req, res) => {
  const { objectKey } = req.validated;

  // Verify object exists trong MinIO
  const stat = await minioClient.statObject(BUCKET_NAME, objectKey);

  // Update record
  await uploadStore.confirm(objectKey, {
    actualSize: stat.size,
    etag: stat.etag,
  });

  res.json({ success: true, data: { objectKey, size: stat.size } });
});
```

### Signed object URLs cho download:

```typescript
// Generate signed URL để đọc object — expiry ngắn
async function getSignedObjectUrl(objectKey: string): Promise<string> {
  return minioClient.presignedGetObject(
    BUCKET_NAME,
    objectKey,
    DOWNLOAD_EXPIRY_SECONDS // 1 giờ
  );
}
```

---

## 18.12 Internal Worker Contracts — Queue, NOT HTTP

Worker communication sử dụng **job queue** (BullMQ/Redis), KHÔNG PHẢI HTTP APIs:

### Nguyên tắc:

- Workers KHÔNG expose HTTP endpoints
- Giao tiếp qua job schema được định nghĩa bằng Zod
- Job state management qua queue infrastructure
- Retry, backoff, dead-letter queue được handle bởi queue system

```typescript
// Job schema definition — contract giữa API server và worker
const AiCompletionJobSchema = z.object({
  jobId: z.string().ulid(),
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })),
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
    endpoint: z.string().url(),
  }),
  parameters: z.object({
    temperature: z.number(),
    maxTokens: z.number().optional(),
    topP: z.number(),
  }),
  // Metadata cho audit
  correlationId: z.string(),
  createdAt: z.string().datetime(),
});

type AiCompletionJob = z.infer<typeof AiCompletionJobSchema>;

// API server dispatches job
async function dispatchCompletion(data: AiCompletionJob) {
  // Validate trước khi enqueue
  const validated = AiCompletionJobSchema.parse(data);
  await completionQueue.add('ai-completion', validated, {
    jobId: validated.jobId,  // Idempotent job ID
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 },  // 24h
    removeOnFail: { age: 604800 },     // 7 days
  });
}

// Worker consumes job
const worker = new Worker('ai-completion', async (job) => {
  const data = AiCompletionJobSchema.parse(job.data);
  // Process...
}, { connection: redisConnection });
```

### Tại sao Queue thay vì HTTP cho workers:

| Tiêu chí | Queue (BullMQ) | HTTP API |
|-----------|---------------|----------|
| Retry built-in | ✅ Configurable | ❌ Phải tự implement |
| Backpressure | ✅ Tự động | ❌ Manual |
| Job state tracking | ✅ Native | ❌ Phải build |
| Dead-letter queue | ✅ Built-in | ❌ Phải build |
| Horizontal scaling | ✅ Competing consumers | ⚠️ Load balancer |
| Decoupling | ✅ Hoàn toàn | ❌ Tight coupling |

---

## 18.13 Browser Không Authoritative

Đây là nguyên tắc bảo mật quan trọng nhất của hệ thống:

**Browser KHÔNG PHẢI nguồn sự thật cho:**

- **Identity** — Server verify JWT, không tin client claim
- **Auth** — Permission check tại server middleware
- **Provider** — Provider config do admin quản lý server-side
- **Model** — Model availability do server quyết định
- **Endpoint** — AI endpoint URLs KHÔNG bao giờ expose cho client
- **Credential** — API keys KHÔNG BAO GIỜ gửi về browser
- **Price** — Pricing logic server-side, client chỉ hiển thị
- **Routing** — Model routing decisions server-side
- **Job state** — Job status từ queue system, không từ client

```typescript
// ❌ TUYỆT ĐỐI KHÔNG — Client gửi endpoint/credential
POST /api/v1/completions
{ "endpoint": "https://api.openai.com", "apiKey": "sk-..." }

// ✅ ĐÚNG — Client chỉ gửi intent
POST /api/v1/completions
{ "conversationId": "...", "message": "..." }
// Server tự resolve: provider → model → endpoint → credential → routing
```

---

## 18.14 Webhook Verification

Khi nhận webhook từ external services:

```typescript
function verifyWebhookSignature(
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison để chống timing attack
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Webhook handler
router.post('/webhooks/:provider', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const secret = webhookSecrets[req.params.provider];

  if (!verifyWebhookSignature(req.body, signature, secret)) {
    logger.warn('Invalid webhook signature', {
      provider: req.params.provider,
      correlationId: req.correlationId,
    });
    return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE' } });
  }

  // Process verified webhook
  next();
});
```

---

## 18.15 API Security Headers

Mọi response đều bao gồm security headers:

```typescript
// Security headers middleware
function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // CORS — chỉ cho phép known origins
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, X-Correlation-Id');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // HSTS — enforce HTTPS
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // CSP — Content Security Policy
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '));

  // Các header bổ sung
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Deprecated, CSP thay thế
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  next();
}
```

### CORS configuration chi tiết:

```typescript
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,  // Cho phép cookies
  maxAge: 86400,      // Preflight cache 24 giờ
};
```

---

## 18.16 Tổng Kết Middleware Chain

Thứ tự middleware cho mọi request:

```
Request
  → Security Headers
  → CORS
  → Body Parser (với size limit)
  → Correlation ID injection
  → Rate Limiter (global)
  → Authentication (JWT cookie verification)
  → Authorization (RBAC check)
  → Rate Limiter (per-endpoint)
  → Request Validation (Zod)
  → Idempotency Check
  → Audit Context
  → Route Handler (business logic)
  → Error Handler (format to envelope)
  → Audit Log (post-response)
Response
```

Mỗi layer có trách nhiệm rõ ràng, fail-fast khi không hợp lệ, và tất cả errors
đều được format về cùng envelope structure với correlation ID để trace.

---

*Chương tiếp theo: Chương 19 — Event-Driven Architecture & Message Queue Design*
