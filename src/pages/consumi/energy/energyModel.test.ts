import { describe, expect, it } from 'vitest';
import type { EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { buildFlowFromState, formatPower } from './energyModel';

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

  it('formats watts and kilowatts', () => {
    expect(formatPower(850)).toBe('850 W');
    expect(formatPower(1250)).toBe('1,25 kW');
  });
});
