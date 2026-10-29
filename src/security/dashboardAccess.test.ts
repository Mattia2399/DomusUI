import { describe, expect, it } from 'vitest';
import {
  createDashboardSecurityValue,
  isDashboardAdministrativeApiMessage,
  isDashboardRestartService,
  type DashboardCapability,
} from './dashboardAccess';
import { DEMO_ACCESS, LEGACY_CAPABILITY_MAP, LOADING_ACCESS, accessSnapshot } from './accessControl';
import { accessFor } from '../test/accessFixtures';

const STRUCTURAL_CAPABILITIES: DashboardCapability[] = [
  'edit_dashboard', 'manage_rooms', 'manage_security_config', 'download_backup',
  'restore_backup', 'reset_dashboard', 'developer_mode', 'restart_home_assistant',
  'manage_energy',
];
const USER_ID = 'a'.repeat(32);
const user = { id: USER_ID, isAdmin: true };

type Account = Parameters<typeof createDashboardSecurityValue>[0]['user'];

function security(access: Parameters<typeof createDashboardSecurityValue>[0]['access'], account: Account = user) {
  return createDashboardSecurityValue({ runtimeMode: 'real', haStatus: 'connected', user: account, access });
}

describe('dashboard capability policy, decided by Access Control', () => {
  it('names one Access Control capability for every legacy one', () => {
    expect(Object.keys(LEGACY_CAPABILITY_MAP).sort()).toEqual([...STRUCTURAL_CAPABILITIES].sort());
  });

  it('allows every structural capability to an administrator of a trusted policy', () => {
    const value = security(accessFor('admin', { userId: USER_ID }));
    expect(STRUCTURAL_CAPABILITIES.every((capability) => value.can(capability))).toBe(true);
  });

  it('denies structural actions to a member, whatever Home Assistant says of the account', () => {
    const value = security(accessFor('member', { userId: USER_ID }), { id: USER_ID, isAdmin: true });
    expect(STRUCTURAL_CAPABILITIES.every((capability) => !value.can(capability))).toBe(true);
    expect(value.decisions.edit_dashboard.reason).toBe('not_permitted');
  });

  it('gives a locked administrator nothing but what the safe floor holds', () => {
    const value = security(accessFor('locked', { userId: USER_ID, isAdmin: true }));
    expect(STRUCTURAL_CAPABILITIES.some((capability) => value.can(capability))).toBe(false);
  });

  it('follows the profile, not a flag: an owner without the capability gets nothing', () => {
    const value = security(accessFor('restricted', { userId: USER_ID, isAdmin: true, isOwner: true }), { id: USER_ID, isOwner: true });
    expect(value.can('edit_dashboard')).toBe(false);
    expect(value.can('manage_rooms')).toBe(false);
  });

  it('refuses a profile read for another account', () => {
    const value = security(accessFor('admin', { userId: 'b'.repeat(32) }));
    expect(value.can('edit_dashboard')).toBe(false);
    expect(value.decisions.edit_dashboard.reason).toBe('identity_unavailable');
  });

  it.each([
    ['loading', LOADING_ACCESS, 'identity_resolving'],
    ['error', accessSnapshot('error'), 'identity_unavailable'],
    ['unavailable', accessSnapshot('unavailable'), 'identity_unavailable'],
  ] as const)('fails closed while the profile is %s', (_label, access, reason) => {
    const value = security(access);
    expect(value.can('edit_dashboard')).toBe(false);
    expect(value.decisions.restore_backup.reason).toBe(reason);
  });

  it.each(['connecting', 'disconnected', 'error'] as const)('fails closed while identity is %s', (haStatus) => {
    const value = createDashboardSecurityValue({ runtimeMode: 'real', haStatus, user: null, access: LOADING_ACCESS });
    expect(value.can('edit_dashboard')).toBe(false);
    expect(value.can('restore_backup')).toBe(false);
  });

  it('allows editing only inside Demo and denies HA/security administration', () => {
    const value = createDashboardSecurityValue({ runtimeMode: 'demo', haStatus: 'disconnected', user: null, access: DEMO_ACCESS });
    expect(value.can('edit_dashboard')).toBe(true);
    expect(value.can('manage_rooms')).toBe(false);
    expect(value.can('manage_security_config')).toBe(false);
    expect(value.can('restart_home_assistant')).toBe(false);
    expect(value.can('manage_energy')).toBe(false);
  });

  it('classifies administrative mutations separately from reads and entity commands', () => {
    expect(isDashboardAdministrativeApiMessage({ type: 'config/area_registry/update' })).toBe(true);
    expect(isDashboardAdministrativeApiMessage({ type: 'frontend/set_system_data' })).toBe(true);
    expect(isDashboardAdministrativeApiMessage({ type: 'frontend/get_system_data' })).toBe(false);
    expect(isDashboardAdministrativeApiMessage({ type: 'config/area_registry/list' })).toBe(false);
    expect(isDashboardAdministrativeApiMessage({ type: 'domusos/energy/save_profile' })).toBe(true);
    expect(isDashboardAdministrativeApiMessage({ type: 'domusos/energy/discover' })).toBe(true);
    expect(isDashboardAdministrativeApiMessage({ type: 'domusos/energy/get_profile' })).toBe(true);
    expect(isDashboardAdministrativeApiMessage({ type: 'domusos/energy/get_state' })).toBe(false);
    expect(isDashboardAdministrativeApiMessage({ type: 'domusos/access/get_self' })).toBe(false);
    expect(isDashboardRestartService('homeassistant', 'restart')).toBe(true);
    expect(isDashboardRestartService('homeassistant', 'update_entity')).toBe(false);
  });
});
