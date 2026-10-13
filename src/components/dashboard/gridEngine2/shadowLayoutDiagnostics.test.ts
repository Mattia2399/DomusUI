import { describe, expect, it } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import type { ShadowLayoutAdapterInput } from './shadowLayoutAdapter';
import { analyzeShadowLayouts } from './shadowLayoutDiagnostics';

function layouts(items: ShadowLayoutAdapterInput['legacyLayouts']['xl']) {
  return Object.fromEntries(
    DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [breakpoint, structuredClone(items ?? [])]),
  ) as ShadowLayoutAdapterInput['legacyLayouts'];
}

function createInput(): ShadowLayoutAdapterInput {
  const items = [
    { i: 'section', x: 0, y: 0, w: 2, h: 1 },
    { i: 'widget', x: 2, y: 0, w: 2, h: 2 },
  ];
  return {
    sections: [{ id: 'section', kind: 'greeting', layout: { ...items[0] } }],
    widgets: [{ id: 'widget', kind: 'light', layout: { ...items[1] } }],
    explicitResponsiveLayouts: {},
    legacyLayouts: layouts(items),
    runtimeLayouts: layouts(items),
  };
}

describe('Grid Engine 2.0 Shadow diagnostics', () => {
  it('analyzes all six authoritative breakpoints and records their columns', () => {
    const report = analyzeShadowLayouts(createInput());

    expect(Object.values(report.breakpoints).map(({ breakpoint, cols }) => [breakpoint, cols])).toEqual([
      ['2xl', 12],
      ['xl', 12],
      ['lg', 8],
      ['md', 6],
      ['sm', 4],
      ['xs', 2],
    ]);
  });

  it('classifies unchanged custom sizes as exact instead of forcing presets', () => {
    const input = createInput();
    const custom = [
      { i: 'section', x: 0, y: 0, w: 7, h: 9 },
      { i: 'widget', x: 7, y: 0, w: 5, h: 13 },
    ];
    const report = analyzeShadowLayouts({
      ...input,
      legacyLayouts: { ...input.legacyLayouts, xl: custom },
      runtimeLayouts: { ...input.runtimeLayouts, xl: custom },
    });

    expect(report.breakpoints.xl.differences.every((difference) => difference.categories.includes('EXACT_MATCH'))).toBe(true);
    expect(report.breakpoints.xl.differences.find((difference) => difference.originalId === 'widget')?.displayed).toMatchObject({
      w: 5,
      h: 13,
    });
  });

  it('detects collisions and classifies NORMALIZE movement as an expected algorithm difference', () => {
    const input = createInput();
    const colliding = [
      { i: 'section', x: 0, y: 0, w: 2, h: 2 },
      { i: 'widget', x: 1, y: 0, w: 2, h: 1 },
    ];
    const report = analyzeShadowLayouts({
      ...input,
      legacyLayouts: { ...input.legacyLayouts, xl: colliding },
      runtimeLayouts: { ...input.runtimeLayouts, xl: colliding },
    });

    expect(report.breakpoints.xl.collisions).toHaveLength(1);
    expect(report.breakpoints.xl.differences.some((difference) => (
      difference.categories.includes('OVERLAP') &&
      difference.categories.includes('EXPECTED_ALGORITHM_DIFFERENCE')
    ))).toBe(true);
  });

  it('reports out-of-bounds geometry and preserves both legacy and normalized values', () => {
    const input = createInput();
    const outOfBounds = [
      { i: 'section', x: 11, y: 0, w: 3, h: 2 },
      { i: 'widget', x: 0, y: 3, w: 2, h: 2 },
    ];
    const report = analyzeShadowLayouts({
      ...input,
      legacyLayouts: { ...input.legacyLayouts, xl: outOfBounds },
      runtimeLayouts: { ...input.runtimeLayouts, xl: outOfBounds },
    });
    const section = report.breakpoints.xl.differences.find((difference) => difference.originalId === 'section');

    expect(section?.categories).toEqual(expect.arrayContaining(['OUT_OF_BOUNDS', 'EXPECTED_ALGORITHM_DIFFERENCE']));
    expect(section?.displayed).toMatchObject({ x: 11, w: 3 });
    expect(section?.normalized).toMatchObject({ x: 9, w: 3 });
  });

  it('analyzes displayed runtime geometry while retaining structural geometry as a reference', () => {
    const input = createInput();
    const runtime = [
      { i: 'section', x: 4, y: 0, w: 2, h: 1 },
      { i: 'widget', x: 6, y: 0, w: 2, h: 2 },
    ];
    const report = analyzeShadowLayouts({
      ...input,
      runtimeLayouts: { ...input.runtimeLayouts, xl: runtime },
    });
    const section = report.breakpoints.xl.differences.find((difference) => difference.originalId === 'section');

    expect(report.breakpoints.xl.analyzedSource).toBe('runtime-displayed');
    expect(section?.displayed).toMatchObject({ x: 4, y: 0, w: 2, h: 1 });
    expect(section?.structural).toMatchObject({ x: 0, y: 0, w: 2, h: 1 });
    expect(section?.normalized).toMatchObject({ x: 4, y: 0, w: 2, h: 1 });
    expect(section?.categories).toContain('RUNTIME_GEOMETRY_DIFFERENCE');
    expect(section?.categories).toContain('EXACT_MATCH');
    expect(section?.categories).not.toContain('POSITION_DIFFERENCE');
    expect(section?.categories).not.toContain('EXPECTED_ALGORITHM_DIFFERENCE');
    expect(report.limitations.some((limitation) => limitation.includes('Home Assistant cause'))).toBe(true);
  });

  it('reports missing and unsupported elements instead of inventing geometry', () => {
    const input = createInput();
    const incomplete = [
      { i: 'section', x: 0, y: 0, w: 2, h: 1 },
      { i: 'unknown', x: 0, y: 3, w: 1, h: 1 },
    ];
    const report = analyzeShadowLayouts({
      ...input,
      runtimeLayouts: { ...input.runtimeLayouts, xl: incomplete },
    });

    expect(report.breakpoints.xl.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['MISSING_LAYOUT_ITEM', 'UNSUPPORTED_LAYOUT_ITEM']),
    );
    expect(report.breakpoints.xl.categories).toMatchObject({ MISSING_ITEM: 1, UNSUPPORTED_ITEM: 1 });
  });

  it('marks unexplained normalization changes as undetermined', () => {
    const input = createInput();
    const fractional = [
      { i: 'section', x: 0.4, y: 0, w: 2, h: 1 },
      { i: 'widget', x: 3, y: 0, w: 2, h: 2 },
    ];
    const report = analyzeShadowLayouts({
      ...input,
      legacyLayouts: { ...input.legacyLayouts, xl: fractional },
      runtimeLayouts: { ...input.runtimeLayouts, xl: fractional },
    });

    expect(report.breakpoints.xl.differences.find((difference) => difference.originalId === 'section')?.categories).toEqual(
      expect.arrayContaining(['INVALID_GEOMETRY', 'UNDETERMINED_DIFFERENCE']),
    );
  });

  it('keeps Stack analysis explicit about unavailable internal column data', () => {
    const input = createInput();
    const report = analyzeShadowLayouts({
      ...input,
      sections: [
        ...input.sections,
        { id: 'stack', kind: 'stack-horizontal', layout: { i: 'stack', x: 0, y: 3, w: 4, h: 2 } },
      ],
      widgets: [
        ...input.widgets,
        {
          id: 'child',
          kind: 'sensor',
          parentSectionId: 'stack',
          layout: { i: 'child', x: 0, y: 0, w: 3, h: 1 },
        },
      ],
      legacyLayouts: Object.fromEntries(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [
        breakpoint,
        [...(input.legacyLayouts[breakpoint] ?? []), { i: 'stack', x: 0, y: 3, w: 4, h: 2 }],
      ])),
    });

    expect(report.stacks[0].breakpoints.xl).toMatchObject({
      comparisonStatus: 'insufficient-data',
      source: 'structural-fallback',
      losslessGeometryCount: 1,
    });
    expect(report.stacks[0].breakpoints.xl.categories.INSUFFICIENT_DATA).toBeGreaterThan(0);
  });

  it('is deterministic and does not mutate its input arrays', () => {
    const input = createInput();
    const before = structuredClone(input);
    const first = analyzeShadowLayouts(input);
    const second = analyzeShadowLayouts(input);

    expect(second).toEqual(first);
    expect(input).toEqual(before);
  });

  it('counts a 22-element Home with no Stacks exactly as analyzed', () => {
    const widgets = Array.from({ length: 22 }, (_, index) => ({
      id: `widget-${index}`,
      kind: 'light' as const,
      layout: { i: `widget-${index}`, x: 0, y: index, w: 1, h: 1 },
    }));
    const root = widgets.map((widget) => ({ ...widget.layout }));
    const rootLayouts = layouts(root);
    const report = analyzeShadowLayouts({
      sections: [],
      widgets,
      explicitResponsiveLayouts: {},
      legacyLayouts: rootLayouts,
      runtimeLayouts: structuredClone(rootLayouts),
    });

    expect(report.summary).toMatchObject({
      rootElementCount: 22,
      stackContainerCount: 0,
      stackChildCount: 0,
      issueCount: 0,
    });
    expect(report.stacks).toHaveLength(0);
    expect(Object.values(report.breakpoints).every((breakpoint) => breakpoint.itemCount === 22)).toBe(true);
  });
});
