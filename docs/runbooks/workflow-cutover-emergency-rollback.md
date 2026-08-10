# Workflow Cutover Emergency Rollback

## SEV-1 Triggers (Immediate Rollback)
- Cross-tenant workflow execution
- Duplicate primary side effect (asset/review created twice)
- Primary false-success (usage committed without actual completion)
- Credential leakage in execution context
- Execution snapshot mismatch (mode changed mid-flight)

## SEV-2 Triggers (Evaluate + Rollback)
- Failure rate > threshold for >5 minutes
- Mismatch rate > 5% sustained
- Stuck primary executions > 0 for >10 minutes
- Recovery loop on primary path

## Immediate Actions

### 1. Stop New Primary Admission
```typescript
triggerEmergencyRollback();
// Config: WORKFLOW_EMERGENCY_ROLLBACK=true
```

### 2. Preserve Active Executions
- DO NOT rewrite execution snapshots
- DO NOT delete queues
- Active primary executions finish with their pinned mode
- Active shadow executions continue normally

### 3. New Requests → Shadow
After rollback trigger, all new executions route to shadow.
Verified by: `resolveExecutionRoute()` returns `decision='shadow'`

### 4. Capture Evidence
```sql
-- Active executions at rollback time
SELECT id, execution_mode, status, current_node_key
FROM aidilam_app.wf_executions WHERE status IN ('prepared','running');

-- Recent audit
SELECT * FROM aidilam_app.wf_execution_audit
WHERE created_at > now() - interval '30 minutes'
ORDER BY created_at DESC;
```

### 5. Verify No Duplicate Side Effects
```sql
-- Check for duplicate canonical outputs from primary
SELECT execution_id, count(*)
FROM aidilam_app.wf_shadow_artifacts
WHERE artifact_type='canonical_output'
GROUP BY execution_id HAVING count(*) > 1;
```

## Post-Rollback Reconciliation
1. Wait for all active primary executions to reach terminal state
2. Verify no stuck executions remain
3. Run recovery scheduler once
4. Check tenant isolation (cross-project audit query)
5. Verify canonical asset counts unchanged from shadow

## Recovery and Resume
1. Fix root cause
2. Deploy fix
3. Clear rollback: `clearEmergencyRollback()`
4. Resume at previous safe canary percentage (or lower)
5. Extended observation window (2x normal)

## What NOT To Do
- DO NOT manually UPDATE execution_mode in DB
- DO NOT delete queue items (they self-resolve)
- DO NOT stop worker (let active executions finish)
- DO NOT force-kill running node handlers
- DO NOT revert execution snapshots
