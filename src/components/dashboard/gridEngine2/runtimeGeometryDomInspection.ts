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
export const GRID_ENGINE_2_RUNTIME_GEOMETRY_DEADLINE_MS = 1_200;

export type RuntimeGeometryDomMeasurementReason =
  | 'geometry-animation-running'
  | 'inter-frame-rect-delta'
  | 'measurement-deadline-exceeded'
  | 'measurement-context-invalidated'
  | 'root-container-not-observable'
  | 'two-consecutive-dom-observations-agree';

export type RuntimeGeometryDomRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type RuntimeGeometryDomSnapshotElement = Readonly<{
  id: string;
  rect: RuntimeGeometryDomRect | null;
  hasRunningGeometryAnimation: boolean;
}>;

export type RuntimeGeometryDomSnapshot = Readonly<{
  renderer: 'legacy' | 'grid-engine-2' | 'unavailable';
  structuralContext: RuntimeGeometryStructuralContext | null;
  canvasRect: RuntimeGeometryDomRect | null;
  observedRootIds: readonly string[];
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
  maxInterFrameDeltaPx: number | null;
  reason: RuntimeGeometryDomMeasurementReason;
}>;

export type RuntimeGeometryDomAcquisition = Readonly<{
  stabilizationWaitMs: number;
  snapshotCount: number;
  relevantGeometryAnimationCount: number;
  deadlineReached: boolean;
  reducedMotion: boolean;
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
  acquisition: RuntimeGeometryDomAcquisition;
  limitations: readonly string[];
}>;

export type RuntimeGeometryDomMeasurementContext = Readonly<{
  breakpoint: string;
  renderer: Exclude<RuntimeGeometryDomSnapshot['renderer'], 'unavailable'>;
  diagnosticSignature: string;
  geometrySignature: string;
  structuralContext: RuntimeGeometryStructuralContext | null;
  rootIds: readonly string[];
}>;

export type RuntimeGeometryDomScheduleMetrics = Readonly<{
  stabilizationWaitMs: number;
  snapshotCount: number;
  relevantGeometryAnimationCount: number;
  deadlineReached: boolean;
  cancellationCount: number;
  contextInvalidated: boolean;
  reported: boolean;
}>;

export type RuntimeGeometryDomInspectionHandle = Readonly<{
  cancel: () => void;
  getMetrics: () => RuntimeGeometryDomScheduleMetrics;
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
  forcedTransientReason?: Extract<
    RuntimeGeometryDomMeasurementReason,
    'measurement-deadline-exceeded'
  >;
  acquisition?: Partial<RuntimeGeometryDomAcquisition>;
}>;

type ScheduleDomInspectionInput = Readonly<{
  host: HTMLElement;
  comparison: RuntimeGeometryInspectionReport;
  geometry: RootRendererGeometry;
  signature: string;
  logger?: RuntimeGeometryLogger;
  measurementContext: RuntimeGeometryDomMeasurementContext;
  getCurrentMeasurementContext: () => RuntimeGeometryDomMeasurementContext;
  deadlineMs?: number;
  runtime?: Partial<RuntimeGeometryDomSchedulerRuntime>;
}>;

type RuntimeGeometryDomSchedulerRuntime = Readonly<{
  now: () => number;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (handle: number) => void;
}>;

type ResolvedCanvas = Readonly<{
  canvas: HTMLElement | null;
  renderer: RuntimeGeometryDomSnapshot['renderer'];
}>;

const GEOMETRY_ANIMATION_PROPERTIES = new Set([
  'transform', 'translate', 'scale', 'rotate',
  'left', 'right', 'top', 'bottom',
  'inset', 'inset-block', 'inset-block-start', 'inset-block-end',
  'inset-inline', 'inset-inline-start', 'inset-inline-end',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'border-width', 'border-left-width', 'border-right-width', 'border-top-width', 'border-bottom-width',
  'box-sizing', 'flex-basis', 'grid-area', 'grid-row', 'grid-column',
]);

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

function sameStrings(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length) return false;
  const sortedFirst = [...first].sort();
  const sortedSecond = [...second].sort();
  return sortedFirst.every((value, index) => value === sortedSecond[index]);
}

function sameMeasurementContext(
  first: RuntimeGeometryDomMeasurementContext,
  second: RuntimeGeometryDomMeasurementContext,
) {
  return first.breakpoint === second.breakpoint &&
    first.renderer === second.renderer &&
    first.diagnosticSignature === second.diagnosticSignature &&
    first.geometrySignature === second.geometrySignature &&
    sameContext(first.structuralContext, second.structuralContext) &&
    sameStrings(first.rootIds, second.rootIds);
}

function rectStable(first: RuntimeGeometryDomRect, second: RuntimeGeometryDomRect, tolerance: number) {
  return (
    Math.abs(first.left - second.left) <= tolerance &&
    Math.abs(first.top - second.top) <= tolerance &&
    Math.abs(first.width - second.width) <= tolerance &&
    Math.abs(first.height - second.height) <= tolerance
  );
}

function maxRectDelta(first: RuntimeGeometryDomRect, second: RuntimeGeometryDomRect) {
  return round(Math.max(
    Math.abs(first.left - second.left),
    Math.abs(first.top - second.top),
    Math.abs(first.width - second.width),
    Math.abs(first.height - second.height),
  ));
}

function rectsOverlap(first: RuntimeGeometryDomRect, second: RuntimeGeometryDomRect, tolerance: number) {
  return (
    first.left < second.left + second.width - tolerance &&
    first.left + first.width > second.left + tolerance &&
    first.top < second.top + second.height - tolerance &&
    first.top + first.height > second.top + tolerance
  );
}

function normalizeAnimationProperty(property: string) {
  return property
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    .toLowerCase();
}

function isGeometryAnimationProperty(property: string) {
  return GEOMETRY_ANIMATION_PROPERTIES.has(normalizeAnimationProperty(property));
}

function animationProperties(animation: Animation) {
  const properties = new Set<string>();
  const transitionProperty = (animation as Animation & { readonly transitionProperty?: unknown }).transitionProperty;
  if (typeof transitionProperty === 'string') {
    transitionProperty.split(',').map((entry) => entry.trim()).filter(Boolean).forEach((entry) => properties.add(entry));
  }
  const effect = animation.effect;
  if (effect && 'getKeyframes' in effect && typeof effect.getKeyframes === 'function') {
    try {
      effect.getKeyframes().forEach((keyframe) => {
        Object.keys(keyframe).forEach((property) => {
          if (property !== 'offset' && property !== 'computedOffset' && property !== 'easing' && property !== 'composite') {
            properties.add(property);
          }
        });
      });
    } catch {
      // A browser may expose an animation whose keyframes are not inspectable.
    }
  }
  return properties;
}

function isRunningAnimation(animation: Animation) {
  return animation.playState === 'running' || animation.pending === true;
}

function isRelevantGeometryAnimation(animation: Animation, root: HTMLElement) {
  if (!isRunningAnimation(animation)) return false;
  const effect = animation.effect;
  if (effect && 'target' in effect && effect.target !== root) return false;
  return [...animationProperties(animation)].some(isGeometryAnimationProperty);
}

function rootAnimations(root: HTMLElement) {
  if (typeof root.getAnimations !== 'function') return [];
  try {
    // Explicitly exclude descendants: content-only animations must not delay
    // root geometry diagnostics.
    return root.getAnimations({ subtree: false });
  } catch {
    return root.getAnimations();
  }
}

function relevantGeometryAnimations(root: HTMLElement) {
  return rootAnimations(root).filter((animation) => isRelevantGeometryAnimation(animation, root));
}

function resolveCanvas(host: HTMLElement | null): ResolvedCanvas {
  const customCanvas = host?.querySelector<HTMLElement>('[data-grid-engine-root-renderer="grid-engine-2"]') ?? null;
  if (customCanvas) return { canvas: customCanvas, renderer: 'grid-engine-2' };
  const legacyCanvas = host?.querySelector<HTMLElement>('.sections-grid.react-grid-layout') ?? null;
  return legacyCanvas
    ? { canvas: legacyCanvas, renderer: 'legacy' }
    : { canvas: null, renderer: 'unavailable' };
}

function resolveRootElements(canvas: HTMLElement, renderer: RuntimeGeometryDomSnapshot['renderer']) {
  const roots = new Map<string, HTMLElement>();
  [...canvas.querySelectorAll<HTMLElement>('[data-grid-engine-runtime-geometry-id]')].forEach((marker) => {
    const id = marker.dataset.gridEngineRuntimeGeometryId ?? '';
    const root = marker.closest<HTMLElement>(
      renderer === 'grid-engine-2' ? '[data-grid-engine-root-item]' : '.react-grid-item',
    );
    if (id && root && root.closest('.sections-grid') === canvas) roots.set(id, root);
  });
  return roots;
}

function collectRelevantGeometryAnimations(
  roots: ReadonlyMap<string, HTMLElement>,
  expectedIds: readonly string[],
) {
  const animations = new Set<Animation>();
  expectedIds.forEach((id) => {
    const root = roots.get(id);
    if (root) relevantGeometryAnimations(root).forEach((animation) => animations.add(animation));
  });
  return [...animations];
}

/** Performs one batched, read-only layout acquisition. */
export function readRuntimeGeometryDomSnapshot(input: ReadDomSnapshotInput): RuntimeGeometryDomSnapshot {
  const now = input.now ?? defaultNow;
  const startedAt = now();
  const resolved = resolveCanvas(input.host);
  const { canvas, renderer } = resolved;
  if (!canvas) {
    return {
      renderer: 'unavailable',
      structuralContext: input.structuralContext,
      canvasRect: null,
      observedRootIds: [],
      elements: input.elementIds.map((id) => ({ id, rect: null, hasRunningGeometryAnimation: false })),
      acquisitionMs: round(now() - startedAt),
    };
  }

  const canvasBounds = canvas.getBoundingClientRect();
  const roots = resolveRootElements(canvas, renderer);
  const elements = input.elementIds.map((id): RuntimeGeometryDomSnapshotElement => {
    const root = roots.get(id);
    if (!root) {
      return { id, rect: null, hasRunningGeometryAnimation: false };
    }
    return {
      id,
      rect: domRect(root.getBoundingClientRect(), canvasBounds),
      hasRunningGeometryAnimation: relevantGeometryAnimations(root).length > 0,
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
    observedRootIds: [...roots.keys()].sort(),
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
  const rendererMatches = input.first.renderer === input.second.renderer;
  const renderer = rendererMatches ? input.second.renderer : 'unavailable';
  const contextMatches = (
    rendererMatches &&
    sameContext(input.first.structuralContext, input.second.structuralContext) &&
    sameContext(input.second.structuralContext, input.comparison.structuralContext) &&
    (
      renderer === 'unavailable' || (
        sameStrings(input.first.observedRootIds, input.second.observedRootIds) &&
        sameStrings(input.second.observedRootIds, input.comparison.elements.map((element) => element.id))
      )
    )
  );
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
        maxInterFrameDeltaPx: null,
        reason: 'measurement-context-invalidated',
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
        maxInterFrameDeltaPx: null,
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
    const maximumDelta = maxRectDelta(first.rect, second.rect);
    const animationRunning = first.hasRunningGeometryAnimation || second.hasRunningGeometryAnimation;
    const geometryStable = rectStable(first.rect, second.rect, tolerance);
    const reason: RuntimeGeometryDomMeasurementReason = input.forcedTransientReason ?? (
      animationRunning
        ? 'geometry-animation-running'
        : !geometryStable
          ? 'inter-frame-rect-delta'
          : 'two-consecutive-dom-observations-agree'
    );
    const transient = reason !== 'two-consecutive-dom-observations-agree';
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
      maxInterFrameDeltaPx: maximumDelta,
      reason,
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
  const defaultAcquisition: RuntimeGeometryDomAcquisition = {
    stabilizationWaitMs: 0,
    snapshotCount: 2,
    relevantGeometryAnimationCount: 0,
    deadlineReached: input.forcedTransientReason === 'measurement-deadline-exceeded',
    reducedMotion: false,
  };
  const acquisition = { ...defaultAcquisition, ...input.acquisition };
  const transientReasons = new Set(
    elements.filter((element) => element.status === 'measurement-transient').map((element) => element.reason),
  );

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
    acquisition,
    limitations: [
      'only-the-active-renderer-was-observed',
      ...(status === 'measurement-transient' ? ['dom-transition-or-animation-observed'] : []),
      ...[...transientReasons],
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
      domSnapshots: dom.acquisition.snapshotCount,
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
          maxInterFrameDeltaPx: observed.maxInterFrameDeltaPx,
          reason: observed.reason,
        } : null,
      };
    }),
    dom: {
      status: dom.status,
      renderer: dom.renderer,
      limitations: dom.limitations,
      acquisition: dom.acquisition,
      overlapPairs: dom.overlapPairs.map(([first, second]) => [
        fingerprintRuntimeShadowId(first),
        fingerprintRuntimeShadowId(second),
      ]),
    },
    timings: {
      differenceAnalysisMs: comparison.timings.differenceAnalysisMs,
      collisionAnalysisMs: comparison.timings.collisionAnalysisMs,
      totalCellAnalysisMs: comparison.timings.totalMs,
      domStabilizationWaitMs: dom.acquisition.stabilizationWaitMs,
      domAcquisitionMs: dom.timingMs,
    },
  };
}

function schedulerRuntime(overrides: Partial<RuntimeGeometryDomSchedulerRuntime> | undefined) {
  return {
    now: overrides?.now ?? defaultNow,
    requestAnimationFrame: overrides?.requestAnimationFrame ?? window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: overrides?.cancelAnimationFrame ?? window.cancelAnimationFrame.bind(window),
    setTimeout: overrides?.setTimeout ?? ((callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs)),
    clearTimeout: overrides?.clearTimeout ?? ((handle: number) => window.clearTimeout(handle)),
  } satisfies RuntimeGeometryDomSchedulerRuntime;
}

function reducedMotionRequested() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Waits at most once for relevant root geometry animations, then performs two
 * frame-separated DOM reads. A global deadline guarantees that an infinite
 * animation or a throttled frame cannot keep the observation alive forever.
 */
export function scheduleRuntimeGeometryDomInspection(
  input: ScheduleDomInspectionInput,
): RuntimeGeometryDomInspectionHandle {
  const runtime = schedulerRuntime(input.runtime);
  const deadlineMs = Math.max(1, Math.round(input.deadlineMs ?? GRID_ENGINE_2_RUNTIME_GEOMETRY_DEADLINE_MS));
  const scheduledAt = runtime.now();
  const deadlineAt = scheduledAt + deadlineMs;
  const ids = input.comparison.elements.map((element) => element.id);
  let observedCanvas: HTMLElement | null = null;
  let observedRenderer: Exclude<RuntimeGeometryDomSnapshot['renderer'], 'unavailable'> | null = null;
  let observedRootNodes = new Map<string, HTMLElement>();
  let observationStarted = false;
  let cancelled = false;
  let reported = false;
  let contextInvalidated = false;
  let cancellationCount = 0;
  let deadlineReached = false;
  let snapshotCount = 0;
  let relevantGeometryAnimationCount = 0;
  let stabilizationWaitMs = 0;
  let waitStartedAt: number | null = null;
  let waitedForAnimations = false;
  let firstFrame = 0;
  let secondFrame = 0;
  let deadlineTimer = 0;
  let rendererObserver: MutationObserver | null = null;

  const metrics = (): RuntimeGeometryDomScheduleMetrics => ({
    stabilizationWaitMs: round(stabilizationWaitMs),
    snapshotCount,
    relevantGeometryAnimationCount,
    deadlineReached,
    cancellationCount,
    contextInvalidated,
    reported,
  });

  const clearScheduledWork = () => {
    if (firstFrame) runtime.cancelAnimationFrame(firstFrame);
    if (secondFrame) runtime.cancelAnimationFrame(secondFrame);
    if (deadlineTimer) runtime.clearTimeout(deadlineTimer);
    rendererObserver?.disconnect();
    firstFrame = 0;
    secondFrame = 0;
    deadlineTimer = 0;
    rendererObserver = null;
  };

  const invalidate = () => {
    if (cancelled || reported) return;
    cancelled = true;
    contextInvalidated = true;
    cancellationCount += 1;
    clearScheduledWork();
  };

  const measurementContextStillMatches = () => {
    if (cancelled || !input.host.isConnected) return false;
    return sameMeasurementContext(input.measurementContext, input.getCurrentMeasurementContext());
  };

  const initializeExpectedDom = () => {
    if (!measurementContextStillMatches()) return false;
    const current = resolveCanvas(input.host);
    if (!current.canvas || current.renderer !== input.measurementContext.renderer) return false;
    const roots = resolveRootElements(current.canvas, current.renderer);
    if (!sameStrings([...roots.keys()], ids)) return false;
    if (!ids.every((id) => roots.has(id))) return false;
    observedCanvas = current.canvas;
    observedRenderer = current.renderer;
    observedRootNodes = new Map(ids.map((id) => [id, roots.get(id)!]));
    return true;
  };

  const currentDomStillMatches = () => {
    if (!measurementContextStillMatches() || !observedCanvas || !observedRenderer) return false;
    const current = resolveCanvas(input.host);
    if (current.canvas !== observedCanvas || current.renderer !== observedRenderer) return false;
    const roots = resolveRootElements(current.canvas, current.renderer);
    if (!sameStrings([...roots.keys()], ids)) return false;
    return ids.every((id) => roots.get(id) === observedRootNodes.get(id));
  };

  const readSnapshot = () => {
    snapshotCount += 1;
    return readRuntimeGeometryDomSnapshot({
      host: input.host,
      elementIds: ids,
      structuralContext: input.getCurrentMeasurementContext().structuralContext,
      now: runtime.now,
    });
  };

  const publish = (
    first: RuntimeGeometryDomSnapshot,
    second: RuntimeGeometryDomSnapshot,
    forcedTransientReason?: 'measurement-deadline-exceeded',
  ) => {
    if (cancelled || reported) return;
    if (!currentDomStillMatches()) {
      invalidate();
      return;
    }
    reported = true;
    clearScheduledWork();
    const dom = finalizeRuntimeGeometryDomInspection({
      comparison: input.comparison,
      first,
      second,
      geometry: input.geometry,
      forcedTransientReason,
      acquisition: {
        stabilizationWaitMs: round(stabilizationWaitMs),
        snapshotCount,
        relevantGeometryAnimationCount,
        deadlineReached,
        reducedMotion: reducedMotionRequested(),
      },
    });
    try {
      (input.logger ?? console).info(
        GRID_ENGINE_2_RUNTIME_GEOMETRY_LOG_PREFIX,
        createRuntimeGeometryConsolePayload(input.comparison, dom, input.signature),
      );
    } catch {
      // Console diagnostics must never affect Home rendering.
    }
  };

  const publishDeadline = () => {
    if (cancelled || reported) return;
    if (!measurementContextStillMatches()) {
      invalidate();
      return;
    }
    if (!observedCanvas) {
      // The expected renderer never committed. Do not diagnose its temporary
      // fallback as though it were the requested measurement context.
      deadlineReached = true;
      cancelled = true;
      cancellationCount += 1;
      clearScheduledWork();
      return;
    }
    if (!currentDomStillMatches()) {
      invalidate();
      return;
    }
    deadlineReached = true;
    if (waitStartedAt !== null) stabilizationWaitMs = Math.max(0, runtime.now() - waitStartedAt);
    if (firstFrame) runtime.cancelAnimationFrame(firstFrame);
    if (secondFrame) runtime.cancelAnimationFrame(secondFrame);
    firstFrame = 0;
    secondFrame = 0;
    // At the deadline we deliberately do not infer stability from synchronous
    // reads; the forced reason keeps the result transient.
    const first = readSnapshot();
    const second = readSnapshot();
    publish(first, second, 'measurement-deadline-exceeded');
  };

  const scheduleTwoFrames = () => {
    if (cancelled || reported) return;
    firstFrame = runtime.requestAnimationFrame(() => {
      firstFrame = 0;
      if (!currentDomStillMatches()) {
        invalidate();
        return;
      }
      const current = resolveCanvas(input.host);
      const roots = current.canvas ? resolveRootElements(current.canvas, current.renderer) : new Map<string, HTMLElement>();
      const animations = collectRelevantGeometryAnimations(roots, ids);
      relevantGeometryAnimationCount = Math.max(relevantGeometryAnimationCount, animations.length);
      if (!waitedForAnimations && animations.length > 0) {
        waitedForAnimations = true;
        waitStartedAt = runtime.now();
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
          if (cancelled || reported) return;
          if (!currentDomStillMatches()) {
            invalidate();
            return;
          }
          stabilizationWaitMs = Math.max(0, runtime.now() - (waitStartedAt ?? runtime.now()));
          scheduleTwoFrames();
        });
        return;
      }
      const first = readSnapshot();
      secondFrame = runtime.requestAnimationFrame(() => {
        secondFrame = 0;
        if (!currentDomStillMatches()) {
          invalidate();
          return;
        }
        const second = readSnapshot();
        publish(first, second);
      });
    });
  };

  const beginObservation = () => {
    if (cancelled || reported || observationStarted) return;
    observationStarted = true;
    if (!currentDomStillMatches()) {
      invalidate();
      return;
    }
    const animations = collectRelevantGeometryAnimations(observedRootNodes, ids);
    relevantGeometryAnimationCount = animations.length;
    if (animations.length > 0) {
      waitedForAnimations = true;
      waitStartedAt = runtime.now();
      void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
        if (cancelled || reported) return;
        if (!currentDomStillMatches()) {
          invalidate();
          return;
        }
        stabilizationWaitMs = Math.max(0, runtime.now() - (waitStartedAt ?? runtime.now()));
        scheduleTwoFrames();
      });
    } else {
      scheduleTwoFrames();
    }
  };

  deadlineTimer = runtime.setTimeout(publishDeadline, Math.max(1, deadlineAt - runtime.now()));
  if (!measurementContextStillMatches()) {
    invalidate();
  } else if (initializeExpectedDom()) {
    beginObservation();
  } else if (typeof MutationObserver === 'function') {
    // React may temporarily expose the legacy Suspense fallback while the
    // development-only custom renderer chunk is loading. Observe that commit
    // event once instead of sampling or accepting the fallback as definitive.
    rendererObserver = new MutationObserver(() => {
      if (!measurementContextStillMatches()) {
        invalidate();
        return;
      }
      if (initializeExpectedDom()) {
        rendererObserver?.disconnect();
        rendererObserver = null;
        beginObservation();
      }
    });
    rendererObserver.observe(input.host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-grid-engine-root-renderer'],
    });
  }

  return {
    cancel: () => {
      if (cancelled || reported) return;
      cancelled = true;
      cancellationCount += 1;
      clearScheduledWork();
    },
    getMetrics: metrics,
  };
}
