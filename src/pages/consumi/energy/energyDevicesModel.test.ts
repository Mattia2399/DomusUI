import { describe, expect, it } from 'vitest';
import type { EnergyDeviceState, EnergyModuleState, EnergyQuantity } from '../../../services/energyCoreClient';
import {
  deviceRows,
  detailEntityIds,
  hasDeviceDetail,
  moduleCondition,
  partialLine,
  quantityLabel,
  totalRow,
} from './energyDevicesModel';

const NOW = '2026-10-06T12:00:00Z';
const q = (value: number | null, extra: Partial<EnergyQuantity> = {}): EnergyQuantity => ({
  status: value === null ? 'unavailable' : 'ok',
  value,
  unit: 'W',
  source: value === null ? null : 'measured',
  entity_ids: ['sensor.x'],
  reason: value === null ? 'state_unavailable' : null,
  freshness: value === null ? null : 'fresh',
  ...extra,
});
const device = (id: string, name: string | null, quantities: Record<string, EnergyQuantity>, extra: Partial<EnergyDeviceState> = {}): EnergyDeviceState => ({
  device_id: id, name, status: 'online', complete: true, freshness: 'fresh', sign_convention: null, reason: null, quantities, ...extra,
});
const module = (quantities: Record<string, EnergyQuantity>, extra: Partial<EnergyModuleState> = {}): EnergyModuleState => ({
  status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities, ...extra,
});

describe('Where a value comes from', () => {
  it('keeps the A0 labels for one device and names sums, averages and totals', () => {
    expect(quantityLabel(q(1200, { origin: 'device' }))).toBe('Misurato');
    expect(quantityLabel(q(1200))).toBe('Misurato');
    expect(quantityLabel(q(1200, { source: 'derived', origin: 'device' }))).toBe('Derivato');
    expect(quantityLabel(q(4300, { source: 'derived', origin: 'devices_sum', coverage: { contributing: 2, configured: 2 } }))).toBe('Somma di 2 dispositivi');
    expect(quantityLabel(q(66.7, { unit: '%', origin: 'devices_weighted_usable' }))).toBe('Media pesata sulla capacità utilizzabile');
    expect(quantityLabel(q(66.7, { unit: '%', origin: 'devices_weighted_nominal' }))).toBe('Media pesata sulla capacità nominale');
    expect(quantityLabel(q(4400, { origin: 'total' }))).toBe('Misurato dal sensore totale');
  });

  it('explains missing values, with how many devices report', () => {
    expect(quantityLabel(q(null, { reason: 'partial_devices', coverage: { contributing: 2, configured: 3 } }))).toBe('Non tutti i dispositivi rispondono · 2 di 3');
    expect(quantityLabel(q(null, { reason: 'total_unavailable', origin: 'total' }))).toBe('Sensore totale non disponibile');
    expect(quantityLabel(q(null, { status: 'invalid', reason: 'total_invalid' }))).toBe('Sensore totale non valido');
    expect(quantityLabel(q(null, { status: 'not_measured', reason: 'capacity_unknown' }))).toMatch(/capacità delle batterie mancanti/);
    expect(quantityLabel(null)).toBe('Non disponibile');
  });
});

describe('Partial values', () => {
  it('shows what the reporting devices give, never as the module value', () => {
    const production = q(null, { reason: 'partial_devices', partial_value: 3500, coverage: { contributing: 2, configured: 3 } });
    expect(partialLine('solar', 'production_power', production)).toEqual(['Dai dispositivi disponibili', '3,5 kW · 2 di 3']);
    // No partial line for a complete value or without a partial sum.
    expect(partialLine('solar', 'production_power', q(4300))).toBeNull();
    expect(partialLine('solar', 'production_power', q(null, { reason: 'source_unavailable', coverage: { contributing: 0, configured: 2 } }))).toBeNull();
  });

  it('gives a direction, not a bound, for signed flows', () => {
    const net = (value: number) => q(null, { reason: 'partial_devices', partial_value: value, coverage: { contributing: 1, configured: 2 } });
    expect(partialLine('battery', 'net_power', net(-1200))).toEqual(['Dai dispositivi disponibili', 'in carica 1,2 kW · 1 di 2']);
    expect(partialLine('battery', 'net_power', net(800))).toEqual(['Dai dispositivi disponibili', 'in scarica 800 W · 1 di 2']);
    expect(partialLine('grid', 'net_power', net(-300))).toEqual(['Dai dispositivi disponibili', 'in immissione 300 W · 1 di 2']);
    expect(partialLine('grid', 'net_power', net(2))).toEqual(['Dai dispositivi disponibili', 'nessuno scambio · 1 di 2']);
    for (const value of [-1200, 800]) expect(partialLine('battery', 'net_power', net(value))?.[1]).not.toMatch(/[≥>]/);
  });
});

describe('Module condition', () => {
  const offlineInverter = device('solar-2', 'Pergola', { production_power: q(null) }, { status: 'offline', complete: false, freshness: null });
  const total = { status: 'online' as const, complete: true, freshness: 'fresh' as const, sign_convention: null, reason: null, quantities: { production_power: q(4400) } };

  it('keeps a valid total trustworthy when only the detail is incomplete', () => {
    const withTotal = module({ production_power: q(4400, { origin: 'total' }) }, { complete: false, total, devices: [device('solar-1', 'Tetto', { production_power: q(2500) }), offlineInverter] });
    expect(moduleCondition('solar', withTotal)).toBe('detail_incomplete');
    expect(hasDeviceDetail(withTotal)).toBe(true);
  });

  it('is partial when the module value itself is missing or the total is down', () => {
    const summed = module({ production_power: q(null, { reason: 'partial_devices', origin: 'devices_sum' }) }, { complete: false, devices: [offlineInverter, offlineInverter] });
    expect(moduleCondition('solar', summed)).toBe('partial');
    const totalDown = module({ production_power: q(null, { reason: 'total_unavailable', origin: 'total' }) }, { complete: false, total: { ...total, status: 'offline', complete: false } });
    expect(moduleCondition('solar', totalDown)).toBe('partial');
    expect(moduleCondition('solar', module({ production_power: q(4300) }))).toBe('complete');
  });

  it('shows no detail for a single device', () => {
    expect(hasDeviceDetail(module({ production_power: q(4300) }, { devices: [device('solar-1', null, { production_power: q(4300) })], total: null }))).toBe(false);
  });
});

describe('Device rows', () => {
  it('names, values, states and conventions of each device and the total', () => {
    const batteries = module(
      { state_of_charge: q(66.7, { unit: '%', origin: 'devices_weighted_usable' }), net_power: q(600, { origin: 'devices_sum' }) },
      {
        devices: [
          device('battery-1', 'Garage', { state_of_charge: q(80, { unit: '%' }), net_power: q(1000) }, { sign_convention: 'positive_discharge' }),
          device('battery-2', null, { state_of_charge: q(40, { unit: '%' }), net_power: q(-400) }, { sign_convention: 'positive_charge' }),
          device('battery-3', 'Cantina', { net_power: q(null) }, { status: 'offline', complete: false, freshness: null, reason: 'sensors_unavailable' }),
          device('battery-4', 'Vecchia', { net_power: q(900, { freshness: 'stale', reported_at: '2026-10-06T11:20:00Z' }) }, { freshness: 'stale' }),
          device('battery-5', 'Contatori', { net_power: q(null, { status: 'not_measured', reason: 'not_configured' }) }, { status: 'not_measured', complete: false, freshness: null }),
        ],
      },
    );
    const rows = deviceRows('battery', batteries, NOW);
    expect(rows.map((row) => [row.name, row.value, row.caption, row.tone])).toEqual([
      ['Garage', '80%', 'In scarica 1,0 kW', 'ok'],
      ['Batteria 2', '40%', 'In carica 400 W', 'ok'],
      ['Cantina', '—', 'Offline · i sensori non forniscono dati', 'warning'],
      ['Vecchia', '900 W', 'Non aggiornato da 40 min', 'warning'],
      ['Contatori', '—', 'Solo contatori di energia, nessuna potenza in tempo reale', 'muted'],
    ]);
    // Each battery explains its own sign convention.
    expect(rows[0].convention).toBe('Valori positivi = scarica verso la casa');
    expect(rows[1].convention).toBe('Valori positivi = carica della batteria');
    expect(rows[0].quantities.map(([label]) => label)).toEqual(['Stato di carica', 'Potenza netta (con segno)']);
  });

  it('keeps the total apart and lists every sensor for the live refresh', () => {
    const total = { status: 'online' as const, complete: true, freshness: 'fresh' as const, sign_convention: null, reason: null, quantities: { production_power: q(4400, { entity_ids: ['sensor.pv_total'] }) } };
    const solar = module({ production_power: q(4400, { origin: 'total', entity_ids: ['sensor.pv_total'] }) }, {
      total,
      devices: [device('solar-1', 'Tetto', { production_power: q(2500, { entity_ids: ['sensor.inv1'] }) }), device('solar-2', 'Pergola', { production_power: q(1900, { entity_ids: ['sensor.inv2'] }) })],
    });
    expect(totalRow('solar', solar.total, NOW)).toMatchObject({ name: 'Sensore totale', value: '4,4 kW', caption: 'Attivo' });
    expect(totalRow('solar', null, NOW)).toBeNull();
    expect(detailEntityIds(solar).sort()).toEqual(['sensor.inv1', 'sensor.inv2', 'sensor.pv_total']);
  });
});
