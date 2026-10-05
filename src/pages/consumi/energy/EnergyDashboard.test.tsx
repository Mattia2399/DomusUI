import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnergyModuleState, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { EnergyDashboard, homeSources } from './EnergyDashboard';
import { ENERGY_HOME_ASSETS, selectEnergyHomeAsset } from './EnergyHomeVisual';

afterEach(cleanup);

const q = (value: number | null, extra: Partial<EnergyQuantity> = {}): EnergyQuantity => ({
  status: value === null ? 'unavailable' : 'ok',
  value,
  unit: 'W',
  source: value === null ? null : 'measured',
  entity_ids: ['sensor.example'],
  reason: value === null ? 'state_unavailable' : null,
  ...extra,
});
const online = (quantities: Record<string, EnergyQuantity>): EnergyModuleState => ({
  status: 'online',
  complete: true,
  sign_convention: null,
  quantities,
});
const state = (modules: EnergyState['modules'], extra: Partial<EnergyState> = {}): EnergyState => ({
  configured: true,
  load_error: false,
  available: true,
  profile_revision: 1,
  observed_at: '2026-10-02T12:00:00Z',
  modules,
  absent_modules: (['grid', 'solar', 'home', 'battery', 'wallbox'] as const).filter((id) => !modules[id]),
  offline_modules: [],
  home_consumption: q(1500, { source: 'derived' }),
  ...extra,
});
const show = (value: EnergyState) => render(<EnergyDashboard state={value} />);

describe('Energy house renders', () => {
  it.each([
    ['grid', 'grid-only.png'],
    ['grid+solar', 'grid-solar.png'],
    ['grid+solar+battery', 'grid-solar-battery.png'],
    ['grid+solar+battery+wallbox', 'grid-solar-battery-ev.png'],
    // The "night" file shows no solar panels: it represents grid + battery.
    ['grid+battery', 'grid-solar-battery-night.png'],
  ])('maps %s to %s', (variant, file) => {
    expect(ENERGY_HOME_ASSETS[variant]?.src).toMatch(new RegExp(`images/energy/mobile/${file}$`));
  });

  it('never shows a render with hardware that is not installed', () => {
    const solarAndWallbox = state({ solar: online({}), wallbox: online({}) });
    const gridAndWallbox = state({ grid: online({}), wallbox: online({}) });

    expect(selectEnergyHomeAsset(solarAndWallbox).asset).toBeNull();
    expect(selectEnergyHomeAsset(gridAndWallbox).asset).toBeNull();
  });
});

describe('Energy dashboard', () => {
  it('adapts a grid-only home without placeholders for missing hardware', () => {
    show(state({ grid: online({ net_power: q(1200), import_power: q(1200, { source: 'derived' }) }) }));

    const hero = screen.getByTestId('energy-hero');
    expect(within(hero).getByRole('heading', { name: 'Consumo della casa' })).not.toBeNull();
    expect(within(hero).getByText('Calcolato da rete')).not.toBeNull();
    // Nothing to split with a grid alone, and live data needs no status badge.
    expect(within(hero).queryByRole('list')).toBeNull();
    expect(within(hero).queryByText('In tempo reale')).toBeNull();
    const components = screen.getByRole('list', { name: 'Componenti dell’impianto' });
    expect(within(components).getAllByRole('listitem')).toHaveLength(1);
    expect(within(components).queryByText('Fotovoltaico')).toBeNull();
    const series = screen.getByRole('list', { name: 'Serie disponibili per questo impianto' });
    expect(within(series).queryByText('Produzione fotovoltaica')).toBeNull();
    expect(within(series).getByText('Prelievo dalla rete')).not.toBeNull();
    expect(screen.queryByText('Autoconsumo')).toBeNull();
    expect(screen.queryByText('Risparmio stimato')).toBeNull();
    expect(screen.getByText('Costi energetici')).not.toBeNull();
  });

  it('shows a complete installation with battery state and every series', () => {
    show(state({
      grid: online({ net_power: q(-400) }),
      solar: online({ production_power: q(5200) }),
      battery: online({ state_of_charge: q(68, { unit: '%' }), net_power: q(-1600) }),
      wallbox: online({ charging_power: q(7400) }),
    }));

    expect(within(screen.getByTestId('energy-hero')).getByText('Calcolato da rete, fotovoltaico e batteria')).not.toBeNull();
    const components = screen.getByRole('list', { name: 'Componenti dell’impianto' });
    expect(within(components).getAllByRole('listitem')).toHaveLength(4);
    expect(within(components).queryByText('Consumo della casa')).toBeNull();
    const battery = within(components).getByText('Batteria').closest('button') as HTMLElement;
    expect(within(battery).getByText('68%')).not.toBeNull();
    expect(within(battery).getByText('In carica · 1,6 kW')).not.toBeNull();
    expect(screen.getByText('Carica e scarica batteria')).not.toBeNull();
    expect(screen.getByText('Autoconsumo')).not.toBeNull();
    expect(screen.getByRole('img', { name: /Wallbox: 7,4 kW/ })).not.toBeNull();
  });

  it('never presents history values that do not exist yet', () => {
    show(state({ grid: online({ net_power: q(0) }), solar: online({ production_power: q(900) }) }));

    const sources = within(screen.getByTestId('energy-hero')).getByRole('list', { name: 'Da dove arriva l’energia della casa' });
    expect(within(sources).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Fotovoltaico100%', 'Rete0%']);
    expect(screen.getByText('Storico non ancora disponibile')).not.toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: '7 giorni' }));
    expect(screen.getByRole('radio', { name: '7 giorni' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Component details', () => {
  it('opens a component with live figures, estimated flows, cost and sensors', async () => {
    show(state({
      grid: online({ net_power: q(2900) }),
      solar: online({ production_power: q(4300) }),
      battery: online({ state_of_charge: q(54, { unit: '%' }), net_power: q(900) }),
      wallbox: online({ charging_power: q(7400) }),
    }, {
      home_consumption: q(8100, { source: 'derived' }),
      tariff: { scheme: 'three_band', band: 'F2', band_label: 'F2', price: 0.27, export_price: 0.09, vat_percent: 10, currency: 'EUR' },
    }));
    const components = screen.getByRole('list', { name: 'Componenti dell’impianto' });
    expect(within(screen.getByTestId('energy-hero')).getByText('Calcolata dai contatori')).not.toBeNull();

    fireEvent.click(within(components).getByText('Rete').closest('button') as HTMLElement);
    const grid = await screen.findByRole('dialog', { name: 'Rete' });
    // 2,9 kW at 0,27 €/kWh with 10% VAT; the fixed fee has no hourly meaning.
    expect(within(grid).getByText('Costo attuale stimato, IVA inclusa')).not.toBeNull();
    expect(within(grid).getByText(/≈\s0,86\s€\/h/)).not.toBeNull();
    expect(within(grid).getByText('Alla casa').nextSibling?.textContent).toBe('2,9 kW');
    expect(within(grid).getByText('Flussi · calcolati')).not.toBeNull();
    expect(within(grid).getByText(/ogni percorso è determinato/)).not.toBeNull();
    expect(within(grid).getByText('sensor.example')).not.toBeNull();
    // Without an edit callback (non-administrators) there is no shortcut to the settings.
    expect(within(grid).queryByRole('button', { name: 'Modifica sensori' })).toBeNull();
    fireEvent.click(within(grid).getByRole('button', { name: /Chiudi/ }));

    fireEvent.click(within(components).getByText('Wallbox').closest('button') as HTMLElement);
    const wallbox = await screen.findByRole('dialog', { name: 'Wallbox' });
    expect(within(wallbox).getByText('Da fotovoltaico').nextSibling?.textContent).toBe('3,93 kW · 53%');
    // Which load takes which source cannot be metered: the wallbox mix is always an estimate.
    expect(within(wallbox).getByText('Flussi · stimati')).not.toBeNull();
    expect(within(wallbox).getByText(/stesso mix del resto della casa/)).not.toBeNull();
  });
});

describe('Home sources', () => {
  const share = (value: ReturnType<typeof homeSources>) => value?.map((source) => `${source.id} ${source.percent}`);

  it('splits the live home consumption among its supplies, adding up to 100', () => {
    const plant = { solar: online({ production_power: q(4300) }), battery: online({ net_power: q(900) }) };
    expect(share(homeSources(state({ ...plant, grid: online({ net_power: q(2900) }) }, { home_consumption: q(8100) }))))
      .toEqual(['solar 53', 'battery 11', 'grid 36']);
    // Exports and charging take their part of every supply, so the home is all solar here.
    const sunny = { solar: online({ production_power: q(5200) }), battery: online({ net_power: q(-1600) }), grid: online({ net_power: q(-420) }) };
    expect(share(homeSources(state(sunny, { home_consumption: q(3180) })))).toEqual(['solar 100', 'battery 0', 'grid 0']);
    const thirds = { solar: online({ production_power: q(1000) }), battery: online({ net_power: q(1000) }), grid: online({ net_power: q(1000) }) };
    expect(homeSources(state(thirds, { home_consumption: q(3000) }))?.reduce((sum, source) => sum + source.percent, 0)).toBe(100);
  });

  it('stays silent when a source is unknown or there is nothing to split', () => {
    expect(homeSources(state({ grid: online({ net_power: q(1500) }) }))).toBeNull();
    expect(homeSources(state({ grid: online({ net_power: q(600) }), battery: online({ state_of_charge: q(50, { unit: '%' }) }) }))).toBeNull();
    expect(homeSources(state({ grid: online({ net_power: q(600) }), solar: online({ production_power: q(900) }) }, { home_consumption: q(null) }))).toBeNull();
  });
});

describe('Measured, calculated and estimated', () => {
  const tariff = { scheme: 'single' as const, band: 'F1' as const, band_label: 'F1', price: 0.25, export_price: null, currency: 'EUR' as const };

  it.each([
    ['solar and grid both feed while the battery charges', { grid: 600, solar: 2000, battery: -800 }, 1800],
    ['solar and the battery both feed while power is exported', { grid: -500, solar: 2000, battery: 700 }, 2200],
  ])('marks the split as an estimate when %s', async (_name, flows, home) => {
    show(state({
      grid: online({ net_power: q(flows.grid) }),
      solar: online({ production_power: q(flows.solar) }),
      battery: online({ net_power: q(flows.battery) }),
    }, { home_consumption: q(home, { source: 'derived' }), tariff }));
    const hero = screen.getByTestId('energy-hero');

    expect(within(hero).getByText('Stima · percorsi non misurabili')).not.toBeNull();
    expect(within(hero).getAllByText(/^≈\d+%$/).length).toBe(3);
    fireEvent.click(within(screen.getByRole('list', { name: 'Componenti dell’impianto' })).getByText('Fotovoltaico').closest('button') as HTMLElement);
    const solar = await screen.findByRole('dialog', { name: 'Fotovoltaico' });
    expect(within(solar).getByText('Flussi · stimati')).not.toBeNull();
    expect(within(solar).getByText(/Stima in proporzione/)).not.toBeNull();
  });

  it('shows a VAT-free price as entered when no rate is set', async () => {
    show(state({ grid: online({ net_power: q(2000) }) }, { tariff }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Componenti dell’impianto' })).getByText('Rete').closest('button') as HTMLElement);
    const grid = await screen.findByRole('dialog', { name: 'Rete' });

    expect(within(grid).getByText('Costo attuale stimato')).not.toBeNull();
    expect(within(grid).getByText(/≈\s0,50\s€\/h/)).not.toBeNull();
  });

  it.each([
    ['out_of_range', 'Valore fuori intervallo'],
    ['non_numeric', 'Valore non numerico'],
    ['non_finite', 'Valore non valido'],
    ['incompatible_device_class', 'Tipo di sensore non compatibile'],
  ])('explains the %s reason', async (reason, label) => {
    show(state({
      solar: { status: 'offline', complete: false, sign_convention: null, quantities: { production_power: q(null, { status: 'invalid', reason }) } },
    }, { offline_modules: ['solar'], home_consumption: null }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Componenti dell’impianto' })).getByText('Fotovoltaico').closest('button') as HTMLElement);

    expect(within(await screen.findByRole('dialog', { name: 'Fotovoltaico' })).getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
  });
});

describe('Stale data', () => {
  it('keeps the last value but says since when it was not updated', async () => {
    const stale = { freshness: 'stale' as const, reported_at: '2026-10-02T11:25:00Z', stale_after: 1800 };
    show(state({
      grid: { ...online({ net_power: q(400, { freshness: 'fresh', reported_at: '2026-10-02T11:59:50Z', stale_after: 1800 }) }), freshness: 'fresh' },
      solar: { ...online({ production_power: q(2600, stale) }), freshness: 'stale' },
    }));
    const hero = screen.getByTestId('energy-hero');
    const tile = within(screen.getByRole('list', { name: 'Componenti dell’impianto' })).getByText('Fotovoltaico').closest('button') as HTMLElement;

    expect(within(hero).getByText('Dati non aggiornati')).not.toBeNull();
    expect(within(tile).getByText('2,6 kW')).not.toBeNull();
    expect(within(tile).getByText('Non aggiornato da 35 min')).not.toBeNull();
    fireEvent.click(tile);
    const details = await screen.findByRole('dialog', { name: 'Fotovoltaico' });
    expect(within(details).getAllByText('Non aggiornato da 35 min').length).toBe(2);
  });
});
