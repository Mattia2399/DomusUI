import { HASS_TOKENS_KEY } from './haLiveConfig';
import type { DashboardRuntimeMode } from '../security/dashboardAccess';

export const DASHBOARD_RUNTIME_MODE_STORAGE_KEY = 'ha.dashboard.runtimeMode.v1';
export const REAL_DASHBOARD_LAYOUT_STORAGE_KEY = 'ha.dashboard.builder.layout.v1';
export const DEMO_DASHBOARD_LAYOUT_STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
export const REAL_DASHBOARD_RECOVERY_STORAGE_KEY = 'ha.dashboard.builder.layout.recovery.v1';
export const DEMO_DASHBOARD_RECOVERY_STORAGE_KEY = 'ha.dashboard.demo.builder.layout.recovery.v1';

export function readStoredDashboardRuntimeMode(storage?: Storage): DashboardRuntimeMode | null {
  if (!storage) {
    return null;
  }
  const value = storage.getItem(DASHBOARD_RUNTIME_MODE_STORAGE_KEY);
  return value === 'real' || value === 'demo' ? value : null;
}

export function resolveInitialDashboardRuntimeMode(params: {
  storage?: Storage;
  isManagedByParent: boolean;
  hasManualToken: boolean;
}): DashboardRuntimeMode | null {
  const stored = readStoredDashboardRuntimeMode(params.storage);
  if (params.isManagedByParent || params.hasManualToken) {
    return 'real';
  }
  if (stored) {
    return stored;
  }
  if (
    params.storage?.getItem(HASS_TOKENS_KEY) ||
    params.storage?.getItem(REAL_DASHBOARD_LAYOUT_STORAGE_KEY)
  ) {
    return 'real';
  }
  return null;
}

export function persistDashboardRuntimeMode(mode: DashboardRuntimeMode, storage?: Storage) {
  storage?.setItem(DASHBOARD_RUNTIME_MODE_STORAGE_KEY, mode);
}

export function getDashboardLayoutStorageKey(mode: DashboardRuntimeMode) {
  return mode === 'demo' ? DEMO_DASHBOARD_LAYOUT_STORAGE_KEY : REAL_DASHBOARD_LAYOUT_STORAGE_KEY;
}

export function getDashboardRecoveryStorageKey(mode: DashboardRuntimeMode) {
  return mode === 'demo' ? DEMO_DASHBOARD_RECOVERY_STORAGE_KEY : REAL_DASHBOARD_RECOVERY_STORAGE_KEY;
}
