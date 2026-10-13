import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import {
  createShadowInputSignature,
  type ShadowLayoutAdapterInput,
} from './shadowLayoutAdapter';
import {
  analyzeShadowLayouts,
  type ShadowDiagnosticsReport,
  type ShadowDifferenceCategory,
} from './shadowLayoutDiagnostics';

export const GRID_ENGINE_2_SHADOW_LOG_PREFIX = '[DomusUI:grid-engine2:shadow]';

type ShadowLogger = {
  readonly info: (message: string, details: unknown) => void;
  readonly warn: (message: string, details: unknown) => void;
};

type ShadowRunnerOptions = {
  readonly enabled: boolean;
  readonly previousSignature?: string | null;
  readonly logger?: ShadowLogger;
  readonly now?: () => number;
  readonly analyze?: (input: ShadowLayoutAdapterInput) => ShadowDiagnosticsReport;
};

export type ShadowRunnerResult =
  | { readonly status: 'disabled'; readonly nextSignature: null }
  | { readonly status: 'unchanged'; readonly nextSignature: string }
  | {
      readonly status: 'reported';
      readonly nextSignature: string;
      readonly durationMs: number;
      readonly report: ShadowDiagnosticsReport;
    }
  | {
      readonly status: 'failed';
      readonly nextSignature: string;
      readonly durationMs: number;
      readonly errorMessage: string;
    };

function compactCategoryCounts(counts: Readonly<Partial<Record<ShadowDifferenceCategory, number>>>) {
  return Object.fromEntries(
    Object.entries(counts)
      .filter((entry): entry is [ShadowDifferenceCategory, number] => typeof entry[1] === 'number' && entry[1] > 0)
      .sort(([first], [second]) => (first === second ? 0 : first < second ? -1 : 1)),
  );
}

function reportPayload(report: ShadowDiagnosticsReport, durationMs: number) {
  const breakpoints = Object.fromEntries(
    Object.entries(report.breakpoints).map(([breakpoint, current]) => [breakpoint as DashboardGridBreakpoint, {
      cols: current.cols,
      source: current.source,
      explicit: current.hasExplicitLayout,
      explicitItems: current.explicitItemCount,
      derivedItems: current.derivedItemCount,
      analyzedSource: current.analyzedSource,
      items: current.itemCount,
      valid: current.validGeometryCount,
      outOfBounds: current.outOfBoundsCount,
      collisions: current.collisions.length,
      solver: current.solverStatus,
      categories: compactCategoryCounts(current.categories),
    }]),
  );
  const stacks = report.stacks.map((stack) => ({
    id: stack.originalId,
    kind: stack.kind,
    children: stack.childCount,
    explicitBreakpoints: Object.values(stack.breakpoints).filter((entry) => entry.hasExplicitLayout).length,
    comparison: 'insufficient-data' as const,
  }));
  return {
    event: 'report',
    signature: report.signature,
    durationMs: Math.round(durationMs * 100) / 100,
    summary: {
      ...report.summary,
      categoryCounts: compactCategoryCounts(report.summary.categoryCounts),
    },
    breakpoints,
    stacks,
    limitations: report.limitations,
  };
}

function defaultNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeLog(logger: ShadowLogger, level: 'info' | 'warn', details: unknown) {
  try {
    logger[level](GRID_ENGINE_2_SHADOW_LOG_PREFIX, details);
  } catch {
    // Diagnostics must never surface logger failures into the Home lifecycle.
  }
}

/**
 * Isolated execution boundary. Disabled and duplicate inputs return before the
 * adapter or solver are invoked; failures are contained and reported once.
 */
export function runGridEngine2ShadowMode(
  input: ShadowLayoutAdapterInput,
  options: ShadowRunnerOptions,
): ShadowRunnerResult {
  if (!options.enabled) return { status: 'disabled', nextSignature: null };

  const signature = createShadowInputSignature(input);
  if (signature === options.previousSignature) {
    return { status: 'unchanged', nextSignature: signature };
  }

  const logger = options.logger ?? console;
  const now = options.now ?? defaultNow;
  const analyze = options.analyze ?? analyzeShadowLayouts;
  const startedAt = now();
  try {
    const report = analyze(input);
    const durationMs = Math.max(0, now() - startedAt);
    safeLog(logger, 'info', reportPayload(report, durationMs));
    return { status: 'reported', nextSignature: signature, durationMs, report };
  } catch (error) {
    const durationMs = Math.max(0, now() - startedAt);
    const message = errorMessage(error);
    safeLog(logger, 'warn', {
      event: 'error',
      signature,
      durationMs: Math.round(durationMs * 100) / 100,
      message,
    });
    return {
      status: 'failed',
      nextSignature: signature,
      durationMs,
      errorMessage: message,
    };
  }
}
