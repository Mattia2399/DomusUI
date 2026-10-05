import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EnergyCallApi,
  EnergyDiscovery,
  EnergyModuleId,
  EnergyProfileModules,
  EnergyState,
} from '../../../services/energyCoreClient';
import { EnergiaDetail } from '../EnergiaDetail';
import EnergySetupWizard from './EnergySetupWizard';

afterEach(cleanup);

type Backend = ReturnType<typeof createBackend>;

const DISCOVERY: EnergyDiscovery = {
  energy_dashboard: 'used',
  suggested_profile: { modules: { solar: { sensors: { production_power: 'sensor.pv' } } } },
  proposals: {
    solar: { production_power: [{ entity_id: 'sensor.pv', confidence: 'high', score: 115, evidence: [], sign_convention: null, requires: [] }] },
    grid: { net_power: [{ entity_id: 'sensor.meter', confidence: 'medium', score: 55, evidence: [], sign_convention: null, requires: ['sign_convention'] }] },
    battery: {
      state_of_charge: [
        { entity_id: 'sensor.storage_a', confidence: 'medium', score: 50, evidence: [], sign_convention: null, requires: [] },
        { entity_id: 'sensor.storage_b', confidence: 'medium', score: 50, evidence: [], sign_convention: null, requires: [] },
      ],
    },
  },
  ambiguous: [{ module: 'battery', role: 'state_of_charge', entity_ids: ['sensor.storage_a', 'sensor.storage_b'], reason: 'multiple_candidates' }],
  requires_input: [{ module: 'grid', role: 'net_power', entity_id: 'sensor.meter', missing: ['sign_convention'] }],
  unassigned: [],
  candidates: {
    'sensor.pv': { entity_id: 'sensor.pv', name: 'PV', kind: 'power', device: null, preview: { entity_id: 'sensor.pv', status: 'ok', value: 3200, unit: 'W', reason: null } },
    'sensor.meter': { entity_id: 'sensor.meter', name: 'Meter', kind: 'power', device: null, preview: { entity_id: 'sensor.meter', status: 'ok', value: -700, unit: 'W', reason: null } },
  },
};

function createBackend(initial: EnergyProfileModules = {}, discovery: EnergyDiscovery = DISCOVERY) {
  const backend = {
    modules: initial,
    revision: Object.keys(initial).length ? 1 : 0,
    saves: [] as Array<{ modules: EnergyProfileModules; expected: number | null; tariff?: unknown }>,
    failNextSave: null as unknown,
    tariff: null as unknown,
    legacy: false,
    callApi: vi.fn(async (message: Record<string, unknown>) => {
      switch (message.type) {
        case 'domusos/energy/get_profile':
          return profileResult();
        case 'domusos/energy/discover':
          return discovery;
        case 'domusos/energy/get_state':
          return state();
        case 'domusos/energy/save_profile': {
          const profile = message.profile as { modules: EnergyProfileModules; tariff?: unknown };
          backend.saves.push({
            modules: profile.modules,
            expected: message.expected_revision as number | null,
            ...('tariff' in profile ? { tariff: profile.tariff } : {}),
          });
          if (backend.failNextSave) {
            const failure = backend.failNextSave;
            backend.failNextSave = null;
            throw failure;
          }
          if (message.expected_revision !== backend.revision) {
            throw new Error('Energy profile changed [revision_conflict]');
          }
          backend.modules = profile.modules;
          if ('tariff' in profile && !backend.legacy) backend.tariff = profile.tariff;
          backend.revision += 1;
          return profileResult();
        }
        default:
          throw new Error(`unexpected ${String(message.type)}`);
      }
    }) as unknown as EnergyCallApi,
  };
  const profileResult = () => ({
    profile: {
      revision: backend.revision,
      updated_at: null,
      load_error: false,
      modules: backend.modules,
      ...(backend.legacy ? {} : { tariff: backend.tariff }),
    },
    module_status: Object.fromEntries(
      (['grid', 'solar', 'home', 'battery', 'wallbox'] as EnergyModuleId[]).map((id) => [id, backend.modules[id] ? 'online' : 'absent']),
    ),
  });
  const state = (): EnergyState => {
    const ids = Object.keys(backend.modules) as EnergyModuleId[];
    return {
      configured: ids.length > 0,
      load_error: false,
      available: ids.length > 0,
      profile_revision: backend.revision,
      observed_at: '2026-10-01T10:00:00+00:00',
      modules: Object.fromEntries(ids.map((id) => [id, { status: 'online', complete: true, sign_convention: null, quantities: {} }])),
      absent_modules: (['grid', 'solar', 'home', 'battery', 'wallbox'] as EnergyModuleId[]).filter((id) => !ids.includes(id)),
      offline_modules: [],
      home_consumption: null,
      ...(backend.legacy ? {} : { tariff: null }),
    };
  };
  return backend;
}

function renderWizard(backend: Backend, mode: 'setup' | 'edit' | 'rediscover' = 'setup') {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<EnergySetupWizard mode={mode} callApi={backend.callApi} haStates={{}} onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
const skipTariff = () => fireEvent.click(screen.getByRole('button', { name: 'Salta per ora' }));
const plantTile = (name: string) => screen.getByRole('radio', { name });
const confirmPlant = async () => fireEvent.click(await screen.findByRole('button', { name: 'Conferma impianto' }));
const moduleCard = (label: string) => screen.getByText(label, { selector: 'fieldset p' }).closest('fieldset') as HTMLElement;

describe('Energy setup wizard', () => {
  it('preselects reliable matches, leaves ambiguity and sign conventions to the user', async () => {
    const backend = createBackend();
    const { onSaved } = renderWizard(backend);

    expect(await screen.findByText('Abbiamo riconosciuto il tuo impianto')).not.toBeNull();
    expect(screen.getByText(/Sono state rilevate 2 entità corrispondenti\. Il tuo impianto comprende la rete elettrica e il fotovoltaico\./)).not.toBeNull();
    expect(screen.getByText('Rete: Conferma il significato dei valori positivi.')).not.toBeNull();
    expect(screen.getByText(/Batteria: più sensori possibili/)).not.toBeNull();
    // A pending confirmation sends the user through the bindings instead of a direct confirm.
    expect(screen.queryByRole('button', { name: 'Conferma impianto' })).toBeNull();
    next();

    // The plant type has its own step; the sensors follow on the next one.
    expect(screen.getByRole('heading', { name: 'Tipo di impianto' })).not.toBeNull();
    expect(plantTile('Fotovoltaico').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText('Rete', { selector: 'fieldset p' })).toBeNull();
    fireEvent.click(plantTile('Impianto completo'));
    next();
    expect(screen.getByRole('heading', { name: 'Associazioni' })).not.toBeNull();
    expect(within(moduleCard('Wallbox')).getByLabelText('Potenza di ricarica')).not.toBeNull();
    expect(moduleCard('Batteria')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cambia tipo di impianto' }));
    fireEvent.click(plantTile('Fotovoltaico'));
    next();
    expect(within(screen.getByRole('button', { name: 'Cambia tipo di impianto' }).parentElement as HTMLElement).getByText('Fotovoltaico')).not.toBeNull();
    expect(screen.queryByText('Wallbox', { selector: 'fieldset p' })).toBeNull();
    expect(screen.queryByText('Batteria', { selector: 'fieldset p' })).toBeNull();
    expect(within(moduleCard('Fotovoltaico')).getByDisplayValue('sensor.pv')).not.toBeNull();
    expect(within(moduleCard('Rete')).getByDisplayValue('sensor.meter')).not.toBeNull();
    // The tile decides which modules exist, so the hardware cannot be toggled one by one.
    expect(screen.queryByRole('button', { name: 'Rimuovi Rete' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Configura Casa' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Conferma il significato dei valori positivi.')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Valori positivi = prelievo dalla rete'));
    next();
    expect(screen.getByText(/Passaggio 4 di 6/)).not.toBeNull();
    expect(screen.queryByText('Obbligatorio')).toBeNull();
    skipTariff();
    expect(screen.getByText('Tariffa non configurata: potrai aggiungerla dalle Impostazioni.')).not.toBeNull();
    const preview = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(preview).toContain('Fotovoltaico: 3,2 kW');
    expect(preview).toContain('Rete: 700 W Immissione');
    expect(preview).not.toContain('Batteria');
    expect(screen.getByText(/calcolato dopo il salvataggio/)).not.toBeNull();
    next();

    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(backend.saves).toEqual([{
      modules: {
        grid: { sensors: { net_power: 'sensor.meter' }, sign_convention: 'positive_import' },
        solar: { sensors: { production_power: 'sensor.pv' } },
      },
      expected: 0,
    }]);
  });

  it('configures an unrecognized module manually', async () => {
    const backend = createBackend({}, {
      ...DISCOVERY,
      energy_dashboard: 'not_configured',
      suggested_profile: { modules: {} },
      requires_input: [],
      ambiguous: [],
      proposals: {},
    });
    renderWizard(backend);
    expect(await screen.findByText('Nessun sensore riconosciuto automaticamente')).not.toBeNull();
    expect(screen.getByText(/Non è un errore: nel passaggio successivo scegli tu i sensori/)).not.toBeNull();
    expect(screen.getByText(/Dashboard Energia di Home Assistant, Domus potrà proporli/)).not.toBeNull();
    next();

    expect(screen.getByText('Scegli il tipo di impianto per continuare.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(plantTile('Altro'));
    next();

    fireEvent.click(within(moduleCard('Wallbox')).getByRole('button', { name: 'Configura Wallbox' }));
    fireEvent.change(screen.getByLabelText('Potenza di ricarica'), { target: { value: 'switch.wallbox' } });
    expect(screen.getByText('Usa un’entità sensor.* esistente.')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Potenza di ricarica'), { target: { value: 'sensor.wallbox_power' } });
    next();

    const tariff = screen.getByRole('group', { name: 'Tariffa' });
    fireEvent.click(within(tariff).getByRole('radio', { name: 'Monoraria' }));
    expect(within(tariff).queryByRole('textbox', { name: /^Energia immessa/ })).toBeNull();
    fireEvent.change(within(tariff).getByRole('textbox', { name: /^Prezzo unico/ }), { target: { value: '20' } });
    expect(screen.getByText('Correggi i prezzi evidenziati oppure salta questo passaggio.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Salta' })).not.toBeNull();
    fireEvent.change(within(tariff).getByRole('textbox', { name: /^Prezzo unico/ }), { target: { value: '0,25' } });
    next();
    expect(screen.getByText('Tariffa: Monoraria · 0,25 €/kWh.')).not.toBeNull();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));

    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    expect(backend.saves[0]).toEqual({
      modules: { wallbox: { sensors: { charging_power: 'sensor.wallbox_power' } } },
      expected: 0,
      tariff: { scheme: 'single', prices: { single: 0.25 }, fixed_monthly: null, vat_percent: null, export_price: null },
    });
  });

  it('leaves a typed tariff out when the step is skipped', async () => {
    const backend = createBackend({}, { ...DISCOVERY, requires_input: [] });
    renderWizard(backend);
    expect(await screen.findByText(/È stata rilevata 1 entità corrispondente\. Il tuo impianto comprende il fotovoltaico\./)).not.toBeNull();
    expect(screen.getByText(/Se è tutto corretto, conferma l’impianto/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Modifica sensori' })).not.toBeNull();
    await confirmPlant();
    expect(screen.getByRole('heading', { name: 'Tariffa' })).not.toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: /^F1/ }), { target: { value: '0,3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salta' }));
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));

    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    expect(backend.saves[0]).not.toHaveProperty('tariff');
  });

  it('leaves the tariff step out when the integration cannot store it', async () => {
    const backend = createBackend({}, { ...DISCOVERY, requires_input: [] });
    backend.legacy = true;
    renderWizard(backend);
    await confirmPlant();

    expect(screen.getByRole('heading', { name: 'Anteprima' })).not.toBeNull();
    expect(screen.getByText(/Passaggio 4 di 5/)).not.toBeNull();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));
    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    expect(backend.saves[0]).not.toHaveProperty('tariff');
  });

  it('re-detection keeps confirmed bindings and only offers suggestions', async () => {
    const backend = createBackend({ grid: { sensors: { import_power: 'sensor.confirmed' } } });
    renderWizard(backend, 'rediscover');

    expect(await screen.findByText(/non vengono modificate automaticamente/)).not.toBeNull();
    expect(screen.getByText('sensor.pv')).not.toBeNull();
    next();
    expect(plantTile('Solo rete').getAttribute('aria-checked')).toBe('true');
    next();
    expect(within(moduleCard('Rete')).getByDisplayValue('sensor.confirmed')).not.toBeNull();
    expect(screen.queryByText('Fotovoltaico', { selector: 'fieldset p' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    const suggestion = screen.getByText('sensor.pv').closest('li') as HTMLElement;
    fireEvent.click(within(suggestion).getByRole('button', { name: 'Applica' }));
    expect(screen.queryByText('sensor.pv')).toBeNull();
    next();
    expect(plantTile('Fotovoltaico').getAttribute('aria-checked')).toBe('true');
    next();
    expect(within(moduleCard('Fotovoltaico')).getByDisplayValue('sensor.pv')).not.toBeNull();
    expect(within(moduleCard('Rete')).getByDisplayValue('sensor.confirmed')).not.toBeNull();
    next();
    expect(screen.getByRole('heading', { name: 'Anteprima' })).not.toBeNull();
    expect(screen.getByText(/Passaggio 4 di 5/)).not.toBeNull();
  });

  it('keeps unsaved changes after a network error and saves on retry', async () => {
    const backend = createBackend({ solar: { sensors: { production_power: 'sensor.pv' } } });
    backend.failNextSave = new Error('Connessione Home Assistant non disponibile.');
    const { onSaved } = renderWizard(backend, 'edit');
    await screen.findByText('Associazioni');

    fireEvent.click(within(moduleCard('Casa')).getByRole('button', { name: 'Configura Casa' }));
    fireEvent.change(screen.getByLabelText('Consumo'), { target: { value: 'sensor.house' } });
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));

    expect(await screen.findByText(/Home Assistant non risponde.*Le modifiche non salvate restano qui/)).not.toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByDisplayValue('sensor.house')).not.toBeNull();
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(backend.modules.home).toEqual({ sensors: { consumption_power: 'sensor.house' } });
  });

  it('reports revision conflicts and permission errors without discarding the draft', async () => {
    const backend = createBackend({ solar: { sensors: { production_power: 'sensor.pv' } } });
    renderWizard(backend, 'edit');
    await screen.findByText('Associazioni');
    backend.revision = 4;
    fireEvent.click(within(moduleCard('Fotovoltaico')).getByRole('button', { name: 'Rimuovi Fotovoltaico' }));
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));

    expect(await screen.findByText(/modificato altrove/)).not.toBeNull();
    expect(screen.getByRole('button', { name: /Carica la versione salvata/ })).not.toBeNull();

    backend.failNextSave = new Error('Admin required [unauthorized]');
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));
    expect(await screen.findByText(/Serve un amministratore/)).not.toBeNull();
    expect(screen.getByText('Nessun modulo: Domus Energy risulterà non configurato.')).not.toBeNull();
  });
});

describe('Energy setup layout', () => {
  it('closes from its own header or with Escape, without saving', async () => {
    const backend = createBackend({ solar: { sensors: { production_power: 'sensor.pv' } } });
    const { onClose } = renderWizard(backend, 'edit');
    expect(await screen.findByText(/Passaggio 3 di 5/)).not.toBeNull();

    fireEvent.keyDown(screen.getByRole('heading', { name: 'Associazioni' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi configurazione' }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(backend.saves).toEqual([]);
  });
});

describe('Energy page lifecycle', () => {
  it('moves from no profile to a configured home and back without reloading', async () => {
    const backend = createBackend({}, { ...DISCOVERY, requires_input: [] });
    render(
      <EnergiaDetail
        title="Dettaglio Energia"
        onBack={vi.fn()}
        energy={{ callApi: backend.callApi, mode: 'real', connected: true, canManage: true, haStates: {} }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Avvia rilevamento/ }));
    await screen.findByText('Abbiamo riconosciuto il tuo impianto');
    // The wizard replaces the page header instead of nesting under it.
    expect(screen.queryByRole('heading', { name: 'Dettaglio Energia' })).toBeNull();
    await confirmPlant();
    skipTariff();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));

    expect(await screen.findByText(/Impianto salvato/)).not.toBeNull();
    expect(await screen.findByRole('list', { name: 'Componenti dell’impianto' })).not.toBeNull();

    // Everyday changes go through the classic settings page, not the wizard.
    fireEvent.click(screen.getByRole('button', { name: 'Impostazioni energia' }));
    const plant = await screen.findByRole('region', { name: 'Impianto' });
    fireEvent.click(within(plant).getByRole('button', { name: 'Modifica Fotovoltaico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Fotovoltaico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva impianto' }));
    expect(await screen.findByText('Impianto salvato.')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Torna a Consumi' }));

    expect(await screen.findByText('Configura Domus Energy')).not.toBeNull();
    expect(backend.saves.map((save) => Object.keys(save.modules))).toEqual([['solar'], []]);
  });
});
