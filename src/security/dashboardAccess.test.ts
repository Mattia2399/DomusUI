import { describe, expect, it } from 'vitest';
import {
  createDashboardSecurityValue,
  isDashboardAdministrativeApiMessage,
  isDashboardRestartService,
  type DashboardCapability,
} from './dashboardAccess';

const STRUCTURAL_CAPABILITIES: DashboardCapability[] = [
  'edit_dashboard', 'manage_rooms', 'manage_security_config', 'download_backup',
  'restore_backup', 'reset_dashboard', 'developer_mode', 'restart_home_assistant',
  'manage_energy',
];

describe('dashboard capability policy', () => {
  it.each([
    ['owner', { id: 'owner', isOwner: true }],
    ['admin', { id: 'admin', isAdmin: true }],
  ])('allows every structural capability to an authenticated %s', (_label, user) => {
    const security = createDashboardSecurityValue({ runtimeMode: 'real', haStatus: 'connected', user });
    expect(STRUCTURAL_CAPABILITIES.every((capability) => security.can(capability))).toBe(true);
  });

  it('denies structural actions to a limited HA user', () => {
    const security = createDashboardSecurityValue({
      runtimeMode: 'real', haStatus: 'connected', user: { id: 'limited' },
    });
    expect(STRUCTURAL_CAPABILITIES.every((capability) => !security.can(capability))).toBe(true);
    expect(security.decisions.edit_dashboard.reason).toBe('admin_required');
  });

  it.each(['connecting', 'disconnected', 'error'] as const)(
    'fails closed while identity is %s',
    (haStatus) => {
      const security = createDashboardSecurityValue({ runtimeMode: 'real', haStatus, user: null });
      expect(security.can('edit_dashboard')).toBe(false);
      expect(security.can('restore_backup')).toBe(false);
    },
  );

  it('allows editing only inside Demo and denies HA/security administration', () => {
    const security = createDashboardSecurityValue({ runtimeMode: 'demo', haStatus: 'disconnected', user: null });
    expect(security.can('edit_dashboard')).toBe(true);
    expect(security.can('manage_rooms')).toBe(false);
    expect(security.can('manage_security_config')).toBe(false);
    expect(security.can('restart_home_assistant')).toBe(false);
    expect(security.can('manage_energy')).toBe(false);
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
    expect(isDashboardRestartService('homeassistant', 'restart')).toBe(true);
    expect(isDashboardRestartService('homeassistant', 'update_entity')).toBe(false);
  });
});
