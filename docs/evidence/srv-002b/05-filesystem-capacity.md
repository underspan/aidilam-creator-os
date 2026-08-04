# Filesystem Capacity

| Filesystem | Type | Size | Used | Avail | Use% | Mount |
|-----------|------|------|------|-------|------|-------|
| rootvg-rootlv | ext4 | 90G | 28G | 61G | 32% | / |
| sda1 | vfat | 1.1G | 4.6M | 1021M | 1% | /boot/efi |
| backup-backup | ext4 | 689G | 158G | 531G | 23% | /backup |
| hana-data | xfs | 1.0T | 302G | 723G | 30% | /hana/data |
| hana-log | xfs | 212G | 60G | 153G | 29% | /hana/log |
| hana-shared | xfs | 300G | 13G | 287G | 5% | /hana/shared |
| 10.0.2.83:/sapmnt/ | nfs | 45G | 16G | 30G | 36% | /sapmnt |
| 10.0.2.83:/usr/sap/ | nfs | 111G | 74G | 38G | 66% | /usr/sap |

## Notes

- /opt is on rootvg-rootlv (61G available)
- /var/lib/docker is on rootvg-rootlv (shared with /opt)
- No separate /data filesystem exists
- Inode usage: 6% on root (5.4M free)
