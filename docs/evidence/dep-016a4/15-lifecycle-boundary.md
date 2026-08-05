# DEP-016A4 Evidence 15: Lifecycle Boundary

## Status: PROVEN

## Classification of States

### Upload Session States (A4 domain)
- initializing → ready → uploading → completing → **uploaded**
- uploading → interrupted → retry_wait → uploading (retry)
- any active → cancelled / failed / expired
- uploaded = "all bytes accepted and finalized by YouTube"
- uploaded ≠ "publicly published"

### Publishing Attempt States (existing lifecycle)
- queued → running → succeeded / retryable_failed / permanent_failed / cancelled
- YouTube upload adapter would return `{ pending: true }` on upload completion

### Publishing Job States (existing lifecycle)
- draft → scheduled → queued → publishing → polling → succeeded / failed / cancelled
- Upload completion enters `polling` stage, NOT `succeeded`

### Platform Processing/Polling State (deferred to A5)
- YouTube processes video after upload (transcoding, moderation)
- Final `succeeded` requires poll confirmation from YouTube
- This is the A5 handoff point

## Lifecycle Boundary Rules

| Event | Upload Session | Attempt | Job |
|-------|---------------|---------|-----|
| Upload starts | ready → uploading | running | publishing |
| All bytes uploaded | completing → uploaded | running | publishing (stage: polling) |
| YouTube processing done | — | succeeded | succeeded |
| Upload fails | → failed | retryable/permanent_failed | retry_wait / failed |
| Cancelled | → cancelled | cancelled | cancelled |

## Key Proofs
1. Upload session completes with status `uploaded` (not `succeeded`) ✓
2. `uploaded` is distinct from publishing job `succeeded` ✓
3. Fake adapter returns `{ pending: true }` → worker enters polling ✓
4. No public URL claim from upload completion ✓
5. Completion transition exactly once (double finalize blocked) ✓
6. Polling handoff available (A5) ✓
7. No real publication event emitted ✓

## Current Worker Guard
```typescript
if (!adapterKey.startsWith('mock')) {
  await settleFailure(..., 'PUBLISHING_ADAPTER_DISABLED', ...);
  return;
}
```
YouTube real adapter is blocked. No premature publication possible.

## Publishing lifecycle does not overstate external publication.
## Polling handoff remains deferred to A5.
## Fake transport only. No Google/YouTube calls.
## Production unchanged.
