# A5.3: SecretStore Decision

## Current State
- Interface: `SecretStore` (putSecret, getSecret, rotateSecret, revokeSecret, deleteSecret, healthCheck)
- Implementation: `FakeSecretStore` (in-memory, test only)
- Production factory: throws "not configured" (fail-closed)
- DB stores opaque references only (never raw tokens)

## Classification

| Backend | Classification | Use Case |
|---------|---------------|----------|
| HashiCorp Vault | **Preferred production target** | Full rotation, audit, HA, policy |
| Google Secret Manager | Acceptable alternative | If Google Cloud is operational dependency |
| Encrypted PostgreSQL | **Fallback only** | Requires envelope encryption, external master-key custody, rotation and audit controls |
| Docker/file-backed encrypted | **Sandbox-only temporary** | Master key outside DB and Git; migration-ready |
| FakeSecretStore | **Tests only** | In-memory, no persistence |

## Sandbox Solution: Encrypted File/Docker-Backed Store

### Design
- Encryption: AES-256-GCM
- Master key: stored as Docker secret on host (NOT in database, NOT in Git)
- Encrypted values: stored in a local file or dedicated table
- Reference format: `sandbox-secret:<uuid>`
- Explicitly temporary: designed to migrate to Vault

### Why Not Encrypted PostgreSQL for Production
- Master key custody: who rotates the encryption key?
- No hardware security module backing
- No native access policy beyond DB permissions
- No independent audit trail (relies on application logging)
- Single point of failure if DB is compromised
- Acceptable for sandbox; insufficient for production credential custody

### Migration Path
1. **Tests**: FakeSecretStore (in-memory) ← current
2. **Sandbox**: Encrypted file/Docker-backed ← A5.2 implementation
3. **Production**: HashiCorp Vault ← target
4. Interface unchanged across all backends (swap implementation only)

## Production Target: HashiCorp Vault

### Why Vault
- Native secret rotation
- Fine-grained access policy
- Independent audit log
- HA deployment options
- Token-based or AppRole authentication
- Docker sidecar pattern fits current architecture
- Industry standard for credential management

### Evaluation Threshold
- Move to Vault when: production publishing is approved
- Or when: >1 active credential binding exists
- Or when: owner requests elevated security posture

## Implementation Design (A5.2 slice)
```typescript
// Sandbox
class EncryptedFileSecretStore implements SecretStore {
  constructor(encryptionKey: Buffer, storagePath: string) {}
  // AES-256-GCM encrypt/decrypt
  // Key loaded from AIDILAM_SECRET_ENCRYPTION_KEY Docker secret
  // File-backed: JSON file with encrypted entries
}

// Production (future)
class VaultSecretStore implements SecretStore {
  constructor(vaultAddr: string, vaultToken: string) {}
  // HTTP API to HashiCorp Vault
  // AppRole or Token auth
  // KV v2 secrets engine
}
```

## Security Requirements
- Master key: 256-bit, loaded from environment/Docker secret, never in DB or Git
- No plaintext secret stored anywhere
- Key rotation: re-encrypt all secrets with new key (offline tool)
- Audit: all putSecret/rotateSecret/revokeSecret logged
- Fail-closed: missing key or unavailable store = all operations fail

## Owner Decisions (Approved Defaults)
- Sandbox: encrypted file/Docker-backed (APPROVED DEFAULT)
- Production: HashiCorp Vault (APPROVED DEFAULT)
- Master key delivery: Docker secret on host

## No secrets created. No SecretStore implemented yet.
