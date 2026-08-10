# AIĐiLàm Admin Scripts

Administrative utilities for the AIĐiLàm Creator OS platform.

**Location:** `/opt/aidilam/scripts/`

## Architecture

Scripts follow the AIĐiLàm deployment model:

- **Host requires only Docker** — no Node.js, npm, Python, or other runtimes
- All application logic executes inside AIĐiLàm containers via `docker exec`
- Scripts auto-detect execution context (host vs workspace container)
- Workspace container access uses SSH to the host for Docker commands

## Scripts

### reset_owner_password.sh

Resets the password for the DEV owner account (`owner@aidilam.dev`).

**Usage:**
```bash
# On the host (Docker only, no Node.js required):
bash /opt/aidilam/scripts/reset_owner_password.sh

# Inside the workspace container (uses SSH to host):
bash /opt/aidilam/scripts/reset_owner_password.sh
```

**Behavior:**
1. Prompts for new password (hidden input, no echo)
2. Requires confirmation
3. Enforces minimum 8 characters
4. Hashes with scrypt inside the `aidilam-app` container (Node.js lives there)
5. Updates the database via the `aidilam-postgres` container
6. Revokes all prior sessions (forces re-login)
7. Prints: "Password updated successfully."
8. Exits non-zero on any failure

**Host requirements:**
- Docker (to reach aidilam-app and aidilam-postgres containers)
- `/opt/aidilam/secrets/postgres_migrator_password` (or accessible inside app container)
- Bash

**Does NOT require on host:**
- Node.js
- npm / pnpm
- Python
- Any application runtime

**Security:**
- Password never written to files
- Password never in shell history (`read -s`)
- Password hashing executes inside the app container (not on host)
- Hash cleared from shell memory after DB update
- All sessions revoked after password change
- No plaintext artifacts created

## Guidelines

- Admin scripts live in `/opt/aidilam/scripts/` only
- Never place utilities in `/tmp`
- All scripts must be executable (`chmod +x`)
- No script may create plaintext password/secret files
- No script may require runtimes beyond Docker on the host
- No script may modify production without explicit confirmation
- All scripts must exit non-zero on failure
