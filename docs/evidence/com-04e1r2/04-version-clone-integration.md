# COM-04E1R2 Evidence 04: Version & Clone Integration

## Create Version Integration
- Route: `POST /api/v1/workspaces/:wsId/workflows/:wfId/versions`
- File: `apps/api/src/modules/workflow/routes.ts` line ~135
- Calls `validateWorkflowVersion(spec)` before any DB INSERT
- If `!validation.valid` → returns error with details, no persistence

### Proven via Live HTTP:
- User-A created version on own workspace clone: SUCCESS
- Invalid version (missing review): REJECTED (WORKFLOW_VALIDATION_FAILED)
- System workflow version create: DENIED (ACCESS_DENIED)

## Clone Integration
- Route: `POST /api/v1/workspaces/:wsId/workflows/:wfId/clone`
- File: `apps/api/src/modules/workflow/routes.ts` line ~240
- Loads source nodes/edges → calls `validateWorkflowVersion(spec)` → only then persists
- If source fails validation → returns WORKFLOW_VALIDATION_FAILED, no clone persisted

### Proven via Live HTTP:
- Clone system workflow into WS-A: SUCCESS (def=252b0a8d...)
- Validator metadata returned with clone response
- No separate validation implementation exists for clone path

## Authorization Chain (both routes):
Session → User → Workspace Membership → Workflow Ownership Check → Validator → Persistence
