import type { DashboardRuntimeMode } from '../../security/dashboardAccess';

export function getRoomsRuntimeStorageKey(baseKey: string, runtimeMode: DashboardRuntimeMode) {
  return runtimeMode === 'demo' ? `${baseKey}.demo` : baseKey;
}
