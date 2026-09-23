import type { WidgetKind } from '../types/dashboardModels';

const HA_FAVORITE_LABEL_ALIASES = new Set(['preferiti', 'preferito', 'favorites', 'favorite']);

export type HaEntityRegistryEntry = {
  entityId: string;
  deviceId?: string;
  areaId?: string;
  name?: string;
  originalName?: string;
  platform?: string;
  disabledBy?: string;
  hiddenBy?: string;
  entityCategory?: string;
  deviceClass?: string;
  options?: Record<string, unknown>;
};

export type HaDeviceRegistryEntry = {
  id: string;
  name?: string;
  nameByUser?: string;
  manufacturer?: string;
  model?: string;
  swVersion?: string;
  hwVersion?: string;
  areaId?: string;
  configurationUrl?: string;
};

function toTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHaLabelKey(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_-]+/g, '') : '';
}

function hasFavoriteLabelAlias(value: unknown) {
  const normalized = normalizeHaLabelKey(value);
  if (!normalized) return false;
  for (const alias of HA_FAVORITE_LABEL_ALIASES) {
    if (normalized === alias || normalized.includes(alias) || alias.includes(normalized)) return true;
  }
  return false;
}

function collectLabelIdsFromValue(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(collectLabelIdsFromValue);
  if (!isRecord(value)) return [];
  const direct = [value.label_id, value.id, value.labelId]
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return direct.length ? direct : Object.keys(value).map((key) => key.trim()).filter(Boolean);
}

export function parseFavoriteLabelIds(payload: unknown) {
  if (!Array.isArray(payload)) return new Set<string>();
  const result = new Set<string>();
  payload.forEach((entry) => {
    if (!isRecord(entry)) return;
    const labelId = toTrimmedString(entry.label_id) ?? toTrimmedString(entry.id);
    if (labelId && (hasFavoriteLabelAlias(labelId) || hasFavoriteLabelAlias(entry.name) || hasFavoriteLabelAlias(entry.slug))) {
      result.add(labelId);
    }
  });
  return result;
}

export function parseEntityIdsByLabelIds(payload: unknown, labelIds: Set<string>) {
  if (!Array.isArray(payload) || !labelIds.size) return new Set<string>();
  const result = new Set<string>();
  payload.forEach((entry) => {
    if (!isRecord(entry)) return;
    const entityId = toTrimmedString(entry.entity_id);
    const labels = [...collectLabelIdsFromValue(entry.labels), ...collectLabelIdsFromValue(entry.label_ids)];
    if (entityId && labels.some((label) => labelIds.has(label))) result.add(entityId);
  });
  return result;
}

export function parseDeviceIdsByLabelIds(payload: unknown, labelIds: Set<string>) {
  if (!Array.isArray(payload) || !labelIds.size) return new Set<string>();
  const result = new Set<string>();
  payload.forEach((entry) => {
    if (!isRecord(entry)) return;
    const deviceId = toTrimmedString(entry.id) ?? toTrimmedString(entry.device_id);
    const labels = [...collectLabelIdsFromValue(entry.labels), ...collectLabelIdsFromValue(entry.label_ids)];
    if (deviceId && labels.some((label) => labelIds.has(label))) result.add(deviceId);
  });
  return result;
}

export function parseEntityIdsByDeviceIds(payload: unknown, deviceIds: Set<string>) {
  if (!Array.isArray(payload) || !deviceIds.size) return new Set<string>();
  const result = new Set<string>();
  payload.forEach((entry) => {
    if (!isRecord(entry)) return;
    const entityId = toTrimmedString(entry.entity_id);
    const deviceId = toTrimmedString(entry.device_id);
    if (entityId && deviceId && deviceIds.has(deviceId)) result.add(entityId);
  });
  return result;
}

export function parseHaEntityRegistry(payload: unknown): HaEntityRegistryEntry[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const entityId = toTrimmedString(entry.entity_id);
    if (!entityId) return [];
    return [{
      entityId,
      deviceId: toTrimmedString(entry.device_id),
      areaId: toTrimmedString(entry.area_id),
      name: toTrimmedString(entry.name),
      originalName: toTrimmedString(entry.original_name),
      platform: toTrimmedString(entry.platform),
      disabledBy: toTrimmedString(entry.disabled_by),
      hiddenBy: toTrimmedString(entry.hidden_by),
      entityCategory: toTrimmedString(entry.entity_category),
      deviceClass: toTrimmedString(entry.device_class) ?? toTrimmedString(entry.original_device_class),
      options: isRecord(entry.options) ? entry.options : undefined,
    }];
  });
}

export function parseHaDeviceRegistry(payload: unknown): HaDeviceRegistryEntry[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = toTrimmedString(entry.id) ?? toTrimmedString(entry.device_id);
    if (!id) return [];
    return [{
      id,
      name: toTrimmedString(entry.name),
      nameByUser: toTrimmedString(entry.name_by_user),
      manufacturer: toTrimmedString(entry.manufacturer) ?? toTrimmedString(entry.default_manufacturer),
      model: toTrimmedString(entry.model) ?? toTrimmedString(entry.default_model),
      swVersion: toTrimmedString(entry.sw_version),
      hwVersion: toTrimmedString(entry.hw_version),
      areaId: toTrimmedString(entry.area_id),
      configurationUrl: toTrimmedString(entry.configuration_url),
    }];
  });
}

export function resolveWidgetKindFromEntityId(entityId: string): WidgetKind | null {
  const domain = entityId.split('.')[0];
  if (domain === 'light') return 'light';
  if (domain === 'climate') return 'climate';
  if (domain === 'camera') return 'camera';
  if (domain === 'sensor' || domain === 'binary_sensor') return 'sensor';
  if (domain === 'switch' || domain === 'input_boolean') return 'switch';
  if (domain === 'fan') return 'fan';
  if (domain === 'humidifier') return 'humidifier';
  if (domain === 'media_player') return 'media';
  if (domain === 'alarm_control_panel') return 'alarm';
  if (domain === 'vacuum') return 'vacuum';
  if (domain === 'lock') return 'lock';
  if (domain === 'cover') return 'cover';
  if (domain === 'calendar') return 'calendar';
  return null;
}

export function filterEntityIdsForWidgetKind(kind: WidgetKind, entityIds: string[]): string[] {
  return entityIds.filter((entityId) => resolveWidgetKindFromEntityId(entityId) === kind);
}

export function fallbackTitleFromEntityId(entityId: string) {
  const [, objectId = entityId] = entityId.split('.');
  return objectId
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}
