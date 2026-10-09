/**
 * Presentation model for the personal devices page. Pure functions only: the
 * backend decides ownership, conflicts and notification targets; this module
 * turns its answers into what the page shows, and never stores anything.
 */

import type { TranslationKey } from '../i18n/translations';
import type {
  DiscoveryCandidate,
  DiscoveryStatus,
  LiveDeviceStatus,
  LivePersonalDevice,
  NotificationTargetStatus,
  PersonalDevice,
  ProfileErrorCode,
  ProfileSnapshot,
} from './profileClient';
import { MAX_DEVICE_LABEL_LENGTH } from './profileClient';

export type PersonalDeviceRow = {
  device: PersonalDevice;
  /** Missing when the server did not describe the device: treated as missing. */
  live: LivePersonalDevice | undefined;
  title: string | null;
  /** The Home Assistant name, shown under a Domus label. */
  subtitle: string | null;
  status: LiveDeviceStatus;
  /**
   * Whether this device would get Domus notifications right now: the general
   * switch, the device switch and a usable target. Derived for display only;
   * the two switches stay separate values and this is never saved.
   */
  effectiveNotifications: boolean;
};

const STATUS_ORDER: Record<LiveDeviceStatus, number> = {
  active: 0,
  unavailable: 1,
  unverified: 2,
  ownership_conflict: 3,
  missing: 4,
};

export const DEVICE_STATUS_LABEL: Record<LiveDeviceStatus, TranslationKey> = {
  active: 'profile.devices.status.active',
  unavailable: 'profile.devices.status.unavailable',
  unverified: 'profile.devices.status.unverified',
  ownership_conflict: 'profile.devices.status.conflict',
  missing: 'profile.devices.status.missing',
};

export const DEVICE_STATUS_HINT: Partial<Record<LiveDeviceStatus, TranslationKey>> = {
  unavailable: 'profile.devices.statusHint.unavailable',
  unverified: 'profile.devices.statusHint.unverified',
  ownership_conflict: 'profile.devices.statusHint.conflict',
  missing: 'profile.devices.statusHint.missing',
};

export const TARGET_STATUS_LABEL: Record<NotificationTargetStatus, TranslationKey> = {
  ready: 'profile.devices.target.ready',
  unavailable: 'profile.devices.target.unavailable',
  ambiguous: 'profile.devices.target.ambiguous',
  unsupported: 'profile.devices.target.unsupported',
};

export const DISCOVERY_STATUS_LABEL: Record<DiscoveryStatus, TranslationKey> = {
  available: 'profile.devices.discovery.available',
  already_owned: 'profile.devices.discovery.alreadyOwned',
  owned_by_other: 'profile.devices.discovery.ownedByOther',
  ownership_conflict: 'profile.devices.discovery.conflict',
  missing: 'profile.devices.discovery.missing',
  unavailable: 'profile.devices.discovery.unavailable',
};

export const PROFILE_ERROR_LABEL: Record<ProfileErrorCode, TranslationKey> = {
  revision_conflict: 'profile.devices.error.revisionConflict',
  device_not_found: 'profile.devices.error.deviceNotFound',
  device_not_claimable: 'profile.devices.error.notClaimable',
  device_owned_by_other_profile: 'profile.devices.error.ownedByOther',
  device_ownership_conflict: 'profile.devices.error.conflict',
  too_many_devices: 'profile.devices.error.tooMany',
  invalid_device: 'profile.devices.error.invalidDevice',
  device_not_in_profile: 'profile.devices.error.notInProfile',
  device_management_not_available: 'profile.devices.error.generic',
  invalid_profile: 'profile.devices.error.generic',
  profile_unavailable: 'profile.devices.error.unavailable',
  store_corrupt: 'profile.devices.error.unavailable',
  account_disabled: 'profile.devices.error.accountDisabled',
  not_household_account: 'profile.devices.error.notHousehold',
  unsupported: 'profile.devices.error.unsupported',
  invalid_response: 'profile.devices.error.generic',
  network: 'profile.devices.error.network',
};

/** The Domus label when set, otherwise the live Home Assistant name. */
export function deviceTitle(device: PersonalDevice, live: LivePersonalDevice | undefined) {
  const label = device.label?.trim();
  const haName = live?.displayName?.trim() || null;
  return label
    ? { title: label, subtitle: haName && haName !== label ? haName : null }
    : { title: haName, subtitle: null };
}

export function effectiveNotifications(
  generalEnabled: boolean,
  device: PersonalDevice,
  live: LivePersonalDevice | undefined,
) {
  return generalEnabled && device.notificationsEnabled && live?.capabilities.notifications === true;
}

/** Devices that work first, problems at the bottom; then by name. */
export function buildDeviceRows(snapshot: ProfileSnapshot, collator: Intl.Collator): PersonalDeviceRow[] {
  const liveById = new Map(snapshot.liveDevices.map((live) => [live.deviceId, live]));
  return snapshot.profile.personalDevices
    .map((device) => {
      const live = liveById.get(device.id);
      const { title, subtitle } = deviceTitle(device, live);
      return {
        device,
        live,
        title,
        subtitle,
        status: live?.status ?? 'missing',
        effectiveNotifications: effectiveNotifications(snapshot.profile.notificationsEnabled, device, live),
      } satisfies PersonalDeviceRow;
    })
    .sort((first, second) =>
      STATUS_ORDER[first.status] - STATUS_ORDER[second.status]
      || collator.compare(first.title ?? '', second.title ?? '')
      || first.device.addedAt.localeCompare(second.device.addedAt));
}

const DISCOVERY_ORDER = (candidate: DiscoveryCandidate) =>
  candidate.claimable ? 0 : candidate.status === 'already_owned' ? 1 : 2;

/** Addable devices first, then the ones already in the profile, then the rest. */
export function sortDiscovery(candidates: DiscoveryCandidate[], collator: Intl.Collator) {
  return [...candidates].sort((first, second) =>
    DISCOVERY_ORDER(first) - DISCOVERY_ORDER(second)
    || collator.compare(first.displayName ?? '', second.displayName ?? ''));
}

/** Presence is Home Assistant's: describe it, never manage it. */
export function presenceLabel(live: LivePersonalDevice | undefined): TranslationKey {
  if (!live || live.presence.trackerEntityIds.length === 0) return 'profile.devices.presence.none';
  return live.presence.inPersonTrackers ? 'profile.devices.presence.managed' : 'profile.devices.presence.available';
}

/** Mirror the server's label rule for the editor: trimmed, empty means no label. */
export function normalizeLabelInput(value: string) {
  const label = value.trim();
  return { label: label || null, tooLong: label.length > MAX_DEVICE_LABEL_LENGTH };
}
