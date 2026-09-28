import {
  LEGACY_WIDGET_SECRETS_STORAGE_KEY,
  WIDGET_SECRETS_STORAGE_KEY,
} from './widgetSecrets';
import {
  DASHBOARD_RUNTIME_MODE_STORAGE_KEY,
  DEMO_DASHBOARD_LAYOUT_STORAGE_KEY,
  DEMO_DASHBOARD_RECOVERY_STORAGE_KEY,
  REAL_DASHBOARD_RECOVERY_STORAGE_KEY,
} from './dashboardRuntime';
import type { DashboardRuntimeMode } from '../security/dashboardAccess';

const BACKUP_SCHEMA = 'ha-dashboard-builder-backup';
const BACKUP_VERSION = 1;
const HA_LIVE_STORAGE_KEY = 'ha-external-dashboard:ha-live:v1';
const HA_OAUTH_TOKENS_STORAGE_KEY = 'hass_auth_tokens';
export const DASHBOARD_LAYOUT_STORAGE_KEY = 'ha.dashboard.builder.layout.v1';
const SECURITY_ALARM_PIN_STORAGE_KEY = 'ha.dashboard.security.alarmPin';
const LEGACY_DEVICE_AUTH_CREDENTIAL_STORAGE_KEY = 'ha.dashboard.security.biometricCredentialId';
const DEVICE_AUTH_CREDENTIAL_STORAGE_PREFIX = 'ha.dashboard.deviceAuth.credentialId.';
const DASHBOARD_SERVER_CACHE_STORAGE_PREFIX = 'ha.dashboard.cache.';
// Developer mode is a device-local choice made from Settings (see useProfileSettings).
const DEVELOPER_MODE_STORAGE_KEYS = ['ha.dashboard.developerMode.v2', 'ha.dashboard.developerMode'];

const MANAGED_STORAGE_PREFIXES = ['ha.dashboard.'];
const MANAGED_STORAGE_KEYS = [HA_LIVE_STORAGE_KEY, HA_OAUTH_TOKENS_STORAGE_KEY];
const BACKUP_EXCLUDED_STORAGE_KEYS = new Set([
  SECURITY_ALARM_PIN_STORAGE_KEY,
  LEGACY_DEVICE_AUTH_CREDENTIAL_STORAGE_KEY,
  HA_OAUTH_TOKENS_STORAGE_KEY,
  WIDGET_SECRETS_STORAGE_KEY,
  LEGACY_WIDGET_SECRETS_STORAGE_KEY,
  DASHBOARD_RUNTIME_MODE_STORAGE_KEY,
  REAL_DASHBOARD_RECOVERY_STORAGE_KEY,
  DEMO_DASHBOARD_RECOVERY_STORAGE_KEY,
  ...DEVELOPER_MODE_STORAGE_KEYS,
]);
const BACKUP_EXCLUDED_STORAGE_PREFIXES = [
  DEVICE_AUTH_CREDENTIAL_STORAGE_PREFIX,
  DASHBOARD_SERVER_CACHE_STORAGE_PREFIX,
];
const SENSITIVE_WIDGET_FIELDS = ['alarmUnlockCode', 'alarmLocalExtraCode', 'lockCode'] as const;

export type DashboardBackupPayload = {
  schema: typeof BACKUP_SCHEMA;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  scope?: DashboardRuntimeMode;
  entries: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBackupEntries(rawEntries: unknown, scope: DashboardRuntimeMode = 'real') {
  if (!isRecord(rawEntries)) {
    return null;
  }

  const entries: Record<string, string> = {};
  Object.entries(rawEntries).forEach(([key, value]) => {
    if (!isBackupStorageKey(key, scope)) {
      return;
    }
    if (typeof value === 'string') {
      entries[key] = sanitizeSensitiveStorageValue(key, value);
      return;
    }
    if (value === undefined) {
      return;
    }
    try {
      entries[key] = sanitizeSensitiveStorageValue(key, JSON.stringify(value));
    } catch {
      // ignore invalid legacy entry values
    }
  });

  return entries;
}

function sanitizeWidgetSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeWidgetSecrets);
  }
  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, entryValue]) => {
    if ((SENSITIVE_WIDGET_FIELDS as readonly string[]).includes(key)) {
      return;
    }
    sanitized[key] = sanitizeWidgetSecrets(entryValue);
  });
  return sanitized;
}

export function sanitizeDashboardLayoutValue(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return JSON.stringify(sanitizeWidgetSecrets(parsed));
  } catch {
    return value;
  }
}

function sanitizeSensitiveStorageValue(key: string, value: string) {
  if (isBackupExcludedStorageKey(key)) {
    return '';
  }

  if (key === HA_OAUTH_TOKENS_STORAGE_KEY) {
    return JSON.stringify({
      hassUrl: '',
      clientId: '',
      expires: 0,
      refresh_token: '',
      access_token: '',
      expires_in: 0,
    });
  }

  if (key === DASHBOARD_LAYOUT_STORAGE_KEY || key === DEMO_DASHBOARD_LAYOUT_STORAGE_KEY) {
    return sanitizeDashboardLayoutValue(value);
  }

  if (key !== HA_LIVE_STORAGE_KEY) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {
      ...parsed,
      token: '',
      rememberToken: false,
    };
    if (Object.prototype.hasOwnProperty.call(sanitized, 'refreshToken')) {
      sanitized.refreshToken = '';
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'accessToken')) {
      sanitized.accessToken = '';
    }
    return JSON.stringify(sanitized);
  } catch {
    return JSON.stringify({
      url: '',
      token: '',
      rememberToken: false,
    });
  }
}

export function isManagedStorageKey(key: string) {
  if (MANAGED_STORAGE_KEYS.includes(key)) {
    return true;
  }
  return MANAGED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isBackupExcludedStorageKey(key: string) {
  return (
    BACKUP_EXCLUDED_STORAGE_KEYS.has(key) ||
    BACKUP_EXCLUDED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export function isBackupStorageKey(key: string, scope: DashboardRuntimeMode = 'real') {
  if (!isManagedStorageKey(key) || isBackupExcludedStorageKey(key)) {
    return false;
  }
  return scope === 'demo'
    ? key.startsWith('ha.dashboard.demo.')
    : !key.startsWith('ha.dashboard.demo.');
}

export function listManagedStorageKeys(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !isManagedStorageKey(key)) {
      continue;
    }
    keys.push(key);
  }
  keys.sort((a, b) => a.localeCompare(b));
  return keys;
}

export function listBackupStorageKeys(storage: Storage, scope: DashboardRuntimeMode = 'real') {
  return listManagedStorageKeys(storage).filter((key) => isBackupStorageKey(key, scope));
}

export function createDashboardBackupPayload(
  storage: Storage,
  scope: DashboardRuntimeMode = 'real',
): DashboardBackupPayload {
  const keys = listBackupStorageKeys(storage, scope);
  const entries: Record<string, string> = {};

  keys.forEach((key) => {
    const value = storage.getItem(key);
    if (value !== null) {
      entries[key] = sanitizeSensitiveStorageValue(key, value);
    }
  });

  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    entries,
  };
}

export function serializeDashboardBackup(payload: DashboardBackupPayload) {
  return JSON.stringify(payload, null, 2);
}

export function parseDashboardBackup(raw: string): DashboardBackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Il file selezionato non contiene JSON valido.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Formato backup non valido.');
  }

  const schema = parsed.schema;
  const version = parsed.version;
  const exportedAt = parsed.exportedAt;
  const scope: DashboardRuntimeMode = parsed.scope === 'demo' ? 'demo' : 'real';
  const strictEntries = normalizeBackupEntries(parsed.entries, scope);
  if (schema === BACKUP_SCHEMA && version === BACKUP_VERSION) {
    if (typeof exportedAt !== 'string' || exportedAt.trim().length === 0) {
      throw new Error('Il backup non contiene la data di esportazione.');
    }
    if (!strictEntries || Object.keys(strictEntries).length === 0) {
      throw new Error('Il backup non contiene configurazioni dashboard ripristinabili.');
    }
    return {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      exportedAt,
      scope,
      entries: strictEntries,
    };
  }

  const legacyEntries = strictEntries ?? normalizeBackupEntries(parsed, scope);
  if (legacyEntries && Object.keys(legacyEntries).length > 0) {
    return {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      exportedAt:
        typeof exportedAt === 'string' && exportedAt.trim().length > 0
          ? exportedAt
          : new Date().toISOString(),
      scope,
      entries: legacyEntries,
    };
  }

  if (schema !== BACKUP_SCHEMA) {
    throw new Error('Formato backup non riconosciuto.');
  }
  if (version !== BACKUP_VERSION) {
    throw new Error(`Versione backup non supportata: ${String(version)}.`);
  }
  throw new Error('Il backup non contiene configurazioni dashboard ripristinabili.');
}

export function clearManagedDashboardStorage(
  storage: Storage,
  scope: DashboardRuntimeMode | 'all' = 'all',
) {
  const keys = listManagedStorageKeys(storage).filter((key) => {
    if (scope === 'all') {
      return true;
    }
    if (key === DASHBOARD_RUNTIME_MODE_STORAGE_KEY) {
      return false;
    }
    return scope === 'demo'
      ? key.startsWith('ha.dashboard.demo.')
      : !key.startsWith('ha.dashboard.demo.');
  });
  keys.forEach((key) => storage.removeItem(key));
  return keys.length;
}

export function restoreDashboardBackup(
  payload: DashboardBackupPayload,
  storage: Storage,
  scope: DashboardRuntimeMode = payload.scope ?? 'real',
) {
  const managedEntries = Object.entries(payload.entries).filter(
    ([key, value]) => isBackupStorageKey(key, scope) && typeof value === 'string',
  );
  if (!managedEntries.length) {
    return 0;
  }

  clearManagedDashboardStorage(storage, scope);
  let restoredCount = 0;
  managedEntries.forEach(([key, value]) => {
    storage.setItem(key, sanitizeSensitiveStorageValue(key, value));
    restoredCount += 1;
  });

  return restoredCount;
}
