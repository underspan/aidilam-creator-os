# 20. Backup và Disaster Recovery

> **Volume**: 01 - Architecture Foundation
> **Status**: Active
> **Last Updated**: 2026-07-23
> **Classification**: Infrastructure - Data Protection

---

## 20.1 Tổng quan

Tài liệu này định nghĩa chiến lược backup, phân loại dữ liệu theo mức độ critical,
chính sách retention, yêu cầu encryption, và quy trình disaster recovery cho toàn bộ
hệ thống AIĐiLàm platform chạy trên nền tảng Underspan.

### Nguyên tắc thiết kế

1. **Defense in depth** — nhiều lớp backup với các phương thức khác nhau
2. **Off-host requirement** — backup PHẢI được lưu trữ ngoài host gốc
3. **Encryption at rest** — tất cả backup sử dụng AES-256 encryption
4. **Isolation boundary** — AIĐiLàm có thể removed mà không ảnh hưởng Underspan
5. **Testable recovery** — mọi backup phải được verify khả năng restore định kỳ

---

## 20.2 Phân loại Backup (Backup Classes)

### 20.2.1 CRITICAL Class

Dữ liệu không thể tái tạo, mất mát gây gián đoạn nghiêm trọng toàn hệ thống.

| Component | Mô tả | Backup Method |
|-----------|--------|---------------|
| PostgreSQL | Toàn bộ database chính | `pg_basebackup` + WAL archiving |
| env/secrets | Environment variables, API keys, tokens | Encrypted snapshot |
| Platform session vault | Session data, auth tokens, OAuth state | Encrypted export |
| Config | Application config, feature flags, routing rules | Git-versioned + snapshot |
| Audit logs | Security audit trail, access logs, change history | Append-only archive |

**RPO**: 1 giờ (tối đa 1 giờ dữ liệu mất)
**RTO**: 4 giờ (khôi phục trong vòng 4 giờ)

### 20.2.2 HIGH Class

Dữ liệu có giá trị cao, tốn nhiều effort để tái tạo nhưng không gây system failure.

| Component | Mô tả | Backup Method |
|-----------|--------|---------------|
| Transcripts | Bản ghi chép từ audio/video processing | File-level backup |
| Translations | Nội dung đã dịch qua các language pairs | File-level backup |
| Subtitles | Generated subtitle files (SRT, VTT, ASS) | File-level backup |
| Prompt versions | Lịch sử các prompt template iterations | Git-versioned + snapshot |
| Workflow versions | Versioned workflow definitions và state | Git-versioned + snapshot |

**RPO**: 4 giờ
**RTO**: 8 giờ

### 20.2.3 MEDIUM Class

Dữ liệu có thể tái tạo với cost đáng kể (compute time, API calls).

| Component | Mô tả | Backup Method |
|-----------|--------|---------------|
| Final renders | Output video/audio đã render xong | Object storage snapshot |
| Qdrant snapshots | Vector database snapshots | Native Qdrant snapshot API |
| MinIO metadata | Object metadata, bucket policies, lifecycle rules | `mc admin` export |

**RPO**: 24 giờ
**RTO**: 48 giờ

### 20.2.4 REGENERABLE Class

Dữ liệu có thể tái tạo từ source hoặc qua pipeline processing.

| Component | Mô tả | Backup Required |
|-----------|--------|-----------------|
| Extracted audio | Audio tracks tách từ video | Không — regenerate từ source |
| Thumbnails | Generated preview images | Không — regenerate on-demand |
| Previews | Low-res preview renders | Không — regenerate từ final |
| Temp files | Processing intermediaries | Không — ephemeral by design |
| Caches | Redis cache, computed results | Không — rebuild on startup |
| Originals | Source files gốc (nếu legally re-downloadable) | **Configurable per source** |

> ⚠️ **QUAN TRỌNG về Originals**: Không phải tất cả source originals đều có thể
> re-download được. Một số platform thay đổi policy, video bị xóa, hoặc license hết hạn.
> Hệ thống PHẢI cho phép configure per-source xem original có thể re-download hay không.
> Nếu **không thể re-download** → promote lên MEDIUM hoặc HIGH class.

```yaml
# Ví dụ config per-source redownloadability
source_backup_policy:
  youtube_public:
    redownloadable: true
    confidence: medium  # có thể bị takedown
    fallback_class: HIGH
  licensed_content:
    redownloadable: false
    confidence: n/a
    backup_class: HIGH  # luôn backup
  user_uploaded:
    redownloadable: false
    confidence: n/a
    backup_class: CRITICAL  # chỉ có 1 bản
```

---

## 20.3 Tần suất Backup (Frequency)

### Full Backup Schedule

| Class | Frequency | Window |
|-------|-----------|--------|
| CRITICAL | Daily (02:00 UTC+7) | 30 phút max |
| HIGH | Daily (03:00 UTC+7) | 60 phút max |
| MEDIUM | Weekly (Sunday 04:00 UTC+7) | 120 phút max |
| REGENERABLE | Không backup định kỳ | N/A |

### Incremental Backup Schedule

| Class | Frequency | Method |
|-------|-----------|--------|
| CRITICAL | Mỗi 1 giờ | WAL shipping (PostgreSQL), diff snapshot (others) |
| HIGH | Mỗi 4 giờ | File-level incremental |
| MEDIUM | Daily | Object-level diff |

### Continuous Protection (CRITICAL only)

```
PostgreSQL WAL Archiving:
  - archive_mode = on
  - archive_command ships WAL segments to off-host storage
  - wal_level = replica
  - Cho phép Point-in-Time Recovery (PITR)
```

---

## 20.4 Chính sách Retention

### Retention Matrix

| Backup Type | CRITICAL | HIGH | MEDIUM |
|-------------|----------|------|--------|
| Full backup | 30 ngày | 30 ngày | 30 ngày |
| Incremental | 7 ngày | 7 ngày | 7 ngày |
| WAL archives | 7 ngày | N/A | N/A |
| Point-in-time | 72 giờ | N/A | N/A |

### Retention Rules

1. **Full backups** được giữ tối thiểu **30 ngày** trước khi eligible for deletion
2. **Incremental backups** được giữ **7 ngày** — sau đó merge vào full hoặc delete
3. **Tối thiểu 2 full backups** phải tồn tại tại mọi thời điểm (safety net)
4. Retention có thể extend cho compliance requirements (audit logs: 1 năm minimum)
5. Deletion chỉ xảy ra sau khi verify backup mới nhất restorable

---

## 20.5 Off-Host Requirement

> **BẮT BUỘC**: Tất cả backup PHẢI được lưu trữ trên ít nhất 1 location
> khác với host chứa dữ liệu gốc.

### Storage Topology

```
┌─────────────────────────────────────────────────────────┐
│  PRIMARY HOST                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │PostgreSQL│  │  MinIO   │  │  Qdrant  │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       │              │              │                   │
│       ▼              ▼              ▼                   │
│  ┌─────────────────────────────────────────┐           │
│  │  Local Backup Staging (encrypted, temp) │           │
│  └────────────────────┬────────────────────┘           │
└───────────────────────┼─────────────────────────────────┘
                        │
                        ▼  [REQUIRES_HOST_VALIDATION]
┌─────────────────────────────────────────────────────────┐
│  OFF-HOST BACKUP DESTINATION                            │
│  ┌──────────────────────────────────────────┐          │
│  │  Encrypted Object Storage (AES-256)      │          │
│  │  - Path: /backup/{class}/{date}/{type}/  │          │
│  │  - Retention policy enforced             │          │
│  │  - Immutable lock for CRITICAL class     │          │
│  └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

### Backup Paths

> 🔴 **REQUIRES_HOST_VALIDATION** — Các đường dẫn backup dưới đây cần được
> validate và adjust theo cấu hình host thực tế khi deploy.

```yaml
backup_paths:
  # REQUIRES_HOST_VALIDATION
  local_staging: /var/backup/aidilam/staging/
  
  # REQUIRES_HOST_VALIDATION
  off_host_primary: ${BACKUP_REMOTE_PRIMARY}:/backup/aidilam/
  
  # REQUIRES_HOST_VALIDATION
  off_host_secondary: ${BACKUP_REMOTE_SECONDARY}:/backup/aidilam/
  
  # REQUIRES_HOST_VALIDATION
  wal_archive: ${WAL_ARCHIVE_PATH}:/wal-archive/
  
  # REQUIRES_HOST_VALIDATION
  secrets_vault_backup: ${VAULT_BACKUP_PATH}:/vault/
```

---

## 20.6 Encryption

### Encryption Standard

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Management**: Dedicated backup encryption key, rotated mỗi 90 ngày
- **Key Storage**: Tách biệt khỏi backup data (không lưu key cùng chỗ với backup)
- **In-transit**: TLS 1.3 cho mọi backup transfer

### Encryption Workflow

```
Source Data
    │
    ▼
[Compress: zstd level 3]
    │
    ▼
[Encrypt: AES-256-GCM with unique IV per file]
    │
    ▼
[Upload to off-host with TLS 1.3]
    │
    ▼
[Verify checksum: SHA-256]
```

### Key Hierarchy

```yaml
encryption_keys:
  master_key:
    storage: hardware_security_module  # hoặc KMS
    rotation: yearly
  backup_encryption_key:
    derived_from: master_key
    rotation: 90_days
    purpose: encrypt backup payloads
  transport_key:
    type: TLS_certificate
    rotation: 365_days
```

---

## 20.7 Restore Testing

### Schedule kiểm tra Restore

| Test Type | Frequency | Scope |
|-----------|-----------|-------|
| Automated restore verify | Daily | CRITICAL class — verify integrity |
| Partial restore drill | Weekly | Random HIGH class component |
| Full disaster recovery drill | Monthly | Toàn bộ system from scratch |
| Cross-host restore test | Quarterly | Restore lên host khác hoàn toàn |

### Automated Restore Verification

```bash
#!/bin/bash
# Daily restore verification (CRITICAL class)
# REQUIRES_HOST_VALIDATION — paths below need adjustment per host

RESTORE_TEST_DIR="/var/backup/aidilam/restore-test/"  # REQUIRES_HOST_VALIDATION
BACKUP_SOURCE="${BACKUP_REMOTE_PRIMARY}"               # REQUIRES_HOST_VALIDATION

# 1. Pull latest CRITICAL backup
pull_latest_backup "CRITICAL" "${BACKUP_SOURCE}" "${RESTORE_TEST_DIR}"

# 2. Decrypt và verify integrity
decrypt_and_verify "${RESTORE_TEST_DIR}/latest.enc"

# 3. PostgreSQL: attempt restore vào test instance
pg_restore_test "${RESTORE_TEST_DIR}/pg_basebackup_latest.tar"

# 4. Verify data consistency
verify_row_counts
verify_critical_tables
verify_audit_log_continuity

# 5. Report results
report_restore_test_result $?

# 6. Cleanup test artifacts
cleanup_restore_test "${RESTORE_TEST_DIR}"
```

### Restore Test Success Criteria

1. ✅ Backup file decrypts thành công (AES-256 key valid)
2. ✅ Checksum SHA-256 match với recorded value
3. ✅ PostgreSQL restore hoàn tất không lỗi
4. ✅ Row counts khớp với source (± tolerance cho concurrent writes)
5. ✅ Critical tables accessible và queryable
6. ✅ Audit log continuity — không gap trong timeline
7. ✅ Application có thể boot và serve requests với restored data

---

## 20.8 RPO và RTO Targets

### Recovery Point Objective (RPO)

RPO định nghĩa lượng dữ liệu tối đa có thể mất trong worst-case scenario.

| Class | RPO | Giải thích |
|-------|-----|------------|
| CRITICAL | **1 giờ** | Tối đa mất 1 giờ data (WAL archiving mỗi giờ) |
| HIGH | **4 giờ** | Incremental mỗi 4 giờ |
| MEDIUM | **24 giờ** | Daily incremental, acceptable loss |
| REGENERABLE | **∞** | Không có RPO — tái tạo được |

### Recovery Time Objective (RTO)

RTO định nghĩa thời gian tối đa từ incident đến system hoạt động trở lại.

| Class | RTO | Recovery Strategy |
|-------|-----|-------------------|
| CRITICAL | **4 giờ** | Automated restore + manual verification |
| HIGH | **8 giờ** | Semi-automated restore |
| MEDIUM | **48 giờ** | Manual restore hoặc regeneration |
| REGENERABLE | **Best effort** | Re-process khi cần |

### RTO Breakdown (CRITICAL — 4h budget)

```
Thời gian    Hoạt động
─────────    ──────────────────────────────────
0:00-0:15    Incident detection và alert
0:15-0:30    Triage, xác định scope of failure
0:30-1:00    Initiate restore procedure
1:00-2:30    Data restore (download + decrypt + apply)
2:30-3:00    PostgreSQL recovery + WAL replay
3:00-3:30    Service startup và dependency check
3:30-3:45    Smoke testing và verification
3:45-4:00    Traffic cutover và monitoring confirm
```

---

## 20.9 Recovery Sequence

### Thứ tự khôi phục (Phải tuân thủ nghiêm ngặt)

Recovery PHẢI thực hiện theo thứ tự sau để đảm bảo data consistency:

```
Phase 1: Infrastructure Foundation
├── 1.1 Restore env/secrets và config
├── 1.2 Verify network connectivity
└── 1.3 Verify storage availability

Phase 2: Data Layer
├── 2.1 Restore PostgreSQL (full backup + WAL replay)
├── 2.2 Verify database integrity (pg_checksums)
├── 2.3 Restore platform session vault
└── 2.4 Restore audit logs (verify continuity)

Phase 3: Application Services
├── 3.1 Start core services (auth, API gateway)
├── 3.2 Verify service health checks
├── 3.3 Restore HIGH class data (transcripts, translations)
└── 3.4 Verify data accessibility

Phase 4: Supporting Services
├── 4.1 Restore Qdrant vector data (hoặc rebuild từ source)
├── 4.2 Restore MinIO metadata
├── 4.3 Restore final renders (nếu available)
└── 4.4 Trigger regeneration cho REGENERABLE class

Phase 5: Verification & Cutover
├── 5.1 End-to-end smoke tests
├── 5.2 Performance baseline check
├── 5.3 Enable traffic / DNS cutover
└── 5.4 Monitor error rates 30 phút
```

### Recovery Decision Tree

```
Incident Detected
    │
    ├─ Single component failure?
    │   ├─ YES → Component-level restore (Phase 2-4 relevant section)
    │   └─ NO ↓
    │
    ├─ Full host failure?
    │   ├─ YES → Full disaster recovery (Phase 1-5)
    │   └─ NO ↓
    │
    └─ Data corruption detected?
        ├─ CRITICAL class → PITR to last known good state
        ├─ HIGH class → Restore from latest backup
        └─ MEDIUM class → Restore or regenerate (cost analysis)
```

---

## 20.10 Removal Boundaries — AIĐiLàm / Underspan Isolation

### Nguyên tắc Isolation

> **CRITICAL DESIGN REQUIREMENT**: AIĐiLàm platform có thể được removed
> hoàn toàn mà KHÔNG ảnh hưởng đến Underspan platform functionality.

### Boundary Definition

```
┌─────────────────────────────────────────────────────────────────┐
│  UNDERSPAN PLATFORM (Independent)                               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Core Infrastructure                                       │ │
│  │  - Network, DNS, Load Balancer                             │ │
│  │  - Base OS, Container Runtime                              │ │
│  │  - Monitoring Stack                                        │ │
│  │  - Shared PostgreSQL Instance (separate databases)         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│    AIĐILÀM TENANT (Removable)                                  │
│  │                                                           │ │
│    - AIĐiLàm application services                              │
│  │ - AIĐiLàm databases (separate schema/database)           │ │
│    - AIĐiLàm MinIO buckets (namespaced)                        │
│  │ - AIĐiLàm Qdrant collections                             │ │
│    - AIĐiLàm backup data                                       │
│  │ - AIĐiLàm config và secrets                              │ │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Removal Procedure (AIĐiLàm)

Khi cần remove AIĐiLàm khỏi Underspan:

1. **Stop AIĐiLàm services** — graceful shutdown tất cả containers/processes
2. **Final backup** — tạo backup cuối cùng trước removal (archive purposes)
3. **Drop AIĐiLàm database** — `DROP DATABASE aidilam;` (không ảnh hưởng DB khác)
4. **Remove MinIO buckets** — chỉ buckets có prefix `aidilam-*`
5. **Remove Qdrant collections** — chỉ collections có prefix `aidilam_`
6. **Remove config/secrets** — AIĐiLàm-specific entries only
7. **Remove backup data** — off-host backup cho AIĐiLàm
8. **Verify Underspan health** — confirm platform vẫn healthy sau removal

### Shared Resource Rules

| Resource | Isolation Method | Safe to Remove? |
|----------|-----------------|-----------------|
| PostgreSQL server | Separate database per tenant | ✅ Drop DB only |
| MinIO server | Namespaced buckets (`aidilam-*`) | ✅ Remove buckets only |
| Qdrant server | Prefixed collections (`aidilam_`) | ✅ Remove collections only |
| Redis | Key prefix `aidilam:` | ✅ Flush prefix only |
| Network | Separate Docker network/namespace | ✅ Remove network |
| Monitoring | Labeled metrics/dashboards | ✅ Remove dashboards |
| Backup storage | Separate directory tree | ✅ Remove directory |

### Underspan Isolation Guarantee

```yaml
isolation_verification:
  pre_removal_checks:
    - underspan_health_check: PASS
    - underspan_database_accessible: PASS
    - underspan_services_running: PASS
  
  post_removal_checks:
    - underspan_health_check: MUST_PASS
    - underspan_database_accessible: MUST_PASS
    - underspan_services_running: MUST_PASS
    - aidilam_artifacts_removed: MUST_PASS
    - no_orphaned_resources: MUST_PASS
```

---

## 20.11 Backup Monitoring và Alerting

### Alert Rules

| Condition | Severity | Action |
|-----------|----------|--------|
| CRITICAL backup missed | P1 — CRITICAL | Immediate page, manual intervention |
| HIGH backup missed | P2 — HIGH | Alert within 1 giờ |
| Backup size anomaly (>50% change) | P2 — HIGH | Investigate data growth/loss |
| Restore test failed | P1 — CRITICAL | Immediate investigation |
| Encryption key approaching rotation | P3 — MEDIUM | Schedule rotation |
| Off-host storage unreachable | P1 — CRITICAL | Fallback to secondary |
| Retention policy violation | P2 — HIGH | Investigate storage capacity |

### Health Metrics

```yaml
backup_metrics:
  - name: backup_last_success_timestamp
    type: gauge
    labels: [class, component]
    
  - name: backup_duration_seconds
    type: histogram
    labels: [class, type]  # type: full|incremental
    
  - name: backup_size_bytes
    type: gauge
    labels: [class, component]
    
  - name: restore_test_last_success
    type: gauge
    labels: [class, test_type]
    
  - name: backup_encryption_key_age_days
    type: gauge
```

---

## 20.12 Operational Procedures

### Daily Checklist (Automated)

- [ ] Verify tất cả CRITICAL backups completed
- [ ] Verify off-host replication successful
- [ ] Run automated restore test
- [ ] Check backup size trends
- [ ] Verify encryption key validity

### Weekly Checklist

- [ ] Review backup alerts từ tuần qua
- [ ] Partial restore drill (HIGH class)
- [ ] Verify retention policy compliance
- [ ] Check storage capacity planning
- [ ] Review và update source redownloadability config

### Monthly Checklist

- [ ] Full disaster recovery drill
- [ ] Review và update RPO/RTO targets
- [ ] Encryption key rotation (nếu approaching 90 days)
- [ ] Update documentation nếu có changes
- [ ] Capacity forecasting cho 3 tháng tới

---

## 20.13 Lưu ý Triển khai

### REQUIRES_HOST_VALIDATION

Tất cả các configuration paths, storage locations, và connection strings
trong tài liệu này được đánh dấu **REQUIRES_HOST_VALIDATION**.

Điều này có nghĩa:
1. Paths cần được verify trên host thực tế trước khi sử dụng
2. Storage backends có thể khác nhau giữa environments
3. Network topology ảnh hưởng backup transfer strategy
4. Capacity limits phụ thuộc vào host specifications

### Originals Backup — Configurable per Source

Vì originals nằm trong class REGENERABLE nhưng có thể KHÔNG re-downloadable:

- Mỗi content source PHẢI có configuration xác định `redownloadable` status
- Default assumption: **NOT redownloadable** (conservative approach)
- Nếu source xác nhận redownloadable → có thể để ở REGENERABLE
- Nếu không chắc chắn → promote lên ít nhất MEDIUM class
- Configuration PHẢI được review quarterly khi platform policies thay đổi

---

## 20.14 Tóm tắt Quick Reference

| Metric | CRITICAL | HIGH | MEDIUM | REGENERABLE |
|--------|----------|------|--------|-------------|
| RPO | 1h | 4h | 24h | ∞ |
| RTO | 4h | 8h | 48h | Best effort |
| Full Backup | Daily | Daily | Weekly | None |
| Incremental | Hourly | 4-hourly | Daily | None |
| Retention (Full) | 30d | 30d | 30d | N/A |
| Retention (Incr) | 7d | 7d | 7d | N/A |
| Encryption | AES-256 | AES-256 | AES-256 | N/A |
| Off-host | Required | Required | Required | N/A |
| Restore Test | Daily | Weekly | Monthly | N/A |

---

*Tài liệu này là living document — cập nhật khi infrastructure thay đổi.*
*Mọi thay đổi phải qua review process và version control.*
