import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsumptionDashboardPage } from './Consumi';
import type { EnergyPageContext } from './consumi/energy/useEnergyCore';

const OVERVIEW = 'Hub Sostenibilità e Consumi';

beforeEach(() => window.history.replaceState({}, '', '/consumi'));
afterEach(cleanup);

const energy = (): EnergyPageContext => ({
  callApi: vi.fn().mockResolvedValue({
    configured: false,
    load_error: false,
    available: false,
    profile_revision: 0,
    observed_at: '',
    modules: {},
    absent_modules: ['grid', 'solar', 'home', 'battery', 'wallbox'],
    offline_modules: [],
    home_consumption: null,
  }),
  mode: 'real',
  connected: true,
  canManage: true,
  haStates: {},
});

describe('Consumption navigation', () => {
  it('opens the Energy subpage on its canonical route and returns to the overview', async () => {
    render(<ConsumptionDashboardPage embedded energy={energy()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Energia/ }));
    expect(window.location.pathname).toBe('/consumi/energia');
    expect(screen.getByRole('heading', { name: 'Dettaglio Energia' })).not.toBeNull();
    expect(await screen.findByText('Configura Domus Energy')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Torna a Consumi' }));
    expect(window.location.pathname).toBe('/consumi');
    expect(screen.getByRole('heading', { name: OVERVIEW })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Acqua/ }));
    expect(window.location.pathname).toBe('/consumi/acqua');
    expect(screen.getByRole('heading', { name: 'Dettaglio Acqua' })).not.toBeNull();
  });

  it('follows browser history between the overview and the Energy subpage', () => {
    window.history.replaceState({}, '', '/consumi/energia');
    render(<ConsumptionDashboardPage embedded energy={energy()} />);
    expect(screen.getByRole('heading', { name: 'Dettaglio Energia' })).not.toBeNull();

    act(() => {
      window.history.pushState({}, '', '/consumi/gas');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('heading', { name: 'Dettaglio Gas' })).not.toBeNull();

    act(() => {
      window.history.pushState({}, '', '/consumi');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('heading', { name: OVERVIEW })).not.toBeNull();
  });
});
