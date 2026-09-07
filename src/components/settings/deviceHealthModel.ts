import type { HaArea } from '../../hooks/useHaLiveConnection';
import type {
  HaDeviceRegistryEntry,
  HaEntityRegistryEntry,
} from '../../services/haRegistryPresentation';
import type { MockEntityState, MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import { translateForLocale, type AppLocale } from '../../i18n/I18nProvider';

export type DeviceHealthStatus = 'operational' | 'warning' | 'offline' | 'unknown';

export type DeviceHealthIssueCode =
  | 'battery_low'
  | 'connectivity_off'
  | 'entities_unavailable'
  | 'entity_unavailable'
  | 'update_available'
  | 'connection_unavailable';

export type DeviceHealthIssue = {
  code: DeviceHealthIssueCode;
  label: string;
  detail: string;
};

export type DeviceHealthEntity = {
  id: string;
  domain: string;
  name: string;
  value: string;
  unavailable: boolean;
  diagnostic: boolean;
};

export type DeviceHealthSnapshot = {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  swVersion?: string;
  areaId?: string;
  areaName?: string;
  status: DeviceHealthStatus;
  statusLabel: string;
  issues: DeviceHealthIssue[];
  entities: DeviceHealthEntity[];
  entityCount: number;
  unavailableEntityCount: number;
  batteryLevel?: number;
  batteryEntityId?: string;
  connectionState?: 'online' | 'offline';
  connectionEntityId?: string;
  signalStrength?: number;
  signalUnit?: string;
  signalEntityId?: string;
  updateAvailable: boolean;
  updateEntityIds: string[];
  dashboardWidgetCount: number;
  lastDataUpdate?: number;
  configurationUrl?: string;
};

export type BuildDeviceHealthOptions = {
  locale?: AppLocale;
  connected: boolean;
  states: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HaArea[];
  widgets?: Widget[];
  batteryWarningThreshold?: number;
};

const UNAVAILABLE_STATES = new Set(['', 'unknown', 'unavailable']);
const CONNECTED_STATES = new Set(['on', 'online', 'connected', 'available', 'true']);
const DISCONNECTED_STATES = new Set([
  'off',
  'offline',
  'disconnected',
  'unavailable',
  'false',
]);

function normalize(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
    : '';
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function entityDomain(entityId: string) {
  return entityId.split('.', 1)[0] || 'other';
}

function fallbackName(value: string) {
  return value
    .replace(/^[^.]+\./, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveEntityName(
  entityId: string,
  state: MockEntityState | undefined,
  registryEntry: HaEntityRegistryEntry,
) {
  return (
    text(state?.rawAttributes?.friendly_name) ||
    text(registryEntry.name) ||
    text(registryEntry.originalName) ||
    fallbackName(entityId)
  );
}

function resolveEntityValue(state: MockEntityState | undefined, locale: AppLocale) {
  if (!state) return translateForLocale(locale, 'settings.common.unavailable');
  const stateLabel = text(state.stateLabel);
  if (stateLabel) return stateLabel;
  const value = text(state.state) || 'Sconosciuto';
  return state.unit ? `${value} ${state.unit}` : value;
}

function resolveState(
  states: MockEntityStateMap,
  entityId: string,
) {
  return states[entityId] ?? states[entityId.toLowerCase()];
}

function isUnavailable(state: MockEntityState | undefined) {
  return !state || UNAVAILABLE_STATES.has(normalize(state.state));
}

function deviceClass(
  entry: HaEntityRegistryEntry,
  state: MockEntityState | undefined,
) {
  return normalize(entry.deviceClass ?? state?.rawAttributes?.device_class);
}

function resolveBattery(
  entries: HaEntityRegistryEntry[],
  states: MockEntityStateMap,
) {
  const batteryEntity = entries
    .map((entry) => ({ entry, state: resolveState(states, entry.entityId) }))
    .find(({ entry, state }) => deviceClass(entry, state) === 'battery');
  const directBattery = batteryEntity
    ? toNumber(batteryEntity.state?.numericValue ?? batteryEntity.state?.state)
    : undefined;
  if (directBattery !== undefined) {
    return {
      level: Math.max(0, Math.min(100, Math.round(directBattery))),
      entityId: batteryEntity?.entry.entityId,
    };
  }

  for (const entry of entries) {
    const state = resolveState(states, entry.entityId);
    const attributes = state?.rawAttributes;
    const attributeValue =
      toNumber(attributes?.battery_level) ??
      toNumber(attributes?.battery_percentage) ??
      toNumber(attributes?.battery_percent) ??
      toNumber(attributes?.battery);
    if (attributeValue !== undefined) {
      return {
        level: Math.max(0, Math.min(100, Math.round(attributeValue))),
        entityId: entry.entityId,
      };
    }
  }
  return undefined;
}

function resolveConnection(
  entries: HaEntityRegistryEntry[],
  states: MockEntityStateMap,
) {
  const candidate = entries
    .map((entry) => ({ entry, state: resolveState(states, entry.entityId) }))
    .find(({ entry, state }) => deviceClass(entry, state) === 'connectivity');
  if (!candidate?.state) return undefined;
  const state = normalize(candidate.state.state);
  if (CONNECTED_STATES.has(state)) {
    return { state: 'online' as const, entityId: candidate.entry.entityId };
  }
  if (DISCONNECTED_STATES.has(state)) {
    return { state: 'offline' as const, entityId: candidate.entry.entityId };
  }
  return undefined;
}

function resolveSignal(
  entries: HaEntityRegistryEntry[],
  states: MockEntityStateMap,
) {
  const candidate = entries
    .map((entry) => ({ entry, state: resolveState(states, entry.entityId) }))
    .find(({ entry, state }) => deviceClass(entry, state) === 'signal strength');
  const value = toNumber(candidate?.state?.numericValue ?? candidate?.state?.state);
  return candidate && value !== undefined
    ? {
        value: Math.round(value),
        unit: candidate.state?.unit || text(candidate.state?.rawAttributes?.unit_of_measurement) || 'dBm',
        entityId: candidate.entry.entityId,
      }
    : undefined;
}

function isUpdateAvailable(state: MockEntityState | undefined) {
  const normalized = normalize(state?.state);
  return normalized === 'on' || normalized === 'available' || normalized === 'update available';
}

function resolveLastDataUpdate(
  entries: HaEntityRegistryEntry[],
  states: MockEntityStateMap,
) {
  const timestamps = entries.flatMap((entry) => {
    const attributes = resolveState(states, entry.entityId)?.rawAttributes;
    const timestamp =
      toTimestamp(attributes?.__last_updated) ??
      toTimestamp(attributes?.last_updated) ??
      toTimestamp(attributes?.__last_changed) ??
      toTimestamp(attributes?.last_changed);
    return timestamp === undefined ? [] : [timestamp];
  });
  return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
}

function statusLabel(status: DeviceHealthStatus, locale: AppLocale) {
  return translateForLocale(locale, `settings.devices.status.${status}`);
}

export function buildDeviceHealthSnapshots({
  connected,
  states,
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
  widgets = [],
  batteryWarningThreshold = 20,
  locale = 'it',
}: BuildDeviceHealthOptions): DeviceHealthSnapshot[] {
  const areaById = new Map(areas.map((area) => [area.area_id, area.name]));
  const entriesByDevice = new Map<string, HaEntityRegistryEntry[]>();
  entityRegistry.forEach((entry) => {
    if (!entry.deviceId || entry.disabledBy || entry.hiddenBy) return;
    const current = entriesByDevice.get(entry.deviceId) ?? [];
    current.push(entry);
    entriesByDevice.set(entry.deviceId, current);
  });
  const widgetEntityIds = widgets.reduce<Map<string, number>>((counts, widget) => {
    const entityId = widget.entityId.trim().toLowerCase();
    if (entityId) counts.set(entityId, (counts.get(entityId) ?? 0) + 1);
    return counts;
  }, new Map());

  return deviceRegistry
    .map((device): DeviceHealthSnapshot => {
      const entries = entriesByDevice.get(device.id) ?? [];
      const entities = entries
        .map((entry): DeviceHealthEntity => {
          const state = resolveState(states, entry.entityId);
          return {
            id: entry.entityId,
            domain: entityDomain(entry.entityId),
            name: resolveEntityName(entry.entityId, state, entry),
            value: resolveEntityValue(state, locale),
            unavailable: isUnavailable(state),
            diagnostic: normalize(entry.entityCategory) === 'diagnostic',
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name, 'it'));
      const primaryEntities = entities.filter((entity) => !entity.diagnostic && entity.domain !== 'update');
      const battery = resolveBattery(entries, states);
      const connection = resolveConnection(entries, states);
      const signal = resolveSignal(entries, states);
      const updateEntries = entries.filter((entry) => entityDomain(entry.entityId) === 'update');
      const availableUpdates = updateEntries.filter((entry) =>
        isUpdateAvailable(resolveState(states, entry.entityId)),
      );
      const unavailableEntityCount = entities.filter((entity) => entity.unavailable).length;
      const unavailablePrimaryCount = primaryEntities.filter((entity) => entity.unavailable).length;
      const issues: DeviceHealthIssue[] = [];

      if (!connected) {
        issues.push({
          code: 'connection_unavailable',
          label: translateForLocale(locale, 'settings.devices.issue.connectionUnavailable'),
          detail: translateForLocale(locale, 'settings.devices.issue.connectionUnavailableDetail'),
        });
      } else {
        if (connection?.state === 'offline') {
          issues.push({
            code: 'connectivity_off',
            label: translateForLocale(locale, 'settings.devices.issue.connectivityOff'),
            detail: translateForLocale(locale, 'settings.devices.issue.connectivityOffDetail'),
          });
        } else if (
          primaryEntities.length > 0 &&
          unavailablePrimaryCount === primaryEntities.length
        ) {
          issues.push({
            code: 'entities_unavailable',
            label: translateForLocale(locale, 'settings.devices.issue.entitiesUnavailable'),
            detail: translateForLocale(locale, 'settings.devices.issue.entitiesUnavailableDetail'),
          });
        } else if (unavailableEntityCount > 0) {
          issues.push({
            code: 'entity_unavailable',
            label: translateForLocale(locale, 'settings.devices.issue.entityUnavailable'),
            detail: translateForLocale(locale, 'settings.devices.issue.entityUnavailableDetail', { count: unavailableEntityCount }),
          });
        }

        if (battery && battery.level <= batteryWarningThreshold) {
          issues.push({
            code: 'battery_low',
            label: translateForLocale(locale, 'settings.devices.issue.batteryLow', { level: battery.level }),
            detail: translateForLocale(locale, 'settings.devices.issue.batteryLowDetail'),
          });
        }
        if (availableUpdates.length > 0) {
          issues.push({
            code: 'update_available',
            label: translateForLocale(locale, 'settings.devices.issue.updateAvailable'),
            detail: translateForLocale(
              locale,
              availableUpdates.length === 1
                ? 'settings.devices.issue.updateAvailableOneDetail'
                : 'settings.devices.issue.updateAvailableManyDetail',
              { count: availableUpdates.length },
            ),
          });
        }
      }

      const hasLiveData = entities.some((entity) => !entity.unavailable);
      const status: DeviceHealthStatus = !connected || entries.length === 0 || !hasLiveData
        ? connection?.state === 'offline' && connected
          ? 'offline'
          : connected && primaryEntities.length > 0 && unavailablePrimaryCount === primaryEntities.length
            ? 'offline'
            : 'unknown'
        : connection?.state === 'offline' ||
            (primaryEntities.length > 0 && unavailablePrimaryCount === primaryEntities.length)
          ? 'offline'
          : issues.length > 0
            ? 'warning'
            : 'operational';

      return {
        id: device.id,
        name: text(device.nameByUser) || text(device.name) || translateForLocale(locale, 'settings.devices.unnamed'),
        manufacturer: text(device.manufacturer) || undefined,
        model: text(device.model) || undefined,
        swVersion: text(device.swVersion) || undefined,
        areaId: device.areaId || undefined,
        areaName: device.areaId ? areaById.get(device.areaId) ?? device.areaId : undefined,
        status,
        statusLabel: statusLabel(status, locale),
        issues,
        entities,
        entityCount: entities.length,
        unavailableEntityCount,
        batteryLevel: battery?.level,
        batteryEntityId: battery?.entityId,
        connectionState: connection?.state,
        connectionEntityId: connection?.entityId,
        signalStrength: signal?.value,
        signalUnit: signal?.unit,
        signalEntityId: signal?.entityId,
        updateAvailable: availableUpdates.length > 0,
        updateEntityIds: availableUpdates.map((entry) => entry.entityId),
        dashboardWidgetCount: entries.reduce(
          (count, entry) => count + (widgetEntityIds.get(entry.entityId.toLowerCase()) ?? 0),
          0,
        ),
        lastDataUpdate: resolveLastDataUpdate(entries, states),
        configurationUrl: text(device.configurationUrl) || undefined,
      };
    })
    .sort((left, right) => {
      const order: Record<DeviceHealthStatus, number> = {
        offline: 0,
        warning: 1,
        unknown: 2,
        operational: 3,
      };
      return order[left.status] - order[right.status] ||
        left.name.localeCompare(right.name, 'it', { sensitivity: 'base' });
    });
}

export function summarizeDeviceHealth(devices: DeviceHealthSnapshot[]) {
  return devices.reduce(
    (summary, device) => {
      summary.total += 1;
      summary[device.status] += 1;
      if (device.batteryLevel !== undefined && device.issues.some((issue) => issue.code === 'battery_low')) {
        summary.lowBattery += 1;
      }
      if (device.updateAvailable) summary.updates += 1;
      return summary;
    },
    {
      total: 0,
      operational: 0,
      warning: 0,
      offline: 0,
      unknown: 0,
      lowBattery: 0,
      updates: 0,
    },
  );
}
