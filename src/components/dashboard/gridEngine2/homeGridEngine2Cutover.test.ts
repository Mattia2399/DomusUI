import { describe, expect, it } from 'vitest';
import { GRID_ENGINE_2_LAYOUT_ENGINE, type DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import { GRID_ENGINE_COLS } from '../DashboardGrid';
import {
  createGridV2NewWidgetOverrides,
  GridEngine2CutoverError,
} from './homeGridEngine2Cutover';
import { createGridEngine2HomeConfiguration } from './gridEngine2Activation';
import { createGridV2DashboardConfiguration, resolveGridV2ConversionFormat } from './gridV2Conversion';

function dashboard(): DashboardLayoutConfiguration {
  return {
    storageVersion: 14,
    sections: [
      {
        id: 'greeting',
        kind: 'greeting',
        title: 'Casa',
        layout: { i: 'greeting', x: 9, y: 40, w: 3, h: 7 },
      },
      {
        id: 'stack-living',
        kind: 'stack-grid',
        title: 'Living',
        stackColumns: 4,
        stackColumnsMode: 'manual',
        layout: { i: 'stack-living', x: 5, y: 2, w: 7, h: 20 },
      },
    ],
    widgets: [
      {
        id: 'light.root',
        kind: 'light',
        title: 'Ingresso',
        entityId: 'light.ingresso',
        status: 'off',
        isOn: false,
        layout: { i: 'light.root', x: 8, y: 1, w: 4, h: 9 },
      },
      {
        id: 'alarm.custom_45',
        kind: 'alarm',
        title: 'Allarme',
        entityId: 'alarm_control_panel.casa',
        status: 'armed_home',
        isOn: true,
        layout: { i: 'alarm.custom_45', x: 0, y: 99, w: 11, h: 12 },
      },
      {
        id: 'stack.light',
        kind: 'light',
        title: 'Pianta',
        entityId: 'light.pianta',
        status: 'on',
        isOn: true,
        parentSectionId: 'stack-living',
        layout: { i: 'stack.light', x: 3, y: 8, w: 5, h: 7 },
      },
      {
        id: 'stack.sensor',
        kind: 'sensor',
        title: 'Temperatura',
        entityId: 'sensor.temperatura',
        status: '21',
        isOn: false,
        parentSectionId: 'stack-living',
        layout: { i: 'stack.sensor', x: 7, y: 15, w: 3, h: 5 },
      },
    ],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {
      'alarm.custom_45': { xl: { w: 4, h: 3 } },
    },
    responsiveLayouts: {
      root: {
        xl: [{ i: 'greeting', x: 9, y: 40, w: 3, h: 7 }],
      },
      stacks: {
        'stack-living': {
          xl: [{ i: 'stack.light', x: 3, y: 8, w: 5, h: 7 }],
        },
      },
    },
  };
}

/** The fixture without its Stack: the v2 conversion leaves Stack Homes alone. */
function dashboardWithoutStacks(): DashboardLayoutConfiguration {
  const source = dashboard();
  return {
    ...source,
    sections: source.sections.filter((section) => !section.kind.startsWith('stack-')),
    widgets: source.widgets.filter((widget) => !widget.parentSectionId),
    responsiveLayouts: { root: source.responsiveLayouts.root },
  };
}

function expectValidLayout(layout: readonly { i: string; x: number; y: number; w: number; h: number }[], cols: number) {
  expect(new Set(layout.map((item) => item.i)).size).toBe(layout.length);
  layout.forEach((item, index) => {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.y).toBeGreaterThanOrEqual(0);
    expect(item.w).toBeGreaterThan(0);
    expect(item.h).toBeGreaterThan(0);
    expect(item.x + item.w).toBeLessThanOrEqual(cols);
    for (const previous of layout.slice(0, index)) {
      const overlaps = item.x < previous.x + previous.w && item.x + item.w > previous.x
        && item.y < previous.y + previous.h && item.y + item.h > previous.y;
      expect(overlaps).toBe(false);
    }
  });
}

describe('Grid Engine 2.0 Home cutover', () => {
  it('preserves the complete inventory and non-geometric configuration', () => {
    const source = dashboard();
    const result = createGridEngine2HomeConfiguration(source);

    expect(result.layoutEngine).toBe(GRID_ENGINE_2_LAYOUT_ENGINE);
    expect(result.sections.map(({ layout: _layout, ...section }) => section))
      .toEqual(source.sections.map(({ layout: _layout, ...section }) => section));
    expect(result.widgets.map(({ layout: _layout, ...widget }) => widget))
      .toEqual(source.widgets.map(({ layout: _layout, ...widget }) => widget));
    expect(result.widgetLayoutOverrides).toEqual(source.widgetLayoutOverrides);
    expect(result.widgetTypeLayoutOverrides).toEqual(source.widgetTypeLayoutOverrides);
  });

  it('creates complete collision-free root and Stack layouts for all six breakpoints', () => {
    const result = createGridEngine2HomeConfiguration(dashboard());
    const rootIds = ['greeting', 'stack-living', 'light.root', 'alarm.custom_45'];
    const childIds = ['stack.light', 'stack.sensor'];

    for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
      const root = result.responsiveLayouts.root?.[breakpoint] ?? [];
      expect(root.map((item) => item.i)).toEqual(rootIds);
      expectValidLayout(root, GRID_ENGINE_COLS[breakpoint]);

      const stack = result.responsiveLayouts.stacks?.['stack-living']?.[breakpoint] ?? [];
      expect(stack.map((item) => item.i)).toEqual(childIds);
      expectValidLayout(stack, Math.min(GRID_ENGINE_COLS[breakpoint], 4));
    }

    expect(result.responsiveLayouts.root?.xl?.find((item) => item.i === 'alarm.custom_45'))
      .toMatchObject({ w: 4, h: 3 });
  });

  it('is deterministic and does not derive the result from legacy coordinates', () => {
    const first = dashboard();
    const second = dashboard();
    second.sections = second.sections.map((section, index) => ({
      ...section,
      layout: { i: section.id, x: index, y: 800 + index, w: 1, h: 1 },
    }));
    second.widgets = second.widgets.map((widget, index) => ({
      ...widget,
      layout: { i: widget.id, x: index, y: 900 + index, w: 1, h: 1 },
    }));
    second.responsiveLayouts = {};

    expect(createGridEngine2HomeConfiguration(second).responsiveLayouts)
      .toEqual(createGridEngine2HomeConfiguration(first).responsiveLayouts);
  });

  it('fails closed when an ID is duplicated or a Stack child is orphaned', () => {
    const duplicate = dashboard();
    duplicate.widgets[0] = { ...duplicate.widgets[0], id: 'greeting' };
    expect(() => createGridEngine2HomeConfiguration(duplicate)).toThrow(GridEngine2CutoverError);

    const orphan = dashboard();
    orphan.widgets[2] = { ...orphan.widgets[2], parentSectionId: 'missing-stack' };
    expect(() => createGridEngine2HomeConfiguration(orphan)).toThrow(GridEngine2CutoverError);
  });
});

describe('Grid Engine 2.0 metrics v2 conversion', () => {
  it('maps representative legacy cards to the specified safe v2 formats', () => {
    const base = dashboard().widgets[0];
    const format = (kind: typeof base.kind, w: number, h: number) => resolveGridV2ConversionFormat({
      widget: { ...base, kind },
      breakpoint: 'xl',
      legacyWidth: w,
      legacyHeight: h,
    });

    expect(format('light', 2, 1)).toBe('U×2');
    expect(format('climate', 3, 3)).toBe('W×4');
    expect(format('sensor', 2, 3)).toBe('U×4');
    expect(format('lock', 2, 3)).toBe('U×4');
    expect(format('media', 2, 3)).toBe('W×4');
    expect(format('camera', 4, 3)).toBe('W×4');
    expect(format('switch', 2, 1)).toBe('U×2');
  });

  it('converts the draft deterministically without losing inventory or configuration', () => {
    const withoutStacks = dashboardWithoutStacks();
    const source: DashboardLayoutConfiguration = {
      ...withoutStacks,
      layoutEngine: GRID_ENGINE_2_LAYOUT_ENGINE,
      widgets: [
        ...withoutStacks.widgets,
        {
          id: 'media.root',
          kind: 'media',
          title: 'Musica',
          entityId: 'media_player.living',
          status: 'idle',
          isOn: false,
          layout: { i: 'media.root', x: 2, y: 4, w: 2, h: 3 },
        },
      ],
    };
    const first = createGridV2DashboardConfiguration(source, (widget) =>
      widget.kind === 'light' ? 'light-dimmer' : 'default');
    const second = createGridV2DashboardConfiguration(source, (widget) =>
      widget.kind === 'light' ? 'light-dimmer' : 'default');

    expect(first.gridMetricsVersion).toBe('v2');
    expect(first.responsiveLayouts).toEqual(second.responsiveLayouts);
    expect(first.widgets.map((widget) => [widget.id, widget.entityId, widget.parentSectionId]))
      .toEqual(source.widgets.map((widget) => [widget.id, widget.entityId, widget.parentSectionId]));
    expect(first.sections.map(({ layout: _layout, ...section }) => section))
      .toEqual(source.sections.map(({ layout: _layout, ...section }) => section));
    expect(first.widgets.map(({ layout: _layout, ...widget }) => widget))
      .toEqual(source.widgets.map(({ layout: _layout, ...widget }) => widget));

    for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
      expectValidLayout(first.responsiveLayouts.root?.[breakpoint] ?? [], GRID_ENGINE_COLS[breakpoint]);
      expect(first.responsiveLayouts.root?.[breakpoint]?.map((item) => item.i))
        .toEqual(expect.arrayContaining(source.sections.map((section) => section.id)
          .concat(source.widgets.filter((widget) => !widget.parentSectionId).map((widget) => widget.id))));
    }
    expect(first.responsiveLayouts.root?.xl?.find((item) => item.i === 'media.root'))
      .toMatchObject({ w: 4, h: 4 });
    expect(first.widgetLayoutOverrides['light.root']?.xl)
      .toMatchObject({ hOff: 2, hOn: 3, autoExpand: true });
  });

  it('fails closed when v2 is requested before the Grid Engine 2.0 cutover', () => {
    expect(() => createGridV2DashboardConfiguration(dashboard())).toThrow(GridEngine2CutoverError);
  });

  it('converts the nearest width class and promotes only when the target height requires it', () => {
    const base = dashboard().widgets[0];
    const format = (kind: typeof base.kind, legacyWidth: number, legacyHeight: number) =>
      resolveGridV2ConversionFormat({ widget: { ...base, kind }, breakpoint: 'xl', legacyWidth, legacyHeight });
    expect(format('light', 4, 1)).toBe('W×2');
    expect(format('switch', 4, 1)).toBe('W×2');
    expect(format('sensor', 2, 4)).toBe('U×4');
    expect(format('climate', 3, 4)).toBe('W×6');
  });

  it('refuses a Home with saved Stacks instead of rewriting them (Stacks are suspended)', () => {
    const source = { ...dashboard(), layoutEngine: GRID_ENGINE_2_LAYOUT_ENGINE };
    const before = structuredClone(source);
    expect(() => createGridV2DashboardConfiguration(source)).toThrow(GridEngine2CutoverError);
    expect(source).toEqual(before);
  });

  it('gives a card added to a v2 Home its default format in every breakpoint', () => {
    const climate = { ...dashboard().widgets[0], kind: 'climate' as const };
    const overrides = createGridV2NewWidgetOverrides({ widget: climate });
    expect(overrides.xl).toEqual({ w: 4, h: 4 });
    expect(overrides.sm).toEqual({ w: 2, h: 4 });
    const light = createGridV2NewWidgetOverrides({ widget: dashboard().widgets[0], entityCapability: 'light-dimmer' });
    expect(light.xl).toEqual({ w: 2, hOff: 2, hOn: 3, autoExpand: true });
    const onOff = createGridV2NewWidgetOverrides({ widget: dashboard().widgets[0], entityCapability: 'light-on-off' });
    expect(onOff.xl).toMatchObject({ hOff: 2, hOn: 2, autoExpand: false });
  });
});
