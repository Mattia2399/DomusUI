import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { GridLayoutItem } from './model';
import {
  evaluateRuntimeShadowBaseline,
  type RuntimeShadowBaselineIssueCode,
  type RuntimeShadowBaselineResult,
  type RuntimeShadowRootElement,
} from './runtimeShadowBaseline';
import { fingerprintRuntimeShadowId } from './runtimeShadowIdAudit';

export type RuntimeShadowConfigurationCompleteness = 'verified-complete' | 'hydration-uncertain' | 'unknown';

export type RuntimeShadowNestedElement = RuntimeShadowRootElement & {
  readonly parentRole: 'section' | 'stack' | 'unknown';
};

export type RuntimeShadowExtraIdClassification =
  | 'EXISTING_NESTED_WIDGET'
  | 'ABSENT_FROM_CURRENT_CONFIG'
  | 'EXISTING_ROOT_MISMATCH'
  | 'HYDRATION_UNCERTAIN'
  | 'UNKNOWN';

export type RuntimeShadowClassificationEvidence =
  | 'exact-current-nested-widget'
  | 'verified-complete-configuration-absence'
  | 'normalized-current-element-match'
  | 'configuration-hydration-not-verified'
  | 'insufficient-structural-evidence'
  | 'invalid-layout-id';

export type RuntimeShadowClassifiedExtraId = {
  readonly fingerprint: string;
  readonly classification: RuntimeShadowExtraIdClassification;
  readonly evidence: RuntimeShadowClassificationEvidence;
  readonly parentRole?: RuntimeShadowNestedElement['parentRole'];
  readonly safeForDiagnosticProjection: boolean;
  /** Included only behind the explicit development details flag. */
  readonly rawId?: string;
};

export type RuntimeShadowReconciliationStatus = 'disabled' | 'not-needed' | 'reconciled' | 'blocked';
export type RuntimeShadowReconciliationReason =
  | 'feature-disabled'
  | 'original-baseline-valid'
  | 'no-explicit-structural-layout'
  | 'no-extra-ids-to-reconcile'
  | 'unsafe-extra-id-classification'
  | 'safe-extra-ids-excluded'
  | 'projected-baseline-invalid';

export type RuntimeShadowReconciliationResult = {
  readonly originalBaselineQuality: RuntimeShadowBaselineResult['quality'];
  readonly status: RuntimeShadowReconciliationStatus;
  readonly reason: RuntimeShadowReconciliationReason;
  readonly reconciledBaselineQuality: 'reconciled-provisional' | null;
  readonly comparisonConfidence: RuntimeShadowBaselineResult['comparisonConfidence'];
  readonly extraIdsCount: number;
  readonly classifiedNestedCount: number;
  readonly classifiedAbsentCount: number;
  readonly uncertainCount: number;
  readonly excludedFromDiagnosticProjectionCount: number;
  readonly originalIssues: readonly RuntimeShadowBaselineIssueCode[];
  readonly remainingIssues: readonly RuntimeShadowBaselineIssueCode[];
  readonly classifications: readonly RuntimeShadowClassifiedExtraId[];
  /** Detached geometry used only by Runtime Shadow. Never written or rendered. */
  readonly projectedLayout: readonly GridLayoutItem[] | null;
};

export type RuntimeShadowReconciliationInput = {
  readonly enabled: boolean;
  readonly breakpoint: DashboardGridBreakpoint;
  readonly cols: number;
  readonly rootElements: readonly RuntimeShadowRootElement[];
  readonly knownNonRootElements?: readonly RuntimeShadowNestedElement[];
  readonly configurationCompleteness: RuntimeShadowConfigurationCompleteness;
  readonly hasExplicitLayout: boolean;
  readonly explicitLayout?: readonly GridLayoutItem[];
  readonly originalBaseline: RuntimeShadowBaselineResult;
  readonly includeRawIds?: boolean;
};

function normalizeComparableId(id: string) {
  return id.normalize('NFKC').trim().toLowerCase();
}

function uniqueStrings(ids: readonly string[]) {
  return [...new Set(ids)];
}

function classifyExtraId(
  id: string,
  input: RuntimeShadowReconciliationInput,
): RuntimeShadowClassifiedExtraId {
  const includeRaw = input.includeRawIds === true;
  const base = {
    fingerprint: fingerprintRuntimeShadowId(id),
    ...(includeRaw ? { rawId: id } : null),
  };
  if (!id) {
    return {
      ...base,
      classification: 'UNKNOWN',
      evidence: 'invalid-layout-id',
      safeForDiagnosticProjection: false,
    };
  }

  const nested = (input.knownNonRootElements ?? []).find((element) => element.id === id);
  if (nested) {
    return {
      ...base,
      classification: 'EXISTING_NESTED_WIDGET',
      evidence: 'exact-current-nested-widget',
      parentRole: nested.parentRole,
      safeForDiagnosticProjection: true,
    };
  }

  const normalized = normalizeComparableId(id);
  const normalizedCurrentMatch = [
    ...input.rootElements,
    ...(input.knownNonRootElements ?? []),
  ].some((element) => element.id !== id && normalizeComparableId(element.id) === normalized);
  if (normalizedCurrentMatch) {
    return {
      ...base,
      classification: 'EXISTING_ROOT_MISMATCH',
      evidence: 'normalized-current-element-match',
      safeForDiagnosticProjection: false,
    };
  }

  if (input.configurationCompleteness === 'verified-complete') {
    return {
      ...base,
      classification: 'ABSENT_FROM_CURRENT_CONFIG',
      evidence: 'verified-complete-configuration-absence',
      safeForDiagnosticProjection: true,
    };
  }
  if (input.configurationCompleteness === 'hydration-uncertain') {
    return {
      ...base,
      classification: 'HYDRATION_UNCERTAIN',
      evidence: 'configuration-hydration-not-verified',
      safeForDiagnosticProjection: false,
    };
  }
  return {
    ...base,
    classification: 'UNKNOWN',
    evidence: 'insufficient-structural-evidence',
    safeForDiagnosticProjection: false,
  };
}

function issueCodes(baseline: RuntimeShadowBaselineResult) {
  return baseline.issues.map((issue) => issue.code);
}

function baseResult(
  input: RuntimeShadowReconciliationInput,
  classifications: readonly RuntimeShadowClassifiedExtraId[],
) {
  const originalIssues = issueCodes(input.originalBaseline);
  return {
    originalBaselineQuality: input.originalBaseline.quality,
    extraIdsCount: classifications.length,
    classifiedNestedCount: classifications.filter((entry) => entry.classification === 'EXISTING_NESTED_WIDGET').length,
    classifiedAbsentCount: classifications.filter((entry) => entry.classification === 'ABSENT_FROM_CURRENT_CONFIG').length,
    uncertainCount: classifications.filter((entry) =>
      entry.classification === 'HYDRATION_UNCERTAIN' ||
      entry.classification === 'UNKNOWN' ||
      entry.classification === 'EXISTING_ROOT_MISMATCH'
    ).length,
    originalIssues,
    classifications,
  } as const;
}

/**
 * Produces a detached diagnostic projection only when every exclusion has
 * structural evidence and the filtered geometry is independently valid.
 */
export function reconcileRuntimeShadowBaseline(
  input: RuntimeShadowReconciliationInput,
): RuntimeShadowReconciliationResult {
  const rootIds = new Set(input.rootElements.map((element) => element.id));
  const explicitLayout = input.explicitLayout ?? [];
  const extraIds = uniqueStrings(explicitLayout.map((item) => item.i).filter((id) => !rootIds.has(id)));
  const classifications = extraIds.map((id) => classifyExtraId(id, input));
  const base = baseResult(input, classifications);

  if (input.originalBaseline.layout) {
    return {
      ...base,
      status: 'not-needed',
      reason: 'original-baseline-valid',
      reconciledBaselineQuality: null,
      comparisonConfidence: input.originalBaseline.comparisonConfidence,
      excludedFromDiagnosticProjectionCount: 0,
      remainingIssues: [],
      projectedLayout: null,
    };
  }
  if (!input.enabled) {
    return {
      ...base,
      status: 'disabled',
      reason: 'feature-disabled',
      reconciledBaselineQuality: null,
      comparisonConfidence: 'unavailable',
      excludedFromDiagnosticProjectionCount: 0,
      remainingIssues: base.originalIssues,
      projectedLayout: null,
    };
  }
  if (!input.hasExplicitLayout) {
    return {
      ...base,
      status: 'blocked',
      reason: 'no-explicit-structural-layout',
      reconciledBaselineQuality: null,
      comparisonConfidence: 'unavailable',
      excludedFromDiagnosticProjectionCount: 0,
      remainingIssues: base.originalIssues,
      projectedLayout: null,
    };
  }
  if (classifications.length === 0) {
    return {
      ...base,
      status: 'blocked',
      reason: 'no-extra-ids-to-reconcile',
      reconciledBaselineQuality: null,
      comparisonConfidence: 'unavailable',
      excludedFromDiagnosticProjectionCount: 0,
      remainingIssues: base.originalIssues,
      projectedLayout: null,
    };
  }
  if (classifications.some((entry) => !entry.safeForDiagnosticProjection)) {
    return {
      ...base,
      status: 'blocked',
      reason: 'unsafe-extra-id-classification',
      reconciledBaselineQuality: null,
      comparisonConfidence: 'unavailable',
      excludedFromDiagnosticProjectionCount: 0,
      remainingIssues: base.originalIssues,
      projectedLayout: null,
    };
  }

  const excludedIds = new Set(extraIds);
  const projectedLayout = explicitLayout
    .filter((item) => !excludedIds.has(item.i))
    .map((item) => ({ ...item }));
  const projectedBaseline = evaluateRuntimeShadowBaseline({
    breakpoint: input.breakpoint,
    cols: input.cols,
    rootElements: input.rootElements,
    hasExplicitLayout: true,
    explicitLayout: projectedLayout,
    historicallyVerified: false,
  });
  if (!projectedBaseline.layout) {
    return {
      ...base,
      status: 'blocked',
      reason: 'projected-baseline-invalid',
      reconciledBaselineQuality: null,
      comparisonConfidence: 'unavailable',
      excludedFromDiagnosticProjectionCount: 0,
      remainingIssues: issueCodes(projectedBaseline),
      projectedLayout: null,
    };
  }

  return {
    ...base,
    status: 'reconciled',
    reason: 'safe-extra-ids-excluded',
    reconciledBaselineQuality: 'reconciled-provisional',
    comparisonConfidence: 'provisional',
    excludedFromDiagnosticProjectionCount: classifications.length,
    remainingIssues: [],
    projectedLayout: projectedBaseline.layout,
  };
}
