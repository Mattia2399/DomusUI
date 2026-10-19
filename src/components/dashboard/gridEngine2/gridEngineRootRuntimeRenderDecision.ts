import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
  type WidgetLayoutOverrides,
  type WidgetTypeLayoutOverrides,
} from '../../../types/widgetTypeLayout';
import type {
  DashboardStructuralLoadPhase,
  DashboardStructuralLoadSource,
} from '../../../services/dashboardStructuralLoadSnapshot';
import { validateGridEngineRootGeometry } from './gridEngineRootGeometry';
import {
  solveGridEngineRootRuntimeLayout,
  type GridEngineRootRuntimeResult,
} from './gridEngineRootRuntimeSolver';
import type { GridLayoutItem } from './model';
import {
  evaluateRuntimeShadowBaseline,
  type RuntimeShadowRootElement,
} from './runtimeShadowBaseline';
import {
  deriveRuntimeShadowOverrides,
  type RuntimeShadowLightState,
} from './runtimeShadowOverrides';

export type RuntimeRenderStructuralContext = Readonly<{
  generation: number;
  revision: number | null;
  fingerprint: string | null;
}>;

export type RuntimeRenderStructuralSnapshotState = RuntimeRenderStructuralContext & Readonly<{
  phase: DashboardStructuralLoadPhase;
  source: DashboardStructuralLoadSource;
  coherent: boolean;
}>;

export type RuntimeRenderBaseline =
  | Readonly<{ kind: 'explicit'; layout: readonly GridLayoutItem[] }>
  | Readonly<{ kind: 'reconciled-provisional'; layout: readonly GridLayoutItem[] }>
  | Readonly<{ kind: 'missing' }>;

export type RuntimeRenderFallbackReason =
  | 'production-disabled'
  | 'edit-mode'
  | 'grid-not-initialized'
  | 'snapshot-not-authoritative'
  | 'structural-context-mismatch'
  | 'pending-authoritative-layout'
  | 'non-authoritative-draft'
  | 'unknown-breakpoint'
  | 'missing-explicit-layout'
  | 'reconciled-provisional-baseline'
  | 'invalid-structural-layout'
  | 'unsupported-dynamic-component'
  | 'invalid-runtime-overrides'
  | 'solver-error'
  | 'solver-invalid'
  | 'invalid-final-geometry';

export type RuntimeRenderDecisionDiagnostics = Readonly<{
  breakpoint: string;
  rootCount: number;
  overrideCount: number;
  generation: number;
  revision: number | null;
  finalCollisionCount: number;
  issueCodes: readonly string[];
}>;

export type GridEngineRootRuntimeRenderDecision =
  | Readonly<{
      kind: 'existing-renderer';
      renderer: 'legacy' | 'custom';
      reason: 'custom-renderer-disabled' | 'runtime-solver-renderer-disabled';
      diagnostics: RuntimeRenderDecisionDiagnostics;
    }>
  | Readonly<{
      kind: 'custom-solver';
      layout: readonly GridLayoutItem[];
      runtimeSpans: ReadonlyMap<string, Readonly<{ w: number; h: number }>>;
      generation: number;
      diagnostics: RuntimeRenderDecisionDiagnostics;
    }>
  | Readonly<{
      kind: 'legacy-fallback';
      reason: RuntimeRenderFallbackReason;
      diagnostics: RuntimeRenderDecisionDiagnostics;
    }>;

export type GridEngineRootRuntimeRenderDecisionInput = Readonly<{
  development: boolean;
  customRendererEnabled: boolean;
  runtimeSolverRendererRequested: boolean;
  isEditMode: boolean;
  gridInitialized: boolean;
  hasPendingAuthoritativeLayout: boolean;
  hasNonAuthoritativeDraft: boolean;
  breakpoint: string;
  cols: number;
  snapshot: RuntimeRenderStructuralSnapshotState;
  currentStructuralContext: RuntimeRenderStructuralContext;
  baseline: RuntimeRenderBaseline;
  rootElements: readonly RuntimeShadowRootElement[];
  lightStates: readonly RuntimeShadowLightState[];
  legacyRuntimeLayout: readonly GridLayoutItem[];
  widgetTypeLayoutOverrides?: WidgetTypeLayoutOverrides;
  widgetLayoutOverrides?: WidgetLayoutOverrides;
}>;

type RuntimeRenderDecisionDependencies = Readonly<{
  solve?: (input: Parameters<typeof solveGridEngineRootRuntimeLayout>[0]) => GridEngineRootRuntimeResult;
}>;

function contextsMatch(
  snapshot: RuntimeRenderStructuralSnapshotState,
  current: RuntimeRenderStructuralContext,
) {
  return snapshot.generation === current.generation &&
    snapshot.revision === current.revision &&
    snapshot.fingerprint === current.fingerprint;
}

function isAuthoritativeSnapshot(snapshot: RuntimeRenderStructuralSnapshotState) {
  return snapshot.phase === 'complete' &&
    snapshot.source === 'home-assistant' &&
    snapshot.coherent &&
    Number.isSafeInteger(snapshot.generation) &&
    snapshot.generation > 0 &&
    snapshot.revision !== null &&
    snapshot.fingerprint !== null;
}

function collisionCount(layout: readonly GridLayoutItem[]) {
  return layout.reduce((count, item, index) => count + layout.slice(0, index).filter((previous) => (
    item.x < previous.x + previous.w &&
    item.x + item.w > previous.x &&
    item.y < previous.y + previous.h &&
    item.y + item.h > previous.y
  )).length, 0);
}

function diagnostics(
  input: GridEngineRootRuntimeRenderDecisionInput,
  overrideCount = 0,
  finalCollisionCount = 0,
  issueCodes: readonly string[] = [],
): RuntimeRenderDecisionDiagnostics {
  return {
    breakpoint: input.breakpoint,
    rootCount: input.rootElements.length,
    overrideCount,
    generation: input.snapshot.generation,
    revision: input.snapshot.revision,
    finalCollisionCount,
    issueCodes: [...new Set(issueCodes)].sort(),
  };
}

function fallback(
  input: GridEngineRootRuntimeRenderDecisionInput,
  reason: RuntimeRenderFallbackReason,
  overrideCount = 0,
  finalCollisionCount = 0,
  issueCodes: readonly string[] = [],
): GridEngineRootRuntimeRenderDecision {
  return {
    kind: 'legacy-fallback',
    reason,
    diagnostics: diagnostics(input, overrideCount, finalCollisionCount, issueCodes),
  };
}

function exactIds(
  layout: readonly GridLayoutItem[],
  roots: readonly RuntimeShadowRootElement[],
) {
  const layoutIds = new Set(layout.map((item) => item.i));
  const rootIds = new Set(roots.map((root) => root.id));
  return layoutIds.size === layout.length &&
    rootIds.size === roots.length &&
    layoutIds.size === rootIds.size &&
    [...layoutIds].every((id) => rootIds.has(id));
}

function finalGeometryMatchesContract(
  structuralLayout: readonly GridLayoutItem[],
  finalLayout: readonly GridLayoutItem[],
  appliedOverrides: readonly { readonly id: string; readonly w: number; readonly h: number }[],
  rootElements: readonly RuntimeShadowRootElement[],
  cols: number,
) {
  if (!exactIds(finalLayout, rootElements)) return false;
  const finalById = new Map(finalLayout.map((item) => [item.i, item]));
  const overridesById = new Map(appliedOverrides.map((override) => [override.id, override]));
  const preservesRuntimeContract = structuralLayout.every((structural) => {
    const item = finalById.get(structural.i);
    const override = overridesById.get(structural.i);
    return Boolean(
      item &&
      item.x === structural.x &&
      item.w === (override?.w ?? structural.w) &&
      item.h === (override?.h ?? structural.h),
    );
  });
  if (!preservesRuntimeContract) return false;
  return validateGridEngineRootGeometry(finalLayout, {
    width: 1,
    cols,
    rowHeight: 1,
    gap: [0, 0],
    padding: [0, 0],
  }).valid;
}

/**
 * Selects a render path synchronously. It never mutates the structural source,
 * reads globals, performs I/O, or accepts a previous solver result as input.
 */
export function resolveGridEngineRootRuntimeRenderDecision(
  input: GridEngineRootRuntimeRenderDecisionInput,
  dependencies: RuntimeRenderDecisionDependencies = {},
): GridEngineRootRuntimeRenderDecision {
  if (input.isEditMode) return fallback(input, 'edit-mode');
  if (!input.customRendererEnabled) {
    return {
      kind: 'existing-renderer',
      renderer: 'legacy',
      reason: 'custom-renderer-disabled',
      diagnostics: diagnostics(input),
    };
  }
  if (!input.runtimeSolverRendererRequested) {
    return {
      kind: 'existing-renderer',
      renderer: 'custom',
      reason: 'runtime-solver-renderer-disabled',
      diagnostics: diagnostics(input),
    };
  }
  if (!input.development) return fallback(input, 'production-disabled');
  if (!input.gridInitialized) return fallback(input, 'grid-not-initialized');
  if (!isAuthoritativeSnapshot(input.snapshot)) return fallback(input, 'snapshot-not-authoritative');
  if (!contextsMatch(input.snapshot, input.currentStructuralContext)) {
    return fallback(input, 'structural-context-mismatch');
  }
  if (input.hasPendingAuthoritativeLayout) return fallback(input, 'pending-authoritative-layout');
  if (input.hasNonAuthoritativeDraft) return fallback(input, 'non-authoritative-draft');
  if (!DASHBOARD_GRID_BREAKPOINT_ORDER.includes(input.breakpoint as DashboardGridBreakpoint)) {
    return fallback(input, 'unknown-breakpoint');
  }
  if (input.baseline.kind === 'reconciled-provisional') {
    return fallback(input, 'reconciled-provisional-baseline');
  }
  if (input.baseline.kind === 'missing') return fallback(input, 'missing-explicit-layout');
  if (input.rootElements.some((element) => element.role === 'stack')) {
    return fallback(input, 'unsupported-dynamic-component', 0, 0, ['UNSUPPORTED_DYNAMIC_STACK']);
  }

  const baseline = evaluateRuntimeShadowBaseline({
    breakpoint: input.breakpoint as DashboardGridBreakpoint,
    cols: input.cols,
    rootElements: input.rootElements,
    hasExplicitLayout: true,
    explicitLayout: input.baseline.layout,
    historicallyVerified: false,
  });
  if (!baseline.layout || baseline.quality !== 'explicit-complete-candidate') {
    return fallback(
      input,
      'invalid-structural-layout',
      0,
      0,
      baseline.issues.map((issue) => issue.code),
    );
  }

  const derived = deriveRuntimeShadowOverrides({
    breakpoint: input.breakpoint as DashboardGridBreakpoint,
    cols: input.cols,
    structuralLayout: baseline.layout,
    legacyRuntimeLayout: input.legacyRuntimeLayout,
    rootElements: input.rootElements,
    lightStates: input.lightStates,
    widgetTypeLayoutOverrides: input.widgetTypeLayoutOverrides,
    widgetLayoutOverrides: input.widgetLayoutOverrides,
  });
  if (derived.issues.length > 0) {
    const issueCodes = derived.issues.map((issue) => issue.code);
    return fallback(
      input,
      issueCodes.includes('UNSUPPORTED_DYNAMIC_STACK')
        ? 'unsupported-dynamic-component'
        : 'invalid-runtime-overrides',
      derived.overrides.length,
      0,
      issueCodes,
    );
  }

  const solve = dependencies.solve ?? solveGridEngineRootRuntimeLayout;
  let solved: GridEngineRootRuntimeResult;
  try {
    solved = solve({
      structuralLayout: derived.structuralLayout,
      cols: input.cols,
      overrides: derived.overrides,
    });
  } catch {
    return fallback(input, 'solver-error', derived.overrides.length);
  }
  if (solved.status === 'invalid') {
    return fallback(
      input,
      'solver-invalid',
      derived.overrides.length,
      0,
      solved.issues.map((issue) => issue.code),
    );
  }

  const finalCollisionCount = collisionCount(solved.layout);
  if (!finalGeometryMatchesContract(
    derived.structuralLayout,
    solved.layout,
    derived.overrides,
    input.rootElements,
    input.cols,
  )) {
    return fallback(
      input,
      'invalid-final-geometry',
      solved.appliedOverrideIds.length,
      finalCollisionCount,
    );
  }

  return {
    kind: 'custom-solver',
    layout: solved.layout,
    runtimeSpans: new Map(solved.layout.map((item) => [
      item.i,
      Object.freeze({ w: item.w, h: item.h }),
    ])),
    generation: input.snapshot.generation,
    diagnostics: diagnostics(
      input,
      solved.appliedOverrideIds.length,
      finalCollisionCount,
    ),
  };
}

export function createRuntimeRenderDecisionConsolePayload(
  decision: GridEngineRootRuntimeRenderDecision,
) {
  return {
    event: 'runtime-render-decision',
    decision: decision.kind,
    ...(decision.kind === 'legacy-fallback' ? { reason: decision.reason } : null),
    ...(decision.kind === 'existing-renderer' ? {
      renderer: decision.renderer,
      reason: decision.reason,
    } : null),
    breakpoint: decision.diagnostics.breakpoint,
    rootCount: decision.diagnostics.rootCount,
    overrideCount: decision.diagnostics.overrideCount,
    generation: decision.diagnostics.generation,
    revision: decision.diagnostics.revision,
    finalCollisionCount: decision.diagnostics.finalCollisionCount,
    issueCodes: decision.diagnostics.issueCodes,
  };
}
