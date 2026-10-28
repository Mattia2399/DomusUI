import { describe, expect, it } from 'vitest';
import { GRID_ENGINE_2_LAYOUT_ENGINE, type DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import { GRID_ENGINE_COLS } from '../DashboardGrid';
import { createGridEngine2HomeConfiguration, GridEngine2CutoverError } from './homeGridEngine2Cutover';

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
