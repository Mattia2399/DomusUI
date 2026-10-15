import { describe, expect, it, vi } from 'vitest';
import type { GridLayoutItem } from './model';
import {
  solveGridEngineRootRuntimeLayout,
  type GridEngineRootRuntimeIssueCode,
  type GridEngineRootRuntimeOverride,
  type GridEngineRootRuntimeResult,
} from './gridEngineRootRuntimeSolver';

function layoutOf(result: GridEngineRootRuntimeResult) {
  expect(result.status).not.toBe('invalid');
  if (result.status === 'invalid') throw new Error(result.issues.map((issue) => issue.message).join('\n'));
  return result.layout;
}

function item(layout: readonly GridLayoutItem[], id: string) {
  const found = layout.find((candidate) => candidate.i === id);
  expect(found, `Missing layout item ${id}`).toBeDefined();
  return found!;
}

function expectIssue(result: GridEngineRootRuntimeResult, code: GridEngineRootRuntimeIssueCode) {
  expect(result.status).toBe('invalid');
  if (result.status !== 'invalid') throw new Error(`Expected ${code}, received ${result.status}`);
  expect(result.layout).toBeNull();
  expect(result.issues.some((issue) => issue.code === code)).toBe(true);
}

function expectNoOverlaps(layout: readonly GridLayoutItem[]) {
  layout.forEach((candidate, index) => {
    layout.slice(0, index).forEach((previous) => {
      const overlaps = (
        candidate.x < previous.x + previous.w &&
        candidate.x + candidate.w > previous.x &&
        candidate.y < previous.y + previous.h &&
        candidate.y + candidate.h > previous.y
      );
      expect(overlaps, `${previous.i} overlaps ${candidate.i}`).toBe(false);
    });
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function laneFixture(count: number, cols = 6): GridLayoutItem[] {
  const itemWidth = 2;
  const lanes = Math.floor(cols / itemWidth);
  return Array.from({ length: count }, (_, index) => ({
    i: `root-${index}`,
    x: (index % lanes) * itemWidth,
    y: Math.floor(index / lanes),
    w: itemWidth,
    h: 1,
  }));
}

describe('solveGridEngineRootRuntimeLayout', () => {
  const reference = [
    { i: 'a', x: 0, y: 0, w: 2, h: 1 },
    { i: 'b', x: 0, y: 1, w: 2, h: 1 },
    { i: 'c', x: 4, y: 0, w: 2, h: 1 },
  ] as const;

  it('returns an equal isolated structural layout when there are no overrides', () => {
    const result = solveGridEngineRootRuntimeLayout({ structuralLayout: reference, cols: 6 });

    expect(result.status).toBe('unchanged');
    expect(layoutOf(result)).toEqual(reference);
    expect(layoutOf(result)).not.toBe(reference);
    expect(layoutOf(result)[0]).not.toBe(reference[0]);
  });

  it('accepts an empty structural layout when there are no runtime requests', () => {
    const result = solveGridEngineRootRuntimeLayout({ structuralLayout: [], cols: 12, overrides: [] });

    expect(result).toEqual({ status: 'unchanged', layout: [], appliedOverrideIds: [] });
  });

  it('expands one card and moves only the colliding card below it', () => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: reference,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 2 }],
    });

    expect(result.status).toBe('resolved');
    expect(layoutOf(result)).toEqual([
      { i: 'a', x: 0, y: 0, w: 2, h: 2 },
      { i: 'b', x: 0, y: 2, w: 2, h: 1 },
      { i: 'c', x: 4, y: 0, w: 2, h: 1 },
    ]);
  });

  it('supports a temporary contraction without pulling other cards into the structural gap', () => {
    const structural = [
      { i: 'a', x: 0, y: 0, w: 2, h: 2 },
      { i: 'b', x: 0, y: 2, w: 2, h: 1 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 4,
      overrides: [{ id: 'a', w: 2, h: 1 }],
    });

    expect(layoutOf(result)).toEqual([
      { i: 'a', x: 0, y: 0, w: 2, h: 1 },
      { i: 'b', x: 0, y: 2, w: 2, h: 1 },
    ]);
  });

  it('propagates an expansion through a vertical collision chain', () => {
    const structural = Array.from({ length: 5 }, (_, index) => ({
      i: String.fromCharCode(97 + index), x: 0, y: index, w: 2, h: 1,
    }));
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 3 }],
    });

    expect(layoutOf(result).map(({ i, y }) => ({ i, y }))).toEqual([
      { i: 'a', y: 0 },
      { i: 'b', y: 3 },
      { i: 'c', y: 4 },
      { i: 'd', y: 5 },
      { i: 'e', y: 6 },
    ]);
  });

  it('handles cards with different widths without moving a separate lane', () => {
    const structural = [
      { i: 'active', x: 1, y: 0, w: 2, h: 1 },
      { i: 'wide', x: 3, y: 1, w: 2, h: 2 },
      { i: 'side', x: 0, y: 1, w: 1, h: 3 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'active', w: 3, h: 2 }],
    });

    expect(item(layoutOf(result), 'wide')).toEqual({ i: 'wide', x: 3, y: 2, w: 2, h: 2 });
    expect(item(layoutOf(result), 'side')).toEqual(structural[2]);
  });

  it('handles cards with different heights in the collision chain', () => {
    const structural = [
      { i: 'active', x: 0, y: 0, w: 2, h: 1 },
      { i: 'tall', x: 0, y: 1, w: 2, h: 3 },
      { i: 'short', x: 1, y: 4, w: 1, h: 1 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 4,
      overrides: [{ id: 'active', w: 2, h: 2 }],
    });

    expect(layoutOf(result)).toEqual([
      { i: 'active', x: 0, y: 0, w: 2, h: 2 },
      { i: 'tall', x: 0, y: 2, w: 2, h: 3 },
      { i: 'short', x: 1, y: 5, w: 1, h: 1 },
    ]);
  });

  it('detects collisions caused by partially overlapping column ranges', () => {
    const structural = [
      { i: 'active', x: 0, y: 0, w: 2, h: 1 },
      { i: 'partial', x: 2, y: 1, w: 2, h: 1 },
      { i: 'outside', x: 3, y: 0, w: 1, h: 1 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 4,
      overrides: [{ id: 'active', w: 3, h: 2 }],
    });

    expect(item(layoutOf(result), 'partial')).toMatchObject({ x: 2, y: 2 });
    expect(item(layoutOf(result), 'outside')).toEqual(structural[2]);
    expectNoOverlaps(layoutOf(result));
  });

  it('repeats one hundred ON/OFF cycles without geometric drift', () => {
    let lastOff: readonly GridLayoutItem[] = reference;

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const on = solveGridEngineRootRuntimeLayout({
        structuralLayout: reference,
        cols: 6,
        overrides: [{ id: 'a', w: 2, h: 2 }],
      });
      expect(item(layoutOf(on), 'b').y).toBe(2);
      const off = solveGridEngineRootRuntimeLayout({ structuralLayout: reference, cols: 6 });
      lastOff = layoutOf(off);
    }

    expect(lastOff).toEqual(reference);
  });

  it('never mutates the original structural array or its items', () => {
    const structural = deepFreeze(reference.map((entry) => ({ ...entry })));
    const snapshot = structuredClone(structural);

    solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 2 }],
    });

    expect(structural).toEqual(snapshot);
  });

  it('never mutates the original override array or its entries', () => {
    const overrides = deepFreeze<GridEngineRootRuntimeOverride[]>([
      { id: 'a', w: 2, h: 2 },
      { id: 'b', w: 2, h: 2 },
    ]);
    const snapshot = structuredClone(overrides);

    solveGridEngineRootRuntimeLayout({ structuralLayout: reference, cols: 6, overrides });

    expect(overrides).toEqual(snapshot);
  });

  it('returns identical geometry for repeated calls with identical current state', () => {
    const input = {
      structuralLayout: reference,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 2 }],
    } as const;

    expect(solveGridEngineRootRuntimeLayout(input)).toEqual(solveGridEngineRootRuntimeLayout(input));
  });

  it('is independent from the order of runtime overrides', () => {
    const structural = [
      { i: 'a', x: 0, y: 0, w: 2, h: 1 },
      { i: 'b', x: 0, y: 1, w: 2, h: 1 },
      { i: 'c', x: 0, y: 2, w: 2, h: 1 },
    ] as const;
    const first = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 4,
      overrides: [{ id: 'b', w: 2, h: 2 }, { id: 'a', w: 2, h: 2 }],
    });
    const reversed = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 4,
      overrides: [{ id: 'a', w: 2, h: 2 }, { id: 'b', w: 2, h: 2 }],
    });

    expect(reversed).toEqual(first);
  });

  it('resolves two simultaneous interacting expansions', () => {
    const structural = [
      { i: 'a', x: 0, y: 0, w: 2, h: 1 },
      { i: 'b', x: 0, y: 1, w: 2, h: 1 },
      { i: 'c', x: 0, y: 2, w: 2, h: 1 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 4,
      overrides: [{ id: 'a', w: 2, h: 2 }, { id: 'b', w: 2, h: 2 }],
    });

    expect(layoutOf(result)).toEqual([
      { i: 'a', x: 0, y: 0, w: 2, h: 2 },
      { i: 'b', x: 0, y: 2, w: 2, h: 2 },
      { i: 'c', x: 0, y: 4, w: 2, h: 1 },
    ]);
  });

  it('resolves three simultaneous interacting expansions', () => {
    const structural = ['a', 'b', 'c', 'd'].map((id, y) => ({ i: id, x: 0, y, w: 2, h: 1 }));
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 4,
      overrides: ['a', 'b', 'c'].map((id) => ({ id, w: 2, h: 2 })),
    });

    expect(layoutOf(result).map(({ i, y, h }) => ({ i, y, h }))).toEqual([
      { i: 'a', y: 0, h: 2 },
      { i: 'b', y: 2, h: 2 },
      { i: 'c', y: 4, h: 2 },
      { i: 'd', y: 6, h: 1 },
    ]);
  });

  it('removes one override while preserving every remaining override', () => {
    const structural = ['a', 'b', 'c'].map((id, y) => ({ i: id, x: 0, y, w: 2, h: 1 }));
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 4,
      overrides: [{ id: 'b', w: 2, h: 2 }],
    });

    expect(layoutOf(result)).toEqual([
      { i: 'a', x: 0, y: 0, w: 2, h: 1 },
      { i: 'b', x: 0, y: 1, w: 2, h: 2 },
      { i: 'c', x: 0, y: 3, w: 2, h: 1 },
    ]);
  });

  it('removes every override by reconstructing the exact structural reference', () => {
    const expanded = solveGridEngineRootRuntimeLayout({
      structuralLayout: reference,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 2 }],
    });
    expect(layoutOf(expanded)).not.toEqual(reference);

    const restored = solveGridEngineRootRuntimeLayout({
      structuralLayout: reference,
      cols: 6,
      overrides: [],
    });
    expect(layoutOf(restored)).toEqual(reference);
  });

  it.each([12, 8, 6, 4, 2])('resolves independently on a %i-column breakpoint grid', (cols) => {
    const structural = [
      { i: 'active', x: 0, y: 0, w: 1, h: 1 },
      { i: 'below', x: 0, y: 1, w: 1, h: 1 },
      { i: 'right', x: cols - 1, y: 0, w: 1, h: 1 },
    ];
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols,
      overrides: [{ id: 'active', w: 1, h: 2 }],
    });

    expect(item(layoutOf(result), 'below').y).toBe(2);
    expect(item(layoutOf(result), 'right')).toEqual(structural[2]);
  });

  it('treats a temporarily taller Stack as one atomic root rectangle', () => {
    const structural = [
      { i: 'stack:lights', x: 0, y: 0, w: 4, h: 2 },
      { i: 'outside', x: 1, y: 2, w: 2, h: 1 },
      { i: 'side', x: 4, y: 0, w: 2, h: 4 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'stack:lights', w: 4, h: 4 }],
    });

    expect(layoutOf(result)).toEqual([
      { i: 'stack:lights', x: 0, y: 0, w: 4, h: 4 },
      { i: 'outside', x: 1, y: 4, w: 2, h: 1 },
      { i: 'side', x: 4, y: 0, w: 2, h: 4 },
    ]);
  });

  it('rejects duplicate structural IDs', () => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: [
        { i: 'duplicate', x: 0, y: 0, w: 1, h: 1 },
        { i: 'duplicate', x: 1, y: 0, w: 1, h: 1 },
      ],
      cols: 4,
    });

    expectIssue(result, 'DUPLICATE_ITEM_ID');
  });

  it('rejects an override for an unknown root ID', () => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: reference,
      cols: 6,
      overrides: [{ id: 'missing', w: 1, h: 2 }],
    });

    expectIssue(result, 'UNKNOWN_OVERRIDE_ID');
  });

  it('rejects an initially overlapping structural layout', () => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: [
        { i: 'a', x: 0, y: 0, w: 2, h: 2 },
        { i: 'b', x: 1, y: 1, w: 2, h: 1 },
      ],
      cols: 4,
      overrides: [{ id: 'a', w: 2, h: 3 }],
    });

    expectIssue(result, 'STRUCTURAL_OVERLAP');
  });

  it.each([
    { id: 'a', w: 0, h: 1 },
    { id: 'a', w: 2, h: -1 },
    { id: 'a', w: 2.5, h: 1 },
    { id: 'a', w: 2, h: Number.NaN },
  ])('rejects invalid runtime dimensions %#', (override) => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: reference,
      cols: 6,
      overrides: [override],
    });

    expectIssue(result, 'INVALID_OVERRIDE_GEOMETRY');
  });

  it('rejects structural numbers instead of rounding or clamping them', () => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: [{ i: 'a', x: -1, y: 0, w: 1.5, h: 1 }],
      cols: 4,
    });

    expectIssue(result, 'INVALID_ITEM_GEOMETRY');
  });

  it.each([0, -1, 2.5, Number.POSITIVE_INFINITY])('rejects invalid column count %s', (cols) => {
    const result = solveGridEngineRootRuntimeLayout({ structuralLayout: reference, cols });

    expectIssue(result, 'INVALID_COLUMNS');
  });

  it('rejects a structural item outside the available columns', () => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: [{ i: 'a', x: 3, y: 0, w: 2, h: 1 }],
      cols: 4,
    });

    expectIssue(result, 'ITEM_OUT_OF_BOUNDS');
  });

  it('rejects an override that cannot fit at the structural X coordinate', () => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: [{ i: 'a', x: 3, y: 0, w: 1, h: 1 }],
      cols: 4,
      overrides: [{ id: 'a', w: 2, h: 1 }],
    });

    expectIssue(result, 'OVERRIDE_OUT_OF_BOUNDS');
  });

  it('rejects contradictory simultaneous requests for the same root item', () => {
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: reference,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 2 }, { id: 'a', w: 2, h: 3 }],
    });

    expectIssue(result, 'DUPLICATE_OVERRIDE');
  });

  it('leaves no collision after mixed simultaneous width and height overrides', () => {
    const structural = [
      { i: 'a', x: 0, y: 0, w: 1, h: 1 },
      { i: 'b', x: 1, y: 0, w: 1, h: 2 },
      { i: 'c', x: 0, y: 1, w: 1, h: 1 },
      { i: 'd', x: 2, y: 1, w: 2, h: 2 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 2 }, { id: 'd', w: 3, h: 3 }],
    });

    expectNoOverlaps(layoutOf(result));
  });

  it('does not repack intentional vertical gaps or disconnected columns', () => {
    const structural = [
      { i: 'active', x: 0, y: 5, w: 2, h: 1 },
      { i: 'distant', x: 0, y: 10, w: 2, h: 1 },
      { i: 'other-lane', x: 4, y: 12, w: 2, h: 1 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'active', w: 2, h: 2 }],
    });

    expect(item(layoutOf(result), 'distant')).toEqual(structural[1]);
    expect(item(layoutOf(result), 'other-lane')).toEqual(structural[2]);
  });

  it('preserves every ID exactly once', () => {
    const structural = laneFixture(12);
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'root-0', w: 2, h: 2 }, { id: 'root-4', w: 2, h: 2 }],
    });
    const ids = layoutOf(result).map(({ i }) => i);

    expect(ids).toEqual(structural.map(({ i }) => i));
    expect(new Set(ids).size).toBe(structural.length);
  });

  it('preserves the structural reference order even when it is not reading order', () => {
    const structural = [reference[2], reference[0], reference[1]];
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 2 }],
    });

    expect(layoutOf(result).map(({ i }) => i)).toEqual(['c', 'a', 'b']);
  });

  it('keeps an already compact layout compact when the requested span is unchanged', () => {
    const structural = [
      { i: 'a', x: 0, y: 0, w: 1, h: 1 },
      { i: 'b', x: 0, y: 1, w: 1, h: 1 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 2,
      overrides: [{ id: 'a', w: 1, h: 1 }],
    });

    expect(result.status).toBe('unchanged');
    expect(layoutOf(result)).toEqual(structural);
  });

  it('preserves an intentional manual hole during a nearby runtime expansion', () => {
    const structural = [
      { i: 'a', x: 0, y: 0, w: 1, h: 1 },
      { i: 'manual-gap', x: 0, y: 5, w: 1, h: 1 },
      { i: 'side', x: 1, y: 3, w: 1, h: 1 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 2,
      overrides: [{ id: 'a', w: 1, h: 2 }],
    });

    expect(item(layoutOf(result), 'manual-gap').y).toBe(5);
    expect(item(layoutOf(result), 'side').y).toBe(3);
  });

  it('returns to the reference after a temporary height change', () => {
    const during = solveGridEngineRootRuntimeLayout({
      structuralLayout: reference,
      cols: 6,
      overrides: [{ id: 'a', w: 2, h: 4 }],
    });
    expect(item(layoutOf(during), 'b').y).toBe(4);

    const after = solveGridEngineRootRuntimeLayout({ structuralLayout: reference, cols: 6 });
    expect(layoutOf(after)).toEqual(reference);
  });

  it('resolves differently sized adaptive cards at different positions', () => {
    const structural = [
      { i: 'wide-adaptive', x: 0, y: 0, w: 2, h: 1 },
      { i: 'wide-below', x: 1, y: 1, w: 3, h: 1 },
      { i: 'narrow-adaptive', x: 4, y: 0, w: 1, h: 2 },
      { i: 'narrow-below', x: 4, y: 2, w: 1, h: 1 },
    ] as const;
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [
        { id: 'wide-adaptive', w: 3, h: 3 },
        { id: 'narrow-adaptive', w: 1, h: 4 },
      ],
    });

    expect(item(layoutOf(result), 'wide-below').y).toBe(3);
    expect(item(layoutOf(result), 'narrow-below').y).toBe(4);
    expectNoOverlaps(layoutOf(result));
  });

  it('resolves an exact 22-root fixture without loss, duplication, or overlap', () => {
    const structural = laneFixture(22);
    const result = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 6,
      overrides: [{ id: 'root-0', w: 2, h: 2 }, { id: 'root-10', w: 2, h: 3 }],
    });
    const runtime = layoutOf(result);

    expect(runtime).toHaveLength(22);
    expect(runtime.map(({ i }) => i)).toEqual(structural.map(({ i }) => i));
    expect(item(runtime, 'root-2')).toEqual(structural[2]);
    expectNoOverlaps(runtime);
  });

  it('resolves an exact 30-root fixture deterministically', () => {
    const structural = laneFixture(30, 12);
    const overrides = [
      { id: 'root-0', w: 2, h: 3 },
      { id: 'root-6', w: 2, h: 2 },
      { id: 'root-14', w: 2, h: 4 },
    ] as const;
    const first = solveGridEngineRootRuntimeLayout({ structuralLayout: structural, cols: 12, overrides });
    const second = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 12,
      overrides: [...overrides].reverse(),
    });

    expect(layoutOf(first)).toHaveLength(30);
    expect(second).toEqual(first);
    expectNoOverlaps(layoutOf(first));
  });

  it('uses no external service while transforming plain geometry', () => {
    const externalCall = vi.fn(() => {
      throw new Error('External services are forbidden.');
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = externalCall as typeof fetch;

    try {
      const result = solveGridEngineRootRuntimeLayout({
        structuralLayout: reference,
        cols: 6,
        overrides: [{ id: 'a', w: 2, h: 2 }],
      });
      expect(result.status).toBe('resolved');
      expect(externalCall).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
