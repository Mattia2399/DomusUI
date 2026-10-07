import { describe, expect, it } from 'vitest';
import { draftFromProfile, draftToModules, emptyDraft, sameModules, validateDraft } from './energyDraft';

describe('Energy draft', () => {
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

  it('detects unchanged profiles regardless of the source', () => {
    const modules = { grid: { sensors: { net_power: 'sensor.g' }, sign_convention: 'positive_import' } };

    expect(sameModules(draftToModules(draftFromProfile(modules)), modules)).toBe(true);
  });
});
