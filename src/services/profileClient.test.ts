import { describe, expect, it, vi } from 'vitest';
import {
  ProfileClientError,
  addDevice,
  discoverDevices,
  getSelf,
  parseDiscoveryResult,
  parseProfileSnapshot,
  removeDevice,
  saveNotifications,
  toProfileClientError,
  updateDevice,
  type ProfileCallApi,
} from './profileClient';
import { createFakeProfileBackend } from '../test/fakeProfileBackend';

const FORBIDDEN_KEYS = ['user_id', 'person_id', 'owner_user_id', 'person_entity_id', 'id', 'added_at', 'source'];

function recordingApi(response: unknown) {
  const callApi = vi.fn(async () => response);
  return { callApi: callApi as unknown as ProfileCallApi, calls: callApi.mock.calls as unknown as [Record<string, unknown>, unknown][] };
}

describe('profileClient', () => {
  it('parses a snapshot into stored and live data kept apart', async () => {
    const backend = createFakeProfileBackend({
      haDevices: [{ haDeviceId: 'ha-1', displayName: 'Pixel 8', trackers: ['device_tracker.pixel'], inPersonTrackers: true }],
      owned: [{ haDeviceId: 'ha-1', label: 'Telefono' }],
    });
    const snapshot = await getSelf(backend.callApi);

    expect(snapshot.revision).toBe(1);
    expect(snapshot.profile.personalDevices).toEqual([
      { id: 'pd_1', haDeviceId: 'ha-1', label: 'Telefono', addedAt: '2026-01-01T10:00:00+00:00', notificationsEnabled: true },
    ]);
    expect(snapshot.liveDevices[0]).toMatchObject({
      deviceId: 'pd_1',
      status: 'active',
      displayName: 'Pixel 8',
      notificationTargetStatus: 'ready',
      presence: { trackerEntityIds: ['device_tracker.pixel'], inPersonTrackers: true },
    });
    expect('displayName' in snapshot.profile.personalDevices[0]).toBe(false);
  });

  it('rejects malformed answers instead of guessing', () => {
    expect(() => parseProfileSnapshot({ owner: {}, profile: {} })).toThrow(ProfileClientError);
    expect(() => parseProfileSnapshot(null)).toThrow(ProfileClientError);
    const valid = {
      owner: { user_id: 'u', person_id: null, person_entity_id: null, person_status: 'unknown' },
      persisted: false,
      revision: 0,
      profile: { revision: 0, state: 'active', created_at: null, updated_at: null, notifications: { enabled: true }, personal_devices: [] },
      live_devices: [{ device_id: 'pd', status: 'weird' }],
    };
    expect(() => parseProfileSnapshot(valid)).toThrow(ProfileClientError);
  });

  it('never marks a candidate without a device, or not available, as addable', () => {
    const base = {
      display_name: 'x',
      kind: 'phone',
      capabilities: { notifications: true, presence: false },
      notification_target_status: 'ready',
      presence: { tracker_entity_ids: [], in_person_trackers: false },
    };
    const result = parseDiscoveryResult({
      revision: 3,
      devices: [
        { ...base, ha_device_id: null, status: 'available', claimable: true },
        { ...base, ha_device_id: 'ha-2', status: 'owned_by_other', claimable: true },
        { ...base, ha_device_id: 'ha-3', status: 'available', claimable: true },
      ],
    });
    expect(result.devices.map((device) => device.claimable)).toEqual([false, false, true]);
  });

  it('sends only what each command needs, always with the expected revision', async () => {
    const backend = createFakeProfileBackend({ haDevices: [{ haDeviceId: 'ha-1', displayName: 'Pixel' }] });
    await getSelf(backend.callApi);
    await discoverDevices(backend.callApi);
    await addDevice(backend.callApi, 0, 'ha-1');
    await updateDevice(backend.callApi, 1, 'pd_1', { notificationsEnabled: false });
    await updateDevice(backend.callApi, 2, 'pd_1', { label: '  Lavoro  ' });
    await saveNotifications(backend.callApi, 3, false);
    await removeDevice(backend.callApi, 4, 'pd_1');

    expect(backend.messages).toEqual([
      { type: 'domusos/profile/get_self' },
      { type: 'domusos/profile/discover_devices' },
      { type: 'domusos/profile/add_device', expected_revision: 0, ha_device_id: 'ha-1' },
      { type: 'domusos/profile/update_device', expected_revision: 1, device_id: 'pd_1', notifications: { enabled: false } },
      { type: 'domusos/profile/update_device', expected_revision: 2, device_id: 'pd_1', label: '  Lavoro  ' },
      { type: 'domusos/profile/save_self', expected_revision: 3, profile: { notifications: { enabled: false } } },
      { type: 'domusos/profile/remove_device', expected_revision: 4, device_id: 'pd_1' },
    ]);
    for (const message of backend.messages) {
      const keys = Object.keys(message).filter((key) => key !== 'device_id');
      expect(keys.some((key) => FORBIDDEN_KEYS.includes(key))).toBe(false);
    }
    // save_self never carries devices.
    expect(JSON.stringify(backend.messages[5])).not.toContain('personal_devices');
  });

  it('sends a cleared label as null', async () => {
    const { callApi, calls } = recordingApi(null);
    await expect(updateDevice(callApi, 4, 'pd_1', { label: null })).rejects.toBeInstanceOf(ProfileClientError);
    expect(calls[0][0]).toEqual({ type: 'domusos/profile/update_device', expected_revision: 4, device_id: 'pd_1', label: null });
    expect(calls[0][1]).toEqual({ reportError: false, throwOnError: true });
  });

  it('normalizes errors to stable codes', () => {
    expect(toProfileClientError({ code: 'revision_conflict', message: 'x' }).code).toBe('revision_conflict');
    expect(toProfileClientError(new Error('Comando rifiutato [device_owned_by_other_profile]')).code).toBe('device_owned_by_other_profile');
    expect(toProfileClientError({ code: 'unknown_command' }).code).toBe('unsupported');
    expect(toProfileClientError(new Error('socket closed')).code).toBe('network');
  });
});
