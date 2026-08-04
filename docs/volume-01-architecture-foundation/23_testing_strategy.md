# 23. Chiến Lược Testing

## 23.1 Tổng Quan

Chiến lược testing của hệ thống được thiết kế theo nguyên tắc **defense in depth** — nhiều tầng kiểm thử bổ trợ lẫn nhau để đảm bảo chất lượng từ domain logic đến trải nghiệm người dùng cuối. Mỗi tầng có mục tiêu rõ ràng, công cụ phù hợp, và tiêu chí coverage cụ thể.

Nguyên tắc cốt lõi:

- **Fast feedback**: Unit tests chạy trong milliseconds, cho phản hồi ngay lập tức
- **Confidence**: Integration và e2e tests đảm bảo hệ thống hoạt động đúng khi ghép nối
- **Reproducibility**: Mọi test phải deterministic, không phụ thuộc external state không kiểm soát được
- **No hardcoded runtime defaults**: Test fixtures KHÔNG được chứa hardcoded model/provider dưới dạng runtime defaults — sử dụng clearly marked test constants thay thế

---

## 23.2 Các Tầng Testing

### 23.2.1 Unit Tests — Domain Logic

**Phạm vi**: Kiểm thử business rules, value objects, entities, domain services ở mức isolated.

**Công cụ**:
- **vitest** cho TypeScript domain logic
- **pytest** cho Python domain logic

**Đặc điểm**:
- Không có I/O, không database, không network calls
- Provider adapters được **mock hoàn toàn** trong unit tests
- Chạy cực nhanh (< 5 giây cho toàn bộ suite)
- Mỗi test case kiểm tra một behavior duy nhất

**Coverage target**: **80% domain layer**

```typescript
// ví dụ: vitest unit test cho domain logic
import { describe, it, expect } from 'vitest';
import { TokenBudgetCalculator } from '@domain/token-budget';
import { TEST_MODEL_CONFIG } from '@test/constants'; // clearly marked test constant

// KHÔNG dùng: DEFAULT_MODEL từ runtime config
// SỬ DỤNG: TEST_MODEL_CONFIG — constant dành riêng cho testing
describe('TokenBudgetCalculator', () => {
  it('should calculate remaining budget after usage', () => {
    const calculator = new TokenBudgetCalculator(TEST_MODEL_CONFIG);
    const remaining = calculator.calculateRemaining({
      totalBudget: 10000,
      used: 3500,
    });
    expect(remaining).toBe(6500);
  });

  it('should throw when usage exceeds budget', () => {
    const calculator = new TokenBudgetCalculator(TEST_MODEL_CONFIG);
    expect(() =>
      calculator.calculateRemaining({
        totalBudget: 10000,
        used: 15000,
      })
    ).toThrow('BudgetExceeded');
  });
});
```

```python
# ví dụ: pytest unit test cho Python domain logic
import pytest
from domain.routing import RoutingPolicy
from tests.constants import TEST_PROVIDER_ID  # clearly marked test constant

# KHÔNG dùng: settings.DEFAULT_PROVIDER
# SỬ DỤNG: TEST_PROVIDER_ID — constant dành riêng cho testing

class TestRoutingPolicy:
    def test_should_select_cheapest_provider_for_simple_task(self):
        policy = RoutingPolicy(provider_id=TEST_PROVIDER_ID)
        result = policy.select(task_complexity="simple", budget_remaining=100)
        assert result.cost_tier == "low"

    def test_should_reject_when_no_budget(self):
        policy = RoutingPolicy(provider_id=TEST_PROVIDER_ID)
        with pytest.raises(InsufficientBudgetError):
            policy.select(task_complexity="simple", budget_remaining=0)
```

---

### 23.2.2 Integration Tests — Services + Database

**Phạm vi**: Kiểm thử tương tác giữa application services, repositories, và database thực.

**Công cụ**:
- **vitest** với test database connection cho TypeScript services
- **pytest** với test database fixtures cho Python services

**Đặc điểm**:
- Sử dụng **real provider adapters** (không mock) để phát hiện lỗi integration
- Kết nối đến **separate PostgreSQL instance** dành riêng cho testing
- Database migrations được **apply mỗi lần chạy** để đảm bảo schema đồng bộ
- Mỗi test suite có thể seed và cleanup data riêng

**Coverage target**: **60% application layer**

**Test Database Configuration**:

```yaml
# test-database.config.yml
test_database:
  host: localhost
  port: 5433  # port riêng biệt, không trùng production
  name: aidilam_test
  user: test_user
  password: ${TEST_DB_PASSWORD}  # từ environment variable
  migrations:
    auto_apply: true
    strategy: "fresh_per_run"  # drop & recreate mỗi lần
```

```typescript
// ví dụ: integration test với real database
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabase } from '@test/infrastructure/test-database';
import { ConversationRepository } from '@infrastructure/repositories/conversation';
import { ConversationService } from '@application/conversation-service';
import { TEST_PROVIDER_ADAPTER } from '@test/constants';

describe('ConversationService Integration', () => {
  let db: TestDatabase;
  let service: ConversationService;

  beforeAll(async () => {
    db = await TestDatabase.create(); // fresh schema + migrations
    const repo = new ConversationRepository(db.connection);
    service = new ConversationService(repo, TEST_PROVIDER_ADAPTER);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it('should persist and retrieve conversation with messages', async () => {
    const conversation = await service.startConversation({
      userId: 'test-user-001',
      initialMessage: 'Hello',
    });

    const retrieved = await service.getConversation(conversation.id);
    expect(retrieved.messages).toHaveLength(1);
    expect(retrieved.messages[0].content).toBe('Hello');
  });

  it('should enforce message ordering on concurrent writes', async () => {
    const conversation = await service.startConversation({
      userId: 'test-user-002',
      initialMessage: 'First',
    });

    // Simulate concurrent message additions
    const results = await Promise.allSettled([
      service.addMessage(conversation.id, 'Second'),
      service.addMessage(conversation.id, 'Third'),
    ]);

    const updated = await service.getConversation(conversation.id);
    expect(updated.messages).toHaveLength(3);
    // Messages should have sequential ordering
    const orders = updated.messages.map((m) => m.order);
    expect(orders).toEqual([1, 2, 3]);
  });
});
```

---

### 23.2.3 End-to-End Tests — Critical User Flows

**Phạm vi**: Kiểm thử các luồng người dùng quan trọng nhất từ đầu đến cuối, bao gồm UI interaction, API calls, và database state.

**Công cụ**: **Playwright**

**Đặc điểm**:
- Chỉ cover **critical user flows** — không test mọi edge case ở tầng này
- Chạy trên browser thật (Chromium, Firefox, WebKit)
- Sử dụng test environment đầy đủ (API + DB + external services mocked ở boundary)
- Thời gian chạy được giới hạn để không block CI pipeline quá lâu

**Coverage target**: **100% critical paths**

Danh sách critical flows bắt buộc phải có e2e coverage:

1. User registration & authentication
2. Tạo conversation mới và nhận response
3. Payment flow (subscription, usage-based billing)
4. Provider failover khi primary provider unavailable
5. Data export & deletion (GDPR compliance)

```typescript
// ví dụ: Playwright e2e test
import { test, expect } from '@playwright/test';
import { TEST_USER_CREDENTIALS } from '@e2e/constants'; // clearly marked

test.describe('Critical Flow: New Conversation', () => {
  test('user can create conversation and receive AI response', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email"]', TEST_USER_CREDENTIALS.email);
    await page.fill('[data-testid="password"]', TEST_USER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');

    // Start new conversation
    await page.click('[data-testid="new-conversation"]');
    await page.fill('[data-testid="message-input"]', 'Explain testing strategies');
    await page.click('[data-testid="send-button"]');

    // Wait for AI response
    const response = page.locator('[data-testid="ai-response"]');
    await expect(response).toBeVisible({ timeout: 30000 });
    await expect(response).not.toBeEmpty();
  });

  test('conversation persists after page reload', async ({ page }) => {
    await page.goto('/conversations');
    const firstConversation = page.locator('[data-testid="conversation-item"]').first();
    await firstConversation.click();

    const messages = page.locator('[data-testid="message"]');
    await expect(messages).toHaveCount(2); // user message + AI response
  });
});
```

---

### 23.2.4 Contract Tests — Worker Job Schemas

**Phạm vi**: Kiểm thử tính tương thích của message schemas giữa producers (API services) và consumers (worker jobs).

**Công cụ**: vitest + custom schema validation

**Đặc điểm**:
- Đảm bảo worker jobs nhận đúng payload format từ queue
- Phát hiện breaking changes khi schema evolve
- Không cần chạy actual workers — chỉ validate schema compatibility
- Sử dụng **schema versioning** để quản lý backward compatibility

```typescript
// ví dụ: contract test cho worker job schema
import { describe, it, expect } from 'vitest';
import { validateJobPayload } from '@infrastructure/queue/schema-validator';
import {
  TEST_JOB_PAYLOAD_V1,
  TEST_JOB_PAYLOAD_V2,
} from '@test/constants'; // clearly marked test constants

describe('Worker Job Contract: ProcessConversation', () => {
  it('should accept valid v2 payload', () => {
    const result = validateJobPayload('process-conversation', TEST_JOB_PAYLOAD_V2);
    expect(result.valid).toBe(true);
  });

  it('should still accept v1 payload (backward compatible)', () => {
    const result = validateJobPayload('process-conversation', TEST_JOB_PAYLOAD_V1);
    expect(result.valid).toBe(true);
  });

  it('should reject payload missing required fields', () => {
    const invalidPayload = { conversationId: '123' }; // thiếu required fields
    const result = validateJobPayload('process-conversation', invalidPayload);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing field: userId');
  });

  it('should reject unknown job type', () => {
    expect(() =>
      validateJobPayload('unknown-job-type', {})
    ).toThrow('Unknown job type');
  });
});
```

---

## 23.3 Test Constants & Fixtures

### Quy tắc bắt buộc

**KHÔNG BAO GIỜ** hardcode model names, provider IDs, hoặc API endpoints trong test fixtures dưới dạng runtime defaults. Thay vào đó, sử dụng **clearly marked test constants**:

```typescript
// @test/constants.ts — TẤT CẢ test constants tập trung ở đây

/**
 * TEST CONSTANTS — Chỉ sử dụng trong test environment.
 * KHÔNG import vào production code.
 * KHÔNG sử dụng làm runtime defaults.
 */

// Provider constants cho testing
export const TEST_PROVIDER_ID = 'test-provider-001' as const;
export const TEST_PROVIDER_ENDPOINT = 'http://localhost:9999/mock-provider' as const;

// Model constants cho testing
export const TEST_MODEL_CONFIG = {
  modelId: 'test-model-v1',
  maxTokens: 4096,
  temperature: 0.7,
} as const;

// User constants cho testing
export const TEST_USER_CREDENTIALS = {
  email: 'test-user@example.com',
  password: 'Test@Password123!',
} as const;

// Job payload constants cho contract testing
export const TEST_JOB_PAYLOAD_V1 = {
  version: 1,
  conversationId: 'conv-test-001',
  userId: 'user-test-001',
  action: 'process',
} as const;

export const TEST_JOB_PAYLOAD_V2 = {
  ...TEST_JOB_PAYLOAD_V1,
  version: 2,
  priority: 'normal',
  metadata: { source: 'api' },
} as const;
```

```python
# tests/constants.py — Python test constants

"""
TEST CONSTANTS — Chỉ sử dụng trong test environment.
KHÔNG import vào production code.
KHÔNG sử dụng làm runtime defaults.
"""

TEST_PROVIDER_ID = "test-provider-001"
TEST_PROVIDER_ENDPOINT = "http://localhost:9999/mock-provider"
TEST_MODEL_ID = "test-model-v1"
TEST_MAX_TOKENS = 4096
```

---

## 23.4 Mocking Strategy

### Unit Tests: Mock Provider Adapters

Trong unit tests, tất cả external dependencies (provider adapters, HTTP clients, message queues) đều được **mock hoàn toàn**:

```typescript
// Mock provider adapter cho unit tests
import { vi } from 'vitest';
import type { ProviderAdapter } from '@domain/ports/provider-adapter';

export const createMockProviderAdapter = (): ProviderAdapter => ({
  generateResponse: vi.fn().mockResolvedValue({
    content: 'Mocked response',
    tokensUsed: 100,
  }),
  validateConnection: vi.fn().mockResolvedValue(true),
  getAvailableModels: vi.fn().mockResolvedValue(['test-model-v1']),
});
```

### Integration Tests: Real Adapters

Trong integration tests, sử dụng **real provider adapters** kết nối đến test instances hoặc sandbox environments:

- Database: real PostgreSQL (test instance)
- Message queue: real Redis/RabbitMQ (test instance)
- Provider APIs: sandbox endpoints hoặc local mock servers với behavior thực tế
- File storage: local filesystem hoặc MinIO (S3-compatible)

---

## 23.5 Test Database Management

### Separate PostgreSQL Instance

Test database là một **PostgreSQL instance riêng biệt**, hoàn toàn tách biệt khỏi development và production databases:

| Thuộc tính | Giá trị |
|---|---|
| Port | 5433 (khác production 5432) |
| Database name | `aidilam_test` |
| Lifecycle | Recreated mỗi CI run |
| Data | Không persist giữa các runs |

### Migration Strategy

```bash
# Script chạy trước integration tests
#!/bin/bash
set -e

echo "=== Preparing test database ==="

# Drop existing test database
dropdb --if-exists -h localhost -p 5433 aidilam_test

# Create fresh database
createdb -h localhost -p 5433 aidilam_test

# Apply all migrations
npm run db:migrate -- --database-url="postgresql://test_user:$TEST_DB_PASSWORD@localhost:5433/aidilam_test"

echo "=== Test database ready ==="
```

### Isolation giữa Test Suites

Mỗi test suite có thể chọn strategy isolation:

- **Transaction rollback**: Wrap mỗi test trong transaction, rollback sau khi xong (nhanh nhất)
- **Truncate tables**: Clear data giữa các tests (chậm hơn nhưng test được commit behavior)
- **Fresh database**: Dành cho tests cần schema changes

---

## 23.6 CI/CD Integration

### Pull Request Pipeline

Mọi PR đều trigger full test suite:

```yaml
# .github/workflows/test.yml
name: Test Suite
on:
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx vitest run --coverage --reporter=verbose
      - name: Check coverage thresholds
        run: |
          npx vitest run --coverage.thresholds.lines=80 \
            --coverage.thresholds.functions=80 \
            --coverage.thresholds.branches=75

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: ${{ secrets.TEST_DB_PASSWORD }}
          POSTGRES_DB: aidilam_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run db:migrate:test
      - run: npx vitest run --config vitest.integration.config.ts

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npx playwright test

  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx vitest run --config vitest.contract.config.ts
```

### Quy tắc CI

- **Unit tests + contract tests**: Chạy trên mọi PR, không cần external services
- **Integration tests**: Cần test database (PostgreSQL service container trong CI)
- **E2e tests**: Chạy sau khi unit + integration pass
- **Blocking**: PR không thể merge nếu bất kỳ test nào fail

---

## 23.7 Security Testing

### SAST — Static Application Security Testing

Sử dụng **Semgrep** để phát hiện security vulnerabilities trong source code:

```yaml
# .semgrep.yml
rules:
  - id: no-hardcoded-secrets
    patterns:
      - pattern: |
          $KEY = "..."
    severity: ERROR
    message: "Không được hardcode secrets trong source code"

  - id: sql-injection-prevention
    patterns:
      - pattern: |
          query($SQL + $INPUT)
    severity: ERROR
    message: "Sử dụng parameterized queries thay vì string concatenation"
```

```bash
# Chạy SAST trong CI
semgrep scan --config=auto --config=.semgrep.yml --error
```

### Dependency Audit

Kiểm tra known vulnerabilities trong dependencies:

```bash
# Node.js dependencies
npm audit --audit-level=high

# Python dependencies
pip-audit --strict --desc

# Chạy định kỳ và trên mỗi PR có dependency changes
```

### Security Test Checklist

- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] Authentication bypass attempts
- [ ] Authorization boundary violations
- [ ] Sensitive data exposure trong logs
- [ ] CORS misconfiguration
- [ ] Rate limiting effectiveness

---

## 23.8 Performance Testing

### Load Testing trước Production

Sử dụng **k6** để chạy load tests trước mỗi lần deploy lên production:

```javascript
// load-tests/conversation-flow.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp up
    { duration: '5m', target: 50 },   // sustained load
    { duration: '2m', target: 100 },  // peak load
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // ms
    http_req_failed: ['rate<0.01'],                  // < 1% error rate
  },
};

export default function () {
  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, {
    email: 'loadtest-user@example.com',
    password: __ENV.LOADTEST_PASSWORD,
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  const token = loginRes.json('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Create conversation
  const convRes = http.post(
    `${__ENV.BASE_URL}/api/conversations`,
    JSON.stringify({ message: 'Hello from load test' }),
    { headers: { ...headers, 'Content-Type': 'application/json' } }
  );

  check(convRes, {
    'conversation created': (r) => r.status === 201,
    'response time OK': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

### Performance Acceptance Criteria

| Metric | Threshold | Điều kiện |
|---|---|---|
| API response time (p95) | < 500ms | Normal load |
| API response time (p99) | < 1000ms | Peak load |
| Error rate | < 1% | Mọi điều kiện |
| Throughput | > 100 req/s | Sustained load |
| Database query time (p95) | < 100ms | Normal load |

---

## 23.9 Tổng Kết Coverage Targets

| Layer | Target | Công cụ | Ghi chú |
|---|---|---|---|
| Domain logic | **80%** | vitest, pytest | Business rules, value objects |
| Application layer | **60%** | vitest, pytest | Services, use cases |
| Critical paths | **100%** | Playwright | E2e user flows |
| Contract schemas | **100%** | vitest | Worker job payloads |
| Infrastructure | Best effort | vitest, pytest | Adapters, repositories |

### Khi nào thêm tests?

- **Bắt buộc**: Mọi bug fix phải có regression test đi kèm
- **Bắt buộc**: Feature mới phải có unit tests cho domain logic
- **Bắt buộc**: API endpoint mới phải có integration test
- **Khuyến khích**: Refactoring lớn nên có thêm characterization tests trước khi refactor
- **Bắt buộc**: Schema changes phải update contract tests

---

## 23.10 Quy Trình Review Tests

1. **Test readability**: Test phải dễ đọc và hiểu mục đích ngay từ tên test
2. **Single assertion focus**: Mỗi test nên kiểm tra một behavior duy nhất
3. **No test interdependence**: Tests không được phụ thuộc thứ tự chạy
4. **Proper cleanup**: Resources phải được cleanup sau mỗi test
5. **No flaky tests**: Flaky tests phải được fix hoặc quarantine ngay lập tức
6. **Constants compliance**: Review phải check không có hardcoded model/provider names ngoài file test constants

---

*Tài liệu này là phần của Volume 01 — Architecture Foundation. Cập nhật lần cuối: 2026-07-23.*
