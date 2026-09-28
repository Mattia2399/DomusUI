import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { HaConnectionStatus } from '../hooks/useHaLiveConnection';

export type DashboardRuntimeMode = 'real' | 'demo';

export type DashboardIdentityStatus = 'resolving' | 'authenticated' | 'unavailable';

export type DashboardCapability =
  | 'edit_dashboard'
  | 'manage_rooms'
  | 'manage_security_config'
  | 'download_backup'
  | 'restore_backup'
  | 'reset_dashboard'
  | 'developer_mode'
  | 'restart_home_assistant';

export type DashboardAccessUser = {
  id: string;
  isOwner?: boolean;
  isAdmin?: boolean;
};

export type AccessDecision = {
  allowed: boolean;
  reason?: 'demo_restricted' | 'identity_resolving' | 'identity_unavailable' | 'admin_required';
};

export type DashboardSecurityValue = {
  runtimeMode: DashboardRuntimeMode;
  identityStatus: DashboardIdentityStatus;
  user: DashboardAccessUser | null;
  decisions: Record<DashboardCapability, AccessDecision>;
  can: (capability: DashboardCapability) => boolean;
};

const ALL_CAPABILITIES: DashboardCapability[] = [
  'edit_dashboard',
  'manage_rooms',
  'manage_security_config',
  'download_backup',
  'restore_backup',
  'reset_dashboard',
  'developer_mode',
  'restart_home_assistant',
];

const DEMO_CAPABILITIES = new Set<DashboardCapability>([
  'edit_dashboard',
  'download_backup',
  'restore_backup',
  'reset_dashboard',
  'developer_mode',
]);

const ADMINISTRATIVE_API_TYPES = new Set([
  'config/area_registry/create',
  'config/area_registry/update',
  'config/area_registry/delete',
  'config/floor_registry/create',
  'config/floor_registry/update',
  'config/floor_registry/reorder',
  'config/floor_registry/delete',
  'config/device_registry/update',
  'config/entity_registry/update',
  'frontend/set_system_data',
  'person/update',
  'person/create',
]);

export function isDashboardAdministrativeApiMessage(message: Record<string, unknown>) {
  return typeof message.type === 'string' && ADMINISTRATIVE_API_TYPES.has(message.type);
}

export function isDashboardRestartService(domain: string, service: string) {
  return domain.trim().toLowerCase() === 'homeassistant' && service.trim().toLowerCase() === 'restart';
}

export function resolveDashboardIdentityStatus(params: {
  runtimeMode: DashboardRuntimeMode;
  haStatus: HaConnectionStatus;
  user: DashboardAccessUser | null;
}): DashboardIdentityStatus {
  if (params.runtimeMode === 'demo') {
    return 'unavailable';
  }
  if (params.haStatus === 'connected' && params.user) {
    return 'authenticated';
  }
  if (params.haStatus === 'connecting' || (params.haStatus === 'connected' && !params.user)) {
    return 'resolving';
  }
  return 'unavailable';
}

export function resolveDashboardAccessDecision(params: {
  capability: DashboardCapability;
  runtimeMode: DashboardRuntimeMode;
  identityStatus: DashboardIdentityStatus;
  user: DashboardAccessUser | null;
}): AccessDecision {
  if (params.runtimeMode === 'demo') {
    return DEMO_CAPABILITIES.has(params.capability)
      ? { allowed: true }
      : { allowed: false, reason: 'demo_restricted' };
  }
  if (params.identityStatus === 'resolving') {
    return { allowed: false, reason: 'identity_resolving' };
  }
  if (params.identityStatus !== 'authenticated' || !params.user) {
    return { allowed: false, reason: 'identity_unavailable' };
  }
  if (params.user.isOwner || params.user.isAdmin) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'admin_required' };
}

export function createDashboardSecurityValue(params: {
  runtimeMode: DashboardRuntimeMode;
  haStatus: HaConnectionStatus;
  user: DashboardAccessUser | null;
}): DashboardSecurityValue {
  const identityStatus = resolveDashboardIdentityStatus(params);
  const decisions = Object.fromEntries(
    ALL_CAPABILITIES.map((capability) => [
      capability,
      resolveDashboardAccessDecision({
        capability,
        runtimeMode: params.runtimeMode,
        identityStatus,
        user: params.user,
      }),
    ]),
  ) as Record<DashboardCapability, AccessDecision>;

  return {
    runtimeMode: params.runtimeMode,
    identityStatus,
    user: params.user,
    decisions,
    can: (capability) => decisions[capability].allowed,
  };
}

const fallbackSecurityValue = createDashboardSecurityValue({
  runtimeMode: 'real',
  haStatus: 'disconnected',
  user: null,
});

const DashboardSecurityContext = createContext<DashboardSecurityValue>(fallbackSecurityValue);

export function DashboardSecurityProvider({
  value,
  children,
}: {
  value: DashboardSecurityValue;
  children: ReactNode;
}) {
  const stableValue = useMemo(() => value, [value]);
  return <DashboardSecurityContext.Provider value={stableValue}>{children}</DashboardSecurityContext.Provider>;
}

export function useDashboardSecurity() {
  return useContext(DashboardSecurityContext);
}
