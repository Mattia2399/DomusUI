import { describe, expect, it, vi } from 'vitest';
import {
  DevicePowerClientError,
  bindDevicePowerPolicy,
  deleteDevicePowerPolicy,
  draftFromPolicy,
  getDevicePowerState,
  parseDevicePowerState,
  saveDevicePowerPolicy,
  toDevicePowerClientError,
  validatePolicyDraft,
  type DevicePowerCallApi,
} from './devicePowerClient';

const POLICY_ID = '0123456789abcdef0123456789abcdef';

const wirePolicy = (overrides: Record<string, unknown> = {}) => ({
  policy_id: POLICY_ID,
  client_id: 'client-0001',
  label: 'Tablet soggiorno',
  enabled: true,
  battery_entity_id: 'sensor.tablet_battery',
  switch_entity_id: 'switch.presa_tablet',
  start_threshold: 30,
  stop_threshold: 80,
  revision: 2,
  created_at: '2026-10-16T08:00:00+00:00',
  updated_at: '2026-10-16T09:00:00+00:00',
  runtime: {
    status: 'charging',
    battery_level: 42,
    switch_on: true,
    last_action: { action: 'turn_on', at: '2026-10-16T09:00:00+00:00' },
    last_error: null,
  },
  ...overrides,
});

const callApiReturning = (value: unknown) => vi.fn(async () => value) as unknown as DevicePowerCallApi & ReturnType<typeof vi.fn>;

describe('device power client', () => {
  it('reads the policies and their live state', async () => {
    const callApi = callApiReturning({ status: 'ready', policies: [wirePolicy()] });
    const state = await getDevicePowerState(callApi);

    expect(callApi).toHaveBeenCalledWith(
      { type: 'domusos/device_power/get_state' },
      { reportError: false, throwOnError: true },
    );
    expect(state.policies[0]).toMatchObject({
      policyId: POLICY_ID,
      clientId: 'client-0001',
      batteryEntityId: 'sensor.tablet_battery',
      switchEntityId: 'switch.presa_tablet',
      startThreshold: 30,
      stopThreshold: 80,
      revision: 2,
      runtime: { status: 'charging', batteryLevel: 42, switchOn: true, lastAction: { action: 'turn_on' } },
    });
  });

  it('rejects a response it does not understand', () => {
    expect(() => parseDevicePowerState({ status: 'ready' })).toThrow(DevicePowerClientError);
    expect(() => parseDevicePowerState({ status: 'maybe', policies: [] })).toThrow('invalid_response');
    expect(() =>
      parseDevicePowerState({ status: 'ready', policies: [wirePolicy({ start_threshold: '30' })] }),
    ).toThrow('invalid_response');
    expect(() =>
      parseDevicePowerState({
        status: 'ready',
        policies: [wirePolicy({ runtime: { ...wirePolicy().runtime, status: 'turbo' } })],
      }),
    ).toThrow('invalid_response');
  });

  it('creates a policy without an id, and changes one with its revision', async () => {
    const callApi = callApiReturning({ policy: wirePolicy(), status: 'ready', policies: [wirePolicy()] });
    const settings = {
      clientId: 'client-0001',
      label: null,
      enabled: true,
      batteryEntityId: 'sensor.tablet_battery',
      switchEntityId: 'switch.presa_tablet',
      startThreshold: 25,
      stopThreshold: 85,
    };

    await saveDevicePowerPolicy(callApi, settings);
    await saveDevicePowerPolicy(callApi, settings, { policyId: POLICY_ID, revision: 2 });

    const wire = {
      client_id: 'client-0001',
      label: null,
      enabled: true,
      battery_entity_id: 'sensor.tablet_battery',
      switch_entity_id: 'switch.presa_tablet',
      start_threshold: 25,
      stop_threshold: 85,
    };
    expect(callApi.mock.calls[0][0]).toEqual({ type: 'domusos/device_power/save_policy', policy: wire });
    expect(callApi.mock.calls[1][0]).toEqual({
      type: 'domusos/device_power/save_policy',
      policy: wire,
      policy_id: POLICY_ID,
      expected_revision: 2,
    });
  });

  it('links and removes a policy at the revision it was shown', async () => {
    const callApi = callApiReturning({ status: 'ready', policies: [] });
    const [policy] = parseDevicePowerState({ status: 'ready', policies: [wirePolicy()] }).policies;

    await bindDevicePowerPolicy(callApi, policy, 'client-0002');
    await deleteDevicePowerPolicy(callApi, policy);

    expect(callApi.mock.calls[0][0]).toEqual({
      type: 'domusos/device_power/bind_policy',
      policy_id: POLICY_ID,
      expected_revision: 2,
      client_id: 'client-0002',
    });
    expect(callApi.mock.calls[1][0]).toEqual({
      type: 'domusos/device_power/delete_policy',
      policy_id: POLICY_ID,
      expected_revision: 2,
    });
  });

  it('turns failures into stable codes', async () => {
    expect(toDevicePowerClientError({ code: 'revision_conflict', message: 'x' }).code).toBe('revision_conflict');
    expect(toDevicePowerClientError(new Error('Richiesta rifiutata [switch_in_use]')).code).toBe('switch_in_use');
    expect(toDevicePowerClientError({ code: 'unknown_command', message: 'Unknown command.' }).code).toBe('unsupported');
    expect(toDevicePowerClientError(new Error('Comando non ammesso dal pannello.')).code).toBe('unsupported');
    expect(toDevicePowerClientError({ code: 'unauthorized', message: 'Unauthorized' }).code).toBe('unauthorized');
    expect(toDevicePowerClientError(new Error('socket closed')).code).toBe('network');

    const failing = vi.fn(async () => {
      throw { code: 'store_corrupt', message: 'corrupt' };
    }) as unknown as DevicePowerCallApi;
    await expect(getDevicePowerState(failing)).rejects.toMatchObject({ code: 'store_corrupt' });
  });
});

describe('device power draft', () => {
  const valid = { ...draftFromPolicy(null), batteryEntityId: 'sensor.tablet_battery', switchEntityId: 'switch.presa' };

  it('starts from 30 % and 80 %, enabled', () => {
    expect(draftFromPolicy(null)).toEqual({
      label: '',
      enabled: true,
      batteryEntityId: '',
      switchEntityId: '',
      startThreshold: '30',
      stopThreshold: '80',
    });
  });

  it('accepts whole percentages with start below stop', () => {
    expect(validatePolicyDraft({ ...valid, label: '  Tablet  ' })).toEqual({
      errors: {},
      settings: {
        label: 'Tablet',
        enabled: true,
        batteryEntityId: 'sensor.tablet_battery',
        switchEntityId: 'switch.presa',
        startThreshold: 30,
        stopThreshold: 80,
      },
    });
    expect(validatePolicyDraft({ ...valid, startThreshold: '0', stopThreshold: '100' }).settings).toMatchObject({
      startThreshold: 0,
      stopThreshold: 100,
    });
    expect(validatePolicyDraft({ ...valid, label: '   ' }).settings?.label).toBeNull();
  });

  it('reports invalid values and never corrects them', () => {
    expect(validatePolicyDraft({ ...valid, startThreshold: '80', stopThreshold: '80' }).errors).toEqual({ stopThreshold: 'order' });
    expect(validatePolicyDraft({ ...valid, startThreshold: '90', stopThreshold: '20' })).toEqual({
      errors: { stopThreshold: 'order' },
      settings: null,
    });
    expect(validatePolicyDraft({ ...valid, startThreshold: '101' }).errors).toEqual({ startThreshold: 'range' });
    expect(validatePolicyDraft({ ...valid, startThreshold: '30.5' }).errors).toEqual({ startThreshold: 'range' });
    expect(validatePolicyDraft({ ...valid, startThreshold: '-1' }).errors).toEqual({ startThreshold: 'range' });
    expect(validatePolicyDraft({ ...valid, stopThreshold: ' ' }).errors).toEqual({ stopThreshold: 'required' });
    expect(validatePolicyDraft({ ...valid, label: 'x'.repeat(65) }).errors).toEqual({ label: 'length' });
    expect(validatePolicyDraft({ ...valid, batteryEntityId: '' }).errors).toEqual({ batteryEntityId: 'required' });
    expect(validatePolicyDraft({ ...valid, batteryEntityId: 'binary_sensor.battery' }).errors).toEqual({ batteryEntityId: 'domain' });
    expect(validatePolicyDraft({ ...valid, switchEntityId: 'light.presa' }).errors).toEqual({ switchEntityId: 'domain' });
  });
});
