import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type {
  ShadowBreakpointReport,
  ShadowDiagnosticsReport,
  ShadowDifferenceCategory,
  ShadowItemDifference,
  ShadowStackReport,
} from './shadowLayoutDiagnostics';

export const SHADOW_INSPECTOR_PROTOCOL_VERSION = 1 as const;

export type ShadowInspectorSource =
  | { readonly kind: 'real-shadow' }
  | { readonly kind: 'fixture'; readonly fixtureId: string; readonly label: string };

export type ShadowInspectorTimings = {
  readonly analysisMs: number | null;
  readonly conversionMs: number | null;
  readonly comparisonMs: number | null;
};

export type ShadowInspectorSnapshot = {
  readonly protocolVersion: typeof SHADOW_INSPECTOR_PROTOCOL_VERSION;
  readonly snapshotId: string;
  readonly geometryKey: string;
  readonly sequence: number;
  readonly lifecycle: 'initial' | 'updated';
  /** HA completion is not observable at this boundary. */
  readonly authority: 'observed-unconfirmed';
  readonly capturedAt: string;
  readonly observedBreakpoint: DashboardGridBreakpoint | null;
  readonly source: ShadowInspectorSource;
  readonly timings: ShadowInspectorTimings;
  readonly report: ShadowDiagnosticsReport;
};

type CreateSnapshotInput = {
  readonly report: ShadowDiagnosticsReport;
  readonly sequence: number;
  readonly observedBreakpoint: DashboardGridBreakpoint | null;
  readonly source: ShadowInspectorSource;
  readonly timings?: Partial<ShadowInspectorTimings>;
  readonly capturedAt?: string;
};

function cloneGeometry<T extends { readonly i: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }>(
  geometry: T,
) {
  return { i: geometry.i, x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h };
}

function cloneDifference(difference: ShadowItemDifference): ShadowItemDifference {
  return {
    diagnosticId: difference.diagnosticId,
    originalId: difference.originalId,
    categories: [...difference.categories],
    displayed: cloneGeometry(difference.displayed),
    ...(difference.structural ? { structural: cloneGeometry(difference.structural) } : {}),
    ...(difference.normalized ? { normalized: cloneGeometry(difference.normalized) } : {}),
  };
}

function cloneBreakpoint(report: ShadowBreakpointReport): ShadowBreakpointReport {
  return {
    breakpoint: report.breakpoint,
    cols: report.cols,
    source: report.source,
    hasExplicitLayout: report.hasExplicitLayout,
    explicitItemCount: report.explicitItemCount,
    derivedItemCount: report.derivedItemCount,
    analyzedSource: report.analyzedSource,
    runtimeAvailable: report.runtimeAvailable,
    itemCount: report.itemCount,
    validGeometryCount: report.validGeometryCount,
    outOfBoundsCount: report.outOfBoundsCount,
    collisions: report.collisions.map((collision) => ({
      firstDiagnosticId: collision.firstDiagnosticId,
      secondDiagnosticId: collision.secondDiagnosticId,
    })),
    solverStatus: report.solverStatus,
    differences: report.differences.map(cloneDifference),
    categories: { ...report.categories },
    // Message text is intentionally rebuilt from diagnostic metadata instead
    // of forwarding arbitrary data from a future integration boundary.
    issues: report.issues.map((issue) => ({
      code: issue.code,
      scope: issue.scope,
      ...(issue.breakpoint ? { breakpoint: issue.breakpoint } : {}),
      ...(issue.originalId ? { originalId: issue.originalId } : {}),
      ...(issue.diagnosticId ? { diagnosticId: issue.diagnosticId } : {}),
      ...(issue.stackId ? { stackId: issue.stackId } : {}),
      message: `${issue.code} (${issue.scope})`,
    })),
  };
}

function cloneStack(stack: ShadowStackReport): ShadowStackReport {
  return {
    diagnosticId: stack.diagnosticId,
    originalId: stack.originalId,
    kind: stack.kind,
    childCount: stack.childCount,
    breakpoints: Object.fromEntries(
      Object.entries(stack.breakpoints).map(([breakpoint, current]) => [breakpoint, {
        breakpoint: current.breakpoint,
        source: current.source,
        hasExplicitLayout: current.hasExplicitLayout,
        itemCount: current.itemCount,
        losslessGeometryCount: current.losslessGeometryCount,
        comparisonStatus: current.comparisonStatus,
        categories: { ...current.categories },
      }]),
    ) as ShadowStackReport['breakpoints'],
  };
}

/** Explicit projection: only geometric diagnostics cross the tab boundary. */
export function sanitizeShadowDiagnosticsReport(report: ShadowDiagnosticsReport): ShadowDiagnosticsReport {
  return {
    signature: report.signature,
    breakpoints: Object.fromEntries(
      Object.entries(report.breakpoints).map(([breakpoint, current]) => [breakpoint, cloneBreakpoint(current)]),
    ) as ShadowDiagnosticsReport['breakpoints'],
    stacks: report.stacks.map(cloneStack),
    summary: {
      rootElementCount: report.summary.rootElementCount,
      stackContainerCount: report.summary.stackContainerCount,
      stackChildCount: report.summary.stackChildCount,
      issueCount: report.summary.issueCount,
      categoryCounts: { ...report.summary.categoryCounts },
    },
    limitations: [...report.limitations],
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createShadowInspectorGeometryKey(
  report: Pick<ShadowDiagnosticsReport, 'signature'>,
  observedBreakpoint: DashboardGridBreakpoint | null,
) {
  return `geometry-${hashString(`${report.signature}|observed=${observedBreakpoint ?? 'none'}`)}`;
}

export function createShadowInspectorSnapshot(input: CreateSnapshotInput): ShadowInspectorSnapshot {
  const sequence = Math.max(1, Math.round(input.sequence));
  const geometryKey = createShadowInspectorGeometryKey(input.report, input.observedBreakpoint);
  return {
    protocolVersion: SHADOW_INSPECTOR_PROTOCOL_VERSION,
    snapshotId: `${geometryKey}:sequence-${sequence}`,
    geometryKey,
    sequence,
    lifecycle: sequence === 1 ? 'initial' : 'updated',
    authority: 'observed-unconfirmed',
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    observedBreakpoint: input.observedBreakpoint,
    source: input.source,
    timings: {
      analysisMs: input.timings?.analysisMs ?? null,
      conversionMs: input.timings?.conversionMs ?? null,
      comparisonMs: input.timings?.comparisonMs ?? null,
    },
    report: sanitizeShadowDiagnosticsReport(input.report),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const BREAKPOINTS = new Set<DashboardGridBreakpoint>(['2xl', 'xl', 'lg', 'md', 'sm', 'xs']);

/** Defensive same-origin channel validation before React consumes a message. */
export function isShadowInspectorSnapshot(value: unknown): value is ShadowInspectorSnapshot {
  if (!isRecord(value) || value.protocolVersion !== SHADOW_INSPECTOR_PROTOCOL_VERSION) return false;
  if (
    typeof value.snapshotId !== 'string' ||
    typeof value.geometryKey !== 'string' ||
    typeof value.sequence !== 'number' ||
    (value.lifecycle !== 'initial' && value.lifecycle !== 'updated') ||
    value.authority !== 'observed-unconfirmed' ||
    typeof value.capturedAt !== 'string'
  ) return false;
  if (value.observedBreakpoint !== null && !BREAKPOINTS.has(value.observedBreakpoint as DashboardGridBreakpoint)) return false;
  if (!isRecord(value.source) || (value.source.kind !== 'real-shadow' && value.source.kind !== 'fixture')) return false;
  if (!isRecord(value.timings) || !isRecord(value.report) || !isRecord(value.report.summary)) return false;
  const report = value.report;
  if (!isRecord(report.breakpoints) || !Array.isArray(report.stacks)) return false;
  return [...BREAKPOINTS].every((breakpoint) => isRecord(report.breakpoints[breakpoint]));
}

export function meaningfulDifferenceCategories(categories: readonly ShadowDifferenceCategory[]) {
  return categories.filter((category) => category !== 'EXACT_MATCH');
}
