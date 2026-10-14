import type { GridItem } from '../../../types/dashboardModels';

export type RootRendererGeometry = {
  readonly width: number;
  readonly cols: number;
  readonly rowHeight: number;
  readonly gap: readonly [number, number];
  readonly padding: readonly [number, number];
};

export type RootRendererItemPosition = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type RootGeometryValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

export function validateGridEngineRootGeometry(
  layout: readonly GridItem[],
  geometry: RootRendererGeometry,
): RootGeometryValidation {
  if (!Number.isFinite(geometry.width) || geometry.width <= 0) {
    return { valid: false, reason: 'canvas width must be positive and finite' };
  }
  if (!Number.isInteger(geometry.cols) || geometry.cols <= 0) {
    return { valid: false, reason: 'column count must be a positive integer' };
  }
  if (!Number.isFinite(geometry.rowHeight) || geometry.rowHeight <= 0) {
    return { valid: false, reason: 'row height must be positive and finite' };
  }
  if (!geometry.gap.every(finiteNonNegative) || !geometry.padding.every(finiteNonNegative)) {
    return { valid: false, reason: 'gap and padding must be finite and non-negative' };
  }

  const ids = new Set<string>();
  for (const [index, item] of layout.entries()) {
    if (!item.i || ids.has(item.i)) {
      return { valid: false, reason: 'layout item IDs must be present and unique' };
    }
    ids.add(item.i);
    if (![item.x, item.y, item.w, item.h].every(Number.isInteger)) {
      return { valid: false, reason: `layout item ${item.i} must use integer cell coordinates` };
    }
    if (item.x < 0 || item.y < 0 || item.w <= 0 || item.h <= 0 || item.x + item.w > geometry.cols) {
      return { valid: false, reason: `layout item ${item.i} is outside the root grid` };
    }
    const overlapsPreviousItem = layout.slice(0, index).some((previous) => (
      item.x < previous.x + previous.w &&
      item.x + item.w > previous.x &&
      item.y < previous.y + previous.h &&
      item.y + item.h > previous.y
    ));
    if (overlapsPreviousItem) {
      return { valid: false, reason: 'root layout items must not overlap' };
    }
  }
  return { valid: true };
}

export function calculateGridEngineRootItemPosition(
  item: GridItem,
  geometry: RootRendererGeometry,
): RootRendererItemPosition {
  const [columnGap, rowGap] = geometry.gap;
  const [horizontalPadding, verticalPadding] = geometry.padding;
  const columnWidth = (
    geometry.width - columnGap * Math.max(0, geometry.cols - 1) - horizontalPadding * 2
  ) / geometry.cols;
  const left = Math.round((columnWidth + columnGap) * item.x + horizontalPadding);
  const right = Math.round((columnWidth + columnGap) * (item.x + item.w) + horizontalPadding);
  const top = Math.round((geometry.rowHeight + rowGap) * item.y + verticalPadding);
  const bottom = Math.round((geometry.rowHeight + rowGap) * (item.y + item.h) + verticalPadding);

  // Deriving the far edge independently matches RGL's rounding correction and
  // prevents sub-pixel drift from accumulating across adjacent columns/rows.
  return {
    left,
    top,
    width: right - left - columnGap,
    height: bottom - top - rowGap,
  };
}

export function calculateGridEngineRootContainerHeight(
  layout: readonly GridItem[],
  geometry: Pick<RootRendererGeometry, 'rowHeight' | 'gap' | 'padding'>,
) {
  const usedRows = layout.reduce((maximum, item) => Math.max(maximum, item.y + item.h), 0);
  if (usedRows === 0) return 0;
  return (
    usedRows * geometry.rowHeight +
    Math.max(0, usedRows - 1) * geometry.gap[1] +
    geometry.padding[1] * 2
  );
}
