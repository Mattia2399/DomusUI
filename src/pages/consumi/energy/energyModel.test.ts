import { describe, expect, it } from 'vitest';
import type { EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { buildFlowFromState, formatPower } from './energyModel';
import { boundEntityIds } from './useEnergyCore';

const q = (value: number | null, overrides: Partial<EnergyQuantity> = {}): EnergyQuantity => ({
  status: value === null ? 'unavailable' : 'ok',
  value,
  unit: 'W',
  source: 'measured',
  entity_ids: [],
  reason: value === null ? 'state_unavailable' : null,
  ...overrides,
});

const state = (overrides: Partial<EnergyState>): EnergyState => ({
  configured: true,
  load_error: false,
  available: true,
  profile_revision: 1,
  observed_at: '2026-10-01T10:00:00+00:00',
  modules: {},
  absent_modules: [],
  offline_modules: [],
  home_consumption: null,
  ...overrides,
});

describe('Energy flow view', () => {
  it('shows only the grid for a grid-only home', () => {
    const view = buildFlowFromState(state({
      modules: {
        grid: { status: 'online', complete: true, sign_convention: 'positive_import', quantities: { net_power: q(1200), import_power: q(1200, { source: 'derived' }) } },
      },
      absent_modules: ['solar', 'home', 'battery', 'wallbox'],
      home_consumption: q(1200, { source: 'derived' }),
    }));

    expect(view.nodes.map((node) => node.id)).toEqual(['grid']);
    expect(view.nodes[0]).toMatchObject({ value: '1,2 kW', caption: 'Prelievo', direction: 'in', online: true });
    expect(view.home).toEqual({ value: '1,2 kW', caption: 'Derivato', online: true });
  });

  it('shows solar without any battery node and exporting grid', () => {
    const view = buildFlowFromState(state({
      modules: {
        grid: { status: 'online', complete: true, sign_convention: null, quantities: { net_power: q(-800, { source: 'derived' }) } },
        solar: { status: 'online', complete: true, sign_convention: null, quantities: { production_power: q(3000) } },
      },
      home_consumption: q(2200, { source: 'derived' }),
    }));

    expect(view.nodes.map((node) => node.id)).toEqual(['grid', 'solar']);
    expect(view.nodes[0]).toMatchObject({ caption: 'Immissione', direction: 'out' });
    expect(view.nodes[1]).toMatchObject({ value: '3,0 kW', direction: 'in' });
  });

  it('keeps an offline battery visible without inventing values', () => {
    const view = buildFlowFromState(state({
      modules: {
        battery: {
          status: 'offline',
          complete: false,
          sign_convention: 'positive_discharge',
          quantities: { state_of_charge: q(null, { unit: '%' }), net_power: q(null) },
        },
        wallbox: { status: 'online', complete: true, sign_convention: null, quantities: { charging_power: q(7400) } },
      },
      home_consumption: q(null, { status: 'not_measured', reason: 'insufficient_data', source: null }),
    }));

    expect(view.nodes[0]).toMatchObject({ id: 'battery', value: '—', caption: 'Offline', online: false, direction: 'idle' });
    expect(view.nodes[1]).toMatchObject({ id: 'wallbox', direction: 'out', amountW: 7400 });
    expect(view.home).toEqual({ value: '—', caption: 'Dati insufficienti', online: false });
  });

  it('reads multi-device modules through their A0 totals, never the partial value', () => {
    // As get_state returns it: A0 fields plus origin, partial_value, coverage and devices.
    const multi = {
      ...state({ home_consumption: q(null, { source: 'derived', reason: 'source_unavailable' }) }),
      unsupported_modules: {},
      modules: {
        solar: {
          status: 'online', complete: false, freshness: null, sign_convention: null,
          quantities: {
            production_power: {
              ...q(null, { source: 'derived', reason: 'partial_devices', entity_ids: ['sensor.inv1', 'sensor.inv2', 'sensor.inv3'] }),
              origin: 'devices_sum', partial_value: 3500, coverage: { contributing: 2, configured: 3 },
            },
          },
          devices: [{ device_id: 'solar-1', name: null, status: 'online', quantities: { production_power: q(2000) } }],
          total: null,
        },
        battery: {
          status: 'online', complete: true, freshness: 'fresh', sign_convention: null,
          quantities: {
            state_of_charge: { ...q(66.667, { unit: '%', source: 'derived' }), origin: 'devices_weighted_usable', partial_value: null, coverage: { contributing: 2, configured: 2 } },
            net_power: { ...q(600, { source: 'derived', entity_ids: ['sensor.b1', 'sensor.b2'] }), origin: 'devices_sum', partial_value: null, coverage: { contributing: 2, configured: 2 } },
          },
          devices: [],
          total: null,
        },
      },
    } as unknown as EnergyState;

    const view = buildFlowFromState(multi);

    expect(view.nodes[0]).toMatchObject({ id: 'solar', value: '—', online: true, direction: 'idle', amountW: 0 });
    expect(view.nodes[1]).toMatchObject({ id: 'battery', value: '67%', caption: 'Scarica 600 W', direction: 'in' });
    expect(view.home).toEqual({ value: '—', caption: 'Sensori non disponibili', online: false });
    expect(boundEntityIds(multi)).toEqual(['sensor.b1', 'sensor.b2', 'sensor.inv1', 'sensor.inv2', 'sensor.inv3']);
  });

  it('formats watts and kilowatts', () => {
    expect(formatPower(850)).toBe('850 W');
    expect(formatPower(1250)).toBe('1,25 kW');
    expect(formatPower(-0)).toBe('0 W');
    expect(formatPower(-0.2)).toBe('0 W');
  });
});
