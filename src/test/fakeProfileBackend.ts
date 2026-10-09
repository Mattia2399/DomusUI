/**
 * In-memory stand-in for the `domusos/profile/*` commands, speaking the same
 * wire format and revision rules as the integration. Test-only.
 */
import type { DeviceKind, LiveDeviceStatus, NotificationTargetStatus, ProfileCallApi } from '../services/profileClient';

export type FakeHaDevice = {
  haDeviceId: string;
  displayName: string | null;
  kind?: DeviceKind;
  /** Live status once the device is in the profile; `missing` once Home Assistant forgets it. */
  status?: LiveDeviceStatus;
  /** How the discovery reports it; defaults to available. */
  discovery?: 'available' | 'owned_by_other' | 'ownership_conflict' | 'unavailable';
  target?: NotificationTargetStatus;
  trackers?: string[];
  inPersonTrackers?: boolean;
};

type StoredDevice = {
  id: string;
  haDeviceId: string;
  label?: string;
  addedAt: string;
  notificationsEnabled: boolean;
};

export class FakeProfileError extends Error {
  code: string;
  constructor(code: string) {
    super(`Profile command failed [${code}]`);
    this.code = code;
  }
}

export function createFakeProfileBackend({
  haDevices = [],
  owned = [],
  generalEnabled = true,
}: {
  haDevices?: FakeHaDevice[];
  owned?: Array<Partial<StoredDevice> & { haDeviceId: string }>;
  generalEnabled?: boolean;
} = {}) {
  let revision = owned.length > 0 || !generalEnabled ? 1 : 0;
  let notificationsEnabled = generalEnabled;
  let nextId = 1;
  let devices: StoredDevice[] = owned.map((device, index) => ({
    id: device.id ?? `pd_${index + 1}`,
    haDeviceId: device.haDeviceId,
    label: device.label,
    addedAt: device.addedAt ?? `2026-01-0${index + 1}T10:00:00+00:00`,
    notificationsEnabled: device.notificationsEnabled ?? true,
  }));
  nextId = devices.length + 1;
  const messages: Record<string, unknown>[] = [];
  const holds: Array<() => void> = [];
  let holdNext = false;
  const failNext: string[] = [];

  const haDevice = (haDeviceId: string) => haDevices.find((device) => device.haDeviceId === haDeviceId);

  const live = (device: StoredDevice) => {
    const source = haDevice(device.haDeviceId);
    const status = source?.status ?? (source ? 'active' : 'missing');
    const target = source?.target ?? (source ? 'ready' : 'unsupported');
    return {
      device_id: device.id,
      status,
      display_name: source?.displayName ?? null,
      kind: source?.kind ?? 'other',
      capabilities: { notifications: status === 'active' && target === 'ready', presence: (source?.trackers ?? []).length > 0 },
      notification_target_status: target,
      presence: { tracker_entity_ids: source?.trackers ?? [], in_person_trackers: source?.inPersonTrackers ?? false },
    };
  };

  const snapshot = () => ({
    owner: { user_id: 'user-1', person_id: null, person_entity_id: null, person_status: 'unknown' },
    persisted: revision > 0,
    revision,
    profile: {
      revision,
      state: 'active',
      created_at: revision > 0 ? '2026-01-01T10:00:00+00:00' : null,
      updated_at: revision > 0 ? '2026-01-01T10:00:00+00:00' : null,
      notifications: { enabled: notificationsEnabled },
      personal_devices: devices.map((device) => ({
        id: device.id,
        source: { kind: 'ha_device', ha_device_id: device.haDeviceId },
        ...(device.label ? { label: device.label } : {}),
        added_at: device.addedAt,
        notifications: { enabled: device.notificationsEnabled },
      })),
    },
    live_devices: devices.map(live),
  });

  const commit = () => {
    revision += 1;
    return snapshot();
  };

  const checkRevision = (message: Record<string, unknown>) => {
    if (message.expected_revision !== revision) throw new FakeProfileError('revision_conflict');
  };

  const handle = (message: Record<string, unknown>) => {
    const failure = failNext.shift();
    if (failure) throw new FakeProfileError(failure);
    switch (message.type) {
      case 'domusos/profile/get_self':
        return snapshot();
      case 'domusos/profile/save_self': {
        checkRevision(message);
        const enabled = (message.profile as { notifications: { enabled: boolean } }).notifications.enabled;
        if (enabled === notificationsEnabled) return snapshot();
        notificationsEnabled = enabled;
        return commit();
      }
      case 'domusos/profile/discover_devices':
        return {
          revision,
          devices: haDevices.map((device) => {
            const mine = devices.some((stored) => stored.haDeviceId === device.haDeviceId);
            const status = mine ? 'already_owned' : device.discovery ?? 'available';
            return {
              ha_device_id: device.haDeviceId,
              display_name: device.displayName,
              kind: device.kind ?? 'phone',
              status,
              claimable: status === 'available',
              confidence: 'verified',
              capabilities: { notifications: true, presence: false },
              notification_target_status: device.target ?? 'ready',
              presence: { tracker_entity_ids: [], in_person_trackers: false },
            };
          }),
        };
      case 'domusos/profile/add_device': {
        checkRevision(message);
        const source = haDevice(String(message.ha_device_id));
        if (!source) throw new FakeProfileError('device_not_found');
        if ((source.discovery ?? 'available') !== 'available') throw new FakeProfileError('device_not_claimable');
        if (devices.some((device) => device.haDeviceId === source.haDeviceId)) return snapshot();
        devices = [...devices, {
          id: `pd_${nextId++}`,
          haDeviceId: source.haDeviceId,
          addedAt: `2026-02-0${nextId}T10:00:00+00:00`,
          notificationsEnabled: true,
        }];
        return commit();
      }
      case 'domusos/profile/remove_device': {
        checkRevision(message);
        if (!devices.some((device) => device.id === message.device_id)) throw new FakeProfileError('device_not_in_profile');
        devices = devices.filter((device) => device.id !== message.device_id);
        return commit();
      }
      case 'domusos/profile/update_device': {
        checkRevision(message);
        const current = devices.find((device) => device.id === message.device_id);
        if (!current) throw new FakeProfileError('device_not_in_profile');
        const next = { ...current };
        if ('label' in message) {
          const label = typeof message.label === 'string' ? message.label.trim() : '';
          if (label.length > 64) throw new FakeProfileError('invalid_device');
          next.label = label || undefined;
        }
        const notifications = message.notifications as { enabled?: boolean } | undefined;
        if (notifications?.enabled !== undefined) next.notificationsEnabled = notifications.enabled;
        if (next.label === current.label && next.notificationsEnabled === current.notificationsEnabled) return snapshot();
        devices = devices.map((device) => (device.id === current.id ? next : device));
        return commit();
      }
      default:
        throw new FakeProfileError('unknown_command');
    }
  };

  const callApi = (async (message: Record<string, unknown>) => {
    messages.push(message);
    if (holdNext) {
      holdNext = false;
      await new Promise<void>((resolve) => holds.push(resolve));
    }
    return handle(message);
  }) as ProfileCallApi;

  return {
    callApi,
    messages,
    get revision() {
      return revision;
    },
    get devices() {
      return devices;
    },
    get notificationsEnabled() {
      return notificationsEnabled;
    },
    /** Another device changes the profile meanwhile. */
    changeElsewhere(update: () => void = () => undefined) {
      update();
      revision += 1;
    },
    renameElsewhere(deviceId: string, label: string) {
      devices = devices.map((device) => (device.id === deviceId ? { ...device, label } : device));
      revision += 1;
    },
    /** Keep the next command waiting until `release` is called. */
    holdNextCommand() {
      holdNext = true;
    },
    release() {
      holds.splice(0).forEach((resolve) => resolve());
    },
    failNextCommand(code: string) {
      failNext.push(code);
    },
    forgetHaDevice(haDeviceId: string) {
      haDevices = haDevices.filter((device) => device.haDeviceId !== haDeviceId);
    },
  };
}

export type FakeProfileBackend = ReturnType<typeof createFakeProfileBackend>;
