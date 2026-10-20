import { loadHaLiveConfig, HASS_TOKENS_KEY } from './haLiveConfig';
import {
  DASHBOARD_RUNTIME_MODE_STORAGE_KEY,
  REAL_DASHBOARD_LAYOUT_STORAGE_KEY,
  readStoredDashboardRuntimeMode,
} from './dashboardRuntime';
import type { DashboardRuntimeMode } from '../security/dashboardAccess';

export const SETUP_JOURNEY_STORAGE_KEY = 'ha.dashboard.setupJourney.v2';
export const SETUP_JOURNEY_VERSION = 2;

export type SetupPhase =
  | 'welcome'
  | 'choice'
  | 'discover'
  | 'detected'
  | 'server'
  | 'authorize'
  | 'scan'
  | 'existing'
  | 'compose'
  | 'organize'
  | 'complete'
  | 'done';

export type SetupConnectionMethod = 'direct' | 'panel';

export type SetupScanSummary = {
  entities: number;
  devices: number;
  areas: number;
  unavailable: number;
  domains: Record<string, number>;
  groups?: Record<string, number>;
  userName?: string;
  canManageHa: boolean;
};

export type SetupExistingConfigurationSummary = {
  revision: number;
  updatedAt: string;
  sections: number;
  widgets: number;
};

export type SetupJourney = {
  version: typeof SETUP_JOURNEY_VERSION;
  phase: SetupPhase;
  mode: DashboardRuntimeMode | null;
  hassUrl?: string;
  connectionMethod?: SetupConnectionMethod;
  summary?: SetupScanSummary;
  existingConfiguration?: SetupExistingConfigurationSummary;
  updatedAt: number;
};

function createJourney(phase: SetupPhase, mode: DashboardRuntimeMode | null): SetupJourney {
  return {
    version: SETUP_JOURNEY_VERSION,
    phase,
    mode,
    updatedAt: Date.now(),
  };
}

function isSetupPhase(value: unknown): value is SetupPhase {
  return [
    'welcome',
    'choice',
    'discover',
    'detected',
    'server',
    'authorize',
    'scan',
    'existing',
    'compose',
    'organize',
    'complete',
    'done',
  ].includes(String(value));
}

function parseExistingConfigurationSummary(value: unknown): SetupExistingConfigurationSummary | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<SetupExistingConfigurationSummary>;
  if (
    !Number.isSafeInteger(candidate.revision) ||
    Number(candidate.revision) < 1 ||
    typeof candidate.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.updatedAt)) ||
    !Number.isSafeInteger(candidate.sections) ||
    Number(candidate.sections) < 0 ||
    !Number.isSafeInteger(candidate.widgets) ||
    Number(candidate.widgets) < 0
  ) {
    return undefined;
  }
  return {
    revision: Number(candidate.revision),
    updatedAt: candidate.updatedAt,
    sections: Number(candidate.sections),
    widgets: Number(candidate.widgets),
  };
}

function parseStoredJourney(raw: string | null): SetupJourney | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SetupJourney>;
    if (parsed.version !== SETUP_JOURNEY_VERSION || !isSetupPhase(parsed.phase)) {
      return null;
    }
    const mode = parsed.mode === 'real' || parsed.mode === 'demo' ? parsed.mode : null;
    const existingConfiguration = parseExistingConfigurationSummary(parsed.existingConfiguration);
    const phase = parsed.phase === 'existing' && !existingConfiguration ? 'scan' : parsed.phase;
    return {
      version: SETUP_JOURNEY_VERSION,
      phase,
      mode,
      hassUrl: typeof parsed.hassUrl === 'string' ? parsed.hassUrl : undefined,
      connectionMethod:
        parsed.connectionMethod === 'direct' || parsed.connectionMethod === 'panel'
          ? parsed.connectionMethod
          : undefined,
      summary: parsed.summary,
      existingConfiguration,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function resolveLegacyInstallation(
  storage: Storage,
  options?: { embedded?: boolean },
): DashboardRuntimeMode | null {
  const runtimeMode = readStoredDashboardRuntimeMode(storage);
  const hasRealLayout = Boolean(storage.getItem(REAL_DASHBOARD_LAYOUT_STORAGE_KEY));
  if (runtimeMode === 'demo') return runtimeMode;
  if (hasRealLayout) {
    return 'real';
  }
  if (options?.embedded) {
    return null;
  }
  if (runtimeMode === 'real' || storage.getItem(HASS_TOKENS_KEY)) return 'real';
  const config = loadHaLiveConfig();
  if (config.token.trim()) {
    return 'real';
  }
  return null;
}

export function readSetupJourney(
  storage?: Storage,
  options?: { embedded?: boolean },
): SetupJourney {
  if (!storage) return createJourney('welcome', null);
  const stored = parseStoredJourney(storage.getItem(SETUP_JOURNEY_STORAGE_KEY));
  if (stored) {
    // `detected` was written by the first panel beta before the welcome step
    // was made mandatory. Bring that incomplete first run back to the start.
    if (stored.phase === 'detected') {
      const migrated = createJourney('welcome', null);
      storage.setItem(SETUP_JOURNEY_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    if (options?.embedded && stored.mode === 'real' && !stored.connectionMethod) {
      const migrated = {
        ...stored,
        connectionMethod: 'panel' as const,
        updatedAt: Date.now(),
      };
      storage.setItem(SETUP_JOURNEY_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return stored;
  }

  // Existing installations must not be forced through a new first-run flow.
  const legacyMode = resolveLegacyInstallation(storage, options);
  if (legacyMode) {
    const migrated = {
      ...createJourney('done', legacyMode),
      connectionMethod:
        legacyMode === 'real'
          ? options?.embedded
            ? 'panel' as const
            : 'direct' as const
          : undefined,
    };
    storage.setItem(SETUP_JOURNEY_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }
  if (options?.embedded) {
    return createJourney('welcome', null);
  }
  return createJourney('welcome', null);
}

export function saveSetupJourney(
  journey: Omit<SetupJourney, 'version' | 'updatedAt'> & Partial<Pick<SetupJourney, 'version' | 'updatedAt'>>,
  storage?: Storage,
) {
  const normalized: SetupJourney = {
    ...journey,
    version: SETUP_JOURNEY_VERSION,
    updatedAt: Date.now(),
  };
  storage?.setItem(SETUP_JOURNEY_STORAGE_KEY, JSON.stringify(normalized));
  if (normalized.mode) {
    storage?.setItem(DASHBOARD_RUNTIME_MODE_STORAGE_KEY, normalized.mode);
  }
  return normalized;
}

export function resetSetupJourney(storage?: Storage) {
  storage?.removeItem(SETUP_JOURNEY_STORAGE_KEY);
  return createJourney('welcome', null);
}

export function isDemoRouteAllowed(pathname: string) {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return normalized === '/home' || normalized.startsWith('/home/') || normalized === '/rooms' || normalized.startsWith('/rooms/');
}
