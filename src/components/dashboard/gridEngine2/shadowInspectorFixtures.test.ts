import { describe, expect, it } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import { createShadowInspectorFixtureSnapshot } from './shadowInspectorFixtures';
import { meaningfulDifferenceCategories } from './shadowInspectorSnapshot';

function intersects(
  first: { x: number; y: number; w: number; h: number },
  second: { x: number; y: number; w: number; h: number },
) {
  return first.x < second.x + second.w && first.x + first.w > second.x &&
    first.y < second.y + second.h && first.y + first.h > second.y;
}

describe('Shadow Inspector fixtures', () => {
  it('provides all six canonical breakpoints with the expected columns', () => {
    const snapshot = createShadowInspectorFixtureSnapshot('identical');

    expect(Object.keys(snapshot.report.breakpoints)).toEqual([...DASHBOARD_GRID_BREAKPOINT_ORDER]);
    expect(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => snapshot.report.breakpoints[breakpoint].cols)).toEqual([12, 12, 8, 6, 4, 2]);
  });

  it('does not create false differences for identical valid geometry', () => {
    const snapshot = createShadowInspectorFixtureSnapshot('identical');

    expect(Object.values(snapshot.report.breakpoints).every((report) => report.differences.every(
      (difference) => meaningfulDifferenceCategories(difference.categories).length === 0,
    ))).toBe(true);
  });

  it('marks controlled overlap and expected algorithm differences', () => {
    const report = createShadowInspectorFixtureSnapshot('collision').report.breakpoints.xl;

    expect(report.collisions).toHaveLength(1);
    expect(report.differences.some((difference) => difference.categories.includes('OVERLAP'))).toBe(true);
    expect(report.differences.some((difference) => difference.categories.includes('EXPECTED_ALGORITHM_DIFFERENCE'))).toBe(true);
  });

  it('returns collision-free solver geometry without renderer compaction', () => {
    const report = createShadowInspectorFixtureSnapshot('collision').report.breakpoints.xl;
    const normalized = report.differences.flatMap((difference) => difference.normalized ? [difference.normalized] : []);

    expect(normalized.every((item, index) => normalized.slice(index + 1).every((other) => !intersects(item, other)))).toBe(true);
  });

  it('keeps all Stack kinds synthetic and reports unavailable inner columns', () => {
    const snapshot = createShadowInspectorFixtureSnapshot('stacks');

    expect(snapshot.report.summary).toMatchObject({ rootElementCount: 3, stackContainerCount: 3, stackChildCount: 6 });
    expect(snapshot.report.stacks.map((stack) => stack.kind)).toEqual(expect.arrayContaining([
      'stack-grid',
      'stack-horizontal',
      'stack-vertical',
    ]));
    expect(snapshot.report.stacks).toHaveLength(3);
    expect(snapshot.report.stacks.every(
      (stack) => Object.values(stack.breakpoints).every((report) => report.categories.INSUFFICIENT_DATA! > 0),
    )).toBe(true);
  });

  it('handles the 30-element fixture and records finite local timings', () => {
    const values = [0, 1.25, 1.25, 3.75];
    const snapshot = createShadowInspectorFixtureSnapshot('density-30', () => values.shift() ?? 3.75);

    expect(snapshot.report.summary.rootElementCount).toBe(30);
    expect(Object.values(snapshot.report.breakpoints).every((report) => report.itemCount === 30)).toBe(true);
    expect(snapshot.timings).toEqual({ analysisMs: 3.75, conversionMs: 1.25, comparisonMs: 2.5 });
  });
});
