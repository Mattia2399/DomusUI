import { beforeEach, describe, expect, it } from 'vitest';
import {
  DASHBOARD_RESET_MARKER_SCHEMA,
  completeDashboardResetMarker,
  createDashboardResetMarker,
  parseDashboardResetMarker,
} from './dashboardReset';
import {
  DASHBOARD_RESET_ACK_STORAGE_KEY,
  invalidateLocalDashboardAfterAuthoritativeReset,
} from './dashboardResetClient';
import {
  DASHBOARD_RUNTIME_MODE_STORAGE_KEY,
  REAL_DASHBOARD_LAYOUT_STORAGE_KEY,
  REAL_DASHBOARD_RECOVERY_STORAGE_KEY,
} from './dashboardRuntime';
import { getDashboardEditDraftKey } from './dashboardEditDraft';
import { SHARED_HOUSE_CONFIGURATION_CACHE_KEY } from './localDashboardConfigurationCache';
import {
  IRRIGATION_CONFIGURATION_CACHE_KEY,
  IRRIGATION_DEMO_CONFIGURATION_CACHE_KEY,
} from './haAppConfigurationsRepository';
import { SETUP_JOURNEY_STORAGE_KEY } from './setupJourney';
import {
  LEGACY_WIDGET_SECRETS_STORAGE_KEY,
  WIDGET_SECRETS_STORAGE_KEY,
} from './widgetSecrets';

describe('dashboard reset marker', () => {
  it('round-trips pending and complete markers and rejects malformed values', () => {
    const pending = createDashboardResetMarker('owner-1', 'reset-123456');
    expect(parseDashboardResetMarker(pending)).toEqual(pending);
    const complete = completeDashboardResetMarker(pending);
    expect(parseDashboardResetMarker(complete)).toEqual(complete);
    expect(parseDashboardResetMarker({ ...complete, schema: 'wrong' })).toBeNull();
    expect(parseDashboardResetMarker({
      schema: DASHBOARD_RESET_MARKER_SCHEMA,
      version: 1,
      resetId: 'short',
      status: 'complete',
      requestedAt: 'not-a-date',
      requestedByUserId: 'owner-1',
    })).toBeNull();
  });
});

describe('remote authoritative reset invalidation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('clears stale dashboard data but preserves HA credentials and personal preferences', () => {
    const staleKeys = [
      REAL_DASHBOARD_LAYOUT_STORAGE_KEY,
      REAL_DASHBOARD_RECOVERY_STORAGE_KEY,
      SHARED_HOUSE_CONFIGURATION_CACHE_KEY,
      WIDGET_SECRETS_STORAGE_KEY,
      LEGACY_WIDGET_SECRETS_STORAGE_KEY,
      IRRIGATION_CONFIGURATION_CACHE_KEY,
      IRRIGATION_DEMO_CONFIGURATION_CACHE_KEY,
    ];
    staleKeys.forEach((key) => window.localStorage.setItem(key, 'stale'));
    window.sessionStorage.setItem(getDashboardEditDraftKey('real'), 'stale-draft');
    window.localStorage.setItem('hass_auth_tokens', 'keep-token');
    window.localStorage.setItem('ha-external-dashboard:ha-live:v1', 'keep-connection');
    window.localStorage.setItem('ha.dashboard.themeMode.v1', 'dark');
    window.localStorage.setItem(DASHBOARD_RUNTIME_MODE_STORAGE_KEY, 'real');

    const marker = completeDashboardResetMarker(
      createDashboardResetMarker('owner-1', 'reset-123456'),
    );
    invalidateLocalDashboardAfterAuthoritativeReset(
      window.localStorage,
      window.sessionStorage,
      marker,
    );

    staleKeys.forEach((key) => expect(window.localStorage.getItem(key)).toBeNull());
    expect(window.sessionStorage.getItem(getDashboardEditDraftKey('real'))).toBeNull();
    expect(window.localStorage.getItem('hass_auth_tokens')).toBe('keep-token');
    expect(window.localStorage.getItem('ha-external-dashboard:ha-live:v1')).toBe('keep-connection');
    expect(window.localStorage.getItem('ha.dashboard.themeMode.v1')).toBe('dark');
    expect(window.localStorage.getItem(DASHBOARD_RUNTIME_MODE_STORAGE_KEY)).toBe('real');
    expect(window.localStorage.getItem(DASHBOARD_RESET_ACK_STORAGE_KEY)).toBe(marker.resetId);
    expect(JSON.parse(window.localStorage.getItem(SETUP_JOURNEY_STORAGE_KEY) ?? '{}')).toMatchObject({
      phase: 'welcome',
      mode: null,
    });
  });
});
