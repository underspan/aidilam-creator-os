/**
 * Workflow Cutover Routing Service
 * AIDILAM-COM-04E4
 *
 * Server-authoritative cutover control. Client cannot select execution mode.
 * Deterministic canary assignment based on stable hash.
 * Fail-closed: unknown/missing config → SHADOW_ONLY.
 */
import { createHash } from 'node:crypto';

// === CUTOVER MODES ===
export type CutoverMode = 'DISABLED' | 'SHADOW_ONLY' | 'CANARY' | 'PRIMARY' | 'ROLLBACK';
export type ExecutionRoutingDecision = 'shadow' | 'primary';

export interface CutoverConfig {
  systemDefault: CutoverMode;
  emergencyRollback: boolean;
  canaryBasisPoints: number; // 0-10000 (0% to 100%)
  canarySeed: string;
  tenantOverrides: Map<string, CutoverMode>;
  workflowOverrides: Map<string, CutoverMode>;
  workflowVersionOverrides: Map<string, CutoverMode>;
  tenantDenylist: Set<string>;
}

export interface RoutingInput {
  tenantId: string;
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  requestCorrelationKey?: string;
}

export interface RoutingResult {
  decision: ExecutionRoutingDecision;
  mode: CutoverMode;
  reason: string;
  policyVersion: string;
  timestamp: Date;
}

// Default fail-closed config
const DEFAULT_CONFIG: CutoverConfig = {
  systemDefault: 'SHADOW_ONLY',
  emergencyRollback: false,
  canaryBasisPoints: 0,
  canarySeed: 'aidilam-cutover-seed-v1',
  tenantOverrides: new Map(),
  workflowOverrides: new Map(),
  workflowVersionOverrides: new Map(),
  tenantDenylist: new Set(),
};

let currentConfig: CutoverConfig = { ...DEFAULT_CONFIG };
let policyVersion = '1.0.0';

/**
 * Resolve cutover routing decision. Server-authoritative, deterministic.
 * Resolution order: emergency → denylist → version override → workflow override → tenant override → canary → default
 */
export function resolveExecutionRoute(input: RoutingInput): RoutingResult {
  const now = new Date();

  // 1. Emergency rollback override
  if (currentConfig.emergencyRollback) {
    return { decision: 'shadow', mode: 'ROLLBACK', reason: 'emergency_rollback_active', policyVersion, timestamp: now };
  }

  // 2. Tenant denylist (always shadow)
  if (currentConfig.tenantDenylist.has(input.tenantId)) {
    return { decision: 'shadow', mode: 'SHADOW_ONLY', reason: 'tenant_denylisted', policyVersion, timestamp: now };
  }

  // 3. Workflow-version override (most specific)
  const versionMode = currentConfig.workflowVersionOverrides.get(input.workflowVersionId);
  if (versionMode) {
    return { decision: modeToDecision(versionMode, input), mode: versionMode, reason: 'workflow_version_override', policyVersion, timestamp: now };
  }

  // 4. Workflow override
  const workflowMode = currentConfig.workflowOverrides.get(input.workflowId);
  if (workflowMode) {
    return { decision: modeToDecision(workflowMode, input), mode: workflowMode, reason: 'workflow_override', policyVersion, timestamp: now };
  }

  // 5. Tenant override
  const tenantMode = currentConfig.tenantOverrides.get(input.tenantId);
  if (tenantMode) {
    return { decision: modeToDecision(tenantMode, input), mode: tenantMode, reason: 'tenant_override', policyVersion, timestamp: now };
  }

  // 6. System default
  const sysMode = currentConfig.systemDefault;
  return { decision: modeToDecision(sysMode, input), mode: sysMode, reason: 'system_default', policyVersion, timestamp: now };
}

function modeToDecision(mode: CutoverMode, input: RoutingInput): ExecutionRoutingDecision {
  switch (mode) {
    case 'DISABLED':
    case 'SHADOW_ONLY':
    case 'ROLLBACK':
      return 'shadow';
    case 'PRIMARY':
      return 'primary';
    case 'CANARY':
      return isCanarySelected(input) ? 'primary' : 'shadow';
    default:
      return 'shadow'; // fail-closed
  }
}

/**
 * Deterministic canary selection. Same input → same decision.
 * Uses stable hash of tenant + workflow + seed.
 */
function isCanarySelected(input: RoutingInput): boolean {
  if (currentConfig.canaryBasisPoints <= 0) return false;
  if (currentConfig.canaryBasisPoints >= 10000) return true;

  const hashInput = `${input.tenantId}:${input.workflowId}:${currentConfig.canarySeed}`;
  const hash = createHash('sha256').update(hashInput).digest();
  const bucket = hash.readUInt16BE(0) % 10000;
  return bucket < currentConfig.canaryBasisPoints;
}

// === CONFIGURATION MANAGEMENT ===
export function setCutoverConfig(config: Partial<CutoverConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  policyVersion = `1.0.${Date.now()}`;
}

export function getCutoverConfig(): CutoverConfig {
  return { ...currentConfig };
}

export function triggerEmergencyRollback(): void {
  currentConfig.emergencyRollback = true;
  policyVersion = `rollback.${Date.now()}`;
}

export function clearEmergencyRollback(): void {
  currentConfig.emergencyRollback = false;
}

export function resetToDefault(): void {
  currentConfig = { ...DEFAULT_CONFIG };
  policyVersion = '1.0.0';
}
