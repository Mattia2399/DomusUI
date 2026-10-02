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
    saves: [] as Array<{ modules: EnergyProfileModules; expected: number | null }>,
    failNextSave: null as unknown,
    callApi: vi.fn(async (message: Record<string, unknown>) => {
      switch (message.type) {
        case 'domusos/energy/get_profile':
          return profileResult();
        case 'domusos/energy/discover':
          return discovery;
        case 'domusos/energy/get_state':
          return state();
        case 'domusos/energy/save_profile': {
          const profile = message.profile as { modules: EnergyProfileModules };
          backend.saves.push({ modules: profile.modules, expected: message.expected_revision as number | null });
          if (backend.failNextSave) {
            const failure = backend.failNextSave;
            backend.failNextSave = null;
            throw failure;
          }
          if (message.expected_revision !== backend.revision) {
            throw new Error('Energy profile changed [revision_conflict]');
          }
          backend.modules = profile.modules;
          backend.revision += 1;
          return profileResult();
        }
        default:
          throw new Error(`unexpected ${String(message.type)}`);
      }
    }) as unknown as EnergyCallApi,
  };
  const profileResult = () => ({
    profile: { revision: backend.revision, updated_at: null, load_error: false, modules: backend.modules },
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
const moduleCard = (label: string) => screen.getByText(label, { selector: 'fieldset p' }).closest('fieldset') as HTMLElement;

describe('Energy setup wizard', () => {
  it('preselects reliable matches, leaves ambiguity and sign conventions to the user', async () => {
    const backend = createBackend();
    const { onSaved } = renderWizard(backend);

    expect(await screen.findByText('Sensori riconosciuti e già proposti')).not.toBeNull();
    expect(screen.getByText('Più sensori possibili: scegli tu quale usare')).not.toBeNull();
    expect(screen.getByText('Sensore trovato: conferma il significato del segno')).not.toBeNull();
    next();

    expect(within(moduleCard('Batteria')).getByRole('button', { name: 'Configura Batteria' })).not.toBeNull();
    expect(within(moduleCard('Fotovoltaico')).getByDisplayValue('sensor.pv')).not.toBeNull();
    expect(within(moduleCard('Rete')).getByDisplayValue('sensor.meter')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Avanti' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Conferma il significato dei valori positivi.')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Valori positivi = prelievo dalla rete'));
    next();
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

    fireEvent.click(within(moduleCard('Wallbox')).getByRole('button', { name: 'Configura Wallbox' }));
    fireEvent.change(screen.getByLabelText('Potenza di ricarica'), { target: { value: 'switch.wallbox' } });
    expect(screen.getByText('Usa un’entità sensor.* esistente.')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Potenza di ricarica'), { target: { value: 'sensor.wallbox_power' } });
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));

    await vi.waitFor(() => expect(backend.saves).toHaveLength(1));
    expect(backend.saves[0].modules).toEqual({ wallbox: { sensors: { charging_power: 'sensor.wallbox_power' } } });
  });

  it('re-detection keeps confirmed bindings and only offers suggestions', async () => {
    const backend = createBackend({ grid: { sensors: { import_power: 'sensor.confirmed' } } });
    renderWizard(backend, 'rediscover');

    expect(await screen.findByText(/non vengono modificate automaticamente/)).not.toBeNull();
    expect(screen.getByText('sensor.pv')).not.toBeNull();
    next();
    expect(within(moduleCard('Rete')).getByDisplayValue('sensor.confirmed')).not.toBeNull();
    expect(within(moduleCard('Fotovoltaico')).getByRole('button', { name: 'Configura Fotovoltaico' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    const suggestion = screen.getByText('sensor.pv').closest('li') as HTMLElement;
    fireEvent.click(within(suggestion).getByRole('button', { name: 'Applica' }));
    expect(screen.queryByText('sensor.pv')).toBeNull();
    next();
    expect(within(moduleCard('Fotovoltaico')).getByDisplayValue('sensor.pv')).not.toBeNull();
    expect(within(moduleCard('Rete')).getByDisplayValue('sensor.confirmed')).not.toBeNull();
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
    expect(await screen.findByText(/Passaggio 2 di 4/)).not.toBeNull();

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
    await screen.findByText('Sensori riconosciuti e già proposti');
    // The wizard replaces the page header instead of nesting under it.
    expect(screen.queryByRole('heading', { name: 'Dettaglio Energia' })).toBeNull();
    next();
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Salva impianto/ }));

    expect(await screen.findByText(/Impianto salvato/)).not.toBeNull();
    expect(await screen.findByRole('region', { name: 'Il tuo impianto' })).not.toBeNull();

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
