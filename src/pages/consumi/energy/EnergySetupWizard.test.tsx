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

/* The guided setup on the v2 draft, against integrations with and without Energy Profile v2. */

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

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const next = (name = 'Avanti') => click(name);
/** The step title in the wizard header. */
const step = (name: string) => screen.getByRole('heading', { level: 2, name });
const save = () => click(/Salva impianto/);
const saveButton = () => screen.getByRole('button', { name: /Salva impianto/ });
const region = (name: string) => screen.getByRole('region', { name });
const group = (name: string) => screen.getByRole('group', { name });
const devicesOf = (module: string) => screen.getByRole('list', { name: `Dispositivi: ${module}` });
const start = async () => {
  await screen.findByRole('button', { name: 'Iniziamo' });
  next('Iniziamo');
};

describe('First setup', () => {
  it('walks through welcome, plant, detection and each component, applying only what is chosen (older integration)', async () => {
    const backend = createBackend({ v2: false });
    const { onSaved } = renderWizard(backend);

    expect(await screen.findByRole('heading', { name: 'Configuriamo Domus Energy' })).not.toBeNull();
    expect(screen.getByText('Configura Domus Energy · Passaggio 1 di 7', { exact: false })).not.toBeNull();
    next('Iniziamo');

    // Discovery preselects what it found; the user can change it.
    expect(step('Il tuo impianto')).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Fotovoltaico' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Batteria' }).getAttribute('aria-checked')).toBe('false');
    next();

    expect(step('Rilevamento automatico')).not.toBeNull();
    const results = screen.getByRole('list', { name: 'Risultato del rilevamento' });
    expect(within(results).getByText('1 contatore trovato, da verificare')).not.toBeNull();
    expect(within(results).getByText('1 inverter trovato')).not.toBeNull();
    // Battery ambiguity: offered, never decided.
    expect(screen.getByText('Domus ha trovato anche: batteria.')).not.toBeNull();
    expect(screen.getByText(/salva un solo dispositivo per modulo/)).not.toBeNull();
    next('Usa i dispositivi trovati');

    // The grid meter needs a decision: it stays a suggestion until added.
    expect(step('Rete elettrica')).not.toBeNull();
    expect(screen.queryByRole('list', { name: 'Dispositivi: Rete' })).toBeNull();
    click('Aggiungi contatore');
    expect(within(devicesOf('Rete')).getByText('Da completare')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    click('Modifica Rete 1');
    // No name for an integration that cannot store it, and the sign as a plain question.
    expect(screen.queryByRole('textbox', { name: 'Nome' })).toBeNull();
    expect(screen.getByText('Quando stai acquistando energia dalla rete, il numero è:')).not.toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Positivo quando prelevo dalla rete' }));
    next();

    expect(step('Fotovoltaico')).not.toBeNull();
    expect(within(devicesOf('Fotovoltaico')).getByText('Pronto')).not.toBeNull();
    next();
    expect(step('Tariffa')).not.toBeNull();
    next('Salta per ora');

    expect(step('Controllo finale')).not.toBeNull();
    expect(within(group('Il tuo impianto')).getByText('Rete')).not.toBeNull();
    expect(backend.saves).toEqual([]);
    save();
    expect(await screen.findByRole('heading', { name: 'Domus Energy è pronto' })).not.toBeNull();
    expect(screen.getByText('Monitoraggio in tempo reale pronto. Lo storico potrà essere configurato in seguito.')).not.toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    next('Vai a Domus Energy');
    expect(onSaved).toHaveBeenCalledOnce();
    expect(backend.saves).toEqual([{
      type: 'domusos/energy/save_profile',
      profile: { modules: {
        grid: { sensors: { net_power: 'sensor.meter' }, sign_convention: 'positive_import' },
        solar: { sensors: { production_power: 'sensor.pv' } },
      } },
      expected_revision: 0,
    }]);
  });

  it('builds a plant by hand: components, the sensor picker, history meters and a tariff', async () => {
    const backend = createBackend({ discovery: { ...A0_DISCOVERY, energy_dashboard: 'not_configured', suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], v2: EMPTY_V2 } });
    renderWizard(backend, 'setup', {
      'sensor.wallbox_power': entity('0', W, 'Wallbox'),
      'sensor.wb_kwh': entity('12', KWH, 'Wallbox energia'),
    });
    await start();
    expect(screen.getByRole('checkbox', { name: 'Solo rete' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wallbox' }));
    expect(screen.getByRole('checkbox', { name: 'Solo rete' }).getAttribute('aria-checked')).toBe('false');
    next();
    expect(screen.getByRole('heading', { name: 'Nessun dispositivo riconosciuto automaticamente' })).not.toBeNull();
    expect(screen.getByText(/Dashboard Energia di Home Assistant, Domus potrà proporli/)).not.toBeNull();
    next();

    // A first device opens on its own; this home has no grid meter in Home Assistant.
    expect(step('Rete elettrica')).not.toBeNull();
    click('Rimuovi Rete 1');
    expect(screen.getByText('Senza dispositivi, questo componente non verrà configurato.')).not.toBeNull();
    next();

    expect(step('Wallbox')).not.toBeNull();
    const power = screen.getByRole('combobox', { name: 'Potenza di ricarica' });
    fireEvent.focus(power);
    const options = screen.getByRole('listbox', { name: 'Sensori disponibili' });
    // A power role never offers an energy meter.
    expect(within(options).queryByText('Wallbox energia')).toBeNull();
    fireEvent.mouseDown(within(options).getByText('Wallbox'));
    expect(screen.queryByRole('combobox', { name: 'Potenza di ricarica' })).toBeNull();
    expect(screen.getByText('✓ Compatibile')).not.toBeNull();
    next();

    expect(step('Storico dei consumi')).not.toBeNull();
    expect(screen.getByText('Non abbiamo trovato un contatore energetico.')).not.toBeNull();
    click('Scegli un contatore: Energia per l’auto');
    fireEvent.change(screen.getByRole('combobox', { name: 'Energia per l’auto 1' }), { target: { value: 'sensor.wb_kwh' } });
    click('Fatto: Energia per l’auto');
    expect(within(group('Energia per l’auto')).getByText('Contatore trovato')).not.toBeNull();
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

  it('adds the reliable inverters at once and leaves doubtful ones, totals and ambiguities to the user', async () => {
    const inverter = (n: number, eligible: boolean): EnergyDiscoveryV2['devices'][number] => ({
      key: `solar:dev:inv${n}`, module: 'solar', status: 'new', device_id: `solar-${n}`, ha_device_id: `inv${n}`, name: `Inverter ${n}`,
      integration: 'huawei_solar', confidence: eligible ? 'high' : 'medium', eligible,
      power: [{ role: 'production_power', entity_id: `sensor.inv${n}_power`, confidence: eligible ? 'high' : 'medium', evidence: ['energy_dashboard_device'], sign_convention: null, requires: [] }],
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
    await start();
    next();

    const results = screen.getByRole('list', { name: 'Risultato del rilevamento' });
    expect(within(results).getByText('4 inverter trovati, 1 da verificare')).not.toBeNull();
    expect(screen.getByText('Domus ha trovato anche: batteria.')).not.toBeNull();
    // Technical names are there for experts, in closed details.
    const solarResult = within(results).getAllByRole('listitem').find((item) => item.textContent?.includes('Fotovoltaico'))!;
    const details = within(solarResult).getByText('Dettagli tecnici').closest('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getByText(/Inverter 1 · Rilevato automaticamente · huawei_solar · sensor\.inv1_power/)).not.toBeNull();
    next('Usa i dispositivi trovati');

    expect(step('Rete elettrica')).not.toBeNull();
    next();
    expect(within(devicesOf('Fotovoltaico')).getAllByRole('listitem')).toHaveLength(3);
    expect(within(region('Da decidere')).getByText(/Contatore complessivo o contatori per fascia/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Aggiungi Inverter 4' })).not.toBeNull();
    click('Usa comunque come totale');
    next();
    expect(step('Storico dei consumi')).not.toBeNull();
    next('Continua senza storico');
    next('Salta per ora');
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

  it('adapts its steps to the plant and leaves out a tariff the integration cannot store', async () => {
    const backend = createBackend({ v2: false, noTariffSupport: true, discovery: { ...A0_DISCOVERY, requires_input: [], ambiguous: [] } });
    renderWizard(backend);
    await start();
    // Welcome, plant, detection, grid, photovoltaic, final check: no history (v1) and no tariff.
    expect(screen.getByText(/Passaggio 2 di 6/)).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Batteria' }));
    expect(screen.getByText(/Passaggio 2 di 7/)).not.toBeNull();
    // "Solo rete" takes the other components out again.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo rete' }));
    expect(screen.getByRole('checkbox', { name: 'Fotovoltaico' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/Passaggio 2 di 5/)).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fotovoltaico' }));
    next();
    next('Usa i dispositivi trovati');
    expect(step('Rete elettrica')).not.toBeNull();
    // Unchecking a component drops only what this setup added to it.
    next('Indietro');
    next('Indietro');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fotovoltaico' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fotovoltaico' }));
    next();
    next('Usa i dispositivi trovati');
    click('Rimuovi Rete 1');
    next();
    expect(step('Fotovoltaico')).not.toBeNull();
    expect(within(devicesOf('Fotovoltaico')).getAllByRole('listitem')).toHaveLength(1);
    next();
    expect(step('Controllo finale')).not.toBeNull();
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

/** From the plant step of a rediscovery to the final check, using what was found. */
async function throughRediscovery() {
  expect(await screen.findByRole('heading', { level: 2, name: 'Il tuo impianto' })).not.toBeNull();
  next();
  next('Usa i dispositivi trovati');
}

describe('A configured plant', () => {
  it('opens a v1 plant as v2 without writing, and saves v2 only after confirmation', async () => {
    const plant = { solar: { devices: [{ id: 'solar-1', name: null, ha_device_id: null, power: { sensors: { production_power: 'sensor.inv1' } } }] } };
    const backend = createBackend({ plant, revision: 3, discovery: rediscovery() });
    renderWizard(backend, 'rediscover');
    await throughRediscovery();
    expect(backend.saves).toEqual([]);
    expect(step('Fotovoltaico')).not.toBeNull();
    expect(within(devicesOf('Fotovoltaico')).getByText('Nuovo')).not.toBeNull();
    next();
    next();
    // A battery never configured is not invented by the update of a configured one.
    expect(step('Controllo finale')).not.toBeNull();
    fireEvent.click(screen.getByText('Mostra riepilogo tecnico'));
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
    await throughRediscovery();
    expect(step('Fotovoltaico')).not.toBeNull();
    next();
    // The battery correction is offered on its card, not applied.
    expect(step('Batteria')).not.toBeNull();
    const suggestions = screen.getByRole('list', { name: 'Suggerimenti per Batteria Garage' });
    expect(within(suggestions).getByText('Possibile correzione')).not.toBeNull();
    next();

    expect(step('Storico dei consumi')).not.toBeNull();
    const produced = screen.getAllByRole('group', { name: 'Produzione fotovoltaica' })[0];
    expect(within(produced).getByText(/Domus ha trovato un contatore: sensor\.inv1_energy/)).not.toBeNull();
    fireEvent.click(within(produced).getByRole('button', { name: 'Usa questo contatore' }));
    next();

    fireEvent.click(screen.getByText('Mostra riepilogo tecnico'));
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

  it('blocks incompatible meters, asks to confirm unknown ones and summed bands where the meters are chosen', async () => {
    const backend = createBackend({ plant: { grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { net_power: 'sensor.grid' }, sign_convention: 'positive_import' } }] } }, revision: 2, discovery: rediscovery() });
    renderWizard(backend, 'edit', { 'sensor.grid_w': entity('100', W, 'Rete potenza'), 'sensor.f1': entity('1', KWH, 'Prelievo F1'), 'sensor.f2': entity('2', KWH, 'Prelievo F2'), 'sensor.f3': entity('3', KWH, 'Prelievo F3') });
    expect(await screen.findByRole('heading', { level: 2, name: 'Rete elettrica' })).not.toBeNull();
    next();

    expect(step('Storico dei consumi')).not.toBeNull();
    click('Scegli un contatore: Energia acquistata');
    const first = screen.getByRole('combobox', { name: 'Energia acquistata 1' });
    // A power sensor as a meter is refused.
    fireEvent.change(first, { target: { value: 'sensor.grid_w' } });
    expect(screen.getByText(/sensor\.grid_w: È una potenza/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(first, { target: { value: 'sensor.f1' } });
    click('Aggiungi un contatore da sommare');
    fireEvent.change(screen.getByRole('combobox', { name: 'Energia acquistata 2' }), { target: { value: 'sensor.f2' } });
    click('Aggiungi un contatore da sommare');
    fireEvent.change(screen.getByRole('combobox', { name: 'Energia acquistata 3' }), { target: { value: 'sensor.f3' } });
    click('Fatto: Energia acquistata');
    const bought = group('Energia acquistata');
    expect(within(bought).getByText('Domus sommerà queste tre fasce per ottenere il totale.')).not.toBeNull();
    expect(within(screen.getByRole('list', { name: 'Parti di Energia acquistata' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['✓F1', '✓F2', '✓F3']);
    expect(within(bought).getByText('Verifica che rappresentino fasce differenti e non includano già un totale.')).not.toBeNull();
    // An external statistic is accepted by hand, but not as verified.
    click('Scegli un contatore: Energia venduta');
    fireEvent.change(screen.getByRole('combobox', { name: 'Energia venduta 1' }), { target: { value: 'opower:grid_export' } });
    click('Fatto: Energia venduta');
    expect(within(group('Energia venduta')).getByText('Non siamo riusciti a verificarlo')).not.toBeNull();
    fireEvent.click(within(bought).getByRole('button', { name: 'Conferma' }));
    next();

    const confirm = region('Da confermare');
    const boxes = within(confirm).getAllByRole('checkbox') as HTMLInputElement[];
    // The bands were confirmed next to the meters; the unverified statistic is still open.
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
    expect(within(confirm).getByText(/Rete 1 · Energia venduta: opower:grid_export non è stato verificato/)).not.toBeNull();
    expect(within(confirm).getByText(/questi 3 contatori verranno sommati \(Prelievo F1, Prelievo F2, Prelievo F3\)\. Verifica che rappresentino fasce differenti/)).not.toBeNull();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
    fireEvent.click(boxes[1]);
    expect(saveButton().hasAttribute('disabled')).toBe(false);
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    const plant = (backend.saves[0] as { profile_v2: { plant: EnergyPlant } }).profile_v2.plant;
    expect(plant.grid?.devices[0].energy).toEqual({ import_energy: ['sensor.f1', 'sensor.f2', 'sensor.f3'], export_energy: ['opower:grid_export'] });
  });

  it('adds a battery with its sign and capacity, a total, and asks before removing a device', async () => {
    const backend = createBackend({ plant: PLANT_V2, revision: 6, discovery: { ...A0_DISCOVERY, suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], v2: EMPTY_V2 } });
    renderWizard(backend, 'edit', {
      'sensor.soc2': entity('40', { unit: '%', rawAttributes: { device_class: 'battery', unit_of_measurement: '%' } }, 'Batteria 2'),
      'sensor.bat2': entity('-300', W, 'Batteria 2 potenza'), 'sensor.inv1': entity('1', W), 'sensor.inv9': entity('1', W), 'sensor.pv_total': entity('2', W),
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'Fotovoltaico' })).not.toBeNull();

    click('Aggiungi un altro inverter');
    fireEvent.change(screen.getByRole('combobox', { name: 'Potenza fotovoltaico' }), { target: { value: 'sensor.inv9' } });
    // The total is an advanced choice.
    expect(screen.queryByRole('button', { name: 'Aggiungi un sensore totale' })).toBeNull();
    click('Configurazione avanzata per tutti i dispositivi');
    click('Aggiungi un sensore totale');
    expect(screen.getByText(/non vengono sommati a esso/)).not.toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Produzione' }), { target: { value: 'sensor.pv_total' } });
    click('Configurazione avanzata per tutti i dispositivi');
    // Removing an inverter would leave the total with one device: not saveable.
    click('Rimuovi Inverter Tetto');
    expect(screen.getByText('Con un sensore totale servono almeno due dispositivi.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    click('Ripristina Inverter Tetto');
    next();

    expect(step('Batteria')).not.toBeNull();
    click('Aggiungi un’altra batteria');
    fireEvent.click(screen.getByRole('radio', { name: /Un solo sensore/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Livello di carica' }), { target: { value: 'sensor.soc2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Potenza della batteria' }), { target: { value: 'sensor.bat2' } });
    click('Fatto: Potenza della batteria');
    // A signed battery needs its convention: never guessed from the current value.
    expect(screen.getByText('Adesso il sensore indica -300 W.')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Positivo quando si scarica' })).toHaveProperty('checked', false);
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Positivo quando si scarica' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Capacità nominale (kWh)' }), { target: { value: '5' } });
    click('Rimuovi Batteria Garage');
    next();
    next('Continua senza storico');

    expect(within(region('Da confermare')).getByText(/Batteria Garage verrà rimosso\. Il suo identificativo non potrà essere riutilizzato/)).not.toBeNull();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
    within(region('Da confermare')).getAllByRole('checkbox').forEach((box) => fireEvent.click(box));
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    const plant = (backend.saves[0] as { profile_v2: { plant: EnergyPlant } }).profile_v2.plant;
    expect(plant.battery?.devices).toEqual([{
      id: 'battery-2', name: null, ha_device_id: null, capacity: { nominal_kwh: 5, usable_kwh: null },
      power: { sensors: { state_of_charge: 'sensor.soc2', net_power: 'sensor.bat2' }, sign_convention: 'positive_discharge' },
    }]);
    expect(plant.solar?.total).toEqual({ power: { sensors: { production_power: 'sensor.pv_total' } } });
    expect(plant.solar?.devices.map((device) => device.id)).toEqual(['solar-1', 'solar-2']);
  });

  it('keeps the draft on a refused save and a revision conflict, and reloads only on request', async () => {
    const backend = createBackend({ plant: PLANT_V2, revision: 6, discovery: rediscovery() });
    const { onSaved } = renderWizard(backend, 'rediscover');
    await throughRediscovery();
    next();
    next();
    next();
    expect(step('Controllo finale')).not.toBeNull();
    backend.failNextSave = new Error('Admin required [unauthorized]');
    save();
    expect(await screen.findByText(/amministrator/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Carica la versione salvata/ })).toBeNull();
    backend.revision = 7;
    save();
    expect(await screen.findByText(/modificato altrove.*Le modifiche non salvate restano qui/)).not.toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(within(group('Il tuo impianto')).getByText('2 inverter')).not.toBeNull();
    click(/Carica la versione salvata/);
    expect(await screen.findByRole('heading', { level: 2, name: 'Il tuo impianto' })).not.toBeNull();
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
    await throughRediscovery();
    next();
    next();
    expect(step('Storico dei consumi')).not.toBeNull();
    expect(screen.getByText(/Home Assistant, che si sta ancora avviando/)).not.toBeNull();
    const pergola = screen.getAllByRole('group', { name: 'Produzione fotovoltaica' })[1];
    expect(within(pergola).getByText('Verifica temporaneamente non disponibile')).not.toBeNull();
    fireEvent.click(within(pergola).getByRole('button', { name: 'Lo uso comunque' }));
    next();
    expect((within(region('Da confermare')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
  });
});

describe('Guided experience', () => {
  it('keeps technical details closed and opens them, and the full editor, in the advanced configuration', async () => {
    const backend = createBackend({ plant: PLANT_V2, revision: 6, discovery: rediscovery() });
    renderWizard(backend, 'edit', { 'sensor.inv1': entity('3800', W, 'Inverter Tetto potenza') });
    expect(await screen.findByRole('heading', { level: 2, name: 'Fotovoltaico' })).not.toBeNull();
    const card = screen.getByRole('button', { name: 'Modifica Inverter Tetto' });
    expect(card.textContent).toContain('3,8 kW ora');
    expect(card.textContent).not.toContain('sensor.inv1');
    fireEvent.click(card);
    expect(screen.getByText('Inverter Tetto potenza')).not.toBeNull();
    const details = screen.getAllByText('Dettagli tecnici')[0].closest('details')!;
    expect(details.open).toBe(false);
    expect(screen.queryByRole('combobox', { name: 'Potenza fotovoltaico' })).toBeNull();

    // One device in the advanced editor, then back.
    click('Configurazione avanzata');
    expect(screen.getByRole('combobox', { name: 'Produzione' })).toHaveProperty('value', 'sensor.inv1');
    click('Torna alla vista guidata');
    expect(screen.queryByRole('combobox', { name: 'Produzione' })).toBeNull();

    // Everywhere at once: ids on the cards, details open, every editor advanced.
    click('Configurazione avanzata per tutti i dispositivi');
    expect(screen.getByRole('combobox', { name: 'Produzione' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Chiudi Inverter Tetto' }).textContent).toContain('sensor.inv1');
  });

  it('recommends a sensor, uses it only on request and lets the user pick another', async () => {
    const discovery = { ...A0_DISCOVERY, suggested_profile: { modules: {} }, ambiguous: [], requires_input: [], proposals: {
      wallbox: { charging_power: [{ entity_id: 'sensor.wb', confidence: 'medium' as const, score: 60, evidence: [], sign_convention: null, requires: [] }] },
    }, v2: EMPTY_V2 };
    const backend = createBackend({ discovery });
    renderWizard(backend, 'setup', { 'sensor.wb': entity('7400', W, 'Wallbox potenza'), 'sensor.wb_other': entity('0', W, 'Seconda presa') });
    await start();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo rete' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wallbox' }));
    next();
    next();
    click('Rimuovi Rete 1');
    next();

    expect(step('Wallbox')).not.toBeNull();
    expect(screen.getByText('Consigliato da Domus')).not.toBeNull();
    expect(screen.getByText('7,4 kW ora')).not.toBeNull();
    // A recommendation is not a choice.
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    click('Scegli un altro sensore per Potenza di ricarica');
    const picker = screen.getByRole('combobox', { name: 'Potenza di ricarica' });
    expect(document.activeElement).toBe(picker);
    // Keyboard: down to the recommended sensor, up to the other one, Enter to choose it.
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    fireEvent.keyDown(picker, { key: 'ArrowUp' });
    fireEvent.keyDown(picker, { key: 'Enter' });
    expect(screen.getByText('Seconda presa')).not.toBeNull();
    click('Scegli un altro sensore per Potenza di ricarica');
    fireEvent.mouseDown(within(screen.getByRole('listbox')).getByText('Wallbox potenza'));
    expect(screen.queryByText('Consigliato da Domus')).toBeNull();
    next();
    next('Continua senza storico');
    next('Salta per ora');
    save();
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    expect((backend.saves[0] as { profile_v2: { plant: EnergyPlant } }).profile_v2.plant.wallbox?.devices[0].power).toEqual({ sensors: { charging_power: 'sensor.wb' } });
  });

  it('closes from its own header or with Escape without saving, and from the success screen only after saving', async () => {
    const backend = createBackend({ plant: PLANT_V2, revision: 6 });
    const { onClose, onSaved } = renderWizard(backend, 'edit');
    expect(await screen.findByRole('heading', { level: 2, name: 'Fotovoltaico' })).not.toBeNull();
    fireEvent.keyDown(step('Fotovoltaico'), { key: 'Escape' });
    click('Chiudi configurazione');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(backend.saves).toEqual([]);

    click('Modifica Inverter Tetto');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Tetto sud' } });
    next();
    next();
    next('Continua senza storico');
    save();
    expect(await screen.findByRole('heading', { name: 'Domus Energy è pronto' })).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Riepilogo' }).textContent).toContain('Fotovoltaico · 1 inverter');
    click('Chiudi configurazione');
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps unsaved changes after a network error and saves on retry', async () => {
    const backend = createBackend({ v2: false, modules: { solar: { sensors: { production_power: 'sensor.pv' } } }, revision: 1 });
    backend.failNextSave = new Error('Connessione Home Assistant non disponibile.');
    renderWizard(backend, 'rediscover');
    expect(await screen.findByRole('heading', { level: 2, name: 'Il tuo impianto' })).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ho un misuratore dedicato ai consumi di casa' }));
    next();
    next();
    // The grid meter found by the discovery is only offered: its step can be passed.
    expect(step('Rete elettrica')).not.toBeNull();
    next();
    next();
    expect(step('Consumi della casa')).not.toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Consumo della casa' }), { target: { value: 'sensor.house' } });
    next();
    save();

    expect(await screen.findByText(/Home Assistant non risponde.*Le modifiche non salvate restano qui/)).not.toBeNull();
    save();
    expect(await screen.findByRole('heading', { name: 'Domus Energy è pronto' })).not.toBeNull();
    expect(backend.modules.home).toEqual({ sensors: { consumption_power: 'sensor.house' } });
  });
});

describe('Energy page lifecycle', () => {
  it('moves from no profile to a configured home and back without reloading', async () => {
    const backend = createBackend({ v2: false, discovery: { ...A0_DISCOVERY, requires_input: [], ambiguous: [] } });
    render(
      <EnergiaDetail
        title="Dettaglio Energia"
        onBack={vi.fn()}
        energy={{ callApi: backend.callApi, mode: 'real', connected: true, canManage: true, haStates: {} }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Avvia rilevamento/ }));
    await start();
    // The wizard replaces the page header instead of nesting under it.
    expect(screen.queryByRole('heading', { name: 'Dettaglio Energia' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo rete' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fotovoltaico' }));
    next();
    next('Usa i dispositivi trovati');
    click('Rimuovi Rete 1');
    next();
    next();
    next('Salta per ora');
    save();
    await screen.findByRole('button', { name: 'Vai a Domus Energy' });
    next('Vai a Domus Energy');

    expect(await screen.findByText(/Impianto salvato/)).not.toBeNull();
    expect(await screen.findByRole('list', { name: 'Componenti dell’impianto' })).not.toBeNull();

    // Everyday changes go through the classic settings page of an older integration.
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
