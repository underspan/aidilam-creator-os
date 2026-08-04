# ADR-012: SAN Media Storage

## Metadata

| Field | Value |
|-------|-------|
| ADR ID | ADR-012 |
| Trạng thái | Accepted |
| Ngày tạo | 2026-07-23 |
| Người đề xuất | Infrastructure Team |
| Phạm vi | Storage Architecture, Media Pipeline, DevOps |

## Status

**Accepted** — Áp dụng cho toàn bộ media storage infrastructure.

## Context

Hệ thống AIDiLam xử lý lượng lớn media assets: video 4K/8K, audio recordings, high-res
images, và rendered output từ AI pipeline. Dung lượng tăng 500GB-2TB mỗi tháng.

Vấn đề chính:
- Root LV chỉ 50-200GB — media files (10-50GB/file) nhanh chiếm hết
- Disk full trên root LV crash toàn bộ OS, logs, containers
- Source code cần IOPS cao (random I/O), media cần throughput cao (sequential I/O)
- Backup strategy khác nhau: code (incremental, frequent) vs media (bulk, less frequent)
- Cần expand storage mà không ảnh hưởng system uptime

## Decision

**Large media assets stored on SAN-backed volumes, not root LV. Source code on root LV.**

1. Media assets (video, audio, images >10MB) lưu trên SAN-backed volumes
2. SAN volumes mount tại `/mnt/san/media` với XFS filesystem
3. Source code, config, binaries ở root LV (`/opt/aidilam/`)
4. SAN sử dụng thin provisioning để optimize storage utilization
5. Mount point có quota enforcement prevent runaway processes
6. Multipath I/O configured cho high availability

## Alternatives

| Alternative | Lý do từ chối |
|-------------|---------------|
| Root LV với LVM extend | Không scale, single point of failure, mixed I/O patterns |
| NFS-based network storage | Performance overhead, single-threaded daemon, latency |
| Object storage (MinIO/S3) | Không phù hợp video editing cần POSIX filesystem |
| Local RAID array | Không share giữa nodes, capacity planning khó |

## Consequences

### Tích cực
- Root LV bảo vệ khỏi media growth — hệ thống ổn định
- Enterprise-grade redundancy (RAID, dual controllers)
- Online LUN expansion không cần downtime
- Backup media independent khỏi system backup
- Performance tối ưu cho từng workload type

### Tiêu cực
- Tăng infrastructure complexity
- Cần SAN administration expertise
- Chi phí cao hơn local storage
- Network dependency — SAN fabric down thì media unavailable
- Monitoring riêng cho SAN health

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SAN fabric failure | Low | Critical | Dual fabric, multipath I/O |
| Network congestion | Medium | High | Dedicated storage VLAN (FC/iSCSI) |
| Mount unavailable sau reboot | Low | High | systemd mount units, fstab nofail |
| Data corruption | Low | High | XFS journal, UPS protection |
| Capacity planning sai | Medium | Medium | Thin provisioning, alerts at 80% |

## Validation

1. **Mount**: SAN volume mounted correctly sau mỗi reboot
2. **Performance**: Sequential read/write ≥500MB/s trên SAN volume
3. **Isolation**: Full SAN KHÔNG ảnh hưởng root LV operations
4. **Failover**: Multipath failover <30 seconds
5. **Monitoring**: Alerts khi usage >80% hoặc latency >10ms

Kiểm tra: `fio` benchmarks, chaos testing (disconnect path), fill test, reboot test.

## Rollback

### Quy trình rollback

1. Provision local storage đủ capacity
2. Schedule maintenance window
3. Stop media-processing services
4. `rsync --archive --progress /mnt/san/media/ /mnt/local/media/`
5. Update mount configuration (mount point giữ nguyên — app không đổi)
6. Verify integrity, restart services

### Trigger rollback
- SAN availability <99.9% trong 30 ngày
- Latency consistently >20ms
- Chi phí vượt 3x alternative solutions
- Vendor support không đáp ứng SLA

---
*Architecture Decision Record — Dự án AIDiLam*
