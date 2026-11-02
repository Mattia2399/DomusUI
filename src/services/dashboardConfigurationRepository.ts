import type { DashboardSection, Widget } from '../types/dashboardModels';
import type {
  DashboardResponsiveLayouts,
  WidgetLayoutOverrides,
  WidgetTypeLayoutOverrides,
} from '../types/widgetTypeLayout';
import { hydrateWidgetRuntimeDefaults } from './dashboardPersistenceProjection';
import type { GridMetricsVersion } from '../components/dashboard/gridEngine2/gridMetrics';

export type DashboardRevisionSource = 'edit' | 'rollback' | 'migration';

/**
 * Every persistent setting must opt into one scope. This prevents broad
 * localStorage-prefix exports from mixing house data, device preferences and
 * secrets in the same server document.
 */
export type DashboardConfigurationScope =
  | 'shared_house'
  | 'user'
  | 'device'
  | 'secret'
  | 'demo';

export const SHARED_HOUSE_CONFIGURATION_SCHEMA = 'premium-home-house-configuration';
export const SHARED_HOUSE_CONFIGURATION_VERSION = 1;
export const HA_SHARED_HOUSE_CONFIGURATION_KEY = 'premium-home.shared-house.v1';
export const HA_USER_CONFIGURATION_KEY = 'premium-home.user-preferences.v1';

export const GRID_ENGINE_2_LAYOUT_ENGINE = 'grid-engine-2' as const;
export type DashboardLayoutEngine = typeof GRID_ENGINE_2_LAYOUT_ENGINE;

export type DashboardLayoutConfiguration = {
  /** Version of the existing dashboard layout serializer. */
  storageVersion: number;
  sections: DashboardSection[];
  widgets: Widget[];
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides;
  widgetLayoutOverrides: WidgetLayoutOverrides;
  responsiveLayouts: DashboardResponsiveLayouts;
  /** Present only after the user explicitly adopts the Grid Engine 2.0 Home. */
  layoutEngine?: DashboardLayoutEngine;
  /** Missing means the original 48/16/16 geometry. */
  gridMetricsVersion?: GridMetricsVersion;
};

export type SecurityPresentationConfiguration = {
  alarmEntityId: string | null;
  /** null means automatic discovery; [] means an explicit empty selection. */
  visibleSensorEntityIds: string[] | null;
  /** null means automatic discovery; [] means an explicit empty selection. */
  visibleCameraEntityIds: string[] | null;
};

export type SharedCustomRoom = {
  id: string;
  name: string;
  createdAt: number;
};

export type RoomsPresentationConfiguration = {
  customRooms: SharedCustomRoom[];
  hiddenEntitiesByRoom: Record<string, string[]>;
};

export type SharedHouseConfiguration = {
  schema: typeof SHARED_HOUSE_CONFIGURATION_SCHEMA;
  version: typeof SHARED_HOUSE_CONFIGURATION_VERSION;
  revision: number;
  updatedAt: string;
  updatedByUserId: string;
  publication?: {
    source: DashboardRevisionSource;
    restoredFromRevision?: number;
    /** Opaque per-client id used only to suppress self-update notifications. */
    originClientId?: string;
  };
  dashboard: DashboardLayoutConfiguration;
  security: SecurityPresentationConfiguration;
  rooms: RoomsPresentationConfiguration;
};

export type DashboardConfigurationRepositoryKind =
  | 'home_assistant'
  | 'local_cache';

export type DashboardConfigurationLoadResult =
  | { status: 'found'; document: SharedHouseConfiguration }
  | { status: 'empty' }
  | { status: 'unauthorized' }
  | { status: 'offline' }
  | { status: 'unsupported' }
  | { status: 'error'; reason?: string };

export type DashboardConfigurationSaveResult =
  | { status: 'saved'; document: SharedHouseConfiguration }
  | { status: 'conflict'; current: SharedHouseConfiguration | null }
  | { status: 'unauthorized' }
  | { status: 'offline' }
  | { status: 'unsupported' }
  | { status: 'error'; reason?: string };

export type DashboardConfigurationSubscription = () => void;

/**
 * Authoritative configuration transport. UI components consume this contract
 * and do not know whether the data came from the HA frontend store or a future
 * Domus UI integration.
 */
export interface DashboardConfigurationRepository {
  readonly kind: DashboardConfigurationRepositoryKind;
  loadSharedHouseConfiguration(): Promise<DashboardConfigurationLoadResult>;
  saveSharedHouseConfiguration(
    document: SharedHouseConfiguration,
    expectedRevision: number | null,
  ): Promise<DashboardConfigurationSaveResult>;
  subscribeSharedHouseConfiguration?(
    listener: (document: SharedHouseConfiguration) => void,
  ): DashboardConfigurationSubscription;
}

/**
 * A cache can accelerate boot and preserve a recovery copy, but it must never
 * be presented as a successful authoritative save.
 */
export interface DashboardConfigurationCache {
  loadSharedHouseConfiguration(): SharedHouseConfiguration | null;
  saveSharedHouseConfiguration(document: SharedHouseConfiguration): void;
  clearSharedHouseConfiguration(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEntityIds(value: unknown): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function normalizeHiddenEntitiesByRoom(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([roomId, entityIds]) => [roomId.trim(), normalizeEntityIds(entityIds) ?? []] as const)
      .filter(([roomId]) => Boolean(roomId)),
  );
}

export function parseDashboardLayout(value: unknown): DashboardLayoutConfiguration | null {
  if (!isRecord(value) || !Array.isArray(value.sections) || !Array.isArray(value.widgets)) {
    return null;
  }
  const storageVersion = Number(value.storageVersion);
  if (!Number.isSafeInteger(storageVersion) || storageVersion < 1) return null;

  return {
    storageVersion,
    sections: value.sections as DashboardSection[],
    widgets: (value.widgets as Widget[]).map(hydrateWidgetRuntimeDefaults),
    widgetTypeLayoutOverrides: isRecord(value.widgetTypeLayoutOverrides)
      ? value.widgetTypeLayoutOverrides as WidgetTypeLayoutOverrides
      : {},
    widgetLayoutOverrides: isRecord(value.widgetLayoutOverrides)
      ? value.widgetLayoutOverrides as WidgetLayoutOverrides
      : {},
    responsiveLayouts: isRecord(value.responsiveLayouts)
      ? value.responsiveLayouts as DashboardResponsiveLayouts
      : {},
    ...(value.layoutEngine === GRID_ENGINE_2_LAYOUT_ENGINE
      ? { layoutEngine: GRID_ENGINE_2_LAYOUT_ENGINE }
      : null),
    ...(value.gridMetricsVersion === 'legacy' || value.gridMetricsVersion === 'v2'
      ? { gridMetricsVersion: value.gridMetricsVersion }
      : null),
  };
}

/** Parse server/cache input without trusting its shape or its metadata. */
export function parseSharedHouseConfiguration(value: unknown): SharedHouseConfiguration | null {
  if (
    !isRecord(value) ||
    value.schema !== SHARED_HOUSE_CONFIGURATION_SCHEMA ||
    value.version !== SHARED_HOUSE_CONFIGURATION_VERSION ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    typeof value.updatedByUserId !== 'string'
  ) {
    return null;
  }

  const dashboard = parseDashboardLayout(value.dashboard);
  const security = isRecord(value.security) ? value.security : null;
  const rooms = isRecord(value.rooms) ? value.rooms : null;
  if (!dashboard || !security || !rooms) return null;

  const customRooms = Array.isArray(rooms.customRooms)
    ? rooms.customRooms.flatMap((room) => {
        if (
          !isRecord(room) ||
          typeof room.id !== 'string' ||
          !room.id.trim() ||
          typeof room.name !== 'string' ||
          !room.name.trim() ||
          typeof room.createdAt !== 'number' ||
          !Number.isFinite(room.createdAt)
        ) {
          return [];
        }
        return [{ id: room.id.trim(), name: room.name.trim(), createdAt: room.createdAt }];
      })
    : [];

  return {
    schema: SHARED_HOUSE_CONFIGURATION_SCHEMA,
    version: SHARED_HOUSE_CONFIGURATION_VERSION,
    revision: Number(value.revision),
    updatedAt: value.updatedAt,
    updatedByUserId: value.updatedByUserId.trim(),
    ...(isRecord(value.publication)
      ? {
          publication: {
            source: value.publication.source === 'rollback' || value.publication.source === 'migration'
              ? value.publication.source
              : 'edit',
            ...(Number.isSafeInteger(value.publication.restoredFromRevision) &&
              Number(value.publication.restoredFromRevision) > 0
              ? { restoredFromRevision: Number(value.publication.restoredFromRevision) }
              : {}),
            ...(typeof value.publication.originClientId === 'string' &&
              value.publication.originClientId.trim().length > 0 &&
              value.publication.originClientId.trim().length <= 128
              ? { originClientId: value.publication.originClientId.trim() }
              : {}),
          },
        }
      : {}),
    dashboard,
    security: {
      alarmEntityId: typeof security.alarmEntityId === 'string'
        ? security.alarmEntityId.trim() || null
        : null,
      visibleSensorEntityIds: normalizeEntityIds(security.visibleSensorEntityIds),
      visibleCameraEntityIds: normalizeEntityIds(security.visibleCameraEntityIds),
    },
    rooms: {
      customRooms,
      hiddenEntitiesByRoom: normalizeHiddenEntitiesByRoom(rooms.hiddenEntitiesByRoom),
    },
  };
}

export type CreateSharedHouseConfigurationInput = Omit<
  SharedHouseConfiguration,
  'schema' | 'version' | 'revision' | 'updatedAt'
> & {
  revision?: number;
  updatedAt?: string;
};

export function createSharedHouseConfiguration(
  input: CreateSharedHouseConfigurationInput,
): SharedHouseConfiguration {
  return {
    schema: SHARED_HOUSE_CONFIGURATION_SCHEMA,
    version: SHARED_HOUSE_CONFIGURATION_VERSION,
    revision: input.revision ?? 1,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    updatedByUserId: input.updatedByUserId,
    publication: input.publication ?? { source: 'migration' },
    dashboard: input.dashboard,
    security: input.security,
    rooms: input.rooms,
  };
}

export function createNextSharedHouseConfiguration(
  current: SharedHouseConfiguration,
  changes: Pick<SharedHouseConfiguration, 'dashboard' | 'security' | 'rooms'>,
  updatedByUserId: string,
  updatedAt = new Date().toISOString(),
  publication: NonNullable<SharedHouseConfiguration['publication']> = { source: 'edit' },
): SharedHouseConfiguration {
  return {
    ...current,
    ...changes,
    revision: current.revision + 1,
    updatedAt,
    updatedByUserId,
    publication,
  };
}
