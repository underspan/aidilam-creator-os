# 02 — Execution Plan

## Resolved Values (No Placeholders)

| Parameter | Value |
|-----------|-------|
| WWID | 360002ac000000000000000520001b366 |
| Multipath device | /dev/mapper/360002ac000000000000000520001b366 |
| Device size | 921.8G |
| Path count | 4 |
| Filesystem | XFS |
| VG name | aidilam_vg |
| Data LV | aidilam_data_lv (600G) |
| Backup LV | aidilam_backup_lv (200G) |
| VG reserve | ~122G (unallocated) |
| Data mount | /data/aidilam |
| Backup mount | /backup/aidilam |
| fstab identifier | UUID-based |
| fstab options | defaults,nofail |

## Execution Sequence

```bash
# Step 1: Create PV
pvcreate /dev/mapper/360002ac000000000000000520001b366

# Step 2: Create VG
vgcreate aidilam_vg /dev/mapper/360002ac000000000000000520001b366

# Step 3: Create LVs
lvcreate -L 600G -n aidilam_data_lv aidilam_vg
lvcreate -L 200G -n aidilam_backup_lv aidilam_vg

# Step 4: Create filesystems
mkfs.xfs -L AIDILAM_DATA /dev/aidilam_vg/aidilam_data_lv
mkfs.xfs -L AIDILAM_BACKUP /dev/aidilam_vg/aidilam_backup_lv

# Step 5: Create mount points
mkdir -p /data/aidilam
mkdir -p /backup/aidilam

# Step 6: Backup fstab
cp -a /etc/fstab /etc/fstab.pre-aidilam-YYYYMMDD-HHMMSS

# Step 7: Add fstab entries (UUID-based)
# UUID=<DATA_UUID>    /data/aidilam    xfs    defaults,nofail    0 2
# UUID=<BACKUP_UUID>  /backup/aidilam  xfs    defaults,nofail    0 2

# Step 8: Validate fstab
mount -fav

# Step 9: Mount
mount /data/aidilam
mount /backup/aidilam

# Step 10: Create directory layout
mkdir -p /data/aidilam/{postgres,redis,qdrant,minio,uploads,brightbean,media,logs}
mkdir -p /backup/aidilam/{postgres,qdrant,minio,configuration,releases}
```

## Rollback Commands (if needed)

```bash
# Unmount
umount /data/aidilam
umount /backup/aidilam

# Restore fstab
cp -a /etc/fstab.pre-aidilam-YYYYMMDD-HHMMSS /etc/fstab

# Remove LVs
lvremove -f /dev/aidilam_vg/aidilam_data_lv
lvremove -f /dev/aidilam_vg/aidilam_backup_lv

# Remove VG
vgremove aidilam_vg

# Remove PV
pvremove /dev/mapper/360002ac000000000000000520001b366

# Remove mount dirs
rmdir /data/aidilam /backup/aidilam
```
