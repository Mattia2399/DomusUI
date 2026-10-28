import { loadHaLiveConfig, HASS_TOKENS_KEY } from './haLiveConfig';
import {
  DASHBOARD_RUNTIME_MODE_STORAGE_KEY,
  REAL_DASHBOARD_LAYOUT_STORAGE_KEY,
  readStoredDashboardRuntimeMode,
} from './dashboardRuntime';
import type { DashboardRuntimeMode } from '../security/dashboardAccess';

export const SETUP_JOURNEY_STORAGE_KEY = 'ha.dashboard.setupJourney.v3';
/** The journey of the previous setup, read once and converted (migrateSetupJourneyV2). */
export const LEGACY_SETUP_JOURNEY_STORAGE_KEY = 'ha.dashboard.setupJourney.v2';
export const SETUP_JOURNEY_VERSION = 3;

/*
 * The path of first-run setup. Outside the Home Assistant panel:
 * intro → choice → connect → redirect (Home Assistant sign-in) → scan →
 * summary → [existing] → compose → done. Inside the panel the sign-in is
 * already done: intro → choice → scan → summary → …
 *
 * Errors are not phases: they belong to the step they interrupt and are
 * decided by the setup screen (resolveSetupScreen), so a journey resumed later
 * starts again from the step, not from an error that may no longer be true.
 * Only what must survive a reload is stored: the reads that failed
 * (summary.partial) and whether a non-administrator chose to continue
 * (limitedAccepted).
 */
export type SetupPhase =
  | 'intro'
  | 'choice'
  | 'connect'
  | 'redirect'
  | 'scan'
  | 'summary'
  | 'existing'
  | 'compose'
  | 'done';

export type SetupConnectionMethod = 'direct' | 'panel';

/** How the Home starts after setup: the recommended cards, empty, or the dashboard the home already had. */
export type SetupStart = 'recommended' | 'empty' | 'existing';

export type SetupCategoryId = 'lights' | 'thermostats' | 'covers' | 'media' | 'plugs' | 'security';

/** A read of the scan that did not answer in time; the summary offers to retry. */
export type SetupReadId = 'areas' | 'floors' | 'devices';

export type SetupScanSummary = {
  entities: number;
  devices: number;
  areas: number;
  floors?: number;
  unavailable: number;
  /** Devices that are in no room; undefined when the registry did not say. */
  unassigned?: number;
  domains: Record<string, number>;
  groups?: Record<string, number>;
  categories?: Partial<Record<SetupCategoryId, number>>;
  partial?: SetupReadId[];
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
  /** A non-administrator saw what is limited and chose to continue. */
  limitedAccepted?: boolean;
  start?: SetupStart;
  updatedAt: number;
};

const PHASES: readonly SetupPhase[] = [
  'intro',
  'choice',
  'connect',
  'redirect',
  'scan',
  'summary',
  'existing',
  'compose',
  'done',
];

const V2_PHASES: Record<string, SetupPhase> = {
  welcome: 'intro',
  choice: 'choice',
  discover: 'scan',
  detected: 'scan',
  server: 'connect',
  authorize: 'redirect',
  scan: 'scan',
  existing: 'existing',
  compose: 'compose',
  organize: 'compose',
  complete: 'done',
  done: 'done',
};

function createJourney(phase: SetupPhase, mode: DashboardRuntimeMode | null): SetupJourney {
  return {
    version: SETUP_JOURNEY_VERSION,
    phase,
    mode,
    updatedAt: Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseExistingConfigurationSummary(value: unknown): SetupExistingConfigurationSummary | undefined {
  if (!isRecord(value)) return undefined;
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

function parseSummary(value: unknown): SetupScanSummary | undefined {
  return isRecord(value) && typeof value.entities === 'number' && isRecord(value.domains)
    ? (value as unknown as SetupScanSummary)
    : undefined;
}

/** The fields both versions share, read defensively. */
function parseCommonFields(parsed: Record<string, unknown>) {
  return {
    mode: parsed.mode === 'real' || parsed.mode === 'demo' ? parsed.mode : null,
    hassUrl: typeof parsed.hassUrl === 'string' ? parsed.hassUrl : undefined,
    connectionMethod:
      parsed.connectionMethod === 'direct' || parsed.connectionMethod === 'panel'
        ? parsed.connectionMethod
        : undefined,
    summary: parseSummary(parsed.summary),
    existingConfiguration: parseExistingConfigurationSummary(parsed.existingConfiguration),
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
  } as const;
}

/** A phase that needs what was stored: without a scan there is nothing to show. */
function settlePhase(phase: SetupPhase, fields: ReturnType<typeof parseCommonFields>): SetupPhase {
  if (phase === 'existing' && !fields.existingConfiguration) return fields.summary ? 'summary' : 'scan';
  if (phase === 'summary' && !fields.summary) return 'scan';
  return phase;
}

function parseStoredJourney(raw: string | null): SetupJourney | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SETUP_JOURNEY_VERSION) return null;
    if (!PHASES.includes(parsed.phase as SetupPhase)) return null;
    const fields = parseCommonFields(parsed);
    return {
      version: SETUP_JOURNEY_VERSION,
      ...fields,
      phase: settlePhase(parsed.phase as SetupPhase, fields),
      limitedAccepted: parsed.limitedAccepted === true ? true : undefined,
      start: parsed.start === 'recommended' || parsed.start === 'empty' || parsed.start === 'existing' ? parsed.start : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Converts a journey of the previous setup (v2) to this one. Mode, address,
 * connection, summary and existing configuration are kept; the phase follows
 * the table of the new path. A first-run panel search (discover, detected)
 * becomes the panel scan; outside the panel it becomes the address step,
 * since a panel scan cannot run there. Returns null when the value is not a v2
 * journey.
 */
export function migrateSetupJourneyV2(raw: unknown, options?: { embedded?: boolean }): SetupJourney | null {
  if (!isRecord(raw) || raw.version !== 2 || typeof raw.phase !== 'string') return null;
  const target = V2_PHASES[raw.phase];
  if (!target) return null;
  const fields = parseCommonFields(raw);
  const searching = raw.phase === 'discover' || raw.phase === 'detected';
  const inPanel = options?.embedded === true || fields.connectionMethod === 'panel';
  const phase = searching && !inPanel ? 'connect' : target;
  const connectionMethod = searching
    ? (inPanel ? 'panel' : 'direct')
    : fields.connectionMethod;
  return {
    version: SETUP_JOURNEY_VERSION,
    ...fields,
    mode: searching ? 'real' : fields.mode,
    connectionMethod,
    phase: settlePhase(phase, fields),
  };
}

function readLegacyJourney(storage: Storage, options?: { embedded?: boolean }) {
  const raw = storage.getItem(LEGACY_SETUP_JOURNEY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return migrateSetupJourneyV2(JSON.parse(raw), options);
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

function store(storage: Storage, journey: SetupJourney) {
  storage.setItem(SETUP_JOURNEY_STORAGE_KEY, JSON.stringify(journey));
  return journey;
}

export function readSetupJourney(
  storage?: Storage,
  options?: { embedded?: boolean },
): SetupJourney {
  if (!storage) return createJourney('intro', null);
  const stored = parseStoredJourney(storage.getItem(SETUP_JOURNEY_STORAGE_KEY));
  if (stored) {
    if (options?.embedded && stored.mode === 'real' && !stored.connectionMethod) {
      return store(storage, { ...stored, connectionMethod: 'panel', updatedAt: Date.now() });
    }
    return stored;
  }

  // A setup started before this version continues where it was. The old key
  // goes only once the new one is written.
  const migrated = readLegacyJourney(storage, options);
  if (migrated) {
    store(storage, migrated);
    storage.removeItem(LEGACY_SETUP_JOURNEY_STORAGE_KEY);
    return migrated;
  }

  // Existing installations must not be forced through a new first-run flow.
  const legacyMode = resolveLegacyInstallation(storage, options);
  if (legacyMode) {
    return store(storage, {
      ...createJourney('done', legacyMode),
      connectionMethod:
        legacyMode === 'real'
          ? options?.embedded
            ? 'panel'
            : 'direct'
          : undefined,
    });
  }
  return createJourney('intro', null);
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
  storage?.removeItem(LEGACY_SETUP_JOURNEY_STORAGE_KEY);
  return createJourney('intro', null);
}

/** A setup left half-way: the intro offers to resume it. */
export function isSetupJourneyMidway(journey: Pick<SetupJourney, 'phase'>) {
  return journey.phase !== 'intro' && journey.phase !== 'choice' && journey.phase !== 'done';
}

/** How the Home was chosen to start in setup; null for a Home set up before this setup existed. */
export function readSetupStart(storage?: Storage): SetupStart | null {
  if (!storage) return null;
  return parseStoredJourney(storage.getItem(SETUP_JOURNEY_STORAGE_KEY))?.start ?? null;
}

/**
 * Whether the Home still asks how to start (keep the cards or start empty)
 * after its first-run guide: only for a home set up before setup asked it.
 */
export function shouldAskHomeStart(storage?: Storage) {
  return readSetupStart(storage) === null;
}

export function isDemoRouteAllowed(pathname: string) {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return normalized === '/home' || normalized.startsWith('/home/') || normalized === '/rooms' || normalized.startsWith('/rooms/');
}
