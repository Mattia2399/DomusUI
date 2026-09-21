import { describe, expect, it } from 'vitest';
import type { Widget } from '../types/dashboardModels';
import { normalizeWidgetsForRuntime } from './dashboardDemoFixtures';

describe('legacy humidifier widget migration', () => {
  it('converts humidifier entities previously stored as climate cards', () => {
    const legacy: Widget = {
      id: 'climate.legacy_humidifier',
      kind: 'climate',
      title: 'Umidificatore',
      entityId: 'humidifier.bedroom',
      status: 'off',
      isOn: false,
      layout: { i: 'climate.legacy_humidifier', x: 1, y: 2, w: 2, h: 2 },
    };
    const [migrated] = normalizeWidgetsForRuntime([legacy], 'real');
    expect(migrated.kind).toBe('humidifier');
    expect(migrated.layout).toEqual(legacy.layout);
    expect(normalizeWidgetsForRuntime([migrated], 'real')).toEqual([migrated]);
  });
});
