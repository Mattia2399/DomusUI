import { describe, expect, it } from 'vitest';
import type { Widget } from '../types/dashboardModels';
import {
  DEMO_INITIAL_WIDGETS,
  getEntityOptionsForRuntime,
  getInitialDashboardFixtures,
  normalizeWidgetsForRuntime,
} from './dashboardDemoFixtures';

describe('dashboard Demo fixture isolation', () => {
  it('starts a real dashboard without Demo sections, cards or catalog entities', () => {
    expect(getInitialDashboardFixtures('real')).toEqual({ sections: [], widgets: [], responsiveLayouts: {} });
    expect(Object.values(getEntityOptionsForRuntime('real')).every((options) => options.length === 0)).toBe(true);
  });

  it('keeps the complete sample dashboard available only in Demo mode', () => {
    const fixtures = getInitialDashboardFixtures('demo');

    expect(fixtures.sections.length).toBeGreaterThan(0);
    expect(fixtures.widgets.length).toBe(DEMO_INITIAL_WIDGETS.length);
    expect(fixtures.widgets.every((widget) => widget.dataSource === 'mock')).toBe(true);
    expect(Object.keys(fixtures.responsiveLayouts.root ?? {})).toHaveLength(6);
    expect(Object.values(getEntityOptionsForRuntime('demo')).some((options) => options.length > 0)).toBe(true);
  });

  it('turns legacy mock cards into HA cards when a real layout is loaded', () => {
    const legacyWidget: Widget = {
      ...DEMO_INITIAL_WIDGETS[0],
      dataSource: 'mock',
    };

    expect(normalizeWidgetsForRuntime([legacyWidget], 'real')[0]?.dataSource).toBe('ha');
    expect(normalizeWidgetsForRuntime([legacyWidget], 'demo')[0]?.dataSource).toBe('mock');
  });
});
