# DEP-016A2 OAuth State Security

## Protections (all tested)
- State: 32-byte cryptographic random (test #1)
- Storage: SHA-256 hash only (test #2)
- PKCE: S256 challenge method (test #3)
- Expiry: 10-minute session TTL (test #20)
- Replay: consumed session rejected (test #19)
- CSRF: wrong state rejected (test #17)
- Cross-project: project mismatch rejected (test #18)
- Redirect: exact allowlist match (test #4, #13, #14)
- Fail-closed: missing config → error (test #13, #15)
