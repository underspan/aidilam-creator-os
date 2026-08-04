# Block Storage, SAN & LVM

**Local disk:** sda (111.8G, LOGICAL VOLUME) - contains rootvg

## SAN LUNs (3PAR storage)

| Multipath ID | Size | VG | Status |
|-------------|------|-----|--------|
| 360002ac...480001b366 | 1000G | backup | Fully allocated |
| 360002ac...440001b366 | 1.5T | hana | Fully allocated |
| 360002ac...520001b366 | 922G | NONE | UNUSED - no FS, no LVM, no mount |

**Multipath:** 4 paths per LUN (round-robin, ALUA)

## LVM

| VG | PV | Size | Free |
|----|-----|------|------|
| rootvg | /dev/sda2 | 110.75G | 8MB |
| backup | 3PAR...480 | 699.81G | 0 |
| hana | 3PAR...440 | 1.50T | 0 |

**LVs:** rootlv (90.74G), swaplv (20G), backup (699.81G), data (1024G), log (212G), shared (300G)

## Key Finding

922G SAN LUN is completely unused and available for AIĐiLàm
