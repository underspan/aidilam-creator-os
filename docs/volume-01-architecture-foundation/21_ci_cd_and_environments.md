# Chương 21: CI/CD và Environments

## Tổng quan

Hệ thống CI/CD (Continuous Integration / Continuous Deployment) của dự án được thiết kế để đảm bảo
mọi thay đổi code đều trải qua quy trình kiểm tra nghiêm ngặt trước khi được triển khai. Nguyên tắc
cốt lõi là: **không có deployment nào lên production mà không qua approval gate**.

Tài liệu này mô tả chi tiết các environment, branch strategy, quy trình kiểm tra PR, deployment
pipeline, rollback procedure và cách thu thập evidence cho mỗi lần deploy.

---

## 1. Environments

Hệ thống vận hành trên 4 environment riêng biệt, mỗi environment phục vụ một mục đích cụ thể
trong vòng đời phát triển phần mềm.

### 1.1 Local Development

- **Mục đích**: Phát triển và debug trên máy cá nhân của developer
- **Cơ sở hạ tầng**: Docker Compose local, database container riêng
- **Dữ liệu**: Seed data hoặc anonymized subset từ staging
- **Truy cập**: Chỉ developer sở hữu máy
- **Đặc điểm**:
  - Hot reload cho tất cả services
  - Debug mode mặc định bật
  - Không giới hạn logging level
  - Có thể chạy individual service hoặc full stack
  - Sử dụng `.env.local` cho configuration

```bash
# Khởi động local environment
docker compose -f docker-compose.local.yml up -d

# Chạy với hot reload cho service cụ thể
docker compose -f docker-compose.local.yml up -d --build api-gateway
```

### 1.2 Server Development

- **Mục đích**: Tích hợp và test trên shared server, nơi nhiều developer có thể verify changes
- **Cơ sở hạ tầng**: Shared server với Docker Compose, database riêng cho dev
- **Dữ liệu**: Seed data tự động reset hàng ngày
- **Truy cập**: Toàn bộ development team
- **Đặc điểm**:
  - Auto-deploy từ feature branches (optional, qua manual trigger)
  - Shared resources giữa các developer
  - Logging level: DEBUG
  - Sử dụng `.env.dev` cho configuration
  - Có thể chạy nhiều instance song song cho các feature branch khác nhau

### 1.3 Staging

- **Mục đích**: Kiểm tra trước khi lên production, UAT (User Acceptance Testing)
- **Cơ sở hạ tầng**: Mirror production setup, cùng specs nhưng scale nhỏ hơn
- **Dữ liệu**: Anonymized production data hoặc realistic test data
- **Truy cập**: Development team, QA team, stakeholders
- **Đặc điểm**:
  - Auto-deploy khi merge vào branch `develop`
  - Configuration gần giống production
  - Logging level: INFO
  - Sử dụng `.env.staging` cho configuration
  - SSL/TLS enabled
  - Monitoring và alerting active

### 1.4 Production

- **Mục đích**: Phục vụ end-users, environment chính thức
- **Cơ sở hạ tầng**: Production-grade server, optimized configuration
- **Dữ liệu**: Real user data, encrypted at rest và in transit
- **Truy cập**: Operations team, với strict access control
- **Đặc điểm**:
  - **CHỈ deploy khi có explicit approval** — không có auto-deploy
  - Logging level: WARN (với structured logging)
  - Sử dụng `.env.production` cho configuration
  - Full monitoring, alerting, và on-call rotation
  - Backup tự động theo schedule
  - Rate limiting và security hardening active

---

## 2. Branch Strategy

### 2.1 Các branch chính

| Branch | Environment | Mục đích |
|--------|-------------|----------|
| `main` | Production | Code đang chạy trên production |
| `develop` | Staging | Integration branch, auto-deploy staging |
| `feature/*` | Local / Server Dev | Phát triển tính năng mới |

### 2.2 Quy trình làm việc

```
feature/xyz ──PR──> develop ──Release PR──> main
                        │                      │
                   auto-deploy            deploy với
                    staging              approval gate
```

#### Tạo feature branch

```bash
# Luôn tạo feature branch từ develop
git checkout develop
git pull origin develop
git checkout -b feature/ten-tinh-nang
```

#### Naming convention cho feature branches

- `feature/` — tính năng mới
- `fix/` — sửa bug
- `hotfix/` — sửa bug khẩn cấp trên production
- `chore/` — maintenance tasks (dependency updates, refactoring)

### 2.3 Hotfix Flow

Đối với các lỗi critical trên production, sử dụng hotfix flow:

```
main ──> hotfix/critical-bug ──PR──> main (với approval)
                                        │
                              cherry-pick xuống develop
```

- Hotfix branch tạo trực tiếp từ `main`
- Sau khi merge vào `main`, **bắt buộc** cherry-pick hoặc merge ngược về `develop`
- Vẫn yêu cầu approval gate trước khi deploy production

---

## 3. PR Checks — Quy trình kiểm tra Pull Request

Mọi Pull Request phải pass **toàn bộ** các checks sau trước khi được phép merge:

### 3.1 Lint

- **Tool**: ESLint, Prettier (frontend), Ruff/Black (Python backend)
- **Mục đích**: Đảm bảo code style consistency
- **Thời gian chạy**: ~30 giây
- **Failure behavior**: Block merge

```yaml
# CI step: Lint
- name: Run Lint
  run: |
    npm run lint
    npm run format:check
```

### 3.2 Type Check

- **Tool**: TypeScript compiler (`tsc --noEmit`)
- **Mục đích**: Phát hiện type errors trước runtime
- **Thời gian chạy**: ~1-2 phút
- **Failure behavior**: Block merge

```yaml
# CI step: Type Check
- name: Run TypeScript Check
  run: npx tsc --noEmit --project tsconfig.json
```

### 3.3 Unit Tests

- **Tool**: Jest / Vitest (frontend), Pytest (backend)
- **Mục đích**: Verify logic của individual functions và modules
- **Coverage threshold**: Minimum 80%
- **Thời gian chạy**: ~2-5 phút
- **Failure behavior**: Block merge

```yaml
# CI step: Unit Tests
- name: Run Unit Tests
  run: |
    npm run test:unit -- --coverage
    # Fail nếu coverage < 80%
    npm run test:coverage-check
```

### 3.4 Integration Tests

- **Tool**: Supertest (API), Testcontainers (database)
- **Mục đích**: Verify interaction giữa các components
- **Thời gian chạy**: ~5-10 phút
- **Failure behavior**: Block merge

```yaml
# CI step: Integration Tests
- name: Run Integration Tests
  run: |
    docker compose -f docker-compose.test.yml up -d
    npm run test:integration
    docker compose -f docker-compose.test.yml down
```

### 3.5 Migration Checks

- **Tool**: Custom migration validator script
- **Mục đích**: Đảm bảo database migrations an toàn, không có breaking changes
- **Kiểm tra**:
  - Migration có thể apply thành công trên empty database
  - Migration có thể apply trên database có existing data
  - Rollback migration hoạt động đúng
  - Không có destructive operations (DROP TABLE, DROP COLUMN) mà không có confirmation
- **Thời gian chạy**: ~2-3 phút
- **Failure behavior**: Block merge

```yaml
# CI step: Migration Check
- name: Validate Migrations
  run: |
    # Kiểm tra migration trên fresh database
    docker compose -f docker-compose.test.yml up -d db
    npm run migration:fresh
    npm run migration:rollback-all
    npm run migration:fresh
    docker compose -f docker-compose.test.yml down
```

### 3.6 Container Build

- **Tool**: Docker / Docker Buildx
- **Mục đích**: Đảm bảo Docker image build thành công, không có build errors
- **Kiểm tra**:
  - Multi-stage build hoàn thành
  - Image size trong giới hạn cho phép
  - Health check endpoint respond đúng
- **Thời gian chạy**: ~3-5 phút
- **Failure behavior**: Block merge

```yaml
# CI step: Container Build
- name: Build Docker Image
  run: |
    docker build -t app:pr-${{ github.event.pull_request.number }} .
    # Verify image size < 500MB
    IMAGE_SIZE=$(docker image inspect app:pr-${{ github.event.pull_request.number }} --format='{{.Size}}')
    if [ $IMAGE_SIZE -gt 524288000 ]; then
      echo "Image size exceeds 500MB limit"
      exit 1
    fi
```

### 3.7 Security Scan

- **Tool**: Trivy (container scan), npm audit / pip-audit (dependency scan), Semgrep (SAST)
- **Mục đích**: Phát hiện vulnerabilities trong dependencies và code
- **Kiểm tra**:
  - Không có HIGH hoặc CRITICAL vulnerabilities trong dependencies
  - Container image không có known CVEs ở mức HIGH/CRITICAL
  - Code không có common security anti-patterns
- **Thời gian chạy**: ~2-4 phút
- **Failure behavior**: Block merge (HIGH/CRITICAL), Warning (MEDIUM/LOW)

```yaml
# CI step: Security Scan
- name: Run Security Scan
  run: |
    # Dependency scan
    npm audit --audit-level=high
    # Container scan
    trivy image --severity HIGH,CRITICAL --exit-code 1 app:pr-${{ github.event.pull_request.number }}
    # SAST scan
    semgrep --config=p/security-audit --error
```

### 3.8 Tổng kết PR Check Pipeline

```
PR Created/Updated
    │
    ├── Lint ──────────────┐
    ├── Type Check ────────┤
    ├── Unit Tests ────────┤
    ├── Integration Tests ─┤──> All Pass ──> Ready for Review
    ├── Migration Check ───┤
    ├── Container Build ───┤
    └── Security Scan ─────┘
```

**Tất cả checks phải pass** + **Ít nhất 1 approval từ reviewer** = Merge được phép.

---

## 4. Deployment Pipeline

### 4.1 Staging Deployment (Tự động)

Khi một PR được merge vào branch `develop`, staging deployment tự động được trigger:

```yaml
# Trigger: merge vào develop
on:
  push:
    branches: [develop]

jobs:
  deploy-staging:
    steps:
      - name: Build Production Image
        run: docker build -t app:staging-${{ github.sha }} .

      - name: Push Image to Registry
        run: |
          docker tag app:staging-${{ github.sha }} registry.example.com/app:staging-latest
          docker push registry.example.com/app:staging-${{ github.sha }}
          docker push registry.example.com/app:staging-latest

      - name: Deploy to Staging
        run: |
          ssh staging-server "cd /opt/app && \
            docker compose pull && \
            docker compose up -d --remove-orphans"

      - name: Health Check
        run: |
          sleep 10
          curl -f https://staging.example.com/health || exit 1

      - name: Collect Evidence
        run: |
          # Lưu build log và deploy evidence
          ./scripts/collect-deploy-evidence.sh staging ${{ github.sha }}
```

### 4.2 Production Deployment (Yêu cầu Approval)

**⚠️ QUAN TRỌNG: Production KHÔNG BAO GIỜ được auto-deploy. Mọi deployment lên production
đều yêu cầu explicit approval từ người có thẩm quyền.**

#### Quy trình:

1. Tạo Release PR từ `develop` → `main`
2. PR phải pass tất cả checks
3. Reviewer approve PR
4. Merge PR vào `main`
5. **Approval gate**: Người deploy phải manually approve trong CI system
6. Deployment thực hiện sau approval

```yaml
# Trigger: merge vào main
on:
  push:
    branches: [main]

jobs:
  deploy-production:
    environment:
      name: production
      # YÊU CẦU manual approval trong GitHub/GitLab
    steps:
      - name: Verify Approval
        run: echo "Deployment approved by authorized personnel"

      - name: Build Production Image
        run: docker build -t app:prod-${{ github.sha }} .

      - name: Push Image to Registry
        run: |
          docker tag app:prod-${{ github.sha }} registry.example.com/app:prod-latest
          docker tag app:prod-${{ github.sha }} registry.example.com/app:prod-$(date +%Y%m%d-%H%M%S)
          docker push registry.example.com/app:prod-${{ github.sha }}
          docker push registry.example.com/app:prod-latest

      - name: Backup Current State
        run: |
          ssh production-server "cd /opt/app && \
            docker compose exec db pg_dump -U app > /backups/pre-deploy-$(date +%Y%m%d-%H%M%S).sql"

      - name: Deploy to Production
        run: |
          ssh production-server "cd /opt/app && \
            docker compose pull && \
            docker compose up -d --remove-orphans"

      - name: Health Check
        run: |
          sleep 15
          curl -f https://app.example.com/health || exit 1

      - name: Post-Deploy Verification
        run: |
          # Kiểm tra critical endpoints
          ./scripts/smoke-test-production.sh

      - name: Collect Evidence
        run: |
          ./scripts/collect-deploy-evidence.sh production ${{ github.sha }}
```

### 4.3 Approval Gate — Chi tiết

| Tiêu chí | Yêu cầu |
|-----------|----------|
| Ai có quyền approve? | Tech Lead, DevOps Lead, hoặc Project Manager |
| Số approval tối thiểu | 1 (recommended: 2 cho major releases) |
| Thời gian timeout | 24 giờ (sau đó phải tạo lại request) |
| Có thể bypass? | **KHÔNG** — không có ngoại lệ |
| Hotfix có cần approval? | **CÓ** — vẫn yêu cầu ít nhất 1 approval |

---

## 5. Rollback Procedure

### 5.1 Image Retention Policy

Hệ thống luôn giữ **3 Docker images gần nhất** cho mỗi environment:

```bash
# Registry luôn có:
registry.example.com/app:prod-latest      # Current
registry.example.com/app:prod-previous-1  # Previous 1
registry.example.com/app:prod-previous-2  # Previous 2
registry.example.com/app:prod-previous-3  # Previous 3
```

Script tự động tag và retain images:

```bash
#!/bin/bash
# scripts/rotate-images.sh
REGISTRY="registry.example.com/app"
ENV=$1  # staging hoặc prod

# Rotate tags
docker tag ${REGISTRY}:${ENV}-previous-2 ${REGISTRY}:${ENV}-previous-3
docker tag ${REGISTRY}:${ENV}-previous-1 ${REGISTRY}:${ENV}-previous-2
docker tag ${REGISTRY}:${ENV}-latest ${REGISTRY}:${ENV}-previous-1

# Push rotated tags
docker push ${REGISTRY}:${ENV}-previous-3
docker push ${REGISTRY}:${ENV}-previous-2
docker push ${REGISTRY}:${ENV}-previous-1

# Cleanup images cũ hơn 3 versions
# (thực hiện bởi registry garbage collection)
```

### 5.2 Docker Compose Rollback Procedure

Khi cần rollback, thực hiện các bước sau:

```bash
#!/bin/bash
# scripts/rollback.sh
# Usage: ./rollback.sh [environment] [version]
# Example: ./rollback.sh production previous-1

ENV=${1:-staging}
VERSION=${2:-previous-1}
REGISTRY="registry.example.com/app"
DEPLOY_DIR="/opt/app"

echo "⚠️  ROLLBACK: ${ENV} → ${VERSION}"
echo "================================================"

# Step 1: Pull image cũ
echo "[1/5] Pulling rollback image..."
docker pull ${REGISTRY}:${ENV}-${VERSION}
docker tag ${REGISTRY}:${ENV}-${VERSION} ${REGISTRY}:${ENV}-rollback-target

# Step 2: Stop current services
echo "[2/5] Stopping current services..."
cd ${DEPLOY_DIR}
docker compose down --timeout 30

# Step 3: Update docker-compose.yml để dùng rollback image
echo "[3/5] Updating compose configuration..."
sed -i "s|image:.*app:.*|image: ${REGISTRY}:${ENV}-${VERSION}|g" docker-compose.yml

# Step 4: Start services với image cũ
echo "[4/5] Starting services with rollback image..."
docker compose up -d

# Step 5: Health check
echo "[5/5] Running health check..."
sleep 10
if curl -sf http://localhost:3000/health > /dev/null; then
  echo "✅ Rollback thành công!"
  echo "   Environment: ${ENV}"
  echo "   Version: ${VERSION}"
  echo "   Time: $(date)"
else
  echo "❌ Rollback FAILED — health check không pass"
  echo "   Cần intervention manual ngay lập tức!"
  exit 1
fi
```

### 5.3 Database Rollback

Nếu rollback liên quan đến database migration:

```bash
# Rollback migration cuối cùng
docker compose exec api npm run migration:rollback

# Rollback nhiều migrations
docker compose exec api npm run migration:rollback -- --step=3

# Restore từ backup (trường hợp khẩn cấp)
docker compose exec db psql -U app < /backups/pre-deploy-YYYYMMDD-HHMMSS.sql
```

### 5.4 Rollback Decision Matrix

| Tình huống | Hành động |
|------------|-----------|
| Health check fail sau deploy | Auto-rollback ngay lập tức |
| Error rate tăng > 5% | Alert + manual rollback decision |
| Critical bug phát hiện bởi user | Manual rollback + hotfix |
| Performance degradation > 50% | Manual rollback + investigate |

---

## 6. Evidence Collection

Mỗi lần deployment, hệ thống tự động thu thập và lưu trữ evidence để phục vụ audit,
debugging, và compliance.

### 6.1 Các loại Evidence

| Loại | Nội dung | Format | Retention |
|------|----------|--------|-----------|
| Build Logs | Output của Docker build process | Plain text | 90 ngày |
| Test Results | Unit test, integration test reports | JUnit XML + HTML | 90 ngày |
| Security Scan Reports | Trivy, Semgrep, audit results | JSON + HTML | 180 ngày |
| Deploy Metadata | Timestamp, deployer, commit SHA, image tag | JSON | 365 ngày |
| Health Check Results | Post-deploy health check responses | JSON | 90 ngày |
| Approval Records | Ai approve, khi nào, comments | JSON | 365 ngày |

### 6.2 Evidence Collection Script

```bash
#!/bin/bash
# scripts/collect-deploy-evidence.sh
# Usage: ./collect-deploy-evidence.sh [environment] [commit_sha]

ENV=$1
COMMIT_SHA=$2
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
EVIDENCE_DIR="/opt/evidence/${ENV}/${TIMESTAMP}-${COMMIT_SHA:0:8}"

mkdir -p ${EVIDENCE_DIR}

echo "📋 Collecting deployment evidence..."
echo "   Environment: ${ENV}"
echo "   Commit: ${COMMIT_SHA}"
echo "   Directory: ${EVIDENCE_DIR}"

# 1. Deploy metadata
cat > ${EVIDENCE_DIR}/metadata.json <<EOF
{
  "environment": "${ENV}",
  "commit_sha": "${COMMIT_SHA}",
  "timestamp": "${TIMESTAMP}",
  "deployer": "${GITHUB_ACTOR:-manual}",
  "branch": "${GITHUB_REF_NAME:-unknown}",
  "run_id": "${GITHUB_RUN_ID:-N/A}",
  "image_tag": "${ENV}-${COMMIT_SHA}"
}
EOF

# 2. Build logs
cp build.log ${EVIDENCE_DIR}/build.log 2>/dev/null || echo "No build log" > ${EVIDENCE_DIR}/build.log

# 3. Test results
cp -r test-results/ ${EVIDENCE_DIR}/test-results/ 2>/dev/null
cp coverage/lcov-report/index.html ${EVIDENCE_DIR}/coverage-report.html 2>/dev/null

# 4. Security scan reports
cp trivy-report.json ${EVIDENCE_DIR}/trivy-report.json 2>/dev/null
cp semgrep-results.json ${EVIDENCE_DIR}/semgrep-results.json 2>/dev/null
cp npm-audit.json ${EVIDENCE_DIR}/npm-audit.json 2>/dev/null

# 5. Health check result
HEALTH_RESPONSE=$(curl -s https://${ENV}.example.com/health)
echo ${HEALTH_RESPONSE} | jq . > ${EVIDENCE_DIR}/health-check.json

# 6. Container info
docker inspect $(docker compose ps -q) > ${EVIDENCE_DIR}/container-inspect.json 2>/dev/null

echo "✅ Evidence collected: ${EVIDENCE_DIR}"
ls -la ${EVIDENCE_DIR}
```

### 6.3 Evidence Storage Structure

```
/opt/evidence/
├── staging/
│   ├── 20260720-143022-a1b2c3d4/
│   │   ├── metadata.json
│   │   ├── build.log
│   │   ├── test-results/
│   │   ├── trivy-report.json
│   │   ├── semgrep-results.json
│   │   ├── health-check.json
│   │   └── container-inspect.json
│   └── 20260721-091545-e5f6g7h8/
│       └── ...
└── production/
    ├── 20260722-160000-i9j0k1l2/
    │   ├── metadata.json
    │   ├── build.log
    │   ├── test-results/
    │   ├── trivy-report.json
    │   ├── approval-record.json    ← chỉ có ở production
    │   ├── health-check.json
    │   └── container-inspect.json
    └── ...
```

### 6.4 Truy vấn Evidence

```bash
# Tìm evidence của deploy gần nhất
ls -lt /opt/evidence/production/ | head -5

# Xem ai đã approve deploy production
cat /opt/evidence/production/latest/approval-record.json | jq '.approved_by'

# Kiểm tra có vulnerability nào trong deploy cuối
cat /opt/evidence/production/latest/trivy-report.json | jq '.Results[].Vulnerabilities | length'
```

---

## 7. Monitoring sau Deploy

### 7.1 Post-Deploy Checklist

- [ ] Health check endpoint trả về 200
- [ ] Error rate không tăng đột biến
- [ ] Response time trong ngưỡng bình thường
- [ ] Tất cả scheduled jobs chạy đúng
- [ ] Database connections pool healthy
- [ ] Memory và CPU usage ổn định

### 7.2 Automated Canary Checks

Sau mỗi production deploy, hệ thống tự động chạy canary checks trong 15 phút đầu:

```bash
# Chạy mỗi 30 giây trong 15 phút
for i in $(seq 1 30); do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://app.example.com/health)
  if [ "$RESPONSE" != "200" ]; then
    echo "❌ Canary check failed at iteration $i"
    ./scripts/rollback.sh production previous-1
    exit 1
  fi
  sleep 30
done
echo "✅ Canary checks passed — deploy stable"
```

---

## 8. Tóm tắt Nguyên tắc

1. **Mọi code phải qua PR checks** — không có ngoại lệ
2. **Staging auto-deploy** khi merge vào `develop` — cho phép test nhanh
3. **Production KHÔNG BAO GIỜ auto-deploy** — luôn yêu cầu explicit approval
4. **Giữ 3 images gần nhất** — đảm bảo khả năng rollback nhanh
5. **Thu thập evidence mỗi deploy** — phục vụ audit và debugging
6. **Rollback phải đơn giản và nhanh** — tối đa 5 phút cho toàn bộ quy trình
7. **Security scan là mandatory** — không merge nếu có HIGH/CRITICAL vulnerabilities

---

*Tài liệu thuộc Volume 01: Architecture Foundation*
*Cập nhật lần cuối: 2026-07-23*
