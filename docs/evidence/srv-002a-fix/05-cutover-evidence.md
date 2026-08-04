# 05 — Cutover Evidence

## Status: PENDING — Cutover Not Yet Executed

Cutover is blocked pending operator execution on the SUSE host.

## Pre-Cutover Preparations Completed

- [x] Replacement Dockerfile created and validated
- [x] Compose configuration created and validated
- [x] Cutover script written and placed on host-accessible path
- [x] Rollback script written
- [x] Validation script written
- [x] SSH keys preserved to host filesystem
- [x] Kiro settings preserved to host filesystem
- [x] Current container state fully documented

## Evidence To Be Captured During Cutover

The cutover script will automatically capture:
- Pre-cutover container list → /opt/aidilam/docs/evidence/srv-002a-fix/pre-cutover-containers.txt
- Pre-cutover networks → /opt/aidilam/docs/evidence/srv-002a-fix/pre-cutover-networks.txt
- Pre-cutover volumes → /opt/aidilam/docs/evidence/srv-002a-fix/pre-cutover-volumes.txt
- Pre-cutover images → /opt/aidilam/docs/evidence/srv-002a-fix/pre-cutover-images.txt
- Current container inspect (sanitized) → /opt/aidilam/docs/evidence/srv-002a-fix/current-container-inspect-sanitized.json
- Underspan baseline → /opt/aidilam/docs/evidence/srv-002a-fix/underspan-baseline.txt
- Underspan post-cutover → /opt/aidilam/docs/evidence/srv-002a-fix/underspan-after-cutover.txt

## Post-Cutover Actions Required

After successful cutover, the operator should:
1. Run validation script inside new container
2. Verify Kiro CLI works (may need re-authentication)
3. Document Docker inventory (Phase E items 22-24)
4. Confirm Underspan dev server restart if needed
