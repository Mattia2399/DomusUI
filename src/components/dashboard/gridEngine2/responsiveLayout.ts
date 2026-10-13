import { GRID_ENGINE_BREAKPOINTS, GRID_ENGINE_COLS } from '../DashboardGrid';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type { GridLayoutItem } from './model';
import { solveLayout } from './solveLayout';

export type ResponsiveLayoutOrigin = 'automatic' | 'custom';

export type ResponsiveLabState = {
  readonly seed: readonly GridLayoutItem[];
  readonly reference: readonly GridLayoutItem[];
  readonly custom: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridLayoutItem[]>>>;
  readonly referenceIsCustom: boolean;
};

export const RESPONSIVE_REFERENCE_BREAKPOINT: DashboardGridBreakpoint = 'xl';
export const RESPONSIVE_REFERENCE_COLS = GRID_ENGINE_COLS[RESPONSIVE_REFERENCE_BREAKPOINT];

export const RESPONSIVE_LAB_BREAKPOINTS = DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => ({
  breakpoint,
  minWidth: GRID_ENGINE_BREAKPOINTS[breakpoint],
  cols: GRID_ENGINE_COLS[breakpoint],
}));

function cloneLayout(items: readonly GridLayoutItem[]) {
  return items.map((item) => ({ ...item }));
}

function compareIds(first: string, second: string) {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

/** Reading order is always top-to-bottom, left-to-right, then stable ID. */
export function compareResponsiveReadingOrder(first: GridLayoutItem, second: GridLayoutItem) {
  return first.y - second.y || first.x - second.x || compareIds(first.i, second.i);
}

export function responsiveReadingOrder(items: readonly GridLayoutItem[]) {
  return cloneLayout(items).sort(compareResponsiveReadingOrder).map((item) => item.i);
}

function normalizeColumnCount(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
  return Math.max(1, Math.round(value));
}

/**
 * Derives every target directly from the structural reference. X and width are
 * projected proportionally; Y and height retain reading order. Grid Engine 2.0
 * performs the sole deterministic collision pass, without horizontal packing.
 */
export function deriveResponsiveLayout(
  items: readonly GridLayoutItem[],
  sourceCols: number,
  targetCols: number,
) {
  const from = normalizeColumnCount(sourceCols, 'sourceCols');
  const to = normalizeColumnCount(targetCols, 'targetCols');
  const ratio = to / from;
  const projected = cloneLayout(items)
    .sort(compareResponsiveReadingOrder)
    .map((item) => {
      const w = Math.min(to, Math.max(1, Math.round(item.w * ratio)));
      const x = Math.min(to - w, Math.max(0, Math.round(item.x * ratio)));
      return {
        i: item.i,
        x,
        y: item.y,
        w,
        h: item.h,
      };
    });

  const first = projected[0];
  if (!first) return [];

  return solveLayout({
    items: projected,
    cols: to,
    mode: 'manual',
    intent: { type: 'MOVE', id: first.i, x: first.x, y: first.y },
  });
}

export function breakpointForCanvasWidth(width: number): DashboardGridBreakpoint {
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError('Canvas width must be a non-negative finite number.');
  }
  return DASHBOARD_GRID_BREAKPOINT_ORDER.find(
    (breakpoint) => width >= GRID_ENGINE_BREAKPOINTS[breakpoint],
  ) ?? 'xs';
}

export function colsForBreakpoint(breakpoint: DashboardGridBreakpoint) {
  return GRID_ENGINE_COLS[breakpoint];
}

export function previewWidthForBreakpoint(breakpoint: DashboardGridBreakpoint) {
  return breakpoint === 'xs' ? 390 : GRID_ENGINE_BREAKPOINTS[breakpoint];
}

export function createResponsiveLabState(
  items: readonly GridLayoutItem[],
  sourceCols: number,
): ResponsiveLabState {
  const reference = deriveResponsiveLayout(items, sourceCols, RESPONSIVE_REFERENCE_COLS);
  return {
    seed: cloneLayout(reference),
    reference,
    custom: {},
    referenceIsCustom: false,
  };
}

export function layoutForBreakpoint(
  state: ResponsiveLabState,
  breakpoint: DashboardGridBreakpoint,
) {
  if (breakpoint === RESPONSIVE_REFERENCE_BREAKPOINT) return cloneLayout(state.reference);
  const custom = state.custom[breakpoint];
  if (custom) return cloneLayout(custom);
  return deriveResponsiveLayout(
    state.reference,
    RESPONSIVE_REFERENCE_COLS,
    colsForBreakpoint(breakpoint),
  );
}

export function originForBreakpoint(
  state: ResponsiveLabState,
  breakpoint: DashboardGridBreakpoint,
): ResponsiveLayoutOrigin {
  if (breakpoint === RESPONSIVE_REFERENCE_BREAKPOINT) {
    return state.referenceIsCustom ? 'custom' : 'automatic';
  }
  return state.custom[breakpoint] ? 'custom' : 'automatic';
}

export function commitBreakpointLayout(
  state: ResponsiveLabState,
  breakpoint: DashboardGridBreakpoint,
  items: readonly GridLayoutItem[],
): ResponsiveLabState {
  const committed = cloneLayout(items);
  if (breakpoint === RESPONSIVE_REFERENCE_BREAKPOINT) {
    return { ...state, reference: committed, referenceIsCustom: true };
  }
  return {
    ...state,
    custom: { ...state.custom, [breakpoint]: committed },
  };
}

export function restoreAutomaticBreakpoint(
  state: ResponsiveLabState,
  breakpoint: DashboardGridBreakpoint,
): ResponsiveLabState {
  if (breakpoint === RESPONSIVE_REFERENCE_BREAKPOINT) {
    return { ...state, reference: cloneLayout(state.seed), referenceIsCustom: false };
  }
  const custom = { ...state.custom };
  delete custom[breakpoint];
  return { ...state, custom };
}
