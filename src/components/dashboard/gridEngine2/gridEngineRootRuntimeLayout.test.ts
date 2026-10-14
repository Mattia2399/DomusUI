import { describe, expect, it } from 'vitest';
import type { GridItem } from '../../../types/dashboardModels';
import {
  alignDynamicRootPositions,
  stabilizeRootRuntimeCollisions,
} from './gridEngineRootRuntimeLayout';

const dynamicIds = new Set(['light']);

const collapsed: GridItem[] = [
  { i: 'light', x: 0, y: 0, w: 2, h: 1 },
  { i: 'below-one', x: 0, y: 1, w: 2, h: 1 },
  { i: 'below-two', x: 0, y: 2, w: 2, h: 1 },
  { i: 'different-size-neighbour', x: 2, y: 0, w: 3, h: 2 },
];

const expanded: GridItem[] = [
  { i: 'light', x: 0, y: 0, w: 2, h: 2 },
  { i: 'below-one', x: 0, y: 2, w: 2, h: 1 },
  { i: 'below-two', x: 0, y: 3, w: 2, h: 1 },
  { i: 'different-size-neighbour', x: 2, y: 0, w: 3, h: 2 },
];

const globallyRepackedExpansion: GridItem[] = [
  { i: 'light', x: 0, y: 0, w: 2, h: 2 },
  { i: 'below-one', x: 2, y: 0, w: 2, h: 1 },
  { i: 'below-two', x: 4, y: 0, w: 2, h: 1 },
  { i: 'different-size-neighbour', x: 0, y: 2, w: 3, h: 2 },
];

describe('Grid Engine 2.0 root runtime layout adapter', () => {
  it('adopts existing authoritative positions when a Light expands', () => {
    expect(alignDynamicRootPositions(collapsed, expanded, dynamicIds)).toEqual([
      { i: 'light', x: 0, y: 0, w: 2, h: 1 },
      { i: 'below-one', x: 0, y: 2, w: 2, h: 1 },
      { i: 'below-two', x: 0, y: 3, w: 2, h: 1 },
      { i: 'different-size-neighbour', x: 2, y: 0, w: 3, h: 2 },
    ]);
  });

  it('moves only the local collision chain when the authoritative layout was globally repacked', () => {
    expect(alignDynamicRootPositions(collapsed, globallyRepackedExpansion, dynamicIds)).toEqual([
      { i: 'light', x: 0, y: 0, w: 2, h: 1 },
      { i: 'below-one', x: 0, y: 2, w: 2, h: 1 },
      { i: 'below-two', x: 0, y: 3, w: 2, h: 1 },
      { i: 'different-size-neighbour', x: 2, y: 0, w: 3, h: 2 },
    ]);
  });

  it('restores collapsed positions and stays drift-free across repeated transitions', () => {
    const expandedRuntime = expanded.map((item) => ({ ...item }));
    const firstCollapse = alignDynamicRootPositions(expandedRuntime, collapsed, dynamicIds);
    expect(firstCollapse.map(({ i, x, y }) => ({ i, x, y }))).toEqual(
      collapsed.map(({ i, x, y }) => ({ i, x, y })),
    );

    const secondExpansion = alignDynamicRootPositions(collapsed, expanded, dynamicIds);
    const secondCollapse = alignDynamicRootPositions(
      secondExpansion.map((item) => item.i === 'light' ? { ...item, h: 2 } : item),
      collapsed,
      dynamicIds,
    );
    expect(secondCollapse.map(({ i, x, y }) => ({ i, x, y }))).toEqual(
      collapsed.map(({ i, x, y }) => ({ i, x, y })),
    );
  });

  it('is idempotent across repeated OFF-ON-OFF cycles and preserves item order', () => {
    let current = collapsed.map((item) => ({ ...item }));
    const originalOrder = current.map((item) => item.i);

    for (let cycle = 0; cycle < 10; cycle += 1) {
      current = alignDynamicRootPositions(current, globallyRepackedExpansion, dynamicIds)
        .map((item) => item.i === 'light' ? { ...item, h: 2 } : item);
      expect(current.map((item) => item.i)).toEqual(originalOrder);

      current = alignDynamicRootPositions(current, collapsed, dynamicIds)
        .map((item) => item.i === 'light' ? { ...item, h: 1 } : item);
      expect(current).toEqual(collapsed);
    }
  });

  it('does not restore unrelated coordinates from a differently packed contraction source', () => {
    const expandedRuntime = expanded.map((item) => ({ ...item }));
    const differentlyPackedCollapsed = collapsed.map((item) =>
      item.i === 'different-size-neighbour' ? { ...item, x: 5, y: 8 } : item,
    );

    expect(alignDynamicRootPositions(expandedRuntime, differentlyPackedCollapsed, dynamicIds)).toEqual([
      { i: 'light', x: 0, y: 0, w: 2, h: 2 },
      { i: 'below-one', x: 0, y: 1, w: 2, h: 1 },
      { i: 'below-two', x: 0, y: 2, w: 2, h: 1 },
      { i: 'different-size-neighbour', x: 2, y: 0, w: 3, h: 2 },
    ]);
  });

  it('does not replace live positions without a dynamic span transition', () => {
    const live = collapsed.map((item) => item.i === 'below-one' ? { ...item, y: 4 } : item);
    const authoritative = collapsed.map((item) => item.i === 'below-one' ? { ...item, y: 6 } : item);
    expect(alignDynamicRootPositions(live, authoritative, dynamicIds)).toEqual(live);
  });

  it('keeps the runtime layout intact when the authoritative set is incomplete', () => {
    expect(alignDynamicRootPositions(collapsed, expanded.slice(0, -1), dynamicIds)).toEqual(collapsed);
  });

  it('repairs only an existing local overlap without changing x positions or item order', () => {
    const runtimeWithStackOverlap: GridItem[] = [
      { i: 'stack-grid', x: 8, y: 4, w: 2, h: 7 },
      { i: 'far-card', x: 2, y: 5, w: 3, h: 2 },
      { i: 'root.5', x: 8, y: 10, w: 2, h: 2 },
      { i: 'root.11', x: 8, y: 12, w: 2, h: 1 },
    ];

    expect(stabilizeRootRuntimeCollisions(runtimeWithStackOverlap, 12)).toEqual([
      { i: 'stack-grid', x: 8, y: 4, w: 2, h: 7 },
      { i: 'far-card', x: 2, y: 5, w: 3, h: 2 },
      { i: 'root.5', x: 8, y: 11, w: 2, h: 2 },
      { i: 'root.11', x: 8, y: 13, w: 2, h: 1 },
    ]);
  });
});
