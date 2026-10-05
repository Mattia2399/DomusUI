import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnergyCallApi, EnergyProfileModules, EnergyTariff } from '../../../services/energyCoreClient';
import EnergySettings from './EnergySettings';

afterEach(cleanup);

const GRID: EnergyProfileModules = { grid: { sensors: { import_power: 'sensor.grid_in', export_power: 'sensor.grid_out' } } };

function backend(modules: EnergyProfileModules = GRID, tariff: EnergyTariff | null = null) {
  const saves: Array<Record<string, unknown>> = [];
  let fail: unknown = null;
  const result = () => ({
    profile: { revision: saves.length + 1, updated_at: null, load_error: false, modules, tariff },
    module_status: { grid: modules.grid ? 'online' : 'absent', solar: 'absent', home: 'absent', battery: 'absent', wallbox: 'absent' },
  });
  const callApi = vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === 'domusos/energy/get_profile') return result();
    if (message.type === 'domusos/energy/discover') throw new Error('not needed');
    if (message.type === 'domusos/energy/save_profile') {
      saves.push(message);
      if (fail) {
        const error = fail;
        fail = null;
        throw error;
      }
      const profile = message.profile as { modules: EnergyProfileModules; tariff?: EnergyTariff | null };
      modules = profile.modules;
      if ('tariff' in profile) tariff = profile.tariff ?? null;
      return result();
    }
    throw new Error(`unexpected ${String(message.type)}`);
  }) as unknown as EnergyCallApi;
  return { callApi, saves, failNext: (error: unknown) => { fail = error; } };
}

function renderSettings(api: ReturnType<typeof backend>) {
  const onSaved = vi.fn();
  render(<EnergySettings callApi={api.callApi} haStates={{}} onRediscover={vi.fn()} onSaved={onSaved} />);
  return onSaved;
}

const field = (name: RegExp) => screen.getByRole('textbox', { name });

describe('Energy settings', () => {
  it('lists every module with its sensors or as not present', async () => {
    renderSettings(backend());
    const plant = await screen.findByRole('region', { name: 'Impianto' });

    expect(within(plant).getByText('sensor.grid_in, sensor.grid_out')).not.toBeNull();
    expect(within(plant).getAllByText('Non presente')).toHaveLength(4);
    expect(within(plant).getByRole('button', { name: 'Salva impianto' }).hasAttribute('disabled')).toBe(true);
  });

  it('saves a three-band tariff with decimal commas and keeps the saved modules', async () => {
    const api = backend();
    const onSaved = renderSettings(api);
    await screen.findByRole('region', { name: 'Tariffa e costi' });

    expect(screen.getByRole('button', { name: 'Salva tariffa' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(field(/^F1/), { target: { value: '0,31' } });
    fireEvent.change(field(/^F2/), { target: { value: '0,27' } });
    fireEvent.change(field(/^F3/), { target: { value: '0,22' } });
    fireEvent.change(field(/^IVA/), { target: { value: '10' } });
    fireEvent.change(field(/^Energia immessa/), { target: { value: '0,09' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva tariffa' }));

    expect(await screen.findByText('Tariffa salvata.')).not.toBeNull();
    expect(api.saves[0].profile).toEqual({
      modules: GRID,
      tariff: {
        scheme: 'three_band',
        prices: { f1: 0.31, f2: 0.27, f3: 0.22 },
        fixed_monthly: null,
        vat_percent: 10,
        export_price: 0.09,
      },
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('validates prices before saving and switches the band structure', async () => {
    renderSettings(backend());
    await screen.findByRole('region', { name: 'Tariffa e costi' });

    fireEvent.click(screen.getByRole('radio', { name: 'Bioraria' }));
    expect(field(/^F23/)).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: /^F3 /})).toBeNull();
    fireEvent.change(field(/^F1/), { target: { value: '12' } });
    fireEvent.change(field(/^F23/), { target: { value: '0,2' } });

    expect(screen.getByText('Tra 0 e 10')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Salva tariffa' }).hasAttribute('disabled')).toBe(true);
  });

  it('removes a tariff explicitly and keeps edits after a failed save', async () => {
    const api = backend(GRID, { scheme: 'single', prices: { single: 0.25 }, fixed_monthly: 8, vat_percent: null, export_price: null });
    renderSettings(api);
    await screen.findByRole('region', { name: 'Tariffa e costi' });

    expect((field(/^Prezzo unico/) as HTMLInputElement).value).toBe('0,25');
    api.failNext(new Error('Connessione Home Assistant non disponibile.'));
    fireEvent.change(field(/^Quota fissa/), { target: { value: '9,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva tariffa' }));
    expect(await screen.findByText(/Le modifiche restano qui/)).not.toBeNull();
    expect((field(/^Quota fissa/) as HTMLInputElement).value).toBe('9,5');

    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi tariffa' }));
    expect(await screen.findByText('Tariffa rimossa.')).not.toBeNull();
    expect(api.saves.at(-1)?.profile).toEqual({ modules: GRID, tariff: null });
  });

  it('saves plant changes without touching the stored tariff', async () => {
    const api = backend();
    renderSettings(api);
    const plant = await screen.findByRole('region', { name: 'Impianto' });

    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica Fotovoltaico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Configura Fotovoltaico' }));
    fireEvent.change(screen.getByLabelText('Produzione'), { target: { value: 'sensor.pv_power' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva impianto' }));

    expect(await screen.findByText('Impianto salvato.')).not.toBeNull();
    expect(api.saves[0].profile).toEqual({ modules: { ...GRID, solar: { sensors: { production_power: 'sensor.pv_power' } } } });
  });

  it('explains that an older integration cannot store the tariff', async () => {
    const api = backend();
    const legacy = vi.fn(async (message: Record<string, unknown>) => {
      const result = (await api.callApi(message)) as { profile: Record<string, unknown> };
      if (message.type !== 'domusos/energy/get_profile') return result;
      const { tariff: _dropped, ...profile } = result.profile;
      return { ...result, profile };
    }) as unknown as EnergyCallApi;
    render(<EnergySettings callApi={legacy} haStates={{}} onRediscover={vi.fn()} onSaved={vi.fn()} />);
    const group = await screen.findByRole('region', { name: 'Tariffa e costi' });

    expect(within(group).getByText(/non gestisce ancora la tariffa/)).not.toBeNull();
    expect(within(group).queryByRole('button', { name: 'Salva tariffa' })).toBeNull();
  });

  it('asks for the export price only when a grid is configured', async () => {
    renderSettings(backend({ solar: { sensors: { production_power: 'sensor.pv' } } }));
    await screen.findByRole('region', { name: 'Tariffa e costi' });

    expect(screen.queryByRole('textbox', { name: /^Energia immessa/ })).toBeNull();
  });
});
