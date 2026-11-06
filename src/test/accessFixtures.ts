/**
 * Access profiles for tests, resolved as the backend resolves them
 * (`resolve_access_profile` in access/models.py). A contract test keeps the
 * role table and the administrator-only list equal to the backend's.
 */

import {
  ACCESS_CAPABILITY_IDS,
  snapshotForProfile,
  type AccessCapability,
  type AccessPolicyState,
  type AccessProfile,
  type AccessRole,
  type AccessSnapshot,
} from '../security/accessControl';

export const ROLE_CAPABILITIES: Readonly<Record<AccessRole, readonly AccessCapability[]>> = {
  admin: ACCESS_CAPABILITY_IDS,
  resident: [
    'dashboard.view', 'rooms.view', 'devices.control', 'devices.timers', 'access.control', 'security.view', 'security.control',
    'automations.view', 'automations.run', 'energy.view', 'climate.view', 'irrigation.view', 'irrigation.control', 'waste.view',
    'people.view', 'system.view', 'device.manage', 'profile.manage',
  ],
  member: [
    'dashboard.view', 'rooms.view', 'devices.control', 'devices.timers', 'security.view', 'automations.view', 'automations.run',
    'energy.view', 'climate.view', 'irrigation.view', 'irrigation.control', 'waste.view', 'people.view', 'system.view',
    'device.manage', 'profile.manage',
  ],
  restricted: ['dashboard.view', 'rooms.view', 'devices.control', 'devices.timers', 'irrigation.view', 'waste.view', 'profile.manage'],
  wall_panel: [
    'dashboard.view', 'rooms.view', 'devices.control', 'devices.timers', 'security.view', 'automations.run', 'energy.view',
    'climate.view', 'irrigation.view', 'waste.view',
  ],
  locked: ['dashboard.view', 'rooms.view', 'profile.manage'],
};

/** What Home Assistant keeps to its administrators, whatever the Domus role. */
export const HA_ADMIN_ONLY: readonly AccessCapability[] = [
  'dashboard.edit', 'dashboard.reset', 'security.manage', 'automations.manage', 'energy.manage',
  'climate.manage', 'irrigation.manage', 'waste.manage', 'house.manage', 'people.manage', 'access.manage', 'system.manage',
  'backup.restore', 'ha.restart', 'device_power.manage', 'notifications.recipients',
];

export const TEST_USER_ID = 'a'.repeat(32);

type ProfileOptions = {
  isAdmin?: boolean;
  isOwner?: boolean;
  grants?: readonly AccessCapability[];
  userId?: string;
  policyState?: AccessPolicyState;
  revision?: number;
};

export function accessProfileFor(role: AccessRole, options: ProfileOptions = {}): AccessProfile {
  const isAdmin = options.isAdmin ?? role === 'admin';
  const grants = options.grants ?? [];
  const capabilities = new Set<AccessCapability>(
    [...ROLE_CAPABILITIES[role], ...grants].filter((capability) => isAdmin || !HA_ADMIN_ONLY.includes(capability)),
  );
  if (isAdmin) capabilities.add('access.manage');
  return {
    userId: options.userId ?? TEST_USER_ID,
    isAdmin,
    isOwner: options.isOwner ?? false,
    role,
    assigned: role !== 'admin' && role !== 'member' && role !== 'locked',
    grants,
    capabilities,
    policyState: options.policyState ?? (role === 'locked' ? 'corrupt' : 'absent'),
    revision: options.revision ?? 0,
  };
}

export function accessFor(role: AccessRole, options: ProfileOptions = {}): AccessSnapshot {
  return snapshotForProfile(accessProfileFor(role, options));
}

/** The answer `domusos/access/get_self` gives for this profile. */
export function getSelfAnswer(profile: AccessProfile) {
  return {
    principal: { user_id: profile.userId, is_admin: profile.isAdmin, is_owner: profile.isOwner },
    access: {
      role: profile.role,
      assigned: profile.assigned,
      grants: [...profile.grants],
      capabilities: [...profile.capabilities].sort(),
      state: profile.policyState,
      revision: profile.revision,
    },
  };
}

export type TestAccount = { id: string; isOwner?: boolean; isAdmin?: boolean };

/** The Access Control profile Home Assistant and Domus give this account by default. */
export function defaultAccessFor(user: TestAccount): AccessSnapshot {
  const isAdmin = user.isOwner === true || user.isAdmin === true;
  return accessFor(isAdmin ? 'admin' : 'member', { userId: user.id, isAdmin, isOwner: user.isOwner === true });
}
