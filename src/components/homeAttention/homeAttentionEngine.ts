import type { HaDeviceRegistryEntry, HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import { buildDeviceHealthSnapshots } from '../settings/deviceHealthModel';
import { translateForLocale, type AppLocale } from '../../i18n/I18nProvider';

export type HomeAttentionSeverity = 'critical' | 'warning' | 'info';

export type HomeAttentionCategory =
  | 'safety'
  | 'security'
  | 'opening'
  | 'availability'
  | 'battery'
  | 'configuration';

export type HomeAttentionSource = 'ha' | 'demo';

export type HomeAttentionItem = {
  id: string;
  severity: HomeAttentionSeverity;
  category: HomeAttentionCategory;
  source: HomeAttentionSource;
  title: string;
  description: string;
  entityId?: string;
  deviceId?: string;
  deviceName?: string;
  areaId?: string;
  areaName?: string;
  activeSince?: number;
  value?: number;
};

export type HomeAttentionArea = {
  area_id: string;
  name: string;
};

export type BuildHomeAttentionItemsOptions = {
  runtimeMode: 'real' | 'demo';
  connected: boolean;
  states: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HomeAttentionArea[];
  widgets?: Widget[];
  now?: number;
  batteryWarningThreshold?: number;
  openingWarningMinutes?: number;
  locale?: AppLocale;
};

const SAFETY_DEVICE_CLASSES = new Set([
  'carbon_monoxide',
  'carbon monoxide',
  'co',
  'gas',
  'moisture',
  'smoke',
  'safety',
]);

const PROBLEM_DEVICE_CLASSES = new Set(['problem', 'tamper']);
const OPENING_DEVICE_CLASSES = new Set(['door', 'garage_door', 'garage door', 'opening', 'window']);
const ACTIVE_BINARY_STATES = new Set(['on', 'open', 'detected', 'true', 'wet', 'unsafe', 'problem']);
const UNAVAILABLE_STATES = new Set(['unavailable', 'unknown']);
const SEVERITY_ORDER: Record<HomeAttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};
const CATEGORY_ORDER: Record<HomeAttentionCategory, number> = {
  safety: 0,
  security: 1,
  opening: 2,
  availability: 3,
  battery: 4,
  configuration: 5,
};

function normalize(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
    : '';
}

function toFiniteNumber(value: unknown) {
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

function fallbackName(entityId: string) {
  const objectId = entityId.split('.', 2)[1] ?? entityId;
  return objectId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveEntityName(
  entityId: string,
  attributes: Record<string, unknown> | undefined,
  registryEntry: HaEntityRegistryEntry | undefined,
) {
  const friendlyName = typeof attributes?.friendly_name === 'string'
    ? attributes.friendly_name.trim()
    : '';
  return friendlyName || registryEntry?.name?.trim() || registryEntry?.originalName?.trim() || fallbackName(entityId);
}

function resolveContext(
  entityId: string,
  registryByEntityId: ReadonlyMap<string, HaEntityRegistryEntry>,
  deviceById: ReadonlyMap<string, HaDeviceRegistryEntry>,
  areaById: ReadonlyMap<string, HomeAttentionArea>,
) {
  const registryEntry = registryByEntityId.get(entityId.toLowerCase());
  const device = registryEntry?.deviceId
    ? deviceById.get(registryEntry.deviceId)
    : undefined;
  const areaId = registryEntry?.areaId ?? device?.areaId;
  const area = areaId ? areaById.get(areaId) : undefined;
  return {
    registryEntry,
    deviceId: device?.id ?? registryEntry?.deviceId,
    deviceName: device?.nameByUser?.trim() || device?.name?.trim() || undefined,
    areaId,
    areaName: area?.name?.trim() || undefined,
  };
}

function createItem(
  input: Omit<HomeAttentionItem, 'id' | 'source'> & {
    source?: HomeAttentionSource;
  },
): HomeAttentionItem {
  return {
    ...input,
    id: `${input.category}:${input.entityId ?? input.title}`,
    source: input.source ?? 'ha',
  };
}

export function createDemoHomeAttentionItems(now = Date.now(), locale: AppLocale = 'it'): HomeAttentionItem[] {
  const t = (key: Parameters<typeof translateForLocale>[1], parameters?: Parameters<typeof translateForLocale>[2]) =>
    translateForLocale(locale, key, parameters);
  return [
    createItem({
      source: 'demo',
      severity: 'warning',
      category: 'opening',
      title: t('attention.demo.windowTitle'),
      description: t('attention.openingDescription'),
      entityId: 'binary_sensor.studio_window',
      areaId: 'studio',
      areaName: t('attention.demo.windowArea'),
      activeSince: now - 18 * 60_000,
    }),
    createItem({
      source: 'demo',
      severity: 'warning',
      category: 'availability',
      title: t('attention.demo.wifiTitle'),
      description: t('attention.connectionDescription'),
      entityId: 'sensor.nest_wifi_download',
      deviceName: 'Nest Wifi',
      activeSince: now - 7 * 60_000,
    }),
    createItem({
      source: 'demo',
      severity: 'info',
      category: 'battery',
      title: t('attention.demo.batteryTitle'),
      description: t('attention.batteryDescription', { level: 12 }),
      entityId: 'sensor.living_room_humidity',
      areaId: 'living_room',
      areaName: t('attention.demo.batteryArea'),
      value: 12,
    }),
  ];
}

export function buildHomeAttentionItems({
  runtimeMode,
  connected,
  states,
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
  widgets = [],
  now = Date.now(),
  batteryWarningThreshold = 20,
  openingWarningMinutes = 10,
  locale = 'it',
}: BuildHomeAttentionItemsOptions): HomeAttentionItem[] {
  const t = (key: Parameters<typeof translateForLocale>[1], parameters?: Parameters<typeof translateForLocale>[2]) =>
    translateForLocale(locale, key, parameters);
  if (runtimeMode === 'demo') {
    return createDemoHomeAttentionItems(now, locale);
  }
  if (!connected) {
    return [];
  }

  const registryByEntityId = new Map(
    entityRegistry.map((entry) => [entry.entityId.toLowerCase(), entry]),
  );
  const deviceById = new Map(deviceRegistry.map((entry) => [entry.id, entry]));
  const areaById = new Map(areas.map((entry) => [entry.area_id, entry]));
  const monitoredWidgets = widgets.filter(
    (widget) => widget.dataSource !== 'mock' && widget.entityId.trim().length > 0,
  );
  const monitoredEntityIds = new Set(
    monitoredWidgets.map((widget) => widget.entityId.trim().toLowerCase()),
  );
  const items: HomeAttentionItem[] = [];
  const emittedKeys = new Set<string>();

  const emit = (item: HomeAttentionItem) => {
    const key = `${item.category}:${item.entityId ?? item.id}`.toLowerCase();
    if (emittedKeys.has(key)) return;
    emittedKeys.add(key);
    items.push(item);
  };
  const deviceHealth = buildDeviceHealthSnapshots({
    connected,
    states,
    entityRegistry,
    deviceRegistry,
    areas,
    widgets,
    batteryWarningThreshold,
    locale,
  });
  const processedBatteryEntityIds = new Set<string>();
  const processedConnectionEntityIds = new Set<string>();

  deviceHealth.forEach((device) => {
    if (
      device.batteryEntityId &&
      device.batteryLevel !== undefined &&
      device.issues.some((issue) => issue.code === 'battery_low')
    ) {
      const entityId = device.batteryEntityId;
      const entity = states[entityId] ?? states[entityId.toLowerCase()];
      const registryEntry = registryByEntityId.get(entityId.toLowerCase());
      const name = resolveEntityName(entityId, entity?.rawAttributes, registryEntry);
      processedBatteryEntityIds.add(entityId.toLowerCase());
      emit(createItem({
        severity: device.batteryLevel <= 10 ? 'warning' : 'info',
        category: 'battery',
        title: t('attention.batteryTitle', { name }),
        description: t('attention.batteryDescription', { level: device.batteryLevel }),
        entityId,
        deviceId: device.id,
        deviceName: device.name,
        areaId: device.areaId,
        areaName: device.areaName,
        activeSince:
          toTimestamp(entity?.rawAttributes?.__last_changed) ??
          toTimestamp(entity?.rawAttributes?.last_changed),
        value: device.batteryLevel,
      }));
    }

    if (
      device.connectionEntityId &&
      device.issues.some((issue) => issue.code === 'connectivity_off')
    ) {
      const entityId = device.connectionEntityId;
      const entity = states[entityId] ?? states[entityId.toLowerCase()];
      const registryEntry = registryByEntityId.get(entityId.toLowerCase());
      const name = resolveEntityName(entityId, entity?.rawAttributes, registryEntry);
      processedConnectionEntityIds.add(entityId.toLowerCase());
      emit(createItem({
        severity: 'warning',
        category: 'availability',
        title: t('attention.unreachableTitle', { name }),
        description: t('attention.connectionDescription'),
        entityId,
        deviceId: device.id,
        deviceName: device.name,
        areaId: device.areaId,
        areaName: device.areaName,
        activeSince:
          toTimestamp(entity?.rawAttributes?.__last_changed) ??
          toTimestamp(entity?.rawAttributes?.last_changed),
      }));
    }
  });

  Object.entries(states).forEach(([entityId, entity]) => {
    const normalizedEntityId = entityId.toLowerCase();
    const registryEntry = registryByEntityId.get(normalizedEntityId);
    if (registryEntry?.disabledBy || registryEntry?.hiddenBy) {
      return;
    }

    const domain = normalizedEntityId.split('.', 1)[0];
    const state = normalize(entity.state);
    const attributes = entity.rawAttributes;
    const deviceClass = normalize(registryEntry?.deviceClass ?? attributes?.device_class);
    const name = resolveEntityName(entityId, attributes, registryEntry);
    const context = resolveContext(entityId, registryByEntityId, deviceById, areaById);
    const activeSince =
      toTimestamp(attributes?.__last_changed) ??
      toTimestamp(attributes?.last_changed);
    const base = {
      entityId,
      deviceId: context.deviceId,
      deviceName: context.deviceName,
      areaId: context.areaId,
      areaName: context.areaName,
      activeSince,
    };

    if (domain === 'binary_sensor' && SAFETY_DEVICE_CLASSES.has(deviceClass) && ACTIVE_BINARY_STATES.has(state)) {
      const safetyLabel =
        deviceClass === 'moisture'
          ? t('attention.safety.moisture')
          : deviceClass === 'smoke'
            ? t('attention.safety.smoke')
            : deviceClass === 'carbon monoxide' || deviceClass === 'carbon_monoxide' || deviceClass === 'co'
              ? t('attention.safety.co')
              : deviceClass === 'gas'
                ? t('attention.safety.gas')
                : t('attention.safety.generic');
      emit(createItem({
        ...base,
        severity: 'critical',
        category: 'safety',
        title: safetyLabel,
        description: t('attention.safetyDescription', { name }),
      }));
      return;
    }

    if (domain === 'binary_sensor' && PROBLEM_DEVICE_CLASSES.has(deviceClass) && ACTIVE_BINARY_STATES.has(state)) {
      emit(createItem({
        ...base,
        severity: 'warning',
        category: 'security',
        title: t('attention.problemTitle', { name }),
        description: t('attention.problemDescription'),
      }));
    }

    if (
      domain === 'binary_sensor'
      && OPENING_DEVICE_CLASSES.has(deviceClass)
      && ACTIVE_BINARY_STATES.has(state)
    ) {
      const openForMs = activeSince ? Math.max(0, now - activeSince) : undefined;
      const thresholdMs = Math.max(0, openingWarningMinutes) * 60_000;
      if (openForMs === undefined || openForMs >= thresholdMs) {
        emit(createItem({
          ...base,
          severity: 'warning',
          category: 'opening',
          title: t('attention.openingTitle', { name }),
          description: t('attention.openingDescription'),
        }));
      }
    }

    if (
      domain === 'binary_sensor'
      && deviceClass === 'connectivity'
      && ['off', 'offline', 'disconnected', 'unavailable'].includes(state)
      && !processedConnectionEntityIds.has(normalizedEntityId)
    ) {
      emit(createItem({
        ...base,
        severity: 'warning',
        category: 'availability',
        title: t('attention.unreachableTitle', { name }),
        description: t('attention.connectionDescription'),
      }));
    }

    if (domain === 'lock' && ['unlocked', 'open'].includes(state)) {
      emit(createItem({
        ...base,
        severity: 'warning',
        category: 'security',
        title: t('attention.unlockedTitle', { name }),
        description: t('attention.unlockedDescription'),
      }));
    }

    if (domain === 'lock' && state === 'jammed') {
      emit(createItem({
        ...base,
        severity: 'critical',
        category: 'security',
        title: t('attention.jammedTitle', { name }),
        description: t('attention.jammedDescription'),
      }));
    }

    if (domain === 'alarm_control_panel' && state === 'triggered') {
      emit(createItem({
        ...base,
        severity: 'critical',
        category: 'security',
        title: t('attention.alarmTitle', { name }),
        description: t('attention.alarmDescription'),
      }));
    }

    if (
      domain === 'sensor'
      && deviceClass === 'battery'
      && !processedBatteryEntityIds.has(normalizedEntityId)
    ) {
      const batteryLevel = toFiniteNumber(entity.numericValue ?? entity.state);
      if (batteryLevel !== undefined && batteryLevel <= batteryWarningThreshold) {
        const roundedLevel = Math.max(0, Math.min(100, Math.round(batteryLevel)));
        emit(createItem({
          ...base,
          severity: roundedLevel <= 10 ? 'warning' : 'info',
          category: 'battery',
          title: t('attention.batteryTitle', { name }),
          description: t('attention.batteryDescription', { level: roundedLevel }),
          value: roundedLevel,
        }));
      }
    }

    if (UNAVAILABLE_STATES.has(state) && monitoredEntityIds.has(normalizedEntityId)) {
      emit(createItem({
        ...base,
        severity: 'warning',
        category: 'availability',
        title: t('attention.unavailableTitle', { name }),
        description: t('attention.unavailableDescription'),
      }));
    }
  });

  monitoredWidgets.forEach((widget) => {
    const entityId = widget.entityId.trim();
    if (states[entityId] || states[entityId.toLowerCase()]) {
      return;
    }
    const context = resolveContext(entityId, registryByEntityId, deviceById, areaById);
    emit(createItem({
      severity: 'info',
      category: 'configuration',
      title: t('attention.missingTitle', { name: widget.title || fallbackName(entityId) }),
      description: t('attention.missingDescription'),
      entityId,
      deviceId: context.deviceId,
      deviceName: context.deviceName,
      areaId: context.areaId,
      areaName: context.areaName,
    }));
  });

  return items.sort((left, right) => {
    const severityDelta = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDelta !== 0) return severityDelta;
    const categoryDelta = CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
    if (categoryDelta !== 0) return categoryDelta;
    return (left.activeSince ?? Number.MAX_SAFE_INTEGER) - (right.activeSince ?? Number.MAX_SAFE_INTEGER);
  });
}

export function formatHomeAttentionDuration(activeSince: number | undefined, now = Date.now()) {
  if (!activeSince || activeSince > now) return undefined;
  const minutes = Math.max(1, Math.floor((now - activeSince) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} g`;
}
