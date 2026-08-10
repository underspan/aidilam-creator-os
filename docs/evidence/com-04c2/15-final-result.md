# COM-04C2 Evidence 15: Final Result

## Status: PASS — Template Runtime Integration Proven

## What Was Achieved
- Migration 024: `template_id`, `template_version_id`, `effective_config_json` on jobs table
- API accepts `templateId` in pipeline creation request
- Template resolved from DB (active templates only)
- Effective config built: template + user overrides merged
- Job persists immutable template snapshot (ID + version + effective config)
- Start from Scratch still works (template_id = NULL)
- Studio passes templateId via URL parameter

## Real Template-Driven Pipeline
- Template: Vertical Short 9:16 (`a0000000-0001-4000-a000-000000000001`)
- Version: v1 (`b0000000-0001-4000-a000-000000000001`)
- Job: `e0ffc0b0-40f7-4a79-b4c4-79760a21b422`
- Status: **succeeded (100%, review_ready)**
- Config snapshot persisted: ✓
- Provider governance preserved: ✓

## Version Immutability
- Job stores `template_version_id` at creation time
- Future template edits create new versions (UNIQUE template_id + version)
- Job's snapshot is never mutated by template updates
- Effective config JSON frozen at job creation

## Config Precedence
```
System defaults
→ Template version config
→ User overrides (voice, language, resolution)
→ Validated effective config
→ Persisted with job
```

## Provider Governance
- Templates use `provider_mode: workspace_default`
- No provider bypass in template config
- Resolver still called at runtime: STT → Translation → TTS → Render

## Security
- templateId validated against active templates
- Invalid/disabled template: config ignored, defaults used
- No arbitrary config injection (schema validated)
- No provider adapter key in template
- CSRF enforced on submission
- Project RBAC enforced

## Build/Test
- API: 320 passed ✓
- Worker: 23 passed ✓
- Build: tsc clean ✓
- Publishing: disabled
- Production: unchanged
