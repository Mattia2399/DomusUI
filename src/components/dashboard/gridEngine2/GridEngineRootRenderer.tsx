import React, { type ReactElement, type ReactNode, type Ref } from 'react';
import type { GridItem } from '../../../types/dashboardModels';
import {
  calculateGridEngineRootContainerHeight,
  calculateGridEngineRootItemPosition,
  validateGridEngineRootGeometry,
  type RootRendererGeometry,
} from './gridEngineRootGeometry';

export type GridEngineRootRendererProps = RootRendererGeometry & {
  readonly breakpoint: string;
  readonly className?: string;
  readonly layout: readonly GridItem[];
  readonly children: ReactNode;
  readonly containerRef?: Ref<HTMLDivElement>;
  readonly gestureState?: string;
  readonly gestureActiveId?: string | null;
  readonly gestureVisualOffset?: Readonly<{ x: number; y: number }>;
};

function keyedChildren(children: ReactNode) {
  const result = new Map<string, ReactElement>();
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child) || child.key === null) return;
    result.set(String(child.key), child);
  });
  return result;
}

export function GridEngineRootRenderer({
  breakpoint,
  children,
  className,
  layout,
  width,
  cols,
  rowHeight,
  gap,
  padding,
  containerRef,
  gestureState,
  gestureActiveId,
  gestureVisualOffset,
}: GridEngineRootRendererProps) {
  const geometry = { width, cols, rowHeight, gap, padding } as const;
  const validation = validateGridEngineRootGeometry(layout, geometry);
  if (validation.valid === false) {
    throw new Error(`Unsupported root geometry: ${validation.reason}`);
  }

  const childrenById = keyedChildren(children);
  if (childrenById.size !== layout.length || layout.some((item) => !childrenById.has(item.i))) {
    throw new Error('Unsupported root geometry: child IDs and layout IDs do not match');
  }

  const containerHeight = calculateGridEngineRootContainerHeight(layout, geometry);
  return (
    <div
      ref={containerRef}
      className={`${className ?? ''} react-grid-layout grid-engine-2-root-renderer`.trim()}
      style={{ height: `${containerHeight}px` }}
      data-grid-engine-root-renderer="grid-engine-2"
      data-breakpoint={breakpoint}
      data-cols={cols}
      data-canvas-width={width}
      data-used-rows={layout.reduce((maximum, item) => Math.max(maximum, item.y + item.h), 0)}
      data-grid-engine-editor-gesture={gestureState}
    >
      {layout.map((item) => {
        const position = calculateGridEngineRootItemPosition(item, geometry);
        const isDragging = gestureActiveId === item.i && gestureState === 'DRAGGING';
        const isResizing = gestureActiveId === item.i && gestureState === 'RESIZING';
        const visualOffset = isDragging
          ? gestureVisualOffset ?? { x: 0, y: 0 }
          : { x: 0, y: 0 };
        return (
          <div
            key={item.i}
            className={`react-grid-item grid-engine-2-root-item${
              isDragging ? ' react-draggable-dragging' : ''
            }${isResizing ? ' react-resizable-resizing' : ''}`}
            data-grid-engine-root-item={item.i}
            data-grid-x={item.x}
            data-grid-y={item.y}
            data-grid-w={item.w}
            data-grid-h={item.h}
            data-grid-visual-offset-x={visualOffset.x}
            data-grid-visual-offset-y={visualOffset.y}
            style={{
              position: 'absolute',
              width: `${position.width}px`,
              height: `${position.height}px`,
              transform: `translate(${position.left + visualOffset.x}px, ${position.top + visualOffset.y}px)`,
              boxSizing: 'border-box',
              willChange: isDragging || isResizing ? 'transform, width, height' : undefined,
            }}
          >
            {childrenById.get(item.i)}
          </div>
        );
      })}
    </div>
  );
}

export default GridEngineRootRenderer;
