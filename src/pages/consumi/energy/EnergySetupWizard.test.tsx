import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EnergyCallApi,
  EnergyDiscovery,
  EnergyDiscoveryV2,
  EnergyModuleId,
  EnergyPlant,
  EnergyProfileModules,
  EnergyState,
  EnergyTariff,
} from '../../../services/energyCoreClient';
import type { MockEntityStateMap } from '../../../types/ha';
import { EnergiaDetail } from '../EnergiaDetail';
import EnergySetupWizard from './EnergySetupWizard';
import { modulesFromPlant } from './energyPlantDraft';

/* The setup wizard on the v2 draft, against integrations with and without Energy Profile v2. */

afterEach(cleanup);

const MODULE_IDS: EnergyModuleId[] = ['grid', 'solar', 'home', 'battery', 'wallbox'];
const TARIFF: EnergyTariff = { scheme: 'single', prices: { single: 0.25 }, fixed_monthly: null, vat_percent: null, export_price: null };

const A0_DISCOVERY: EnergyDiscovery = {
  energy_dashboard: 'used',
  suggested_profile: { modules: { solar: { sensors: { production_power: 'sensor.pv' } } } },
  proposals: {
    solar: { production_power: [{ entity_id: 'sensor.pv', confidence: 'high', score: 115, evidence: ['energy_dashboard'], sign_convention: null, requires: [] }] },
    grid: { net_power: [{ entity_id: 'sensor.meter', confidence: 'medium', score: 55, evidence: [], sign_convention: null, requires: ['sign_convention'] }] },
  },
  ambiguous: [{ module: 'battery', role: 'state_of_charge', entity_ids: ['sensor.storage_a', 'sensor.storage_b'], reason: 'multiple_candidates' }],
  requires_input: [{ module: 'grid', role: 'net_power', entity_id: 'sensor.meter', missing: ['sign_convention'] }],
  unassigned: [],
  candidates: {},
};

const EMPTY_V2: EnergyDiscoveryV2 = {
  profile: { configured: false, revision: 0 }, verification: 'complete', recorder: 'available',
  devices: [], totals: [], meters: {}, ambiguous: [], suggested_plant: null, low_confidence: [],
};

type Options = {
  /** Energy Profile v2 integration (default) or an older one storing v1 modules only. */
  v2?: boolean;
  plant?: EnergyPlant;
  modules?: EnergyProfileModules;
  retired?: string[];
  discovery?: EnergyDiscovery;
  noTariffSupport?: boolean;
  meters?: Record<string, { status: string; reason?: string | null; unit?: string | null }>;
  revision?: number;
};

function createBackend(options: Options = {}) {
  const v2 = options.v2 ?? true;
  const backend = {
    plant: options.plant ?? {},
    modules: options.modules ?? {},
    // A first setup has no tariff yet; a configured plant keeps its own.
    tariff: (options.plant || options.modules ? TARIFF : null) as EnergyTariff | null,
    revision: options.revision ?? 0,
    saves: [] as Array<Record<string, unknown>>,
    failNextSave: null as unknown,
    callApi: vi.fn(async (message: Record<string, unknown>) => {
      switch (message.type) {
        case 'domusos/energy/get_profile':
          return profileResult();
        case 'domusos/energy/discover':
          return options.discovery ?? A0_DISCOVERY;
        case 'domusos/energy/get_state':
          return state();
        case 'domusos/energy/save_profile': {
          backend.saves.push(structuredClone(message));
          if (backend.failNextSave) {
            const failure = backend.failNextSave;
            backend.failNextSave = null;
            throw failure;
          }
          if (message.expected_revision !== backend.revision) throw new Error('Energy profile changed [revision_conflict]');
          const document = (message.profile_v2 ?? message.profile) as { plant?: EnergyPlant; modules?: EnergyProfileModules; tariff?: EnergyTariff | null };
          if (v2) backend.plant = document.plant ?? {};
          else backend.modules = document.modules ?? {};
          if ('tariff' in document && !options.noTariffSupport) backend.tariff = document.tariff ?? null;
          backend.revision += 1;
          return profileResult();
        }
        default:
          throw new Error(`unexpected ${String(message.type)}`);
      }
    }) as unknown as EnergyCallApi,
  };
  const present = () => (v2 ? Object.keys(backend.plant) : Object.keys(backend.modules)) as EnergyModuleId[];
  const profileResult = () => {
    const status = Object.fromEntries(MODULE_IDS.map((id) => [id, present().includes(id) ? 'online' : 'absent']));
    if (!v2) {
      return {
        profile: { revision: backend.revision, updated_at: null, load_error: false, modules: backend.modules, ...(options.noTariffSupport ? {} : { tariff: backend.tariff }) },
        module_status: status,
      };
    }
    const v1 = modulesFromPlant(backend.plant);
    return {
      profile: v1 ? { revision: backend.revision, updated_at: null, load_error: false, modules: v1, tariff: backend.tariff } : null,
      profile_v2: {
        schema: 'domusos-energy-profile', version: 2, revision: backend.revision, updated_at: null, load_error: false,
        migrated_from: null, plant: backend.plant, tariff: backend.tariff, retired_device_ids: options.retired ?? [],
      },
      v1_compatible: Boolean(v1),
      runtime: { supported: true, reason: null, unsupported_modules: {} },
      legacy_v1: null,
      module_status: status,
      energy_meters: {
        recorder: 'available', verification: 'complete',
        meters: Object.fromEntries(Object.entries(options.meters ?? {}).map(([id, info]) => [id, { statistic_id: id, source: 'recorder', has_sum: true, entity_id: id, long_term: true, reason: null, unit: 'kWh', ...info }])),
      },
    };
  };
  const state = (): EnergyState => ({
    configured: present().length > 0,
    load_error: false,
    available: present().length > 0,
    profile_revision: backend.revision,
    observed_at: '2026-10-01T10:00:00+00:00',
    modules: Object.fromEntries(present().map((id) => [id, { status: 'online', complete: true, sign_convention: null, quantities: {} }])),
    absent_modules: MODULE_IDS.filter((id) => !present().includes(id)),
    offline_modules: [],
    home_consumption: null,
    tariff: null,
  });
  return backend;
}

type Backend = ReturnType<typeof createBackend>;

const KWH = { unit: 'kWh', rawAttributes: { device_class: 'energy', state_class: 'total_increasing', unit_of_measurement: 'kWh' } };
const W = { unit: 'W', rawAttributes: { device_class: 'power', state_class: 'measurement', unit_of_measurement: 'W' } };
const entity = (state: string, extra: { unit: string; rawAttributes: Record<string, unknown> }, name?: string) =>
  ({ state, ...extra, rawAttributes: { ...extra.rawAttributes, ...(name ? { friendly_name: name } : {}) } });

function renderWizard(backend: Backend, mode: 'setup' | 'edit' | 'rediscover' = 'setup', haStates: MockEntityStateMap = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<EnergySetupWizard mode={mode} callApi={backend.callApi} haStates={haStates} onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
const heading = (name: string) => screen.getByRole('heading', { name });
const save = () => fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));
const saveButton = () => screen.getByRole('button', { name: /Salva impianto/ });
const region = (name: string) => screen.getByRole('region', { name });
const confirmAll = () => within(region('Da confermare')).getAllByRole('checkbox').forEach((box) => fireEvent.click(box));

describe('First setup', () => {
  it('applies only the chosen proposals and asks for the sign convention (older integration)', async () => {
    const backend = createBackend({ v2: false });
    const { onSaved } = renderWizard(backend);

    const fresh = await screen.findByRole('region', { name: 'Nuovi dispositivi' });
    expect(within(fresh).getByText('sensor.pv')).not.toBeNull();
    expect(within(fresh).getByText(/da confermare il segno/)).not.toBeNull();
    // Ambiguities are listed, never decided by Domus.
    expect(within(region('Da decidere')).getByText(/Più sensori possibili: scegli tu quale usare/)).not.toBeNull();
    expect(screen.getByText(/salva un solo dispositivo per modulo/)).not.toBeNull();
    // Nothing is applied on its own.
    expect(screen.queryByRole('button', { name: 'Conferma impianto' })).toBeNull();
    fireEvent.click(within(fresh).getByRole('button', { name: /Aggiungi contatore di rete/ }));
    fireEvent.click(within(fresh).getByRole('button', { name: /Aggiungi inverter/ }));
    expect(within(fresh).getAllByRole('button', { name: /^Togli/ })).toHaveLength(2);
    next();

    expect(heading('Dispositivi')).not.toBeNull();
    const grid = region('Rete');
    expect(within(grid).getByText('Conferma il significato dei valori positivi.')).not.toBeNull();
    expect(saveButtonAbsent()).toBe(true);
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(grid).getByRole('button', { name: 'Modifica Rete 1' }));
    fireEvent.click(screen.getByLabelText('Valori positivi = prelievo dalla rete'));
    next();
    expect(heading('Tariffa')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salta per ora' }));

    expect(heading('Riepilogo')).not.toBeNull();
    expect(within(region('Modifiche')).getByText('Rete: aggiunto Rete 1')).not.toBeNull();
    expect(within(region('Modifiche')).getByText('Segno: Valori positivi = prelievo dalla rete')).not.toBeNull();
    expect(backend.saves).toEqual([]);
    save();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(backend.saves).toEqual([{
      type: 'domusos/energy/save_profile',
      profile: { modules: {
        grid: { sensors: { net_power: 'sensor.meter' }, sign_convention: 'positive_import' },
        solar: { sensors: { production_power: 'sensor.pv' } },
      } },
      expected_revision: 0,
    }]);
  });

  it('configures a plant by hand from the tiles, with a tariff', async () => {
    const backend = createBackend({ discovery: { ...A0_DISCOVERY, energy_dashboard: 'not_configured', suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], v2: EMPTY_V2 } });
    renderWizard(backend, 'setup', { 'sensor.wallbox_power': entity('0', W, 'Wallbox'), 'sensor.wb_kwh': entity('12', KWH, 'Wallbox energia') });
    expect(await screen.findByText('Nessun dispositivo riconosciuto automaticamente')).not.toBeNull();
    expect(screen.getByText(/Dashboard Energia di Home Assistant, Domus potrà proporli/)).not.toBeNull();
    next();

    fireEvent.click(screen.getByRole('radio', { name: 'Wallbox' }));
    // The tile adds the grid too; a device just added is dropped, not marked as removed.
    fireEvent.click(within(region('Rete')).getByRole('button', { name: 'Rimuovi Rete 1' }));
    expect(screen.queryByRole('region', { name: 'Rete' })).toBeNull();
    const wallbox = region('Wallbox');
    fireEvent.click(within(wallbox).getByRole('button', { name: 'Modifica Wallbox 1' }));
    // The picker offers the power sensor and never the energy meter for a power role.
    const power = screen.getByRole('combobox', { name: 'Potenza di ricarica' });
    fireEvent.focus(power);
    const options = screen.getByRole('listbox', { name: 'Sensori disponibili' });
    expect(within(options).getByText('Wallbox')).not.toBeNull();
    expect(within(options).queryByText('Wallbox energia')).toBeNull();
    fireEvent.mouseDown(within(options).getByText('Wallbox'));
    expect((power as HTMLInputElement).value).toBe('sensor.wallbox_power');
    fireEvent.change(screen.getByRole('combobox', { name: 'Energia di ricarica 1' }), { target: { value: 'sensor.wb_kwh' } });
    next();

    const tariff = screen.getByRole('group', { name: 'Tariffa' });
    fireEvent.click(within(tariff).getByRole('radio', { name: 'Monoraria' }));
    fireEvent.change(within(tariff).getByRole('textbox', { name: /^Prezzo unico/ }), { target: { value: '20' } });
    expect(screen.getByText('Correggi i prezzi evidenziati oppure salta questo passaggio.')).not.toBeNull();
    fireEvent.change(within(tariff).getByRole('textbox', { name: /^Prezzo unico/ }), { target: { value: '0,25' } });
    next();
    expect(screen.getByText('Monoraria · 0,25 €/kWh', { exact: false })).not.toBeNull();
    save();

    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    expect(backend.saves[0]).toEqual({
      type: 'domusos/energy/save_profile',
      profile_v2: {
        plant: { wallbox: { devices: [{ id: 'wallbox-1', name: null, ha_device_id: null, power: { sensors: { charging_power: 'sensor.wallbox_power' } }, energy: { charging_energy: ['sensor.wb_kwh'] } }] } },
        tariff: TARIFF,
      },
      expected_revision: 0,
    });
  });

  it('adds the reliable inverters of a v2 discovery in one step and leaves doubtful ones to the user', async () => {
    const inverter = (n: number, eligible: boolean): EnergyDiscoveryV2['devices'][number] => ({
      key: `solar:dev:inv${n}`, module: 'solar', status: 'new', device_id: `solar-${n}`, ha_device_id: `inv${n}`, name: `Inverter ${n}`,
      integration: 'huawei_solar', confidence: eligible ? 'high' : 'low', eligible,
      power: [{ role: 'production_power', entity_id: `sensor.inv${n}_power`, confidence: eligible ? 'high' : 'low', evidence: ['energy_dashboard_device'], sign_convention: null, requires: [] }],
    });
    const v2: EnergyDiscoveryV2 = {
      ...EMPTY_V2,
      devices: [
        inverter(1, true), inverter(2, true), inverter(3, true), inverter(4, false),
        { key: 'grid:dev:meter', module: 'grid', status: 'new', device_id: 'grid-1', ha_device_id: 'meter', name: 'Contatore', confidence: 'high', eligible: true,
          power: [{ role: 'net_power', entity_id: 'sensor.grid', confidence: 'high', evidence: ['energy_dashboard'], sign_convention: 'positive_import', requires: [] }] },
        { key: 'battery:dev:x', module: 'battery', status: 'conflict', device_id: null, name: 'Batteria doppia', confidence: 'medium', eligible: false },
      ],
      totals: [{ module: 'solar', kind: 'power', role: 'production_power', ids: ['sensor.pv_sum'], status: 'presumed', covers: [], evidence: [] }],
      ambiguous: [{ module: 'solar', role: 'production_energy', entity_ids: ['sensor.pv_total_kwh', 'sensor.pv_f1'], reason: 'total_or_bands' }],
    };
    const backend = createBackend({ discovery: { ...A0_DISCOVERY, ambiguous: [], requires_input: [], v2 } });
    renderWizard(backend);

    const fresh = await screen.findByRole('region', { name: 'Nuovi dispositivi' });
    expect(within(fresh).getByText(/Fotovoltaico · huawei_solar · confidenza bassa/)).not.toBeNull();
    expect(within(region('Da decidere')).getByText(/Contatore complessivo o contatori per fascia/)).not.toBeNull();
    expect(within(region('Da decidere')).getByText(/Batteria doppia corrisponde a più dispositivi configurati/)).not.toBeNull();
    expect(within(region('Sensori totali')).getByText(/non è verificato/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi i 4 dispositivi affidabili' }));
    expect(screen.getByRole('button', { name: 'Aggiungi Inverter 4' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Usa comunque come totale' }));
    next();

    // The grid convention comes from the Energy dashboard; the other devices keep their own sensors.
    const solar = region('Fotovoltaico');
    expect(within(solar).getAllByRole('button', { name: /^Modifica Inverter/ })).toHaveLength(3);
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Salta per ora' }));
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    const saved = backend.saves[0] as { profile_v2: { plant: EnergyPlant } };
    expect(saved.profile_v2).not.toHaveProperty('tariff');
    expect(saved.profile_v2.plant.grid?.devices[0].power).toEqual({ sensors: { net_power: 'sensor.grid' }, sign_convention: 'positive_import' });
    expect(saved.profile_v2.plant.solar?.devices.map((device) => [device.id, device.name, device.power?.sensors.production_power])).toEqual([
      ['solar-1', 'Inverter 1', 'sensor.inv1_power'], ['solar-2', 'Inverter 2', 'sensor.inv2_power'], ['solar-3', 'Inverter 3', 'sensor.inv3_power'],
    ]);
    expect(saved.profile_v2.plant.solar?.total).toEqual({ power: { sensors: { production_power: 'sensor.pv_sum' } } });
    expect(saved.profile_v2.plant.battery).toBeUndefined();
  });

  it('leaves the tariff step out when the integration cannot store it', async () => {
    const backend = createBackend({ v2: false, noTariffSupport: true, discovery: { ...A0_DISCOVERY, requires_input: [] } });
    renderWizard(backend);
    fireEvent.click(await screen.findByRole('button', { name: /Aggiungi inverter/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma impianto' }));
    expect(heading('Riepilogo')).not.toBeNull();
    expect(screen.getByText(/Passaggio 3 di 3/)).not.toBeNull();
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    expect(backend.saves[0].profile).not.toHaveProperty('tariff');
  });
});

const PLANT_V2: EnergyPlant = {
  solar: { devices: [{ id: 'solar-1', name: 'Inverter Tetto', ha_device_id: 'aa11', power: { sensors: { production_power: 'sensor.inv1' } } }] },
  battery: { devices: [{ id: 'battery-1', name: 'Batteria Garage', ha_device_id: 'bb22', capacity: { nominal_kwh: 10, usable_kwh: 9.5 }, power: { sensors: { state_of_charge: 'sensor.soc', net_power: 'sensor.bat' }, sign_convention: 'positive_charge' } }] },
};

function rediscovery(): EnergyDiscovery {
  const v2: EnergyDiscoveryV2 = {
    ...EMPTY_V2,
    profile: { configured: true, revision: 6 },
    devices: [
      { key: 'solar:dev:aa11', module: 'solar', status: 'update', device_id: 'solar-1', name: 'Inverter Tetto', confidence: 'high', eligible: false,
        power: [{ role: 'production_power', entity_id: 'sensor.inv1', confidence: 'medium', evidence: ['energy_dashboard_device'], sign_convention: null, requires: [] }],
        energy: [{ role: 'production_energy', statistic_ids: ['sensor.inv1_energy'], confidence: 'high', evidence: ['energy_dashboard'], statuses: ['valid'] }],
        additions: [{ kind: 'energy', role: 'production_energy', ids: ['sensor.inv1_energy'] }], corrections: [], warnings: [] },
      { key: 'battery:dev:bb22', module: 'battery', status: 'update', device_id: 'battery-1', name: 'Batteria Garage', confidence: 'medium', eligible: false,
        additions: [], corrections: [{ kind: 'power', role: 'state_of_charge', configured: ['sensor.soc'], proposed: ['sensor.soc_alt'] }], warnings: [] },
      { key: 'solar:dev:cc33', module: 'solar', status: 'new', device_id: 'solar-2', ha_device_id: 'cc33', name: 'Inverter Pergola', integration: 'fronius', confidence: 'high', eligible: true,
        power: [{ role: 'production_power', entity_id: 'sensor.inv2', confidence: 'medium', evidence: ['energy_dashboard_device'], sign_convention: null, requires: [] }],
        energy: [{ role: 'production_energy', statistic_ids: ['sensor.inv2_energy'], confidence: 'high', evidence: ['energy_dashboard'], statuses: ['pending'] }], warnings: [] },
    ],
    meters: {
      'sensor.inv1_energy': { statistic_id: 'sensor.inv1_energy', status: 'valid', reason: null, source: 'recorder', unit: 'kWh', has_sum: true, entity_id: 'sensor.inv1_energy', long_term: true },
      'sensor.inv2_energy': { statistic_id: 'sensor.inv2_energy', status: 'pending', reason: 'awaiting_first_statistics', source: 'recorder', unit: 'kWh', has_sum: true, entity_id: 'sensor.inv2_energy', long_term: false },
    },
  };
  return { ...A0_DISCOVERY, suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], v2 };
}

describe('A configured plant', () => {
  it('opens a v1 plant as v2 without writing, and saves v2 only after confirmation', async () => {
    const plant = { solar: { devices: [{ id: 'solar-1', name: null, ha_device_id: null, power: { sensors: { production_power: 'sensor.inv1' } } }] } };
    const backend = createBackend({ plant, revision: 3, discovery: rediscovery() });
    renderWizard(backend, 'rediscover');
    fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi Inverter Pergola' }));
    expect(backend.saves).toEqual([]);
    next();
    next();

    expect(within(region('Modifiche')).getByText('Fotovoltaico: aggiunto Inverter Pergola')).not.toBeNull();
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    const saved = backend.saves[0] as { profile_v2: { plant: EnergyPlant }; expected_revision: number };
    expect(saved.expected_revision).toBe(3);
    // The converted device keeps its id and sensors; the tariff key is left out, so it is kept.
    expect(saved.profile_v2).toEqual({ plant: { solar: { devices: [
      plant.solar.devices[0],
      { id: 'solar-2', name: 'Inverter Pergola', ha_device_id: 'cc33', power: { sensors: { production_power: 'sensor.inv2' } }, energy: { production_energy: ['sensor.inv2_energy'] } },
    ] } } });
  });

  it('applies only the chosen changes to configured devices and never reuses a retired id', async () => {
    const backend = createBackend({ plant: PLANT_V2, revision: 6, retired: ['solar-2'], discovery: rediscovery() });
    renderWizard(backend, 'rediscover');
    const changes = await screen.findByRole('region', { name: 'Proposte per i dispositivi configurati' });
    expect(within(changes).getByText('Nuova sorgente')).not.toBeNull();
    expect(within(changes).getByText('Possibile correzione')).not.toBeNull();
    // The meter of the configured inverter, not the alternative battery sensor.
    fireEvent.click(within(within(changes).getByText(/sensor\.inv1_energy/).closest('li') as HTMLElement).getByRole('button', { name: 'Applica' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi Inverter Pergola' }));
    next();
    next();

    const summary = region('Modifiche');
    expect(within(summary).getByText('Energia prodotta: aggiunti sensor.inv1_energy')).not.toBeNull();
    expect(within(summary).queryByText(/sensor\.soc_alt/)).toBeNull();
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    const plant = (backend.saves[0] as { profile_v2: { plant: EnergyPlant } }).profile_v2.plant;
    expect(plant.battery).toEqual(PLANT_V2.battery);
    expect(plant.solar?.devices.map((device) => device.id)).toEqual(['solar-1', 'solar-3']);
    expect(plant.solar?.devices[0]).toEqual({ ...PLANT_V2.solar!.devices[0], energy: { production_energy: ['sensor.inv1_energy'] } });
  });

  it('blocks incompatible meters, asks to confirm unknown ones and summed parts', async () => {
    const backend = createBackend({ plant: { grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { net_power: 'sensor.grid' }, sign_convention: 'positive_import' } }] } }, revision: 2, discovery: rediscovery() });
    renderWizard(backend, 'edit', { 'sensor.grid_w': entity('100', W, 'Rete potenza'), 'sensor.f1': entity('1', KWH, 'F1'), 'sensor.f2': entity('2', KWH, 'F2'), 'sensor.f3': entity('3', KWH, 'F3') });
    await screen.findByRole('heading', { name: 'Dispositivi' });
    fireEvent.click(within(region('Rete')).getByRole('button', { name: 'Modifica Rete 1' }));

    // A power sensor as a meter is refused.
    const first = screen.getByRole('combobox', { name: 'Energia prelevata 1' });
    fireEvent.change(first, { target: { value: 'sensor.grid_w' } });
    expect(screen.getByText(/sensor\.grid_w: È una potenza/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(first, { target: { value: 'sensor.f1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi un contatore da sommare' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Energia prelevata 2' }), { target: { value: 'sensor.f2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi un contatore da sommare' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Energia prelevata 3' }), { target: { value: 'sensor.f3' } });
    expect(screen.getByText(/Questi 3 contatori verranno sommati/)).not.toBeNull();
    // An external statistic is accepted by hand, but not as verified.
    fireEvent.change(screen.getByRole('combobox', { name: 'Energia immessa 1' }), { target: { value: 'opower:grid_export' } });
    next();

    const confirm = region('Da confermare');
    expect(within(confirm).getByText(/opower:grid_export non è verificato da Home Assistant/)).not.toBeNull();
    expect(within(confirm).getByText(/questi 3 contatori verranno sommati \(sensor\.f1, sensor\.f2, sensor\.f3\)\. Verifica che rappresentino fasce differenti/)).not.toBeNull();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
    confirmAll();
    expect(saveButton().hasAttribute('disabled')).toBe(false);
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    const plant = (backend.saves[0] as { profile_v2: { plant: EnergyPlant } }).profile_v2.plant;
    expect(plant.grid?.devices[0].energy).toEqual({ import_energy: ['sensor.f1', 'sensor.f2', 'sensor.f3'], export_energy: ['opower:grid_export'] });
  });

  it('adds batteries and wallboxes, a total, and asks before removing a device', async () => {
    const backend = createBackend({ plant: PLANT_V2, revision: 6, discovery: { ...A0_DISCOVERY, suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], v2: EMPTY_V2 } });
    renderWizard(backend, 'edit', {
      'sensor.soc2': entity('40', { unit: '%', rawAttributes: { device_class: 'battery', unit_of_measurement: '%' } }, 'Batteria 2'),
      'sensor.bat2': entity('300', W), 'sensor.inv1': entity('1', W), 'sensor.inv9': entity('1', W), 'sensor.pv_total': entity('2', W),
      'sensor.wb1': entity('0', W), 'sensor.wb2': entity('0', W),
    });
    await screen.findByRole('heading', { name: 'Dispositivi' });

    fireEvent.click(within(region('Batteria')).getByRole('button', { name: 'Aggiungi batteria' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Stato di carica' }), { target: { value: 'sensor.soc2' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Un sensore con segno' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Potenza netta (con segno)' }), { target: { value: 'sensor.bat2' } });
    // A signed battery needs its convention: never guessed from the current value.
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByLabelText('Valori positivi = scarica verso la casa'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nominale (kWh)' }), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Wallbox' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Potenza di ricarica' }), { target: { value: 'sensor.wb1' } });
    fireEvent.click(within(region('Wallbox')).getByRole('button', { name: 'Aggiungi wallbox' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Potenza di ricarica' }), { target: { value: 'sensor.wb2' } });

    fireEvent.click(within(region('Fotovoltaico')).getByRole('button', { name: 'Aggiungi inverter' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Produzione' }), { target: { value: 'sensor.inv9' } });
    fireEvent.click(within(region('Fotovoltaico')).getByRole('button', { name: 'Aggiungi un sensore totale' }));
    expect(screen.getByText(/non vengono sommati a esso/)).not.toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Produzione' }), { target: { value: 'sensor.pv_total' } });
    // Removing an inverter would leave the total with one device: not saveable.
    fireEvent.click(within(region('Fotovoltaico')).getByRole('button', { name: 'Rimuovi Inverter Tetto' }));
    expect(within(region('Fotovoltaico')).getByText('Con un sensore totale servono almeno due dispositivi.')).not.toBeNull();
    fireEvent.click(within(region('Fotovoltaico')).getByRole('button', { name: 'Ripristina Inverter Tetto' }));
    fireEvent.click(within(region('Batteria')).getByRole('button', { name: 'Rimuovi Batteria Garage' }));
    next();

    expect(within(region('Da confermare')).getByText(/Batteria Garage verrà rimosso\. Il suo identificativo non potrà essere riutilizzato/)).not.toBeNull();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
    confirmAll();
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    const plant = (backend.saves[0] as { profile_v2: { plant: EnergyPlant } }).profile_v2.plant;
    expect(plant.battery?.devices).toEqual([{
      id: 'battery-2', name: null, ha_device_id: null, capacity: { nominal_kwh: 5, usable_kwh: null },
      power: { sensors: { state_of_charge: 'sensor.soc2', net_power: 'sensor.bat2' }, sign_convention: 'positive_discharge' },
    }]);
    expect(plant.wallbox?.devices.map((device) => device.power?.sensors.charging_power)).toEqual(['sensor.wb1', 'sensor.wb2']);
    expect(plant.solar?.total).toEqual({ power: { sensors: { production_power: 'sensor.pv_total' } } });
    expect(plant.solar?.devices.map((device) => device.id)).toEqual(['solar-1', 'solar-2']);
  });

  it('keeps the draft on a revision conflict and lets the user reload instead of overwriting', async () => {
    const backend = createBackend({ plant: PLANT_V2, revision: 6, discovery: rediscovery() });
    const { onSaved } = renderWizard(backend, 'rediscover');
    fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi Inverter Pergola' }));
    next();
    next();
    // Another failure first: no reload offered, the draft stays.
    backend.failNextSave = new Error('Admin required [unauthorized]');
    save();
    expect(await screen.findByText(/amministrator/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Carica la versione salvata/ })).toBeNull();
    backend.revision = 7;
    save();

    expect(await screen.findByText(/modificato altrove.*Le modifiche non salvate restano qui/)).not.toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(within(region('Modifiche')).getByText('Fotovoltaico: aggiunto Inverter Pergola')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Carica la versione salvata/ }));
    expect(await screen.findByRole('button', { name: 'Aggiungi Inverter Pergola' })).not.toBeNull();
    expect(backend.saves).toHaveLength(2);
  });

  it('keeps the meters of a Recorder still starting, as not verified yet', async () => {
    const discovery = rediscovery();
    discovery.v2 = {
      ...discovery.v2!,
      verification: 'incomplete',
      meters: { ...discovery.v2!.meters, 'sensor.inv2_energy': { ...discovery.v2!.meters['sensor.inv2_energy'], status: 'recorder_unavailable', reason: 'recorder_starting' } },
    };
    const backend = createBackend({ plant: PLANT_V2, revision: 6, discovery });
    renderWizard(backend, 'rediscover');
    expect(await screen.findByText(/Verifica dei contatori incompleta/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi Inverter Pergola' }));
    next();
    next();
    expect(within(region('Da confermare')).getByText(/sensor\.inv2_energy non è verificato/)).not.toBeNull();
    confirmAll();
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
  });
});

describe('Energy setup layout', () => {
  it('closes from its own header or with Escape, without saving', async () => {
    const backend = createBackend({ plant: PLANT_V2, revision: 6 });
    const { onClose } = renderWizard(backend, 'edit');
    expect(await screen.findByText(/Passaggio 2 di 3/)).not.toBeNull();

    fireEvent.keyDown(heading('Dispositivi'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi configurazione' }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(backend.saves).toEqual([]);
  });

  it('keeps unsaved changes after a network error and saves on retry', async () => {
    const backend = createBackend({ v2: false, modules: { solar: { sensors: { production_power: 'sensor.pv' } } }, revision: 1 });
    backend.failNextSave = new Error('Connessione Home Assistant non disponibile.');
    const { onSaved } = renderWizard(backend, 'edit');
    await screen.findByRole('heading', { name: 'Dispositivi' });
    fireEvent.click(screen.getByRole('button', { name: 'Casa' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Consumo' }), { target: { value: 'sensor.house' } });
    next();
    save();

    expect(await screen.findByText(/Home Assistant non risponde.*Le modifiche non salvate restano qui/)).not.toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    save();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(backend.modules.home).toEqual({ sensors: { consumption_power: 'sensor.house' } });
  });
});

function saveButtonAbsent() {
  return screen.queryByRole('button', { name: /Salva impianto/ }) === null;
}

describe('Energy page lifecycle', () => {
  it('moves from no profile to a configured home and back without reloading', async () => {
    const backend = createBackend({ v2: false, discovery: { ...A0_DISCOVERY, requires_input: [] } });
    render(
      <EnergiaDetail
        title="Dettaglio Energia"
        onBack={vi.fn()}
        energy={{ callApi: backend.callApi, mode: 'real', connected: true, canManage: true, haStates: {} }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Avvia rilevamento/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Aggiungi inverter/ }));
    // The wizard replaces the page header instead of nesting under it.
    expect(screen.queryByRole('heading', { name: 'Dettaglio Energia' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Conferma impianto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salta per ora' }));
    save();

    expect(await screen.findByText(/Impianto salvato/)).not.toBeNull();
    expect(await screen.findByRole('list', { name: 'Componenti dell’impianto' })).not.toBeNull();

    // Everyday changes go through the classic settings page.
    fireEvent.click(screen.getByRole('button', { name: 'Impostazioni energia' }));
    const plant = await screen.findByRole('region', { name: 'Impianto' });
    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica Fotovoltaico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Fotovoltaico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva impianto' }));
    expect(await screen.findByText('Impianto salvato.')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Torna a Consumi' }));

    expect(await screen.findByText('Configura Domus Energy')).not.toBeNull();
    expect(backend.saves.map((entry) => Object.keys((entry.profile as { modules: object }).modules))).toEqual([['solar'], []]);
  });
});
