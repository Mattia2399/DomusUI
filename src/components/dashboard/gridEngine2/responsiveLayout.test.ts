import { describe, expect, it } from 'vitest';
import { GRID_ENGINE_COLS } from '../DashboardGrid';
import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import { GRID_ENGINE_LAB_SCENARIOS } from './labFixtures';
import type { GridLayoutItem } from './model';
import {
  RESPONSIVE_LAB_BREAKPOINTS,
  breakpointForCanvasWidth,
  commitBreakpointLayout,
  createResponsiveLabState,
  deriveResponsiveLayout,
  layoutForBreakpoint,
  originForBreakpoint,
  responsiveReadingOrder,
  restoreAutomaticBreakpoint,
} from './responsiveLayout';

function expectValidLayout(items: readonly GridLayoutItem[], cols: number) {
  for (const item of items) {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.w).toBeGreaterThanOrEqual(1);
    expect(item.x + item.w).toBeLessThanOrEqual(cols);
  }
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      const a = items[first];
      const b = items[second];
      expect(
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
        `${a.i} overlaps ${b.i}`,
      ).toBe(false);
    }
  }
}

function geometryById(items: readonly GridLayoutItem[]) {
  return [...items].sort((first, second) => (
    first.i === second.i ? 0 : first.i < second.i ? -1 : 1
  ));
}

describe('responsive Grid Engine 2.0 derivation', () => {
  it('uses the six authoritative DashboardGrid breakpoints and column counts', () => {
    expect(RESPONSIVE_LAB_BREAKPOINTS).toEqual([
      { breakpoint: '2xl', minWidth: 1536, cols: 12 },
      { breakpoint: 'xl', minWidth: 1280, cols: 12 },
      { breakpoint: 'lg', minWidth: 1024, cols: 8 },
      { breakpoint: 'md', minWidth: 768, cols: 6 },
      { breakpoint: 'sm', minWidth: 640, cols: 4 },
      { breakpoint: 'xs', minWidth: 0, cols: 2 },
    ]);
  });

  it.each([
    [390, 'xs', 2],
    [639, 'xs', 2],
    [640, 'sm', 4],
    [767, 'sm', 4],
    [768, 'md', 6],
    [1023, 'md', 6],
    [1024, 'lg', 8],
    [1279, 'lg', 8],
    [1280, 'xl', 12],
    [1535, 'xl', 12],
    [1536, '2xl', 12],
  ] as const)('maps %dpx to %s with %d columns', (width, breakpoint, cols) => {
    expect(breakpointForCanvasWidth(width)).toBe(breakpoint);
    expect(GRID_ENGINE_COLS[breakpoint]).toBe(cols);
  });

  it('is deterministic, immutable, and independent from array order', () => {
    const source = GRID_ENGINE_LAB_SCENARIOS[3].items;
    const snapshot = structuredClone(source);
    const expected = deriveResponsiveLayout(source, 6, 2);
    const reversed = deriveResponsiveLayout([...source].reverse(), 6, 2);

    expect(reversed).toEqual(expected);
    expect(deriveResponsiveLayout(source, 6, 2)).toEqual(expected);
    expect(source).toEqual(snapshot);
    expectValidLayout(expected, 2);
  });

  it('keeps reference reading order predictable without horizontal packing', () => {
    const source = GRID_ENGINE_LAB_SCENARIOS[3].items;
    const sourceOrder = responsiveReadingOrder(source);
    const mobile = deriveResponsiveLayout(source, 6, 2);

    expect(responsiveReadingOrder(mobile)).toEqual(sourceOrder);
    expectValidLayout(mobile, 2);
  });

  it('preserves reading order at all six breakpoints for the mixed-size fixture', () => {
    const source = GRID_ENGINE_LAB_SCENARIOS[3].items;
    const reference = deriveResponsiveLayout(source, 6, 12);
    const sourceOrder = responsiveReadingOrder(reference);

    for (const { breakpoint, cols } of RESPONSIVE_LAB_BREAKPOINTS) {
      const derived = deriveResponsiveLayout([...reference].reverse(), 12, cols);
      expect(responsiveReadingOrder(derived), breakpoint).toEqual(sourceOrder);
      expectValidLayout(derived, cols);
    }
  });

  it('derives every breakpoint directly and returns to desktop without drift', () => {
    const state = createResponsiveLabState(GRID_ENGINE_LAB_SCENARIOS[0].items, 6);
    const desktop = layoutForBreakpoint(state, 'xl');
    const mobile = layoutForBreakpoint(state, 'xs');
    const desktopAgain = layoutForBreakpoint(state, 'xl');

    expect(desktopAgain).toEqual(desktop);
    expectValidLayout(mobile, 2);
  });

  it('preserves a custom mobile layout after desktop changes and can restore automatic mode', () => {
    const initial = createResponsiveLabState(GRID_ENGINE_LAB_SCENARIOS[0].items, 6);
    const mobile = layoutForBreakpoint(initial, 'xs');
    const customizedMobile = mobile.map((item, index) => (
      index === 0 ? { ...item, y: item.y + 6 } : item
    ));
    const withMobile = commitBreakpointLayout(initial, 'xs', customizedMobile);
    const desktop = layoutForBreakpoint(withMobile, 'xl');
    const changedDesktop = desktop.map((item, index) => (
      index === 0 ? { ...item, y: item.y + 3, w: Math.min(12, item.w + 1) } : item
    )).reverse();
    const afterDesktop = commitBreakpointLayout(withMobile, 'xl', changedDesktop);

    expect(originForBreakpoint(afterDesktop, 'xs')).toBe('custom');
    expect(geometryById(layoutForBreakpoint(afterDesktop, 'xs'))).toEqual(geometryById(customizedMobile));
    expect(layoutForBreakpoint(afterDesktop, 'sm')).not.toEqual(layoutForBreakpoint(initial, 'sm'));

    const restored = restoreAutomaticBreakpoint(afterDesktop, 'xs');
    expect(originForBreakpoint(restored, 'xs')).toBe('generated');
    expect(layoutForBreakpoint(restored, 'xs')).toEqual(
      deriveResponsiveLayout(changedDesktop, 12, 2),
    );
  });

  it('adds new reference cards to a custom layout without moving existing custom geometry', () => {
    const initial = createResponsiveLabState(GRID_ENGINE_LAB_SCENARIOS[0].items, 6);
    const mobile = layoutForBreakpoint(initial, 'xs');
    const customizedMobile = mobile.map((item) => (
      item.i === 'move-a' ? { ...item, y: item.y + 7 } : item
    ));
    const withMobile = commitBreakpointLayout(initial, 'xs', customizedMobile);
    const newReferenceCard = { i: 'new-reference-card', x: 10, y: 1, w: 2, h: 2 } as const;
    const withNewReference = commitBreakpointLayout(
      withMobile,
      'xl',
      [...withMobile.reference, newReferenceCard],
    );
    const reconciled = layoutForBreakpoint(withNewReference, 'xs');
    const reorderedCustomState = {
      ...withNewReference,
      custom: {
        ...withNewReference.custom,
        xs: [...customizedMobile].reverse(),
      },
    };

    for (const customItem of customizedMobile) {
      expect(reconciled.find((item) => item.i === customItem.i)).toEqual(customItem);
    }
    expect(reconciled.find((item) => item.i === newReferenceCard.i)).toBeDefined();
    expect(originForBreakpoint(withNewReference, 'xs')).toBe('custom');
    expect(layoutForBreakpoint(reorderedCustomState, 'xs')).toEqual(reconciled);
    expectValidLayout(reconciled, 2);
  });

  it('keeps the 30-card stress fixture bounded and collision-free at every breakpoint', () => {
    const stress = GRID_ENGINE_LAB_SCENARIOS.find((scenario) => scenario.id === 'responsive-density')!;
    expect(stress.items).toHaveLength(30);
    const state = createResponsiveLabState(stress.items, 6);
    const breakpoints: DashboardGridBreakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];

    for (const breakpoint of breakpoints) {
      expectValidLayout(layoutForBreakpoint(state, breakpoint), GRID_ENGINE_COLS[breakpoint]);
    }
  });

  it('measures repeated 30-card derivations without inferring a frame-rate guarantee', () => {
    const stress = GRID_ENGINE_LAB_SCENARIOS.find((scenario) => scenario.id === 'responsive-density')!;
    const state = createResponsiveLabState(stress.items, 6);
    const breakpoints: DashboardGridBreakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];
    const repetitions = 100;
    const startedAt = performance.now();
    let checksum = 0;

    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      for (const breakpoint of breakpoints) {
        checksum += layoutForBreakpoint(state, breakpoint).length;
      }
    }

    const totalMs = performance.now() - startedAt;
    const calls = repetitions * breakpoints.length;
    const averageMs = totalMs / calls;
    console.info(`[grid-engine-2 solver benchmark] ${JSON.stringify({ calls, totalMs, averageMs })}`);
    expect(checksum).toBe(calls * 30);
    expect(Number.isFinite(averageMs)).toBe(true);
  });
});
