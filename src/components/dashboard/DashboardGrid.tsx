import { type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Responsive,
  WidthProvider,
  type CompactType,
  type ResponsiveLayouts,
  type ResizeHandleAxis,
} from 'react-grid-layout/legacy';
import { LEGACY_GRID_METRICS } from './gridEngine2/gridMetrics';

type DashboardGridProps = {
  children: ReactNode;
  className?: string;
  /** @deprecated The grid engine always uses 48px units. */
  rowUnit?: number;
  /** @deprecated The grid engine always uses a 16px gap. */
  gap?: number;
  layouts?: ResponsiveLayouts<GridBreakpoint>;
  isDraggable?: boolean;
  isResizable?: boolean;
  resizeHandles?: ResizeHandleAxis[];
  draggableCancel?: string;
  compactType?: CompactType;
  preventCollision?: boolean;
  containerPadding?: Partial<Record<GridBreakpoint, readonly [number, number]>>;
  onBreakpointChange?: (breakpoint: GridBreakpoint, cols: number) => void;
  onLayoutChange?: (layout: readonly unknown[], layouts: ResponsiveLayouts<GridBreakpoint>) => void;
  onDragStart?: (...args: unknown[]) => void;
  onResizeStart?: (...args: unknown[]) => void;
  onDragStop?: (...args: unknown[]) => void;
  onResizeStop?: (...args: unknown[]) => void;
};

export const GRID_ENGINE_ROW_UNIT_PX = LEGACY_GRID_METRICS.rowHeight;
export const GRID_ENGINE_GAP_PX = LEGACY_GRID_METRICS.horizontalGap;
export const GRID_ENGINE_BREAKPOINTS = {
  '2xl': 1536,
  xl: 1280,
  lg: 1024,
  md: 768,
  sm: 640,
  xs: 0,
} as const;
export const GRID_ENGINE_COLS = {
  '2xl': 12,
  xl: 12,
  lg: 8,
  md: 6,
  sm: 4,
  xs: 2,
} as const;
type GridBreakpoint = keyof typeof GRID_ENGINE_BREAKPOINTS;
const ResponsiveGridLayout = WidthProvider(Responsive);
const DEFAULT_CONTAINER_PADDING: Record<GridBreakpoint, readonly [number, number]> = {
  '2xl': [24, 14],
  xl: [24, 14],
  lg: [24, 14],
  md: [20, 12],
  sm: [14, 10],
  xs: [10, 8],
};

export function DashboardGrid({
  children,
  className,
  layouts,
  isDraggable = false,
  isResizable = false,
  resizeHandles = ['se'],
  draggableCancel,
  compactType = 'vertical',
  preventCollision = false,
  containerPadding,
  onBreakpointChange,
  onLayoutChange,
  onDragStart,
  onResizeStart,
  onDragStop,
  onResizeStop,
}: DashboardGridProps) {
  if (layouts) {
    return (
      <ResponsiveGridLayout
        className={clsx('behance-grid', className)}
        breakpoints={GRID_ENGINE_BREAKPOINTS}
        cols={GRID_ENGINE_COLS}
        layouts={layouts}
        rowHeight={GRID_ENGINE_ROW_UNIT_PX}
        margin={[GRID_ENGINE_GAP_PX, GRID_ENGINE_GAP_PX]}
        containerPadding={containerPadding ?? DEFAULT_CONTAINER_PADDING}
        compactType={compactType}
        preventCollision={preventCollision}
        isDraggable={isDraggable}
        isResizable={isResizable}
        resizeHandles={resizeHandles}
        draggableCancel={draggableCancel}
        onBreakpointChange={onBreakpointChange}
        onLayoutChange={onLayoutChange}
        onDragStart={onDragStart as never}
        onResizeStart={onResizeStart as never}
        onDragStop={onDragStop as never}
        onResizeStop={onResizeStop as never}
      >
        {children}
      </ResponsiveGridLayout>
    );
  }

  return (
    <div
      className={clsx(
        'grid w-full grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 2xl:grid-cols-12',
        className,
      )}
      style={{
        gridAutoRows: `${GRID_ENGINE_ROW_UNIT_PX}px`,
        columnGap: `${GRID_ENGINE_GAP_PX}px`,
        rowGap: `${GRID_ENGINE_GAP_PX}px`,
      }}
    >
      {children}
    </div>
  );
}

export default DashboardGrid;
