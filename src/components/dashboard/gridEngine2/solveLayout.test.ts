import { describe, expect, it } from 'vitest';
import {
  GridLayoutError,
  type GridLayoutErrorCode,
  type GridLayoutItem,
  type SolveLayoutInput,
} from './model';
import { solveLayout } from './solveLayout';

const manualMove = (
  items: readonly GridLayoutItem[],
  id: string,
  x: number,
  y: number,
  cols = 6,
) => solveLayout({ items, cols, mode: 'manual', intent: { type: 'MOVE', id, x, y } });

const manualReorder = (
  items: readonly GridLayoutItem[],
  id: string,
  x: number,
  y: number,
  cols = 6,
) => solveLayout({ items, cols, mode: 'manual', intent: { type: 'REORDER', id, x, y } });

const getItem = (items: readonly GridLayoutItem[], id: string) => {
  const item = items.find((entry) => entry.i === id);
  expect(item, `Missing item ${id}`).toBeDefined();
  return item!;
};

const expectNoOverlaps = (items: readonly GridLayoutItem[]) => {
  for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
    const first = items[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex += 1) {
      const second = items[secondIndex];
      const overlaps =
        first.x < second.x + second.w &&
        first.x + first.w > second.x &&
        first.y < second.y + second.h &&
        first.y + first.h > second.y;
      expect(overlaps, `${first.i} overlaps ${second.i}`).toBe(false);
    }
  }
};

const expectGridError = (operation: () => unknown, code: GridLayoutErrorCode) => {
  try {
    operation();
    throw new Error('Expected solveLayout to throw.');
  } catch (error) {
    expect(error).toBeInstanceOf(GridLayoutError);
    expect((error as GridLayoutError).code).toBe(code);
  }
};

describe('Grid Engine 2.0 solveLayout', () => {
  it('normalizes coordinates and dimensions to bounded integers', () => {
    const result = solveLayout({
      items: [{ i: 'active', x: -4.7, y: -2.2, w: 0.2, h: -3.8 }],
      cols: 4,
      mode: 'manual',
      intent: { type: 'MOVE', id: 'active', x: 2.6, y: -8.1 },
    });

    expect(result).toEqual([{ i: 'active', x: 3, y: 0, w: 1, h: 1 }]);
  });

  it('clamps widths larger than the grid and keeps the item inside the right edge', () => {
    const result = manualMove(
      [{ i: 'active', x: 3, y: 0, w: 10, h: 1 }],
      'active',
      99,
      0,
      4,
    );

    expect(result).toEqual([{ i: 'active', x: 0, y: 0, w: 4, h: 1 }]);
  });

  it('rejects non-finite geometry, intent values, and invalid column counts', () => {
    expectGridError(
      () => manualMove([{ i: 'active', x: Number.NaN, y: 0, w: 1, h: 1 }], 'active', 0, 0),
      'INVALID_NUMBER',
    );
    expectGridError(
      () => manualMove([{ i: 'active', x: 0, y: 0, w: 1, h: 1 }], 'active', Infinity, 0),
      'INVALID_NUMBER',
    );
    expectGridError(
      () => solveLayout({
        items: [{ i: 'active', x: 0, y: 0, w: 1, h: 1 }],
        cols: 0,
        mode: 'manual',
        intent: { type: 'MOVE', id: 'active', x: 0, y: 0 },
      }),
      'INVALID_COLUMNS',
    );
  });

  it('pushes a single colliding item down while preserving its X coordinate', () => {
    const result = manualMove(
      [
        { i: 'active', x: 3, y: 3, w: 1, h: 1 },
        { i: 'blocked', x: 0, y: 0, w: 2, h: 1 },
        { i: 'unrelated', x: 3, y: 0, w: 1, h: 1 },
      ],
      'active',
      0,
      0,
      4,
    );

    expect(getItem(result, 'active')).toEqual({ i: 'active', x: 0, y: 0, w: 1, h: 1 });
    expect(getItem(result, 'blocked')).toEqual({ i: 'blocked', x: 0, y: 1, w: 2, h: 1 });
    expect(getItem(result, 'unrelated')).toEqual({ i: 'unrelated', x: 3, y: 0, w: 1, h: 1 });
  });

  it('resolves a downward collision chain spanning at least three other cards', () => {
    const result = manualMove(
      [
        { i: 'active', x: 5, y: 5, w: 1, h: 1 },
        { i: 'first', x: 0, y: 0, w: 1, h: 1 },
        { i: 'second', x: 0, y: 1, w: 1, h: 1 },
        { i: 'third', x: 0, y: 2, w: 1, h: 1 },
      ],
      'active',
      0,
      0,
    );

    expect(result).toEqual([
      { i: 'active', x: 0, y: 0, w: 1, h: 1 },
      { i: 'first', x: 0, y: 1, w: 1, h: 1 },
      { i: 'second', x: 0, y: 2, w: 1, h: 1 },
      { i: 'third', x: 0, y: 3, w: 1, h: 1 },
    ]);
  });

  it('resolves collisions between cards with different widths and heights', () => {
    const result = manualMove(
      [
        { i: 'active', x: 4, y: 6, w: 2, h: 2 },
        { i: 'wide', x: 1, y: 0, w: 3, h: 1 },
        { i: 'tall', x: 2, y: 1, w: 1, h: 2 },
      ],
      'active',
      1,
      0,
    );

    expect(getItem(result, 'active')).toEqual({ i: 'active', x: 1, y: 0, w: 2, h: 2 });
    expect(getItem(result, 'wide')).toEqual({ i: 'wide', x: 1, y: 2, w: 3, h: 1 });
    expect(getItem(result, 'tall')).toEqual({ i: 'tall', x: 2, y: 3, w: 1, h: 2 });
  });

  it('leaves no overlaps after MOVE', () => {
    const result = manualMove(
      [
        { i: 'active', x: 4, y: 8, w: 2, h: 2 },
        { i: 'one', x: 0, y: 0, w: 3, h: 2 },
        { i: 'two', x: 1, y: 2, w: 2, h: 3 },
        { i: 'three', x: 2, y: 5, w: 2, h: 1 },
      ],
      'active',
      1,
      1,
    );

    expectNoOverlaps(result);
    expect(getItem(result, 'active')).toMatchObject({ x: 1, y: 1 });
  });

  it('leaves no overlaps after RESIZE and pushes occupied geometry downward', () => {
    const result = solveLayout({
      items: [
        { i: 'active', x: 0, y: 0, w: 1, h: 1 },
        { i: 'right', x: 1, y: 0, w: 2, h: 1 },
        { i: 'lower', x: 2, y: 1, w: 1, h: 1 },
      ],
      cols: 4,
      mode: 'manual',
      intent: { type: 'RESIZE', id: 'active', w: 3, h: 2, anchor: 'top-left' },
    });

    expect(getItem(result, 'active')).toEqual({ i: 'active', x: 0, y: 0, w: 3, h: 2 });
    expect(getItem(result, 'right')).toMatchObject({ x: 1, y: 2 });
    expect(getItem(result, 'lower')).toMatchObject({ x: 2, y: 3 });
    expectNoOverlaps(result);
  });

  it('preserves intentional gaps in manual mode', () => {
    const result = manualMove(
      [
        { i: 'active', x: 3, y: 7, w: 1, h: 1 },
        { i: 'upper-gap', x: 0, y: 5, w: 1, h: 1 },
        { i: 'lower-gap', x: 2, y: 10, w: 1, h: 1 },
      ],
      'active',
      3,
      7,
      4,
    );

    expect(getItem(result, 'upper-gap')).toMatchObject({ x: 0, y: 5 });
    expect(getItem(result, 'lower-gap')).toMatchObject({ x: 2, y: 10 });
  });

  it('compacts vertically without dense horizontal packing in automatic mode', () => {
    const result = solveLayout({
      items: [
        { i: 'active', x: 3, y: 5, w: 1, h: 1 },
        { i: 'first', x: 0, y: 4, w: 2, h: 1 },
        { i: 'second', x: 0, y: 8, w: 1, h: 2 },
      ],
      cols: 4,
      mode: 'automatic',
      intent: { type: 'MOVE', id: 'active', x: 3, y: 5 },
    });

    expect(getItem(result, 'first')).toEqual({ i: 'first', x: 0, y: 0, w: 2, h: 1 });
    expect(getItem(result, 'second')).toEqual({ i: 'second', x: 0, y: 1, w: 1, h: 2 });
    expect(getItem(result, 'active')).toMatchObject({ x: 3, y: 5 });
  });

  it('does not let automatic compaction undo the active destination', () => {
    const result = solveLayout({
      items: [
        { i: 'active', x: 3, y: 0, w: 1, h: 1 },
        { i: 'blocked', x: 0, y: 3, w: 1, h: 1 },
        { i: 'free', x: 2, y: 8, w: 1, h: 1 },
      ],
      cols: 4,
      mode: 'automatic',
      intent: { type: 'MOVE', id: 'active', x: 0, y: 3 },
    });

    expect(getItem(result, 'active')).toEqual({ i: 'active', x: 0, y: 3, w: 1, h: 1 });
    expect(getItem(result, 'blocked')).toMatchObject({ x: 0, y: 4 });
    expect(getItem(result, 'free')).toMatchObject({ x: 2, y: 0 });
  });

  it('never mutates the input objects, array, or intent', () => {
    const input: SolveLayoutInput = {
      items: [
        { i: 'active', x: 3, y: 3, w: 1, h: 1 },
        { i: 'blocked', x: 0, y: 0, w: 1, h: 1 },
      ],
      cols: 4,
      mode: 'manual',
      intent: { type: 'MOVE', id: 'active', x: 0, y: 0 },
    };
    const snapshot = structuredClone(input);

    solveLayout(input);

    expect(input).toEqual(snapshot);
  });

  it('returns identical output for repeated calls with identical input', () => {
    const input: SolveLayoutInput = {
      items: [
        { i: 'active', x: 4, y: 4, w: 2, h: 1 },
        { i: 'other', x: 1, y: 1, w: 2, h: 2 },
      ],
      cols: 6,
      mode: 'automatic',
      intent: { type: 'MOVE', id: 'active', x: 1, y: 1 },
    };

    expect(solveLayout(input)).toEqual(solveLayout(input));
  });

  it('returns the same canonical output for every input array order', () => {
    const active = { i: 'active', x: 5, y: 5, w: 1, h: 1 } as const;
    const alpha = { i: 'alpha', x: 0, y: 0, w: 2, h: 1 } as const;
    const beta = { i: 'beta', x: 1, y: 1, w: 1, h: 2 } as const;
    const gamma = { i: 'gamma', x: 3, y: 0, w: 1, h: 1 } as const;
    const intent = { type: 'MOVE', id: 'active', x: 1, y: 0 } as const;

    const first = solveLayout({ items: [active, alpha, beta, gamma], cols: 6, mode: 'manual', intent });
    const second = solveLayout({ items: [gamma, beta, active, alpha], cols: 6, mode: 'manual', intent });
    const third = solveLayout({ items: [beta, alpha, gamma, active], cols: 6, mode: 'manual', intent });

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('derives RUNTIME_RESIZE geometry without changing structural input', () => {
    const structural = [
      { i: 'active', x: 0, y: 0, w: 1, h: 1 },
      { i: 'neighbor', x: 1, y: 0, w: 1, h: 1 },
    ] as const;

    const result = solveLayout({
      items: structural,
      cols: 4,
      mode: 'manual',
      intent: { type: 'RUNTIME_RESIZE', id: 'active', w: 2, h: 2, anchor: 'top-left' },
    });

    expect(getItem(result, 'active')).toEqual({ i: 'active', x: 0, y: 0, w: 2, h: 2 });
    expect(getItem(result, 'neighbor')).toEqual({ i: 'neighbor', x: 1, y: 2, w: 1, h: 1 });
    expect(structural).toEqual([
      { i: 'active', x: 0, y: 0, w: 1, h: 1 },
      { i: 'neighbor', x: 1, y: 0, w: 1, h: 1 },
    ]);
  });

  it('recalculates repeated runtime resizes from the same unchanged reference', () => {
    const structural = [
      { i: 'active', x: 0, y: 0, w: 1, h: 1 },
      { i: 'below', x: 0, y: 1, w: 1, h: 1 },
    ] as const;
    const resize = (h: number) => solveLayout({
      items: structural,
      cols: 4,
      mode: 'manual' as const,
      intent: { type: 'RUNTIME_RESIZE' as const, id: 'active', w: 1, h, anchor: 'top-left' as const },
    });

    const first = resize(2);
    const second = resize(3);
    const repeatedFirst = resize(2);

    expect(getItem(first, 'below')).toMatchObject({ y: 2 });
    expect(getItem(second, 'below')).toMatchObject({ y: 3 });
    expect(repeatedFirst).toEqual(first);
    expect(getItem(structural, 'active')).toMatchObject({ w: 1, h: 1 });
  });

  it('places a card flush against the extreme right of the canvas', () => {
    const result = manualMove(
      [{ i: 'active', x: 0, y: 0, w: 2, h: 1 }],
      'active',
      999,
      0,
      6,
    );

    expect(result).toEqual([{ i: 'active', x: 4, y: 0, w: 2, h: 1 }]);
  });

  it('uses a tall active card to propagate several differently sized collisions', () => {
    const result = manualMove(
      [
        { i: 'active', x: 4, y: 8, w: 2, h: 3 },
        { i: 'first', x: 0, y: 0, w: 2, h: 1 },
        { i: 'second', x: 0, y: 1, w: 2, h: 2 },
        { i: 'third', x: 1, y: 3, w: 1, h: 1 },
      ],
      'active',
      0,
      0,
    );

    expect(getItem(result, 'active')).toMatchObject({ y: 0, h: 3 });
    expect(getItem(result, 'first')).toMatchObject({ y: 3 });
    expect(getItem(result, 'second')).toMatchObject({ y: 4, h: 2 });
    expect(getItem(result, 'third')).toMatchObject({ y: 6 });
    expectNoOverlaps(result);
  });

  it('rejects an operation that refers to a missing item', () => {
    expectGridError(
      () => manualMove([{ i: 'present', x: 0, y: 0, w: 1, h: 1 }], 'missing', 0, 0),
      'ITEM_NOT_FOUND',
    );
  });

  it('rejects duplicate item IDs rather than correcting them silently', () => {
    expectGridError(
      () => manualMove(
        [
          { i: 'duplicate', x: 0, y: 0, w: 1, h: 1 },
          { i: 'duplicate', x: 1, y: 0, w: 1, h: 1 },
        ],
        'duplicate',
        0,
        0,
      ),
      'DUPLICATE_ID',
    );
  });

  it('preserves the explicitly selected corner during resize', () => {
    const result = solveLayout({
      items: [{ i: 'active', x: 2, y: 3, w: 2, h: 2 }],
      cols: 8,
      mode: 'manual',
      intent: { type: 'RESIZE', id: 'active', w: 3, h: 4, anchor: 'bottom-right' },
    });

    expect(result).toEqual([{ i: 'active', x: 1, y: 1, w: 3, h: 4 }]);
  });

  it('solves a complex multi-column layout with exact deterministic coordinates', () => {
    const result = manualMove(
      [
        { i: 'active', x: 4, y: 6, w: 2, h: 1 },
        { i: 'b', x: 0, y: 0, w: 3, h: 2 },
        { i: 'c', x: 3, y: 0, w: 2, h: 1 },
        { i: 'd', x: 2, y: 2, w: 3, h: 2 },
        { i: 'e', x: 5, y: 1, w: 1, h: 3 },
        { i: 'f', x: 1, y: 4, w: 2, h: 1 },
      ],
      'active',
      1,
      1,
    );

    expect(result).toEqual([
      { i: 'c', x: 3, y: 0, w: 2, h: 1 },
      { i: 'active', x: 1, y: 1, w: 2, h: 1 },
      { i: 'e', x: 5, y: 1, w: 1, h: 3 },
      { i: 'b', x: 0, y: 2, w: 3, h: 2 },
      { i: 'd', x: 2, y: 4, w: 3, h: 2 },
      { i: 'f', x: 1, y: 6, w: 2, h: 1 },
    ]);
    expectNoOverlaps(result);
  });

  it('moves an active card downward and only pushes cards occupying its destination', () => {
    const result = manualMove(
      [
        { i: 'active', x: 0, y: 0, w: 2, h: 1 },
        { i: 'upper', x: 0, y: 1, w: 1, h: 1 },
        { i: 'destination', x: 1, y: 4, w: 2, h: 2 },
      ],
      'active',
      1,
      4,
    );

    expect(getItem(result, 'active')).toEqual({ i: 'active', x: 1, y: 4, w: 2, h: 1 });
    expect(getItem(result, 'upper')).toEqual({ i: 'upper', x: 0, y: 1, w: 1, h: 1 });
    expect(getItem(result, 'destination')).toEqual({ i: 'destination', x: 1, y: 5, w: 2, h: 2 });
  });

  it.each([
    ['top-right', { i: 'active', x: 1, y: 3, w: 3, h: 1 }],
    ['bottom-left', { i: 'active', x: 2, y: 1, w: 1, h: 4 }],
  ] as const)('preserves the %s resize anchor', (anchor, expected) => {
    const result = solveLayout({
      items: [{ i: 'active', x: 2, y: 3, w: 2, h: 2 }],
      cols: 8,
      mode: 'manual',
      intent: {
        type: 'RESIZE',
        id: 'active',
        w: expected.w,
        h: expected.h,
        anchor,
      },
    });

    expect(result).toEqual([expected]);
  });

  it('resolves an initially overlapping reference layout deterministically', () => {
    const active = { i: 'active', x: 5, y: 5, w: 1, h: 1 } as const;
    const wide = { i: 'wide', x: 0, y: 0, w: 3, h: 2 } as const;
    const partial = { i: 'partial', x: 2, y: 0, w: 2, h: 1 } as const;
    const lower = { i: 'lower', x: 2, y: 1, w: 1, h: 2 } as const;
    const solve = (items: readonly GridLayoutItem[]) => manualMove(items, 'active', 5, 5);

    const first = solve([active, wide, partial, lower]);
    const reordered = solve([lower, partial, active, wide]);

    expect(first).toEqual([
      { i: 'wide', x: 0, y: 0, w: 3, h: 2 },
      { i: 'partial', x: 2, y: 2, w: 2, h: 1 },
      { i: 'lower', x: 2, y: 3, w: 1, h: 2 },
      { i: 'active', x: 5, y: 5, w: 1, h: 1 },
    ]);
    expect(reordered).toEqual(first);
    expectNoOverlaps(first);
  });

  it('is idempotent when an automatic solution is recalculated with the same intent', () => {
    const intent = { type: 'MOVE', id: 'active', x: 3, y: 5 } as const;
    const input = [
      { i: 'active', x: 3, y: 7, w: 1, h: 1 },
      { i: 'first', x: 0, y: 4, w: 2, h: 1 },
      { i: 'second', x: 0, y: 8, w: 1, h: 2 },
    ] as const;

    const first = solveLayout({ items: input, cols: 4, mode: 'automatic', intent });
    const second = solveLayout({ items: first, cols: 4, mode: 'automatic', intent });

    expect(second).toEqual(first);
  });

  describe('directional REORDER and explicit COMPACT', () => {
    const verticalSequence = [
      { i: 'a', x: 0, y: 0, w: 1, h: 1 },
      { i: 'b', x: 0, y: 1, w: 1, h: 1 },
      { i: 'c', x: 0, y: 2, w: 1, h: 1 },
    ] as const;

    it('inserts a top card after the last occupied card without pushing the sequence down', () => {
      const result = manualReorder(verticalSequence, 'a', 0, 2);

      expect(result).toEqual([
        { i: 'b', x: 0, y: 0, w: 1, h: 1 },
        { i: 'c', x: 0, y: 1, w: 1, h: 1 },
        { i: 'a', x: 0, y: 2, w: 1, h: 1 },
      ]);
    });

    it('keeps the downward push chain when reordering from bottom to top', () => {
      const result = manualReorder(verticalSequence, 'c', 0, 0);

      expect(result).toEqual([
        { i: 'c', x: 0, y: 0, w: 1, h: 1 },
        { i: 'a', x: 0, y: 1, w: 1, h: 1 },
        { i: 'b', x: 0, y: 2, w: 1, h: 1 },
      ]);
    });

    it('inserts between two cards while preserving their relative order', () => {
      const result = manualReorder(
        [...verticalSequence, { i: 'd', x: 0, y: 3, w: 1, h: 1 }],
        'a',
        0,
        2,
      );

      expect(result).toEqual([
        { i: 'b', x: 0, y: 0, w: 1, h: 1 },
        { i: 'c', x: 0, y: 1, w: 1, h: 1 },
        { i: 'a', x: 0, y: 2, w: 1, h: 1 },
        { i: 'd', x: 0, y: 3, w: 1, h: 1 },
      ]);
    });

    it('uses exact positioning when the REORDER destination is free', () => {
      const result = manualReorder(
        [
          { i: 'active', x: 0, y: 0, w: 1, h: 1 },
          { i: 'distant', x: 0, y: 5, w: 1, h: 1 },
        ],
        'active',
        0,
        2,
      );

      expect(getItem(result, 'active')).toMatchObject({ x: 0, y: 2 });
      expect(getItem(result, 'distant')).toMatchObject({ x: 0, y: 5 });
    });

    it('preserves manual gaps and unrelated columns outside the traversed sequence', () => {
      const result = manualReorder(
        [
          ...verticalSequence,
          { i: 'manual-gap', x: 3, y: 8, w: 2, h: 1 },
          { i: 'side', x: 4, y: 1, w: 1, h: 2 },
        ],
        'a',
        0,
        2,
      );

      expect(getItem(result, 'manual-gap')).toEqual({ i: 'manual-gap', x: 3, y: 8, w: 2, h: 1 });
      expect(getItem(result, 'side')).toEqual({ i: 'side', x: 4, y: 1, w: 1, h: 2 });
    });

    it('reorders cards with different heights without coordinate swapping', () => {
      const result = manualReorder(
        [
          { i: 'active', x: 0, y: 0, w: 2, h: 1 },
          { i: 'tall', x: 0, y: 1, w: 2, h: 2 },
          { i: 'short', x: 0, y: 3, w: 2, h: 1 },
        ],
        'active',
        0,
        3,
      );

      expect(getItem(result, 'tall')).toMatchObject({ y: 0, h: 2 });
      expect(getItem(result, 'short')).toMatchObject({ y: 2, h: 1 });
      expect(getItem(result, 'active')).toMatchObject({ y: 3 });
      expectNoOverlaps(result);
    });

    it('reorders partially overlapping widths while retaining every X coordinate', () => {
      const result = manualReorder(
        [
          { i: 'active', x: 1, y: 0, w: 2, h: 1 },
          { i: 'wide', x: 0, y: 1, w: 3, h: 1 },
          { i: 'right', x: 2, y: 2, w: 2, h: 1 },
        ],
        'active',
        1,
        2,
      );

      expect(getItem(result, 'wide')).toMatchObject({ x: 0, y: 0, w: 3 });
      expect(getItem(result, 'right')).toMatchObject({ x: 2, y: 1, w: 2 });
      expect(getItem(result, 'active')).toMatchObject({ x: 1, y: 2, w: 2 });
      expectNoOverlaps(result);
    });

    it('falls back deterministically to push-down when mixed heights cannot fill the vacancy', () => {
      const input = [
        { i: 'active', x: 0, y: 0, w: 1, h: 1 },
        { i: 'tall', x: 0, y: 1, w: 1, h: 2 },
      ] as const;

      const first = manualReorder(input, 'active', 0, 1);
      const second = manualReorder(input, 'active', 0, 1);

      expect(first).toEqual([
        { i: 'active', x: 0, y: 1, w: 1, h: 1 },
        { i: 'tall', x: 0, y: 2, w: 1, h: 2 },
      ]);
      expect(second).toEqual(first);
      expectNoOverlaps(first);
    });

    it('does not drift when the same committed reorder is recalculated', () => {
      const first = manualReorder(verticalSequence, 'a', 0, 2);
      const second = manualReorder(first, 'a', 0, 2);
      const third = manualReorder(second, 'a', 0, 2);

      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });

    it('compacts explicitly without an active card or horizontal packing', () => {
      const input = [
        { i: 'a', x: 0, y: 0, w: 1, h: 1 },
        { i: 'b', x: 0, y: 4, w: 1, h: 1 },
        { i: 'c', x: 0, y: 6, w: 1, h: 1 },
        { i: 'side', x: 3, y: 7, w: 2, h: 2 },
      ] as const;
      const snapshot = structuredClone(input);

      const result = solveLayout({
        items: input,
        cols: 6,
        mode: 'automatic',
        intent: { type: 'COMPACT' },
      });

      expect(getItem(result, 'a')).toMatchObject({ x: 0, y: 0 });
      expect(getItem(result, 'b')).toMatchObject({ x: 0, y: 1 });
      expect(getItem(result, 'c')).toMatchObject({ x: 0, y: 2 });
      expect(getItem(result, 'side')).toMatchObject({ x: 3, y: 0, w: 2, h: 2 });
      expect(input).toEqual(snapshot);
      expectNoOverlaps(result);
    });

    it('normalizes projected collisions without an artificial active card', () => {
      const input = [
        { i: 'right', x: 1, y: 0, w: 2, h: 1 },
        { i: 'left', x: 0, y: 0, w: 2, h: 2 },
        { i: 'lower', x: 1, y: 1, w: 1, h: 1 },
      ] as const;
      const snapshot = structuredClone(input);
      const solve = (items: readonly GridLayoutItem[]) => solveLayout({
        items,
        cols: 4,
        mode: 'manual' as const,
        intent: { type: 'NORMALIZE' as const },
      });

      const result = solve(input);
      expect(result).toEqual([
        { i: 'left', x: 0, y: 0, w: 2, h: 2 },
        { i: 'right', x: 1, y: 2, w: 2, h: 1 },
        { i: 'lower', x: 1, y: 3, w: 1, h: 1 },
      ]);
      expect(solve([...input].reverse())).toEqual(result);
      expect(input).toEqual(snapshot);
      expectNoOverlaps(result);
    });
  });
});
