import {
  calculateGridEngineRootItemPosition,
  type RootRendererGeometry,
} from './gridEngineRootGeometry';
import type {
  RuntimeGeometryInspectionReport,
  RuntimeGeometryStructuralContext,
} from './runtimeGeometryDiagnostics';
import { fingerprintRuntimeShadowId } from './runtimeShadowIdAudit';

export const GRID_ENGINE_2_RUNTIME_GEOMETRY_LOG_PREFIX = '[DomusUI:grid-engine2:runtime-geometry]';

export type RuntimeGeometryDomRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type RuntimeGeometryDomSnapshotElement = Readonly<{
  id: string;
  rect: RuntimeGeometryDomRect | null;
  hasRunningAnimation: boolean;
}>;

export type RuntimeGeometryDomSnapshot = Readonly<{
  renderer: 'legacy' | 'grid-engine-2' | 'unavailable';
  structuralContext: RuntimeGeometryStructuralContext | null;
  canvasRect: RuntimeGeometryDomRect | null;
  elements: readonly RuntimeGeometryDomSnapshotElement[];
  acquisitionMs: number;
}>;

export type RuntimeGeometryDomElementResult = Readonly<{
  id: string;
  status: 'stable' | 'measurement-transient' | 'unavailable';
  renderer: RuntimeGeometryDomSnapshot['renderer'];
  observed: RuntimeGeometryDomRect | null;
  legacyExpectedPixels: RuntimeGeometryDomRect | null;
  legacyInputToObservedPixels: Readonly<{
    deltaX: number;
    deltaY: number;
    deltaW: number;
    deltaH: number;
  }> | null;
  reason: string;
}>;

export type RuntimeGeometryDomInspection = Readonly<{
  status: 'stable' | 'measurement-transient' | 'unavailable';
  renderer: RuntimeGeometryDomSnapshot['renderer'];
  elementCount: number;
  stableCount: number;
  transientCount: number;
  unavailableCount: number;
  overlapCount: number;
  overlapPairs: readonly (readonly [string, string])[];
  elements: readonly RuntimeGeometryDomElementResult[];
  timingMs: number;
  limitations: readonly string[];
}>;

type RuntimeGeometryLogger = Readonly<{
  info: (message: string, details: unknown) => void;
}>;

type ReadDomSnapshotInput = Readonly<{
  host: HTMLElement | null;
  elementIds: readonly string[];
  structuralContext: RuntimeGeometryStructuralContext | null;
  now?: () => number;
}>;

type FinalizeDomInspectionInput = Readonly<{
  comparison: RuntimeGeometryInspectionReport;
  first: RuntimeGeometryDomSnapshot;
  second: RuntimeGeometryDomSnapshot;
  geometry: RootRendererGeometry;
  tolerancePx?: number;
}>;

type ScheduleDomInspectionInput = Readonly<{
  host: HTMLElement;
  comparison: RuntimeGeometryInspectionReport;
  geometry: RootRendererGeometry;
  signature: string;
  logger?: RuntimeGeometryLogger;
  getCurrentStructuralContext: () => RuntimeGeometryStructuralContext | null;
}>;

function defaultNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function domRect(rect: DOMRect, canvas: DOMRect): RuntimeGeometryDomRect {
  return {
    left: round(rect.left - canvas.left),
    top: round(rect.top - canvas.top),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function sameContext(
  first: RuntimeGeometryStructuralContext | null,
  second: RuntimeGeometryStructuralContext | null,
) {
  if (!first && !second) return true;
  return Boolean(
    first && second &&
    first.generation === second.generation &&
    first.revision === second.revision &&
    first.fingerprint === second.fingerprint,
  );
}

function rectStable(first: RuntimeGeometryDomRect, second: RuntimeGeometryDomRect, tolerance: number) {
  return (
    Math.abs(first.left - second.left) <= tolerance &&
    Math.abs(first.top - second.top) <= tolerance &&
    Math.abs(first.width - second.width) <= tolerance &&
    Math.abs(first.height - second.height) <= tolerance
  );
}

function rectsOverlap(first: RuntimeGeometryDomRect, second: RuntimeGeometryDomRect, tolerance: number) {
  return (
    first.left < second.left + second.width - tolerance &&
    first.left + first.width > second.left + tolerance &&
    first.top < second.top + second.height - tolerance &&
    first.top + first.height > second.top + tolerance
  );
}

function runningAnimation(element: Element) {
  if (typeof element.getAnimations !== 'function') return false;
  return element.getAnimations().some((animation) => animation.playState === 'running');
}

/** Performs one batched, read-only layout acquisition. */
export function readRuntimeGeometryDomSnapshot(input: ReadDomSnapshotInput): RuntimeGeometryDomSnapshot {
  const now = input.now ?? defaultNow;
  const startedAt = now();
  const customCanvas = input.host?.querySelector<HTMLElement>('[data-grid-engine-root-renderer="grid-engine-2"]') ?? null;
  const canvas = customCanvas ?? input.host?.querySelector<HTMLElement>('.sections-grid.react-grid-layout') ?? null;
  if (!canvas) {
    return {
      renderer: 'unavailable',
      structuralContext: input.structuralContext,
      canvasRect: null,
      elements: input.elementIds.map((id) => ({ id, rect: null, hasRunningAnimation: false })),
      acquisitionMs: round(now() - startedAt),
    };
  }

  const renderer = customCanvas ? 'grid-engine-2' : 'legacy';
  const canvasBounds = canvas.getBoundingClientRect();
  const markers = new Map(
    [...canvas.querySelectorAll<HTMLElement>('[data-grid-engine-runtime-geometry-id]')]
      .map((marker) => [marker.dataset.gridEngineRuntimeGeometryId ?? '', marker] as const),
  );
  const elements = input.elementIds.map((id): RuntimeGeometryDomSnapshotElement => {
    const marker = markers.get(id);
    const root = marker?.closest<HTMLElement>(
      renderer === 'grid-engine-2' ? '[data-grid-engine-root-item]' : '.react-grid-item',
    ) ?? null;
    if (!root || root.closest('.sections-grid') !== canvas) {
      return { id, rect: null, hasRunningAnimation: false };
    }
    return {
      id,
      rect: domRect(root.getBoundingClientRect(), canvasBounds),
      hasRunningAnimation: runningAnimation(root),
    };
  });

  return {
    renderer,
    structuralContext: input.structuralContext,
    canvasRect: {
      left: round(canvasBounds.left),
      top: round(canvasBounds.top),
      width: round(canvasBounds.width),
      height: round(canvasBounds.height),
    },
    elements,
    acquisitionMs: round(now() - startedAt),
  };
}

/**
 * Requires two consecutive observations. Cell coordinates are converted to
 * expected pixels before comparison; cell and pixel deltas are never mixed.
 */
export function finalizeRuntimeGeometryDomInspection(
  input: FinalizeDomInspectionInput,
): RuntimeGeometryDomInspection {
  const tolerance = input.tolerancePx ?? 1;
  const contextMatches = (
    sameContext(input.first.structuralContext, input.second.structuralContext) &&
    sameContext(input.second.structuralContext, input.comparison.structuralContext)
  );
  const renderer = input.first.renderer === input.second.renderer
    ? input.second.renderer
    : 'unavailable';
  const firstById = new Map(input.first.elements.map((element) => [element.id, element]));
  const secondById = new Map(input.second.elements.map((element) => [element.id, element]));

  const elements = input.comparison.elements.map((comparison): RuntimeGeometryDomElementResult => {
    const first = firstById.get(comparison.id);
    const second = secondById.get(comparison.id);
    if (!contextMatches) {
      return {
        id: comparison.id,
        status: 'unavailable',
        renderer,
        observed: null,
        legacyExpectedPixels: null,
        legacyInputToObservedPixels: null,
        reason: 'structural-context-changed-before-dom-acquisition',
      };
    }
    if (renderer === 'unavailable' || !first?.rect || !second?.rect) {
      return {
        id: comparison.id,
        status: 'unavailable',
        renderer,
        observed: null,
        legacyExpectedPixels: null,
        legacyInputToObservedPixels: null,
        reason: 'root-container-not-observable',
      };
    }

    const expected = calculateGridEngineRootItemPosition(comparison.legacyRuntimeInput, input.geometry);
    const legacyExpectedPixels: RuntimeGeometryDomRect = {
      left: expected.left,
      top: expected.top,
      width: expected.width,
      height: expected.height,
    };
    const transient = first.hasRunningAnimation || second.hasRunningAnimation || !rectStable(first.rect, second.rect, tolerance);
    return {
      id: comparison.id,
      status: transient ? 'measurement-transient' : 'stable',
      renderer,
      observed: second.rect,
      legacyExpectedPixels,
      legacyInputToObservedPixels: {
        deltaX: round(second.rect.left - expected.left),
        deltaY: round(second.rect.top - expected.top),
        deltaW: round(second.rect.width - expected.width),
        deltaH: round(second.rect.height - expected.height),
      },
      reason: transient ? 'consecutive-dom-observations-not-stable' : 'two-consecutive-dom-observations-agree',
    };
  });

  const stableRects = elements.flatMap((element) =>
    element.status === 'stable' && element.observed ? [{ id: element.id, rect: element.observed }] : []);
  const overlapPairs = stableRects.flatMap((element, index) => stableRects.slice(0, index)
    .filter((previous) => rectsOverlap(element.rect, previous.rect, tolerance))
    .map((previous) => [previous.id, element.id] as const));
  const transientCount = elements.filter((element) => element.status === 'measurement-transient').length;
  const unavailableCount = elements.filter((element) => element.status === 'unavailable').length;
  const status = unavailableCount === elements.length
    ? 'unavailable'
    : transientCount > 0
      ? 'measurement-transient'
      : 'stable';

  return {
    status,
    renderer,
    elementCount: elements.length,
    stableCount: elements.filter((element) => element.status === 'stable').length,
    transientCount,
    unavailableCount,
    overlapCount: overlapPairs.length,
    overlapPairs,
    elements,
    timingMs: round(input.first.acquisitionMs + input.second.acquisitionMs),
    limitations: [
      'only-the-active-renderer-was-observed',
      ...(status === 'measurement-transient' ? ['dom-transition-or-animation-observed'] : []),
      ...(status === 'unavailable' ? ['dom-geometry-unavailable'] : []),
    ],
  };
}

export function createRuntimeGeometryConsolePayload(
  comparison: RuntimeGeometryInspectionReport,
  dom: RuntimeGeometryDomInspection,
  signature: string,
) {
  const domById = new Map(dom.elements.map((element) => [element.id, element]));
  const compactCells = (item: RuntimeGeometryInspectionReport['elements'][number]['structural']) => ({
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    index: item.index,
  });
  return {
    event: 'geometry-report',
    signature,
    breakpoint: comparison.breakpoint,
    status: comparison.status,
    issues: comparison.issueCodes,
    baseline: {
      quality: comparison.baselineQuality,
      confidence: comparison.comparisonConfidence,
      limitations: comparison.limitations,
    },
    structuralContext: comparison.structuralContext,
    counts: {
      roots: comparison.elementCount,
      solverChanges: comparison.changedBySolverCount,
      solverLegacyDifferences: comparison.solverLegacyDifferenceCount,
      directCollisions: comparison.directCollisionCount,
      collisionChainCandidates: comparison.collisionChainCandidateCount,
      unexplainedMovements: comparison.unexplainedMovementCount,
      legacyCompactionCandidates: comparison.legacyCompactionCandidateCount,
      finalCellOverlaps: comparison.finalOverlapCount,
      legacyInputOverlaps: comparison.legacyInputOverlapCount,
      stableDom: dom.stableCount,
      transientDom: dom.transientCount,
      unavailableDom: dom.unavailableCount,
      observedDomOverlaps: dom.overlapCount,
    },
    elements: comparison.elements.map((element) => {
      const observed = domById.get(element.id);
      return {
        idFingerprint: fingerprintRuntimeShadowId(element.id),
        structural: compactCells(element.structural),
        solverCandidate: compactCells(element.solverCandidate),
        legacyRuntimeInput: compactCells(element.legacyRuntimeInput),
        deltas: {
          structuralToSolverCells: element.structuralToSolver,
          structuralToLegacyCells: element.structuralToLegacy,
          solverToLegacyCells: element.solverToLegacy,
          legacyInputToObservedPixels: observed?.legacyInputToObservedPixels ?? null,
        },
        classification: {
          solver: element.solverClassification,
          legacy: element.legacyClassification,
          evidence: element.evidenceQuality,
        },
        directCollisionWith: element.directCollisionWith.map(fingerprintRuntimeShadowId),
        chainCandidateFrom: element.chainCandidateFrom.map(fingerprintRuntimeShadowId),
        reasons: element.reasons,
        dom: observed ? {
          status: observed.status,
          renderer: observed.renderer,
          observed: observed.observed,
          expectedFromLegacyPixels: observed.legacyExpectedPixels,
          reason: observed.reason,
        } : null,
      };
    }),
    dom: {
      status: dom.status,
      renderer: dom.renderer,
      limitations: dom.limitations,
      overlapPairs: dom.overlapPairs.map(([first, second]) => [
        fingerprintRuntimeShadowId(first),
        fingerprintRuntimeShadowId(second),
      ]),
    },
    timings: {
      differenceAnalysisMs: comparison.timings.differenceAnalysisMs,
      collisionAnalysisMs: comparison.timings.collisionAnalysisMs,
      totalCellAnalysisMs: comparison.timings.totalMs,
      domAcquisitionMs: dom.timingMs,
    },
  };
}

/** Schedules exactly two animation frames and is fully cancellable. */
export function scheduleRuntimeGeometryDomInspection(input: ScheduleDomInspectionInput) {
  let cancelled = false;
  let firstFrame = 0;
  let secondFrame = 0;
  const ids = input.comparison.elements.map((element) => element.id);
  firstFrame = window.requestAnimationFrame(() => {
    if (cancelled) return;
    const first = readRuntimeGeometryDomSnapshot({
      host: input.host,
      elementIds: ids,
      structuralContext: input.getCurrentStructuralContext(),
    });
    secondFrame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const second = readRuntimeGeometryDomSnapshot({
        host: input.host,
        elementIds: ids,
        structuralContext: input.getCurrentStructuralContext(),
      });
      const dom = finalizeRuntimeGeometryDomInspection({
        comparison: input.comparison,
        first,
        second,
        geometry: input.geometry,
      });
      try {
        (input.logger ?? console).info(
          GRID_ENGINE_2_RUNTIME_GEOMETRY_LOG_PREFIX,
          createRuntimeGeometryConsolePayload(input.comparison, dom, input.signature),
        );
      } catch {
        // Console diagnostics must never affect Home rendering.
      }
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(firstFrame);
    window.cancelAnimationFrame(secondFrame);
  };
}
