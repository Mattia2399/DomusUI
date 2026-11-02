import { describe, expect, it } from 'vitest';
import type { DashboardLayoutConfiguration } from './dashboardConfigurationRepository';
import {
  createDashboardStructuralFingerprint,
  projectDashboardForPersistence,
} from './dashboardPersistenceProjection';

function buildDashboard(): DashboardLayoutConfiguration {
  return {
    storageVersion: 14,
    sections: [],
    widgets: [{
      id: 'light',
      kind: 'light',
      title: 'Luce',
      entityId: 'light.luce',
      dataSource: 'ha',
      status: 'Accesa',
      isOn: true,
      value: 67,
      unit: '%',
      layout: { i: 'light', x: 0, y: 0, w: 2, h: 2 },
    }],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
  };
}

describe('dashboard persistence projection', () => {
  it('removes HA runtime values and stores the stable collapsed light height', () => {
    const projected = projectDashboardForPersistence(buildDashboard());
    const widget = projected.widgets[0] as unknown as Record<string, unknown>;

    expect(widget.status).toBeUndefined();
    expect(widget.isOn).toBeUndefined();
    expect(widget.value).toBeUndefined();
    expect(widget.unit).toBeUndefined();
    expect((widget.layout as { h: number }).h).toBe(1);
  });

  it('ignores live state and automatic light expansion in structural comparisons', () => {
    const first = buildDashboard();
    const second: DashboardLayoutConfiguration = {
      ...first,
      widgets: [{
        ...first.widgets[0],
        status: 'Spenta',
        isOn: false,
        value: 0,
        layout: { ...first.widgets[0].layout, h: 1 },
      }],
    };

    expect(createDashboardStructuralFingerprint(first))
      .toBe(createDashboardStructuralFingerprint(second));
  });

  it('ignores object key order while preserving structural meaning', () => {
    const first = buildDashboard();
    const reordered = {
      responsiveLayouts: first.responsiveLayouts,
      widgetLayoutOverrides: first.widgetLayoutOverrides,
      widgetTypeLayoutOverrides: first.widgetTypeLayoutOverrides,
      widgets: first.widgets.map((widget) => ({
        layout: widget.layout,
        unit: widget.unit,
        value: widget.value,
        isOn: widget.isOn,
        status: widget.status,
        dataSource: widget.dataSource,
        entityId: widget.entityId,
        title: widget.title,
        kind: widget.kind,
        id: widget.id,
      })),
      sections: first.sections,
      storageVersion: first.storageVersion,
    } as DashboardLayoutConfiguration;

    expect(createDashboardStructuralFingerprint(reordered))
      .toBe(createDashboardStructuralFingerprint(first));
  });

  it('keeps explicit mock fixture values available to the demo', () => {
    const dashboard = buildDashboard();
    dashboard.widgets[0] = { ...dashboard.widgets[0], dataSource: 'mock' };

    expect(projectDashboardForPersistence(dashboard).widgets[0]).toMatchObject({
      status: 'Accesa',
      isOn: true,
      value: 67,
    });
  });

  it('includes the metrics version in structural fingerprints', () => {
    const legacy = buildDashboard();
    const v2: DashboardLayoutConfiguration = {
      ...legacy,
      gridMetricsVersion: 'v2',
      widgetLayoutOverrides: {
        light: { xl: { w: 2, hOff: 2, hOn: 3, autoExpand: true } },
      },
    };

    expect(createDashboardStructuralFingerprint(v2))
      .not.toBe(createDashboardStructuralFingerprint(legacy));
    expect(projectDashboardForPersistence(v2).gridMetricsVersion).toBe('v2');
  });
});
