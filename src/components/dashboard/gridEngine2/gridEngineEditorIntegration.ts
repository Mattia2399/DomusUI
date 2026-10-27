import type { GridItem, WidgetKind } from '../../../types/dashboardModels';
import type { WidgetTypeBreakpointLayoutOverride } from '../../../types/widgetTypeLayout';
import { solveGridEngineRootRuntimeLayout } from './gridEngineRootRuntimeSolver';

export type GridEngineEditorGeometryOrigin = 'explicit' | 'legacy-derived';

export type GridEngineEditorFallbackReason =
  | 'EMPTY_LAYOUT'
  | 'ROOT_ID_MISMATCH'
  | 'INVALID_STRUCTURAL_GEOMETRY'
  | 'UNSUPPORTED_DYNAMIC_STACK';

export type GridEngineEditorLayoutPreparation =
  | Readonly<{
      status: 'ready';
      layout: readonly GridItem[];
      origin: GridEngineEditorGeometryOrigin;
    }>
  | Readonly<{
      status: 'fallback';
      reason: GridEngineEditorFallbackReason;
    }>;

type PrepareGridEngineEditorLayoutInput = Readonly<{
  /** Exact geometry currently supplied to the legacy root renderer. */
  effectiveLayout: readonly GridItem[];
  /** Same responsive projection with runtime Light spans removed. */
  structuralLayout: readonly GridItem[];
  rootIds: readonly string[];
  stackIds: ReadonlySet<string>;
  cols: number;
  origin: GridEngineEditorGeometryOrigin;
}>;

function exactUniqueIds(layout: readonly GridItem[], rootIds: readonly string[]) {
  if (layout.length !== rootIds.length) return false;
  const expected = new Set(rootIds);
  const actual = new Set(layout.map((item) => item.i));
  return actual.size === layout.length && expected.size === rootIds.length &&
    rootIds.every((id) => actual.has(id));
}

/**
 * Produces the structural baseline for one editor breakpoint without inventing
 * coordinates. Effective x/y are retained; structural spans remove temporary
 * Light expansion. Dynamic Stack spans are deliberately left to legacy RGL.
 */
export function prepareGridEngineEditorLayout(
  input: PrepareGridEngineEditorLayoutInput,
): GridEngineEditorLayoutPreparation {
  if (input.rootIds.length === 0 || input.effectiveLayout.length === 0 || input.structuralLayout.length === 0) {
    return { status: 'fallback', reason: 'EMPTY_LAYOUT' };
  }
  if (
    !exactUniqueIds(input.effectiveLayout, input.rootIds) ||
    !exactUniqueIds(input.structuralLayout, input.rootIds)
  ) {
    return { status: 'fallback', reason: 'ROOT_ID_MISMATCH' };
  }

  const structuralById = new Map(input.structuralLayout.map((item) => [item.i, item]));
  for (const effective of input.effectiveLayout) {
    const structural = structuralById.get(effective.i)!;
    if (
      input.stackIds.has(effective.i) &&
      (effective.w !== structural.w || effective.h !== structural.h)
    ) {
      return { status: 'fallback', reason: 'UNSUPPORTED_DYNAMIC_STACK' };
    }
  }

  const layout = input.effectiveLayout.map((effective) => {
    const structural = structuralById.get(effective.i)!;
    return {
      i: effective.i,
      x: effective.x,
      y: effective.y,
      w: structural.w,
      h: structural.h,
    };
  });
  const validation = solveGridEngineRootRuntimeLayout({
    structuralLayout: layout,
    cols: input.cols,
  });
  if (validation.status === 'invalid') {
    return { status: 'fallback', reason: 'INVALID_STRUCTURAL_GEOMETRY' };
  }
  return {
    status: 'ready',
    layout: validation.layout,
    origin: input.origin,
  };
}

/** Maps a direct GE2 resize onto the existing per-widget override contract. */
export function createGridEngineEditorResizeOverride(
  kind: WidgetKind,
  width: number,
  height: number,
  currentWidgetOverride?: WidgetTypeBreakpointLayoutOverride,
  currentTypeOverride?: WidgetTypeBreakpointLayoutOverride,
): WidgetTypeBreakpointLayoutOverride {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  if (kind !== 'light') return { w: safeW, h: safeH };

  const allowAutoExpand = currentWidgetOverride?.autoExpand ?? currentTypeOverride?.autoExpand ?? true;
  const canAutoExpand = allowAutoExpand && safeH <= 1;
  return canAutoExpand
    ? { w: safeW, hOff: safeH, hOn: 2, autoExpand: true }
    : { w: safeW, h: safeH, hOff: safeH, hOn: safeH, autoExpand: false };
}
