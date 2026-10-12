import type { MockEntityState, MockEntityStateMap } from '../types/ha';

/*
 * What the Security center shows on this device: the main alarm and the
 * sensors and cameras picked by hand. Shared by the Security center and
 * Settings → Security so both read and write the same choice.
 */

export const SECURITY_CENTER_STORAGE_KEYS = {
  alarmEntityId: 'ha.dashboard.security.alarmEntityId',
  visibleSensorEntityIds: 'ha.dashboard.security.visibleSensorEntityIds',
  visibleCameraEntityIds: 'ha.dashboard.security.visibleCameraEntityIds',
} as const;

export const SECURITY_SENSOR_DEVICE_CLASSES = new Set([
  'door',
  'window',
  'opening',
  'motion',
  'presence',
  'occupancy',
  'vibration',
  'tamper',
  'smoke',
  'gas',
  'co',
  'co2',
  'heat',
  'moisture',
  'safety',
  'problem',
  'lock',
  'garage_door',
]);

export const SECURITY_SENSOR_KEYWORDS = [
  'door',
  'window',
  'motion',
  'presence',
  'occupancy',
  'pir',
  'tamper',
  'smoke',
  'gas',
  'co',
  'alarm',
  'allarme',
  'intrusion',
  'intrusione',
  'perimetro',
  'security',
  'sicurezza',
  'garage',
  'porta',
  'finestra',
];

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeStoredEntityIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))];
}

export function readSecurityCenterAlarm(): string {
  try {
    return storage()?.getItem(SECURITY_CENTER_STORAGE_KEYS.alarmEntityId) ?? '';
  } catch {
    return '';
  }
}

export function writeSecurityCenterAlarm(entityId: string | null) {
  try {
    if (entityId) storage()?.setItem(SECURITY_CENTER_STORAGE_KEYS.alarmEntityId, entityId);
    else storage()?.removeItem(SECURITY_CENTER_STORAGE_KEYS.alarmEntityId);
  } catch {
    // The choice only lives on this device; nothing else to do.
  }
}

/** The ids picked by hand, or `null` when every candidate is shown. */
export function readSecurityCenterSelection(key: string): string[] | null {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const legacyIds = normalizeStoredEntityIds(parsed);
      // In the old format an empty list could be written while HA was still loading.
      // Treat it as automatic discovery; future explicit empty selections use v2.
      return legacyIds.length > 0 ? legacyIds : null;
    }
    const record = parsed as { version?: unknown; mode?: unknown; ids?: unknown } | null;
    if (record?.version === 2 && record.mode === 'custom') {
      return normalizeStoredEntityIds(record.ids);
    }
    return null;
  } catch {
    return null;
  }
}

/** `null` goes back to showing every candidate. */
export function writeSecurityCenterSelection(key: string, ids: string[] | null) {
  try {
    if (ids === null) {
      storage()?.removeItem(key);
      return;
    }
    storage()?.setItem(key, JSON.stringify({ version: 2, mode: 'custom', ids: normalizeStoredEntityIds(ids) }));
  } catch {
    // The choice only lives on this device; nothing else to do.
  }
}

export function isSecuritySensorEntity(entityId: string, liveEntity: MockEntityState | undefined) {
  const deviceClass = `${liveEntity?.rawAttributes?.device_class ?? ''}`.trim().toLowerCase();
  if (SECURITY_SENSOR_DEVICE_CLASSES.has(deviceClass)) return true;
  const friendlyName =
    typeof liveEntity?.rawAttributes?.friendly_name === 'string' ? liveEntity.rawAttributes.friendly_name.trim() : '';
  const token = `${entityId} ${friendlyName} ${deviceClass}`.toLowerCase();
  return SECURITY_SENSOR_KEYWORDS.some((keyword) => token.includes(keyword));
}

export function securityAlarmCandidates(haStates: MockEntityStateMap, locale: string) {
  return Object.keys(haStates)
    .filter((id) => id.startsWith('alarm_control_panel.'))
    .sort((left, right) => left.localeCompare(right, locale));
}

/** Security sensors; every binary sensor when none can be told apart. */
export function securitySensorCandidates(haStates: MockEntityStateMap, locale: string) {
  const binary = Object.keys(haStates)
    .filter((id) => id.startsWith('binary_sensor.'))
    .sort((left, right) => left.localeCompare(right, locale));
  const security = binary.filter((id) => isSecuritySensorEntity(id, haStates[id]));
  return security.length > 0 ? security : binary;
}

export function securityCameraCandidates(haStates: MockEntityStateMap, locale: string) {
  return Object.keys(haStates)
    .filter((id) => id.startsWith('camera.'))
    .sort((left, right) => left.localeCompare(right, locale));
}
