# Chương 22: Coding Conventions

## Tổng Quan

Tài liệu này định nghĩa các quy ước lập trình (coding conventions) cho toàn bộ hệ thống AiDiLam.
Mục tiêu là đảm bảo tính nhất quán, khả năng bảo trì, và chất lượng code trên tất cả các service
và package. Mọi thành viên trong team đều phải tuân thủ các quy tắc này.

Các conventions được chia thành các nhóm chính:
- TypeScript conventions
- Python conventions
- Dependency boundaries
- Database transactions
- Immutable history
- Provider adapters
- Queue contracts
- Testing strategy
- Logging
- Configuration & secrets
- Naming conventions
- File organization

---

## 1. TypeScript Conventions

### 1.1 Strict Mode Bắt Buộc

Tất cả các TypeScript project phải bật `strict: true` trong `tsconfig.json`. Không có ngoại lệ.

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### 1.2 Cấm Sử Dụng `any`

Không bao giờ sử dụng type `any` trong code production. Nếu type chưa xác định, sử dụng `unknown`
và narrow down bằng type guards hoặc validation.

```typescript
// ❌ SAI - Không bao giờ làm thế này
function processData(data: any): any {
  return data.value;
}

// ✅ ĐÚNG - Sử dụng unknown và validate
function processData(data: unknown): Result<ProcessedData, ValidationError> {
  const parsed = DataSchema.safeParse(data);
  if (!parsed.success) {
    return err(new ValidationError(parsed.error));
  }
  return ok(parsed.data);
}
```

ESLint rule bắt buộc:
```json
{
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error"
}
```

### 1.3 Zod Cho Runtime Validation

Sử dụng Zod làm thư viện duy nhất cho runtime validation. Mọi data từ bên ngoài (API input,
queue messages, database results, file reads) phải được validate bằng Zod schema.

```typescript
import { z } from "zod";

// Định nghĩa schema
const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  ownerId: z.string().uuid(),
  settings: z.object({
    language: z.enum(["vi", "en"]),
    visibility: z.enum(["public", "private"]),
  }),
});

// Infer type từ schema
type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

// Sử dụng trong handler
function handleCreateProject(rawInput: unknown): Result<Project, DomainError> {
  const validation = CreateProjectSchema.safeParse(rawInput);
  if (!validation.success) {
    return err(new InvalidInputError(validation.error.flatten()));
  }
  return projectService.create(validation.data);
}
```

### 1.4 Domain Errors - Không Throw Generic Exceptions

Hệ thống sử dụng Result pattern thay vì throw exceptions. Mỗi domain có errors riêng,
kế thừa từ base `DomainError`.

```typescript
// Base domain error
abstract class DomainError {
  abstract readonly code: string;
  abstract readonly message: string;
  abstract readonly httpStatus: number;
}

// Domain-specific errors
class ProjectNotFoundError extends DomainError {
  readonly code = "PROJECT_NOT_FOUND";
  readonly httpStatus = 404;
  constructor(readonly projectId: string) {
    super();
  }
  get message() {
    return `Project ${this.projectId} not found`;
  }
}

class InsufficientQuotaError extends DomainError {
  readonly code = "INSUFFICIENT_QUOTA";
  readonly httpStatus = 402;
  constructor(
    readonly currentUsage: number,
    readonly limit: number,
  ) {
    super();
  }
  get message() {
    return `Quota exceeded: ${this.currentUsage}/${this.limit}`;
  }
}

// Sử dụng Result type
type Result<T, E extends DomainError> =
  | { success: true; data: T }
  | { success: false; error: E };
```

**Quy tắc:**
- Không `throw new Error(...)` trong business logic
- Mỗi error phải có `code` duy nhất cho client handling
- HTTP status mapping nằm ở error class, không ở controller
- Chỉ throw cho unexpected errors (bugs, infrastructure failures)

---

## 2. Dependency Boundaries

### 2.1 Import Restrictions Giữa Các Packages

Mỗi package có boundary rõ ràng. Sử dụng ESLint plugin `eslint-plugin-import` và
`@typescript-eslint/no-restricted-imports` để enforce.

```
packages/
├── domain/          # Pure logic, KHÔNG import từ infra hoặc app
├── application/     # Use cases, import domain only
├── infrastructure/  # Adapters, import domain + application
├── api/             # HTTP layer, import application only
└── shared/          # Shared types/utils, KHÔNG import từ bất kỳ package nào khác
```

**Quy tắc import:**
- `domain` → không import từ package nào khác (trừ `shared`)
- `application` → chỉ import từ `domain` và `shared`
- `infrastructure` → import từ `domain`, `application`, `shared`
- `api` → import từ `application` và `shared`

```typescript
// eslint config cho package domain
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [
        "@aidilam/infrastructure/*",
        "@aidilam/application/*",
        "@aidilam/api/*"
      ]
    }]
  }
}
```

### 2.2 Interface Boundaries

Mọi cross-package communication phải thông qua interfaces được định nghĩa ở layer thấp hơn.

```typescript
// domain/ports/storage.port.ts - Định nghĩa ở domain
export interface StoragePort {
  upload(file: FileData): Promise<Result<StorageKey, StorageError>>;
  getSignedUrl(key: StorageKey, expiresIn: number): Promise<Result<string, StorageError>>;
  delete(key: StorageKey): Promise<Result<void, StorageError>>;
}

// infrastructure/adapters/s3-storage.adapter.ts - Implement ở infra
export class S3StorageAdapter implements StoragePort {
  // implementation details...
}
```

---

## 3. Database Transactions

### 3.1 Explicit Transactions

Mọi database transaction phải được khai báo explicit. Không sử dụng implicit transactions
hoặc auto-commit cho các operations liên quan đến nhiều records.

```typescript
// ✅ ĐÚNG - Transaction explicit
async function transferCredits(
  fromUserId: string,
  toUserId: string,
  amount: number,
): Promise<Result<Transfer, TransferError>> {
  return db.transaction(async (tx) => {
    const sender = await tx.users.findById(fromUserId);
    if (sender.balance < amount) {
      return err(new InsufficientBalanceError(sender.balance, amount));
    }
    await tx.users.deductBalance(fromUserId, amount);
    await tx.users.addBalance(toUserId, amount);
    const transfer = await tx.transfers.create({ fromUserId, toUserId, amount });
    return ok(transfer);
  });
}
```

### 3.2 Short-Lived Transactions

Transactions phải ngắn gọn. Không thực hiện external calls (API, queue publish, file I/O)
bên trong transaction.

```typescript
// ❌ SAI - External call trong transaction
await db.transaction(async (tx) => {
  await tx.orders.updateStatus(orderId, "processing");
  await paymentGateway.charge(amount); // ← KHÔNG LÀM THẾ NÀY
  await tx.orders.updateStatus(orderId, "paid");
});

// ✅ ĐÚNG - Tách external call ra ngoài
const order = await db.transaction(async (tx) => {
  return tx.orders.updateStatus(orderId, "processing");
});
const chargeResult = await paymentGateway.charge(amount);
if (chargeResult.success) {
  await db.transaction(async (tx) => {
    await tx.orders.updateStatus(orderId, "paid");
    await tx.payments.record(orderId, chargeResult.data);
  });
}
```

### 3.3 Không Nested Transactions

Không sử dụng nested transactions. Nếu một function cần transaction, nó phải nhận
transaction context từ caller.

```typescript
// ❌ SAI - Nested transaction
async function createProjectWithMembers(data: CreateProjectData) {
  return db.transaction(async (tx) => {
    const project = await createProject(data); // ← Nếu hàm này cũng tạo transaction → nested
    await addMembers(project.id, data.members);
  });
}

// ✅ ĐÚNG - Truyền transaction context
async function createProjectWithMembers(data: CreateProjectData) {
  return db.transaction(async (tx) => {
    const project = await createProject(data, tx);
    await addMembers(project.id, data.members, tx);
  });
}

async function createProject(data: CreateProjectData, tx: Transaction) {
  return tx.projects.create(data);
}
```

---

## 4. Immutable History

### 4.1 Versioned Entities - Append-Only

Tất cả entities quan trọng trong hệ thống đều sử dụng mô hình append-only. Không bao giờ
UPDATE hoặc DELETE records. Thay vào đó, tạo version mới.

```typescript
// Schema cho versioned entity
const projectVersions = pgTable("project_versions", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id").notNull(),
  version: integer("version").notNull(),
  data: jsonb("data").notNull(),
  changedBy: uuid("changed_by").notNull(),
  changedAt: timestamp("changed_at").defaultNow(),
  changeReason: text("change_reason"),
});

// Tạo version mới thay vì update
async function updateProject(
  projectId: string,
  changes: Partial<ProjectData>,
  userId: string,
  reason: string,
  tx: Transaction,
): Promise<Result<ProjectVersion, DomainError>> {
  const current = await tx.projectVersions.findLatest(projectId);
  const newVersion: ProjectVersion = {
    id: generateId(),
    projectId,
    version: current.version + 1,
    data: { ...current.data, ...changes },
    changedBy: userId,
    changedAt: new Date(),
    changeReason: reason,
  };
  await tx.projectVersions.insert(newVersion);
  return ok(newVersion);
}
```

### 4.2 Audit Trail

Mọi thay đổi đều có audit trail tự động. Không cần tạo riêng audit log — history chính là audit.

```typescript
// Query lịch sử thay đổi
async function getProjectHistory(projectId: string): Promise<ProjectVersion[]> {
  return db.projectVersions
    .where({ projectId })
    .orderBy("version", "desc")
    .limit(50);
}

// Rollback = tạo version mới với data cũ
async function rollbackProject(
  projectId: string,
  targetVersion: number,
  userId: string,
): Promise<Result<ProjectVersion, DomainError>> {
  const target = await db.projectVersions.findByVersion(projectId, targetVersion);
  if (!target) return err(new VersionNotFoundError(projectId, targetVersion));

  return updateProject(
    projectId,
    target.data,
    userId,
    `Rollback to version ${targetVersion}`,
    db,
  );
}
```

---

## 5. Provider Adapters

### 5.1 Interface First - Không Direct SDK Trong Business Code

Business logic KHÔNG BAO GIỜ import trực tiếp SDK của third-party providers (AWS SDK, Stripe SDK,
OpenAI SDK, etc.). Tất cả phải thông qua adapter interface.

```typescript
// ❌ SAI - Direct SDK import trong business code
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

class VideoService {
  async uploadVideo(file: Buffer) {
    const s3 = new S3Client({ region: "ap-southeast-1" });
    await s3.send(new PutObjectCommand({ /* ... */ }));
  }
}

// ✅ ĐÚNG - Thông qua interface
// domain/ports/object-storage.port.ts
export interface ObjectStoragePort {
  put(key: string, data: Buffer, contentType: string): Promise<Result<StorageResult, StorageError>>;
  get(key: string): Promise<Result<Buffer, StorageError>>;
  getSignedUrl(key: string, expiresIn: number): Promise<Result<string, StorageError>>;
  delete(key: string): Promise<Result<void, StorageError>>;
}

// application/services/video.service.ts
class VideoService {
  constructor(private readonly storage: ObjectStoragePort) {}

  async uploadVideo(file: Buffer, metadata: VideoMetadata): Promise<Result<Video, DomainError>> {
    const key = `videos/${metadata.projectId}/${generateId()}.mp4`;
    const uploadResult = await this.storage.put(key, file, "video/mp4");
    if (!uploadResult.success) return uploadResult;
    // ... business logic
  }
}
```

### 5.2 Provider Adapter Implementation

Mỗi provider có adapter riêng, implement interface đã định nghĩa:

```typescript
// infrastructure/adapters/s3-object-storage.adapter.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ObjectStoragePort } from "@aidilam/domain/ports";

export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      credentials: config.credentials,
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<Result<StorageResult, StorageError>> {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }));
      return ok({ key, bucket: this.config.bucket });
    } catch (error) {
      return err(new StorageError("UPLOAD_FAILED", error));
    }
  }
  // ... other methods
}
```

---

## 6. Queue Contracts

### 6.1 Typed Job Payloads

Mọi job payload gửi qua queue phải có type definition và Zod schema validation.

```typescript
// shared/contracts/jobs/video-processing.job.ts
import { z } from "zod";

export const VideoProcessingJobSchema = z.object({
  jobType: z.literal("video-processing"),
  payload: z.object({
    videoId: z.string().uuid(),
    projectId: z.string().uuid(),
    sourceKey: z.string(),
    outputFormats: z.array(z.enum(["720p", "1080p", "4k"])),
    watermark: z.object({
      enabled: z.boolean(),
      text: z.string().optional(),
    }),
  }),
  metadata: z.object({
    correlationId: z.string().uuid(),
    triggeredBy: z.string().uuid(),
    scheduledAt: z.string().datetime(),
  }),
});

export type VideoProcessingJob = z.infer<typeof VideoProcessingJobSchema>;
```

### 6.2 Schema Validation Ở Cả Producer Và Consumer

```typescript
// Producer - validate trước khi publish
class VideoJobProducer {
  async enqueue(job: VideoProcessingJob): Promise<Result<void, QueueError>> {
    const validation = VideoProcessingJobSchema.safeParse(job);
    if (!validation.success) {
      return err(new InvalidJobPayloadError(validation.error));
    }
    await this.queue.publish("video-processing", validation.data);
    return ok(undefined);
  }
}

// Consumer - validate khi nhận
class VideoJobConsumer {
  async handle(rawMessage: unknown): Promise<void> {
    const validation = VideoProcessingJobSchema.safeParse(rawMessage);
    if (!validation.success) {
      this.logger.error("Invalid job payload received", {
        error: validation.error.flatten(),
      });
      // Dead-letter queue cho invalid messages
      await this.dlq.send(rawMessage);
      return;
    }
    await this.videoProcessor.process(validation.data);
  }
}
```

---

## 7. Python Conventions

### 7.1 Typing Bắt Buộc

Mọi Python code phải có type annotations đầy đủ. Sử dụng `mypy --strict` để verify.

```python
# ❌ SAI - Thiếu type annotations
def process_video(input_path, output_path, options):
    result = run_ffmpeg(input_path, output_path)
    return result

# ✅ ĐÚNG - Full type annotations
from pathlib import Path
from dataclasses import dataclass

@dataclass(frozen=True)
class ProcessingOptions:
    resolution: str
    bitrate: int
    codec: str

@dataclass(frozen=True)
class ProcessingResult:
    output_path: Path
    duration_ms: int
    file_size_bytes: int

def process_video(
    input_path: Path,
    output_path: Path,
    options: ProcessingOptions,
) -> ProcessingResult:
    """Process video với các options cho trước."""
    result = run_ffmpeg(input_path, output_path, options)
    return result
```

### 7.2 Ruff Cho Linting

Sử dụng `ruff` làm linter và formatter duy nhất cho Python. Config trong `pyproject.toml`:

```toml
[tool.ruff]
target-version = "py312"
line-length = 100

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "W",    # pycodestyle warnings
    "F",    # pyflakes
    "I",    # isort
    "N",    # pep8-naming
    "UP",   # pyupgrade
    "ANN",  # flake8-annotations
    "B",    # flake8-bugbear
    "S",    # flake8-bandit (security)
    "RUF",  # ruff-specific rules
]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101"]  # Allow assert in tests

[tool.mypy]
strict = true
disallow_any_generics = true
disallow_untyped_defs = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
```

### 7.3 FFmpeg - Subprocess An Toàn

FFmpeg commands phải sử dụng subprocess với array arguments. KHÔNG BAO GIỜ sử dụng
`shell=True` hoặc interpolate user strings vào command.

```python
import subprocess
from pathlib import Path

# ❌ SAI - shell=True và string interpolation
def transcode_video_unsafe(input_path: str, output_path: str) -> None:
    cmd = f"ffmpeg -i {input_path} -c:v libx264 {output_path}"
    subprocess.run(cmd, shell=True)  # NGUY HIỂM: Command injection!

# ✅ ĐÚNG - Array args, no shell, validated paths
def transcode_video(
    input_path: Path,
    output_path: Path,
    resolution: str,
) -> subprocess.CompletedProcess[bytes]:
    """Transcode video sử dụng FFmpeg một cách an toàn."""
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # Validate resolution format
    if not _is_valid_resolution(resolution):
        raise ValueError(f"Invalid resolution format: {resolution}")

    args: list[str] = [
        "ffmpeg",
        "-i", str(input_path),
        "-vf", f"scale={resolution}",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "-y",
        str(output_path),
    ]

    return subprocess.run(
        args,
        capture_output=True,
        timeout=3600,  # 1 hour max
        check=True,
    )

def _is_valid_resolution(resolution: str) -> bool:
    """Validate resolution string (e.g., '1920:1080')."""
    import re
    return bool(re.match(r"^\d+:\d+$", resolution))
```

---

## 8. Testing Strategy

### 8.1 Unit Tests Cho Domain Logic

Domain logic (pure functions, entities, value objects) phải có unit tests coverage cao nhất.
Không cần mock — domain code không có dependencies.

```typescript
// domain/__tests__/pricing.test.ts
describe("PricingCalculator", () => {
  it("tính đúng giá cho video dưới 5 phút", () => {
    const result = calculatePrice({
      durationSeconds: 240,
      resolution: "1080p",
      plan: "starter",
    });
    expect(result).toEqual(ok({ credits: 5, breakdown: { base: 3, resolution: 2 } }));
  });

  it("trả về error khi duration vượt quá giới hạn plan", () => {
    const result = calculatePrice({
      durationSeconds: 7200,
      resolution: "4k",
      plan: "starter",
    });
    expect(result).toEqual(err(new ExceedsPlanLimitError("starter", 3600, 7200)));
  });
});
```

### 8.2 Integration Tests Cho Services

Service layer tests verify sự tương tác giữa các components. Sử dụng test containers
cho database và queue.

```typescript
// application/__tests__/video-service.integration.test.ts
describe("VideoService", () => {
  let db: TestDatabase;
  let service: VideoService;

  beforeAll(async () => {
    db = await TestDatabase.start(); // Testcontainers PostgreSQL
    service = new VideoService(db, new FakeStorageAdapter());
  });

  afterAll(() => db.stop());

  it("creates video record and enqueues processing job", async () => {
    const result = await service.createVideo({
      projectId: "test-project",
      file: testVideoBuffer,
    });
    expect(result.success).toBe(true);
    const video = await db.videos.findById(result.data.id);
    expect(video.status).toBe("pending");
  });
});
```

### 8.3 E2E Tests Cho Critical Paths

End-to-end tests chỉ cho các flow quan trọng nhất: user registration, payment, video export.

```typescript
// e2e/critical-paths/video-export.e2e.test.ts
describe("Video Export Critical Path", () => {
  it("user có thể tạo project, upload video, và export thành công", async () => {
    const user = await createTestUser();
    const project = await api.createProject(user.token, { name: "Test" });
    const video = await api.uploadVideo(user.token, project.id, testFile);
    const exportResult = await api.exportVideo(user.token, video.id, { format: "mp4" });

    // Wait cho processing hoàn tất
    await waitForCondition(
      () => api.getExportStatus(user.token, exportResult.id),
      (status) => status.state === "completed",
      { timeout: 60_000 },
    );

    const finalStatus = await api.getExportStatus(user.token, exportResult.id);
    expect(finalStatus.downloadUrl).toBeDefined();
  });
});
```

---

## 9. Logging

### 9.1 Structured Logging

Tất cả logs phải ở dạng structured (JSON). Không sử dụng `console.log` trong production code.

```typescript
// ✅ ĐÚNG - Structured logging
import { logger } from "@aidilam/shared/logger";

logger.info("Video processing started", {
  videoId: video.id,
  projectId: video.projectId,
  resolution: options.resolution,
  correlationId: context.correlationId,
});

logger.error("Payment processing failed", {
  orderId: order.id,
  errorCode: paymentError.code,
  correlationId: context.correlationId,
  // ❌ KHÔNG LOG: credit card number, API keys, tokens
});
```

### 9.2 Không Log Secrets

KHÔNG BAO GIỜ log các thông tin nhạy cảm:
- API keys, tokens, passwords
- Credit card numbers, bank accounts
- Personal identification numbers
- Full email addresses (chỉ log domain)
- IP addresses (hash nếu cần)

```typescript
// ❌ SAI
logger.info("User authenticated", { token: user.accessToken, email: user.email });

// ✅ ĐÚNG
logger.info("User authenticated", {
  userId: user.id,
  emailDomain: user.email.split("@")[1],
  correlationId: ctx.correlationId,
});
```

### 9.3 Correlation IDs

Mọi request/job phải có correlation ID để trace across services.

```typescript
// Middleware tạo correlation ID
function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = req.headers["x-correlation-id"] as string ?? randomUUID();
  req.context = { correlationId };
  res.setHeader("x-correlation-id", correlationId);
  next();
}

// Propagate qua queue messages
async function publishJob(job: VideoProcessingJob, ctx: RequestContext): Promise<void> {
  await queue.publish({
    ...job,
    metadata: {
      ...job.metadata,
      correlationId: ctx.correlationId,
    },
  });
}
```

---

## 10. Configuration

### 10.1 Environment Variables

Tất cả configuration phải đến từ environment variables. Không hardcode bất kỳ giá trị nào.

```typescript
// ✅ ĐÚNG - Config từ environment với validation
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AWS_REGION: z.string(),
  S3_BUCKET: z.string(),
  QUEUE_URL: z.string().url(),
});

export const config = EnvSchema.parse(process.env);
```

```python
# Python - config validation
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    aws_region: str
    s3_bucket: str
    ffmpeg_path: str = "/usr/bin/ffmpeg"
    max_video_duration_seconds: int = 3600

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
```

### 10.2 Không Hardcoded Values

```typescript
// ❌ SAI
const BUCKET = "aidilam-videos-prod";
const API_URL = "https://api.aidilam.com";
const MAX_FILE_SIZE = 5368709120; // 5GB

// ✅ ĐÚNG
const BUCKET = config.S3_BUCKET;
const API_URL = config.PUBLIC_API_URL;
const MAX_FILE_SIZE = config.MAX_UPLOAD_SIZE_BYTES;
```

---

## 11. Secrets Management

### 11.1 References Only - Never In Code

Secrets chỉ được reference bằng tên, không bao giờ xuất hiện trong source code, config files,
hoặc logs.

```typescript
// ❌ SAI - Secret trong code
const STRIPE_KEY = "sk_live_abc123xyz";

// ❌ SAI - Secret trong config file (kể cả .env committed to git)
// .env.production (KHÔNG COMMIT FILE NÀY)
// STRIPE_SECRET_KEY=sk_live_abc123xyz

// ✅ ĐÚNG - Reference từ secrets manager
import { getSecret } from "@aidilam/infrastructure/secrets";

const stripeKey = await getSecret("stripe/api-key"); // Từ AWS Secrets Manager
```

**Quy tắc:**
- `.env` files KHÔNG ĐƯỢC commit vào git (phải có trong `.gitignore`)
- Production secrets nằm trong AWS Secrets Manager hoặc Parameter Store
- CI/CD secrets sử dụng platform-specific secret storage
- Rotate secrets định kỳ mà không cần thay đổi code

---

## 12. Naming Conventions

### 12.1 TypeScript - camelCase

```typescript
// Variables và functions: camelCase
const videoProcessingQueue = new Queue("video-processing");
function calculateTotalCredits(usage: UsageRecord[]): number { /* ... */ }

// Types, interfaces, classes: PascalCase
interface VideoMetadata { /* ... */ }
type ProcessingStatus = "pending" | "processing" | "completed" | "failed";
class VideoProcessingService { /* ... */ }

// Constants: UPPER_SNAKE_CASE cho true constants
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

// Enums: PascalCase cho tên, PascalCase cho values
enum VideoCodec {
  H264 = "H264",
  H265 = "H265",
  VP9 = "VP9",
}
```

### 12.2 Python - snake_case

```python
# Variables và functions: snake_case
video_processing_queue = Queue("video-processing")
def calculate_total_credits(usage: list[UsageRecord]) -> int: ...

# Classes: PascalCase
class VideoProcessingService:
    def process_video(self, video_id: str) -> ProcessingResult: ...

# Constants: UPPER_SNAKE_CASE
MAX_RETRY_ATTEMPTS: int = 3
DEFAULT_TIMEOUT_MS: int = 30_000

# Private methods/attributes: leading underscore
class FFmpegProcessor:
    def _build_command_args(self, options: TranscodeOptions) -> list[str]: ...
```

### 12.3 Database Naming

```sql
-- Tables: snake_case, plural
CREATE TABLE project_versions (...);
CREATE TABLE video_exports (...);

-- Columns: snake_case
CREATE TABLE videos (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    file_size_bytes BIGINT NOT NULL
);

-- Indexes: idx_{table}_{columns}
CREATE INDEX idx_videos_project_id ON videos(project_id);
CREATE INDEX idx_project_versions_project_id_version ON project_versions(project_id, version);
```

---

## 13. File Organization

### 13.1 Feature-Based, Không Layer-Based Cho Apps

Tổ chức code theo feature (vertical slice), không theo layer (horizontal slice).

```
# ❌ SAI - Layer-based
src/
├── controllers/
│   ├── video.controller.ts
│   ├── project.controller.ts
│   └── user.controller.ts
├── services/
│   ├── video.service.ts
│   ├── project.service.ts
│   └── user.service.ts
├── repositories/
│   ├── video.repository.ts
│   ├── project.repository.ts
│   └── user.repository.ts
└── models/
    ├── video.model.ts
    ├── project.model.ts
    └── user.model.ts

# ✅ ĐÚNG - Feature-based
src/
├── video/
│   ├── video.controller.ts
│   ├── video.service.ts
│   ├── video.repository.ts
│   ├── video.schema.ts
│   ├── video.errors.ts
│   └── __tests__/
│       ├── video.service.test.ts
│       └── video.controller.test.ts
├── project/
│   ├── project.controller.ts
│   ├── project.service.ts
│   ├── project.repository.ts
│   ├── project.schema.ts
│   ├── project.errors.ts
│   └── __tests__/
│       └── ...
└── shared/
    ├── middleware/
    ├── database/
    └── config/
```

### 13.2 Package-Level Organization

Ở mức package/library, sử dụng layer-based structure vì mỗi package đã là một layer:

```
packages/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── ports/
│   ├── errors/
│   └── services/          # Domain services (pure logic)
├── application/
│   ├── use-cases/
│   ├── commands/
│   └── queries/
├── infrastructure/
│   ├── adapters/
│   ├── database/
│   ├── queue/
│   └── external/
└── api/
    ├── routes/
    ├── middleware/
    └── dto/
```

---

## 14. Tổng Kết

Các coding conventions này không phải là gợi ý — chúng là yêu cầu bắt buộc. Mọi Pull Request
phải tuân thủ tất cả các quy tắc trên. CI/CD pipeline sẽ tự động reject code vi phạm thông qua:

- **ESLint** + **typescript-eslint**: TypeScript conventions, import boundaries
- **Ruff** + **mypy**: Python conventions, type checking
- **Zod schema tests**: Đảm bảo schemas được maintain
- **Architecture tests**: Verify dependency boundaries
- **PR template checklist**: Manual verification cho các quy tắc không thể automate

Khi có conflict giữa convention và pragmatism, discuss trong team trước khi tạo exception.
Mọi exception phải được document với lý do rõ ràng trong code comment và PR description.
