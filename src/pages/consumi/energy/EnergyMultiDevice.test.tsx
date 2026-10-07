import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnergyDeviceState, EnergyModuleState, EnergyQuantity, EnergyState, EnergyTotalState } from '../../../services/energyCoreClient';
import { EnergyDashboard } from './EnergyDashboard';

/* Several inverters, batteries and wallboxes as get_state reports them (multi-device integrations). */

afterEach(cleanup);

const NOW = '2026-10-06T12:00:00Z';
const q = (value: number | null, extra: Partial<EnergyQuantity> = {}): EnergyQuantity => ({
  status: value === null ? 'unavailable' : 'ok',
  value,
  unit: 'W',
  source: value === null ? null : 'measured',
  entity_ids: ['sensor.x'],
  reason: value === null ? 'state_unavailable' : null,
  freshness: value === null ? null : 'fresh',
  origin: 'device',
  partial_value: null,
  coverage: value === null ? { contributing: 0, configured: 1 } : { contributing: 1, configured: 1 },
  ...extra,
});
const sum = (value: number | null, contributing: number, configured: number, extra: Partial<EnergyQuantity> = {}) =>
  q(value, { source: value === null ? 'derived' : 'derived', origin: 'devices_sum', coverage: { contributing, configured }, ...(value === null ? { reason: 'partial_devices' } : {}), ...extra });
const device = (id: string, name: string | null, quantities: Record<string, EnergyQuantity>, extra: Partial<EnergyDeviceState> = {}): EnergyDeviceState => ({
  device_id: id, name, status: 'online', complete: true, freshness: 'fresh', sign_convention: null, reason: null, quantities, ...extra,
});
const offline = (id: string, name: string, role: string): EnergyDeviceState =>
  device(id, name, { [role]: q(null) }, { status: 'offline', complete: false, freshness: null, reason: 'sensors_unavailable' });
const module = (quantities: Record<string, EnergyQuantity>, devices: EnergyDeviceState[], extra: Partial<EnergyModuleState> = {}): EnergyModuleState => ({
  status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities, devices, total: null, ...extra,
});
const GRID = module({ net_power: q(1500), import_power: q(1500, { source: 'derived' }), export_power: q(0, { source: 'derived' }) }, [device('grid-1', null, { net_power: q(1500) })], { sign_convention: 'positive_import' });
const state = (modules: EnergyState['modules'], extra: Partial<EnergyState> = {}): EnergyState => ({
  configured: true,
  load_error: false,
  available: true,
  profile_revision: 4,
  observed_at: NOW,
  modules: { grid: GRID, ...modules },
  absent_modules: [],
  offline_modules: [],
  home_consumption: q(7300, { source: 'derived', origin: null, coverage: null }),
  unsupported_modules: {},
  ...extra,
});

const tiles = () => screen.getByRole('list', { name: 'Componenti dell’impianto' });
const tile = (label: string) => within(tiles()).getByText(label).closest('button') as HTMLElement;
async function openSheet(label: string) {
  fireEvent.click(tile(label));
  return screen.findByRole('dialog', { name: label });
}
/** A figure of the sheet's "Adesso" section, the module value. */
const line = (sheet: HTMLElement, label: string) => {
  const now = within(sheet).getByText('Adesso').closest('section') as HTMLElement;
  return within(now).getByText(label).nextSibling?.textContent;
};

describe('One device per module', () => {
  it('looks exactly as before: no device list, the usual labels', async () => {
    render(<EnergyDashboard state={state({ solar: module({ production_power: q(4300) }, [device('solar-1', null, { production_power: q(4300) })]) })} />);
    expect(within(tile('Fotovoltaico')).getByText('4,3 kW')).not.toBeNull();
    const sheet = await openSheet('Fotovoltaico');
    expect(within(sheet).queryByRole('region', { name: 'Dispositivi' })).toBeNull();
    expect(within(sheet).getByText('Sensori')).not.toBeNull();
    expect(within(sheet).getByText(/· Misurato/)).not.toBeNull();
    expect(within(sheet).getByText('Attivo')).not.toBeNull();
  });
});

describe('Several inverters', () => {
  it('shows the module sum from the backend and each inverter in the detail', async () => {
    render(<EnergyDashboard state={state({
      solar: module({ production_power: sum(5800, 2, 2) }, [
        device('solar-1', 'Inverter Tetto', { production_power: q(3400) }),
        device('solar-2', 'Inverter Pergola', { production_power: q(2400) }),
      ]),
    })} />);
    expect(within(tile('Fotovoltaico')).getByText('5,8 kW')).not.toBeNull();
    const sheet = await openSheet('Fotovoltaico');
    expect(line(sheet, 'Produzione')).toBe('5,8 kW');
    const devices = within(sheet).getByRole('region', { name: 'Dispositivi' });
    expect(within(devices).getByText('Inverter Tetto').closest('summary')?.textContent).toContain('3,4 kW');
    expect(within(devices).getByText('Inverter Pergola').closest('summary')?.textContent).toContain('2,4 kW');
    expect(within(sheet).getByText('Valori del modulo')).not.toBeNull();
    expect(within(sheet).getByText(/Somma di 2 dispositivi/)).not.toBeNull();
  });

  it('with one of three offline, never presents the reporting ones as the production', async () => {
    render(<EnergyDashboard state={state({
      solar: module({ production_power: sum(null, 2, 3, { partial_value: 3500 }) }, [
        device('solar-1', 'Sud', { production_power: q(2000) }),
        device('solar-2', 'Ovest', { production_power: q(1500) }),
        offline('solar-3', 'Garage', 'production_power'),
      ], { complete: false }),
    }, { home_consumption: q(null, { source: 'derived', reason: 'source_unavailable', origin: null, coverage: null }) })} />);
    const solarTile = tile('Fotovoltaico');
    expect(within(solarTile).getByText('—')).not.toBeNull();
    expect(within(solarTile).getByText('2 di 3 dispositivi')).not.toBeNull();
    expect(within(screen.getByTestId('energy-hero')).getByText('Dati parziali')).not.toBeNull();
    const sheet = await openSheet('Fotovoltaico');
    expect(line(sheet, 'Produzione')).toBe('Non tutti i dispositivi rispondono · 2 di 3');
    expect(line(sheet, 'Dai dispositivi disponibili')).toBe('3,5 kW · 2 di 3');
    expect(within(sheet).queryByText('3,5 kW')).toBeNull();
    expect(within(within(sheet).getByRole('region', { name: 'Dispositivi' })).getByText('Garage').closest('summary')?.textContent).toContain('Offline');
  });
});

describe('A total sensor', () => {
  const total = (value: number | null): EnergyTotalState => ({
    status: value === null ? 'offline' : 'online', complete: value !== null, freshness: value === null ? null : 'fresh', sign_convention: null,
    reason: value === null ? 'sensors_unavailable' : null, quantities: { production_power: q(value, { origin: null, coverage: null }) },
  });

  it('keeps a valid total and says only the detail is incomplete', async () => {
    render(<EnergyDashboard state={state({
      solar: module({ production_power: q(5850, { origin: 'total', coverage: null }) }, [
        device('solar-1', 'Tetto', { production_power: q(3400) }),
        offline('solar-2', 'Pergola', 'production_power'),
      ], { complete: false, total: total(5850) }),
    })} />);
    expect(within(tile('Fotovoltaico')).getByText('5,85 kW')).not.toBeNull();
    expect(tile('Fotovoltaico').querySelector('[title]')?.getAttribute('title')).toBe('Dettaglio dei dispositivi incompleto');
    expect(within(screen.getByTestId('energy-hero')).queryByText('Dati parziali')).toBeNull();
    const sheet = await openSheet('Fotovoltaico');
    expect(within(sheet).getByText('Attivo · dettaglio dei dispositivi incompleto')).not.toBeNull();
    // The backend total, not 3,4 kW from the one device that reports.
    expect(line(sheet, 'Produzione')).toBe('5,85 kW');
    expect(within(sheet).getByText(/Misurato dal sensore totale/)).not.toBeNull();
    const devices = within(sheet).getByRole('region', { name: 'Dispositivi' });
    expect(within(devices).getByText('Sensore totale').closest('summary')?.textContent).toContain('5,85 kW');
    expect(within(devices).getByText(/non vengono sommati/)).not.toBeNull();
  });

  it('says the total is unavailable without falling back to the devices', async () => {
    render(<EnergyDashboard state={state({
      solar: module({ production_power: q(null, { origin: 'total', reason: 'total_unavailable', coverage: null }) }, [
        device('solar-1', 'Tetto', { production_power: q(3400) }),
        device('solar-2', 'Pergola', { production_power: q(2400) }),
      ], { complete: false, total: total(null) }),
    })} />);
    const sheet = await openSheet('Fotovoltaico');
    expect(line(sheet, 'Produzione')).toBe('Sensore totale non disponibile');
    expect(within(within(sheet).getByText('Adesso').closest('section') as HTMLElement).queryByText('Dai dispositivi disponibili')).toBeNull();
    expect(within(sheet).queryByText('5,8 kW')).toBeNull();
    expect(within(sheet).getByText('Dati parziali')).not.toBeNull();
  });
});

describe('Several batteries', () => {
  const batteries = (soc: EnergyQuantity) => module(
    { state_of_charge: soc, net_power: sum(600, 2, 2), charge_power: sum(400, 2, 2), discharge_power: sum(1000, 2, 2) },
    [
      device('battery-1', 'Garage', { state_of_charge: q(80, { unit: '%' }), net_power: q(1000) }, { sign_convention: 'positive_discharge' }),
      device('battery-2', 'Cantina', { state_of_charge: q(40, { unit: '%' }), net_power: q(-400) }, { sign_convention: 'positive_charge' }),
    ],
  );

  it('shows the backend-weighted charge level and each battery with its own convention', async () => {
    render(<EnergyDashboard state={state({ battery: batteries(q(66.667, { unit: '%', source: 'derived', origin: 'devices_weighted_usable', coverage: { contributing: 2, configured: 2 } })) })} />);
    expect(within(tile('Batteria')).getByText('67%')).not.toBeNull();
    const sheet = await openSheet('Batteria');
    expect(line(sheet, 'Stato di carica')).toBe('67%');
    expect(line(sheet, 'In scarica')).toBe('600 W');
    expect(within(sheet).getByText(/Media pesata sulla capacità utilizzabile/)).not.toBeNull();
    const devices = within(sheet).getByRole('region', { name: 'Dispositivi' });
    expect(within(devices).getByText('Garage').closest('summary')?.textContent).toContain('In scarica 1,0 kW');
    expect(within(devices).getByText('Cantina').closest('summary')?.textContent).toContain('In carica 400 W');
    expect(within(devices).getByText('Valori positivi = scarica verso la casa')).not.toBeNull();
    expect(within(devices).getByText('Valori positivi = carica della batteria')).not.toBeNull();
    // No module-wide convention when the batteries disagree.
    expect(within(sheet).getAllByText(/Valori positivi/)).toHaveLength(2);
  });

  it('keeps each charge level when the total one cannot be computed', async () => {
    render(<EnergyDashboard state={state({ battery: batteries(q(null, { status: 'not_measured', unit: '%', reason: 'capacity_unknown', origin: null, coverage: { contributing: 2, configured: 2 } })) })} />);
    // Never an average made up in the browser.
    expect(within(tile('Batteria')).queryByText('60%')).toBeNull();
    const sheet = await openSheet('Batteria');
    expect(line(sheet, 'Stato di carica complessivo')).toBe('Totale non calcolabile: capacità delle batterie mancanti');
    const devices = within(sheet).getByRole('region', { name: 'Dispositivi' });
    expect(within(devices).getByText('Garage').closest('summary')?.textContent).toContain('80%');
    expect(within(devices).getByText('Cantina').closest('summary')?.textContent).toContain('40%');
  });
});

describe('Several wallboxes', () => {
  it('lists each wallbox and leaves the home consumption to the backend', async () => {
    render(<EnergyDashboard state={state({
      wallbox: module({ charging_power: sum(11100, 2, 2) }, [
        device('wallbox-1', 'Garage', { charging_power: q(7400) }),
        device('wallbox-2', 'Cortile', { charging_power: q(3700) }),
      ]),
    })} />);
    expect(within(tile('Wallbox')).getByText('11,1 kW')).not.toBeNull();
    // 7,3 kW from get_state: the wallboxes are not added a second time.
    expect(within(screen.getByTestId('energy-hero')).getByText('7,3 kW')).not.toBeNull();
    const sheet = await openSheet('Wallbox');
    const devices = within(sheet).getByRole('region', { name: 'Dispositivi' });
    expect(within(devices).getByText('Garage').closest('summary')?.textContent).toContain('7,4 kW');
    expect(within(devices).getByText('Cortile').closest('summary')?.textContent).toContain('3,7 kW');
  });
});

describe('Grid, balance and meters only', () => {
  it('keeps import, export and the balance as the backend reports them', () => {
    render(<EnergyDashboard state={state({ solar: module({ production_power: sum(5800, 2, 2) }, [device('solar-1', 'A', { production_power: q(3400) }), device('solar-2', 'B', { production_power: q(2400) })]) })} />);
    expect(within(tile('Rete')).getByText('Prelievo dalla rete')).not.toBeNull();
    expect(within(tile('Rete')).getByText('1,5 kW')).not.toBeNull();
    expect(within(screen.getByTestId('energy-hero')).getByText('7,3 kW')).not.toBeNull();
  });

  it('lists installed modules with energy meters only, never as 0 W', () => {
    render(<EnergyDashboard state={state({}, { unsupported_modules: { solar: 'no_power_sensors' } })} />);
    expect(screen.getByRole('note').textContent).toBe('Fotovoltaico: ha solo contatori di energia, senza un sensore di potenza in tempo reale.');
    expect(within(tiles()).queryByText('Fotovoltaico')).toBeNull();
  });
});
