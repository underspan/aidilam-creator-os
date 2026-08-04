# Mount Persistence

All active mounts have fstab entries:

- /dev/rootvg/rootlv → / (ext4)
- /dev/rootvg/swaplv → swap
- UUID=53DB-7D23 → /boot/efi (vfat)
- /dev/hana/data → /hana/data (xfs)
- /dev/hana/log → /hana/log (xfs)
- /dev/hana/shared → /hana/shared (xfs)
- /dev/backup/backup → /backup (ext4)
- 10.0.2.83:/usr/sap → /usr/sap (nfs)
- 10.0.2.83:/sapmnt → /sapmnt (nfs)

**Persistence:** All mounts will survive reboot.

The unused 922G SAN LUN has no fstab entry (expected).
