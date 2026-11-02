import { describe, expect, it } from 'vitest';
import type { DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import { createGridV2DashboardConfiguration } from './gridV2Conversion';

function legacyDashboard(): DashboardLayoutConfiguration {
  return {
    storageVersion: 14,
    layoutEngine: 'grid-engine-2',
    sections: [{
      id: 'section-greeting-1',
      kind: 'greeting',
      title: 'Greeting',
      showWeather: true,
      layout: { i: 'section-greeting-1', x: 0, y: 0, w: 12, h: 2 },
    }],
    widgets: [{
      id: 'root.sensor',
      kind: 'sensor',
      title: 'Sensor',
      entityId: 'sensor.test',
      dataSource: 'mock',
      isOn: false,
      status: '20',
      layout: { i: 'root.sensor', x: 0, y: 2, w: 3, h: 1 },
    }],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root: {
        xl: [
          { i: 'section-greeting-1', x: 0, y: 0, w: 12, h: 2 },
          { i: 'root.sensor', x: 0, y: 2, w: 3, h: 1 },
        ],
      },
    },
  };
}

describe('Grid v2 conversion canonical geometry', () => {
  it('writes the converted XL Greeting geometry to both XL and canonical state', () => {
    const source = legacyDashboard();
    const before = structuredClone(source);

    const converted = createGridV2DashboardConfiguration(source);
    const canonicalGreeting = converted.sections.find(
      (section) => section.id === 'section-greeting-1',
    )!.layout;
    const xlGreeting = converted.responsiveLayouts.root!.xl!.find(
      (item) => item.i === 'section-greeting-1',
    )!;

    expect(canonicalGreeting).toEqual(xlGreeting);
    expect(canonicalGreeting).toEqual({
      i: 'section-greeting-1', x: 0, y: 0, w: 12, h: 3,
    });
    expect(source).toEqual(before);
  });
});
