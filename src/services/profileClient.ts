/**
 * Domus Profile client: the signed-in user's profile and personal devices.
 *
 * Every command acts on the user of the Home Assistant connection; none takes
 * a user, person or owner id. The backend is the authority for ownership,
 * conflicts and notification targets: this client only sends what the user
 * chose and parses what the server answered.
 */

export type ProfileCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

export type DeviceKind = 'phone' | 'tablet' | 'computer' | 'other';
export type NotificationTargetStatus = 'ready' | 'unavailable' | 'ambiguous' | 'unsupported';
export type LiveDeviceStatus = 'active' | 'unverified' | 'ownership_conflict' | 'unavailable' | 'missing';
export type DiscoveryStatus =
  | 'available'
  | 'already_owned'
  | 'owned_by_other'
  | 'ownership_conflict'
  | 'missing'
  | 'unavailable';
export type PersonStatus = 'resolved' | 'unknown' | 'ambiguous';

export type PresenceSummary = {
  trackerEntityIds: string[];
  /** Read only: whether one of the trackers is among the person's in Home Assistant. */
  inPersonTrackers: boolean;
};

export type DeviceCapabilities = {
  notifications: boolean;
  presence: boolean;
};

/** A device as stored in the profile: what the user chose. */
export type PersonalDevice = {
  id: string;
  haDeviceId: string;
  label?: string;
  addedAt: string;
  notificationsEnabled: boolean;
};

/** A stored device as Home Assistant sees it right now; never stored. */
export type LivePersonalDevice = {
  deviceId: string;
  status: LiveDeviceStatus;
  displayName: string | null;
  kind: DeviceKind;
  capabilities: DeviceCapabilities;
  notificationTargetStatus: NotificationTargetStatus;
  presence: PresenceSummary;
};

export type DomusProfile = {
  revision: number;
  state: 'active' | 'orphaned';
  createdAt: string | null;
  updatedAt: string | null;
  /** The general switch for Domus notifications of this user. */
  notificationsEnabled: boolean;
  personalDevices: PersonalDevice[];
};

export type ProfileOwner = {
  userId: string;
  personId: string | null;
  personEntityId: string | null;
  personStatus: PersonStatus;
};

export type ProfileSnapshot = {
  owner: ProfileOwner;
  persisted: boolean;
  /** Stored data, exactly as saved. */
  profile: DomusProfile;
  /** Live data derived from Home Assistant on this request. */
  liveDevices: LivePersonalDevice[];
  revision: number;
};

export type DiscoveryCandidate = {
  /** Absent when the app registration has no device in Home Assistant. */
  haDeviceId: string | null;
  displayName: string | null;
  kind: DeviceKind;
  status: DiscoveryStatus;
  claimable: boolean;
  capabilities: DeviceCapabilities;
  notificationTargetStatus: NotificationTargetStatus;
  presence: PresenceSummary;
};

export type DiscoveryResult = {
  devices: DiscoveryCandidate[];
  revision: number;
};

export const PROFILE_ERROR_CODES = [
  'revision_conflict',
  'device_not_found',
  'device_not_claimable',
  'device_owned_by_other_profile',
  'device_ownership_conflict',
  'too_many_devices',
  'invalid_device',
  'device_not_in_profile',
  'device_management_not_available',
  'invalid_profile',
  'profile_unavailable',
  'store_corrupt',
  'account_disabled',
  'not_household_account',
  'unsupported',
  'invalid_response',
  'network',
] as const;

export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];

export class ProfileClientError extends Error {
  constructor(public readonly code: ProfileErrorCode) {
    super(code);
    this.name = 'ProfileClientError';
  }
}

export const MAX_DEVICE_LABEL_LENGTH = 64;

const KINDS: readonly DeviceKind[] = ['phone', 'tablet', 'computer', 'other'];
const TARGETS: readonly NotificationTargetStatus[] = ['ready', 'unavailable', 'ambiguous', 'unsupported'];
const LIVE_STATUSES: readonly LiveDeviceStatus[] = ['active', 'unverified', 'ownership_conflict', 'unavailable', 'missing'];
const DISCOVERY_STATUSES: readonly DiscoveryStatus[] = [
  'available', 'already_owned', 'owned_by_other', 'ownership_conflict', 'missing', 'unavailable',
];
const PERSON_STATUSES: readonly PersonStatus[] = ['resolved', 'unknown', 'ambiguous'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

function invalid(): never {
  throw new ProfileClientError('invalid_response');
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : invalid();
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : invalid();
}

function parsePresence(value: unknown): PresenceSummary {
  if (!isRecord(value) || !Array.isArray(value.tracker_entity_ids) || typeof value.in_person_trackers !== 'boolean') {
    return invalid();
  }
  return {
    trackerEntityIds: value.tracker_entity_ids.filter(isString),
    inPersonTrackers: value.in_person_trackers,
  };
}

function parseCapabilities(value: unknown): DeviceCapabilities {
  if (!isRecord(value) || typeof value.notifications !== 'boolean' || typeof value.presence !== 'boolean') {
    return invalid();
  }
  return { notifications: value.notifications, presence: value.presence };
}

function parseDevice(value: unknown): PersonalDevice {
  if (!isRecord(value) || !isString(value.id) || !isString(value.added_at)) return invalid();
  const source = value.source;
  const notifications = value.notifications;
  if (!isRecord(source) || source.kind !== 'ha_device' || !isString(source.ha_device_id)) return invalid();
  if (!isRecord(notifications) || typeof notifications.enabled !== 'boolean') return invalid();
  const device: PersonalDevice = {
    id: value.id,
    haDeviceId: source.ha_device_id,
    addedAt: value.added_at,
    notificationsEnabled: notifications.enabled,
  };
  if (typeof value.label === 'string' && value.label.trim()) device.label = value.label;
  return device;
}

function parseLiveDevice(value: unknown): LivePersonalDevice {
  if (!isRecord(value) || !isString(value.device_id)) return invalid();
  return {
    deviceId: value.device_id,
    status: oneOf(value.status, LIVE_STATUSES),
    displayName: optionalText(value.display_name),
    kind: oneOf(value.kind, KINDS),
    capabilities: parseCapabilities(value.capabilities),
    notificationTargetStatus: oneOf(value.notification_target_status, TARGETS),
    presence: parsePresence(value.presence),
  };
}

export function parseProfileSnapshot(value: unknown): ProfileSnapshot {
  if (!isRecord(value) || !isRecord(value.owner) || !isRecord(value.profile)) return invalid();
  const { owner, profile } = value;
  if (!isString(owner.user_id) || typeof value.persisted !== 'boolean' || !isRevision(value.revision)) return invalid();
  const notifications = profile.notifications;
  if (!isRecord(notifications) || typeof notifications.enabled !== 'boolean') return invalid();
  if (!Array.isArray(profile.personal_devices) || !isRevision(profile.revision)) return invalid();
  const liveDevices = Array.isArray(value.live_devices) ? value.live_devices.map(parseLiveDevice) : invalid();
  return {
    owner: {
      userId: owner.user_id,
      personId: optionalText(owner.person_id),
      personEntityId: optionalText(owner.person_entity_id),
      personStatus: oneOf(owner.person_status, PERSON_STATUSES),
    },
    persisted: value.persisted,
    profile: {
      revision: profile.revision,
      state: oneOf(profile.state, ['active', 'orphaned'] as const),
      createdAt: optionalText(profile.created_at),
      updatedAt: optionalText(profile.updated_at),
      notificationsEnabled: notifications.enabled,
      personalDevices: profile.personal_devices.map(parseDevice),
    },
    liveDevices,
    revision: value.revision,
  };
}

function parseCandidate(value: unknown): DiscoveryCandidate {
  if (!isRecord(value) || typeof value.claimable !== 'boolean') return invalid();
  const haDeviceId = value.ha_device_id === null ? null : isString(value.ha_device_id) ? value.ha_device_id : invalid();
  const status = oneOf(value.status, DISCOVERY_STATUSES);
  return {
    haDeviceId,
    displayName: optionalText(value.display_name),
    kind: oneOf(value.kind, KINDS),
    status,
    // A candidate without a device can never be added, whatever the server said.
    claimable: value.claimable && haDeviceId !== null && status === 'available',
    capabilities: parseCapabilities(value.capabilities),
    notificationTargetStatus: oneOf(value.notification_target_status, TARGETS),
    presence: parsePresence(value.presence),
  };
}

export function parseDiscoveryResult(value: unknown): DiscoveryResult {
  if (!isRecord(value) || !Array.isArray(value.devices) || !isRevision(value.revision)) return invalid();
  return { devices: value.devices.map(parseCandidate), revision: value.revision };
}

/** Normalize websocket and panel-bridge failures into stable profile codes. */
export function toProfileClientError(error: unknown): ProfileClientError {
  if (error instanceof ProfileClientError) return error;
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : String(error ?? '');
  const rawCode = isRecord(error) && typeof error.code === 'string'
    ? error.code
    : message.match(/\[([a-z_]+)\]\s*$/)?.[1] ?? '';
  if ((PROFILE_ERROR_CODES as readonly string[]).includes(rawCode)) {
    return new ProfileClientError(rawCode as ProfileErrorCode);
  }
  if (rawCode === 'unknown_command' || rawCode === 'invalid_format' || /non ammess[oa]/i.test(message)) {
    return new ProfileClientError('unsupported');
  }
  return new ProfileClientError('network');
}

async function call<T>(callApi: ProfileCallApi, message: Record<string, unknown>, parse: (value: unknown) => T) {
  let result: unknown;
  try {
    result = await callApi<unknown>(message, { reportError: false, throwOnError: true });
  } catch (error) {
    throw toProfileClientError(error);
  }
  return parse(result);
}

export function getSelf(callApi: ProfileCallApi) {
  return call(callApi, { type: 'domusos/profile/get_self' }, parseProfileSnapshot);
}

/** Save the general notification switch only; devices never go through save_self. */
export function saveNotifications(callApi: ProfileCallApi, expectedRevision: number, enabled: boolean) {
  return call(
    callApi,
    { type: 'domusos/profile/save_self', expected_revision: expectedRevision, profile: { notifications: { enabled } } },
    parseProfileSnapshot,
  );
}

export function discoverDevices(callApi: ProfileCallApi) {
  return call(callApi, { type: 'domusos/profile/discover_devices' }, parseDiscoveryResult);
}

/** Claim a device the discovery returned; the server generates the record id and date. */
export function addDevice(callApi: ProfileCallApi, expectedRevision: number, haDeviceId: string) {
  return call(
    callApi,
    { type: 'domusos/profile/add_device', expected_revision: expectedRevision, ha_device_id: haDeviceId },
    parseProfileSnapshot,
  );
}

export function removeDevice(callApi: ProfileCallApi, expectedRevision: number, deviceId: string) {
  return call(
    callApi,
    { type: 'domusos/profile/remove_device', expected_revision: expectedRevision, device_id: deviceId },
    parseProfileSnapshot,
  );
}

export type DeviceUpdate = {
  /** `null`, empty or blank clears the Domus label. */
  label?: string | null;
  notificationsEnabled?: boolean;
};

export function updateDevice(callApi: ProfileCallApi, expectedRevision: number, deviceId: string, update: DeviceUpdate) {
  const message: Record<string, unknown> = {
    type: 'domusos/profile/update_device',
    expected_revision: expectedRevision,
    device_id: deviceId,
  };
  if ('label' in update) message.label = update.label ?? null;
  if (update.notificationsEnabled !== undefined) message.notifications = { enabled: update.notificationsEnabled };
  return call(callApi, message, parseProfileSnapshot);
}
