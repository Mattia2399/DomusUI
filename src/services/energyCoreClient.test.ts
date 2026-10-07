import { describe, expect, it, vi } from 'vitest';
import {
  ENERGY_CORE_TYPES,
  discoverEnergy,
  editableAsV1,
  getEnergyHistory,
  getEnergyProfile,
  getEnergyState,
  parseEnergyHistory,
  profileRevision,
  profileTariff,
  saveEnergyPlant,
  saveEnergyProfile,
  supportsProfileV2,
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

  it('reads discovery results that also carry the v2 proposal', async () => {
    const a0 = { suggested_profile: { modules: {} }, proposals: {}, candidates: {}, ambiguous: [], requires_input: [] };
    const v2 = { devices: [], totals: [], meters: {}, ambiguous: [], suggested_plant: null, verification: 'complete' };
    await expect(discoverEnergy(vi.fn().mockResolvedValue({ ...a0, v2 }))).resolves.toEqual({ ...a0, v2 });
  });

  it('reads v1 profiles, v2 profiles and v2 profiles without a v1 view', async () => {
    const tariff = { scheme: 'single' as const, prices: { single: 0.25 }, fixed_monthly: null, vat_percent: null, export_price: null };
    const profile = { revision: 7, updated_at: null, load_error: false, modules: {}, tariff: null };
    const plant = { solar: { devices: [{ id: 'solar-1', name: 'Tetto', ha_device_id: null, power: { sensors: { production_power: 'sensor.pv' } } }] } };
    const v2 = { schema: 'domusos-energy-profile', version: 2, revision: 7, updated_at: null, load_error: false, migrated_from: null, plant, tariff, retired_device_ids: [] };
    const energy_meters = { recorder: 'available', verification: 'complete', meters: {}, plan: {} };

    // Integrations from before Energy Profile v2.
    const legacy = { profile, module_status: {} };
    const legacyResult = await getEnergyProfile(vi.fn().mockResolvedValue(legacy));
    expect([supportsProfileV2(legacyResult), editableAsV1(legacyResult), profileRevision(legacyResult)]).toEqual([false, true, 7]);

    const compatible = { profile, profile_v2: v2, v1_compatible: true, legacy_v1: null, module_status: {}, energy_meters };
    const both = await getEnergyProfile(vi.fn().mockResolvedValue(compatible));
    expect(both).toEqual(compatible);
    expect([supportsProfileV2(both), editableAsV1(both), profileTariff(both)]).toEqual([true, true, tariff]);

    // v1 cannot hold it: still a configured installation, never an empty one or an error.
    const v2Only = { ...compatible, profile: null, v1_compatible: false };
    const only = await getEnergyProfile(vi.fn().mockResolvedValue(v2Only));
    expect([editableAsV1(only), profileRevision(only), only.profile_v2?.plant]).toEqual([false, 7, plant]);
    // Without the v2 document a null profile means nothing.
    await expect(getEnergyProfile(vi.fn().mockResolvedValue({ profile: null, module_status: {} }))).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(getEnergyProfile(vi.fn().mockResolvedValue({ ...v2Only, profile_v2: { revision: 'x', plant: {} } }))).rejects.toMatchObject({ code: 'invalid_response' });

    const unsupported = { ...EMPTY_STATE, configured: true, profile_revision: 7, unsupported_modules: { solar: 'no_power_sensors' } };
    await expect(getEnergyState(vi.fn().mockResolvedValue(unsupported))).resolves.toEqual(unsupported);
  });

  it('saves a whole v2 plant with the expected revision and keeps or sets the tariff', async () => {
    const plant = { solar: { devices: [{ id: 'solar-1', name: null, ha_device_id: null, power: { sensors: { production_power: 'sensor.pv' } } }] } };
    const v2 = { schema: 'domusos-energy-profile', version: 2, revision: 8, updated_at: null, load_error: false, migrated_from: null, plant, tariff: null, retired_device_ids: [] };
    const reply = { profile: null, profile_v2: v2, v1_compatible: false, module_status: {} };
    const callApi = vi.fn().mockResolvedValue(reply);

    await expect(saveEnergyPlant(callApi, plant, 7)).resolves.toEqual(reply);
    expect(callApi.mock.calls[0][0]).toEqual({ type: 'domusos/energy/save_profile', profile_v2: { plant }, expected_revision: 7 });
    await saveEnergyPlant(callApi, plant, 7, null);
    expect(callApi.mock.calls[1][0]).toEqual({ type: 'domusos/energy/save_profile', profile_v2: { plant, tariff: null }, expected_revision: 7 });
    // An integration that answered without the v2 document did not store it.
    await expect(saveEnergyPlant(vi.fn().mockResolvedValue({ profile: { revision: 8, modules: {} }, module_status: {} }), plant, 7))
      .rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('explains a save refused because v1 would lose devices or meters', () => {
    const error = toEnergyCoreError({ code: 'profile_requires_v2', message: 'The energy profile holds devices' });
    expect(error.code).toBe('profile_requires_v2');
    expect(error.message).toMatch(/nulla è stato modificato/);
    expect(toEnergyCoreError(new Error('changed [revision_conflict]')).message).toMatch(/modificato altrove/);
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

describe('Domus Energy history client', () => {
  const starts = ['2026-10-05T00:00:00+02:00', '2026-10-05T01:00:00+02:00', '2026-10-05T02:00:00+02:00'];
  const document = () => ({
    configured: true,
    range: { start: starts[0], end: '2026-10-05T03:00:00+02:00', bucket: 'hour', timezone: 'Europe/Rome' },
    unit: 'kWh',
    recorder: 'available',
    verification: 'complete',
    series: {
      grid_import: {
        source: 'total',
        statistic_ids: ['sensor.f1', 'sensor.f2'],
        points: [
          { start: starts[0], value: 0 },
          { start: starts[1], value: null, missing: ['sensor.f2'], partial_value: 0.4 },
          { start: starts[2], value: 1.25 },
        ],
        complete: false,
        status: 'partial_data',
        in_progress_last: true,
      },
      consumption: {
        source: 'derived',
        statistic_ids: ['sensor.f1', 'sensor.f2'],
        points: [
          { start: starts[0], value: 0 },
          { start: starts[1], value: null, missing: ['grid_import'] },
          { start: starts[2], value: null, reason: 'incoherent_balance' },
        ],
        complete: false,
        status: 'partial_data',
        in_progress_last: true,
        terms: { grid_import: 1 },
      },
    },
    unavailable: { production: { reason: 'no_energy_meter', statistic_ids: [] } },
    devices: {},
    cost: null,
    previous: null,
    generated_at: '2026-10-05T00:30:00+00:00',
  });

  it('reads a preset through the exact websocket command, without devices or comparison', async () => {
    const callApi = vi.fn().mockResolvedValue(document());

    const result = await getEnergyHistory(callApi, '7d');

    expect(callApi).toHaveBeenCalledWith({ type: 'domusos/energy/get_history', range: '7d' }, { reportError: false, throwOnError: true });
    expect(result).toEqual(document());
  });

  it('keeps a missing bucket as null and a real zero as 0, with the partial value apart', () => {
    const result = parseEnergyHistory(document());
    const points = result?.series.grid_import?.points ?? [];

    expect(points.map((point) => point.value)).toEqual([0, null, 1.25]);
    expect(points[1]).toEqual({ start: starts[1], value: null, missing: ['sensor.f2'], partial_value: 0.4 });
    expect(result?.series.consumption?.points[2].reason).toBe('incoherent_balance');
    expect(result?.series.consumption?.terms).toEqual({ grid_import: 1 });
    expect(result?.unavailable.production?.reason).toBe('no_energy_meter');
  });

  it.each([
    ['a value that is not a number', (doc: ReturnType<typeof document>) => { doc.series.grid_import.points[0] = { start: starts[0], value: Number.NaN }; }],
    ['a value given as text', (doc: ReturnType<typeof document>) => { Object.assign(doc.series.grid_import.points[0], { value: '0' }); }],
    ['an unknown series', (doc: ReturnType<typeof document>) => { Object.assign(doc.series, { heat_pump: doc.series.grid_import }); }],
    ['an unknown bucket', (doc: ReturnType<typeof document>) => { doc.range.bucket = 'quarter'; }],
    ['a range without time zone', (doc: ReturnType<typeof document>) => { doc.range.timezone = ''; }],
    ['an unknown reason', (doc: ReturnType<typeof document>) => { Object.assign(doc.unavailable.production, { reason: 'broken' }); }],
    ['series with different buckets', (doc: ReturnType<typeof document>) => { doc.series.consumption.points.pop(); }],
    ['a cost before A2.2', (doc: ReturnType<typeof document>) => { Object.assign(doc, { cost: { net: 1 } }); }],
  ])('rejects %s', async (_, change) => {
    const doc = document();
    change(doc);

    expect(parseEnergyHistory(doc)).toBeNull();
    await expect(getEnergyHistory(vi.fn().mockResolvedValue(doc), '24h')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it.each([
    ['recorder_unavailable', 'recorder_unavailable'],
    ['history_unavailable', 'history_unavailable'],
    ['invalid_range', 'invalid_request'],
    ['invalid_bucket', 'invalid_request'],
    ['unknown_command', 'unsupported'],
  ])('maps the %s error', async (raw, code) => {
    const callApi = vi.fn().mockRejectedValue({ code: raw, message: 'failure' });

    await expect(getEnergyHistory(callApi, '24h')).rejects.toMatchObject({ code });
  });
});
