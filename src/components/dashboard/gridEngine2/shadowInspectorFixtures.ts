import { GRID_ENGINE_COLS } from '../DashboardGrid';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import {
  adaptHomeLayoutsForShadow,
  createShadowInputSignature,
  type ShadowLayoutAdapterInput,
} from './shadowLayoutAdapter';
import { analyzeAdaptedShadowLayouts } from './shadowLayoutDiagnostics';
import { createShadowInspectorSnapshot, type ShadowInspectorSnapshot } from './shadowInspectorSnapshot';

export type ShadowInspectorFixtureId = 'identical' | 'collision' | 'stacks' | 'density-30';

export type ShadowInspectorFixture = {
  readonly id: ShadowInspectorFixtureId;
  readonly label: string;
  readonly description: string;
  readonly input: ShadowLayoutAdapterInput;
};

function responsiveItems(ids: readonly string[], collision = false) {
  return Object.fromEntries(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
    const cols = GRID_ENGINE_COLS[breakpoint];
    return [breakpoint, ids.map((id, index) => {
      if (collision && index < 2) {
        return { i: id, x: 0, y: 0, w: Math.min(2, cols), h: index === 0 ? 2 : 1 };
      }
      const x = index % cols;
      const y = collision ? Math.floor(index / cols) + 3 : Math.floor(index / cols);
      return { i: id, x, y, w: 1, h: 1 };
    })];
  })) as ShadowLayoutAdapterInput['legacyLayouts'];
}

function rootWidgetInput(ids: readonly string[], collision = false): ShadowLayoutAdapterInput {
  const layouts = responsiveItems(ids, collision);
  return {
    sections: [],
    widgets: ids.map((id, index) => ({
      id,
      kind: index % 2 === 0 ? 'light' : 'sensor',
      layout: { ...layouts.xl![index] },
    })),
    explicitResponsiveLayouts: collision ? { root: { xl: layouts.xl } } : {},
    legacyLayouts: layouts,
    runtimeLayouts: structuredClone(layouts),
  };
}

function stackFixtureInput(): ShadowLayoutAdapterInput {
  const sections = [
    { id: 'stack-vertical', kind: 'stack-vertical' as const, layout: { i: 'stack-vertical', x: 0, y: 0, w: 4, h: 2 } },
    { id: 'stack-horizontal', kind: 'stack-horizontal' as const, layout: { i: 'stack-horizontal', x: 4, y: 0, w: 4, h: 2 } },
    { id: 'stack-grid', kind: 'stack-grid' as const, layout: { i: 'stack-grid', x: 8, y: 0, w: 4, h: 2 } },
  ];
  const widgets = sections.flatMap((section, sectionIndex) => Array.from({ length: 2 }, (_, childIndex) => ({
    id: `${section.id}-child-${childIndex + 1}`,
    kind: (childIndex === 0 ? 'light' : 'sensor') as 'light' | 'sensor',
    parentSectionId: section.id,
    layout: { i: `${section.id}-child-${childIndex + 1}`, x: childIndex, y: 0, w: 1, h: 1 },
  })));
  const layouts = Object.fromEntries(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
    const cols = GRID_ENGINE_COLS[breakpoint];
    return [breakpoint, sections.map((section, index) => ({
      i: section.id,
      x: 0,
      y: index * 2,
      w: Math.min(cols, 2),
      h: 2,
    }))];
  })) as ShadowLayoutAdapterInput['legacyLayouts'];
  return {
    sections,
    widgets,
    explicitResponsiveLayouts: {
      stacks: {
        'stack-grid': {
          xs: widgets
            .filter((widget) => widget.parentSectionId === 'stack-grid')
            .map((widget, index) => ({ i: widget.id, x: index, y: 0, w: 1, h: 1 })),
        },
      },
    },
    legacyLayouts: layouts,
    runtimeLayouts: structuredClone(layouts),
  };
}

const DENSITY_IDS = Array.from({ length: 30 }, (_, index) => `density-${String(index + 1).padStart(2, '0')}`);

export const SHADOW_INSPECTOR_FIXTURES: readonly ShadowInspectorFixture[] = [
  {
    id: 'identical',
    label: 'Geometrie identiche',
    description: 'Sei elementi validi senza differenze fra layout osservato e NORMALIZE.',
    input: rootWidgetInput(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']),
  },
  {
    id: 'collision',
    label: 'Collisione controllata',
    description: 'Due elementi sovrapposti mostrano differenze previste e risoluzione deterministica.',
    input: rootWidgetInput(['collision-a', 'collision-b', 'observer-c', 'observer-d'], true),
  },
  {
    id: 'stacks',
    label: 'Stack sintetici',
    description: 'Stack verticale, orizzontale e a griglia con colonne interne volutamente non dedotte.',
    input: stackFixtureInput(),
  },
  {
    id: 'density-30',
    label: 'Densità 30 elementi',
    description: 'Trenta root per misurare conversione, confronto e rendering del visualizzatore.',
    input: rootWidgetInput(DENSITY_IDS),
  },
] as const;

export function getShadowInspectorFixture(id: ShadowInspectorFixtureId) {
  return SHADOW_INSPECTOR_FIXTURES.find((fixture) => fixture.id === id) ?? SHADOW_INSPECTOR_FIXTURES[0];
}

function defaultNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function createShadowInspectorFixtureSnapshot(
  id: ShadowInspectorFixtureId,
  now: () => number = defaultNow,
): ShadowInspectorSnapshot {
  const fixture = getShadowInspectorFixture(id);
  const signature = createShadowInputSignature(fixture.input);
  const conversionStartedAt = now();
  const adapted = adaptHomeLayoutsForShadow(fixture.input);
  const conversionMs = Math.max(0, now() - conversionStartedAt);
  const comparisonStartedAt = now();
  const report = analyzeAdaptedShadowLayouts(adapted, signature);
  const comparisonMs = Math.max(0, now() - comparisonStartedAt);
  return createShadowInspectorSnapshot({
    report,
    sequence: 1,
    observedBreakpoint: null,
    source: { kind: 'fixture', fixtureId: fixture.id, label: fixture.label },
    timings: {
      analysisMs: conversionMs + comparisonMs,
      conversionMs,
      comparisonMs,
    },
  });
}
