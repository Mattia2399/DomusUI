import type { Widget } from '../../../types/dashboardModels';
import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import {
  GRID_V2_WIDTH_CLASS_COLS,
  parseGridV2CardFormat,
  resolveNearestGridV2Format,
  type GridV2EntityCapability,
} from '../../widgets/cardCapabilityRegistry';
import type { GridGestureDestination } from './useGridGesture';

export function snapGridV2ResizeDestination(input: Readonly<{
  widget: Widget;
  breakpoint: DashboardGridBreakpoint;
  itemX: number;
  cols: number;
  destination: GridGestureDestination;
  entityCapability?: GridV2EntityCapability;
}>): GridGestureDestination {
  const snapped = resolveNearestGridV2Format({
    kind: input.widget.kind,
    breakpoint: input.breakpoint,
    width: input.destination.w,
    height: input.destination.h,
    entityCapability: input.entityCapability,
  });
  const matrix = GRID_V2_WIDTH_CLASS_COLS[input.breakpoint];
  const widthClass = parseGridV2CardFormat(snapped.format).widthClass;
  const alignedX = widthClass === 'X' && input.breakpoint === 'md'
    ? 0
    : Math.round(input.itemX / matrix.U) * matrix.U;
  return {
    ...input.destination,
    x: Math.min(Math.max(0, alignedX), Math.max(0, input.cols - snapped.span.w)),
    w: snapped.span.w,
    h: snapped.span.h,
  };
}
