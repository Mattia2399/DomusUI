import { describe, expect, it } from 'vitest';
import type { EnergyDiscovery } from '../../../services/energyCoreClient';
import {
  applySuggestion,
  draftFromDiscovery,
  draftFromProfile,
  draftToModules,
  emptyDraft,
  pendingSuggestions,
  sameModules,
  validateDraft,
} from './energyDraft';

const discovery = (overrides: Partial<EnergyDiscovery> = {}): EnergyDiscovery => ({
  energy_dashboard: 'used',
  suggested_profile: { modules: {} },
  proposals: {},
  ambiguous: [],
  requires_input: [],
  unassigned: [],
  candidates: {},
  ...overrides,
});

describe('Energy draft', () => {
  it('preselects only reliable suggestions and leaves ambiguous modules absent', () => {
    const draft = draftFromDiscovery(discovery({
      suggested_profile: { modules: { solar: { sensors: { production_power: 'sensor.pv' } } } },
      ambiguous: [{ module: 'battery', role: 'state_of_charge', entity_ids: ['sensor.a', 'sensor.b'], reason: 'multiple_candidates' }],
    }));

    expect(draft.solar.present).toBe(true);
    expect(draft.battery.present).toBe(false);
    expect(draftToModules(draft)).toEqual({ solar: { sensors: { production_power: 'sensor.pv' } } });
  });

  it('never guesses the sign convention of a signed meter', () => {
    const draft = draftFromDiscovery(discovery({
      requires_input: [{ module: 'grid', role: 'net_power', entity_id: 'sensor.meter', missing: ['sign_convention'] }],
    }));

    expect(draft.grid).toMatchObject({ present: true, mode: 'net', signConvention: '' });
    expect(validateDraft(draft)).toEqual([
      { module: 'grid', role: 'net_power', message: 'Conferma il significato dei valori positivi.' },
    ]);
    expect(draftToModules(draft).grid).toEqual({ sensors: { net_power: 'sensor.meter' } });

    draft.grid.signConvention = 'positive_export';
    expect(validateDraft(draft)).toEqual([]);
    expect(draftToModules(draft).grid).toEqual({
      sensors: { net_power: 'sensor.meter' },
      sign_convention: 'positive_export',
    });
  });

  it('supports grid-only homes without placeholder modules', () => {
    const draft = emptyDraft();
    draft.grid = { present: true, mode: 'split', sensors: { import_power: 'sensor.in', export_power: 'sensor.out' }, signConvention: '' };

    expect(draftToModules(draft)).toEqual({
      grid: { sensors: { import_power: 'sensor.in', export_power: 'sensor.out' } },
    });
  });

  it('drops roles of the inactive wiring mode', () => {
    const draft = draftFromProfile({
      battery: { sensors: { state_of_charge: 'sensor.soc', charge_power: 'sensor.charge' } },
    });
    draft.battery = { ...draft.battery, mode: 'net', sensors: { ...draft.battery.sensors, net_power: 'sensor.flow' }, signConvention: 'positive_charge' };

    expect(draftToModules(draft).battery).toEqual({
      sensors: { state_of_charge: 'sensor.soc', net_power: 'sensor.flow' },
      sign_convention: 'positive_charge',
    });
  });

  it('reports empty modules, invalid entities and duplicates', () => {
    const draft = emptyDraft();
    draft.wallbox.present = true;
    draft.solar = { present: true, mode: 'split', sensors: { production_power: 'switch.pv' }, signConvention: '' };
    draft.home = { present: true, mode: 'split', sensors: { consumption_power: 'sensor.same' }, signConvention: '' };
    draft.grid = { present: true, mode: 'split', sensors: { import_power: 'sensor.same' }, signConvention: '' };

    expect(validateDraft(draft).map((issue) => [issue.module, issue.role])).toEqual([
      ['solar', 'production_power'],
      ['home', 'consumption_power'],
      ['wallbox', undefined],
    ]);
    const messages = validateDraft(draft).map((issue) => `${issue.module}:${issue.message}`);
    expect(messages).toContain('solar:Usa un’entità sensor.* esistente.');
    expect(messages).toContain('home:Sensore già usato per Rete.');
    expect(messages).toContain('wallbox:Scegli almeno un sensore per questo modulo.');
  });

  it('re-detection proposes differences without changing confirmed bindings', () => {
    const saved = draftFromProfile({ grid: { sensors: { import_power: 'sensor.confirmed' } } });
    const result = discovery({
      suggested_profile: {
        modules: {
          grid: { sensors: { import_power: 'sensor.other', export_power: 'sensor.out' } },
          solar: { sensors: { production_power: 'sensor.pv' } },
        },
      },
    });

    const suggestions = pendingSuggestions(saved, result);

    expect(saved.grid.sensors.import_power).toBe('sensor.confirmed');
    expect(suggestions.map((item) => `${item.module}.${item.role}=${item.entityId}`)).toEqual([
      'grid.import_power=sensor.other',
      'grid.export_power=sensor.out',
      'solar.production_power=sensor.pv',
    ]);
    const applied = applySuggestion(saved, suggestions[2]);
    expect(applied.solar.present).toBe(true);
    expect(applied.grid.sensors.import_power).toBe('sensor.confirmed');
    expect(pendingSuggestions(applied, result)).toHaveLength(2);
  });

  it('detects unchanged profiles regardless of the source', () => {
    const modules = { grid: { sensors: { net_power: 'sensor.g' }, sign_convention: 'positive_import' } };

    expect(sameModules(draftToModules(draftFromProfile(modules)), modules)).toBe(true);
  });
});
