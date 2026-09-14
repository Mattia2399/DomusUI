import {
  REAL_DASHBOARD_LAYOUT_STORAGE_KEY,
  REAL_DASHBOARD_RECOVERY_STORAGE_KEY,
} from './dashboardRuntime';
import { discardDashboardEditDraft } from './dashboardEditDraft';
import { SHARED_HOUSE_CONFIGURATION_CACHE_KEY } from './localDashboardConfigurationCache';
import { saveSetupJourney } from './setupJourney';
import {
  LEGACY_WIDGET_SECRETS_STORAGE_KEY,
  WIDGET_SECRETS_STORAGE_KEY,
} from './widgetSecrets';
import type { DashboardResetMarker } from './dashboardReset';
import {
  IRRIGATION_CONFIGURATION_CACHE_KEY,
  IRRIGATION_DEMO_CONFIGURATION_CACHE_KEY,
} from './haAppConfigurationsRepository';

export const DASHBOARD_RESET_ACK_STORAGE_KEY = 'domusos.dashboard-reset-ack.v1';

export function acknowledgeAuthoritativeDashboardReset(
  storage: Storage,
  marker: DashboardResetMarker,
) {
  storage.setItem(DASHBOARD_RESET_ACK_STORAGE_KEY, marker.resetId);
}

export function isAuthoritativeDashboardResetAcknowledged(
  storage: Storage,
  marker: DashboardResetMarker,
) {
  return storage.getItem(DASHBOARD_RESET_ACK_STORAGE_KEY) === marker.resetId;
}

/**
 * Invalidates only data that belongs to the reset shared dashboard. Home
 * Assistant credentials, device passkeys, theme and personal preferences are
 * intentionally preserved so another screen can reconnect without being
 * silently logged out.
 */
export function invalidateLocalDashboardAfterAuthoritativeReset(
  storage: Storage,
  sessionStorage?: Storage,
  marker?: DashboardResetMarker,
) {
  const removedKeys = [
    REAL_DASHBOARD_LAYOUT_STORAGE_KEY,
    REAL_DASHBOARD_RECOVERY_STORAGE_KEY,
    SHARED_HOUSE_CONFIGURATION_CACHE_KEY,
    WIDGET_SECRETS_STORAGE_KEY,
    LEGACY_WIDGET_SECRETS_STORAGE_KEY,
    IRRIGATION_CONFIGURATION_CACHE_KEY,
    IRRIGATION_DEMO_CONFIGURATION_CACHE_KEY,
  ];
  removedKeys.forEach((key) => storage.removeItem(key));
  if (sessionStorage) discardDashboardEditDraft(sessionStorage, 'real');
  saveSetupJourney({ phase: 'welcome', mode: null }, storage);
  if (marker) acknowledgeAuthoritativeDashboardReset(storage, marker);
  return removedKeys;
}
