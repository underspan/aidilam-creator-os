# AIĐiLàm Model Routing Rules

## ⚠️ CRITICAL — Zero Hardcode Policy

- runtimeModelHardcodeCount = 0 (enforced)
- runtimeProviderHardcodeCount = 0 (enforced)
- uiModelHardcodeCount = 0 (enforced)
- uiProviderHardcodeCount = 0 (enforced)
- No model name (e.g., "gpt-4", "claude-3") as runtime default in code
- No provider name (e.g., "openai", "anthropic") as runtime default in code
- Display-only labels in docs/comments are acceptable; runtime values are NOT

## ModelConfig — Single Source of Truth

- ModelConfig records live in PostgreSQL database
- Each ModelConfig defines: modelId, provider, endpoint, capabilities, limits
- Application code references models by capability/role, NEVER by name
- Example roles: "translation", "summarization", "embedding", "tts"
- Role → ModelConfig resolution happens at runtime from database

## RoutingProfile — Dynamic Resolution

- RoutingProfile defines which ModelConfig to use for each role
- RoutingProfiles are workspace-scoped and admin-configurable
- Active RoutingProfile loaded from database on each request
- Cached with short TTL (≤60s); cache invalidated on profile change
- Switching models = update RoutingProfile row, zero code changes

## Fail-Closed Routing

- If RoutingProfile cannot be resolved → REQUEST FAILS (no fallback to hardcoded)
- If ModelConfig is missing for a role → REQUEST FAILS with specific error
- If provider endpoint is unreachable → RETRY then FAIL (no silent fallback)
- Never silently degrade to a different model without explicit routing rule

## Browser Is Not Authoritative

- Client/UI may display model names for UX purposes only
- Client NEVER sends model selection that server trusts blindly
- Server re-resolves the active RoutingProfile from database on every request
- Any mismatch between client hint and server resolution → use server resolution

## Prompt Integrity

- Prompt checksum/hash EXCLUDES model info (model name, provider, endpoint)
- Same prompt produces same checksum regardless of routing target
- Prompt templates stored separately from routing configuration

## RoutingAnalytics — Immutable Records

- Every invocation logs: timestamp, role, modelId, provider, latency, tokens, cost
- RoutingAnalytics records are append-only and immutable
- No updates or deletes on analytics rows
- Retention: minimum 180 days

## Required Error Codes

- ROUTING_PROFILE_NOT_FOUND: No active RoutingProfile for workspace
- MODEL_CONFIG_MISSING: Role has no ModelConfig in active profile
- PROVIDER_UNREACHABLE: Endpoint failed after retries
- MODEL_QUOTA_EXCEEDED: Usage limit hit for ModelConfig
- ROUTING_RESOLUTION_FAILED: Generic routing failure (include details)
- INVALID_ROUTING_HINT: Client sent unrecognized role or model hint

## Implementation Rules

- Routing logic lives in Application layer (not Infrastructure)
- Provider adapters in Infrastructure layer receive resolved ModelConfig
- Unit tests MUST verify no hardcoded model/provider strings exist
- CI/CD lint rule: grep for known model names in runtime code → fail build

## Anti-Patterns (REJECT these)

- ❌ Hardcoded model names as defaults (e.g., `model: "gpt-4"`)
- ❌ Hardcoded provider names as defaults (e.g., `provider: "openai"`)
- ❌ Fallback to a specific model when routing fails
- ❌ Client-selected model trusted without server re-resolution
- ❌ Prompt checksums that include model/provider info
- ❌ Mutable or deletable routing analytics records
- ❌ Environment variables as model defaults (use DB RoutingProfile)
