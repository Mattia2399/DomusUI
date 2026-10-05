import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnergyModuleState, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { EnergyDashboard, homeCoverage } from './EnergyDashboard';
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
const show = (value: EnergyState) => render(<EnergyDashboard state={value} actions={null} />);

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
    expect(within(hero).queryByText(/dalla rete/)).toBeNull();
    expect(within(hero).queryByText('In tempo reale')).toBeNull();
    const components = screen.getByRole('list', { name: 'Componenti dell’impianto' });
    expect(within(components).getAllByRole('listitem')).toHaveLength(2);
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
    expect(within(components).getAllByRole('listitem')).toHaveLength(5);
    const battery = within(components).getByText('Batteria').closest('article') as HTMLElement;
    expect(within(battery).getByText('68%')).not.toBeNull();
    expect(within(battery).getByText('In carica · 1,6 kW')).not.toBeNull();
    expect(screen.getByText('Carica e scarica batteria')).not.toBeNull();
    expect(screen.getByText('Autoconsumo')).not.toBeNull();
    expect(screen.getByRole('img', { name: /Wallbox: 7,4 kW/ })).not.toBeNull();
  });

  it('never presents history values that do not exist yet', () => {
    show(state({ grid: online({ net_power: q(0) }), solar: online({ production_power: q(900) }) }));

    expect(within(screen.getByTestId('energy-hero')).getByText('Coperto al 100% da fotovoltaico')).not.toBeNull();
    expect(screen.getByText('Storico non ancora disponibile')).not.toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: '7 giorni' }));
    expect(screen.getByRole('radio', { name: '7 giorni' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Home coverage', () => {
  it('splits the live home consumption between the plant and the grid', () => {
    const plant = { solar: online({ production_power: q(2000) }), battery: online({ net_power: q(0) }) };

    expect(homeCoverage(state({ ...plant, grid: online({ net_power: q(-300) }) }))).toBe('Coperto al 100% da fotovoltaico e batteria');
    expect(homeCoverage(state({ ...plant, grid: online({ net_power: q(600) }) }))).toBe('60% da fotovoltaico e batteria · 40% dalla rete');
    expect(homeCoverage(state({ ...plant, grid: online({ net_power: q(1500) }) }))).toBe('Coperto interamente dalla rete');
    expect(homeCoverage(state({ grid: online({ net_power: q(1500) }) }))).toBeNull();
    expect(homeCoverage(state({ ...plant, grid: online({ net_power: q(600) }) }, { home_consumption: q(null) }))).toBeNull();
  });
});
