import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { selectHouseholdPeople } from '../services/houseMembers';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Bell,
  BellRing,
  Box,
  ChevronRight,
  CircleCheck,
  Clock,
  Cpu,
  Database,
  DownloadCloud,
  HardDrive,
  Info,
  Languages,
  MoonStar,
  LayoutDashboard,
  Layers3,
  Link2,
  LockKeyhole,
  MemoryStick,
  MonitorSmartphone,
  Network,
  Palette,
  Power,
  Recycle,
  Router,
  RotateCcw,
  Server,
  ShieldCheck,
  UserRoundCog,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { HaArea, HaConnectionStatus } from '../hooks/useHaLiveConnection';
import type {
  HaDeviceRegistryEntry,
  HaEntityRegistryEntry,
} from '../services/haRegistryPresentation';
import GlassToggle from '../components/ui/GlassToggle';
import GlassModal from '../components/ui/GlassModal';
import {
  HOUSE_ACCESS_ROUTE,
  resolveHouseAccessView,
  type ProfileHouseMember,
} from '../components/settings/settingsHouseAccessModel';
import SettingsEntitiesList from '../components/settings/SettingsEntitiesList';
import SettingsDevicesList, {
  SettingsDeviceDetail,
} from '../components/settings/SettingsDevicesList';
import { buildDeviceHealthSnapshots } from '../components/settings/deviceHealthModel';
import { haStatusLabel } from '../components/settings/haStatusLabel';
import NestedPageHeader from '../components/ui/NestedPageHeader';
import { UpdatesCenterModal } from '../components/settings/UpdatesCenterModal';
import type { DashboardSection, Widget } from '../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../types/ha';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { useDashboardSecurity } from '../security/dashboardAccess';
import {
  useHomeAttentionPreferences,
} from '../components/homeAttention/homeAttentionPreferences';
import { useHomeAttentionSuppressions } from '../components/homeAttention/homeAttentionSuppressions';
import SettingsAttentionSection from '../components/settings/SettingsAttentionSection';
import {
  buildSupportDiagnostics,
  createSupportDiagnosticsFilename,
  serializeSupportDiagnostics,
} from '../services/supportDiagnostics';
import SettingsLayoutVersionsSection from '../components/settings/SettingsLayoutVersionsSection';
import { SettingsListGroup, SettingsListRow } from '../components/settings/SettingsList';
import { SETTINGS_PAGE_PROPS, useSettingsPageTransition } from '../components/settings/useSettingsPageTransition';
import SupportFeedbackSection from '../components/settings/SupportFeedbackSection';
import type {
  DashboardRevisionHistoryStatus,
  DashboardRevisionRecord,
} from '../services/dashboardRevisionHistory';
import type { DashboardLayoutSaveResult } from '../services/dashboardStorage';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/translations';
import type { CardSizingEngine } from '../services/cardSizingEngine';
import type { WasteCollectionCallApi } from '../services/wasteCollectionClient';
import type { HaStateTranslations } from '../services/haStateTranslations';
import WasteCollectionSettings from '../components/settings/WasteCollectionSettings';
import SettingsRoomsManager from '../components/settings/SettingsRoomsManager';
import SettingsSecurityPage, { type SecurityAlarmCard } from '../components/settings/SettingsSecurityPage';
import type { AuthUserContext } from '../hooks/useDeviceAuth';
import {
  SETTINGS_SECTIONS,
  selectVisibleSettingsEntries,
  type SettingsEntryId,
} from '../components/settings/settingsScopes';
import {
  DEVICE_APPEARANCE_ROUTE,
  DEVICE_KIOSK_ROUTE,
  DEVICE_LANGUAGE_ROUTE,
  DEVICE_POWER_ROUTE,
  DEVICE_SCREENSAVER_ROUTE,
  DEVICE_SETTINGS_ROUTE,
  PROFILE_ROUTE,
  isProfileSettingsRoute,
} from '../navigation/settingsRoutes';
import type { DashboardAppearanceMode, DashboardBackgroundPreset } from '../theme/dashboardTheme';
import LazyLoadBoundary from '../components/common/LazyLoadBoundary';
import { useScreensaverPreferences } from '../components/screensaver/screensaverPreferences';
import { useKioskPreferences } from '../components/kiosk/kioskPreferences';

// Only the pages of This device need their controls; the overview needs none.
const DeviceAppearanceSettings = React.lazy(() =>
  import('../components/settings/DevicePreferencesSettings').then((module) => ({
    default: module.DeviceAppearanceSettings,
  })),
);
const DeviceLanguageSettings = React.lazy(() =>
  import('../components/settings/DevicePreferencesSettings').then((module) => ({
    default: module.DeviceLanguageSettings,
  })),
);
const DevicePowerSettings = React.lazy(() => import('../components/settings/DevicePowerSettings'));
const ScreensaverSettings = React.lazy(() => import('../components/settings/ScreensaverSettings'));
const KioskSettings = React.lazy(() => import('../components/settings/KioskSettings'));

type SettingsDashboardProps = {
  developerMode: boolean;
  cardSizingEngine?: CardSizingEngine;
  haStatus: HaConnectionStatus;
  haError: string | null;
  haStates: MockEntityStateMap;
  haAreas: HaArea[];
  haEntityRegistry?: HaEntityRegistryEntry[];
  haDeviceRegistry?: HaDeviceRegistryEntry[];
  sections: DashboardSection[];
  widgets: Widget[];
  houseMembers: ProfileHouseMember[];
  currentLayoutId?: string;
  sensorHistoryByEntity?: Record<string, number[]>;
  onDeveloperModeChange: (value: boolean) => void;
  onCardSizingEngineChange?: (value: CardSizingEngine) => void;
  layoutRevisions?: DashboardRevisionRecord[];
  layoutRevisionHistoryStatus?: DashboardRevisionHistoryStatus;
  onRefreshLayoutRevisions?: () => Promise<boolean>;
  onRestoreLayoutRevision?: (revision: number) => Promise<DashboardLayoutSaveResult>;
  onCallService: (domain: string, service: string, serviceData: Record<string, unknown>) => Promise<boolean>;
  onCallApi?: WasteCollectionCallApi;
  /** The integration lists people as notification recipients (`profile_recipients_v1`). */
  recipientsSupported?: boolean;
  /** The integration manages this device's charger (`device_power_v1`). */
  devicePowerSupported?: boolean;
  /** The main pages a Kiosk panel can open on, as the navigation names them. */
  kioskStartRoutes?: readonly { path: string; label: string }[];
  /** Turns a Home Assistant picture path into a loadable URL. */
  resolveAssetUrl?: (url: string) => string;
  /** Home Assistant's own words for entity states, when they can be asked for. */
  loadStateTranslations?: (language: string) => Promise<HaStateTranslations>;
  /** The rooms after a change made here, for the rest of the app. */
  onAreasChanged?: (areas: HaArea[]) => void;
  /** The alarm cards of the dashboard, for their codes on this device. */
  alarmCards?: SecurityAlarmCard[];
  /** Whose device confirmation is shown (same identity as the Profile). */
  deviceAuthUser?: Partial<AuthUserContext>;
  /** The signed-in person, shown at the top of Settings; the card opens the Profile. */
  account?: { name?: string; email?: string; roleLabel?: string; avatarUrl?: string };
  /** Light or dark theme of this device (Settings › This device). */
  appearanceMode: DashboardAppearanceMode;
  onAppearanceModeChange: (mode: DashboardAppearanceMode) => void;
  /** Background of this device (Settings › This device). */
  background: DashboardBackgroundPreset;
  onBackgroundChange: (background: DashboardBackgroundPreset) => void;
  navigationRoute?: string;
  onNavigate?: (path: string) => void;
  managedSectionContent?: React.ReactNode;
};

type SystemSensorKind =
  | 'diskUsage'
  | 'diskFree'
  | 'diskUse'
  | 'memoryUsage'
  | 'memoryUse'
  | 'memoryFree'
  | 'processorUse'
  | 'processorTemperature'
  | 'uptime'
  | 'ipAddress'
  | 'latency'
  | 'backupTimestamp'
  | 'backupSize'
  | 'networkIn'
  | 'networkOut';

type SystemSensorMatch = {
  entityId: string;
  entity: MockEntityState;
  kind: SystemSensorKind;
};

type UpdateEntityMatch = {
  entityId: string;
  entity: MockEntityState;
  title: string;
  installed: string;
  latest: string;
  available: boolean;
  /** true while HA is installing this update (official `update` entity attribute). */
  inProgress: boolean;
  /** install progress 0–100, or null when the entity does not report a percentage. */
  percentage: number | null;
  releaseSummary: string | null;
  releaseUrl: string | null;
  picture: string | null;
  /** `update.install` accepts `backup: true` (UpdateEntityFeature.BACKUP). */
  supportsBackup: boolean;
  /** The latest version was skipped with `update.skip`. */
  skipped: boolean;
  skippedVersion: string | null;
};

/** UpdateEntityFeature.BACKUP in Home Assistant. */
const UPDATE_FEATURE_BACKUP = 8;

type MetricTone = 'ok' | 'warn' | 'danger';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function metricTone(value: number | null, warnAt: number, dangerAt: number): MetricTone {
  if (value === null) {
    return 'ok';
  }
  if (value >= dangerAt) {
    return 'danger';
  }
  if (value >= warnAt) {
    return 'warn';
  }
  return 'ok';
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function entityName(entityId: string, entity: MockEntityState) {
  const friendlyName = normalizeText(entity.rawAttributes?.friendly_name);
  if (friendlyName) {
    return friendlyName;
  }
  return entityId
    .replace(/^[^.]+\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseNumericState(entity: MockEntityState) {
  if (typeof entity.numericValue === 'number' && Number.isFinite(entity.numericValue)) {
    return entity.numericValue;
  }
  const parsed = Number(String(entity.state).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEntityValue(entity: MockEntityState) {
  const value = parseNumericState(entity);
  if (value === null) {
    return entity.state || 'n/d';
  }
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${entity.unit ? ` ${entity.unit}` : ''}`;
}

function formatDateTime(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function formatEntityTimestamp(entity: MockEntityState, locale: string): string | null {
  const rawState = normalizeText(entity.state);
  const rawDeviceClass = normalizeLower(entity.rawAttributes?.device_class);
  const parsedDate = Date.parse(rawState);
  if ((rawDeviceClass === 'timestamp' || rawState.includes('T')) && Number.isFinite(parsedDate)) {
    return formatDateTime(new Date(parsedDate), locale);
  }
  return null;
}

function formatDurationFromMs(deltaMs: number, t: ReturnType<typeof useI18n>['t']) {
  const totalMinutes = Math.max(0, Math.floor(deltaMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return t('settings.system.durationDays', { days, hours });
  }
  if (hours > 0) {
    return t('settings.system.durationHours', { hours, minutes });
  }
  return t('settings.system.durationMinutes', { minutes });
}

// Uptime can be exposed either as a boot timestamp (device_class timestamp)
// or as a numeric duration. Normalize both to a boot-time in ms.
function resolveBootTimeMs(entity: SystemSensorMatch | null): number | null {
  if (!entity) {
    return null;
  }
  const raw = normalizeText(entity.entity.state);
  const deviceClass = normalizeLower(entity.entity.rawAttributes?.device_class);
  const parsedDate = Date.parse(raw);
  if ((deviceClass === 'timestamp' || raw.includes('T')) && Number.isFinite(parsedDate)) {
    return parsedDate;
  }
  const numeric = parseNumericState(entity.entity);
  if (numeric === null) {
    return null;
  }
  const unit = normalizeLower(entity.entity.unit);
  const seconds = unit.startsWith('h')
    ? numeric * 3600
    : unit.startsWith('min') || unit === 'm'
      ? numeric * 60
      : unit.startsWith('d')
        ? numeric * 86400
        : numeric;
  return Date.now() - seconds * 1000;
}

function resolveHistoryForEntity(historyMap: Record<string, number[]> | undefined, entityId: string | undefined) {
  const normalizedEntityId = entityId?.trim();
  if (!normalizedEntityId) {
    return [];
  }
  const direct = historyMap?.[normalizedEntityId];
  const lower = historyMap?.[normalizedEntityId.toLowerCase()];
  return (direct ?? lower ?? []).filter((value) => Number.isFinite(value));
}

function classifySystemSensor(entityId: string, entity: MockEntityState): SystemSensorKind | null {
  const id = entityId.toLowerCase();
  const unit = normalizeLower(entity.unit);
  const name = `${id} ${normalizeLower(entity.rawAttributes?.friendly_name)} ${normalizeLower(entity.rawAttributes?.device_class)}`;
  if (!entityId.startsWith('sensor.')) {
    return null;
  }
  if (name.includes('ip address') || name.includes('indirizzo ip') || id.endsWith('_ip') || name.includes('ip_address')) {
    return 'ipAddress';
  }
  if (name.includes('latency') || name.includes('latenza') || name.includes('ping') || name.includes('round trip')) {
    return 'latency';
  }
  if (name.includes('backup') || name.includes('snapshot')) {
    if (name.includes('size') || name.includes('dimension') || ['gb', 'mb', 'gib', 'mib', 'tb'].includes(unit)) {
      return 'backupSize';
    }
    return 'backupTimestamp';
  }
  if (name.includes('disk') || name.includes('disco')) {
    if (name.includes('usage') || name.includes('percent') || name.includes('percentuale') || unit === '%') {
      return 'diskUsage';
    }
    if (name.includes('free') || name.includes('liber')) {
      return 'diskFree';
    }
    if (name.includes('use') || name.includes('used') || name.includes('usato')) {
      return 'diskUse';
    }
  }
  if (name.includes('memory') || name.includes('memoria')) {
    if (name.includes('free') || name.includes('liber')) {
      return 'memoryFree';
    }
    if (name.includes('percent') || unit === '%') {
      return 'memoryUsage';
    }
    if (name.includes('use') || name.includes('used') || name.includes('usata') || name.includes('usato')) {
      return 'memoryUse';
    }
    return 'memoryUsage';
  }
  if (name.includes('processor temperature') || name.includes('cpu temperature') || name.includes('temperatura processore')) {
    return 'processorTemperature';
  }
  if (name.includes('processor') || name.includes('cpu')) {
    return 'processorUse';
  }
  if (name.includes('uptime') || name.includes('ultimo avvio') || name.includes('last boot')) {
    return 'uptime';
  }
  if (name.includes('throughput in') || name.includes('network in') || name.includes('rete in')) {
    return 'networkIn';
  }
  if (name.includes('throughput out') || name.includes('network out') || name.includes('rete out')) {
    return 'networkOut';
  }
  return null;
}

function pickSystemSensors(haStates: MockEntityStateMap) {
  const matches: SystemSensorMatch[] = [];
  Object.entries(haStates).forEach(([entityId, entity]) => {
    const kind = classifySystemSensor(entityId, entity);
    if (kind) {
      matches.push({ entityId, entity, kind });
    }
  });
  return matches;
}

function pickPreferredSensor(matches: SystemSensorMatch[], kind: SystemSensorKind) {
  return matches.find((match) => match.kind === kind) ?? null;
}

function collectUpdateEntities(haStates: MockEntityStateMap): UpdateEntityMatch[] {
  return Object.entries(haStates)
    .filter(([entityId]) => entityId.startsWith('update.'))
    .map(([entityId, entity]) => {
      const state = normalizeLower(entity.state);
      const available = state === 'on' || state === 'update_available' || state === 'available';
      // Official `update` entity progress attributes. `update_percentage` was
      // introduced in 2024.11; before that (and until 2025.12 for back-compat) a
      // numeric `in_progress` carried the percentage, so we fall back to it.
      const rawInProgress = entity.rawAttributes?.in_progress;
      const rawPercentage = entity.rawAttributes?.update_percentage;
      const percentage =
        typeof rawPercentage === 'number' && Number.isFinite(rawPercentage)
          ? clamp(rawPercentage, 0, 100)
          : typeof rawInProgress === 'number' && Number.isFinite(rawInProgress)
            ? clamp(rawInProgress, 0, 100)
            : null;
      const inProgress = rawInProgress === true || percentage !== null;
      const latest = normalizeText(entity.rawAttributes?.latest_version);
      const skippedVersion = normalizeText(entity.rawAttributes?.skipped_version) || null;
      const features = entity.supportedFeatures ?? Number(entity.rawAttributes?.supported_features ?? 0);
      return {
        entityId,
        entity,
        title: entityName(entityId, entity),
        installed: normalizeText(entity.rawAttributes?.installed_version),
        latest,
        available,
        inProgress,
        percentage,
        releaseSummary: normalizeText(entity.rawAttributes?.release_summary) || null,
        releaseUrl: normalizeText(entity.rawAttributes?.release_url) || null,
        picture: normalizeText(entity.rawAttributes?.entity_picture) || null,
        supportsBackup: Number.isFinite(features) && (features & UPDATE_FEATURE_BACKUP) !== 0,
        skipped: !available && skippedVersion !== null && skippedVersion === latest,
        skippedVersion,
      };
    })
    .sort((first, second) => Number(second.available) - Number(first.available) || first.title.localeCompare(second.title));
}

function MiniSparkline({ id, data }: { id: string; data: number[] }) {
  const { t } = useI18n();
  const chartData = useMemo(() => data.slice(-24).map((value, index) => ({ index, value })), [data]);
  if (chartData.length < 2) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-[color:var(--ui-surface-glass)] text-[11px] font-medium text-[color:var(--ui-text-secondary)]">
        {t('settings.system.insufficientData')}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity={0.24} />
            <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="rgb(99,102,241)"
          strokeWidth={1.8}
          fill={`url(#${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function InfoRow({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-[color:var(--ui-border)] py-2.5 first:border-t-0">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-secondary)]">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">{title}</p>
        <p className="truncate text-[11px] font-medium text-[color:var(--ui-text-secondary)]">{subtitle}</p>
      </div>
    </div>
  );
}

/** The layout in use, in words: phone, tablet or desktop rather than a breakpoint id. */
function layoutFormatLabel(layoutId: string | undefined, t: ReturnType<typeof useI18n>['t']) {
  if (layoutId === 'xs' || layoutId === 'sm') return t('settings.dashboard.layout.phone');
  if (layoutId === 'md') return t('settings.dashboard.layout.tablet');
  if (layoutId === 'lg' || layoutId === 'xl' || layoutId === '2xl') return t('settings.dashboard.layout.desktop');
  return t('settings.dashboard.layout.auto');
}

function SettingsDetailShell({
  title,
  subtitle,
  onBack,
  backLabel,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  backLabel?: string;
  /** A page with a multi-column form; the others share one reading width. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div {...SETTINGS_PAGE_PROPS} className="dashboard-page-scroll !p-0 text-[color:var(--ui-text-primary)]">
      <NestedPageHeader
        title={title}
        subtitle={subtitle}
        backLabel={backLabel ?? t('settings.back')}
        onBack={onBack}
        contentClassName="lg:!px-10"
      />
      <main className="dashboard-page-content-wide px-4 pb-[calc(env(safe-area-inset-bottom)+6.25rem)] pt-4 sm:px-6 sm:pb-6 sm:pt-5 lg:px-10">
        {wide ? children : <div className="mx-auto w-full max-w-[48rem]">{children}</div>}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function SettingsDashboard({
  developerMode,
  cardSizingEngine = 'adaptive',
  haStatus,
  haError,
  haStates,
  haAreas,
  haEntityRegistry = [],
  haDeviceRegistry = [],
  sections,
  widgets,
  houseMembers,
  currentLayoutId,
  sensorHistoryByEntity,
  onDeveloperModeChange,
  onCardSizingEngineChange,
  layoutRevisions = [],
  layoutRevisionHistoryStatus = 'idle',
  onRefreshLayoutRevisions,
  onRestoreLayoutRevision,
  onCallService,
  onCallApi,
  recipientsSupported = false,
  devicePowerSupported = false,
  kioskStartRoutes = [],
  resolveAssetUrl,
  loadStateTranslations,
  onAreasChanged,
  alarmCards = [],
  deviceAuthUser,
  account,
  appearanceMode,
  onAppearanceModeChange,
  background,
  onBackgroundChange,
  navigationRoute,
  onNavigate,
  managedSectionContent,
}: SettingsDashboardProps) {
  const { locale, t } = useI18n();
  const security = useDashboardSecurity();
  const {
    preferences: attentionPreferences,
    setPreferences: setAttentionPreferences,
    resetPreferences: resetAttentionPreferences,
  } = useHomeAttentionPreferences(security.runtimeMode);
  const {
    suppressions: attentionSuppressions,
    clearSuppressions: clearAttentionSuppressions,
  } = useHomeAttentionSuppressions(security.runtimeMode);
  const [actionFeedback, setActionFeedback] = useState<string>('');
  const [diagnosticsFeedback, setDiagnosticsFeedback] = useState<string>('');
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [wasteHasUnsavedChanges, setWasteHasUnsavedChanges] = useState(false);
  const [wasteLeaveConfirmOpen, setWasteLeaveConfirmOpen] = useState(false);
  const [updatesPageOpen, setUpdatesPageOpen] = useState(false);
  const [accountAvatarFailed, setAccountAvatarFailed] = useState(false);
  // 0 → 1 while the person scrolls out of the overview and into its top bar:
  // the bar's surface first, so it covers what passes under it, then its content.
  const [accountBar, setAccountBar] = useState({ surface: 0, content: 0 });
  const overviewScrollRef = useRef<HTMLDivElement>(null);
  const [powerConfirm, setPowerConfirm] = useState<'restartHa' | 'restartHost' | 'shutdown' | null>(null);
  // Re-render once a minute so uptime/duration labels stay fresh.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const isConnected = haStatus === 'connected';
  const screensaver = useScreensaverPreferences();
  const kiosk = useKioskPreferences();
  // The rows only follow Home Assistant; every device power command is checked there again.
  const isAdministrator =
    security.runtimeMode === 'real' &&
    security.identityStatus === 'authenticated' &&
    Boolean(security.user?.isOwner || security.user?.isAdmin);
  const systemSensors = useMemo(() => pickSystemSensors(haStates), [haStates]);
  const updateEntities = useMemo(() => collectUpdateEntities(haStates), [haStates]);
  const availableUpdates = updateEntities.filter((entry) => entry.available);
  const skippedUpdates = updateEntities.filter((entry) => entry.skipped);
  // Pictures from Home Assistant are often relative to its address.
  const withPicture = <T extends { picture: string | null }>(update: T): T => ({
    ...update,
    picture: update.picture && update.picture.startsWith('/') && resolveAssetUrl ? resolveAssetUrl(update.picture) : update.picture,
  });

  const diskUsage = pickPreferredSensor(systemSensors, 'diskUsage');
  const diskFree = pickPreferredSensor(systemSensors, 'diskFree');
  const diskUse = pickPreferredSensor(systemSensors, 'diskUse');
  const memoryUsage = pickPreferredSensor(systemSensors, 'memoryUsage');
  const memoryUse = pickPreferredSensor(systemSensors, 'memoryUse');
  const memoryFree = pickPreferredSensor(systemSensors, 'memoryFree');
  const processorUse = pickPreferredSensor(systemSensors, 'processorUse');
  const processorTemperature = pickPreferredSensor(systemSensors, 'processorTemperature');
  const uptime = pickPreferredSensor(systemSensors, 'uptime');
  const ipAddress = pickPreferredSensor(systemSensors, 'ipAddress');
  const latency = pickPreferredSensor(systemSensors, 'latency');
  const backupTimestamp = pickPreferredSensor(systemSensors, 'backupTimestamp');
  const backupSize = pickPreferredSensor(systemSensors, 'backupSize');

  const systemEntityIds = systemSensors.map((entry) => entry.entityId);
  const processorUseHistory = resolveHistoryForEntity(sensorHistoryByEntity, processorUse?.entityId);
  const latencyHistory = resolveHistoryForEntity(sensorHistoryByEntity, latency?.entityId);

  // --- Telemetry values + conditional tones ---
  const cpuValue = processorUse ? parseNumericState(processorUse.entity) : null;
  const tempValue = processorTemperature ? parseNumericState(processorTemperature.entity) : null;
  const diskPercent = diskUsage ? parseNumericState(diskUsage.entity) : null;

  const memoryUseValue = memoryUse ? parseNumericState(memoryUse.entity) : null;
  const memoryFreeValue = memoryFree ? parseNumericState(memoryFree.entity) : null;
  const memoryTotalValue =
    memoryUseValue !== null && memoryFreeValue !== null ? memoryUseValue + memoryFreeValue : null;
  const ramPercent =
    memoryUsage !== null && memoryUsage
      ? parseNumericState(memoryUsage.entity)
      : memoryTotalValue && memoryTotalValue > 0 && memoryUseValue !== null
        ? (memoryUseValue / memoryTotalValue) * 100
        : null;

  const cpuTone = metricTone(cpuValue, 60, 80);
  const ramTone = metricTone(ramPercent, 75, 90);
  const tempTone = metricTone(tempValue, 70, 82);
  const diskTone = metricTone(diskPercent, 75, 90);
  const worstTone: MetricTone = [cpuTone, ramTone, tempTone, diskTone].includes('danger')
    ? 'danger'
    : [cpuTone, ramTone, tempTone, diskTone].includes('warn')
      ? 'warn'
      : 'ok';

  const ramMemHint =
    memoryUseValue !== null && memoryTotalValue !== null
      ? `${Math.round(memoryUseValue)} / ${Math.round(memoryTotalValue)} ${memoryUse?.entity.unit ?? 'MB'}`
      : undefined;
  const diskHint = diskUse
    ? t('settings.system.diskUsed', { used: formatEntityValue(diskUse.entity), free: diskFree ? formatEntityValue(diskFree.entity) : '—' })
    : diskFree
      ? t('settings.system.diskFree', { free: formatEntityValue(diskFree.entity) })
      : undefined;

  // --- Network & uptime ---
  const bootTimeMs = resolveBootTimeMs(uptime);
  const uptimeLabel = bootTimeMs === null ? '—' : formatDurationFromMs(nowTick - bootTimeMs, t);
  const uptimeSince = bootTimeMs === null ? t('settings.common.unavailable') : t('settings.system.since', { date: formatDateTime(new Date(bootTimeMs), locale) });
  const lastRestartLabel =
    bootTimeMs === null ? t('settings.system.restartUnavailable') : t('settings.system.lastRestart', { date: formatDateTime(new Date(bootTimeMs), locale) });
  const ipLabel = ipAddress ? normalizeText(ipAddress.entity.state) || '—' : '—';
  const latencyValue = latency ? parseNumericState(latency.entity) : null;

  // --- Backup ---
  const lastBackupLabel = backupTimestamp
    ? formatEntityTimestamp(backupTimestamp.entity, locale) ?? formatEntityValue(backupTimestamp.entity)
    : null;
  const backupSizeLabel = backupSize ? formatEntityValue(backupSize.entity) : null;

  const runQuickAction = async (action: () => Promise<void>, successText: string) => {
    setActionFeedback('');
    setIsActionBusy(true);
    try {
      await action();
      setActionFeedback(successText);
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : t('settings.system.actionFailed'));
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleRefreshSystemSensors = () => {
    void runQuickAction(async () => {
      if (systemEntityIds.length === 0) {
        throw new Error(t('settings.system.noServerSensors'));
      }
      const success = await onCallService('homeassistant', 'update_entity', { entity_id: systemEntityIds });
      if (!success) {
        throw new Error(t('settings.system.sensorUpdateFailed'));
      }
    }, t('settings.system.sensorsUpdated'));
  };

  const handleUpdateAll = () => {
    void runQuickAction(async () => {
      if (availableUpdates.length === 0) {
        throw new Error(t('settings.system.noAvailableUpdates'));
      }
      for (const update of availableUpdates) {
        const success = await onCallService('update', 'install', { entity_id: update.entityId });
        if (!success) {
          throw new Error(t('settings.system.updateNotStarted', { name: update.title }));
        }
      }
    }, t('settings.system.updatesStarted'));
  };

  const handleForceBackup = () => {
    void runQuickAction(async () => {
      const success = await onCallService('backup', 'create', {});
      if (!success) {
        throw new Error(t('settings.system.backupNotStarted'));
      }
    }, t('settings.system.backupStarted'));
  };

  const handleRestartServer = () => {
    if (!security.can('restart_home_assistant')) {
      return;
    }
    void runQuickAction(async () => {
      const success = await onCallService('homeassistant', 'restart', {});
      if (!success) {
        throw new Error(t('settings.system.restartNotStarted'));
      }
    }, t('settings.system.restartStarted'));
  };

  const handleRebootHost = () => {
    void runQuickAction(async () => {
      const success = await onCallService('hassio', 'host_reboot', {});
      if (!success) {
        throw new Error(t('settings.system.hostRestartNotStarted'));
      }
    }, t('settings.system.hostRestartStarted'));
  };

  const handleShutdownHost = () => {
    void runQuickAction(async () => {
      const success = await onCallService('hassio', 'host_shutdown', {});
      if (!success) {
        throw new Error(t('settings.system.shutdownNotStarted'));
      }
    }, t('settings.system.shutdownStarted'));
  };

  const settingsPath =
    navigationRoute?.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/settings';
  const navigateTo = (path: string) => onNavigate?.(path);
  useSettingsPageTransition(settingsPath);
  const isOverviewPath =
    settingsPath === '/settings' || settingsPath === '/settings/home' || settingsPath === DEVICE_SETTINGS_ROUTE;
  useEffect(() => {
    const scroller = overviewScrollRef.current;
    if (!isOverviewPath || !scroller) {
      setAccountBar({ surface: 0, content: 0 });
      return;
    }
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const update = () => {
      const top = scroller.scrollTop;
      const next = { surface: clamp((top - 8) / 32), content: clamp((top - 70) / 40) };
      setAccountBar((current) =>
        Math.abs(current.surface - next.surface) < 0.01 && Math.abs(current.content - next.content) < 0.01
          ? current
          : next,
      );
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, [isOverviewPath, settingsPath]);
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    [],
  );
  // The Profile links here for appearance and language: start at This device.
  useEffect(() => {
    if (settingsPath !== DEVICE_SETTINGS_ROUTE) return;
    document.getElementById('settings-section-device')?.scrollIntoView?.({ block: 'start' });
  }, [settingsPath]);
  const canOpenData =
    security.can('download_backup') || security.can('restore_backup') || security.can('reset_dashboard');
  const hasSystemTelemetry = [cpuValue, ramPercent, tempValue, diskPercent].some(
    (value) => value !== null,
  );
  const healthLabel = !hasSystemTelemetry
    ? t('settings.system.telemetryUnavailable')
    : worstTone === 'danger'
      ? t('settings.devices.needsAttention')
      : worstTone === 'warn'
        ? t('settings.devices.needsAttention')
        : t('settings.system.operational');
  const deviceHealthSnapshots = useMemo(
    () =>
      buildDeviceHealthSnapshots({
        locale,
        connected: isConnected,
        states: haStates,
        entityRegistry: haEntityRegistry,
        deviceRegistry: haDeviceRegistry,
        areas: haAreas,
        widgets,
        batteryWarningThreshold: attentionPreferences.batteryWarningThreshold,
      }),
    [
      attentionPreferences.batteryWarningThreshold,
      locale,
      haAreas,
      haDeviceRegistry,
      haEntityRegistry,
      haStates,
      isConnected,
      widgets,
    ],
  );
  const deviceAttentionCount = deviceHealthSnapshots.filter(
    (device) => device.status === 'warning' || device.status === 'offline',
  ).length;
  const handleDownloadSupportDiagnostics = () => {
    let embedded = false;
    try {
      embedded = window.self !== window.top;
    } catch {
      embedded = true;
    }
    const report = buildSupportDiagnostics({
      appVersion: __APP_VERSION__,
      runtimeMode: security.runtimeMode,
      haStatus,
      connectionErrorPresent: Boolean(haError),
      identityAuthenticated: security.identityStatus === 'authenticated',
      isOwner: security.user?.isOwner,
      isAdmin: security.user?.isAdmin,
      embedded,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio,
      },
      states: haStates,
      entityRegistry: haEntityRegistry,
      deviceRegistry: haDeviceRegistry,
      areaCount: haAreas.length,
      sections,
      widgets,
      deviceHealth: deviceHealthSnapshots,
    });
    const blob = new Blob([serializeSupportDiagnostics(report)], {
      type: 'application/json',
    });
    const objectUrl = URL.createObjectURL(blob);
    const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = createSupportDiagnosticsFilename(report.generatedAt);
    anchor.click();
    window.setTimeout(() => revokeObjectUrl(objectUrl), 0);
    setDiagnosticsFeedback(t('settings.system.diagnosticsDownloaded'));
  };
  // People only: logins without a person are not members of the house.
  const householdPeopleCount = selectHouseholdPeople(houseMembers).length;
  const canConfigureDashboard = security.can('edit_dashboard');

  // The Profile pages belong to the Profile; never fall back to another page for them.
  if (isProfileSettingsRoute(settingsPath)) {
    return null;
  }

  if (settingsPath === '/support') {
    return (
      <SettingsDetailShell
        title={t('settings.support.title')}
        subtitle={t('settings.support.subtitle')}
        onBack={() => navigateTo(PROFILE_ROUTE)}
        backLabel={t('settings.profile.back')}
      >
        <SupportFeedbackSection
          appVersion={__APP_VERSION__}
          haStatus={haStatus}
          onDownloadDiagnostics={handleDownloadSupportDiagnostics}
          diagnosticsFeedback={diagnosticsFeedback || undefined}
        />
      </SettingsDetailShell>
    );
  }

  // `/settings/home` is the old address of this page; `/settings/device` leads to its last group.
  if (isOverviewPath) {
    // How each entry of the scope registry looks here; which entries exist,
    // where they lead and who sees them comes from the registry.
    const appearanceLabel =
      appearanceMode === 'light'
        ? t('settings.device.themeLight')
        : appearanceMode === 'dark'
          ? t('settings.device.themeDark')
          : t('settings.device.themeSystem');
    const rows: Record<SettingsEntryId, {
      icon: LucideIcon;
      /** The filled tile behind the icon, as in iOS Settings. */
      color: string;
      subtitle?: string;
      value?: string;
    }> = {
      dashboard: { icon: LayoutDashboard, color: 'bg-indigo-500' },
      floors: { icon: Layers3, color: 'bg-sky-500' },
      access: { icon: UserRoundCog, color: 'bg-violet-500', value: householdPeopleCount > 0 ? String(householdPeopleCount) : undefined },
      security: { icon: LockKeyhole, color: 'bg-emerald-600' },
      waste: { icon: Recycle, color: 'bg-green-600' },
      connection: { icon: Link2, color: 'bg-cyan-600', value: haStatusLabel(haStatus, t) },
      devices: {
        icon: Router,
        color: 'bg-blue-500',
        value: String(haDeviceRegistry.length),
        subtitle: deviceAttentionCount > 0 ? t('settings.devices.attention', { count: deviceAttentionCount }) : undefined,
      },
      entities: { icon: Box, color: 'bg-slate-500', value: String(Object.keys(haStates).length) },
      system: { icon: Activity, color: 'bg-teal-600', value: hasSystemTelemetry ? healthLabel : undefined },
      data: { icon: Database, color: 'bg-amber-500', value: lastBackupLabel ?? undefined },
      appearance: { icon: Palette, color: 'bg-pink-500', value: appearanceLabel },
      language: { icon: Languages, color: 'bg-sky-600', value: t(`language.name.${locale}` as TranslationKey) },
      screensaver: {
        icon: MoonStar,
        color: 'bg-indigo-500',
        value: screensaver.enabled
          ? t('settings.device.screensaverAfter', { count: screensaver.timeoutMinutes })
          : t('settings.device.screensaverOff'),
      },
      kiosk: {
        icon: MonitorSmartphone,
        color: 'bg-slate-600',
        value: kiosk.enabled ? t('settings.device.kioskOn') : t('settings.device.screensaverOff'),
      },
      power: { icon: BatteryCharging, color: 'bg-emerald-600' },
      attention: {
        icon: BellRing,
        color: 'bg-orange-500',
        value: attentionPreferences.enabled
          ? t('settings.attention.activeCategories', {
              count: Object.values(attentionPreferences.categories).filter(Boolean).length,
            })
          : t('settings.attention.disabled'),
      },
      advanced: { icon: Wrench, color: 'bg-zinc-500', value: __APP_VERSION__ },
    };
    const accountName = account?.name?.trim() || t('profile.fallback.name');
    const accountDetail = [account?.email?.trim(), account?.roleLabel?.trim()].filter(Boolean).join(' · ');
    const accountInitials =
      accountName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'U';
    return (
      <div
        key={settingsPath}
        ref={overviewScrollRef}
        {...SETTINGS_PAGE_PROPS}
        className="dashboard-page-scroll text-[color:var(--ui-text-primary)]"
      >
        {/* The page starts with the person; the title stays for assistive technology. */}
        <h1 className="sr-only">{t('settings.title')}</h1>

        {/* On a phone or tablet the person moves into a bar at the top while the page scrolls. */}
        <div aria-hidden="true" className="pointer-events-none sticky -top-4 z-30 -mx-4 h-0 sm:-top-6 sm:-mx-6 lg:hidden">
          <div
            data-testid="settings-account-bar"
            data-progress={accountBar.content.toFixed(2)}
            className="absolute inset-x-0 top-0 flex min-h-[calc(env(safe-area-inset-top)+3.25rem)] items-center justify-center gap-2 px-4 pt-[env(safe-area-inset-top)]"
          >
            <span
              className="absolute inset-0 border-b border-[color:var(--ui-separator)] bg-[color:var(--ui-bg-grouped)] shadow-[0_10px_30px_var(--ui-shadow-soft)] backdrop-blur-3xl"
              style={{ opacity: accountBar.surface }}
            />
            <span
              className="relative flex min-w-0 items-center gap-2"
              style={{
                opacity: accountBar.content,
                transform: reduceMotion ? undefined : `translateY(${Math.round((1 - accountBar.content) * 8)}px)`,
              }}
            >
              <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-secondary)] text-[10px] font-semibold">
                {account?.avatarUrl && !accountAvatarFailed ? (
                  <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  accountInitials
                )}
                <span
                  className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[color:var(--ui-bg-grouped)] ${
                    isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </span>
              <span className="truncate text-sm font-semibold tracking-[-0.015em]">{accountName}</span>
            </span>
          </div>
        </div>

        <main className="mx-auto w-full max-w-[48rem] space-y-7 pb-10">
          {/* The person first and centred, as at the top of an Apple account page. */}
          <section aria-label={t('profile.title')} className="space-y-4">
            <button
              type="button"
              onClick={() => navigateTo(PROFILE_ROUTE)}
              style={{ opacity: 1 - accountBar.content }}
              className="flex w-full flex-col items-center rounded-[1.6rem] px-4 pb-3 pt-2 text-center transition-colors hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-focus-ring)]"
            >
              <span className="relative mb-3 shrink-0">
                <span className="flex h-[5.5rem] w-[5.5rem] items-center justify-center overflow-hidden rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-secondary)] text-2xl font-semibold shadow-[0_14px_34px_var(--ui-shadow)]">
                  {account?.avatarUrl && !accountAvatarFailed ? (
                    <img
                      src={account.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAccountAvatarFailed(true)}
                    />
                  ) : (
                    accountInitials
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-[color:var(--ui-bg-grouped)] ${
                    isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </span>
              <span className="block max-w-full truncate text-[1.6rem] font-semibold leading-tight tracking-[-0.04em]">
                {accountName}
              </span>
              {accountDetail ? (
                <span className="mt-1 block max-w-full truncate text-sm text-[color:var(--ui-text-secondary)]">
                  {accountDetail}
                </span>
              ) : null}
              <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-semibold text-[color:var(--ui-accent)]">
                {t('settings.account.open')}
                <ChevronRight size={13} aria-hidden="true" />
              </span>
            </button>
            <div className="overflow-hidden rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] shadow-[0_16px_34px_var(--ui-shadow-soft)] backdrop-blur-2xl">
              <SettingsListRow
                icon={Bell}
                iconClassName="bg-rose-500"
                title={t('profile.devices.title')}
                subtitle={t('profile.devices.subtitle')}
                onClick={() => navigateTo(`${PROFILE_ROUTE}/devices`)}
              />
            </div>
          </section>

          {SETTINGS_SECTIONS.map((section) => {
            const entries = selectVisibleSettingsEntries(
              section.id,
              (capability) => security.can(capability),
              isAdministrator,
            );
            if (entries.length === 0) return null;
            return (
              <SettingsListGroup
                key={section.id}
                id={`settings-section-${section.id}`}
                title={t(section.titleKey)}
                description={t(section.descriptionKey)}
              >
                {entries.map((entry) => {
                  const row = rows[entry.id];
                  return (
                    <SettingsListRow
                      key={entry.id}
                      icon={row.icon}
                      iconClassName={row.color}
                      title={t(entry.titleKey)}
                      subtitle={row.subtitle ?? t(entry.descriptionKey)}
                      value={row.value}
                      onClick={() => navigateTo(entry.route)}
                    />
                  );
                })}
              </SettingsListGroup>
            );
          })}
        </main>
      </div>
    );
  }

  if (settingsPath === DEVICE_APPEARANCE_ROUTE) {
    return (
      <SettingsDetailShell
        title={t('settings.device.appearance')}
        subtitle={t('settings.device.appearancePageSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <LazyLoadBoundary mode="section" fallback={null}>
          <DeviceAppearanceSettings
            appearanceMode={appearanceMode}
            onAppearanceModeChange={onAppearanceModeChange}
            background={background}
            onBackgroundChange={onBackgroundChange}
          />
        </LazyLoadBoundary>
      </SettingsDetailShell>
    );
  }

  if (settingsPath === DEVICE_LANGUAGE_ROUTE) {
    return (
      <SettingsDetailShell
        title={t('language.page.title')}
        subtitle={t('settings.device.languageSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <LazyLoadBoundary mode="section" fallback={null}>
          <DeviceLanguageSettings />
        </LazyLoadBoundary>
      </SettingsDetailShell>
    );
  }

  if (settingsPath === DEVICE_SCREENSAVER_ROUTE) {
    return (
      <SettingsDetailShell
        title={t('settings.device.screensaver')}
        subtitle={t('settings.device.screensaverSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <LazyLoadBoundary mode="section" fallback={null}>
          <ScreensaverSettings />
        </LazyLoadBoundary>
      </SettingsDetailShell>
    );
  }

  if (settingsPath === DEVICE_KIOSK_ROUTE) {
    return (
      <SettingsDetailShell
        title={t('settings.device.kiosk')}
        subtitle={t('settings.device.kioskSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <LazyLoadBoundary mode="section" fallback={null}>
          <KioskSettings startRoutes={kioskStartRoutes} />
        </LazyLoadBoundary>
      </SettingsDetailShell>
    );
  }

  if (settingsPath === DEVICE_POWER_ROUTE) {
    return (
      <SettingsDetailShell
        title={t('settings.device.power')}
        subtitle={t('settings.device.powerSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <LazyLoadBoundary mode="section" fallback={null}>
          <DevicePowerSettings
            callApi={onCallApi}
            connected={isConnected}
            supported={devicePowerSupported}
            isAdmin={isAdministrator}
            haStates={haStates}
          />
        </LazyLoadBoundary>
      </SettingsDetailShell>
    );
  }

  // /settings/safety keeps the sidebar's Security icon off; the old address still works.
  if (settingsPath === '/settings/safety' || settingsPath === '/settings/security') {
    return (
      <SettingsDetailShell
        title={t('settings.security.pageTitle')}
        subtitle={t('settings.securityPage.subtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <SettingsSecurityPage
          haStates={haStates}
          alarmCards={alarmCards}
          canManage={security.can('manage_security_config')}
          deviceAuthUser={deviceAuthUser}
          onOpenSecurityCenter={() => navigateTo('/security')}
          onOpenProfileSecurity={() => navigateTo(`${PROFILE_ROUTE}/security`)}
        />
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/floors') {
    return (
      <SettingsDetailShell
        title={t('settings.home.floors')}
        subtitle={t('settings.rooms.subtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <SettingsRoomsManager
          callApi={onCallApi}
          connected={isConnected}
          canManage={security.can('manage_rooms')}
          deviceRegistry={haDeviceRegistry}
          onOpenRooms={() => navigateTo('/rooms')}
          onRoomsChanged={onAreasChanged}
        />
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/home/waste-collection') {
    return (
      <SettingsDetailShell
        title={t('waste.settings.title')}
        subtitle={t('waste.settings.subtitle')}
        wide
        onBack={() => (wasteHasUnsavedChanges ? setWasteLeaveConfirmOpen(true) : navigateTo('/settings'))}
      >
        <WasteCollectionSettings
          callApi={onCallApi}
          connected={isConnected}
          canConfigure={security.can('manage_rooms')}
          haStates={haStates}
          onDirtyChange={setWasteHasUnsavedChanges}
          recipientsSupported={recipientsSupported}
          resolveAssetUrl={resolveAssetUrl}
        />
        <GlassModal
          isOpen={wasteLeaveConfirmOpen}
          onClose={() => setWasteLeaveConfirmOpen(false)}
          title={t('waste.leave.title')}
          description={t('waste.leave.description')}
          variant="responsive"
          size="sm"
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" className="liquid-glass-control inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold" onClick={() => setWasteLeaveConfirmOpen(false)}>
                {t('waste.leave.stay')}
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-4 text-sm font-semibold text-[color:var(--ui-danger-contrast)]"
                onClick={() => {
                  setWasteLeaveConfirmOpen(false);
                  setWasteHasUnsavedChanges(false);
                  navigateTo('/settings');
                }}
              >
                {t('waste.leave.discard')}
              </button>
            </div>
          )}
        />
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/devices') {
    return (
      <SettingsDetailShell
        title={t('settings.devices.title')}
        subtitle={t('settings.devices.subtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <SettingsDevicesList
          connected={isConnected}
          haStates={haStates}
          entityRegistry={haEntityRegistry}
          deviceRegistry={haDeviceRegistry}
          areas={haAreas}
          widgets={widgets}
          batteryWarningThreshold={attentionPreferences.batteryWarningThreshold}
          onOpenDevice={(deviceId) =>
            navigateTo(`/settings/devices/${encodeURIComponent(deviceId)}`)
          }
        />
      </SettingsDetailShell>
    );
  }

  if (settingsPath.startsWith('/settings/devices/')) {
    const encodedDeviceId = settingsPath.slice('/settings/devices/'.length);
    let deviceId = encodedDeviceId;
    try {
      deviceId = decodeURIComponent(encodedDeviceId);
    } catch {
      deviceId = encodedDeviceId;
    }
    const device = deviceHealthSnapshots.find((entry) => entry.id === deviceId);
    return (
      <SettingsDetailShell
        title={device?.name || t('settings.devices.fallback')}
        subtitle={t('settings.devices.detailSubtitle')}
        onBack={() => navigateTo('/settings/devices')}
      >
        {device ? (
          <SettingsDeviceDetail
            device={device}
            onOpenUpdates={() => {
              setUpdatesPageOpen(true);
              navigateTo('/settings/system');
            }}
            haStates={haStates}
            entityRegistry={haEntityRegistry}
            deviceRegistry={haDeviceRegistry}
            areas={haAreas}
            loadStateTranslations={loadStateTranslations}
            developerMode={developerMode && security.can('developer_mode')}
          />
        ) : (
          <section className="dashboard-content-surface rounded-[1.5rem] px-6 py-12 text-center">
            <Router
              size={23}
              className="mx-auto text-[color:var(--ui-text-tertiary)]"
            />
            <h2 className="mt-3 text-sm font-semibold">{t('settings.devices.notFound')}</h2>
            <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">
              {t('settings.devices.notFoundSubtitle')}
            </p>
          </section>
        )}
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/entities') {
    return (
      <SettingsDetailShell
        title={t('settings.entities.title')}
        subtitle={t('settings.entities.subtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <SettingsEntitiesList
          haStates={haStates}
          entityRegistry={haEntityRegistry}
          deviceRegistry={haDeviceRegistry}
          areas={haAreas}
          loadStateTranslations={loadStateTranslations}
          developerMode={developerMode && security.can('developer_mode')}
          onOpenDevice={(deviceId) => navigateTo(`/settings/devices/${encodeURIComponent(deviceId)}`)}
        />
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/dashboard') {
    return (
      <SettingsDetailShell
        title={t('settings.dashboard.title')}
        subtitle={t('settings.dashboard.pageSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <div className="mb-6">
          <SettingsListGroup title={t('settings.dashboard.group.layout')}>
            <SettingsListRow icon={Layers3} title={t('settings.dashboard.sections')} value={String(sections.length)} />
            <SettingsListRow icon={Box} title={t('settings.dashboard.cards')} value={String(widgets.length)} />
            <SettingsListRow icon={MonitorSmartphone} title={t('settings.dashboard.layoutNow')} value={layoutFormatLabel(currentLayoutId, t)} />
            <SettingsListRow
              icon={LayoutDashboard}
              title={t('settings.dashboard.customize')}
              subtitle={t('settings.dashboard.customizeHint')}
              onClick={() => navigateTo('/home')}
            />
          </SettingsListGroup>
        </div>
        {managedSectionContent}
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/attention') {
    return (
      <SettingsDetailShell
        title={t('settings.attention.title')}
        subtitle={t('settings.attention.pageSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        {!canConfigureDashboard ? (
          <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <LockKeyhole
                size={20}
                className="mt-0.5 shrink-0 text-[color:var(--ui-text-secondary)]"
              />
              <div>
                <h2 className="font-semibold">{t('settings.accessUnavailable')}</h2>
                <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                  {t('settings.attention.denied')}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <SettingsAttentionSection
            preferences={attentionPreferences}
            onChange={setAttentionPreferences}
            onReset={resetAttentionPreferences}
            suppressedCount={attentionSuppressions.length}
            onClearSuppressions={clearAttentionSuppressions}
          />
        )}
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/advanced') {
    return (
      <SettingsDetailShell
        title={t('settings.advanced.hubTitle')}
        subtitle={t('settings.advanced.pageSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">{t('settings.advanced.developer')}</h2>
              <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">
                {t('settings.advanced.developerSubtitle')}
              </p>
            </div>
            <GlassToggle
              checked={developerMode}
              onChange={onDeveloperModeChange}
              label={t('settings.advanced.developer')}
            />
          </div>
          {developerMode && security.can('developer_mode') ? (
            <div className="mt-5 border-t border-[color:var(--ui-separator)] pt-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{t('settings.advanced.cardSizing.title')}</h2>
                    <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-tertiary)]">
                      {cardSizingEngine === 'adaptive'
                        ? t('settings.advanced.cardSizing.adaptive')
                        : t('settings.advanced.cardSizing.legacy')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">
                    {t('settings.advanced.cardSizing.description')}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--ui-text-tertiary)]">
                    {t('settings.advanced.cardSizing.note')}
                  </p>
                </div>
                <GlassToggle
                  checked={cardSizingEngine === 'adaptive'}
                  onChange={(nextValue) => {
                    onCardSizingEngineChange?.(nextValue ? 'adaptive' : 'legacy');
                  }}
                  label={t('settings.advanced.cardSizing.title')}
                />
              </div>
            </div>
          ) : null}
          <div className="mt-5 border-t border-[color:var(--ui-separator)] pt-5">
            <InfoRow icon={Info} title={t('settings.advanced.version')} subtitle={__APP_VERSION__} />
            <InfoRow
              icon={Database}
              title={t('settings.advanced.entities')}
              subtitle={t('settings.advanced.entitiesDetected', { count: Object.keys(haStates).length })}
            />
          </div>
        </section>
        <div className="mt-4">
          <SupportFeedbackSection
            appVersion={__APP_VERSION__}
            haStatus={haStatus}
            onDownloadDiagnostics={handleDownloadSupportDiagnostics}
            diagnosticsFeedback={diagnosticsFeedback || undefined}
          />
        </div>
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/data/history') {
    const canOpenHistory =
      security.can('edit_dashboard') &&
      Boolean(onRefreshLayoutRevisions) &&
      Boolean(onRestoreLayoutRevision);
    return (
      <SettingsDetailShell
        title={t('settings.history.title')}
        subtitle={t('settings.history.subtitle')}
        backLabel={t('settings.dashboard.title')}
        onBack={() => navigateTo('/settings/dashboard')}
      >
        {!canOpenHistory ? (
          <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <LockKeyhole size={20} className="mt-0.5 shrink-0 text-[color:var(--ui-text-secondary)]" />
              <div>
                <h2 className="font-semibold">{t('settings.accessUnavailable')}</h2>
                <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                  {t('settings.history.denied')}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <SettingsLayoutVersionsSection
            revisions={layoutRevisions}
            status={layoutRevisionHistoryStatus}
            houseMembers={houseMembers}
            onRefresh={onRefreshLayoutRevisions!}
            onRestore={onRestoreLayoutRevision!}
          />
        )}
      </SettingsDetailShell>
    );
  }

  const houseAccessView = resolveHouseAccessView(settingsPath);
  if (
    houseAccessView ||
    settingsPath === '/settings/connections' ||
    settingsPath === '/settings/data'
  ) {
    const canOpenManagedPage =
      settingsPath === '/settings/connections' ||
      (houseAccessView !== null && security.can('manage_rooms')) ||
      (settingsPath === '/settings/data' &&
        (security.can('download_backup') ||
          security.can('restore_backup') ||
          security.can('reset_dashboard')));
    const managedPage =
      houseAccessView === 'members'
        ? {
            title: t('settings.access.membersTitle'),
            subtitle: t('settings.access.membersDescription'),
          }
        : houseAccessView === 'guest'
        ? {
            title: t('settings.management.guests'),
            subtitle: t('settings.access.comingLater'),
          }
        : houseAccessView === 'share'
        ? {
            title: t('settings.access.sharingTitle'),
            subtitle: t('settings.access.sharingDescription'),
          }
        : houseAccessView === 'overview'
        ? {
            title: t('settings.access.title'),
            subtitle: t('settings.access.pageSubtitle'),
          }
        : settingsPath === '/settings/connections'
          ? {
              title: t('settings.connections.title'),
              subtitle: t('settings.connections.pageSubtitle'),
            }
          : {
              title: t('settings.data.title'),
              subtitle: t('settings.data.pageSubtitle'),
            };
    return (
      <SettingsDetailShell
        title={managedPage.title}
        subtitle={managedPage.subtitle}
        {...(houseAccessView === 'share'
          ? { backLabel: t('settings.dashboard.title'), onBack: () => navigateTo('/settings/dashboard') }
          : houseAccessView && houseAccessView !== 'overview'
            ? { backLabel: t('settings.access.title'), onBack: () => navigateTo(HOUSE_ACCESS_ROUTE) }
            : { onBack: () => navigateTo('/settings') })}
      >
        {settingsPath === '/settings/data' && canOpenManagedPage ? (
          <section className="dashboard-content-surface mb-4 rounded-[1.5rem] p-5 sm:p-6">
            {/* On a phone the button goes below the text instead of squeezing it. */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{t('settings.data.haBackup')}</h2>
                <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                  {t('settings.data.haBackupDescription')}
                </p>
                <p className="mt-2 text-xs font-medium text-[color:var(--ui-text-secondary)]">
                  {t('settings.system.lastSnapshot')}: {lastBackupLabel ?? t('settings.system.noBackupDetected')}
                  {backupSizeLabel ? ` · ${backupSizeLabel}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={handleForceBackup}
                disabled={!isConnected || isActionBusy}
                className="liquid-glass-selection inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ShieldCheck size={16} />
                {t('settings.system.forceBackup')}
              </button>
            </div>
            {actionFeedback ? (
              <p role="status" className="mt-3 text-xs font-medium text-[color:var(--ui-text-secondary)]">
                {actionFeedback}
              </p>
            ) : null}
          </section>
        ) : null}
        {!canOpenManagedPage ? (
          <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <LockKeyhole size={20} className="mt-0.5 shrink-0 text-[color:var(--ui-text-secondary)]" />
              <div>
                <h2 className="font-semibold">{t('settings.accessUnavailable')}</h2>
                <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                  {t('settings.managed.denied')}
                </p>
              </div>
            </div>
          </section>
        ) : managedSectionContent ?? (
          <section className="dashboard-content-surface rounded-[1.5rem] p-5 text-sm text-[color:var(--ui-text-secondary)] sm:p-6">
            {t('settings.managed.unavailable')}
          </section>
        )}
      </SettingsDetailShell>
    );
  }

  // At most four rows of updates to install; the rest opens the update center,
  // and the components already up to date are only counted past four rows.
  const SHOWN_UPDATES = 4;
  const shownAvailable = availableUpdates.slice(0, SHOWN_UPDATES);
  const hiddenAvailable = availableUpdates.length - shownAvailable.length;
  const upToDateUpdates = updateEntities.filter((update) => !update.available && !update.skipped);
  const shownUpToDate = upToDateUpdates.slice(0, Math.max(0, SHOWN_UPDATES - availableUpdates.length));
  const hiddenUpToDate = upToDateUpdates.length - shownUpToDate.length;
  const meterTone = (tone: MetricTone): 'success' | 'warning' | 'danger' =>
    tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : 'danger';
  const healthRows = [
    cpuValue !== null || tempValue !== null ? (
      <SettingsListRow
        key="processor"
        icon={Cpu}
        title={t('settings.system.processor')}
        subtitle={tempValue !== null ? t('settings.system.temperatureValue', { value: `${Math.round(tempValue)}°` }) : undefined}
        value={cpuValue === null ? undefined : `${Math.round(cpuValue)}%`}
        meter={cpuValue === null ? undefined : { percent: cpuValue, tone: meterTone(cpuTone) }}
      >
        {processorUseHistory.length >= 2 ? (
          <span className="mt-2 block h-10 min-w-0">
            <MiniSparkline id="settings-cpu-trend" data={processorUseHistory} />
          </span>
        ) : null}
      </SettingsListRow>
    ) : null,
    ramPercent !== null ? (
      <SettingsListRow
        key="memory"
        icon={MemoryStick}
        title={t('settings.system.memory')}
        subtitle={ramMemHint}
        value={`${Math.round(ramPercent)}%`}
        meter={{ percent: ramPercent, tone: meterTone(ramTone) }}
      />
    ) : null,
    diskPercent !== null ? (
      <SettingsListRow
        key="storage"
        icon={HardDrive}
        title={t('settings.system.storage')}
        subtitle={diskHint}
        value={`${Math.round(diskPercent)}%`}
        meter={{ percent: diskPercent, tone: meterTone(diskTone) }}
      />
    ) : null,
  ].filter(Boolean);
  const networkRows = [
    ipAddress && ipLabel !== '—' ? (
      <SettingsListRow key="ip" icon={Wifi} title={t('settings.system.localIp')} value={ipLabel} />
    ) : null,
    bootTimeMs !== null ? (
      <SettingsListRow key="uptime" icon={Clock} title={t('settings.system.uptime')} subtitle={uptimeSince} value={uptimeLabel} />
    ) : null,
    latencyValue !== null ? (
      <SettingsListRow
        key="latency"
        icon={Network}
        title={t('settings.system.latency')}
        value={`${Math.round(latencyValue)} ${latency?.entity.unit || 'ms'}`}
      />
    ) : null,
  ].filter(Boolean);
  const powerActions = {
    restartHa: {
      title: t('settings.system.confirm.restartHaTitle'),
      body: t('settings.system.confirm.restartHaBody'),
      action: t('settings.system.confirm.restart'),
      run: handleRestartServer,
    },
    restartHost: {
      title: t('settings.system.confirm.restartHostTitle'),
      body: t('settings.system.confirm.restartHostBody'),
      action: t('settings.system.confirm.restart'),
      run: handleRebootHost,
    },
    shutdown: {
      title: t('settings.system.confirm.shutdownTitle'),
      body: t('settings.system.confirm.shutdownBody'),
      action: t('settings.system.confirm.shutdown'),
      run: handleShutdownHost,
    },
  };
  const confirmedPower = powerConfirm ? powerActions[powerConfirm] : null;
  const groupAction = 'text-xs font-semibold text-[color:var(--ui-accent)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <SettingsDetailShell
      title={t('settings.system.pageTitle')}
      subtitle={t('settings.system.subtitle', { restart: lastRestartLabel })}
      onBack={() => navigateTo('/settings')}
    >
      <div className="mx-auto w-full max-w-[48rem] space-y-6 pb-4">
        <SettingsListGroup
          title={t('settings.system.group.updates')}
          action={
            availableUpdates.length > 0 ? (
              <button type="button" onClick={handleUpdateAll} disabled={!isConnected || isActionBusy} className={groupAction}>
                {t('settings.system.updateAll', { count: availableUpdates.length })}
              </button>
            ) : null
          }
        >
          {updateEntities.length === 0 ? (
            <SettingsListRow icon={DownloadCloud} title={t('settings.system.noUpdateEntities')} />
          ) : (
            <>
              {shownAvailable.map((update) => (
                <SettingsListRow
                  key={update.entityId}
                  icon={DownloadCloud}
                  tone="warning"
                  title={update.title}
                  subtitle={
                    update.inProgress
                      ? update.percentage !== null
                        ? t('settings.updates.progressPercent', { value: Math.round(update.percentage) })
                        : t('settings.updates.progress')
                      : `${update.installed || '—'} → ${update.latest}`
                  }
                  onClick={() => setUpdatesPageOpen(true)}
                />
              ))}
              {hiddenAvailable > 0 ? (
                <SettingsListRow
                  icon={DownloadCloud}
                  tone="warning"
                  title={
                    hiddenAvailable === 1
                      ? t('settings.system.moreUpdatesOne')
                      : t('settings.system.moreUpdatesMany', { count: hiddenAvailable })
                  }
                  subtitle={t('settings.system.openUpdates')}
                  onClick={() => setUpdatesPageOpen(true)}
                />
              ) : null}
              {skippedUpdates.length > 0 ? (
                <SettingsListRow
                  icon={RotateCcw}
                  title={
                    skippedUpdates.length === 1
                      ? t('settings.system.skippedOne')
                      : t('settings.system.skippedMany', { count: skippedUpdates.length })
                  }
                  subtitle={t('settings.system.openUpdates')}
                  onClick={() => setUpdatesPageOpen(true)}
                />
              ) : null}
              {shownUpToDate.map((update) => (
                <SettingsListRow
                  key={update.entityId}
                  icon={CircleCheck}
                  tone="success"
                  title={update.title}
                  subtitle={
                    update.installed
                      ? t('settings.system.upToDateVersion', { version: update.installed })
                      : t('settings.system.updated')
                  }
                />
              ))}
              {hiddenUpToDate > 0 ? (
                <SettingsListRow
                  icon={CircleCheck}
                  title={
                    shownUpToDate.length > 0
                      ? hiddenUpToDate === 1
                        ? t('settings.system.moreUpToDateOne')
                        : t('settings.system.moreUpToDateMany', { count: hiddenUpToDate })
                      : hiddenUpToDate === 1
                        ? t('settings.system.upToDateCountOne')
                        : t('settings.system.upToDateCountMany', { count: hiddenUpToDate })
                  }
                />
              ) : null}
            </>
          )}
        </SettingsListGroup>

        <SettingsListGroup
          title={t('settings.system.group.health')}
          // Nothing to refresh without system sensors: no faded action then.
          action={systemEntityIds.length > 0 ? (
            <button
              type="button"
              onClick={handleRefreshSystemSensors}
              disabled={!isConnected || isActionBusy}
              className={groupAction}
            >
              {t('settings.system.refreshSensors')}
            </button>
          ) : undefined}
        >
          {healthRows.length > 0 ? (
            healthRows
          ) : (
            <SettingsListRow
              icon={Activity}
              title={t('settings.system.telemetryUnavailable')}
              subtitle={t('settings.system.telemetryHint')}
            />
          )}
        </SettingsListGroup>

        {networkRows.length > 0 ? (
          <SettingsListGroup title={t('settings.system.group.network')}>{networkRows}</SettingsListGroup>
        ) : null}

        <SettingsListGroup title={t('settings.system.backup')}>
          <SettingsListRow
            icon={Database}
            title={t('settings.system.lastBackup')}
            subtitle={lastBackupLabel ?? t('settings.system.noBackupDetected')}
            value={backupSizeLabel ?? undefined}
            onClick={canOpenData ? () => navigateTo('/settings/data') : undefined}
          />
        </SettingsListGroup>

        <SettingsListGroup title={t('settings.system.group.power')}>
          {security.can('restart_home_assistant') ? (
            <SettingsListRow
              icon={RotateCcw}
              tone="danger"
              destructive
              title={t('settings.system.restartHa')}
              subtitle={t('settings.system.restartHaHint')}
              disabled={!isConnected || isActionBusy}
              onClick={() => setPowerConfirm('restartHa')}
            />
          ) : null}
          <SettingsListRow
            icon={Server}
            tone="danger"
            destructive
            title={t('settings.system.restartHost')}
            subtitle={t('settings.system.restartHostHint')}
            disabled={!isConnected || isActionBusy}
            onClick={() => setPowerConfirm('restartHost')}
          />
          <SettingsListRow
            icon={Power}
            tone="danger"
            destructive
            title={t('settings.system.shutdown')}
            subtitle={t('settings.system.shutdownHint')}
            disabled={!isConnected || isActionBusy}
            onClick={() => setPowerConfirm('shutdown')}
          />
        </SettingsListGroup>

        {actionFeedback || haError ? (
          <div className="space-y-2 px-1" role="status">
            {actionFeedback ? <p className="text-xs font-medium text-[color:var(--ui-text-secondary)]">{actionFeedback}</p> : null}
            {haError ? (
              <p className="flex items-center gap-2 text-xs font-medium text-[color:var(--ui-danger)]">
                <AlertTriangle size={13} /> {haError}
              </p>
            ) : null}
          </div>
        ) : null}

        {developerMode ? (
          <p className="flex items-center gap-2 px-1 text-[11px] font-medium text-[color:var(--ui-text-secondary)]">
            <Database size={12} /> {t('settings.system.debugSummary', { entities: Object.keys(haStates).length, sensors: systemSensors.length })}
          </p>
        ) : null}
      </div>

      <GlassModal
        isOpen={confirmedPower !== null}
        onClose={() => setPowerConfirm(null)}
        title={confirmedPower?.title ?? ''}
        description={confirmedPower?.body}
        variant="dialog"
        size="sm"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="liquid-glass-control inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold"
              onClick={() => setPowerConfirm(null)}
            >
              {t('settings.system.cancel')}
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-4 text-sm font-semibold text-[color:var(--ui-danger-contrast)]"
              onClick={() => {
                const run = confirmedPower?.run;
                setPowerConfirm(null);
                run?.();
              }}
            >
              {confirmedPower?.action}
            </button>
          </div>
        )}
      />

      <UpdatesCenterModal
        isOpen={updatesPageOpen}
        onClose={() => setUpdatesPageOpen(false)}
        updates={availableUpdates.map(withPicture)}
        skipped={skippedUpdates.map(withPicture)}
        isConnected={isConnected}
        isBusy={isActionBusy}
        onInstall={(entityId, options) =>
          onCallService('update', 'install', { entity_id: entityId, ...(options?.backup ? { backup: true } : {}) })
        }
        onSkip={(entityId) => onCallService('update', 'skip', { entity_id: entityId })}
        onClearSkipped={(entityId) => onCallService('update', 'clear_skipped', { entity_id: entityId })}
        onUpdateAll={handleUpdateAll}
      />
    </SettingsDetailShell>
  );
}
