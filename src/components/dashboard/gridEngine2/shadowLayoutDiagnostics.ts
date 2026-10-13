import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type { GridLayoutItem } from './model';
import { solveLayout } from './solveLayout';
import {
  adaptHomeLayoutsForShadow,
  createShadowInputSignature,
  type ShadowAdaptedItem,
  type ShadowAdapterIssue,
  type ShadowLayoutAdapterInput,
  type ShadowStackLayoutSource,
} from './shadowLayoutAdapter';

export type ShadowDifferenceCategory =
  | 'EXACT_MATCH'
  | 'POSITION_DIFFERENCE'
  | 'SIZE_DIFFERENCE'
  | 'ORDER_DIFFERENCE'
  | 'OUT_OF_BOUNDS'
  | 'OVERLAP'
  | 'MISSING_ITEM'
  | 'UNSUPPORTED_ITEM'
  | 'INVALID_GEOMETRY'
  | 'DUPLICATE_ITEM'
  | 'EXPECTED_ALGORITHM_DIFFERENCE'
  | 'RUNTIME_GEOMETRY_DIFFERENCE'
  | 'UNDETERMINED_DIFFERENCE'
  | 'INSUFFICIENT_DATA';

export type ShadowCollision = {
  readonly firstDiagnosticId: string;
  readonly secondDiagnosticId: string;
};

export type ShadowItemDifference = {
  readonly diagnosticId: string;
  readonly originalId: string;
  readonly categories: readonly ShadowDifferenceCategory[];
  readonly displayed: GridLayoutItem;
  readonly structural?: GridLayoutItem;
  readonly normalized?: GridLayoutItem;
};

export type ShadowBreakpointReport = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly cols: number;
  readonly source: 'explicit-with-fallback' | 'legacy-derived';
  readonly hasExplicitLayout: boolean;
  readonly explicitItemCount: number;
  readonly derivedItemCount: number;
  readonly analyzedSource: 'runtime-displayed' | 'legacy-derived';
  readonly runtimeAvailable: boolean;
  readonly itemCount: number;
  readonly validGeometryCount: number;
  readonly outOfBoundsCount: number;
  readonly collisions: readonly ShadowCollision[];
  readonly solverStatus: 'analyzed' | 'partial' | 'failed';
  readonly differences: readonly ShadowItemDifference[];
  readonly categories: Readonly<Partial<Record<ShadowDifferenceCategory, number>>>;
  readonly issues: readonly ShadowAdapterIssue[];
};

export type ShadowStackBreakpointReport = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly source: ShadowStackLayoutSource;
  readonly hasExplicitLayout: boolean;
  readonly itemCount: number;
  readonly losslessGeometryCount: number;
  readonly comparisonStatus: 'insufficient-data';
  readonly categories: Readonly<Partial<Record<ShadowDifferenceCategory, number>>>;
};

export type ShadowStackReport = {
  readonly diagnosticId: string;
  readonly originalId: string;
  readonly kind: 'stack-vertical' | 'stack-horizontal' | 'stack-grid';
  readonly childCount: number;
  readonly breakpoints: Readonly<Record<DashboardGridBreakpoint, ShadowStackBreakpointReport>>;
};

export type ShadowDiagnosticsReport = {
  readonly signature: string;
  readonly breakpoints: Readonly<Record<DashboardGridBreakpoint, ShadowBreakpointReport>>;
  readonly stacks: readonly ShadowStackReport[];
  readonly summary: {
    readonly rootElementCount: number;
    readonly stackContainerCount: number;
    readonly stackChildCount: number;
    readonly issueCount: number;
    readonly categoryCounts: Readonly<Partial<Record<ShadowDifferenceCategory, number>>>;
  };
  readonly limitations: readonly string[];
};

function compareStrings(first: string, second: string) {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function compareReadingOrder(first: GridLayoutItem, second: GridLayoutItem) {
  return first.y - second.y || first.x - second.x || compareStrings(first.i, second.i);
}

function samePosition(first: GridLayoutItem, second: GridLayoutItem) {
  return first.x === second.x && first.y === second.y;
}

function sameSize(first: GridLayoutItem, second: GridLayoutItem) {
  return first.w === second.w && first.h === second.h;
}

function intersects(first: GridLayoutItem, second: GridLayoutItem) {
  return (
    first.w > 0 &&
    first.h > 0 &&
    second.w > 0 &&
    second.h > 0 &&
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function collisionPairs(items: readonly ShadowAdaptedItem[]) {
  const usable = items.filter((item) => item.solverRepresentable);
  const collisions: ShadowCollision[] = [];
  for (let index = 0; index < usable.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < usable.length; otherIndex += 1) {
      const first = usable[index];
      const second = usable[otherIndex];
      if (!intersects(first.geometry, second.geometry)) continue;
      const ids = [first.diagnosticId, second.diagnosticId].sort(compareStrings);
      collisions.push({ firstDiagnosticId: ids[0], secondDiagnosticId: ids[1] });
    }
  }
  return collisions.sort((first, second) => (
    compareStrings(first.firstDiagnosticId, second.firstDiagnosticId) ||
    compareStrings(first.secondDiagnosticId, second.secondDiagnosticId)
  ));
}

function issueCategory(issue: ShadowAdapterIssue): ShadowDifferenceCategory {
  if (issue.code === 'OUT_OF_BOUNDS') return 'OUT_OF_BOUNDS';
  if (issue.code === 'MISSING_LAYOUT_ITEM') return 'MISSING_ITEM';
  if (issue.code === 'INVALID_GEOMETRY') return 'INVALID_GEOMETRY';
  if (issue.code === 'DUPLICATE_LAYOUT_ID' || issue.code === 'DUPLICATE_ORIGINAL_ID') return 'DUPLICATE_ITEM';
  if (issue.code === 'STACK_COLUMNS_UNAVAILABLE') return 'INSUFFICIENT_DATA';
  return 'UNSUPPORTED_ITEM';
}

function countCategories(categories: readonly ShadowDifferenceCategory[]) {
  const counts: Partial<Record<ShadowDifferenceCategory, number>> = {};
  for (const category of categories) counts[category] = (counts[category] ?? 0) + 1;
  return counts;
}

function mergeCategoryCounts(
  target: Partial<Record<ShadowDifferenceCategory, number>>,
  source: Readonly<Partial<Record<ShadowDifferenceCategory, number>>>,
) {
  for (const [category, count] of Object.entries(source) as Array<[ShadowDifferenceCategory, number]>) {
    target[category] = (target[category] ?? 0) + count;
  }
}

function uniqueCategories(categories: readonly ShadowDifferenceCategory[]) {
  return [...new Set(categories)];
}

function analyzeBreakpoint(
  snapshot: ReturnType<typeof adaptHomeLayoutsForShadow>['breakpoints'][DashboardGridBreakpoint],
): ShadowBreakpointReport {
  const displayedItems = snapshot.displayedItems;
  const collisions = collisionPairs(displayedItems);
  const collisionIds = new Set(
    collisions.flatMap((collision) => [collision.firstDiagnosticId, collision.secondDiagnosticId]),
  );
  const solverInput = displayedItems.filter((item) => item.solverRepresentable);
  let normalized: readonly GridLayoutItem[] = [];
  let solverFailed = false;
  try {
    normalized = solverInput.length === 0
      ? []
      : solveLayout({
          items: solverInput.map((item) => item.geometry),
          cols: snapshot.cols,
          mode: 'manual',
          intent: { type: 'NORMALIZE' },
        });
  } catch {
    solverFailed = true;
  }

  const normalizedById = new Map(normalized.map((item) => [item.i, item]));
  const structuralById = new Map(snapshot.items.map((item) => [item.diagnosticId, item.geometry]));
  const displayedOrder = solverInput.map((item) => item.geometry).sort(compareReadingOrder).map((item) => item.i);
  const normalizedOrder = [...normalized].sort(compareReadingOrder).map((item) => item.i);
  const displayedOrderIndex = new Map(displayedOrder.map((id, index) => [id, index]));
  const normalizedOrderIndex = new Map(normalizedOrder.map((id, index) => [id, index]));
  const differences: ShadowItemDifference[] = displayedItems.map((item) => {
    const result = normalizedById.get(item.diagnosticId);
    const structural = structuralById.get(item.diagnosticId);
    const categories: ShadowDifferenceCategory[] = [];

    if (!item.geometryValid) categories.push('INVALID_GEOMETRY');
    if (item.outOfBounds) categories.push('OUT_OF_BOUNDS');
    if (collisionIds.has(item.diagnosticId)) categories.push('OVERLAP');
    if (!item.solverRepresentable || solverFailed || !result) {
      categories.push('INSUFFICIENT_DATA');
    } else {
      const positionChanged = !samePosition(item.geometry, result);
      const sizeChanged = !sameSize(item.geometry, result);
      const orderChanged = displayedOrderIndex.get(item.diagnosticId) !== normalizedOrderIndex.get(item.diagnosticId);
      if (positionChanged) categories.push('POSITION_DIFFERENCE');
      if (sizeChanged) categories.push('SIZE_DIFFERENCE');
      if (orderChanged) categories.push('ORDER_DIFFERENCE');
      if (positionChanged || sizeChanged || orderChanged) {
        if (item.outOfBounds || collisionIds.has(item.diagnosticId)) {
          categories.push('EXPECTED_ALGORITHM_DIFFERENCE');
        } else {
          categories.push('UNDETERMINED_DIFFERENCE');
        }
      } else {
        categories.push('EXACT_MATCH');
      }
    }

    if (
      snapshot.runtimeAvailable &&
      structural &&
      (!samePosition(item.geometry, structural) || !sameSize(item.geometry, structural))
    ) {
      categories.push('RUNTIME_GEOMETRY_DIFFERENCE');
    }
    if (snapshot.runtimeAvailable && !structural) categories.push('MISSING_ITEM');

    return {
      diagnosticId: item.diagnosticId,
      originalId: item.originalId,
      categories: uniqueCategories(categories),
      displayed: { ...item.geometry },
      ...(structural ? { structural: { ...structural } } : {}),
      ...(result ? { normalized: { ...result } } : {}),
    };
  });

  const categoryCounts: Partial<Record<ShadowDifferenceCategory, number>> = {};
  mergeCategoryCounts(categoryCounts, countCategories(differences.flatMap((difference) => difference.categories)));
  mergeCategoryCounts(categoryCounts, countCategories(snapshot.issues.map(issueCategory)));

  return {
    breakpoint: snapshot.breakpoint,
    cols: snapshot.cols,
    source: snapshot.source,
    hasExplicitLayout: snapshot.hasExplicitLayout,
    explicitItemCount: snapshot.explicitItemCount,
    derivedItemCount: snapshot.derivedItemCount,
    analyzedSource: snapshot.analyzedSource,
    runtimeAvailable: snapshot.runtimeAvailable,
    itemCount: displayedItems.length,
    validGeometryCount: displayedItems.filter((item) => item.geometryValid && !item.outOfBounds).length,
    outOfBoundsCount: displayedItems.filter((item) => item.outOfBounds).length,
    collisions,
    solverStatus: solverFailed ? 'failed' : solverInput.length === displayedItems.length ? 'analyzed' : 'partial',
    differences,
    categories: categoryCounts,
    issues: snapshot.issues,
  };
}

/**
 * Runs Grid Engine 2.0 only as a comparison oracle. NORMALIZE receives cloned
 * geometry and its output is never connected to the Home renderer or callbacks.
 */
export function analyzeShadowLayouts(input: ShadowLayoutAdapterInput): ShadowDiagnosticsReport {
  const signature = createShadowInputSignature(input);
  const snapshot = adaptHomeLayoutsForShadow(input);
  const breakpoints = {} as Record<DashboardGridBreakpoint, ShadowBreakpointReport>;
  const categoryCounts: Partial<Record<ShadowDifferenceCategory, number>> = {};

  for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
    const report = analyzeBreakpoint(snapshot.breakpoints[breakpoint]);
    breakpoints[breakpoint] = report;
    mergeCategoryCounts(categoryCounts, report.categories);
  }

  const stacks = snapshot.stacks.map((stack): ShadowStackReport => {
    const stackBreakpoints = {} as Record<DashboardGridBreakpoint, ShadowStackBreakpointReport>;
    for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
      const source = stack.breakpoints[breakpoint];
      const categories: Partial<Record<ShadowDifferenceCategory, number>> = {
        INSUFFICIENT_DATA: 1,
      };
      mergeCategoryCounts(categories, countCategories(source.issues.map(issueCategory)));
      mergeCategoryCounts(categoryCounts, categories);
      stackBreakpoints[breakpoint] = {
        breakpoint,
        source: source.source,
        hasExplicitLayout: source.hasExplicitLayout,
        itemCount: source.items.length,
        losslessGeometryCount: source.items.filter((item) => item.solverRepresentable).length,
        comparisonStatus: 'insufficient-data',
        categories,
      };
    }
    return {
      diagnosticId: stack.diagnosticId,
      originalId: stack.originalId,
      kind: stack.kind,
      childCount: stack.childCount,
      breakpoints: stackBreakpoints,
    };
  });

  mergeCategoryCounts(
    categoryCounts,
    countCategories(snapshot.issues.filter((issue) => issue.scope === 'structural').map(issueCategory)),
  );

  return {
    signature,
    breakpoints,
    stacks,
    summary: {
      rootElementCount: snapshot.rootElements.length,
      stackContainerCount: snapshot.stacks.length,
      stackChildCount: snapshot.stackChildren.length,
      issueCount: snapshot.issues.length,
      categoryCounts,
    },
    limitations: [
      'Runtime geometry is observable but its Home Assistant cause is not reliably available at this boundary.',
      'Internal Stack column counts are resolved inside StackGrid, so Stack solver comparisons remain insufficient-data.',
      'Missing explicit responsive layouts are treated as legacy fallback, not as errors.',
    ],
  };
}
