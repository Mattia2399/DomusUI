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
      tariff: { scheme: 'three_band', band: 'F2', band_label: 'F2', price: 0.27, export_price: 0.09, currency: 'EUR' },
    }));
    const components = screen.getByRole('list', { name: 'Componenti dell’impianto' });

    fireEvent.click(within(components).getByText('Rete').closest('button') as HTMLElement);
    const grid = await screen.findByRole('dialog', { name: 'Rete' });
    expect(within(grid).getByText(/≈\s0,78\s€\/h/)).not.toBeNull();
    expect(within(grid).getByText('Alla casa').nextSibling?.textContent).toBe('2,9 kW');
    expect(within(grid).getByText(/Stima in proporzione/)).not.toBeNull();
    expect(within(grid).getByText('sensor.example')).not.toBeNull();
    // Without an edit callback (non-administrators) there is no shortcut to the settings.
    expect(within(grid).queryByRole('button', { name: 'Modifica sensori' })).toBeNull();
    fireEvent.click(within(grid).getByRole('button', { name: /Chiudi/ }));

    fireEvent.click(within(components).getByText('Wallbox').closest('button') as HTMLElement);
    const wallbox = await screen.findByRole('dialog', { name: 'Wallbox' });
    expect(within(wallbox).getByText('Da fotovoltaico').nextSibling?.textContent).toBe('3,93 kW · 53%');
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
