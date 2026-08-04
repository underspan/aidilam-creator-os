# Chương 15: Storage Architecture

## Tổng quan

Kiến trúc storage của AiDiLam được thiết kế theo nguyên tắc phân tách rõ ràng giữa **source code**, **data**, và **backup**. Hệ thống tận dụng tối đa SAN storage 13.6TB cho media và database, trong khi giữ root logical volume chỉ phục vụ source code và Docker runtime.

Thiết kế này đảm bảo:
- **Performance isolation**: Media I/O không ảnh hưởng đến system operations
- **Capacity planning**: Root LV không bao giờ bị đầy do media data
- **Data safety**: Original files luôn immutable, có checksum verification
- **Cost efficiency**: Tận dụng SAN storage giá rẻ hơn cho bulk data

---

## 15.1 Storage Layout Tổng thể

### 15.1.1 Ba tầng Storage chính

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: Source & Runtime                                    │
│  /opt/aidilam/source/                                        │
│  Filesystem: /dev/mapper/rootvg-rootlv                       │
│  Capacity: 62GB free (VERIFIED)                              │
│  Mục đích: Source code, Docker images, container runtime     │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: Data (SAN)                                          │
│  /data/aidilam/                                              │
│  Capacity: 13.6TB (REQUIRES_HOST_VALIDATION)                 │
│  Mục đích: Database, object storage, media files             │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: Backup                                              │
│  /backup/aidilam/                                            │
│  Status: REQUIRES_HOST_VALIDATION                            │
│  Mục đích: Scheduled backups, disaster recovery              │
└─────────────────────────────────────────────────────────────┘
```

### 15.1.2 Bảng tổng hợp Storage Paths

| Path | Filesystem | Capacity | Status |
|------|-----------|----------|--------|
| `/opt/aidilam/source/` | `/dev/mapper/rootvg-rootlv` | 62GB free | VERIFIED |
| `/data/aidilam/postgres/` | SAN LUN | 13.6TB (shared) | REQUIRES_HOST_VALIDATION |
| `/data/aidilam/redis/` | SAN LUN | 13.6TB (shared) | REQUIRES_HOST_VALIDATION |
| `/data/aidilam/qdrant/` | SAN LUN | 13.6TB (shared) | REQUIRES_HOST_VALIDATION |
| `/data/aidilam/minio/` | SAN LUN | 13.6TB (shared) | REQUIRES_HOST_VALIDATION |
| `/data/aidilam/media/` | SAN LUN | 13.6TB (shared) | REQUIRES_HOST_VALIDATION |
| `/data/aidilam/temp/` | SAN LUN | Size-controlled | REQUIRES_HOST_VALIDATION |
| `/data/aidilam/cache/` | SAN LUN | Size-controlled | REQUIRES_HOST_VALIDATION |
| `/backup/aidilam/` | Separate volume | TBD | REQUIRES_HOST_VALIDATION |

---

## 15.2 Tier 1: Source Code & Runtime

### 15.2.1 Root Logical Volume

```
Device:     /dev/mapper/rootvg-rootlv
Free space: 62GB (verified)
Mount:      /
```

**Quy tắc nghiêm ngặt cho root LV:**

1. **CHỈ** chứa source code tại `/opt/aidilam/source/`
2. **CHỈ** chứa Docker images và container layers
3. **KHÔNG BAO GIỜ** lưu media files, database data, hoặc user uploads
4. **KHÔNG BAO GIỜ** dùng làm temp storage cho FFmpeg processing

### 15.2.2 Cấu trúc Source Directory

```
/opt/aidilam/source/
├── docker-compose.yml
├── docker-compose.override.yml
├── .env
├── services/
│   ├── api-gateway/
│   ├── media-processor/
│   ├── ai-engine/
│   ├── content-manager/
│   └── auth-service/
├── shared/
│   ├── libs/
│   └── proto/
├── infrastructure/
│   ├── terraform/
│   ├── ansible/
│   └── scripts/
└── docs/
```

### 15.2.3 Capacity Monitoring cho Root LV

```bash
# Alert khi root LV usage > 80%
THRESHOLD=80
USAGE=$(df /opt/aidilam/source/ | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$USAGE" -gt "$THRESHOLD" ]; then
    echo "CRITICAL: Root LV usage at ${USAGE}%"
    # Trigger cleanup: docker system prune, remove unused images
fi
```

---

## 15.3 Tier 2: Data Storage (SAN)

### 15.3.1 SAN Configuration

```
Visible capacity: 13.6TB
Status:           SAN visible but not mounted
Action required:  Host validation trước khi mount
```

> ⚠️ **REQUIRES_HOST_VALIDATION**: SAN LUN 13.6TB đã visible trên host nhưng chưa được mount. Cần xác nhận với infrastructure team trước khi tiến hành format và mount.

### 15.3.2 Data Subdirectories

```
/data/aidilam/
├── postgres/          # PostgreSQL data directory
│   ├── data/          # Main database files
│   └── wal/           # Write-Ahead Log (separate cho performance)
├── redis/             # Redis persistence (RDB + AOF)
│   ├── data/
│   └── aof/
├── qdrant/            # Vector database storage
│   ├── collections/
│   └── snapshots/
├── minio/             # Object storage data
│   ├── aidilam-originals/
│   ├── aidilam-derived/
│   ├── aidilam-temp/
│   └── aidilam-exports/
├── media/             # Processed media files
│   ├── originals/     # IMMUTABLE - never modified after upload
│   ├── audio/         # Extracted audio tracks
│   ├── thumbnails/    # Generated thumbnails
│   ├── transcripts/   # Speech-to-text output
│   ├── subtitles/     # Generated/translated subtitles
│   ├── voices/        # Voice cloning models & output
│   ├── previews/      # Preview renders (lower quality)
│   └── renders/       # Final rendered output
├── temp/              # Temporary processing space (SIZE-CONTROLLED)
└── cache/             # Application cache (evictable)
```

### 15.3.3 Media Directory — Chi tiết

#### `media/originals/` — Immutable Storage

Đây là thư mục **quan trọng nhất** trong hệ thống. Mọi file upload gốc được lưu tại đây và **KHÔNG BAO GIỜ bị sửa đổi hoặc xóa** (trừ khi user explicitly request deletion).

```
Nguyên tắc:
- Write-once, read-many (WORM)
- Checksum (SHA-256) tính ngay khi upload
- Deduplication dựa trên checksum
- Không có process nào được write vào file đã tồn tại
```

#### `media/audio/` — Extracted Audio

Audio tracks được extract từ video originals bằng FFmpeg:
- Format: AAC, FLAC, WAV tùy theo use case
- Naming convention: `{original_id}_{track}_{codec}.{ext}`

#### `media/thumbnails/` — Generated Thumbnails

- Multiple resolutions: 120p, 240p, 480p
- Format: WebP (primary), JPEG (fallback)
- Auto-generated khi upload mới

#### `media/transcripts/` — Speech-to-Text

- Format: JSON (structured) + TXT (plain)
- Multilingual: Vietnamese, English, và các ngôn ngữ khác
- Linked to original via `original_id`

#### `media/subtitles/` — Subtitle Files

- Format: SRT, VTT, ASS
- Auto-generated từ transcripts
- Translated versions stored separately

#### `media/voices/` — Voice Data

- Voice cloning models (`.pth`, `.onnx`)
- Generated voice output (`.wav`, `.mp3`)
- Training data samples

#### `media/previews/` — Preview Renders

- Lower quality, faster generation
- Dùng cho UI preview trước khi render final
- Auto-cleanup sau 7 ngày nếu không accessed

#### `media/renders/` — Final Output

- Full quality rendered content
- Watermarked và non-watermarked versions
- Export-ready formats

---

## 15.4 MinIO Object Storage

### 15.4.1 Bucket Architecture

| Bucket | Mục đích | Lifecycle | Retention |
|--------|----------|-----------|-----------|
| `aidilam-originals` | File gốc upload | Immutable | Permanent |
| `aidilam-derived` | File xử lý (thumbnails, audio, etc.) | Regenerable | 90 days inactive |
| `aidilam-temp` | Processing intermediates | Auto-cleanup | 24 hours max |
| `aidilam-exports` | User export packages | Time-limited | 7 days |

### 15.4.2 MinIO Configuration

```yaml
# MinIO deployment config
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  volumes:
    - /data/aidilam/minio:/data
  environment:
    MINIO_ROOT_USER: ${MINIO_ROOT_USER}
    MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### 15.4.3 Bucket Policies

```json
{
  "aidilam-originals": {
    "versioning": "enabled",
    "object_lock": "governance",
    "lifecycle": "none",
    "access": "private"
  },
  "aidilam-temp": {
    "versioning": "disabled",
    "lifecycle": {
      "expiration_days": 1,
      "abort_incomplete_multipart_days": 1
    },
    "access": "private"
  }
}
```

---

## 15.5 FFmpeg Temporary Storage

### 15.5.1 Vấn đề

FFmpeg processing tạo ra lượng lớn temporary files trong quá trình:
- Video transcoding
- Audio extraction
- Thumbnail generation
- Preview rendering

Nếu không kiểm soát, temp files có thể chiếm hết disk space.

### 15.5.2 Giải pháp: Separate Volume với Size Limit

```yaml
# Docker volume với size constraint
ffmpeg-temp:
  driver: local
  driver_opts:
    type: tmpfs
    device: tmpfs
    o: "size=50g"  # Hard limit 50GB cho temp

# Hoặc sử dụng dedicated partition
# /data/aidilam/temp/ với quota enforcement
```

### 15.5.3 Auto-Cleanup Mechanism

```bash
#!/bin/bash
# /opt/aidilam/source/infrastructure/scripts/cleanup-ffmpeg-temp.sh

TEMP_DIR="/data/aidilam/temp"
MAX_AGE_HOURS=4
MAX_SIZE_GB=50

# Xóa files cũ hơn MAX_AGE_HOURS
find "$TEMP_DIR" -type f -mmin +$((MAX_AGE_HOURS * 60)) -delete

# Kiểm tra total size
CURRENT_SIZE=$(du -sg "$TEMP_DIR" | awk '{print $1}')
if [ "$CURRENT_SIZE" -gt "$MAX_SIZE_GB" ]; then
    # Xóa files cũ nhất cho đến khi dưới limit
    find "$TEMP_DIR" -type f -printf '%T+ %p\n' | \
        sort | head -n 100 | awk '{print $2}' | xargs rm -f
    echo "WARNING: FFmpeg temp exceeded ${MAX_SIZE_GB}GB, cleaned up oldest files"
fi
```

### 15.5.4 Cron Schedule

```cron
# Cleanup mỗi 15 phút
*/15 * * * * /opt/aidilam/source/infrastructure/scripts/cleanup-ffmpeg-temp.sh
```

---

## 15.6 Nguyên tắc Storage (Design Principles)

### 15.6.1 Originals Are Immutable

```
Rule: Một khi file original đã được lưu, KHÔNG process nào được phép:
  - Overwrite file
  - Modify content
  - Delete without explicit user action + audit log
```

Implementation:
- MinIO Object Lock (Governance mode)
- File permissions: `444` (read-only for all)
- Application-level enforcement trong upload service

### 15.6.2 Temp Storage phải Size-Controlled

```
Rule: Mọi temporary storage phải có:
  - Hard size limit (quota hoặc volume size)
  - Maximum age (auto-delete sau N giờ)
  - Monitoring alert khi > 80% capacity
```

### 15.6.3 Checksums cho Deduplication

```python
# Pseudocode cho dedup flow
def upload_file(file_stream):
    checksum = sha256(file_stream)
    
    existing = db.query("SELECT * FROM files WHERE checksum = ?", checksum)
    if existing:
        # File đã tồn tại, tạo reference thay vì duplicate
        return create_reference(existing.id, current_user)
    
    # File mới, lưu vào originals
    path = store_to_minio("aidilam-originals", file_stream, checksum)
    return create_file_record(path, checksum, current_user)
```

Lợi ích của deduplication:
- Tiết kiệm storage (đặc biệt khi nhiều user upload cùng file)
- Giảm backup size
- Faster upload (skip nếu đã có)

---

## 15.7 Cleanup Policies

### 15.7.1 Bảng Cleanup Rules

| Path/Bucket | Max Age | Max Size | Trigger | Action |
|-------------|---------|----------|---------|--------|
| `/data/aidilam/temp/` | 4 hours | 50GB | Cron 15min | Delete oldest files |
| `aidilam-temp` bucket | 24 hours | Unlimited | MinIO lifecycle | Auto-expire objects |
| `aidilam-exports` | 7 days | Unlimited | MinIO lifecycle | Auto-expire objects |
| `media/previews/` | 7 days (no access) | 100GB | Daily cron | Delete stale previews |
| `media/renders/` | Never (user-owned) | Unlimited | Manual only | User-initiated delete |
| `/data/aidilam/cache/` | LRU eviction | 20GB | Application | Evict least-recent |
| Docker images (unused) | 7 days | N/A | Weekly cron | `docker image prune` |

### 15.7.2 Cleanup Script Master

```bash
#!/bin/bash
# /opt/aidilam/source/infrastructure/scripts/storage-cleanup.sh
# Chạy daily via cron

set -euo pipefail
LOG="/var/log/aidilam/storage-cleanup.log"

log() { echo "$(date -Iseconds) $1" >> "$LOG"; }

# 1. FFmpeg temp cleanup
log "Starting temp cleanup"
find /data/aidilam/temp -type f -mmin +240 -delete
log "Temp cleanup done"

# 2. Preview cleanup (not accessed in 7 days)
log "Starting preview cleanup"
find /data/aidilam/media/previews -type f -atime +7 -delete
log "Preview cleanup done"

# 3. Cache eviction (keep under 20GB)
CACHE_SIZE=$(du -sg /data/aidilam/cache 2>/dev/null | awk '{print $1}')
if [ "${CACHE_SIZE:-0}" -gt 20 ]; then
    log "Cache over 20GB (${CACHE_SIZE}GB), evicting LRU"
    find /data/aidilam/cache -type f -printf '%A+ %p\n' | \
        sort | head -n 1000 | awk '{print $2}' | xargs rm -f
fi
log "Cache cleanup done"

# 4. Docker cleanup (on root LV)
log "Starting Docker cleanup"
docker image prune -a --filter "until=168h" -f >> "$LOG" 2>&1
docker builder prune --filter "until=168h" -f >> "$LOG" 2>&1
log "Docker cleanup done"

# 5. Report storage usage
log "=== Storage Report ==="
log "Root LV: $(df -h /opt/aidilam/source/ | awk 'NR==2{print $4}') free"
log "Data SAN: $(df -h /data/aidilam/ 2>/dev/null | awk 'NR==2{print $4}') free"
log "========================"
```

### 15.7.3 Monitoring & Alerts

```yaml
# Prometheus alerts cho storage
groups:
  - name: storage_alerts
    rules:
      - alert: RootLVSpaceLow
        expr: (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) < 0.2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Root LV space < 20% - Media có thể đang leak vào root"

      - alert: TempStorageHigh
        expr: node_filesystem_avail_bytes{mountpoint="/data/aidilam/temp"} < 5368709120
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "FFmpeg temp space < 5GB - Processing có thể bị block"

      - alert: SANSpaceLow
        expr: (node_filesystem_avail_bytes{mountpoint="/data/aidilam"} / node_filesystem_size_bytes{mountpoint="/data/aidilam"}) < 0.1
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "SAN storage < 10% remaining"
```

---

## 15.8 Capacity Planning

### 15.8.1 Ước tính Storage Growth

| Content Type | Avg Size | Daily Upload | Monthly Growth |
|-------------|----------|--------------|----------------|
| Video original (1080p, 10min) | 1.5GB | 50 files | ~2.25TB |
| Audio extracted | 150MB | 50 files | ~225GB |
| Thumbnails (per video) | 5MB | 50 sets | ~7.5GB |
| Transcripts | 500KB | 50 files | ~750MB |
| Renders (final) | 2GB | 30 files | ~1.8TB |
| **Total monthly growth** | | | **~4.3TB** |

### 15.8.2 SAN Capacity Timeline

```
Current:     13.6TB available
Month 1:     13.6TB - 4.3TB = 9.3TB remaining
Month 2:     9.3TB - 4.3TB = 5.0TB remaining
Month 3:     5.0TB - 4.3TB = 0.7TB remaining ⚠️ CRITICAL

→ Cần mở rộng SAN trước tháng thứ 3
→ Hoặc implement aggressive cleanup/archival policies
```

### 15.8.3 Giải pháp mở rộng

1. **Short-term**: Deduplication + cleanup policies giảm 30-40% growth
2. **Medium-term**: Tiered storage (hot/warm/cold) với archive to S3 Glacier
3. **Long-term**: SAN expansion hoặc migration sang distributed storage (Ceph)

---

## 15.9 Mount & Validation Checklist

### Trước khi đưa vào production, cần validate:

```bash
# 1. Verify SAN LUN visible
lsblk | grep -i san
multipath -ll

# 2. Format filesystem (nếu chưa)
mkfs.xfs /dev/mapper/san-data-lun

# 3. Mount point
mkdir -p /data/aidilam
mount /dev/mapper/san-data-lun /data/aidilam

# 4. Verify mount
df -h /data/aidilam
# Expected: ~13.6TB available

# 5. Add to fstab
echo "/dev/mapper/san-data-lun /data/aidilam xfs defaults,noatime 0 2" >> /etc/fstab

# 6. Create directory structure
mkdir -p /data/aidilam/{postgres/{data,wal},redis/{data,aof},qdrant/{collections,snapshots}}
mkdir -p /data/aidilam/minio
mkdir -p /data/aidilam/media/{originals,audio,thumbnails,transcripts,subtitles,voices,previews,renders}
mkdir -p /data/aidilam/{temp,cache}

# 7. Set permissions
chown -R 1000:1000 /data/aidilam/postgres
chown -R 999:999 /data/aidilam/redis
chown -R 1000:1000 /data/aidilam/minio
chmod 755 /data/aidilam/media/originals
```

---

## 15.10 Tổng kết

Storage architecture của AiDiLam tuân theo nguyên tắc:

1. **Separation of concerns**: Source code trên root LV, data trên SAN, backup riêng biệt
2. **Immutability**: Original files không bao giờ bị thay đổi
3. **Size control**: Mọi temp/cache đều có hard limit
4. **Deduplication**: Checksum-based để tránh lưu trữ trùng lặp
5. **Automated cleanup**: Cron jobs + MinIO lifecycle tự động dọn dẹp
6. **Monitoring**: Prometheus alerts cho mọi storage tier
7. **Capacity awareness**: 62GB root chỉ cho code, media PHẢI nằm trên SAN

> **Action items trước production:**
> - [ ] Validate SAN mount tại `/data/aidilam/`
> - [ ] Validate backup volume tại `/backup/aidilam/`
> - [ ] Configure MinIO buckets với lifecycle policies
> - [ ] Deploy cleanup cron jobs
> - [ ] Setup Prometheus storage alerts
> - [ ] Plan SAN expansion timeline (critical by month 3)
