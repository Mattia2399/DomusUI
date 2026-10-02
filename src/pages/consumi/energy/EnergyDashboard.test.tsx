import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnergyModuleState, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { EnergyDashboard } from './EnergyDashboard';
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
const show = (value: EnergyState, canManage = true) => {
  const onEdit = vi.fn();
  render(<EnergyDashboard state={value} canManage={canManage} onEdit={onEdit} actions={null} />);
  return onEdit;
};

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

    expect(screen.getByRole('heading', { name: 'Prelievo dalla rete: 1,2 kW' })).not.toBeNull();
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

    expect(screen.getByRole('heading', { name: 'Immissione in rete: 400 W' })).not.toBeNull();
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

    expect(screen.getByRole('heading', { name: 'Nessuno scambio con la rete' })).not.toBeNull();
    expect(screen.getByText('Storico non ancora disponibile')).not.toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: '7 giorni' }));
    expect(screen.getByRole('radio', { name: '7 giorni' }).getAttribute('aria-checked')).toBe('true');
  });

  it('offers the setup only to administrators', () => {
    const onEdit = show(state({ grid: online({ net_power: q(100) }) }));
    fireEvent.click(screen.getByRole('button', { name: /Impianto/ }));
    expect(onEdit).toHaveBeenCalledOnce();

    cleanup();
    show(state({ grid: online({ net_power: q(100) }) }), false);
    expect(screen.queryByRole('button', { name: /Impianto/ })).toBeNull();
  });
});
