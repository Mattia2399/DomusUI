import { describe, expect, it } from 'vitest';
import type { DeviceKind } from '../model/entityKind';
import { SENSOR_FAMILY_CLASSES, type SensorFamily } from '../model/sensorFamily';
import { resolvePanel, type PanelId } from './resolvePanel';

const WITH_PANEL: ReadonlyArray<readonly [DeviceKind, PanelId]> = [
  ['light', 'light'],
  ['climate', 'climate'],
  ['switch', 'device'],
  ['fan', 'device'],
  ['humidifier', 'device'],
  ['cover', 'device'],
  ['lock', 'security'],
  ['camera', 'camera'],
  ['media', 'media'],
  ['sensor', 'sensor'],
  ['binary', 'sensor'],
  ['alarm', 'alarm'],
  ['vacuum', 'vacuum'],
  ['calendar', 'calendar'],
  ['members', 'members'],
];

const WITHOUT_PANEL: DeviceKind[] = [
  'water_heater', 'valve', 'lawn_mower', 'siren', 'event', 'alert', 'button', 'script', 'automation', 'remote',
  'select', 'number', 'text', 'datetime', 'counter', 'timer', 'schedule', 'update', 'todo', 'image', 'assist',
  'location', 'none',
];

describe('resolvePanel', () => {
  it.each(WITH_PANEL)('%s opens %s', (kind, panel) => {
    expect(resolvePanel(kind).panel).toBe(panel);
  });

  it.each(WITHOUT_PANEL)('%s has no panel', (kind) => {
    expect(resolvePanel(kind)).toEqual({ panel: 'none', family: null });
  });

  it('keeps every family of sensor on the sensor panel', () => {
    const families = Object.keys(SENSOR_FAMILY_CLASSES) as SensorFamily[];
    expect(families).toHaveLength(17);
    for (const family of families) {
      expect(resolvePanel(family === 'opening' || family === 'motion' || family === 'safety' || family === 'device' ? 'binary' : 'sensor', family)).toEqual({ panel: 'sensor', family });
    }
  });

  it('gives a sensor without a family the default one', () => {
    expect(resolvePanel('sensor').family).toBe('measure');
    expect(resolvePanel('binary').family).toBe('device');
  });

  it('keeps the family only for a sensor', () => {
    expect(resolvePanel('light', 'temperature')).toEqual({ panel: 'light', family: null });
  });
});
