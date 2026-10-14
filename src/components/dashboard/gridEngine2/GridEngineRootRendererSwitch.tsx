import React, { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { GridItem } from '../../../types/dashboardModels';
import { GridEngineRootRendererBoundary } from './GridEngineRootRendererBoundary';
import { validateGridEngineRootGeometry, type RootRendererGeometry } from './gridEngineRootGeometry';
import type { GridEngineRootRendererProps } from './GridEngineRootRenderer';

const LazyGridEngineRootRenderer = React.lazy(async () => {
  const module = await import('./GridEngineRootRenderer');
  return { default: module.GridEngineRootRenderer };
});

type GridEngineRootRendererSwitchProps = RootRendererGeometry & {
  readonly enabled: boolean;
  readonly breakpoint: string;
  readonly className?: string;
  readonly layout: readonly GridItem[];
  readonly children: ReactNode;
  readonly legacyRenderer: (children: ReactNode) => ReactNode;
};

function rendererProps(props: GridEngineRootRendererSwitchProps): GridEngineRootRendererProps {
  return {
    breakpoint: props.breakpoint,
    className: props.className,
    layout: props.layout,
    width: props.width,
    cols: props.cols,
    rowHeight: props.rowHeight,
    gap: props.gap,
    padding: props.padding,
    children: props.children,
  };
}

export function GridEngineRootRendererSwitch(props: GridEngineRootRendererSwitchProps) {
  const warnedReasonsRef = useRef<Set<string>>(new Set());
  const validation = useMemo(
    () => validateGridEngineRootGeometry(props.layout, props),
    [props.cols, props.gap, props.layout, props.padding, props.rowHeight, props.width],
  );
  const unsupportedReason = validation.valid === false ? validation.reason : null;

  useEffect(() => {
    if (!props.enabled || !unsupportedReason || warnedReasonsRef.current.has(unsupportedReason)) return;
    warnedReasonsRef.current.add(unsupportedReason);
    const overlappingItems = props.layout.flatMap((item, index) =>
      props.layout.slice(0, index)
        .filter((previous) => (
          item.x < previous.x + previous.w &&
          item.x + item.w > previous.x &&
          item.y < previous.y + previous.h &&
          item.y + item.h > previous.y
        ))
        .map((previous) => ({
          first: { i: previous.i, x: previous.x, y: previous.y, w: previous.w, h: previous.h },
          second: { i: item.i, x: item.x, y: item.y, w: item.w, h: item.h },
        })),
    );
    console.warn('[DomusUI:grid-engine2:renderer]', {
      event: 'unsupported-geometry',
      message: unsupportedReason,
      breakpoint: props.breakpoint,
      overlappingItems,
    });
  }, [props.breakpoint, props.enabled, props.layout, unsupportedReason]);

  const legacy = props.legacyRenderer(props.children);
  if (!props.enabled || validation.valid === false) return legacy;

  return (
    <GridEngineRootRendererBoundary fallback={legacy}>
      <Suspense fallback={legacy}>
        <LazyGridEngineRootRenderer {...rendererProps(props)} />
      </Suspense>
    </GridEngineRootRendererBoundary>
  );
}
