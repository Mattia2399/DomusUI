import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardBreakpointLayouts,
  type DashboardGridBreakpoint,
  type WidgetLayoutOverrides,
  type WidgetTypeLayoutOverrides,
} from '../../../types/widgetTypeLayout';
import { solveGridEngineRootRuntimeLayout } from './gridEngineRootRuntimeSolver';
import {
  inspectRuntimeGeometry,
  type RuntimeGeometryInspectionReport,
} from './runtimeGeometryDiagnostics';
import type { GridLayoutItem } from './model';
import {
  evaluateRuntimeShadowBaseline,
  type RuntimeShadowBaselineResult,
  type RuntimeShadowRootElement,
} from './runtimeShadowBaseline';
import {
  auditRuntimeShadowIds,
  type RuntimeShadowBaselineIdAudit,
} from './runtimeShadowIdAudit';
import {
  reconcileRuntimeShadowBaseline,
  type RuntimeShadowConfigurationCompleteness,
  type RuntimeShadowNestedElement,
  type RuntimeShadowReconciliationResult,
} from './runtimeShadowReconciliation';
import {
  deriveRuntimeShadowOverrides,
  type RuntimeShadowLightState,
  type RuntimeShadowOverrideIssue,
} from './runtimeShadowOverrides';
import {
  analyzeGridStructuralPolicyShadow,
  type GridStructuralPolicyShadowReport,
  type GridStructuralShadowSnapshotState,
} from './gridStructuralPolicyShadowAdapter';
import {
  analyzeGridStructuralPolicyConfigurationShadowBridge,
  createGridStructuralPolicyConfigurationShadowSignature,
  type GridStructuralPolicyConfigurationShadowReport,
} from './gridStructuralPolicyConfigurationShadowBridge';

export type RuntimeShadowStructuralPolicyReport = GridStructuralPolicyShadowReport & Readonly<{
  policyConfiguration: GridStructuralPolicyConfigurationShadowReport;
}>;

export type RuntimeShadowInput = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly cols: number;
  readonly rootElements: readonly RuntimeShadowRootElement[];
  readonly hasExplicitLayout: boolean;
  readonly explicitLayout?: readonly GridLayoutItem[];
  readonly derivedLayout?: readonly GridLayoutItem[];
  /** The geometry supplied to the legacy renderer, not observed DOM output. */
  readonly legacyRuntimeInput: readonly GridLayoutItem[];
  /** All six persisted root layouts, retained verbatim for read-only ID auditing. */
  readonly explicitRootLayouts?: Readonly<DashboardBreakpointLayouts>;
  /** All six effective root layouts supplied to the renderer. */
  readonly legacyRuntimeLayouts?: Readonly<DashboardBreakpointLayouts>;
  /** Existing widgets intentionally excluded from the root because they belong to a Stack. */
  readonly knownNonRootElements?: readonly RuntimeShadowNestedElement[];
  /** Known aliases only. Runtime diagnostics never infer or rewrite a legacy ID. */
  readonly knownLegacyIds?: readonly string[];
  readonly includeRawIdDetails?: boolean;
  readonly reconciliationEnabled?: boolean;
  readonly configurationCompleteness?: RuntimeShadowConfigurationCompleteness;
  readonly structuralContext?: Readonly<{
    generation: number;
    revision: number | null;
    fingerprint: string | null;
  }>;
  /** Current HA schema omits this field; synthetic V1 declarations are test-only. */
  readonly structuralPolicyConfiguration?: unknown;
  readonly lightStates: readonly RuntimeShadowLightState[];
  readonly widgetTypeLayoutOverrides?: WidgetTypeLayoutOverrides;
  readonly widgetLayoutOverrides?: WidgetLayoutOverrides;
  readonly knownRuntimeContamination?: boolean;
  readonly historicallyVerifiedBaseline?: boolean;
  readonly geometryInspectionEnabled?: boolean;
};

export type RuntimeShadowDifferenceCategory =
  | 'exact-match'
  | 'position-difference'
  | 'size-difference'
  | 'order-difference'
  | 'expected-algorithm-difference'
  | 'unexpected-difference'
  | 'solver-invalid'
  | 'insufficient-data';

export type RuntimeShadowDifference = {
  readonly id: string;
  readonly categories: readonly RuntimeShadowDifferenceCategory[];
  readonly candidate?: Readonly<GridLayoutItem & { index: number }>;
  readonly legacyRuntimeInput?: Readonly<GridLayoutItem & { index: number }>;
  readonly reason: 'missing-item' | 'runtime-collision-strategy' | 'unexplained-geometry';
};

export type RuntimeShadowReport = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly cols: number;
  readonly structuralContext: RuntimeShadowInput['structuralContext'] | null;
  readonly rootElementCount: number;
  readonly lightCount: number;
  readonly stackCount: number;
  readonly baseline: RuntimeShadowBaselineResult;
  readonly baselineIdAudit: RuntimeShadowBaselineIdAudit;
  readonly reconciliation: RuntimeShadowReconciliationResult;
  readonly structuralPolicy: RuntimeShadowStructuralPolicyReport;
  readonly comparisonConfidence: 'reliable' | 'provisional' | 'unavailable';
  readonly comparison: RuntimeShadowDifferenceCategory;
  readonly solverStatus: 'not-run' | 'unchanged' | 'resolved' | 'invalid';
  readonly overrideCount: number;
  readonly appliedOverrideCount: number;
  readonly matchCount: number;
  readonly differenceCount: number;
  readonly insufficientCount: number;
  readonly issueCodes: readonly string[];
  readonly differences: readonly RuntimeShadowDifference[];
  readonly geometryInspection?: RuntimeGeometryInspectionReport;
  readonly timings: {
    readonly baselineMs: number;
    readonly overridesMs: number;
    readonly solverMs: number;
    readonly comparisonMs: number;
    readonly totalMs: number;
  };
};

type AnalyzeRuntimeShadowOptions = {
  readonly now?: () => number;
};

function defaultNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function roundDuration(duration: number) {
  return Math.round(Math.max(0, duration) * 100) / 100;
}

function emptyTimings(startedAt: number, now: () => number, baselineMs: number) {
  const totalMs = roundDuration(now() - startedAt);
  return { baselineMs, overridesMs: 0, solverMs: 0, comparisonMs: 0, totalMs };
}

function unavailableReport(
  input: RuntimeShadowInput,
  baseline: RuntimeShadowBaselineResult,
  baselineIdAudit: RuntimeShadowBaselineIdAudit,
  reconciliation: RuntimeShadowReconciliationResult,
  structuralPolicy: RuntimeShadowStructuralPolicyReport,
  issueCodes: readonly string[],
  timings: RuntimeShadowReport['timings'],
): RuntimeShadowReport {
  return {
    breakpoint: input.breakpoint,
    cols: input.cols,
    structuralContext: input.structuralContext ?? null,
    rootElementCount: input.rootElements.length,
    lightCount: input.lightStates.length,
    stackCount: input.rootElements.filter((element) => element.role === 'stack').length,
    baseline,
    baselineIdAudit,
    reconciliation,
    structuralPolicy,
    comparisonConfidence: 'unavailable',
    comparison: 'insufficient-data',
    solverStatus: 'not-run',
    overrideCount: 0,
    appliedOverrideCount: 0,
    matchCount: 0,
    differenceCount: 0,
    insufficientCount: Math.max(1, issueCodes.length),
    issueCodes,
    differences: [],
    timings,
  };
}

function compareLayouts(
  candidate: readonly GridLayoutItem[],
  legacy: readonly GridLayoutItem[],
  appliedOverrideIds: ReadonlySet<string>,
) {
  const candidateById = new Map(candidate.map((item, index) => [item.i, { item, index }]));
  const legacyById = new Map(legacy.map((item, index) => [item.i, { item, index }]));
  const ids = new Set([...candidateById.keys(), ...legacyById.keys()]);
  const differences: RuntimeShadowDifference[] = [];
  let hasUnexpected = false;
  let hasExpected = false;

  [...ids].sort().forEach((id) => {
    const expected = candidateById.get(id);
    const actual = legacyById.get(id);
    if (!expected || !actual) {
      hasUnexpected = true;
      differences.push({
        id,
        categories: ['unexpected-difference'],
        candidate: expected ? { ...expected.item, index: expected.index } : undefined,
        legacyRuntimeInput: actual ? { ...actual.item, index: actual.index } : undefined,
        reason: 'missing-item',
      });
      return;
    }
    const categories: RuntimeShadowDifferenceCategory[] = [];
    if (expected.item.x !== actual.item.x || expected.item.y !== actual.item.y) {
      categories.push('position-difference');
    }
    if (expected.item.w !== actual.item.w || expected.item.h !== actual.item.h) {
      categories.push('size-difference');
    }
    if (expected.index !== actual.index) categories.push('order-difference');
    if (categories.length === 0) return;

    const algorithmOnly = appliedOverrideIds.size > 0
      && !appliedOverrideIds.has(id)
      && !categories.includes('size-difference');
    categories.push(algorithmOnly ? 'expected-algorithm-difference' : 'unexpected-difference');
    hasExpected ||= algorithmOnly;
    hasUnexpected ||= !algorithmOnly;
    differences.push({
      id,
      categories,
      candidate: { ...expected.item, index: expected.index },
      legacyRuntimeInput: { ...actual.item, index: actual.index },
      reason: algorithmOnly ? 'runtime-collision-strategy' : 'unexplained-geometry',
    });
  });

  return {
    differences,
    comparison: (hasUnexpected
      ? 'unexpected-difference'
      : hasExpected
        ? 'expected-algorithm-difference'
        : 'exact-match') as RuntimeShadowDifferenceCategory,
  };
}

/** Runs the independent root runtime candidate and compares it read-only. */
export function analyzeRuntimeShadow(
  input: RuntimeShadowInput,
  options: AnalyzeRuntimeShadowOptions = {},
): RuntimeShadowReport {
  const now = options.now ?? defaultNow;
  const startedAt = now();
  const baselineStartedAt = now();
  const baselineIdAudit = auditRuntimeShadowIds({
    rootElements: input.rootElements,
    knownNonRootElements: input.knownNonRootElements,
    explicitLayouts: input.explicitRootLayouts,
    rendererLayouts: input.legacyRuntimeLayouts,
    knownLegacyIds: input.knownLegacyIds,
    includeRawIds: input.includeRawIdDetails,
  });
  const baseline = evaluateRuntimeShadowBaseline({
    breakpoint: input.breakpoint,
    cols: input.cols,
    rootElements: input.rootElements,
    hasExplicitLayout: input.hasExplicitLayout,
    explicitLayout: input.explicitLayout,
    derivedLayout: input.derivedLayout,
    knownRuntimeContamination: input.knownRuntimeContamination,
    historicallyVerified: input.historicallyVerifiedBaseline,
  });
  const reconciliation = reconcileRuntimeShadowBaseline({
    enabled: input.reconciliationEnabled === true,
    breakpoint: input.breakpoint,
    cols: input.cols,
    rootElements: input.rootElements,
    knownNonRootElements: input.knownNonRootElements,
    configurationCompleteness: input.configurationCompleteness ?? 'unknown',
    hasExplicitLayout: input.hasExplicitLayout,
    explicitLayout: input.explicitLayout,
    originalBaseline: baseline,
    includeRawIds: input.includeRawIdDetails,
  });
  const structuralPolicySnapshotState: GridStructuralShadowSnapshotState =
    input.configurationCompleteness === 'verified-complete'
      ? 'verified-home-assistant'
      : input.configurationCompleteness === 'hydration-uncertain' &&
          (input.structuralContext?.generation ?? 0) > 0 &&
          input.structuralContext?.revision === null
        ? 'revision-pending'
      : input.configurationCompleteness === 'hydration-uncertain'
        ? 'incoherent'
        : 'unknown';
  const structuralPolicyProjection = analyzeGridStructuralPolicyShadow({
    structuralContext: input.structuralContext ?? null,
    snapshotState: structuralPolicySnapshotState,
    configurationCompleteness: input.configurationCompleteness ?? 'unknown',
    rootElements: input.rootElements,
    knownNonRootElements: input.knownNonRootElements,
    structuralLayouts: input.explicitRootLayouts,
    baselineIdAudit,
    reconciliationEnabled: input.reconciliationEnabled === true,
    activeBreakpoint: input.breakpoint,
    activeReconciliation: reconciliation,
    legacyLayouts: input.legacyRuntimeLayouts,
  }, { now }).report;
  const policyConfiguration = analyzeGridStructuralPolicyConfigurationShadowBridge({
    policy: input.structuralPolicyConfiguration,
    requestedBreakpoint: input.breakpoint,
    structuralContext: input.structuralContext ?? null,
    snapshotState: structuralPolicySnapshotState,
    snapshotCoherent: structuralPolicySnapshotState === 'verified-home-assistant',
    applicationReceipt: structuralPolicySnapshotState === 'verified-home-assistant' &&
        input.configurationCompleteness === 'verified-complete'
      ? 'verified-match'
      : 'missing',
    configurationCompleteness: input.configurationCompleteness ?? 'unknown',
    breakpointProjection: structuralPolicyProjection.breakpoints[input.breakpoint],
    activeBaseline: baseline,
  });
  const structuralPolicy: RuntimeShadowStructuralPolicyReport = {
    ...structuralPolicyProjection,
    policyConfiguration,
  };
  const baselineMs = roundDuration(now() - baselineStartedAt);
  const diagnosticBaselineLayout = baseline.layout ?? reconciliation.projectedLayout;
  if (!diagnosticBaselineLayout) {
    return unavailableReport(
      input,
      baseline,
      baselineIdAudit,
      reconciliation,
      structuralPolicy,
      baseline.issues.map((issue) => issue.code),
      emptyTimings(startedAt, now, baselineMs),
    );
  }

  const overridesStartedAt = now();
  const derived = deriveRuntimeShadowOverrides({
    breakpoint: input.breakpoint,
    cols: input.cols,
    structuralLayout: diagnosticBaselineLayout,
    legacyRuntimeLayout: input.legacyRuntimeInput,
    rootElements: input.rootElements,
    lightStates: input.lightStates,
    widgetTypeLayoutOverrides: input.widgetTypeLayoutOverrides,
    widgetLayoutOverrides: input.widgetLayoutOverrides,
  });
  const overridesMs = roundDuration(now() - overridesStartedAt);
  if (derived.issues.length > 0) {
    return unavailableReport(input, baseline, baselineIdAudit, reconciliation, structuralPolicy, derived.issues.map((issue: RuntimeShadowOverrideIssue) => issue.code), {
      baselineMs,
      overridesMs,
      solverMs: 0,
      comparisonMs: 0,
      totalMs: roundDuration(now() - startedAt),
    });
  }

  const solverStartedAt = now();
  const solved = solveGridEngineRootRuntimeLayout({
    structuralLayout: derived.structuralLayout,
    cols: input.cols,
    overrides: derived.overrides,
  });
  const solverMs = roundDuration(now() - solverStartedAt);
  if (solved.status === 'invalid') {
    return {
      ...unavailableReport(input, baseline, baselineIdAudit, reconciliation, structuralPolicy, solved.issues.map((issue) => issue.code), {
        baselineMs,
        overridesMs,
        solverMs,
        comparisonMs: 0,
        totalMs: roundDuration(now() - startedAt),
      }),
      comparison: 'solver-invalid',
      solverStatus: 'invalid',
      overrideCount: derived.overrides.length,
    };
  }

  const comparisonStartedAt = now();
  const comparison = compareLayouts(
    solved.layout,
    input.legacyRuntimeInput,
    new Set(solved.appliedOverrideIds),
  );
  const comparisonMs = roundDuration(now() - comparisonStartedAt);
  const comparisonConfidence = reconciliation.status === 'reconciled'
    ? reconciliation.comparisonConfidence
    : baseline.comparisonConfidence;
  const geometryInspection = input.geometryInspectionEnabled === true
    ? inspectRuntimeGeometry({
        breakpoint: input.breakpoint,
        cols: input.cols,
        rootElements: input.rootElements,
        structuralLayout: derived.structuralLayout,
        solverCandidate: solved.layout,
        legacyRuntimeInput: input.legacyRuntimeInput,
        appliedOverrideIds: solved.appliedOverrideIds,
        unsupportedDynamicRootIds: derived.dynamicStackIds,
        baselineQuality: reconciliation.status === 'reconciled'
          ? reconciliation.reconciledBaselineQuality ?? baseline.quality
          : baseline.quality,
        comparisonConfidence,
        baselineProvenance: baseline.provenance,
        structuralContext: input.structuralContext,
        expectedStructuralContext: input.structuralContext,
      }, { now })
    : undefined;
  return {
    breakpoint: input.breakpoint,
    cols: input.cols,
    structuralContext: input.structuralContext ?? null,
    rootElementCount: input.rootElements.length,
    lightCount: input.lightStates.length,
    stackCount: input.rootElements.filter((element) => element.role === 'stack').length,
    baseline,
    baselineIdAudit,
    reconciliation,
    structuralPolicy,
    comparisonConfidence,
    comparison: comparison.comparison,
    solverStatus: solved.status,
    overrideCount: derived.overrides.length,
    appliedOverrideCount: solved.appliedOverrideIds.length,
    matchCount: Math.max(0, input.rootElements.length - comparison.differences.length),
    differenceCount: comparison.differences.length,
    insufficientCount: 0,
    issueCodes: reconciliation.status === 'reconciled' ? reconciliation.originalIssues : [],
    differences: comparison.differences,
    ...(geometryInspection ? { geometryInspection } : null),
    timings: {
      baselineMs,
      overridesMs,
      solverMs,
      comparisonMs,
      totalMs: roundDuration(now() - startedAt),
    },
  };
}

function layoutSignature(layout: readonly GridLayoutItem[] | undefined) {
  return (layout ?? []).map(({ i, x, y, w, h }) => [i, x, y, w, h]);
}

function breakpointLayoutsSignature(layouts: Readonly<DashboardBreakpointLayouts> | undefined) {
  return DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [breakpoint, layoutSignature(layouts?.[breakpoint])]);
}

function hashSignature(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `rs-${value.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function spanOverrideSignature(override: {
  readonly w?: number;
  readonly h?: number;
  readonly hOn?: number;
  readonly hOff?: number;
  readonly autoExpand?: boolean;
} | undefined) {
  return override
    ? [override.w ?? null, override.h ?? null, override.hOn ?? null, override.hOff ?? null, override.autoExpand ?? null]
    : null;
}

/** Signature excludes labels, entity IDs and all unrelated HA state. */
export function createRuntimeShadowInputSignature(input: RuntimeShadowInput) {
  const lightIds = new Set(input.lightStates.map((light) => light.id));
  const relevantWidgetOverrides = [...lightIds].sort().map((id) => [
    id,
    spanOverrideSignature(input.widgetLayoutOverrides?.[id]?.[input.breakpoint]),
  ]);
  const canonical = JSON.stringify({
    breakpoint: input.breakpoint,
    cols: input.cols,
    roots: [...input.rootElements]
      .map(({ id, role, kind }) => ({ id, role, kind }))
      .sort((first, second) => first.id.localeCompare(second.id)),
    explicit: input.hasExplicitLayout ? layoutSignature(input.explicitLayout) : null,
    derived: input.hasExplicitLayout ? null : layoutSignature(input.derivedLayout),
    legacy: layoutSignature(input.legacyRuntimeInput),
    explicitRoots: breakpointLayoutsSignature(input.explicitRootLayouts),
    rendererRoots: breakpointLayoutsSignature(input.legacyRuntimeLayouts),
    nonRoots: [...(input.knownNonRootElements ?? [])]
      .map(({ id, role, kind, parentRole }) => ({ id, role, kind, parentRole }))
      .sort((first, second) => first.id.localeCompare(second.id)),
    legacyIds: [...(input.knownLegacyIds ?? [])].sort(),
    rawIdDetails: input.includeRawIdDetails === true,
    reconciliationEnabled: input.reconciliationEnabled === true,
    configurationCompleteness: input.configurationCompleteness ?? 'unknown',
    structuralContext: input.structuralContext ?? null,
    policyConfiguration: createGridStructuralPolicyConfigurationShadowSignature(
      input.structuralPolicyConfiguration,
    ),
    lights: [...input.lightStates].sort((first, second) => first.id.localeCompare(second.id)),
    lightTypeOverride: spanOverrideSignature(input.widgetTypeLayoutOverrides?.light?.[input.breakpoint]),
    widgetOverrides: relevantWidgetOverrides,
    contaminated: input.knownRuntimeContamination === true,
    verified: input.historicallyVerifiedBaseline === true,
    ...(input.geometryInspectionEnabled === true ? { geometryInspectionEnabled: true } : null),
  });
  return hashSignature(canonical);
}
