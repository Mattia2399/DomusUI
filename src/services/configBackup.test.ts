import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearManagedDashboardStorage,
  createDashboardBackupPayload,
  parseDashboardBackup,
  restoreDashboardBackup,
  sanitizeDashboardLayoutValue,
} from './configBackup';
import { WIDGET_SECRETS_STORAGE_KEY } from './widgetSecrets';
import { REAL_DASHBOARD_RECOVERY_STORAGE_KEY } from './dashboardRuntime';

const BACKUP_SCHEMA = 'ha-dashboard-builder-backup';

function buildLayout() {
  return JSON.stringify({
    version: 13,
    sections: [],
    widgets: [
      {
        id: 'alarm-1',
        kind: 'alarm',
        alarmUnlockCode: '1234',
        alarmLocalExtraCode: '99',
        widgets: [{ id: 'nested', lockCode: '7777' }],
      },
      {
        id: 'lock-1',
        kind: 'lock',
        lockCode: '2580',
      },
    ],
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('config backup security filtering', () => {
  it('keeps developer mode out of backups and restores', () => {
    window.localStorage.setItem('ha.dashboard.developerMode.v2', '1');
    window.localStorage.setItem('ha.dashboard.developerMode', '1');
    window.localStorage.setItem('ha.dashboard.userName', 'Casa');

    const payload = createDashboardBackupPayload(window.localStorage);

    expect(payload.entries['ha.dashboard.developerMode.v2']).toBeUndefined();
    expect(payload.entries['ha.dashboard.developerMode']).toBeUndefined();

    window.localStorage.clear();
    restoreDashboardBackup(
      { ...payload, entries: { ...payload.entries, 'ha.dashboard.developerMode.v2': '1' } },
      window.localStorage,
    );

    expect(window.localStorage.getItem('ha.dashboard.developerMode.v2')).toBeNull();
  });

  it('does not export the HA-backed local cache', () => {
    window.localStorage.setItem('ha.dashboard.cache.sharedHouseConfiguration.v1', '{"revision":2}');

    const payload = createDashboardBackupPayload(window.localStorage);

    expect(payload.entries['ha.dashboard.cache.sharedHouseConfiguration.v1']).toBeUndefined();
  });

  it('excludes device auth ids and local alarm PIN from exports', () => {
    window.localStorage.setItem('ha.dashboard.deviceAuth.credentialId.user', 'credential-id');
    window.localStorage.setItem('ha.dashboard.security.biometricCredentialId', 'legacy-credential-id');
    window.localStorage.setItem('ha.dashboard.security.alarmPin', '2580');
    window.localStorage.setItem(WIDGET_SECRETS_STORAGE_KEY, JSON.stringify({ widgets: { lock: { lockCode: '9999' } } }));
    window.localStorage.setItem('ha.dashboard.userName', 'Casa');
    window.localStorage.setItem(REAL_DASHBOARD_RECOVERY_STORAGE_KEY, 'local-recovery-copy');

    const payload = createDashboardBackupPayload(window.localStorage);

    expect(payload.entries['ha.dashboard.deviceAuth.credentialId.user']).toBeUndefined();
    expect(payload.entries['ha.dashboard.security.biometricCredentialId']).toBeUndefined();
    expect(payload.entries['ha.dashboard.security.alarmPin']).toBeUndefined();
    expect(payload.entries[WIDGET_SECRETS_STORAGE_KEY]).toBeUndefined();
    expect(payload.entries[REAL_DASHBOARD_RECOVERY_STORAGE_KEY]).toBeUndefined();
    expect(payload.entries['ha.dashboard.userName']).toBe('Casa');
  });

  it('sanitizes Home Assistant tokens from exports', () => {
    window.localStorage.setItem(
      'hass_auth_tokens',
      JSON.stringify({
        hassUrl: 'https://ha.example.test',
        clientId: 'dashboard',
        expires: 123,
        refresh_token: 'refresh-secret',
        access_token: 'access-secret',
        expires_in: 1800,
      }),
    );
    window.localStorage.setItem(
      'ha-external-dashboard:ha-live:v1',
      JSON.stringify({
        url: 'https://ha.example.test',
        token: 'manual-token-secret',
        rememberToken: true,
        refreshToken: 'legacy-refresh-secret',
        accessToken: 'legacy-access-secret',
      }),
    );

    const payload = createDashboardBackupPayload(window.localStorage);

    expect(JSON.stringify(payload)).not.toContain('refresh-secret');
    expect(JSON.stringify(payload)).not.toContain('access-secret');
    expect(JSON.stringify(payload)).not.toContain('manual-token-secret');
    expect(payload.entries.hass_auth_tokens).toBeUndefined();
    expect(JSON.parse(payload.entries['ha-external-dashboard:ha-live:v1']).token).toBe('');
    expect(JSON.parse(payload.entries['ha-external-dashboard:ha-live:v1']).rememberToken).toBe(false);
  });

  it('removes alarm and lock codes from layout exports', () => {
    window.localStorage.setItem('ha.dashboard.builder.layout.v1', buildLayout());

    const payload = createDashboardBackupPayload(window.localStorage);
    const exportedLayout = JSON.parse(payload.entries['ha.dashboard.builder.layout.v1']);

    expect(exportedLayout.widgets[0].alarmUnlockCode).toBeUndefined();
    expect(exportedLayout.widgets[0].alarmLocalExtraCode).toBeUndefined();
    expect(exportedLayout.widgets[0].widgets[0].lockCode).toBeUndefined();
    expect(exportedLayout.widgets[1].lockCode).toBeUndefined();
  });

  it('sanitizes legacy backup payloads before restore', () => {
    const rawBackup = JSON.stringify({
      schema: BACKUP_SCHEMA,
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: {
        'ha.dashboard.deviceAuth.credentialId.user': 'credential-id',
        'ha.dashboard.security.alarmPin': '2580',
        [WIDGET_SECRETS_STORAGE_KEY]: JSON.stringify({ widgets: { lock: { lockCode: '9999' } } }),
        hass_auth_tokens: JSON.stringify({
          hassUrl: 'https://ha.example.test',
          clientId: 'dashboard',
          expires: 123,
          refresh_token: 'refresh-secret',
          access_token: 'access-secret',
          expires_in: 1800,
        }),
        'ha-external-dashboard:ha-live:v1': JSON.stringify({
          url: 'https://ha.example.test',
          token: 'manual-token-secret',
          rememberToken: true,
        }),
        'ha.dashboard.builder.layout.v1': buildLayout(),
      },
    });

    const payload = parseDashboardBackup(rawBackup);
    const restored = restoreDashboardBackup(payload, window.localStorage);
    const restoredLayout = JSON.parse(window.localStorage.getItem('ha.dashboard.builder.layout.v1') ?? '{}');

    expect(restored).toBe(2);
    expect(window.localStorage.getItem('ha.dashboard.deviceAuth.credentialId.user')).toBeNull();
    expect(window.localStorage.getItem('ha.dashboard.security.alarmPin')).toBeNull();
    expect(window.localStorage.getItem(WIDGET_SECRETS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('hass_auth_tokens')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('ha-external-dashboard:ha-live:v1') ?? '{}').token).toBe('');
    expect(JSON.parse(window.localStorage.getItem('ha-external-dashboard:ha-live:v1') ?? '{}').rememberToken).toBe(false);
    expect(restoredLayout.widgets[0].alarmUnlockCode).toBeUndefined();
    expect(restoredLayout.widgets[0].alarmLocalExtraCode).toBeUndefined();
    expect(restoredLayout.widgets[0].widgets[0].lockCode).toBeUndefined();
    expect(restoredLayout.widgets[1].lockCode).toBeUndefined();
  });

  it('sanitizes layout values recursively', () => {
    const sanitized = JSON.parse(sanitizeDashboardLayoutValue(buildLayout()));

    expect(JSON.stringify(sanitized)).not.toContain('1234');
    expect(JSON.stringify(sanitized)).not.toContain('99');
    expect(JSON.stringify(sanitized)).not.toContain('2580');
    expect(JSON.stringify(sanitized)).not.toContain('7777');
  });

  it('clears managed local storage including tokens, widget secrets and device credentials on reset', () => {
    window.localStorage.setItem('hass_auth_tokens', 'oauth-token-secret');
    window.localStorage.setItem('ha-external-dashboard:ha-live:v1', 'manual-token-secret');
    window.localStorage.setItem(WIDGET_SECRETS_STORAGE_KEY, 'widget-secret');
    window.localStorage.setItem('ha.dashboard.security.alarmPin', '2580');
    window.localStorage.setItem('ha.dashboard.deviceAuth.credentialId.user', 'credential-id');
    window.localStorage.setItem('ha.dashboard.userName', 'Casa');
    window.localStorage.setItem('third.party.key', 'keep-me');

    const clearedCount = clearManagedDashboardStorage(window.localStorage);

    expect(clearedCount).toBe(6);
    expect(window.localStorage.getItem('hass_auth_tokens')).toBeNull();
    expect(window.localStorage.getItem('ha-external-dashboard:ha-live:v1')).toBeNull();
    expect(window.localStorage.getItem(WIDGET_SECRETS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('ha.dashboard.security.alarmPin')).toBeNull();
    expect(window.localStorage.getItem('ha.dashboard.deviceAuth.credentialId.user')).toBeNull();
    expect(window.localStorage.getItem('ha.dashboard.userName')).toBeNull();
    expect(window.localStorage.getItem('third.party.key')).toBe('keep-me');
  });
});
