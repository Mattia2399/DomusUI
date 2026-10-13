import { describe, expect, it } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import {
  adaptHomeLayoutsForShadow,
  createShadowInputSignature,
  shadowSectionId,
  shadowWidgetId,
  type ShadowLayoutAdapterInput,
} from './shadowLayoutAdapter';

function rootLayout() {
  return [
    { i: 'section-greeting', x: 0, y: 0, w: 1, h: 1 },
    { i: 'stack-one', x: 0, y: 1, w: 1, h: 1 },
    { i: 'widget-root', x: 0, y: 2, w: 1, h: 1 },
  ];
}

function breakpointLayouts() {
  return Object.fromEntries(
    DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [breakpoint, rootLayout()]),
  ) as ShadowLayoutAdapterInput['legacyLayouts'];
}

function createInput(): ShadowLayoutAdapterInput {
  return {
    sections: [
      {
        id: 'section-greeting',
        kind: 'greeting',
        layout: { i: 'section-greeting', x: 0, y: 0, w: 7, h: 1 },
      },
      {
        id: 'stack-one',
        kind: 'stack-grid',
        layout: { i: 'stack-one', x: 0, y: 1, w: 9, h: 5 },
      },
    ],
    widgets: [
      {
        id: 'widget-root',
        kind: 'light',
        layout: { i: 'widget-root', x: 9, y: 0, w: 3, h: 2 },
      },
      {
        id: 'widget-child',
        kind: 'sensor',
        parentSectionId: 'stack-one',
        layout: { i: 'widget-child', x: 0, y: 0, w: 5, h: 3 },
      },
    ],
    explicitResponsiveLayouts: {
      root: { xl: rootLayout() },
      stacks: {
        'stack-one': {
          xs: [{ i: 'widget-child', x: 0, y: 0, w: 2, h: 3 }],
        },
      },
    },
    legacyLayouts: breakpointLayouts(),
    runtimeLayouts: breakpointLayouts(),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

describe('Grid Engine 2.0 Shadow layout adapter', () => {
  it('converts normal root sections and preserves special section kinds', () => {
    const base = createInput();
    const input: ShadowLayoutAdapterInput = {
      ...base,
      sections: [
        ...base.sections,
        { id: 'weather', kind: 'weather', layout: { i: 'weather', x: 1, y: 0, w: 1, h: 1 } },
        { id: 'scenes', kind: 'scenes', layout: { i: 'scenes', x: 2, y: 0, w: 1, h: 1 } },
      ],
    };
    const snapshot = adaptHomeLayoutsForShadow(input);

    expect(snapshot.rootElements.filter((item) => item.role === 'section').map((item) => item.sectionKind)).toEqual([
      'greeting',
      'scenes',
      'weather',
    ]);
  });

  it('converts root widgets without treating Stack children as root elements', () => {
    const snapshot = adaptHomeLayoutsForShadow(createInput());

    expect(snapshot.rootElements.some((item) => item.diagnosticId === shadowWidgetId('widget-root'))).toBe(true);
    expect(snapshot.rootElements.some((item) => item.originalId === 'widget-child')).toBe(false);
  });

  it('recognizes all Stack kinds as root containers', () => {
    const sections = ['stack-vertical', 'stack-horizontal', 'stack-grid'].map((kind, index) => ({
      id: `stack-${index}`,
      kind: kind as 'stack-vertical' | 'stack-horizontal' | 'stack-grid',
      layout: { i: `stack-${index}`, x: index, y: 0, w: 1, h: 1 },
    }));
    const input: ShadowLayoutAdapterInput = {
      ...createInput(),
      sections,
      widgets: [],
      legacyLayouts: Object.fromEntries(
      DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [
        breakpoint,
        sections.map((section, index) => ({ i: section.id, x: index, y: 0, w: 1, h: 1 })),
      ]),
      ),
    };
    const snapshot = adaptHomeLayoutsForShadow(input);

    expect(snapshot.rootElements.every((item) => item.role === 'stack-container')).toBe(true);
    expect(snapshot.stacks.map((stack) => stack.kind)).toEqual(['stack-vertical', 'stack-horizontal', 'stack-grid']);
  });

  it('identifies Stack children and records explicit versus structural fallback layouts', () => {
    const snapshot = adaptHomeLayoutsForShadow(createInput());
    const stack = snapshot.stacks[0];

    expect(snapshot.stackChildren[0]).toMatchObject({
      diagnosticId: shadowWidgetId('widget-child', 'stack-one'),
      parentSectionId: 'stack-one',
      role: 'stack-widget',
    });
    expect(stack.breakpoints.xs).toMatchObject({ source: 'explicit', hasExplicitLayout: true });
    expect(stack.breakpoints.sm).toMatchObject({ source: 'structural-fallback', hasExplicitLayout: false });
  });

  it('uses stable namespace-safe IDs and reports original ID collisions', () => {
    const base = createInput();
    const input: ShadowLayoutAdapterInput = {
      ...base,
      widgets: [
        ...base.widgets,
        { id: 'section-greeting', kind: 'switch', layout: { i: 'section-greeting', x: 0, y: 3, w: 1, h: 1 } },
      ],
    };
    const snapshot = adaptHomeLayoutsForShadow(input);

    expect(shadowSectionId('same')).not.toBe(shadowWidgetId('same'));
    expect(snapshot.issues.some((issue) => issue.code === 'DUPLICATE_ORIGINAL_ID')).toBe(true);
  });

  it('reports duplicate layout entries without choosing one silently', () => {
    const base = createInput();
    const input: ShadowLayoutAdapterInput = {
      ...base,
      legacyLayouts: {
        ...base.legacyLayouts,
        xl: [...rootLayout(), { ...rootLayout()[0] }],
      },
    };
    const snapshot = adaptHomeLayoutsForShadow(input);

    expect(snapshot.breakpoints.xl.issues.some((issue) => issue.code === 'DUPLICATE_LAYOUT_ID')).toBe(true);
    expect(snapshot.breakpoints.xl.items.some((item) => item.originalId === 'section-greeting')).toBe(false);
  });

  it('reports invalid and out-of-bounds geometry without clamping the source', () => {
    const base = createInput();
    const input: ShadowLayoutAdapterInput = {
      ...base,
      legacyLayouts: {
        ...base.legacyLayouts,
        xl: [
          { i: 'section-greeting', x: 11, y: 0, w: 2, h: 1 },
          { i: 'stack-one', x: 0, y: 1, w: 0, h: 1 },
          { i: 'widget-root', x: 0.5, y: 2, w: 1, h: 1 },
        ],
      },
    };
    const snapshot = adaptHomeLayoutsForShadow(input);
    const greeting = snapshot.breakpoints.xl.items.find((item) => item.originalId === 'section-greeting');

    expect(greeting?.geometry).toMatchObject({ x: 11, w: 2 });
    expect(snapshot.breakpoints.xl.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['OUT_OF_BOUNDS', 'INVALID_GEOMETRY']),
    );
  });

  it('distinguishes explicitly saved root layouts from legacy fallback layouts', () => {
    const snapshot = adaptHomeLayoutsForShadow(createInput());

    expect(snapshot.breakpoints.xl).toMatchObject({
      source: 'explicit-with-fallback',
      hasExplicitLayout: true,
      explicitItemCount: 3,
      derivedItemCount: 0,
    });
    expect(snapshot.breakpoints.xs).toMatchObject({
      source: 'legacy-derived',
      hasExplicitLayout: false,
      explicitItemCount: 0,
      derivedItemCount: 3,
    });
    expect(snapshot.breakpoints.xs.issues.some((issue) => issue.code === 'MISSING_LAYOUT_ITEM')).toBe(false);
  });

  it('counts explicit items separately from items supplied by the legacy fallback', () => {
    const base = createInput();
    const snapshot = adaptHomeLayoutsForShadow({
      ...base,
      explicitResponsiveLayouts: {
        ...base.explicitResponsiveLayouts,
        root: { xl: [rootLayout()[0]] },
      },
    });

    expect(snapshot.breakpoints.xl).toMatchObject({
      explicitItemCount: 1,
      derivedItemCount: 2,
    });
  });

  it('preserves custom legacy dimensions byte-for-byte', () => {
    const base = createInput();
    const input: ShadowLayoutAdapterInput = {
      ...base,
      legacyLayouts: {
        ...base.legacyLayouts,
        xl: rootLayout().map((item) => (item.i === 'widget-root' ? { ...item, w: 7, h: 11 } : item)),
      },
    };
    const snapshot = adaptHomeLayoutsForShadow(input);

    expect(snapshot.breakpoints.xl.items.find((item) => item.originalId === 'widget-root')?.geometry).toMatchObject({
      w: 7,
      h: 11,
    });
  });

  it('reports unsupported layout items and orphaned Stack children', () => {
    const base = createInput();
    const input: ShadowLayoutAdapterInput = {
      ...base,
      legacyLayouts: {
        ...base.legacyLayouts,
        xl: [...rootLayout(), { i: 'unknown', x: 0, y: 4, w: 1, h: 1 }],
      },
      widgets: [
        ...base.widgets,
        {
          id: 'orphan',
          kind: 'light',
          parentSectionId: 'missing-stack',
          layout: { i: 'orphan', x: 0, y: 0, w: 1, h: 1 },
        },
      ],
    };
    const snapshot = adaptHomeLayoutsForShadow(input);

    expect(snapshot.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['UNSUPPORTED_LAYOUT_ITEM', 'ORPHAN_STACK_WIDGET']),
    );
  });

  it('keeps inputs immutable and produces deterministic output and signatures', () => {
    const input = createInput();
    const expected = structuredClone(input);
    deepFreeze(input);

    const first = adaptHomeLayoutsForShadow(input);
    const second = adaptHomeLayoutsForShadow(input);
    expect(first).toEqual(second);
    expect(input).toEqual(expected);
    expect(createShadowInputSignature(input)).toBe(createShadowInputSignature(input));
  });
});
