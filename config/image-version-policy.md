# AIĐiLàm Image Version Policy

## Active Images

| Service | Image | Tag | Digest (ID) | Arch | Status |
|---------|-------|-----|-------------|------|--------|
| PostgreSQL | postgres | 16.9-bookworm | sha256:00d06ace1e0b... | linux/amd64 | Active |
| Redis | redis | 7.4.4-bookworm | sha256:17c1c1b96fd1... | linux/amd64 | Active |

## Version Pinning Rules

- All images must use explicit version tags (e.g., `16.9-bookworm`, not `latest` or `16`)
- Floating tags (`latest`, `alpine`, `stable`) are prohibited
- Digests should be recorded at deployment time for audit
- Architecture must be `linux/amd64`

## Upgrade Process

1. Review release notes and changelog
2. Test new version in isolation (separate container, no production data)
3. Verify SLES kernel compatibility through Docker
4. Create backup before upgrade
5. Update pinned version in compose.yaml
6. Deploy with rollback plan ready
7. Run functional validation

## Rollback Version

| Service | Rollback Image | Notes |
|---------|---------------|-------|
| PostgreSQL | postgres:16.9-bookworm | Current initial version |
| Redis | redis:7.4.4-bookworm | Current initial version |

## Vulnerability Review

- Check monthly for CVEs affecting active images
- Critical CVEs require immediate upgrade assessment
- Use `docker scout` or equivalent scanning when available

## Compatibility Notes

- Host kernel: 4.4.73-7-default (SLES 12 SP3, 2017)
- Docker Engine: 26.1.4
- Known kernel warnings: No swap limit support, No kernel memory TCP limit support
- Bookworm-based images use glibc compatible with this kernel version
