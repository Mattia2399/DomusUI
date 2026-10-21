import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import {
  inspectGridStructuralPolicyConfiguration,
  type GridStructuralPolicyConfigurationInspectionReport,
  type GridStructuralPolicyLineageEvidence,
  type GridStructuralPolicySnapshotReceiptEvidence,
} from './gridStructuralPolicyConfigurationInspection';
import { parseGridStructuralPolicyConfiguration } from './gridStructuralPolicyConfiguration';
import type {
  GridStructuralPolicyShadowBreakpointReport,
  GridStructuralShadowContext,
  GridStructuralShadowSnapshotState,
} from './gridStructuralPolicyShadowAdapter';
import type { RuntimeShadowBaselineResult } from './runtimeShadowBaseline';
import { fingerprintRuntimeShadowId } from './runtimeShadowIdAudit';
import type { RuntimeShadowConfigurationCompleteness } from './runtimeShadowReconciliation';

export type GridStructuralPolicyConfigurationShadowBridgeInput = Readonly<{
  policy: unknown;
  requestedBreakpoint: DashboardGridBreakpoint;
  structuralContext: GridStructuralShadowContext | null;
  snapshotState: GridStructuralShadowSnapshotState;
  snapshotCoherent: boolean;
  applicationReceipt: GridStructuralPolicySnapshotReceiptEvidence;
  configurationCompleteness: RuntimeShadowConfigurationCompleteness;
  breakpointProjection: GridStructuralPolicyShadowBreakpointReport;
  activeBaseline: RuntimeShadowBaselineResult;
  lineageEvidence?: GridStructuralPolicyLineageEvidence;
}>;

export type GridStructuralPolicyConfigurationShadowReport =
  GridStructuralPolicyConfigurationInspectionReport;

function inventoryCompleteness(
  input: GridStructuralPolicyConfigurationShadowBridgeInput,
) {
  if (
    input.configurationCompleteness === 'verified-complete' &&
    input.breakpointProjection.diagnosticStatus === 'available'
  ) return 'verified-complete' as const;
  if (input.configurationCompleteness === 'hydration-uncertain') return 'partial' as const;
  return 'unknown' as const;
}

function baselineIssueCount(
  baseline: RuntimeShadowBaselineResult,
  code: 'OUT_OF_BOUNDS' | 'OVERLAP',
) {
  return baseline.issues.filter((issue) => issue.code === code).length;
}

/**
 * Converts evidence already classified by Runtime Shadow into Inspector input.
 * It does not read HA, rebuild inventory, reconcile, solve, or derive geometry.
 */
export function analyzeGridStructuralPolicyConfigurationShadowBridge(
  input: GridStructuralPolicyConfigurationShadowBridgeInput,
): GridStructuralPolicyConfigurationInspectionReport {
  const counts = input.breakpointProjection.counts;
  return inspectGridStructuralPolicyConfiguration({
    policy: input.policy,
    requestedScope: { kind: 'root' },
    requestedBreakpoint: input.requestedBreakpoint,
    structuralContext: {
      state: input.snapshotState,
      coherent: input.snapshotCoherent,
      generation: input.structuralContext?.generation ?? 0,
      revision: input.structuralContext?.revision ?? null,
      diagnosticFingerprint: input.structuralContext?.fingerprint ?? null,
      applicationReceipt: input.applicationReceipt,
    },
    inventoryEvidence: {
      completeness: inventoryCompleteness(input),
      activeCount: counts.active,
      verifiedAbsentCount: counts.verifiedExtra,
      uncertainCount: counts.uncertain,
      duplicateIdCount: counts.duplicateLayoutIds + counts.duplicateInventoryIds,
      activeWithoutGeometryCount: counts.activeWithoutGeometry,
      stackContainerCount: counts.stackContainers,
    },
    geometryEvidence: {
      completeness: input.breakpointProjection.layoutCompleteness,
      baselineTrust: input.breakpointProjection.baselineQuality,
      outOfBoundsCount: baselineIssueCount(input.activeBaseline, 'OUT_OF_BOUNDS'),
      collisionCount: baselineIssueCount(input.activeBaseline, 'OVERLAP'),
    },
    ...(input.lineageEvidence ? { lineageEvidence: input.lineageEvidence } : null),
  });
}

/**
 * Privacy-safe Runtime Shadow signature fragment. Valid V1 declarations are
 * fingerprinted in full so meaningful declaration changes invalidate
 * deduplication. Invalid declarations intentionally use only sanitized parser
 * diagnostics; two malformed payloads with the same diagnostics may therefore
 * share a fragment and are never claimed to have distinct identity.
 */
export function createGridStructuralPolicyConfigurationShadowSignature(
  policy: unknown,
) {
  const parsed = parseGridStructuralPolicyConfiguration(policy);
  const canonical = parsed.status === 'valid'
    ? JSON.stringify({ status: parsed.status, policy: parsed.policy })
    : JSON.stringify({
        status: parsed.status,
        unsupportedVersion: parsed.status === 'unsupported-version'
          ? parsed.unsupportedVersion ?? null
          : null,
        issues: parsed.issues
          .map(({ code, classification, path }) => [code, classification, path])
          .sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second))),
      });
  return fingerprintRuntimeShadowId(canonical).replace('id-', 'policy-configuration-');
}
