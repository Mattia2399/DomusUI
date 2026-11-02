import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import {
  ALARM_FEATURE_ARM_AWAY,
  ALARM_FEATURE_ARM_CUSTOM_BYPASS,
  ALARM_FEATURE_ARM_HOME,
  ALARM_FEATURE_ARM_NIGHT,
  ALARM_FEATURE_ARM_VACATION,
  ALARM_FEATURE_TRIGGER,
  alarmSupportsFeature,
} from '../../../utils/alarmUtils';

/*
 * What the alarm, the robot and the members panels may show, read only from what
 * the entities declare: a control the entity does not expose is not there at all.
 */

export type AlarmModeId = 'home' | 'away' | 'night' | 'vacation' | 'custom_bypass';

const ALARM_MODE_FEATURES: Array<[AlarmModeId, number]> = [
  ['home', ALARM_FEATURE_ARM_HOME],
  ['away', ALARM_FEATURE_ARM_AWAY],
  ['night', ALARM_FEATURE_ARM_NIGHT],
  ['vacation', ALARM_FEATURE_ARM_VACATION],
  ['custom_bypass', ALARM_FEATURE_ARM_CUSTOM_BYPASS],
];

const hasMask = (features: number | undefined): features is number =>
  typeof features === 'number' && Number.isFinite(features);

/** The modes the entity declares. An entity that declares nothing keeps the three common ones. */
export function alarmModesOf(features: number | undefined): AlarmModeId[] {
  if (!hasMask(features)) return ['home', 'away', 'night'];
  return ALARM_MODE_FEATURES.filter(([, feature]) => alarmSupportsFeature(features, feature)).map(([id]) => id);
}

export function alarmCanTrigger(features: number | undefined) {
  return hasMask(features) && alarmSupportsFeature(features, ALARM_FEATURE_TRIGGER);
}

const toSeconds = (value: unknown) => {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

/** How long there is to leave, when the integration says it. */
export function alarmExitDelay(attributes: Record<string, unknown> | undefined) {
  return toSeconds(attributes?.exit_delay) ?? toSeconds(attributes?.delay);
}

export function secondsLeft(delay: number, startedAt: number, now: number) {
  return Math.max(0, Math.ceil(delay - (now - startedAt) / 1000));
}

export function entityName(entityId: string, entity: MockEntityState | undefined) {
  const name = entity?.rawAttributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entityId.split('.').pop()?.replace(/_/g, ' ') ?? entityId;
}

export function entityChangedAt(entity: MockEntityState | undefined, key: '__last_changed' | '__last_updated' = '__last_changed') {
  const value = entity?.rawAttributes?.[key];
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

const SENSOR_GROUPS = {
  doors: new Set(['door', 'garage_door', 'opening']),
  windows: new Set(['window']),
  motion: new Set(['motion', 'occupancy', 'presence']),
};

export type HouseEntity = { entityId: string; name: string; on: boolean };

export type AlarmHouse = {
  doors: HouseEntity[];
  windows: HouseEntity[];
  motion: HouseEntity[];
  sirens: HouseEntity[];
};

const isGone = (entity: MockEntityState) => entity.state === 'unavailable' || entity.state === 'unknown';

/** Openings, movement and sirens around the alarm: its area, or the whole house when it has none. */
export function alarmHouseOf(
  states: MockEntityStateMap,
  areaOf: Record<string, string> | null,
  area: string | null,
): AlarmHouse {
  const house: AlarmHouse = { doors: [], windows: [], motion: [], sirens: [] };
  Object.entries(states).forEach(([entityId, entity]) => {
    if (isGone(entity) || (area && areaOf?.[entityId] !== area)) return;
    const item = { entityId, name: entityName(entityId, entity), on: entity.state === 'on' };
    if (entityId.startsWith('siren.')) {
      house.sirens.push(item);
      return;
    }
    if (!entityId.startsWith('binary_sensor.')) return;
    const deviceClass = entity.rawAttributes?.device_class;
    if (typeof deviceClass !== 'string') return;
    if (SENSOR_GROUPS.doors.has(deviceClass)) house.doors.push(item);
    else if (SENSOR_GROUPS.windows.has(deviceClass)) house.windows.push(item);
    else if (SENSOR_GROUPS.motion.has(deviceClass)) house.motion.push(item);
  });
  return house;
}

const ZONE_ATTRIBUTES = ['triggered_by', 'triggered_sensor', 'open_sensors', 'zone', 'zone_name'];

/** What set the alarm off, only when the integration names it. */
export function alarmTriggerZone(attributes: Record<string, unknown> | undefined, states: MockEntityStateMap) {
  for (const key of ZONE_ATTRIBUTES) {
    const value = attributes?.[key];
    const raw = Array.isArray(value)
      ? value[0]
      : value && typeof value === 'object'
        ? Object.keys(value)[0]
        : value;
    if (typeof raw === 'string' && raw.trim()) {
      const id = raw.trim();
      return { entityId: states[id] ? id : null, name: states[id] ? entityName(id, states[id]) : id };
    }
  }
  return null;
}

export function camerasInArea(states: MockEntityStateMap, areaOf: Record<string, string> | null, area: string | null) {
  if (!area || !areaOf) return [];
  return Object.keys(states).filter((entityId) => entityId.startsWith('camera.') && areaOf[entityId] === area);
}

/** The alarm entity of a card: the Home hands over its attributes, not its id. */
export function findAlarmEntityId(states: MockEntityStateMap, attributes: Record<string, unknown> | undefined) {
  const alarms = Object.entries(states).filter(([entityId]) => entityId.startsWith('alarm_control_panel.'));
  const same = attributes ? alarms.find(([, entity]) => entity.rawAttributes === attributes) : undefined;
  if (same) return same[0];
  return alarms.length === 1 ? alarms[0][0] : null;
}

/* ---- Robot ---- */

const PROGRESS_ATTRIBUTES = ['cleaning_progress', 'progress', 'clean_percent', 'cleaning_percent'];

/** How much of the cleaning is done, only when the integration says it. */
export function vacuumProgress(attributes: Record<string, unknown> | undefined) {
  for (const key of PROGRESS_ATTRIBUTES) {
    const value = attributes?.[key];
    const percent = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) return percent;
  }
  return null;
}

const ERROR_ATTRIBUTES = ['error', 'error_message', 'error_description', 'last_error'];

export function vacuumErrorText(attributes: Record<string, unknown> | undefined, status: string | undefined) {
  for (const key of ERROR_ATTRIBUTES) {
    const value = attributes?.[key];
    if (typeof value === 'string' && value.trim() && !/^(none|no[_ ]?error|ok|0)$/i.test(value.trim())) return value.trim();
  }
  const text = status?.trim();
  return text && !/^error$/i.test(text) ? text : null;
}

const MODE_SELECT = /(mop|mode|modalit|clean_type|cleaning_type|water)/i;

type RelatedLike = { domain: string; entityId: string; name: string; options?: string[] };

/** "Aspira, Lava, Entrambi": a select of the robot that chooses how it cleans, when there is one. */
export function vacuumModeControl<T extends RelatedLike>(related: T[] | undefined) {
  return related?.find(
    (entity) => entity.domain === 'select' && (entity.options?.length ?? 0) > 1 && MODE_SELECT.test(`${entity.entityId} ${entity.name}`),
  ) ?? null;
}

/* ---- Members ---- */

/** The map of the members stays off until the household has agreed to it. */
export const MEMBERS_MAP_ENABLED = false;

type RegistryEntry = { entityId: string; deviceId?: string | null };

const readPercent = (value: unknown) => {
  const percent = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null;
};

/** The battery of the phone of a person: of the tracker, or of a sensor on the same device. Otherwise none. */
export function memberBattery(
  trackerEntityIds: string[],
  states: MockEntityStateMap,
  registry: RegistryEntry[] | null,
) {
  for (const trackerId of trackerEntityIds) {
    const attributes = states[trackerId]?.rawAttributes;
    const own = readPercent(attributes?.battery_level) ?? readPercent(attributes?.battery);
    if (own !== null) return own;
    const deviceId = registry?.find((entry) => entry.entityId === trackerId)?.deviceId;
    if (!deviceId) continue;
    for (const entry of registry ?? []) {
      if (entry.deviceId !== deviceId || !entry.entityId.startsWith('sensor.')) continue;
      const sensor = states[entry.entityId];
      if (sensor?.rawAttributes?.device_class !== 'battery') continue;
      const percent = readPercent(sensor.state);
      if (percent !== null) return percent;
    }
  }
  return null;
}

/** Whether someone is at home, and how many are in and out. */
export function memberIsHome(state: string | undefined) {
  return state === 'home';
}

export function formatPanelSpan(ms: number, words: { min: string; hour: string; day: string }) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return words.min.replace('{n}', String(minutes));
  const hours = Math.round(minutes / 60);
  if (hours < 48) return words.hour.replace('{n}', String(hours));
  return words.day.replace('{n}', String(Math.round(hours / 24)));
}
