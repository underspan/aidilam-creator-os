# AIĐiLàm Resource Allocation

## Host Capacity

| Resource | Total | Reserved (host/SAP/Underspan) | Available for AIĐiLàm |
|----------|-------|-------------------------------|----------------------|
| CPU | 64 threads | 50% headroom | 32 threads max |
| RAM | 251 GB | 25% headroom (~63 GB) | ~188 GB max |
| Data storage | 600 GB | — | 600 GB |
| Backup storage | 200 GB | — | 200 GB |
| VG reserve | 121.73 GB | — | Future expansion |

## Initial Allocation Target

| Resource | Ceiling |
|----------|---------|
| CPU | 8 cores |
| Memory | 32 GB |
| Data | 600 GB |
| Backups | 200 GB |

## Per-Service Estimates (future)

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| PostgreSQL | 2 cores | 8 GB | 50-200 GB |
| Redis | 0.5 cores | 2 GB | 2-8 GB |
| Qdrant | 1 core | 4 GB | 10-50 GB |
| MinIO | 1 core | 2 GB | 200-500 GB |
| Next.js | 1 core | 2 GB | — |
| Workers (Python) | 2 cores | 8 GB | — |
| Foundation canary | 0.5 cores | 256 MB | — |

## Operational Headroom Rules

- Root filesystem must remain above 30 GB free at all times
- Docker images/layers consume root FS space
- Monitor with: `df -hT /` after each deployment
- If root FS drops below 30 GB, stop non-essential containers immediately

## Storage Paths

| Path | Filesystem | Size | Purpose |
|------|-----------|------|---------|
| /data/aidilam | XFS (aidilam_vg/aidilam_data_lv) | 600 GB | Application data |
| /backup/aidilam | XFS (aidilam_vg/aidilam_backup_lv) | 200 GB | Backups |
| /opt/aidilam | ext4 (rootvg/rootlv) | shared 61 GB | Source and config |
| /var/lib/docker | ext4 (rootvg/rootlv) | shared 61 GB | Docker layers/images |
