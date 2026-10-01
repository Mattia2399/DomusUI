import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnergyQuantity, EnergyState } from '../../services/energyCoreClient';
import type { MockEntityStateMap } from '../../types/ha';
import { EnergiaDetail } from './EnergiaDetail';
import type { EnergyPageContext } from './energy/useEnergyCore';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const q = (value: number | null, overrides: Partial<EnergyQuantity> = {}): EnergyQuantity => ({
  status: value === null ? 'unavailable' : 'ok',
  value,
  unit: 'W',
  source: 'measured',
  entity_ids: [],
  reason: value === null ? 'state_unavailable' : null,
  ...overrides,
});

const energyState = (overrides: Partial<EnergyState> = {}): EnergyState => ({
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

const EMPTY = energyState({
  configured: false,
  available: false,
  profile_revision: 0,
  absent_modules: ['grid', 'solar', 'home', 'battery', 'wallbox'],
});

function context(callApi: EnergyPageContext['callApi'], overrides: Partial<EnergyPageContext> = {}): EnergyPageContext {
  return { callApi, mode: 'real', connected: true, canManage: true, haStates: {}, ...overrides };
}

function renderDetail(energy?: EnergyPageContext) {
  return render(<EnergiaDetail title="Dettaglio Energia" onBack={vi.fn()} energy={energy} />);
}

describe('Energy subpage', () => {
  it('asks for a Home Assistant connection instead of showing values', () => {
    renderDetail(context(vi.fn(), { connected: false }));

    expect(screen.getByText('Home Assistant non collegato')).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('labels the Demo snapshot and hides configuration', () => {
    const callApi = vi.fn();
    renderDetail(context(callApi, { mode: 'demo', connected: false }));

    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Fotovoltaico');
    expect(screen.getAllByText(/Dati dimostrativi/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Modifica impianto/ })).toBeNull();
    expect(callApi).not.toHaveBeenCalled();
  });

  it('introduces guided setup to administrators when no profile exists', async () => {
    renderDetail(context(vi.fn().mockResolvedValue(EMPTY)));

    expect(await screen.findByText('Configura Domus Energy')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Avvia rilevamento/ })).not.toBeNull();
  });

  it('never offers configuration to users without administrator rights', async () => {
    renderDetail(context(vi.fn().mockResolvedValue(EMPTY), { canManage: false }));

    expect(await screen.findByText(/Solo un amministratore/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /rilevamento/ })).toBeNull();
  });

  it('shows a grid-only home without solar, battery or wallbox', async () => {
    const state = energyState({
      modules: {
        grid: {
          status: 'online',
          complete: true,
          sign_convention: null,
          quantities: {
            import_power: q(900),
            export_power: q(0),
            net_power: q(900, { source: 'derived' }),
          },
        },
      },
      absent_modules: ['solar', 'home', 'battery', 'wallbox'],
      home_consumption: q(900, { source: 'derived' }),
    });
    renderDetail(context(vi.fn().mockResolvedValue(state)));

    const diagram = await screen.findByRole('img');
    expect(diagram.getAttribute('aria-label')).toContain('Rete: 900 W Prelievo');
    expect(diagram.getAttribute('aria-label')).not.toContain('Batteria');
    expect(screen.getByText('Non presenti: Fotovoltaico, Batteria, Wallbox')).not.toBeNull();
    const home = screen.getByText('Consumo della casa').closest('div') as HTMLElement;
    expect(within(home).getByText('Derivato')).not.toBeNull();
  });

  it('keeps an offline battery visible without inventing values', async () => {
    const state = energyState({
      modules: {
        solar: { status: 'online', complete: true, sign_convention: null, quantities: { production_power: q(2500) } },
        battery: {
          status: 'offline',
          complete: false,
          sign_convention: 'positive_discharge',
          quantities: { state_of_charge: q(null, { unit: '%' }), net_power: q(null) },
        },
      },
      offline_modules: ['battery'],
      home_consumption: q(null, { status: 'not_measured', reason: 'insufficient_data', source: null }),
    });
    renderDetail(context(vi.fn().mockResolvedValue(state)));

    expect((await screen.findByRole('img')).getAttribute('aria-label')).toContain('Batteria: offline');
    const panel = screen.getByRole('region', { name: 'Il tuo impianto' });
    const battery = within(panel).getByText('Batteria').closest('li') as HTMLElement;
    expect(within(battery).getByText('Offline')).not.toBeNull();
    expect(within(battery).getByText(/non forniscono dati/)).not.toBeNull();
    expect(within(battery).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(panel).getByText('Dati insufficienti')).not.toBeNull();
  });

  it('explains an outdated integration and retries on demand', async () => {
    const callApi = vi.fn().mockRejectedValueOnce({ code: 'unknown_command', message: 'Unknown command.' }).mockResolvedValue(EMPTY);
    renderDetail(context(callApi));

    expect(await screen.findByText(/Aggiorna l’integrazione Domus UI/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Riprova/ }));
    expect(await screen.findByText('Configura Domus Energy')).not.toBeNull();
  });

  it('refreshes the backend projection when a bound sensor changes', async () => {
    vi.useFakeTimers();
    const state = energyState({
      modules: {
        solar: {
          status: 'online',
          complete: true,
          sign_convention: null,
          quantities: { production_power: q(1000, { entity_ids: ['sensor.pv'] }) },
        },
      },
    });
    const callApi = vi.fn().mockResolvedValue(state);
    const haStates = (value: string) => ({ 'sensor.pv': { state: value } }) as MockEntityStateMap;
    const view = renderDetail(context(callApi, { haStates: haStates('1000') }));
    await act(async () => {});
    expect(callApi).toHaveBeenCalledTimes(1);

    view.rerender(<EnergiaDetail title="Dettaglio Energia" onBack={vi.fn()} energy={context(callApi, { haStates: haStates('1200') })} />);
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi).toHaveBeenLastCalledWith({ type: 'domusos/energy/get_state' }, { reportError: false, throwOnError: true });
  });
});
