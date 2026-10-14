import React, { type ReactElement, type ReactNode } from 'react';
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
      className={`${className ?? ''} react-grid-layout grid-engine-2-root-renderer`.trim()}
      style={{ height: `${containerHeight}px` }}
      data-grid-engine-root-renderer="grid-engine-2"
      data-breakpoint={breakpoint}
      data-cols={cols}
      data-canvas-width={width}
      data-used-rows={layout.reduce((maximum, item) => Math.max(maximum, item.y + item.h), 0)}
    >
      {layout.map((item) => {
        const position = calculateGridEngineRootItemPosition(item, geometry);
        return (
          <div
            key={item.i}
            className="react-grid-item grid-engine-2-root-item"
            data-grid-engine-root-item={item.i}
            data-grid-x={item.x}
            data-grid-y={item.y}
            data-grid-w={item.w}
            data-grid-h={item.h}
            style={{
              position: 'absolute',
              width: `${position.width}px`,
              height: `${position.height}px`,
              transform: `translate(${position.left}px, ${position.top}px)`,
              boxSizing: 'border-box',
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
