import type { GridLayoutItem } from './model';
import type { RuntimeShadowRootElement } from './runtimeShadowBaseline';

export type RuntimeGeometryStructuralContext = Readonly<{
  generation: number;
  revision: number | null;
  fingerprint: string | null;
}>;

export type RuntimeGeometrySnapshot = Readonly<GridLayoutItem & { index: number }>;

export type RuntimeGeometryDelta = Readonly<{
  deltaX: number;
  deltaY: number;
  deltaW: number;
  deltaH: number;
  deltaIndex: number;
}>;

export type RuntimeGeometrySolverClassification =
  | 'unchanged'
  | 'runtime-override'
  | 'direct-collision'
  | 'collision-chain-candidate'
  | 'unexplained-movement'
  | 'insufficient-evidence';

export type RuntimeGeometryLegacyClassification =
  | 'matches-solver'
  | 'order-difference'
  | 'legacy-compaction-candidate'
  | 'unexplained-runtime-difference'
  | 'insufficient-evidence';

export type RuntimeGeometryEvidenceQuality = 'demonstrated' | 'plausible' | 'unknown';

export type RuntimeGeometryElementComparison = Readonly<{
  id: string;
  role: RuntimeShadowRootElement['role'];
  kind: string;
  structural: RuntimeGeometrySnapshot;
  solverCandidate: RuntimeGeometrySnapshot;
  legacyRuntimeInput: RuntimeGeometrySnapshot;
  structuralToSolver: RuntimeGeometryDelta;
  structuralToLegacy: RuntimeGeometryDelta;
  solverToLegacy: RuntimeGeometryDelta;
  solverClassification: RuntimeGeometrySolverClassification;
  legacyClassification: RuntimeGeometryLegacyClassification;
  evidenceQuality: RuntimeGeometryEvidenceQuality;
  directCollisionWith: readonly string[];
  chainCandidateFrom: readonly string[];
  reasons: readonly string[];
}>;

export type RuntimeGeometryInspectionIssueCode =
  | 'INVALID_COLUMNS'
  | 'INVALID_INITIAL_GEOMETRY'
  | 'INVALID_SOLVER_GEOMETRY'
  | 'INVALID_LEGACY_GEOMETRY'
  | 'MISSING_GEOMETRY_ID'
  | 'STRUCTURAL_CONTEXT_MISMATCH'
  | 'DERIVED_BASELINE_UNSUPPORTED';

export type RuntimeGeometryInspectionReport = Readonly<{
  status: 'available' | 'unavailable';
  breakpoint: string;
  baselineQuality: string;
  comparisonConfidence: 'reliable' | 'provisional' | 'unavailable';
  structuralContext: RuntimeGeometryStructuralContext | null;
  elementCount: number;
  changedBySolverCount: number;
  solverLegacyDifferenceCount: number;
  directCollisionCount: number;
  collisionChainCandidateCount: number;
  unexplainedMovementCount: number;
  legacyCompactionCandidateCount: number;
  finalOverlapCount: number;
  legacyInputOverlapCount: number;
  issueCodes: readonly RuntimeGeometryInspectionIssueCode[];
  limitations: readonly string[];
  elements: readonly RuntimeGeometryElementComparison[];
  timings: Readonly<{
    differenceAnalysisMs: number;
    collisionAnalysisMs: number;
    totalMs: number;
  }>;
}>;

export type RuntimeGeometryInspectionInput = Readonly<{
  breakpoint: string;
  cols: number;
  rootElements: readonly RuntimeShadowRootElement[];
  structuralLayout: readonly GridLayoutItem[];
  solverCandidate: readonly GridLayoutItem[];
  legacyRuntimeInput: readonly GridLayoutItem[];
  appliedOverrideIds: readonly string[];
  unsupportedDynamicRootIds?: readonly string[];
  baselineQuality: string;
  comparisonConfidence: 'reliable' | 'provisional' | 'unavailable';
  baselineProvenance?: 'responsive-layout-root' | 'derived-grid-engine-layout' | 'none';
  structuralContext?: RuntimeGeometryStructuralContext;
  expectedStructuralContext?: RuntimeGeometryStructuralContext;
}>;

type RuntimeGeometryInspectionOptions = Readonly<{
  now?: () => number;
}>;

type IndexedItem = Readonly<{ item: GridLayoutItem; index: number }>;

function defaultNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function roundDuration(duration: number) {
  return Math.round(Math.max(0, duration) * 100) / 100;
}

function intersects(first: GridLayoutItem, second: GridLayoutItem) {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function geometryChanged(first: GridLayoutItem, second: GridLayoutItem) {
  return first.x !== second.x || first.y !== second.y || first.w !== second.w || first.h !== second.h;
}

function positionOrSizeChanged(delta: RuntimeGeometryDelta) {
  return delta.deltaX !== 0 || delta.deltaY !== 0 || delta.deltaW !== 0 || delta.deltaH !== 0;
}

function anyDeltaChanged(delta: RuntimeGeometryDelta) {
  return positionOrSizeChanged(delta) || delta.deltaIndex !== 0;
}

function toSnapshot(indexed: IndexedItem): RuntimeGeometrySnapshot {
  return { ...indexed.item, index: indexed.index };
}

function delta(from: IndexedItem, to: IndexedItem): RuntimeGeometryDelta {
  return {
    deltaX: to.item.x - from.item.x,
    deltaY: to.item.y - from.item.y,
    deltaW: to.item.w - from.item.w,
    deltaH: to.item.h - from.item.h,
    deltaIndex: to.index - from.index,
  };
}

function indexLayout(layout: readonly GridLayoutItem[]) {
  return new Map(layout.map((item, index) => [item.i, { item, index }] as const));
}

function sameContext(
  actual: RuntimeGeometryStructuralContext | undefined,
  expected: RuntimeGeometryStructuralContext | undefined,
) {
  if (!actual && !expected) return true;
  return Boolean(
    actual && expected &&
    actual.generation === expected.generation &&
    actual.revision === expected.revision &&
    actual.fingerprint === expected.fingerprint,
  );
}

function validateLayout(
  layout: readonly GridLayoutItem[],
  cols: number,
  requireNoOverlap: boolean,
) {
  const ids = new Set<string>();
  for (const [index, item] of layout.entries()) {
    if (
      !item || typeof item.i !== 'string' || item.i.length === 0 || ids.has(item.i) ||
      ![item.x, item.y, item.w, item.h].every(Number.isSafeInteger) ||
      item.x < 0 || item.y < 0 || item.w <= 0 || item.h <= 0 || item.x + item.w > cols
    ) {
      return false;
    }
    ids.add(item.i);
    if (requireNoOverlap && layout.slice(0, index).some((previous) => intersects(item, previous))) {
      return false;
    }
  }
  return true;
}

function overlapPairs(layout: readonly GridLayoutItem[]) {
  return layout.flatMap((item, index) => layout.slice(0, index)
    .filter((previous) => intersects(item, previous))
    .map((previous) => [previous.i, item.i] as const));
}

function unavailableReport(
  input: RuntimeGeometryInspectionInput,
  issueCodes: readonly RuntimeGeometryInspectionIssueCode[],
  startedAt: number,
  now: () => number,
): RuntimeGeometryInspectionReport {
  return {
    status: 'unavailable',
    breakpoint: input.breakpoint,
    baselineQuality: input.baselineQuality,
    comparisonConfidence: 'unavailable',
    structuralContext: input.structuralContext ?? null,
    elementCount: input.rootElements.length,
    changedBySolverCount: 0,
    solverLegacyDifferenceCount: 0,
    directCollisionCount: 0,
    collisionChainCandidateCount: 0,
    unexplainedMovementCount: 0,
    legacyCompactionCandidateCount: 0,
    finalOverlapCount: 0,
    legacyInputOverlapCount: 0,
    issueCodes: [...new Set(issueCodes)],
    limitations: issueCodes.map((code) => code.toLowerCase().replaceAll('_', '-')),
    elements: [],
    timings: {
      differenceAnalysisMs: 0,
      collisionAnalysisMs: 0,
      totalMs: roundDuration(now() - startedAt),
    },
  };
}

/**
 * Compares immutable cell geometry. A direct collision is only reported when
 * an override's expanded rectangle actually intersects another item's
 * structural rectangle. Propagation inferred from final geometry is kept at
 * the weaker `collision-chain-candidate` level.
 */
export function inspectRuntimeGeometry(
  input: RuntimeGeometryInspectionInput,
  options: RuntimeGeometryInspectionOptions = {},
): RuntimeGeometryInspectionReport {
  const now = options.now ?? defaultNow;
  const startedAt = now();
  if (!Number.isSafeInteger(input.cols) || input.cols <= 0) {
    return unavailableReport(input, ['INVALID_COLUMNS'], startedAt, now);
  }
  if (input.baselineProvenance === 'derived-grid-engine-layout') {
    return unavailableReport(input, ['DERIVED_BASELINE_UNSUPPORTED'], startedAt, now);
  }
  if (!sameContext(input.structuralContext, input.expectedStructuralContext)) {
    return unavailableReport(input, ['STRUCTURAL_CONTEXT_MISMATCH'], startedAt, now);
  }
  if (!validateLayout(input.structuralLayout, input.cols, true)) {
    return unavailableReport(input, ['INVALID_INITIAL_GEOMETRY'], startedAt, now);
  }
  if (!validateLayout(input.solverCandidate, input.cols, true)) {
    return unavailableReport(input, ['INVALID_SOLVER_GEOMETRY'], startedAt, now);
  }
  // RGL may receive a transiently overlapping input and resolve it internally.
  // Keep that observable distinction instead of mistaking its input for DOM.
  if (!validateLayout(input.legacyRuntimeInput, input.cols, false)) {
    return unavailableReport(input, ['INVALID_LEGACY_GEOMETRY'], startedAt, now);
  }

  const rootsById = new Map(input.rootElements.map((root) => [root.id, root]));
  const structuralById = indexLayout(input.structuralLayout);
  const solverById = indexLayout(input.solverCandidate);
  const legacyById = indexLayout(input.legacyRuntimeInput);
  const allIds = new Set([
    ...rootsById.keys(),
    ...structuralById.keys(),
    ...solverById.keys(),
    ...legacyById.keys(),
  ]);
  if (
    allIds.size !== rootsById.size ||
    [...allIds].some((id) => !rootsById.has(id) || !structuralById.has(id) || !solverById.has(id) || !legacyById.has(id))
  ) {
    return unavailableReport(input, ['MISSING_GEOMETRY_ID'], startedAt, now);
  }

  const differencesStartedAt = now();
  const appliedOverrideIds = new Set(input.appliedOverrideIds);
  const unsupportedDynamicRootIds = new Set(input.unsupportedDynamicRootIds ?? []);
  const baseComparisons = [...allIds].sort().map((id) => {
    const structural = structuralById.get(id)!;
    const solver = solverById.get(id)!;
    const legacy = legacyById.get(id)!;
    return {
      id,
      root: rootsById.get(id)!,
      structural,
      solver,
      legacy,
      structuralToSolver: delta(structural, solver),
      structuralToLegacy: delta(structural, legacy),
      solverToLegacy: delta(solver, legacy),
    };
  });
  const differenceAnalysisMs = roundDuration(now() - differencesStartedAt);

  const collisionStartedAt = now();
  const expandedOverrides = [...appliedOverrideIds]
    .sort()
    .flatMap((id) => {
      const structural = structuralById.get(id);
      const solver = solverById.get(id);
      return structural && solver && geometryChanged(structural.item, solver.item)
        ? [{ id, structural: structural.item, solver: solver.item }]
        : [];
    });
  const directById = new Map<string, string[]>();
  baseComparisons.forEach(({ id, structural, solver }) => {
    if (appliedOverrideIds.has(id) || !geometryChanged(structural.item, solver.item)) return;
    const triggers = expandedOverrides
      .filter((override) => (
        !intersects(override.structural, structural.item) &&
        intersects(override.solver, structural.item) &&
        !intersects(override.solver, solver.item)
      ))
      .map((override) => override.id);
    if (triggers.length > 0) directById.set(id, triggers);
  });

  const chainById = new Map<string, string[]>();
  const knownCollisionIds = new Set(directById.keys());
  let changed = true;
  while (changed) {
    changed = false;
    baseComparisons.forEach(({ id, structural, solver }) => {
      if (
        appliedOverrideIds.has(id) || directById.has(id) || chainById.has(id) ||
        !geometryChanged(structural.item, solver.item)
      ) return;
      const parents = [...knownCollisionIds]
        .sort()
        .filter((parentId) => {
          const parentStructural = structuralById.get(parentId)!;
          const parentSolver = solverById.get(parentId)!;
          return (
            !intersects(parentStructural.item, structural.item) &&
            intersects(parentSolver.item, structural.item) &&
            !intersects(parentSolver.item, solver.item)
          );
        });
      if (parents.length === 0) return;
      chainById.set(id, parents);
      knownCollisionIds.add(id);
      changed = true;
    });
  }

  const finalOverlaps = overlapPairs(input.solverCandidate);
  const legacyInputOverlaps = overlapPairs(input.legacyRuntimeInput);
  const elements: RuntimeGeometryElementComparison[] = baseComparisons.map((comparison) => {
    const { id, root, structural, solver, legacy, structuralToSolver, structuralToLegacy, solverToLegacy } = comparison;
    const directCollisionWith = directById.get(id) ?? [];
    const chainCandidateFrom = chainById.get(id) ?? [];
    const solverChanged = positionOrSizeChanged(structuralToSolver);
    let solverClassification: RuntimeGeometrySolverClassification;
    let evidenceQuality: RuntimeGeometryEvidenceQuality;
    const reasons: string[] = [];

    if (unsupportedDynamicRootIds.has(id)) {
      solverClassification = 'insufficient-evidence';
      evidenceQuality = 'unknown';
      reasons.push('dynamic-root-container-causal-input-unavailable');
    } else if (appliedOverrideIds.has(id)) {
      solverClassification = 'runtime-override';
      evidenceQuality = 'demonstrated';
      reasons.push('absolute-runtime-span-applied');
    } else if (!solverChanged) {
      solverClassification = 'unchanged';
      evidenceQuality = 'demonstrated';
      reasons.push('matches-structural-geometry');
    } else if (directCollisionWith.length > 0) {
      solverClassification = 'direct-collision';
      evidenceQuality = 'demonstrated';
      reasons.push('expanded-rectangle-intersects-structural-rectangle');
    } else if (chainCandidateFrom.length > 0) {
      solverClassification = 'collision-chain-candidate';
      evidenceQuality = 'plausible';
      reasons.push('final-displacement-is-compatible-with-collision-propagation');
    } else {
      solverClassification = 'unexplained-movement';
      evidenceQuality = 'unknown';
      reasons.push('no-geometric-cause-identified');
    }

    let legacyClassification: RuntimeGeometryLegacyClassification = 'matches-solver';
    if (positionOrSizeChanged(solverToLegacy)) {
      const upwardOnly = (
        solverToLegacy.deltaX === 0 && solverToLegacy.deltaY < 0 &&
        solverToLegacy.deltaW === 0 && solverToLegacy.deltaH === 0
      );
      legacyClassification = upwardOnly
        ? 'legacy-compaction-candidate'
        : 'unexplained-runtime-difference';
      reasons.push(upwardOnly
        ? 'legacy-input-is-vertically-compacted-relative-to-candidate'
        : 'legacy-input-differs-without-a-proven-compaction-signature');
    } else if (solverToLegacy.deltaIndex !== 0) {
      legacyClassification = 'order-difference';
    }
    if (solverToLegacy.deltaIndex !== 0) reasons.push('root-order-differs');

    return {
      id,
      role: root.role,
      kind: root.kind,
      structural: toSnapshot(structural),
      solverCandidate: toSnapshot(solver),
      legacyRuntimeInput: toSnapshot(legacy),
      structuralToSolver,
      structuralToLegacy,
      solverToLegacy,
      solverClassification,
      legacyClassification,
      evidenceQuality,
      directCollisionWith,
      chainCandidateFrom,
      reasons,
    };
  });
  const collisionAnalysisMs = roundDuration(now() - collisionStartedAt);
  const provisional = input.baselineQuality === 'reconciled-provisional';

  return {
    status: 'available',
    breakpoint: input.breakpoint,
    baselineQuality: input.baselineQuality,
    comparisonConfidence: input.comparisonConfidence,
    structuralContext: input.structuralContext ?? null,
    elementCount: elements.length,
    changedBySolverCount: elements.filter((element) => positionOrSizeChanged(element.structuralToSolver)).length,
    solverLegacyDifferenceCount: elements.filter((element) => anyDeltaChanged(element.solverToLegacy)).length,
    directCollisionCount: elements.filter((element) => element.solverClassification === 'direct-collision').length,
    collisionChainCandidateCount: elements.filter((element) => element.solverClassification === 'collision-chain-candidate').length,
    unexplainedMovementCount: elements.filter((element) => element.solverClassification === 'unexplained-movement').length,
    legacyCompactionCandidateCount: elements.filter((element) => element.legacyClassification === 'legacy-compaction-candidate').length,
    finalOverlapCount: finalOverlaps.length,
    legacyInputOverlapCount: legacyInputOverlaps.length,
    issueCodes: [],
    limitations: provisional
      ? ['reconciled-provisional-baseline', 'historical-pre-runtime-origin-unverified']
      : input.comparisonConfidence === 'provisional'
        ? ['historical-pre-runtime-origin-unverified']
        : [],
    elements,
    timings: {
      differenceAnalysisMs,
      collisionAnalysisMs,
      totalMs: roundDuration(now() - startedAt),
    },
  };
}
