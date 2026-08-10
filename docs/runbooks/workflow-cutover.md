# Workflow Cutover Runbook

## Purpose
Controlled transition from shadow workflow execution to primary workflow execution.

## Preconditions
- COM-04E3 shadow executor proven (3 matched pairs PASS)
- Cutover routing service deployed
- Metrics/alerting ready
- Emergency rollback tested

## Baseline Checks
1. All shadow executions healthy (no stuck/stale)
2. Shadow/legacy parity acceptable
3. Worker healthy, queue empty
4. No active emergency rollback

## Progression

### SHADOW_ONLY (current)
- All executions use shadow executor
- No primary side effects
- Validate: shadow success rate, duration, output quality

### CANARY 1% (canaryBasisPoints=100)
- ~1% of eligible executions route to primary
- Compare primary vs shadow output
- Monitor: mismatch rate, failure rate, latency

### CANARY 5% (canaryBasisPoints=500)
- Increase after observation window
- Gate: mismatch<=1%, failure regression<=1pp

### CANARY 25% (canaryBasisPoints=2500)
- Gate: min 50 primary executions, all metrics stable

### CANARY 50% (canaryBasisPoints=5000)
- Gate: min 200 primary executions, no cross-tenant violations

### PRIMARY 100% (systemDefault='PRIMARY')
- All executions primary
- Shadow comparison may continue for safety

## Promotion Gate Checklist
- [ ] Minimum execution count met
- [ ] Observation window elapsed (recommended: 24h per stage)
- [ ] Mismatch rate <= 1%
- [ ] Failure regression <= +1pp
- [ ] Retry regression <= +2pp
- [ ] Cross-tenant violations = 0
- [ ] Duplicate primary side effects = 0
- [ ] Stuck executions = 0
- [ ] P95 latency within 2x baseline

## Metrics to Inspect
- `workflow_cutover_primary_total` vs `shadow_total`
- `workflow_cutover_mismatch_total`
- `workflow_cutover_primary_failure_total`
- `workflow_cutover_rollback_total`

## Failure Handling
- Individual primary failure: retry using pinned mode
- Systematic failure: trigger emergency rollback
- Cross-tenant violation: immediate SEV-1 + rollback

## Rollback Trigger
```
setCutoverConfig({ emergencyRollback: true })
```
or environment variable: `WORKFLOW_EMERGENCY_ROLLBACK=true`

## Rollback Command
```typescript
import { triggerEmergencyRollback } from './cutover-routing';
triggerEmergencyRollback();
// New executions → shadow
// Existing pinned executions finish as-is
```

## Post-Rollback
1. Investigate root cause
2. Fix issue
3. Clear rollback: `clearEmergencyRollback()`
4. Resume from previous canary stage
5. Verify no duplicate side effects

## Final 100% Promotion
After sustained PRIMARY at 100% with acceptable metrics:
- Remove canary comparison overhead (optional)
- Deprecate legacy executor (future COM-04E5)
- Document final steady state
