# Chapter 12: Routing Architecture

## Mục lục

1. [Tổng quan Operation-based Model Routing](#1-tổng-quan-operation-based-model-routing)
2. [Governed Operations](#2-governed-operations)
3. [RoutingProfile Entity](#3-routingprofile-entity)
4. [RoutingProfileEntry](#4-routingprofileentry)
5. [Resolution Chain](#5-resolution-chain)
6. [Browser Rules](#6-browser-rules)
7. [Server-side Resolution](#7-server-side-resolution)
8. [Required Behaviors](#8-required-behaviors)
9. [Audit và RoutingAnalytics](#9-audit-và-routinganalytics)
10. [Final Controls](#10-final-controls)
11. [Seed Defaults](#11-seed-defaults)
12. [Tổng kết](#12-tổng-kết)

---

## 1. Tổng quan Operation-based Model Routing

Hệ thống AIDiLam sử dụng kiến trúc **Operation-based Model Routing** để quản lý việc điều hướng
các yêu cầu AI đến đúng model provider phù hợp. Thiết kế này đảm bảo rằng:

- Mọi quyết định routing đều dựa trên **cấu hình trong database**, không phải hardcode trong source code.
- Admin có thể thay đổi model bất kỳ lúc nào mà **không cần thay đổi code** hoặc restart ứng dụng.
- Mỗi operation có routing profile riêng với fallback chain rõ ràng.
- Toàn bộ quá trình routing được ghi nhận đầy đủ trong **RoutingAnalytics** để audit.

Triết lý cốt lõi: **Không có bất kỳ model name hay provider name nào được hardcode trong runtime code
hoặc UI code.** Mọi thứ đều đi qua routing layer với cấu hình từ database.

---

## 2. Governed Operations

Hệ thống quản lý routing cho **8 operations** chính. Mỗi operation đại diện cho một loại tác vụ AI
cụ thể trong hệ thống:

### 2.1 Danh sách Operations

| Operation | Mô tả | Use Case |
|-----------|--------|----------|
| `PROMPT_TEST_EXECUTION` | Thực thi test prompt trong môi trường sandbox | Admin test prompt mới |
| `TRANSLATION_EXECUTION` | Dịch nội dung giữa các ngôn ngữ | Dịch content đa ngôn ngữ |
| `CONTENT_SUMMARY_EXECUTION` | Tóm tắt nội dung dài | Tạo summary cho bài viết |
| `SEO_GENERATION_EXECUTION` | Sinh nội dung SEO | Tạo meta tags, descriptions |
| `CAPTION_GENERATION_EXECUTION` | Sinh caption cho media | Tạo caption social media |
| `HASHTAG_GENERATION_EXECUTION` | Sinh hashtag phù hợp | Đề xuất hashtag cho posts |
| `THUMBNAIL_PROMPT_EXECUTION` | Sinh prompt cho thumbnail | Tạo prompt cho image generation |
| `REVIEW_EXECUTION` | Review và đánh giá nội dung | AI review content quality |

### 2.2 Nguyên tắc Operation

- Mỗi operation **phải có ít nhất một** RoutingProfile active.
- Mỗi operation **phải có đúng một** RoutingProfile được đánh dấu `is_default_for_operation = true`.
- Operation name là **enum cố định** trong code — đây là điểm duy nhất operation được define.
- Không được tạo operation mới mà không có migration và code change tương ứng.

### 2.3 Tách biệt Operation và Model

Điểm quan trọng nhất: **Operation không bind trực tiếp với model.** Operation chỉ trỏ đến
RoutingProfile, và RoutingProfile mới chứa thông tin về model nào sẽ được sử dụng. Điều này
cho phép thay đổi model cho bất kỳ operation nào mà không ảnh hưởng đến logic nghiệp vụ.

---

## 3. RoutingProfile Entity

### 3.1 Schema Definition

```
RoutingProfile {
  id: UUID                        -- Primary key, immutable
  operation: OperationEnum        -- Linked operation (e.g., PROMPT_TEST_EXECUTION)
  name: String                    -- Human-readable name (e.g., "GPT-4o Primary Profile")
  is_default_for_operation: Bool  -- Đánh dấu profile mặc định cho operation
  is_active: Bool                 -- Profile có đang active hay không
  version: Integer                -- Version number, tăng khi có thay đổi
  entries: List<RoutingProfileEntry>  -- Danh sách model entries theo priority
}
```

### 3.2 Quy tắc RoutingProfile

- **Uniqueness constraint:** Chỉ có **một** profile với `is_default_for_operation = true` cho mỗi operation.
- **Active constraint:** Profile phải có `is_active = true` mới được sử dụng trong routing.
- **Version immutability:** Mỗi khi profile được chỉnh sửa, `version` tăng lên. Các RoutingAnalytics
  records trước đó giữ nguyên `routing_profile_version` cũ — **không bao giờ bị thay đổi retroactively.**
- **Soft delete:** Profile không bao giờ bị xóa cứng, chỉ set `is_active = false`.

### 3.3 Lifecycle của RoutingProfile

```
Created (is_active=false)
    │
    ▼
Activated (is_active=true)
    │
    ├── Set as default (is_default_for_operation=true)
    │
    ├── Modified → version incremented
    │
    ▼
Deactivated (is_active=false)
```

### 3.4 Ví dụ thực tế

```json
{
  "id": "rp-001-uuid",
  "operation": "PROMPT_TEST_EXECUTION",
  "name": "Prompt Test - GPT4o Primary with Claude Fallback",
  "is_default_for_operation": true,
  "is_active": true,
  "version": 3,
  "entries": [
    { "model_config_id": "mc-gpt4o-001", "priority_order": 1, "weight": 100 },
    { "model_config_id": "mc-claude-001", "priority_order": 2, "weight": 100 }
  ]
}
```

---

## 4. RoutingProfileEntry

### 4.1 Schema Definition

```
RoutingProfileEntry {
  model_config_id: UUID       -- Reference đến ModelConfig entity
  priority_order: Integer     -- Thứ tự ưu tiên (1 = cao nhất)
  weight: Integer             -- Weight cho load balancing (cùng priority)
  eligibility_rules: JSON     -- Điều kiện để entry eligible (optional)
  timeout_ms: Integer         -- Timeout cho request đến model (milliseconds)
  max_retries: Integer        -- Số lần retry tối đa trước khi fallback
}
```

### 4.2 Chi tiết từng field

#### `model_config_id`
- Trỏ đến bản ghi `ModelConfig` trong database.
- `ModelConfig` chứa provider name, model name, API key reference, endpoint, parameters.
- **Không bao giờ** chứa trực tiếp model name hay provider name trong RoutingProfileEntry.

#### `priority_order`
- Số nguyên bắt đầu từ 1.
- Entry với `priority_order = 1` là primary model.
- Khi primary fail, hệ thống chuyển sang entry có `priority_order = 2`, và tiếp tục.
- Đây chính là **fallback chain** — hoàn toàn configurable, không hardcode.

#### `weight`
- Dùng cho weighted load balancing giữa các entries **cùng priority_order**.
- Ví dụ: Hai entries cùng `priority_order = 1` với weight 70/30 sẽ phân phối traffic 70%/30%.
- Nếu chỉ có một entry cho mỗi priority level, weight không ảnh hưởng.

#### `eligibility_rules`
- JSON object chứa các điều kiện để entry được coi là eligible.
- Ví dụ: `{"max_tokens": 4096, "supported_languages": ["vi", "en"]}`.
- Nếu null hoặc empty, entry luôn eligible.
- Server đánh giá rules trước khi attempt gọi model.

#### `timeout_ms`
- Thời gian tối đa chờ response từ model provider.
- Vượt timeout → coi như fail → retry hoặc fallback.
- Giá trị typical: 30000ms (30 giây) cho generation tasks.

#### `max_retries`
- Số lần retry **trong cùng một entry** trước khi chuyển sang entry tiếp theo.
- Retry áp dụng cho transient errors (network timeout, 5xx).
- Non-retryable errors (4xx, invalid request) → fallback ngay, không retry.

### 4.3 Fallback Chain Example

```
Priority 1: GPT-4o (timeout: 30s, max_retries: 2)
    │ fail after 2 retries
    ▼
Priority 2: Claude 3.5 Sonnet (timeout: 30s, max_retries: 2)
    │ fail after 2 retries
    ▼
Priority 3: Gemini Pro (timeout: 45s, max_retries: 1)
    │ fail after 1 retry
    ▼
FAIL CLOSED — Error returned to caller
```

---

## 5. Resolution Chain

### 5.1 Resolution Chain cho PROMPT_TEST_EXECUTION

Đây là full resolution chain khi Admin thực hiện test một prompt:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RESOLUTION CHAIN                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Prompt Test UI                                                          │
│       │                                                                  │
│       │ (1) User triggers test execution                                 │
│       ▼                                                                  │
│  PROMPT_TEST_EXECUTION (operation identifier)                            │
│       │                                                                  │
│       │ (2) Resolve active RoutingProfile for this operation             │
│       ▼                                                                  │
│  Active RoutingProfile                                                   │
│       │                                                                  │
│       │ (3) Get primary ModelConfig (priority_order = 1)                 │
│       ▼                                                                  │
│  Primary ModelConfig                                                     │
│       │                                                                  │
│       │ (4) If primary fails, iterate fallback chain                     │
│       ▼                                                                  │
│  Fallback Chain (priority 2, 3, ...)                                     │
│       │                                                                  │
│       │ (5) Selected ModelConfig passed to router                        │
│       ▼                                                                  │
│  Model Router                                                            │
│       │                                                                  │
│       │ (6) Router dispatches to correct provider adapter                │
│       ▼                                                                  │
│  Provider Adapter (OpenAI/Anthropic/Google/etc.)                         │
│       │                                                                  │
│       │ (7) Execute request, return response                             │
│       ▼                                                                  │
│  Response → RoutingAnalytics recorded → Result to UI                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Các bước chi tiết

| Step | Component | Action | Failure Behavior |
|------|-----------|--------|------------------|
| 1 | Prompt Test UI | Submit test request với operation type | N/A |
| 2 | Server | Query DB cho active RoutingProfile | Fail closed nếu không tìm thấy |
| 3 | Server | Load primary entry từ profile | Fail closed nếu không có entries |
| 4 | Model Router | Attempt primary, retry nếu transient error | Chuyển sang next priority |
| 5 | Model Router | Iterate qua fallback entries | Fail closed khi hết chain |
| 6 | Provider Adapter | Dispatch request đến provider API | Return error cho retry logic |
| 7 | Provider Adapter | Parse response, validate format | Return structured error |

### 5.3 Resolution không bao giờ bypass

Quan trọng: **Mọi request đều đi qua full resolution chain.** Không có shortcut, không có
"direct model call" nào bypass routing layer. Điều này đảm bảo:

- Mọi request đều được audit.
- Mọi request đều tuân theo fallback policy.
- Không có hidden coupling giữa feature code và specific model.

---

## 6. Browser Rules

### 6.1 Nguyên tắc cơ bản

Browser (frontend/UI) tuân theo các quy tắc nghiêm ngặt về routing:

#### Rule 1: Sử dụng Default Profile
- Browser **có thể** sử dụng default RoutingProfile cho mỗi operation.
- Default profile được xác định bởi `is_default_for_operation = true`.
- Khi user thông thường trigger operation, luôn dùng default profile.

#### Rule 2: Admin có thể chọn profile khác
- Admin **có quyền** chọn một RoutingProfile khác (non-default) cho testing purposes.
- UI hiển thị dropdown các active profiles cho Admin.
- Selection được gửi dưới dạng `routing_profile_id` — **KHÔNG BAO GIỜ** là model name hay provider name.

#### Rule 3: KHÔNG BAO GIỜ submit raw model/provider names
- UI **TUYỆT ĐỐI KHÔNG** gửi trực tiếp model name (e.g., "gpt-4o") hoặc provider name (e.g., "openai").
- UI chỉ gửi: `operation` type và optionally `routing_profile_id`.
- Server chịu trách nhiệm resolve từ profile đến actual model.

### 6.2 Ví dụ Request từ Browser

```json
// ✅ CORRECT - Browser gửi operation và profile ID
{
  "operation": "PROMPT_TEST_EXECUTION",
  "routing_profile_id": "rp-001-uuid",  // Optional, Admin only
  "prompt_version_id": "pv-123",
  "input_data": { "text": "Hello world" }
}

// ❌ WRONG - NEVER DO THIS
{
  "model": "gpt-4o",
  "provider": "openai",
  "prompt": "Hello world"
}
```

### 6.3 Tại sao rules này quan trọng

- **Decoupling:** UI không biết và không cần biết model nào đang serve.
- **Security:** User không thể force hệ thống dùng model cụ thể bằng cách manipulate request.
- **Flexibility:** Admin thay đổi model backend mà không cần deploy lại frontend.
- **Audit:** Server luôn là single source of truth cho routing decisions.

---

## 7. Server-side Resolution

### 7.1 Quy trình Server Resolution

Khi server nhận request từ browser, nó thực hiện resolution hoàn toàn độc lập:

```
Server receives request
    │
    ├── (1) Extract operation from request
    │
    ├── (2) Re-resolve RoutingProfile from DB
    │        ├── If routing_profile_id provided → load that profile
    │        └── If not → load default profile for operation
    │
    ├── (3) Validate profile is active (is_active = true)
    │        └── If inactive → FAIL CLOSED (do NOT fallback to another profile)
    │
    ├── (4) Iterate entries by priority_order
    │        ├── Check eligibility_rules
    │        ├── Check model health status
    │        └── If eligible and healthy → attempt execution
    │
    ├── (5) Execute request via provider adapter
    │        ├── Success → record analytics, return result
    │        └── Failure → retry up to max_retries
    │
    ├── (6) If all retries exhausted → move to next priority entry
    │        └── Repeat steps 4-5 for next entry
    │
    └── (7) If ALL entries exhausted → FAIL CLOSED
             └── Return error to caller, record failure in analytics
```

### 7.2 Re-resolution từ DB

Server **LUÔN LUÔN** re-resolve profile từ database tại thời điểm request. Điều này có nghĩa:

- Không cache profile trong memory lâu dài (hoặc cache có TTL ngắn).
- Admin thay đổi profile → có hiệu lực ngay cho request tiếp theo.
- Không cần restart server để apply routing changes.

### 7.3 Validate Active Status

```
if profile.is_active == false:
    return Error("RoutingProfile is inactive. Cannot process request.")
    // DO NOT try to find another profile
    // DO NOT fallback to hardcoded model
    // FAIL CLOSED
```

### 7.4 Health Check Integration

Trước khi attempt mỗi entry, server kiểm tra:
- Model provider health status (từ health check service).
- Rate limit status (còn quota hay không).
- Circuit breaker state (open/closed/half-open).

Nếu model unhealthy → skip entry, chuyển sang next priority. **Không retry model đã unhealthy.**

### 7.5 Fail Closed Principle

**Fail closed** là nguyên tắc bắt buộc:

- Không tìm thấy active profile → **ERROR**, không fallback.
- Profile không có entries → **ERROR**, không fallback.
- Tất cả entries trong chain fail → **ERROR**, không fallback sang profile khác.
- Missing ModelConfig → **ERROR**, không guess model name.
- **KHÔNG BAO GIỜ** có silent hardcoded fallback trong code.

---

## 8. Required Behaviors

Hệ thống routing **BẮT BUỘC** phải đảm bảo tất cả các behaviors sau đây. Đây là invariants
không thể vi phạm:

### 8.1 Admin thay đổi model mà không cần code changes

- Admin vào Admin UI → chỉnh sửa RoutingProfile entries → save.
- Thay đổi có hiệu lực ngay lập tức cho requests tiếp theo.
- **Không cần** PR, code review, deploy, hay bất kỳ code change nào.
- Đây là ưu điểm chính của operation-based routing: tách biệt hoàn toàn giữa routing config và application code.

### 8.2 Model changes không yêu cầu prompt version change

- Khi Admin đổi model (ví dụ từ GPT-4o sang Claude), **prompt version không thay đổi.**
- Prompt version chỉ thay đổi khi nội dung prompt thực sự được chỉnh sửa.
- Model routing và prompt management là hai hệ thống **hoàn toàn độc lập.**
- Không có field nào trong PromptVersion trỏ trực tiếp đến specific model.

### 8.3 Model changes không thay đổi prompt checksum

- `prompt_checksum` được tính từ nội dung prompt (template text, variables, parameters).
- Thay đổi model → checksum **giữ nguyên** vì prompt content không thay đổi.
- Điều này đảm bảo regression detection chính xác: checksum thay đổi = prompt content thay đổi.

### 8.4 Previous RoutingAnalytics records là immutable

- Khi RoutingProfile được chỉnh sửa (version tăng), các analytics records cũ **KHÔNG BỊ THAY ĐỔI.**
- Record cũ giữ nguyên `routing_profile_version` tại thời điểm execution.
- Cho phép audit trail chính xác: "Tại thời điểm X, profile version Y đã route đến model Z."
- **Không bao giờ** update retroactively analytics records khi profile thay đổi.

### 8.5 Fallback theo configured order

- Fallback chain được xác định bởi `priority_order` trong RoutingProfileEntry.
- Server **phải** iterate theo đúng thứ tự priority: 1 → 2 → 3 → ...
- Không được random, không được skip, không được reorder at runtime.
- Admin control hoàn toàn fallback order thông qua cấu hình.

### 8.6 Missing config fails closed

- Nếu bất kỳ config nào missing (profile, entry, ModelConfig), hệ thống **PHẢI** fail với error rõ ràng.
- Không được "guess" hay "infer" model từ context.
- Không được default sang bất kỳ model nào không được configure explicitly.
- Error message phải chỉ rõ: config nào missing, cho operation nào.

### 8.7 Không silent hardcoded fallback

- Trong **toàn bộ codebase**, không tồn tại bất kỳ dòng code nào dạng:
  ```
  // ❌ FORBIDDEN
  const fallbackModel = "gpt-4o";
  if (!profile) { use("gpt-3.5-turbo"); }
  const DEFAULT_PROVIDER = "openai";
  ```
- Mọi model/provider reference phải đến từ database thông qua routing resolution.
- CI/CD pipeline phải scan và reject code có hardcoded model/provider names.

### 8.8 Không cần app restart

- Thay đổi routing config → có hiệu lực ngay (hoặc trong vòng seconds với cache TTL).
- Server không cache routing config vĩnh viễn.
- Không cần restart, redeploy, hay bất kỳ manual intervention nào ngoài Admin UI action.
- Hot-reload routing: request N dùng config cũ, request N+1 dùng config mới.

---

## 9. Audit và RoutingAnalytics

### 9.1 Mục đích

RoutingAnalytics ghi lại **mọi routing decision và execution result** để phục vụ:
- Audit trail: ai đã làm gì, khi nào, với model nào.
- Performance monitoring: latency, token usage, success rate per model.
- Debugging: tại sao request fail, fallback đã xảy ra như thế nào.
- Compliance: chứng minh rằng routing hoạt động đúng theo config.

### 9.2 RoutingAnalytics Fields

```
RoutingAnalytics {
  // Routing context
  routing_operation: OperationEnum          -- Operation được execute (e.g., PROMPT_TEST_EXECUTION)
  routing_profile_id: UUID                  -- Profile ID được sử dụng
  routing_profile_version: Integer          -- Version của profile TẠI THỜI ĐIỂM execution

  // Model selection tracking
  requested_model_provider: String          -- Model/provider mà profile suggest ban đầu
  selected_model_provider: String           -- Model/provider được chọn sau eligibility check
  executed_model_provider: String           -- Model/provider THỰC SỰ execute request

  // Execution details
  fallback_chain: JSON                      -- Full chain đã được traverse
  attempts: Integer                         -- Tổng số attempts (bao gồm retries)
  latency_ms: Integer                       -- Tổng thời gian từ request đến response
  token_usage: JSON                         -- { prompt_tokens, completion_tokens, total_tokens }
  status: Enum                              -- SUCCESS, FAILED, PARTIAL, TIMEOUT

  // Error tracking
  sanitized_error: String                   -- Error message đã sanitize (không chứa secrets)

  // Context references
  actor_id: UUID                            -- User/Admin đã trigger request
  prompt_version_id: UUID                   -- PromptVersion được sử dụng (nếu applicable)
  prompt_checksum: String                   -- Checksum của prompt tại thời điểm execution

  // Timestamps
  created_at: Timestamp                     -- Thời điểm record được tạo
  started_at: Timestamp                     -- Thời điểm bắt đầu routing resolution
  completed_at: Timestamp                   -- Thời điểm hoàn thành (success hoặc final failure)
}
```

### 9.3 Immutability Rules

- RoutingAnalytics records **KHÔNG BAO GIỜ** được update sau khi tạo.
- Mỗi execution tạo **một record mới**, ngay cả khi retry cùng request.
- `routing_profile_version` snapshot version tại thời điểm execution — nếu profile thay đổi sau đó, record cũ giữ nguyên.
- Đây là **append-only** data store cho audit purposes.

### 9.4 Sanitization

- `sanitized_error` không bao giờ chứa API keys, tokens, hay credentials.
- Provider-specific error details được transform thành generic format.
- Ví dụ: `"Provider returned 429: Rate limit exceeded"` thay vì raw provider response.

### 9.5 Ví dụ Record

```json
{
  "routing_operation": "PROMPT_TEST_EXECUTION",
  "routing_profile_id": "rp-001-uuid",
  "routing_profile_version": 3,
  "requested_model_provider": "openai/gpt-4o",
  "selected_model_provider": "openai/gpt-4o",
  "executed_model_provider": "anthropic/claude-3.5-sonnet",
  "fallback_chain": [
    {"model_config_id": "mc-gpt4o-001", "priority": 1, "result": "TIMEOUT"},
    {"model_config_id": "mc-claude-001", "priority": 2, "result": "SUCCESS"}
  ],
  "attempts": 4,
  "latency_ms": 12340,
  "token_usage": {"prompt_tokens": 150, "completion_tokens": 890, "total_tokens": 1040},
  "status": "SUCCESS",
  "sanitized_error": null,
  "actor_id": "admin-user-uuid",
  "prompt_version_id": "pv-123-uuid",
  "prompt_checksum": "sha256:abc123def456...",
  "created_at": "2026-07-23T13:00:00Z",
  "started_at": "2026-07-23T13:00:00.100Z",
  "completed_at": "2026-07-23T13:00:12.440Z"
}
```

Trong ví dụ trên: primary model (GPT-4o) đã timeout, hệ thống fallback sang Claude thành công.
Analytics ghi nhận đầy đủ quá trình này.

---

## 10. Final Controls

### 10.1 Hardcode Counters

Hệ thống enforce **zero hardcode policy** thông qua automated counters:

| Counter | Required Value | Ý nghĩa |
|---------|---------------|----------|
| `runtimeModelHardcodeCount` | **0** | Không có model name nào hardcode trong runtime code |
| `runtimeProviderHardcodeCount` | **0** | Không có provider name nào hardcode trong runtime code |
| `uiModelHardcodeCount` | **0** | Không có model name nào hardcode trong UI/frontend code |
| `uiProviderHardcodeCount` | **0** | Không có provider name nào hardcode trong UI/frontend code |

### 10.2 Enforcement Mechanism

- **Static analysis:** CI pipeline scan source code cho patterns matching model/provider names.
- **Lint rules:** Custom ESLint/tslint rules reject hardcoded AI model strings.
- **PR checks:** Automated check block merge nếu bất kỳ counter > 0.
- **Audit script:** Periodic scan toàn bộ codebase, report violations.

### 10.3 Allowed Exceptions

Chỉ có **một nơi** được phép chứa model/provider names: **database seed files** (xem Section 11).
Và ngay cả seed files cũng chỉ là initial data — được thay thế bởi Admin UI config.

### 10.4 Ví dụ Violation Detection

```bash
# CI script example
grep -rn "gpt-4" src/ --include="*.ts" --include="*.tsx" | grep -v "*.test.*" | grep -v "seed"
# Expected output: EMPTY (no matches)
# If any match found → BUILD FAILS
```

---

## 11. Seed Defaults

### 11.1 Định nghĩa

Seed defaults là **cấu hình khởi tạo** được chèn vào database khi hệ thống lần đầu deploy.
Chúng cung cấp routing config ban đầu để hệ thống có thể hoạt động ngay.

### 11.2 Nguyên tắc Seed Defaults

| Nguyên tắc | Mô tả |
|-------------|--------|
| Editable DB config | Seed data tồn tại dưới dạng records trong database, có thể edit qua Admin UI |
| Clearly marked | Seed records được đánh dấu rõ ràng (e.g., `source: "seed"` field) |
| Replaceable via Admin UI | Admin có thể thay đổi hoặc thay thế hoàn toàn seed config |
| Never unconditional runtime fallback | Seed data KHÔNG BAO GIỜ được dùng như fallback trong code |

### 11.3 Seed vs Hardcode — Sự khác biệt quan trọng

```
// ❌ HARDCODED FALLBACK (FORBIDDEN)
function getModel(operation) {
  const profile = await db.getProfile(operation);
  if (!profile) {
    return "gpt-4o";  // ← HARDCODED, violates fail-closed
  }
}

// ✅ SEED DEFAULT (CORRECT)
// In database migration/seed file:
INSERT INTO routing_profiles (operation, name, is_default_for_operation, is_active)
VALUES ('PROMPT_TEST_EXECUTION', 'Default Prompt Test Profile', true, true);
// → This is DB data, editable, replaceable, NOT a code fallback
```

### 11.4 Seed Lifecycle

```
(1) First deploy → seed migration runs → default profiles created in DB
(2) System operational with seed config
(3) Admin reviews seed config in Admin UI
(4) Admin modifies/replaces as needed
(5) Seed data no longer relevant — system runs on Admin-configured data
```

### 11.5 Quan trọng: Seed ≠ Fallback

- Nếu Admin xóa/deactivate seed profile và không tạo replacement → **system fails closed.**
- Code **KHÔNG BAO GIỜ** check "if no config, use seed default."
- Seed chỉ là initial data, không phải safety net.
- Runtime code chỉ biết: "query DB → có config thì dùng, không có thì fail."

---

## 12. Tổng kết

### 12.1 Architecture Principles

| Principle | Implementation |
|-----------|---------------|
| Operation-based routing | 8 governed operations, mỗi operation có routing profile riêng |
| Config-driven | Mọi routing decision từ database, không hardcode |
| Fail closed | Missing config = error, không silent fallback |
| Immutable audit | RoutingAnalytics append-only, không retroactive changes |
| Zero hardcode | 4 counters phải = 0, enforced bởi CI/CD |
| Hot-reload | Config changes có hiệu lực ngay, không restart |
| Decoupled | Model changes không ảnh hưởng prompt versions hay checksums |

### 12.2 Checklist cho Development Team

- [ ] Mỗi operation mới phải có seed RoutingProfile.
- [ ] Không bao giờ import/reference model names trong feature code.
- [ ] Mọi AI request phải đi qua routing resolution chain.
- [ ] RoutingAnalytics phải được record cho mọi execution (success và failure).
- [ ] Admin UI phải cho phép CRUD operations trên RoutingProfiles.
- [ ] Health check integration cho mỗi model provider.
- [ ] CI pipeline phải scan và enforce zero-hardcode counters.
- [ ] Test cases phải cover: fallback chain, fail closed, profile deactivation.

### 12.3 Liên kết với các Chapters khác

- **Chapter 8 (Prompt Management):** PromptVersion độc lập với routing — checksum không đổi khi model đổi.
- **Chapter 10 (ModelConfig):** RoutingProfileEntry reference ModelConfig qua `model_config_id`.
- **Chapter 11 (Provider Adapters):** Model Router dispatch đến provider adapter phù hợp.
- **Chapter 13 (Analytics):** RoutingAnalytics là subset của analytics system tổng thể.

---

*Document version: 1.0*
*Last updated: 2026-07-23*
*Author: Architecture Team*
