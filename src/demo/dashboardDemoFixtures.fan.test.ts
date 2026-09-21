import { describe, expect, it } from 'vitest';
import type { Widget } from '../types/dashboardModels';
import { normalizeWidgetsForRuntime } from './dashboardDemoFixtures';

const legacyFan: Widget = {
  id: 'switch.legacy_fan',
  kind: 'switch',
  title: 'Ventilatore soggiorno',
  entityId: 'fan.living_room',
  dataSource: 'ha',
  status: 'off',
  isOn: false,
  isFavorite: true,
  parentSectionId: 'favorites-stack',
  layout: { i: 'switch.legacy_fan', x: 3, y: 4, w: 2, h: 1 },
};

describe('legacy fan widget migration', () => {
  it('converts fan-as-switch without changing identity, placement or favorites', () => {
    const [migrated] = normalizeWidgetsForRuntime([legacyFan], 'real');
    expect(migrated.kind).toBe('fan');
    expect(migrated.id).toBe(legacyFan.id);
    expect(migrated.layout).toEqual(legacyFan.layout);
    expect(migrated.parentSectionId).toBe('favorites-stack');
    expect(migrated.isFavorite).toBe(true);
    expect(normalizeWidgetsForRuntime([migrated], 'real')).toEqual([migrated]);
  });

  it('does not convert real switches or demo data into Home Assistant writes', () => {
    const switchWidget = { ...legacyFan, entityId: 'switch.lamp' };
    expect(normalizeWidgetsForRuntime([switchWidget], 'real')[0].kind).toBe('switch');
    const [demo] = normalizeWidgetsForRuntime([{ ...legacyFan, dataSource: 'mock' }], 'demo');
    expect(demo.kind).toBe('fan');
    expect(demo.dataSource).toBe('mock');
  });
});
