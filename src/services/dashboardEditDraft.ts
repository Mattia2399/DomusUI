import type { DashboardRuntimeMode } from '../security/dashboardAccess';
import {
  parseDashboardLayout,
  type DashboardLayoutConfiguration,
} from './dashboardConfigurationRepository';
import { stripWidgetRuntimeState } from './dashboardPersistenceProjection';
import { stripWidgetSecretsFromWidgets } from './widgetSecrets';

const DRAFT_SCHEMA = 'premium-home-dashboard-edit-draft';
const DRAFT_VERSION = 1;
export const GRID_ENGINE_2_EXPERIMENTAL_PERSISTENCE_PROTECTION =
  'grid-engine-2-experimental' as const;

export type DashboardEditDraftPersistenceProtection =
  typeof GRID_ENGINE_2_EXPERIMENTAL_PERSISTENCE_PROTECTION;

type StoredDashboardEditDraft = {
  schema: typeof DRAFT_SCHEMA;
  version: typeof DRAFT_VERSION;
  runtimeMode: DashboardRuntimeMode;
  createdAt: number;
  updatedAt: number;
  baseRevision: number | null;
  persistenceProtection?: DashboardEditDraftPersistenceProtection;
  dashboard: DashboardLayoutConfiguration;
};

export type DashboardEditDraft = Omit<StoredDashboardEditDraft, 'schema' | 'version'>;

export function getDashboardEditDraftKey(runtimeMode: DashboardRuntimeMode) {
  return `premium-home.dashboard-edit-draft.${runtimeMode}.v1`;
}

export function saveDashboardEditDraft(
  storage: Storage,
  input: Omit<DashboardEditDraft, 'updatedAt'>,
) {
  const dashboard: DashboardLayoutConfiguration = {
    ...input.dashboard,
    widgets: stripWidgetSecretsFromWidgets(
      input.dashboard.widgets.map((widget) => stripWidgetRuntimeState(widget, false)),
    ),
  };
  const payload: StoredDashboardEditDraft = {
    schema: DRAFT_SCHEMA,
    version: DRAFT_VERSION,
    ...input,
    updatedAt: Date.now(),
    dashboard,
  };
  storage.setItem(getDashboardEditDraftKey(input.runtimeMode), JSON.stringify(payload));
}

export function readDashboardEditDraft(
  storage: Storage,
  runtimeMode: DashboardRuntimeMode,
): DashboardEditDraft | null {
  try {
    const raw = storage.getItem(getDashboardEditDraftKey(runtimeMode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDashboardEditDraft>;
    if (
      parsed.schema !== DRAFT_SCHEMA ||
      parsed.version !== DRAFT_VERSION ||
      parsed.runtimeMode !== runtimeMode ||
      typeof parsed.createdAt !== 'number' ||
      !Number.isFinite(parsed.createdAt) ||
      typeof parsed.updatedAt !== 'number' ||
      !Number.isFinite(parsed.updatedAt) ||
      (parsed.baseRevision !== null &&
        (typeof parsed.baseRevision !== 'number' || !Number.isSafeInteger(parsed.baseRevision))) ||
      (parsed.persistenceProtection !== undefined &&
        parsed.persistenceProtection !== GRID_ENGINE_2_EXPERIMENTAL_PERSISTENCE_PROTECTION)
    ) {
      storage.removeItem(getDashboardEditDraftKey(runtimeMode));
      return null;
    }
    const dashboard = parseDashboardLayout(parsed.dashboard);
    if (!dashboard) {
      storage.removeItem(getDashboardEditDraftKey(runtimeMode));
      return null;
    }
    return {
      runtimeMode,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      baseRevision: parsed.baseRevision,
      ...(parsed.persistenceProtection
        ? { persistenceProtection: parsed.persistenceProtection }
        : null),
      dashboard,
    };
  } catch {
    return null;
  }
}

export function discardDashboardEditDraft(
  storage: Storage,
  runtimeMode: DashboardRuntimeMode,
) {
  storage.removeItem(getDashboardEditDraftKey(runtimeMode));
}
