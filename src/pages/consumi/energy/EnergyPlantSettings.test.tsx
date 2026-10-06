import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnergyCallApi, EnergyPlant, EnergyProfileModules, EnergyTariff } from '../../../services/energyCoreClient';
import EnergySettings from './EnergySettings';
import EnergySetupWizard from './EnergySetupWizard';

/* Settings of an Energy Profile v2 plant, against a backend that answers like the integration. */

afterEach(cleanup);

const TARIFF: EnergyTariff = { scheme: 'single', prices: { single: 0.25 }, fixed_monthly: null, vat_percent: null, export_price: null };
const PLANT: EnergyPlant = {
  solar: {
    devices: [
      { id: 'solar-1', name: 'Inverter Tetto', ha_device_id: 'aa11', power: { sensors: { production_power: 'sensor.inv1' } }, energy: { production_energy: ['sensor.inv1_energy'] } },
      { id: 'solar-2', name: 'Inverter Pergola', ha_device_id: 'bb22', power: { sensors: { production_power: 'sensor.inv2' } }, energy: { production_energy: ['sensor.inv2_energy'] } },
    ],
    total: { power: { sensors: { production_power: 'sensor.pv_total' } } },
  },
  battery: {
    devices: [{
      id: 'battery-1', name: 'Garage', ha_device_id: null, capacity: { nominal_kwh: 10, usable_kwh: 9.5 },
      power: { sensors: { state_of_charge: 'sensor.soc', net_power: 'sensor.bat' }, sign_convention: 'positive_charge' },
      energy: { charge_energy: ['sensor.bat_in'], discharge_energy: ['opower:battery_out'] },
    }],
  },
  wallbox: { devices: [{ id: 'wallbox-1', name: null, ha_device_id: null, power: { sensors: { charging_power: 'sensor.wb' } } }] },
};
const METERS = {
  'sensor.inv1_energy': { status: 'valid', reason: null, unit: 'kWh' },
  'sensor.inv2_energy': { status: 'pending', reason: 'awaiting_first_statistics', unit: 'kWh' },
  'sensor.bat_in': { status: 'incompatible', reason: 'incompatible_device_class', unit: 'W' },
  'opower:battery_out': { status: 'unknown', reason: 'not_found', unit: null },
};

type Options = { modules?: EnergyProfileModules; recorder?: 'available' | 'unavailable'; diverged?: boolean };

function backend({ modules, recorder = 'available', diverged = false }: Options = {}) {
  const saves: Array<Record<string, unknown>> = [];
  let plant: EnergyPlant = structuredClone(PLANT);
  let tariff: EnergyTariff | null = TARIFF;
  let revision = 7;
  let fail: unknown = null;
  const result = () => ({
    // A plant v1 cannot hold has no v1 view: the integration sends null, not an empty profile.
    profile: modules ? { revision, updated_at: null, load_error: false, modules, tariff } : null,
    profile_v2: { schema: 'domusos-energy-profile', version: 2, revision, updated_at: null, load_error: false, migrated_from: null, plant, tariff, retired_device_ids: [] },
    v1_compatible: Boolean(modules),
    runtime: { supported: true, reason: null, unsupported_modules: {} },
    legacy_v1: { valid: true, revision: 3, updated_at: null, diverged },
    module_status: { grid: 'absent', solar: 'online', home: 'absent', battery: 'online', wallbox: 'online' },
    energy_meters: {
      recorder,
      verification: recorder === 'available' ? 'complete' : 'incomplete',
      meters: Object.fromEntries(Object.entries(METERS).map(([id, info]) => [id, { statistic_id: id, source: 'recorder', has_sum: true, entity_id: id, long_term: true, ...info }])),
    },
  });
  const callApi = vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === 'domusos/energy/get_profile') return result();
    if (message.type === 'domusos/energy/discover') {
      // A discovery that would replace the whole plant: never applied.
      return { energy_dashboard: 'used', suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], unassigned: [], candidates: {}, v2: { devices: [], totals: [], meters: {}, ambiguous: [], suggested_plant: { grid: { devices: [] } }, verification: 'complete', recorder: 'available', profile: { configured: true, revision: 7 }, low_confidence: [] } };
    }
    if (message.type === 'domusos/energy/save_profile') {
      saves.push(structuredClone(message));
      if (fail) {
        const error = fail;
        fail = null;
        throw error;
      }
      const document = message.profile_v2 as { plant: EnergyPlant; tariff?: EnergyTariff | null };
      plant = document.plant;
      if ('tariff' in document) tariff = document.tariff ?? null;
      revision += 1;
      return result();
    }
    throw new Error(`unexpected ${String(message.type)}`);
  }) as unknown as EnergyCallApi;
  return { callApi, saves, failNext: (error: unknown) => { fail = error; } };
}

function renderSettings(api: ReturnType<typeof backend>, onRediscover = vi.fn()) {
  const onSaved = vi.fn();
  render(<EnergySettings callApi={api.callApi} haStates={{}} onRediscover={onRediscover} onSaved={onSaved} />);
  return onSaved;
}

const plantRegion = () => screen.findByRole('region', { name: 'Impianto' });

describe('Energy Profile v2 settings', () => {
  it('lists modules, devices, the total and each meter with its verification', async () => {
    renderSettings(backend());
    const plant = await plantRegion();
    const solar = within(plant).getByRole('region', { name: 'Fotovoltaico' });
    expect(within(solar).getByText('2 dispositivi')).not.toBeNull();
    expect(within(solar).getByText('Inverter Tetto')).not.toBeNull();
    expect(within(solar).getByText('Inverter Pergola')).not.toBeNull();
    expect(within(solar).getByText('sensor.pv_total')).not.toBeNull();
    expect(within(plant).getByRole('region', { name: 'Batteria' })).not.toBeNull();
    // An unnamed device keeps a readable label.
    expect(within(plant).getByText('Wallbox 1')).not.toBeNull();

    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica Garage' }));
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveProperty('value', 'Garage');
    expect(screen.getByRole('textbox', { name: 'Nominale (kWh)' })).toHaveProperty('value', '10');
    expect(screen.getByRole('textbox', { name: 'Utilizzabile (kWh)' })).toHaveProperty('value', '9.5');
    expect(screen.getByText(/Non compatibile · W · Non è un contatore di energia/)).not.toBeNull();
    expect(screen.getByText(/Non trovato · Né il Recorder/)).not.toBeNull();
    fireEvent.click(within(plant).getByRole('button', { name: 'Chiudi Garage' }));
    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica Inverter Pergola' }));
    expect(screen.getByText(/In attesa delle prime statistiche · kWh/)).not.toBeNull();
    // A configured meter shows no consumption: the history is not available yet.
    expect(screen.queryByText(/kWh oggi|kWh al mese/)).toBeNull();
  });

  it('saves a rename as the whole plant, keeping every other device, the total and the tariff', async () => {
    const api = backend();
    const onSaved = renderSettings(api);
    const plant = await plantRegion();
    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica Inverter Pergola' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Pergola sud' } });
    fireEvent.click(within(plant).getByRole('button', { name: 'Salva impianto' }));

    await screen.findByText('Impianto salvato.');
    expect(api.saves).toHaveLength(1);
    const expected = structuredClone(PLANT);
    expected.solar!.devices[1].name = 'Pergola sud';
    expect(api.saves[0]).toEqual({ type: 'domusos/energy/save_profile', profile_v2: { plant: expected }, expected_revision: 7 });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('asks before removing a device and saves nothing until confirmed', async () => {
    const api = backend();
    renderSettings(api);
    const plant = await plantRegion();
    fireEvent.click(within(plant).getByRole('button', { name: 'Rimuovi Wallbox 1' }));
    expect(within(plant).getByText('Verrà rimosso al salvataggio')).not.toBeNull();
    fireEvent.click(within(plant).getByRole('button', { name: 'Salva impianto' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Rimuovere un dispositivo?' });
    expect(within(dialog).getByText(/identificativi non potranno essere riutilizzati/)).not.toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    expect(api.saves).toHaveLength(0);

    fireEvent.click(within(plant).getByRole('button', { name: 'Salva impianto' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rimuovi e salva' }));
    await screen.findByText('Impianto salvato.');
    const saved = (api.saves[0].profile_v2 as { plant: EnergyPlant }).plant;
    expect(saved.wallbox).toBeUndefined();
    expect(saved.solar).toEqual(PLANT.solar);
    expect(saved.battery).toEqual(PLANT.battery);
  });

  it('keeps the edits and explains a revision conflict or a refused save', async () => {
    const api = backend();
    renderSettings(api);
    const plant = await plantRegion();
    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica Inverter Tetto' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Tetto est' } });
    api.failNext({ code: 'revision_conflict', message: 'Energy profile changed' });
    fireEvent.click(within(plant).getByRole('button', { name: 'Salva impianto' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/modificato altrove.*Le modifiche restano qui/);
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveProperty('value', 'Tetto est');
  });

  it('blocks a save the backend would refuse and blocks a total with one device', async () => {
    renderSettings(backend());
    const plant = await plantRegion();
    fireEvent.click(within(plant).getByRole('button', { name: 'Rimuovi Inverter Pergola' }));
    expect(within(plant).getByText('Con un sensore totale servono almeno due dispositivi.')).not.toBeNull();
    expect(within(plant).getByRole('button', { name: 'Salva impianto' }).hasAttribute('disabled')).toBe(true);
  });

  it('saves the tariff with the stored plant, not with unsaved edits', async () => {
    const api = backend();
    renderSettings(api);
    const plant = await plantRegion();
    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica Inverter Tetto' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Non ancora salvato' } });
    const tariff = screen.getByRole('region', { name: 'Tariffa e costi' });
    fireEvent.click(within(tariff).getByRole('button', { name: 'Rimuovi tariffa' }));

    await screen.findByText('Tariffa rimossa.');
    expect(api.saves[0]).toEqual({ type: 'domusos/energy/save_profile', profile_v2: { plant: PLANT, tariff: null }, expected_revision: 7 });
  });

  it('warns about a diverged v1 document and meters it cannot verify yet, and never applies the discovery', async () => {
    const api = backend({ recorder: 'unavailable', diverged: true });
    renderSettings(api);
    await plantRegion();
    expect(screen.getByText(/versione precedente di Domus UI ha modificato l’impianto/)).not.toBeNull();
    expect(screen.getByText(/Verifica dei contatori incompleta: il Recorder di Home Assistant non è attivo/)).not.toBeNull();
    await waitFor(() => expect(api.callApi).toHaveBeenCalledWith({ type: 'domusos/energy/discover' }, expect.anything()));
    expect(api.saves).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Rete' })).toBeNull();
  });

  it('edits or removes the total sensor and opens the guided setup for new devices', async () => {
    const api = backend();
    const onRediscover = vi.fn();
    renderSettings(api, onRediscover);
    const plant = await plantRegion();
    fireEvent.click(within(plant).getByRole('button', { name: 'Aggiungi dispositivi o nuovo rilevamento' }));
    expect(onRediscover).toHaveBeenCalledOnce();

    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica il sensore totale di Fotovoltaico' }));
    expect(screen.getByText(/non vengono sommati a esso/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi il sensore totale' }));
    fireEvent.click(within(plant).getByRole('button', { name: 'Salva impianto' }));
    await screen.findByText('Impianto salvato.');
    const saved = (api.saves[0].profile_v2 as { plant: EnergyPlant }).plant;
    expect(saved.solar).toEqual({ devices: PLANT.solar!.devices });
    expect(saved.battery).toEqual(PLANT.battery);
  });

  it('keeps the classic settings when v1 can hold the profile', async () => {
    renderSettings(backend({ modules: { wallbox: { sensors: { charging_power: 'sensor.wb' } } } }));
    const plant = await plantRegion();
    expect(within(plant).getAllByText('Non presente')).toHaveLength(4);
    expect(within(plant).getByRole('button', { name: 'Ripeti rilevamento' })).not.toBeNull();
  });
});

describe('Setup wizard on a v2 plant', () => {
  it('keeps every configured device and meter, never applies the suggested plant, and saves the whole plant', async () => {
    const api = backend();
    const onSaved = vi.fn();
    render(<EnergySetupWizard mode="rediscover" callApi={api.callApi} haStates={{}} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Avanti' }));
    const solar = screen.getByRole('region', { name: 'Fotovoltaico' });
    expect(within(solar).getByText('Inverter Tetto')).not.toBeNull();
    // The existing incompatible meter is shown, but it does not block: only new references are checked.
    fireEvent.click(within(screen.getByRole('region', { name: 'Wallbox' })).getByRole('button', { name: 'Aggiungi wallbox' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Potenza di ricarica' }), { target: { value: 'sensor.wb2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    expect(screen.queryByRole('region', { name: 'Da correggere' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = api.saves[0] as { profile_v2: { plant: EnergyPlant }; expected_revision: number };
    expect(saved.expected_revision).toBe(7);
    expect(saved.profile_v2).toEqual({ plant: {
      ...PLANT,
      wallbox: { devices: [...PLANT.wallbox!.devices, { id: 'wallbox-2', name: null, ha_device_id: null, power: { sensors: { charging_power: 'sensor.wb2' } } }] },
    } });
  });
});
