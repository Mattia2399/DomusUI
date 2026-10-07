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

const quantity = (value: number, source: 'measured' | 'derived' = 'measured') => ({
  status: 'ok' as const,
  value,
  unit: 'W',
  source,
  entity_ids: [],
  reason: null,
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
    expect(screen.getByText('Anteprima dimostrativa.')).not.toBeNull();
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

  it('uses the same Energy Core snapshot in the overview and Energy detail', async () => {
    const callApi = vi.fn().mockResolvedValue({
      configured: true,
      load_error: false,
      available: true,
      profile_revision: 3,
      observed_at: '2026-10-02T08:00:00Z',
      modules: {
        grid: {
          status: 'online',
          complete: true,
          sign_convention: 'positive_import',
          quantities: {
            import_power: quantity(1200, 'derived'),
            export_power: quantity(0, 'derived'),
            net_power: quantity(1200),
          },
        },
      },
      absent_modules: ['solar', 'home', 'battery', 'wallbox'],
      offline_modules: [],
      home_consumption: quantity(1200, 'derived'),
    });
    render(<ConsumptionDashboardPage embedded energy={{ ...energy(), callApi }} />);

    const homeLabel = await screen.findByText('Potenza casa');
    expect(homeLabel.parentElement?.textContent).toContain('1,2 kW');
    expect(screen.queryByText(/rischio distacco/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Energia/ }));
    expect((await screen.findByRole('img', { name: /Flussi energetici/ })).getAttribute('aria-label')).toContain('Casa: 1,2 kW Derivato');
    // One realtime snapshot for both views; the Energy page also reads its history once.
    expect(callApi.mock.calls.map(([message]) => message.type)).toEqual(['domusos/energy/get_state', 'domusos/energy/get_history']);
  });
});
