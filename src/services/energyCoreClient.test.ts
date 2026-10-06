import { describe, expect, it, vi } from 'vitest';
import {
  ENERGY_CORE_TYPES,
  getEnergyProfile,
  getEnergyState,
  saveEnergyProfile,
  toEnergyCoreError,
} from './energyCoreClient';

const EMPTY_STATE = {
  configured: false,
  load_error: false,
  available: false,
  profile_revision: 0,
  observed_at: '2026-10-01T10:00:00+00:00',
  modules: {},
  absent_modules: ['grid', 'solar', 'home', 'battery', 'wallbox'],
  offline_modules: [],
  home_consumption: null,
};

describe('Domus Energy client', () => {
  it('reads state through the exact websocket command', async () => {
    const callApi = vi.fn().mockResolvedValue(EMPTY_STATE);

    await expect(getEnergyState(callApi)).resolves.toEqual(EMPTY_STATE);
    expect(callApi).toHaveBeenCalledWith(
      { type: ENERGY_CORE_TYPES.getState },
      { reportError: false, throwOnError: true },
    );
  });

  it('sends the profile with the expected revision', async () => {
    const result = { profile: { revision: 2, updated_at: null, load_error: false, modules: {} }, module_status: {} };
    const callApi = vi.fn().mockResolvedValue(result);

    await saveEnergyProfile(callApi, { solar: { sensors: { production_power: 'sensor.pv' } } }, 1);

    expect(callApi.mock.calls[0][0]).toEqual({
      type: 'domusos/energy/save_profile',
      profile: { modules: { solar: { sensors: { production_power: 'sensor.pv' } } } },
      expected_revision: 1,
    });
  });

  it('reports an integration that drops the tariff on save', async () => {
    const tariff = { scheme: 'single' as const, prices: { single: 0.25 }, fixed_monthly: null, vat_percent: null, export_price: null };
    const legacy = { profile: { revision: 2, updated_at: null, load_error: false, modules: {} }, module_status: {} };
    await expect(saveEnergyProfile(vi.fn().mockResolvedValue(legacy), {}, 1, tariff)).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('non gestisce ancora la tariffa'),
    });

    const current = { ...legacy, profile: { ...legacy.profile, tariff } };
    await expect(saveEnergyProfile(vi.fn().mockResolvedValue(current), {}, 1, tariff)).resolves.toEqual(current);
    // Plant-only saves never need tariff support.
    await expect(saveEnergyProfile(vi.fn().mockResolvedValue(legacy), {}, 1)).resolves.toEqual(legacy);
  });

  it('rejects malformed responses', async () => {
    await expect(getEnergyState(vi.fn().mockResolvedValue({ configured: 'yes' }))).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(getEnergyState(vi.fn().mockResolvedValue(null))).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('reads integrations that store Energy Profile v2', async () => {
    const profile = { revision: 7, updated_at: null, load_error: false, modules: {}, tariff: null };
    const v2 = { revision: 7, plant: {}, load_error: false };
    const energy_meters = { recorder: 'available', meters: {}, plan: {} };
    const result = { profile, profile_v2: v2, v1_compatible: true, legacy_v1: null, module_status: {}, energy_meters };
    await expect(getEnergyProfile(vi.fn().mockResolvedValue(result))).resolves.toEqual(result);

    // A profile v1 cannot hold is never read as an empty installation.
    const v2Only = { ...result, profile: null, v1_compatible: false };
    await expect(getEnergyProfile(vi.fn().mockResolvedValue(v2Only))).rejects.toMatchObject({ code: 'invalid_response' });

    const unsupported = { ...EMPTY_STATE, configured: true, profile_revision: 7, unsupported_profile: 'multiple_devices' };
    await expect(getEnergyState(vi.fn().mockResolvedValue(unsupported))).resolves.toEqual(unsupported);
  });

  it.each([
    [{ code: 'revision_conflict', message: 'Energy profile changed' }, 'revision_conflict'],
    [new Error('Energy profile changed [revision_conflict]'), 'revision_conflict'],
    [new Error('Admin required [unauthorized]'), 'unauthorized'],
    [{ code: 'unknown_command', message: 'Unknown command.' }, 'unsupported'],
    [new Error('Tipo richiesta Home Assistant non ammesso dal bridge.'), 'unsupported'],
    [new Error('Messaggio call-api non ammesso.'), 'unsupported'],
    [new Error('Connessione Home Assistant non disponibile.'), 'network'],
    ['timeout', 'network'],
  ])('maps %o to %s', (error, code) => {
    expect(toEnergyCoreError(error).code).toBe(code);
  });

  it('keeps the server validation detail for invalid profiles', () => {
    const error = toEnergyCoreError(new Error('Module grid uses a signed sensor [invalid_profile]'));

    expect(error.code).toBe('invalid_profile');
    expect(error.message).toContain('Module grid uses a signed sensor');
    expect(error.message).not.toContain('[invalid_profile]');
  });
});
