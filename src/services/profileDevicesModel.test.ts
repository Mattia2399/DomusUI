import { describe, expect, it } from 'vitest';
import { getSelf, parseDiscoveryResult, type LivePersonalDevice, type PersonalDevice } from './profileClient';
import {
  buildDeviceRows,
  deviceTitle,
  effectiveNotifications,
  normalizeLabelInput,
  presenceLabel,
  sortDiscovery,
} from './profileDevicesModel';
import { createFakeProfileBackend } from '../test/fakeProfileBackend';

const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

const device = (overrides: Partial<PersonalDevice> = {}): PersonalDevice => ({
  id: 'pd_1',
  haDeviceId: 'ha-1',
  addedAt: '2026-01-01T10:00:00+00:00',
  notificationsEnabled: true,
  ...overrides,
});

const live = (overrides: Partial<LivePersonalDevice> = {}): LivePersonalDevice => ({
  deviceId: 'pd_1',
  status: 'active',
  displayName: 'Pixel 8',
  kind: 'phone',
  capabilities: { notifications: true, presence: false },
  notificationTargetStatus: 'ready',
  presence: { trackerEntityIds: [], inPersonTrackers: false },
  ...overrides,
});

describe('profileDevicesModel', () => {
  it('uses the Domus label as title and the Home Assistant name under it', () => {
    expect(deviceTitle(device({ label: 'Lavoro' }), live())).toEqual({ title: 'Lavoro', subtitle: 'Pixel 8' });
    expect(deviceTitle(device({ label: 'Pixel 8' }), live())).toEqual({ title: 'Pixel 8', subtitle: null });
    expect(deviceTitle(device(), live())).toEqual({ title: 'Pixel 8', subtitle: null });
    expect(deviceTitle(device(), undefined)).toEqual({ title: null, subtitle: null });
  });

  it('derives effective notifications without changing either switch', () => {
    expect(effectiveNotifications(true, device(), live())).toBe(true);
    expect(effectiveNotifications(false, device(), live())).toBe(false);
    expect(effectiveNotifications(true, device({ notificationsEnabled: false }), live())).toBe(false);
    expect(effectiveNotifications(true, device(), live({ capabilities: { notifications: false, presence: false } }))).toBe(false);
    expect(effectiveNotifications(true, device(), undefined)).toBe(false);
  });

  it('lists working devices first, then problems, then by name', async () => {
    const backend = createFakeProfileBackend({
      haDevices: [
        { haDeviceId: 'ha-z', displayName: 'Zeta' },
        { haDeviceId: 'ha-a', displayName: 'alfa' },
        { haDeviceId: 'ha-off', displayName: 'Beta', status: 'unavailable' },
        { haDeviceId: 'ha-conf', displayName: 'Aaa', status: 'ownership_conflict' },
      ],
      owned: [
        { haDeviceId: 'ha-gone', label: 'Vecchio' },
        { haDeviceId: 'ha-conf' },
        { haDeviceId: 'ha-off' },
        { haDeviceId: 'ha-z' },
        { haDeviceId: 'ha-a' },
      ],
      generalEnabled: false,
    });
    const rows = buildDeviceRows(await getSelf(backend.callApi), collator);
    expect(rows.map((row) => [row.title, row.status])).toEqual([
      ['alfa', 'active'],
      ['Zeta', 'active'],
      ['Beta', 'unavailable'],
      ['Aaa', 'ownership_conflict'],
      ['Vecchio', 'missing'],
    ]);
    // General off: nothing is effective, the stored device values are untouched.
    expect(rows.every((row) => !row.effectiveNotifications && row.device.notificationsEnabled)).toBe(true);
  });

  it('treats a device the server did not describe as missing', async () => {
    const backend = createFakeProfileBackend({ owned: [{ haDeviceId: 'ha-1' }] });
    const snapshot = await getSelf(backend.callApi);
    const rows = buildDeviceRows({ ...snapshot, liveDevices: [] }, collator);
    expect(rows[0].status).toBe('missing');
    expect(rows[0].live).toBeUndefined();
  });

  it('orders the discovery: addable, already mine, the rest', () => {
    const base = {
      kind: 'phone',
      capabilities: { notifications: true, presence: false },
      notification_target_status: 'ready',
      presence: { tracker_entity_ids: [], in_person_trackers: false },
    };
    const { devices } = parseDiscoveryResult({
      revision: 1,
      devices: [
        { ...base, ha_device_id: 'a', display_name: 'Conflitto', status: 'ownership_conflict', claimable: false },
        { ...base, ha_device_id: 'b', display_name: 'Mio', status: 'already_owned', claimable: false },
        { ...base, ha_device_id: 'c', display_name: 'Zeta', status: 'available', claimable: true },
        { ...base, ha_device_id: 'd', display_name: 'Alfa', status: 'available', claimable: true },
      ],
    });
    expect(sortDiscovery(devices, collator).map((device) => device.displayName)).toEqual(['Alfa', 'Zeta', 'Mio', 'Conflitto']);
  });

  it('describes presence without managing it', () => {
    expect(presenceLabel(undefined)).toBe('profile.devices.presence.none');
    expect(presenceLabel(live())).toBe('profile.devices.presence.none');
    expect(presenceLabel(live({ presence: { trackerEntityIds: ['device_tracker.p'], inPersonTrackers: false } }))).toBe(
      'profile.devices.presence.available',
    );
    expect(presenceLabel(live({ presence: { trackerEntityIds: ['device_tracker.p'], inPersonTrackers: true } }))).toBe(
      'profile.devices.presence.managed',
    );
  });

  it('mirrors the server label rule', () => {
    expect(normalizeLabelInput('  Lavoro ')).toEqual({ label: 'Lavoro', tooLong: false });
    expect(normalizeLabelInput('   ')).toEqual({ label: null, tooLong: false });
    expect(normalizeLabelInput('')).toEqual({ label: null, tooLong: false });
    expect(normalizeLabelInput('x'.repeat(64)).tooLong).toBe(false);
    expect(normalizeLabelInput('x'.repeat(65)).tooLong).toBe(true);
  });
});
