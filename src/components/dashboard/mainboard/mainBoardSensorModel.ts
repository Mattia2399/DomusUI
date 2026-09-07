import type { SensorConnectionState } from '../../settings/types';
import type { Widget } from '../../../types/dashboardModels';
import type { MockEntityState } from '../../../types/ha';
import {
  isRecordObject,
  toFiniteNumber,
  toHistoryTimestampMs,
  toTrimmedString,
} from './mainBoardValueUtils';
import { translateForLocale, type AppLocale } from '../../../i18n/I18nProvider';

const SENSOR_BATTERY_ATTRIBUTE_KEYS = [
  'battery_level',
  'battery',
  'battery_percentage',
  'battery_percent',
  'battery_state_of_charge',
];
const SENSOR_STATUS_ATTRIBUTE_KEYS = ['status', 'sensor_status', 'device_status', 'system_status'];
const SENSOR_CONNECTION_ATTRIBUTE_KEYS = [
  'connection_status',
  'connectivity',
  'connected',
  'online',
  'network_status',
  'linkquality',
  'link_quality',
  'rssi',
];
const SENSOR_CONNECTION_ON_VALUES = new Set([
  'on',
  'online',
  'connected',
  'home',
  'available',
  'ok',
  'true',
  'yes',
  'open',
]);
const SENSOR_CONNECTION_OFF_VALUES = new Set([
  'off',
  'offline',
  'disconnected',
  'not_home',
  'unavailable',
  'down',
  'false',
  'no',
  'closed',
  '0',
]);

export const SENSOR_HISTORY_WINDOW_HOURS = 24;
export const SENSOR_HISTORY_MAX_POINTS = 24;

function readFirstAttributeValue(attributes: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!attributes) {
    return undefined;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      return attributes[key];
    }
  }
  return undefined;
}

function readAttributeNumber(attributes: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  return toFiniteNumber(readFirstAttributeValue(attributes, keys));
}

function readAttributeString(attributes: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  return toTrimmedString(readFirstAttributeValue(attributes, keys));
}

function formatRoundedValue(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${Math.round(rounded)}` : rounded.toFixed(1);
}

function normalizeConnectionState(value: unknown): SensorConnectionState {
  if (typeof value === 'boolean') {
    return value ? 'online' : 'offline';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value === 0 ? 'offline' : 'online';
  }
  const text = toTrimmedString(value);
  if (!text) {
    return 'unknown';
  }
  const normalized = text.toLowerCase();
  if (normalized === 'unknown') {
    return 'unknown';
  }
  if (SENSOR_CONNECTION_OFF_VALUES.has(normalized)) {
    return 'offline';
  }
  if (SENSOR_CONNECTION_ON_VALUES.has(normalized)) {
    return 'online';
  }
  return 'unknown';
}

function normalizeConnectionLabel(state: SensorConnectionState, locale: AppLocale): string {
  return state === 'offline'
    ? translateForLocale(locale, 'controls.sensor.disconnected')
    : state === 'online'
      ? translateForLocale(locale, 'controls.sensor.connected')
      : translateForLocale(locale, 'builder.unknownState');
}

function downsampleNumberSeries(values: number[], maxPoints: number) {
  const safeMax = Math.max(1, Math.round(maxPoints));
  if (values.length <= safeMax) {
    return values;
  }
  const sampled: number[] = [];
  const usedIndices = new Set<number>();
  for (let index = 0; index < safeMax; index += 1) {
    const nextIndex = Math.round((index * (values.length - 1)) / (safeMax - 1));
    if (usedIndices.has(nextIndex)) {
      continue;
    }
    usedIndices.add(nextIndex);
    sampled.push(values[nextIndex]);
  }
  return sampled.length === 0 ? values.slice(-safeMax) : sampled;
}

export function extractSensorHistoryValues(
  payload: unknown,
  entityId: string,
  maxPoints = SENSOR_HISTORY_MAX_POINTS,
) {
  const normalizedEntityId = entityId.trim();
  if (!normalizedEntityId) {
    return [];
  }

  const historyEntries: Record<string, unknown>[] = [];
  const tryCollectEntries = (candidate: unknown) => {
    if (!Array.isArray(candidate)) {
      return;
    }
    candidate.forEach((entry) => {
      if (isRecordObject(entry)) {
        historyEntries.push(entry);
      }
    });
  };

  if (isRecordObject(payload)) {
    tryCollectEntries(payload[normalizedEntityId]);
    if (historyEntries.length === 0) {
      const entityValues = Object.values(payload);
      if (entityValues.length === 1) {
        tryCollectEntries(entityValues[0]);
      }
    }
  } else if (Array.isArray(payload)) {
    if (payload.length > 0 && Array.isArray(payload[0])) {
      tryCollectEntries(payload[0]);
    } else {
      tryCollectEntries(payload);
    }
  }

  const points = historyEntries
    .map((entry, fallbackIndex) => {
      const value = toFiniteNumber(entry.s ?? entry.state);
      if (!Number.isFinite(value)) {
        return null;
      }
      const timestampMs =
        toHistoryTimestampMs(
          entry.lu ??
            entry.last_updated ??
            entry.last_updated_ts ??
            entry.lc ??
            entry.last_changed ??
            entry.last_changed_ts,
        ) ?? fallbackIndex;
      return { value: value as number, timestampMs };
    })
    .filter((point): point is { value: number; timestampMs: number } => point !== null)
    .sort((left, right) => left.timestampMs - right.timestampMs);

  return points.length === 0
    ? []
    : downsampleNumberSeries(
        points.map((point) => point.value),
        maxPoints,
      );
}

export function sameNumberSeries(left: number[] | undefined, right: number[] | undefined) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function resolveSensorMeta(
  widget: Widget,
  liveEntity: MockEntityState | undefined,
  haEntityMap: Record<string, MockEntityState>,
  locale: AppLocale = 'it',
) {
  const statusEntityId = widget.sensorStatusEntityId?.trim();
  const batteryEntityId = widget.sensorBatteryEntityId?.trim();
  const connectionEntityId = widget.sensorConnectionEntityId?.trim();
  const statusEntity = statusEntityId ? haEntityMap[statusEntityId] : undefined;
  const batteryEntity = batteryEntityId ? haEntityMap[batteryEntityId] : undefined;
  const connectionEntity = connectionEntityId ? haEntityMap[connectionEntityId] : undefined;
  const mainAttributes = liveEntity?.rawAttributes;

  const statusFromEntity = statusEntity?.stateLabel ?? statusEntity?.secondary ?? statusEntity?.state;
  const status =
    statusFromEntity ??
    readAttributeString(mainAttributes, SENSOR_STATUS_ATTRIBUTE_KEYS) ??
    liveEntity?.stateLabel ??
    liveEntity?.state ??
    widget.status;

  const batteryNumericFromEntity =
    typeof batteryEntity?.numericValue === 'number'
      ? batteryEntity.numericValue
      : toFiniteNumber(batteryEntity?.state);
  const batteryFromEntity =
    batteryNumericFromEntity !== undefined
      ? `${formatRoundedValue(batteryNumericFromEntity)}${batteryEntity?.unit ?? '%'}`
      : batteryEntity
        ? batteryEntity.stateLabel ?? batteryEntity.secondary ?? batteryEntity.state
        : undefined;
  const batteryNumericFromAttributes = readAttributeNumber(mainAttributes, SENSOR_BATTERY_ATTRIBUTE_KEYS);
  const batteryFromAttributes =
    batteryNumericFromAttributes !== undefined
      ? `${formatRoundedValue(batteryNumericFromAttributes)}%`
      : readAttributeString(mainAttributes, SENSOR_BATTERY_ATTRIBUTE_KEYS);

  const connectionSourceFromEntity =
    connectionEntity?.stateLabel ?? connectionEntity?.state ?? connectionEntity?.secondary;
  const rawConnectionSource =
    connectionSourceFromEntity ??
    readFirstAttributeValue(mainAttributes, SENSOR_CONNECTION_ATTRIBUTE_KEYS) ??
    liveEntity?.stateLabel ??
    liveEntity?.state;
  const connectionState = normalizeConnectionState(rawConnectionSource);

  return {
    status,
    battery: batteryFromEntity ?? batteryFromAttributes,
    connection: normalizeConnectionLabel(connectionState, locale),
    connectionState,
  };
}
