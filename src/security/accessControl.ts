/**
 * Domus Access Control in the browser: what the interface shows, from the
 * profile the backend resolved (docs/access-control-frontend.md).
 *
 * The only source is `domusos/access/get_self`, asked on the account's own
 * connection. Nothing here is a security boundary: the browser can always be
 * changed, and Home Assistant and the Domus backend decide on every request.
 * This only keeps the interface coherent with what the account may do.
 *
 * Never stored: a reload asks the backend again.
 */

import type { DashboardCapability } from './dashboardAccess';

/** The capability registry of the backend (`access/models.py`); a contract test keeps them equal. */
export const ACCESS_CAPABILITY_IDS = [
  'dashboard.view',
  'dashboard.edit',
  'dashboard.reset',
  'rooms.view',
  'devices.control',
  'devices.timers',
  'access.control',
  'security.view',
  'security.control',
  'security.manage',
  'automations.view',
  'automations.run',
  'automations.manage',
  'energy.view',
  'energy.manage',
  'climate.view',
  'climate.manage',
  'irrigation.view',
  'irrigation.control',
  'irrigation.manage',
  'waste.view',
  'waste.manage',
  'house.manage',
  'people.view',
  'people.manage',
  'access.manage',
  'system.view',
  'system.manage',
  'backup.export',
  'backup.restore',
  'ha.restart',
  'ha_frontend.open',
  'device.manage',
  'device_power.manage',
  'profile.manage',
  'notifications.recipients',
  'developer.use',
] as const;

export type AccessCapability = (typeof ACCESS_CAPABILITY_IDS)[number];

const KNOWN_CAPABILITIES: ReadonlySet<string> = new Set(ACCESS_CAPABILITY_IDS);

export function isAccessCapability(value: unknown): value is AccessCapability {
  return typeof value === 'string' && KNOWN_CAPABILITIES.has(value);
}

export const ACCESS_ROLES = ['admin', 'resident', 'member', 'restricted', 'wall_panel', 'locked'] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

/** What the backend says of its policy store; the backend has already resolved the profile from it. */
export const ACCESS_POLICY_STATES = ['absent', 'ready', 'corrupt', 'unsupported', 'migration_failed'] as const;
export type AccessPolicyState = (typeof ACCESS_POLICY_STATES)[number];

/**
 * - `loading`: no profile yet for this account and connection;
 * - `ready`: the profile of a trusted policy;
 * - `locked`: the policy cannot be trusted, the account is on the safe floor;
 * - `error`: the profile could not be read (network, unexpected answer);
 * - `unavailable`: this Home Assistant has no Domus access control to ask.
 * Only `ready` and `locked` ever grant anything.
 */
export type AccessStatus = 'loading' | 'ready' | 'locked' | 'error' | 'unavailable';

export type AccessProfile = Readonly<{
  userId: string;
  isAdmin: boolean;
  isOwner: boolean;
  role: AccessRole;
  assigned: boolean;
  grants: readonly AccessCapability[];
  capabilities: ReadonlySet<AccessCapability>;
  policyState: AccessPolicyState;
  revision: number;
}>;

export type AccessSnapshot = Readonly<{
  status: AccessStatus;
  /** Present only for `ready` and `locked`. */
  profile: AccessProfile | null;
  /** O(1), synchronous, false for anything unknown or while nothing is granted. */
  can: (capability: AccessCapability) => boolean;
}>;

export class AccessProfileError extends Error {
  constructor(public readonly kind: 'invalid_response' | 'other_account' | 'unavailable' | 'network') {
    super(kind);
    this.name = 'AccessProfileError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new AccessProfileError('invalid_response');
}

/**
 * The answer of `get_self`, checked field by field. Any doubt is an error,
 * never a profile. An answer for another account than the one this browser
 * shows is refused (`expectedUserId`). Unknown capability names are dropped.
 */
export function parseAccessSelf(value: unknown, expectedUserId: string): AccessProfile {
  if (!isRecord(value) || !isRecord(value.principal) || !isRecord(value.access)) {
    throw new AccessProfileError('invalid_response');
  }
  const { principal, access } = value;
  if (typeof principal.user_id !== 'string' || !principal.user_id) throw new AccessProfileError('invalid_response');
  if (principal.user_id !== expectedUserId) throw new AccessProfileError('other_account');
  if (typeof principal.is_admin !== 'boolean' || typeof principal.is_owner !== 'boolean') {
    throw new AccessProfileError('invalid_response');
  }
  if (!Array.isArray(access.capabilities) || !Array.isArray(access.grants) || typeof access.assigned !== 'boolean') {
    throw new AccessProfileError('invalid_response');
  }
  if (typeof access.revision !== 'number' || !Number.isInteger(access.revision) || access.revision < 0) {
    throw new AccessProfileError('invalid_response');
  }
  return {
    userId: principal.user_id,
    isAdmin: principal.is_admin,
    isOwner: principal.is_owner,
    role: oneOf(access.role, ACCESS_ROLES),
    assigned: access.assigned,
    grants: access.grants.filter(isAccessCapability),
    capabilities: new Set(access.capabilities.filter(isAccessCapability)),
    policyState: oneOf(access.state, ACCESS_POLICY_STATES),
    revision: access.revision,
  };
}

/** A failure of `get_self` as the interface tells it: no Domus to ask, or a problem reading it. */
export function toAccessProfileError(error: unknown): AccessProfileError {
  if (error instanceof AccessProfileError) return error;
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : String(error ?? '');
  const code = isRecord(error) && typeof error.code === 'string'
    ? error.code
    : message.match(/\[([a-z_]+)\]\s*$/)?.[1] ?? '';
  // An integration without access control, a panel bridge that does not forward it, or the module down.
  if (code === 'unknown_command' || code === 'access_unavailable' || /non ammess[oa]/i.test(message)) {
    return new AccessProfileError('unavailable');
  }
  return new AccessProfileError('network');
}

const NOTHING = (): boolean => false;

export function accessSnapshot(status: Exclude<AccessStatus, 'ready' | 'locked'>): AccessSnapshot;
export function accessSnapshot(status: AccessStatus, profile: AccessProfile): AccessSnapshot;
export function accessSnapshot(status: AccessStatus, profile?: AccessProfile): AccessSnapshot {
  if (!profile || (status !== 'ready' && status !== 'locked')) {
    return { status: status === 'ready' || status === 'locked' ? 'error' : status, profile: null, can: NOTHING };
  }
  const { capabilities } = profile;
  return { status, profile, can: (capability) => capabilities.has(capability) };
}

/** The snapshot for a profile the backend resolved; a locked role means an untrusted policy. */
export function snapshotForProfile(profile: AccessProfile): AccessSnapshot {
  return accessSnapshot(profile.role === 'locked' ? 'locked' : 'ready', profile);
}

export const LOADING_ACCESS: AccessSnapshot = accessSnapshot('loading');

/**
 * The demo has no Home Assistant and no account: it shows every surface of its
 * own sample house, except going back to a Home Assistant that does not exist.
 * Administrative actions stay limited by `DEMO_CAPABILITIES` (dashboardAccess).
 */
export const DEMO_ACCESS: AccessSnapshot = accessSnapshot('ready', {
  userId: 'demo',
  isAdmin: false,
  isOwner: false,
  role: 'admin',
  assigned: false,
  grants: [],
  capabilities: new Set(ACCESS_CAPABILITY_IDS.filter((capability) => capability !== 'ha_frontend.open')),
  policyState: 'absent',
  revision: 0,
});

/**
 * The capabilities of the interface before Access Control, and the one each
 * now stands for (docs/access-control-capabilities.md#migrazione-delle-capability-esistenti).
 * The names stay for the screens that use them; the decision is the new one.
 */
export const LEGACY_CAPABILITY_MAP: Readonly<Record<DashboardCapability, AccessCapability>> = {
  edit_dashboard: 'dashboard.edit',
  manage_rooms: 'house.manage',
  manage_security_config: 'security.manage',
  download_backup: 'backup.export',
  restore_backup: 'backup.restore',
  reset_dashboard: 'dashboard.reset',
  developer_mode: 'developer.use',
  restart_home_assistant: 'ha.restart',
  manage_energy: 'energy.manage',
};
