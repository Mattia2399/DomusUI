import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EnergyModuleId, EnergyModuleState, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { EnergyHomeVisual, energyHomeVariant, selectEnergyHomeAsset, type EnergyHomeAssetCatalog } from './EnergyHomeVisual';
import { buildFlowFromState } from './energyModel';

const moduleState = (status: EnergyModuleState['status'] = 'online'): EnergyModuleState => ({
  status,
  complete: status === 'online',
  sign_convention: null,
  quantities: {},
});
const power = (value: number | null): EnergyQuantity => ({
  status: value === null ? 'unavailable' : 'ok',
  value,
  unit: 'W',
  source: value === null ? null : 'measured',
  entity_ids: ['sensor.grid_power'],
  reason: value === null ? 'state_unavailable' : null,
});

const gridModule = (value: number | null, status: EnergyModuleState['status'] = 'online'): EnergyModuleState => ({
  ...moduleState(status),
  quantities: { net_power: power(value) },
});
const stateWith = (modules: Partial<Record<EnergyModuleId, EnergyModuleState>>): EnergyState => ({
  configured: true,
  load_error: false,
  available: true,
  profile_revision: 1,
  observed_at: '2026-10-02T10:00:00Z',
  modules,
  absent_modules: [],
  offline_modules: Object.entries(modules)
    .filter(([, module]) => module?.status === 'offline')
    .map(([id]) => id as EnergyModuleId),
  home_consumption: null,
});

const ASSETS: EnergyHomeAssetCatalog = {
  grid: { src: '/energy/grid.webp', alt: 'Casa collegata alla rete' },
  'grid+solar+battery+wallbox': { src: '/energy/full.webp', alt: 'Casa con impianto completo' },
  'grid+battery': { src: '/energy/grid-battery.webp', alt: 'Casa con rete e accumulo' },
};

describe('Energy home visual', () => {
  it('builds deterministic variants from configured hardware', () => {
    expect(energyHomeVariant(stateWith({ grid: moduleState() }))).toBe('grid');
    expect(energyHomeVariant(stateWith({ wallbox: moduleState(), solar: moduleState(), grid: moduleState(), battery: moduleState() })))
      .toBe('grid+solar+battery+wallbox');
  });

  it('keeps offline hardware in the exact visual profile', () => {
    const state = stateWith({ grid: moduleState(), battery: moduleState('offline') });
    expect(selectEnergyHomeAsset(state, ASSETS)).toEqual({
      variant: 'grid+battery',
      asset: ASSETS['grid+battery'],
    });
  });

  it('never substitutes a complete-system image for a smaller installation', () => {
    const state = stateWith({ grid: moduleState() });
    const fullOnly = { 'grid+solar+battery+wallbox': ASSETS['grid+solar+battery+wallbox'] };
    expect(selectEnergyHomeAsset(state, fullOnly)).toEqual({ variant: 'grid', asset: null });
  });

  it('renders the SVG flow diagram when no exact image exists', () => {
    const state = stateWith({ grid: moduleState(), solar: moduleState() });
    const { container } = render(<EnergyHomeVisual state={state} view={buildFlowFromState(state)} assets={ASSETS} />);

    expect(container.querySelector('[data-energy-home-render="diagram"]')).not.toBeNull();
    expect(screen.getByRole('img', { name: /Flussi energetici/ })).not.toBeNull();
    expect(screen.queryByTestId('energy-home-image')).toBeNull();
  });

  it('loads only the exact image and falls back if that asset fails', () => {
    const state = stateWith({ grid: moduleState() });
    const { container } = render(<EnergyHomeVisual state={state} view={buildFlowFromState(state)} assets={ASSETS} />);

    const image = screen.getByTestId('energy-home-image') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/energy/grid.webp');
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: /^Casa collegata alla rete\. Flussi energetici/ })).not.toBeNull();
    expect(container.querySelector('[data-energy-home-render="image"]')).not.toBeNull();

    fireEvent.error(image);
    expect(screen.queryByTestId('energy-home-image')).toBeNull();
    expect(container.querySelector('[data-energy-home-render="diagram"]')).not.toBeNull();
  });

  it('animates only an online flow with a known non-zero direction', () => {
    const activeState = stateWith({ grid: gridModule(1200) });
    const view = render(<EnergyHomeVisual state={activeState} view={buildFlowFromState(activeState)} assets={{}} />);
    expect(view.container.querySelectorAll('animateMotion').length).toBeGreaterThan(0);

    const zeroState = stateWith({ grid: gridModule(0) });
    view.rerender(<EnergyHomeVisual state={zeroState} view={buildFlowFromState(zeroState)} assets={{}} />);
    expect(view.container.querySelectorAll('animateMotion')).toHaveLength(0);

    const unknownState = stateWith({ grid: gridModule(null) });
    view.rerender(<EnergyHomeVisual state={unknownState} view={buildFlowFromState(unknownState)} assets={{}} />);
    expect(view.container.querySelectorAll('animateMotion')).toHaveLength(0);

    const offlineState = stateWith({ grid: gridModule(1200, 'offline') });
    view.rerender(<EnergyHomeVisual state={offlineState} view={buildFlowFromState(offlineState)} assets={{}} />);
    expect(view.container.querySelectorAll('animateMotion')).toHaveLength(0);
  });
});
