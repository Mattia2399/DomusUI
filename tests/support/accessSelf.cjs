/**
 * What `domusos/access/get_self` answers for a simulated Home Assistant user,
 * as the Domus backend resolves it with no stored policy: administrators are
 * Administrators, everyone else a Member (custom_components/domusos/access/models.py).
 * A Vitest contract keeps these tables equal to the frontend fixtures.
 */

const ALL = [
  'dashboard.view', 'dashboard.edit', 'dashboard.reset', 'rooms.view', 'devices.control', 'access.control',
  'security.view', 'security.control', 'security.manage', 'automations.view', 'automations.run',
  'automations.manage', 'energy.view', 'energy.manage', 'irrigation.view', 'irrigation.control',
  'irrigation.manage', 'waste.view', 'waste.manage', 'house.manage', 'people.view', 'people.manage',
  'access.manage', 'system.view', 'system.manage', 'backup.export', 'backup.restore', 'ha.restart',
  'ha_frontend.open', 'device.manage', 'device_power.manage', 'profile.manage', 'notifications.recipients',
  'developer.use',
];

const ROLE_CAPABILITIES = {
  admin: ALL,
  member: [
    'dashboard.view', 'rooms.view', 'devices.control', 'security.view', 'automations.view', 'automations.run',
    'energy.view', 'irrigation.view', 'irrigation.control', 'waste.view', 'people.view', 'system.view',
    'device.manage', 'profile.manage',
  ],
  restricted: ['dashboard.view', 'rooms.view', 'devices.control', 'irrigation.view', 'waste.view', 'profile.manage'],
  wall_panel: [
    'dashboard.view', 'rooms.view', 'devices.control', 'security.view', 'automations.run', 'energy.view',
    'irrigation.view', 'waste.view',
  ],
  locked: ['dashboard.view', 'rooms.view', 'profile.manage'],
};

const HA_ADMIN_ONLY = [
  'dashboard.edit', 'dashboard.reset', 'security.manage', 'automations.manage', 'energy.manage',
  'irrigation.manage', 'waste.manage', 'house.manage', 'people.manage', 'access.manage', 'system.manage',
  'backup.restore', 'ha.restart', 'device_power.manage', 'notifications.recipients',
];

function accessSelfFor(user, { role, grants = [], state } = {}) {
  const isAdmin = user.is_admin === true || user.is_owner === true;
  const resolvedRole = role ?? (isAdmin ? 'admin' : 'member');
  const capabilities = new Set(
    [...ROLE_CAPABILITIES[resolvedRole], ...grants].filter((capability) => isAdmin || !HA_ADMIN_ONLY.includes(capability)),
  );
  if (isAdmin) capabilities.add('access.manage');
  return {
    principal: { user_id: user.id, is_admin: isAdmin, is_owner: user.is_owner === true },
    access: {
      role: resolvedRole,
      assigned: Boolean(role),
      grants,
      capabilities: [...capabilities].sort(),
      state: state ?? (resolvedRole === 'locked' ? 'corrupt' : 'absent'),
      revision: 0,
    },
  };
}

module.exports = { ROLE_CAPABILITIES, HA_ADMIN_ONLY, accessSelfFor };
