import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Box,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  Download,
  DownloadCloud,
  Gauge,
  HardDrive,
  FileJson,
  House,
  Info,
  LayoutDashboard,
  Layers3,
  Link2,
  LifeBuoy,
  LockKeyhole,
  Network,
  Power,
  RefreshCw,
  Router,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  Thermometer,
  Upload,
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
import type { ProfileHouseMember } from '../components/settings/settingsHouseAccessModel';
import {
  SettingsCardPreview,
  type SettingsPreviewMember,
} from '../components/settings/SettingsCardPreview';
import SettingsEntitiesList from '../components/settings/SettingsEntitiesList';
import SettingsDevicesList, {
  SettingsDeviceDetail,
} from '../components/settings/SettingsDevicesList';
import { buildDeviceHealthSnapshots } from '../components/settings/deviceHealthModel';
import NestedPageHeader from '../components/ui/NestedPageHeader';
import { UpdatesCenterModal } from '../components/settings/UpdatesCenterModal';
import type { DashboardSection, Widget } from '../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../types/ha';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { useDashboardSecurity } from '../security/dashboardAccess';
import { useSensitiveActionGate } from '../security/SensitiveActionGate';
import {
  useHomeAttentionPreferences,
} from '../components/homeAttention/homeAttentionPreferences';
import { useHomeAttentionSuppressions } from '../components/homeAttention/homeAttentionSuppressions';
import SettingsAttentionSection, {
  SettingsAttentionPreview,
} from '../components/settings/SettingsAttentionSection';
import {
  buildSupportDiagnostics,
  createSupportDiagnosticsFilename,
  serializeSupportDiagnostics,
} from '../services/supportDiagnostics';
import SettingsLayoutVersionsSection from '../components/settings/SettingsLayoutVersionsSection';
import SupportFeedbackSection from '../components/settings/SupportFeedbackSection';
import type {
  DashboardRevisionHistoryStatus,
  DashboardRevisionRecord,
} from '../services/dashboardRevisionHistory';
import type { DashboardLayoutSaveResult } from '../services/dashboardStorage';
import { useI18n } from '../i18n/I18nProvider';

type SettingsDashboardProps = {
  developerMode: boolean;
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
  onDownloadBackup: () => void;
  onRestoreBackup: (file: File) => Promise<void>;
  layoutRevisions?: DashboardRevisionRecord[];
  layoutRevisionHistoryStatus?: DashboardRevisionHistoryStatus;
  onRefreshLayoutRevisions?: () => Promise<boolean>;
  onRestoreLayoutRevision?: (revision: number) => Promise<DashboardLayoutSaveResult>;
  onCallService: (domain: string, service: string, serviceData: Record<string, unknown>) => Promise<boolean>;
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
};

type MetricTone = 'ok' | 'warn' | 'danger';

const TONE: Record<MetricTone, { barColor: string }> = {
  ok: { barColor: 'rgb(34,197,94)' },
  warn: { barColor: 'rgb(251,146,60)' },
  danger: { barColor: 'rgb(239,68,68)' },
};

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
      return {
        entityId,
        entity,
        title: entityName(entityId, entity),
        installed: normalizeText(entity.rawAttributes?.installed_version),
        latest: normalizeText(entity.rawAttributes?.latest_version),
        available,
        inProgress,
        percentage,
      };
    })
    .sort((first, second) => Number(second.available) - Number(first.available) || first.title.localeCompare(second.title));
}

function statusLabel(status: HaConnectionStatus, t: ReturnType<typeof useI18n>['t']) {
  if (status === 'connected') {
    return t('settings.status.online');
  }
  if (status === 'connecting') {
    return t('settings.status.connecting');
  }
  if (status === 'reconnecting') {
    return t('settings.status.reconnecting');
  }
  if (status === 'reauth_required') {
    return t('settings.status.reauth');
  }
  if (status === 'disconnected_by_user') {
    return t('settings.status.disconnected');
  }
  if (status === 'error') {
    return t('settings.status.error');
  }
  return t('settings.status.offline');
}

function statusToneClass(status: HaConnectionStatus) {
  if (status === 'connected') {
    return 'border-emerald-400/25 bg-emerald-400/12 text-emerald-200';
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  }
  if (status === 'error' || status === 'reauth_required') {
    return 'border-rose-400/30 bg-rose-400/10 text-rose-100';
  }
  return 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] text-[color:var(--ui-text-secondary)]';
}

/* ------------------------------------------------------------------ */
/* Bento building blocks                                               */
/* ------------------------------------------------------------------ */

function BentoCard({
  icon: Icon,
  title,
  subtitle,
  className = '',
  headerRight,
  onTitleClick,
  danger = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  className?: string;
  headerRight?: React.ReactNode;
  onTitleClick?: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const TitleTag = onTitleClick ? 'button' : 'div';
  return (
    <section
      className={`dashboard-content-surface flex h-full min-w-0 flex-col overflow-hidden rounded-[1.5rem] p-5 sm:p-6 ${
        danger ? 'border-rose-400/20' : ''
      } ${className}`}
    >
      <header className="relative flex items-start justify-between gap-3">
        <TitleTag
          type={onTitleClick ? 'button' : undefined}
          onClick={onTitleClick}
          className={`group flex min-w-0 items-center gap-3 text-left ${onTitleClick ? 'cursor-pointer' : ''}`}
        >
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] ${
              danger
                ? 'bg-[color:rgb(239,68,68,0.12)] text-[color:rgb(239,68,68)]'
                : 'bg-[color:rgb(var(--ui-accent-rgb)/0.12)] text-[color:rgb(var(--ui-accent-rgb)/0.90)]'
            }`}
          >
            <Icon size={17} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span
                className={`truncate text-[0.95rem] font-semibold tracking-[-0.01em] ${
                  danger ? 'text-rose-200' : 'text-[color:var(--ui-text-primary)]'
                }`}
              >
                {title}
              </span>
              {onTitleClick ? (
                <ChevronRight
                  size={14}
                  className="shrink-0 text-[color:var(--ui-text-secondary)] transition-transform group-hover:translate-x-0.5"
                />
              ) : null}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block truncate text-xs font-medium text-[color:var(--ui-text-secondary)]">{subtitle}</span>
            ) : null}
          </span>
        </TitleTag>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </header>
      <div className="relative mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function SimpleMeterDisplay({
  value,
  percent,
  label,
  tone,
}: {
  value: string;
  percent: number | null;
  label: string;
  tone: MetricTone;
}) {
  const barWidth = percent === null ? 0 : clamp(percent, 0, 100);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-center">
        <span className="text-4xl font-semibold tracking-[-0.02em] text-[color:var(--ui-text-primary)]">{value}</span>
        <p className="mt-1 text-xs font-medium text-[color:var(--ui-text-secondary)]">{label}</p>
      </div>
      <div className="w-full max-w-xs">
        <div className="h-1.5 w-full rounded-full bg-[color:var(--ui-surface-glass)]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${barWidth}%`,
              backgroundColor: TONE[tone].barColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function VitalMeter({
  icon: Icon,
  label,
  value,
  hint,
  percent,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  percent: number | null;
  tone: MetricTone;
}) {
  const width = percent === null ? 0 : clamp(percent, 0, 100);
  return (
    <div className="rounded-[1rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--ui-text-secondary)]">
          <Icon size={13} className="text-[color:var(--ui-text-secondary)]" />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-[color:var(--ui-text-primary)]">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--ui-separator)]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${width}%`,
            backgroundColor: TONE[tone].barColor,
          }}
        />
      </div>
      {hint ? <p className="mt-1.5 truncate text-[10px] font-medium text-[color:var(--ui-text-secondary)]">{hint}</p> : null}
    </div>
  );
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

function LiquidButton({
  children,
  onClick,
  disabled,
  tone = 'primary',
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'neutral';
  className?: string;
}) {
  const toneClass =
    tone === 'primary'
      ? 'border-[color:rgb(var(--ui-accent-rgb)/0.3)] bg-[color:rgb(var(--ui-accent-rgb)/0.16)] text-[color:var(--ui-text-primary)] hover:bg-[color:rgb(var(--ui-accent-rgb)/0.22)]'
      : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-surface-glass-strong)]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${toneClass} ${className}`}
    >
      {children}
    </button>
  );
}

// Two-step confirm: first click arms a 5s countdown, a second click within the
// window runs the action. Auto-disarms when the countdown elapses.
function DangerButton({
  icon: Icon,
  label,
  hint,
  disabled,
  onConfirm,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!armed) {
      return;
    }
    const start = Date.now();
    setRemaining(5);
    const id = window.setInterval(() => {
      const left = 5 - (Date.now() - start) / 1000;
      if (left <= 0) {
        setArmed(false);
        setRemaining(0);
        window.clearInterval(id);
      } else {
        setRemaining(left);
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [armed]);

  const handleClick = () => {
    if (disabled) {
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onConfirm();
  };

  const progress = clamp((remaining / 5) * 100, 0, 100);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`group relative flex min-h-[4.25rem] w-full flex-col justify-center overflow-hidden rounded-lg border px-4 py-3 text-left transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        armed
          ? 'border-rose-400/40 bg-rose-500/[0.12]'
          : 'border-rose-400/20 bg-rose-500/[0.06] hover:bg-rose-500/[0.10]'
      }`}
    >
      <span className="flex items-center gap-2.5">
        <Icon size={16} className="shrink-0 text-rose-300" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-rose-100">
            {armed ? `Confermi? (${Math.ceil(remaining)}s)` : label}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-medium text-rose-200/60">
            {armed ? 'Tocca di nuovo per eseguire' : hint}
          </span>
        </span>
      </span>
      {armed ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-rose-400/30">
          <span
            className="block h-full bg-rose-400"
            style={{ width: `${progress}%`, transition: 'width 80ms linear' }}
          />
        </span>
      ) : null}
    </button>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="rounded-[1.05rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] p-2.5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-[0.7rem] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:rgb(var(--ui-accent-rgb)/0.96)]">
        <Icon size={15} />
      </span>
      <p className="mt-2 text-[1.25rem] font-semibold leading-none tracking-[-0.02em] text-[color:var(--ui-text-primary)]">{value}</p>
      <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]">{label}</p>
    </div>
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

function SettingsDestination({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[5.25rem] w-full items-center gap-3 rounded-[1.25rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] px-4 py-3 text-left shadow-[0_12px_28px_var(--ui-shadow-soft)] backdrop-blur-2xl transition-[background-color,border-color,transform] hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-surface-glass-strong)] active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">{subtitle}</span>
      </span>
      <ChevronRight
        size={17}
        className="shrink-0 text-[color:var(--ui-text-tertiary)] transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}

function SettingsHubCard({
  icon: Icon,
  title,
  subtitle,
  className = '',
  iconClassName = '',
  accentClassName = '',
  onClick,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  className?: string;
  iconClassName?: string;
  accentClassName?: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`dashboard-content-surface group relative flex min-h-[10.5rem] min-w-0 flex-col overflow-hidden rounded-[1.35rem] p-3.5 text-left transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-[color:var(--ui-border-strong)] active:translate-y-0 sm:min-h-[11rem] sm:rounded-[1.65rem] sm:p-6 ${className}`}
    >
      {accentClassName ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 opacity-80 transition-opacity duration-300 group-hover:opacity-100 ${accentClassName}`}
        />
      ) : null}
      <span className="relative z-10 flex min-w-0 items-start gap-2 sm:gap-3">
        <Icon
          size={20}
          className={`mt-0.5 shrink-0 text-[color:var(--ui-text-secondary)] ${iconClassName}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] font-semibold tracking-[-0.025em] text-[color:var(--ui-text-primary)] sm:text-[1.05rem]">
            {title}
          </span>
          <span className="mt-1 block text-[11px] leading-4 text-[color:var(--ui-text-secondary)] sm:text-xs sm:leading-5">{subtitle}</span>
        </span>
        <span className="liquid-glass-control flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-transform duration-300 group-hover:translate-x-0.5 sm:h-8 sm:w-8">
          <ChevronRight size={14} />
        </span>
      </span>

      {children ? <span className="relative z-10 mt-auto block w-full pt-3 sm:pt-5">{children}</span> : null}
    </button>
  );
}

function SettingsDetailShell({
  title,
  subtitle,
  onBack,
  backLabel,
  children,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  backLabel?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="dashboard-page-scroll !p-0 text-[color:var(--ui-text-primary)]">
      <NestedPageHeader
        title={title}
        subtitle={subtitle}
        backLabel={backLabel ?? t('settings.back')}
        onBack={onBack}
        contentClassName="lg:!px-10"
      />
      <main className="dashboard-page-content-wide px-4 pb-[calc(env(safe-area-inset-bottom)+6.25rem)] pt-4 sm:px-6 sm:pb-6 sm:pt-5 lg:px-10">
        {children}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function SettingsDashboard({
  developerMode,
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
  onDownloadBackup,
  onRestoreBackup,
  layoutRevisions = [],
  layoutRevisionHistoryStatus = 'idle',
  onRefreshLayoutRevisions,
  onRestoreLayoutRevision,
  onCallService,
  navigationRoute,
  onNavigate,
  managedSectionContent,
}: SettingsDashboardProps) {
  const { locale, t } = useI18n();
  const security = useDashboardSecurity();
  const sensitiveGate = useSensitiveActionGate();
  const {
    preferences: attentionPreferences,
    setPreferences: setAttentionPreferences,
    resetPreferences: resetAttentionPreferences,
  } = useHomeAttentionPreferences(security.runtimeMode);
  const {
    suppressions: attentionSuppressions,
    clearSuppressions: clearAttentionSuppressions,
  } = useHomeAttentionSuppressions(security.runtimeMode);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string>('');
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [isRestoreBusy, setIsRestoreBusy] = useState(false);
  const [updatesPageOpen, setUpdatesPageOpen] = useState(false);
  // Re-render once a minute so uptime/duration labels stay fresh.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const isConnected = haStatus === 'connected';
  const systemSensors = useMemo(() => pickSystemSensors(haStates), [haStates]);
  const updateEntities = useMemo(() => collectUpdateEntities(haStates), [haStates]);
  const availableUpdates = updateEntities.filter((entry) => entry.available);

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

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const authorized = await sensitiveGate.authorize({
      action: 'restore_backup',
      capability: 'restore_backup',
      title: t('settings.backup.restorePrompt'),
      description: t('settings.backup.restoreDescription', { file: file.name, size: Math.max(1, Math.round(file.size / 1024)) }),
    });
    if (!authorized) {
      return;
    }
    setIsRestoreBusy(true);
    setActionFeedback('');
    try {
      await onRestoreBackup(file);
      setActionFeedback(t('settings.system.backupRestored'));
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : t('settings.system.restoreFailed'));
    } finally {
      setIsRestoreBusy(false);
    }
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

  const visibleUpdates = updateEntities.slice(0, 3);
  const settingsPath =
    navigationRoute?.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/settings';
  const navigateTo = (path: string) => onNavigate?.(path);
  const openConfiguration = (path: '/settings/access' | '/settings/connections' | '/settings/data') => {
    navigateTo(path);
  };
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
    setActionFeedback(t('settings.system.diagnosticsDownloaded'));
  };
  const previewMembers: SettingsPreviewMember[] = houseMembers.map((member) => {
    const memberState = normalizeLower(haStates[member.id]?.state);
    const presence: SettingsPreviewMember['presence'] =
      memberState === 'home' || memberState === 'on' || memberState === 'present'
        ? 'home'
        : memberState === 'not_home' || memberState === 'away' || memberState === 'off'
          ? 'away'
          : 'unknown';
    return {
      id: member.id,
      name: member.name,
      avatarUrl: member.avatarUrl,
      presence,
    };
  });
  const alarmPreviewStates = Object.entries(haStates).filter(([entityId]) =>
    entityId.startsWith('alarm_control_panel.'),
  );
  const lockPreviewStates = Object.entries(haStates).filter(([entityId]) =>
    entityId.startsWith('lock.'),
  );
  const armedAlarmCount = alarmPreviewStates.filter(([, entity]) =>
    normalizeLower(entity.state).startsWith('armed_'),
  ).length;
  const lockedLockCount = lockPreviewStates.filter(
    ([, entity]) => normalizeLower(entity.state) === 'locked',
  ).length;
  const canConfigureDashboard = security.can('edit_dashboard');

  if (settingsPath === '/support') {
    return (
      <SettingsDetailShell
        title={t('settings.support.title')}
        subtitle={t('settings.support.subtitle')}
        onBack={() => navigateTo('/profile')}
        backLabel={t('settings.profile.back')}
      >
        <SupportFeedbackSection
          appVersion={__APP_VERSION__}
          haStatus={haStatus}
          onDownloadDiagnostics={handleDownloadSupportDiagnostics}
          diagnosticsFeedback={
            actionFeedback.startsWith('Diagnostica') ? actionFeedback : undefined
          }
        />
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings') {
    return (
      <div key={settingsPath} className="dashboard-page-scroll text-[color:var(--ui-text-primary)]">
        <header className="dashboard-page-content-wide">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="dashboard-page-title">{t('settings.title')}</h1>
              <p className="dashboard-page-subtitle">
                {t('settings.subtitle')}
              </p>
            </div>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-4 py-2 text-xs font-semibold text-[color:var(--ui-text-secondary)] backdrop-blur-2xl">
              <span
                className={`h-2 w-2 rounded-full ${
                  haStatus === 'connected'
                    ? 'bg-emerald-500'
                    : haStatus === 'connecting' || haStatus === 'reconnecting'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
              />
              Home Assistant · {statusLabel(haStatus, t)}
            </span>
          </div>
        </header>

        <main className="dashboard-page-content-wide mt-6 pb-10">
          <div className="grid auto-rows-[minmax(10.5rem,auto)] grid-cols-2 gap-3 sm:auto-rows-[minmax(11rem,auto)] sm:gap-5 xl:grid-cols-6">
            <SettingsHubCard
              icon={House}
              title={t('settings.home.title')}
              subtitle={t('settings.home.subtitle')}
              className="col-span-2 !min-h-[7.5rem] xl:col-span-4 xl:!min-h-[15rem]"
              iconClassName="text-[color:rgb(var(--ui-accent-rgb)/0.95)]"
              accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.16),transparent_58%)]"
              onClick={() => navigateTo('/settings/home')}
            />

            {security.can('manage_rooms') ? (
              <SettingsHubCard
                icon={UserRoundCog}
                title={t('settings.access.title')}
                subtitle={t('settings.access.subtitle')}
                className="sm:col-span-1 xl:col-span-2 xl:min-h-[15rem]"
                accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(168,85,247,0.15),transparent_58%)]"
                onClick={() => openConfiguration('/settings/access')}
              >
                <SettingsCardPreview variant="people" members={previewMembers} />
              </SettingsHubCard>
            ) : null}

            {canConfigureDashboard ? (
              <SettingsHubCard
                icon={LayoutDashboard}
                title={t('settings.dashboard.title')}
                subtitle={t('settings.dashboard.subtitle')}
                className="sm:col-span-1 xl:col-span-3"
                accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(99,102,241,0.16),transparent_58%)]"
                onClick={() => navigateTo('/settings/dashboard')}
              >
                <SettingsCardPreview
                  variant="dashboard"
                  sectionCount={sections.length}
                  widgetCount={widgets.length}
                  breakpointLabel={currentLayoutId?.toUpperCase() || 'AUTO'}
                />
              </SettingsHubCard>
            ) : null}

            {canConfigureDashboard ? (
              <SettingsHubCard
                icon={BellRing}
                title={t('settings.attention.title')}
                subtitle={t('settings.attention.subtitle')}
                className="sm:col-span-1 xl:col-span-3"
                accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(245,158,11,0.14),transparent_58%)]"
                onClick={() => navigateTo('/settings/attention')}
              >
                <SettingsAttentionPreview preferences={attentionPreferences} />
              </SettingsHubCard>
            ) : null}

            <SettingsHubCard
              icon={Link2}
              title={t('settings.connections.title')}
              subtitle={t('settings.connections.subtitle')}
              className="sm:col-span-1 xl:col-span-3"
              accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(6,182,212,0.15),transparent_58%)]"
              onClick={() => openConfiguration('/settings/connections')}
            >
              <SettingsCardPreview
                variant="connection"
                connected={isConnected}
                statusLabel={statusLabel(haStatus, t)}
              />
            </SettingsHubCard>

            {security.can('manage_security_config') ? (
              <SettingsHubCard
                icon={LockKeyhole}
                title={t('settings.security.title')}
                subtitle={t('settings.security.subtitle')}
                className="sm:col-span-1 xl:col-span-2"
                accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(16,185,129,0.14),transparent_58%)]"
                onClick={() => navigateTo('/settings/security')}
              >
                <SettingsCardPreview
                  variant="security"
                  alarmCount={alarmPreviewStates.length}
                  armedAlarmCount={armedAlarmCount}
                  lockCount={lockPreviewStates.length}
                  lockedLockCount={lockedLockCount}
                />
              </SettingsHubCard>
            ) : null}

            {security.can('download_backup') ? (
              <SettingsHubCard
                icon={Database}
                title={t('settings.data.title')}
                subtitle={t('settings.data.subtitle')}
                className="sm:col-span-1 xl:col-span-2"
                accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(245,158,11,0.14),transparent_58%)]"
                onClick={() => openConfiguration('/settings/data')}
              >
                <SettingsCardPreview
                  variant="backup"
                  lastBackupLabel={lastBackupLabel}
                  backupSizeLabel={backupSizeLabel}
                />
              </SettingsHubCard>
            ) : null}

            <SettingsHubCard
              icon={Activity}
              title={t('settings.system.title')}
              subtitle={t('settings.system.cardSubtitle')}
              className="sm:col-span-1 xl:col-span-2"
              accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(20,184,166,0.14),transparent_58%)]"
              onClick={() => navigateTo('/settings/system')}
            >
              <SettingsCardPreview
                variant="system"
                statusLabel={healthLabel}
                tone={hasSystemTelemetry ? worstTone : 'neutral'}
                cpuPercent={cpuValue}
                ramPercent={ramPercent}
              />
            </SettingsHubCard>

            {security.can('developer_mode') ? (
              <SettingsHubCard
                icon={Wrench}
                title={t('settings.advanced.title')}
                subtitle={t('settings.advanced.subtitle')}
                className="col-span-2 xl:col-span-6 xl:min-h-[9.5rem]"
                accentClassName="bg-[radial-gradient(circle_at_12%_8%,rgba(148,163,184,0.13),transparent_58%)]"
                onClick={() => navigateTo('/settings/advanced')}
              >
                <SettingsCardPreview
                  variant="advanced"
                  version={__APP_VERSION__}
                  developerMode={developerMode}
                />
              </SettingsHubCard>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  if (settingsPath === '/settings/home') {
    return (
      <SettingsDetailShell
        title={t('settings.home.title')}
        subtitle={t('settings.home.pageSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsDestination
            icon={Layers3}
            title={t('settings.home.floors')}
            subtitle={t('settings.home.floorsSubtitle')}
            onClick={() => navigateTo('/rooms')}
          />
          <SettingsDestination
            icon={Router}
            title={t('settings.devices.title')}
            subtitle={`${t('settings.devices.count', { count: haDeviceRegistry.length })}${
              deviceAttentionCount > 0 ? ` · ${t('settings.devices.attention', { count: deviceAttentionCount })}` : ''
            }`}
            onClick={() => navigateTo('/settings/devices')}
          />
          <SettingsDestination
            icon={Box}
            title={t('settings.entities.title')}
            subtitle={t('settings.entities.count', { count: Object.keys(haStates).length })}
            onClick={() => navigateTo('/settings/entities')}
          />
        </div>
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/devices') {
    return (
      <SettingsDetailShell
        title={t('settings.devices.title')}
        subtitle={t('settings.devices.subtitle')}
        onBack={() => navigateTo('/settings/home')}
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
        onBack={() => navigateTo('/settings/home')}
      >
        <SettingsEntitiesList
          haStates={haStates}
          entityRegistry={haEntityRegistry}
          deviceRegistry={haDeviceRegistry}
          areas={haAreas}
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
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile icon={Layers3} label={t('settings.dashboard.sections')} value={sections.length} />
          <StatTile icon={Box} label={t('settings.dashboard.cards')} value={widgets.length} />
          <StatTile icon={LayoutDashboard} label={t('settings.dashboard.breakpoint')} value={currentLayoutId?.toUpperCase() || 'Auto'} />
        </div>
        <section className="dashboard-content-surface mt-5 rounded-[1.5rem] p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-[-0.02em]">{t('settings.dashboard.customize')}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--ui-text-secondary)]">
            {t('settings.dashboard.customizeDescription')}
          </p>
          <button
            type="button"
            onClick={() => navigateTo('/home')}
            className="liquid-glass-selection mt-5 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"
          >
            <LayoutDashboard size={16} />
            {t('settings.dashboard.openHome')}
          </button>
        </section>
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

  if (settingsPath === '/settings/security') {
    return (
      <SettingsDetailShell
        title={t('settings.security.pageTitle')}
        subtitle={t('settings.security.pageSubtitle')}
        onBack={() => navigateTo('/settings')}
      >
        <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
              <ShieldCheck size={21} />
            </span>
            <div>
              <h2 className="font-semibold">{t('settings.security.authority')}</h2>
              <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                {t('settings.security.authorityDescription')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigateTo('/security')}
            className="liquid-glass-selection mt-5 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"
          >
            <LockKeyhole size={16} />
            {t('settings.security.open')}
          </button>
        </section>
      </SettingsDetailShell>
    );
  }

  if (settingsPath === '/settings/advanced') {
    return (
      <SettingsDetailShell
        title={t('settings.advanced.title')}
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
          <div className="mt-5 border-t border-[color:var(--ui-separator)] pt-5">
            <InfoRow icon={Info} title={t('settings.advanced.version')} subtitle={__APP_VERSION__} />
            <InfoRow
              icon={Database}
              title={t('settings.advanced.entities')}
              subtitle={t('settings.advanced.entitiesDetected', { count: Object.keys(haStates).length })}
            />
          </div>
        </section>
        <section className="dashboard-content-surface mt-4 rounded-[1.5rem] p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <LifeBuoy
              size={21}
              className="mt-0.5 shrink-0 text-[color:var(--ui-text-secondary)]"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{t('settings.advanced.support')}</h2>
              <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                {t('settings.advanced.supportDescription')}
              </p>
              <button
                type="button"
                onClick={handleDownloadSupportDiagnostics}
                className="liquid-glass-selection mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"
              >
                <FileJson size={16} />
                {t('settings.advanced.downloadDiagnostics')}
              </button>
              {actionFeedback.startsWith('Diagnostica') ? (
                <p
                  role="status"
                  className="mt-3 text-xs font-medium text-[color:var(--ui-text-secondary)]"
                >
                  {actionFeedback}
                </p>
              ) : null}
            </div>
          </div>
        </section>
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
        onBack={() => navigateTo('/settings/data')}
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

  if (
    settingsPath === '/settings/access' ||
    settingsPath === '/settings/connections' ||
    settingsPath === '/settings/data'
  ) {
    const canOpenManagedPage =
      settingsPath === '/settings/connections' ||
      (settingsPath === '/settings/access' && security.can('manage_rooms')) ||
      (settingsPath === '/settings/data' &&
        (security.can('download_backup') ||
          security.can('restore_backup') ||
          security.can('reset_dashboard')));
    const managedPage =
      settingsPath === '/settings/access'
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
        onBack={() => navigateTo('/settings')}
      >
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

  return (
    <div key={settingsPath} className="dashboard-page-scroll text-[color:var(--ui-text-primary)]">
      <header className="dashboard-page-content-wide">
        <button
          type="button"
          onClick={() => navigateTo('/settings')}
          className="liquid-glass-control mb-5 inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[color:var(--ui-text-primary)]"
        >
          <ChevronRight size={16} className="rotate-180" />
          {t('settings.back')}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="dashboard-page-title">{t('settings.system.pageTitle')}</h1>
            <p className="dashboard-page-subtitle">{t('settings.system.subtitle', { restart: lastRestartLabel })}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-4 py-2 text-xs font-medium text-[color:var(--ui-text-secondary)]">
              <span
                className={`h-2 w-2 rounded-full ${
                  haStatus === 'connected'
                    ? 'bg-emerald-500'
                    : haStatus === 'connecting' || haStatus === 'reconnecting'
                      ? 'bg-amber-500'
                      : haStatus === 'error' || haStatus === 'reauth_required'
                        ? 'bg-rose-500'
                        : 'bg-gray-400'
                }`}
              />
              Home Assistant · {statusLabel(haStatus, t)}
            </span>
            {security.can('developer_mode') ? (
              <span className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-3.5 py-2 text-xs font-semibold text-[color:var(--ui-text-secondary)] backdrop-blur-xl">
                <Gauge size={14} />
                Developer
              <GlassToggle checked={developerMode} onChange={onDeveloperModeChange} label={t('settings.advanced.developer')} />
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="dashboard-page-content-wide mt-6 space-y-4 sm:space-y-6">
        {/* Bento grid — 1 col (mobile) → 2 col (tablet) → 6 col (desktop) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-6">
          {/* 1 — Vitalità di Sistema */}
          <BentoCard
            icon={Activity}
            title={t('settings.system.vitality')}
            subtitle={t('settings.system.vitalitySubtitle')}
            className="sm:col-span-2 lg:col-span-4"
          >
            <div className="flex flex-1 flex-col gap-5">
              <div className="grid grid-cols-2 gap-4 sm:gap-5">
                <SimpleMeterDisplay
                  value={cpuValue === null ? '--' : `${Math.round(cpuValue)}%`}
                  percent={cpuValue}
                  label="CPU"
                  tone={cpuTone}
                />
                <SimpleMeterDisplay
                  value={tempValue === null ? '--' : `${Math.round(tempValue)}°`}
                  percent={tempValue === null ? null : (tempValue / 90) * 100}
                    label={t('settings.system.temperature')}
                  tone={tempTone}
                />
              </div>

              <div className="space-y-2.5">
                <VitalMeter
                  icon={Database}
                  label="RAM"
                  value={ramPercent === null ? '--' : `${Math.round(ramPercent)}%`}
                  hint={ramMemHint}
                  percent={ramPercent}
                  tone={ramTone}
                />
                <VitalMeter
                  icon={HardDrive}
                    label={t('settings.system.disk')}
                  value={diskPercent === null ? '--' : `${Math.round(diskPercent)}%`}
                  hint={diskHint}
                  percent={diskPercent}
                  tone={diskTone}
                />
              </div>

              <div className="mt-auto">
                  <p className="text-xs font-medium text-[color:var(--ui-text-secondary)]">{t('settings.system.cpuTrend')}</p>
                <div className="mt-2 h-14 min-w-0">
                  <MiniSparkline id="settings-cpu-trend" data={processorUseHistory} />
                </div>
              </div>
            </div>
          </BentoCard>

          {/* 2 — Centro Aggiornamenti */}
          <BentoCard
            icon={DownloadCloud}
            title={t('settings.system.updates')}
              subtitle={updateEntities.length > 0 ? t('settings.system.monitoredComponents', { count: updateEntities.length }) : t('settings.system.noUpdateEntities')}
            className="sm:col-span-2 lg:col-span-2"
            onTitleClick={updateEntities.length > 0 ? () => setUpdatesPageOpen(true) : undefined}
            headerRight={
              availableUpdates.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/25 bg-orange-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-orange-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                  {availableUpdates.length}
                </span>
              ) : null
            }
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
                {visibleUpdates.length === 0 ? (
                  <p className="rounded-xl bg-[color:var(--ui-surface-glass)] px-3 py-6 text-center text-xs font-medium text-[color:var(--ui-text-secondary)]">
                    {t('settings.system.noUpdates')}
                  </p>
                ) : (
                  visibleUpdates.map((update) => (
                    <div
                      key={update.entityId}
                      className="flex items-center gap-2.5 rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-3 py-2"
                    >
                      {update.available ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                      ) : (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[color:var(--ui-text-primary)]">{update.title}</p>
                        <p className="truncate text-[10px] text-[color:var(--ui-text-secondary)]">
                          {update.available && update.latest
                            ? `${update.installed || '—'} → ${update.latest}`
                            : update.installed || t('settings.system.updated')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3">
                <LiquidButton
                  onClick={handleUpdateAll}
                  disabled={!isConnected || availableUpdates.length === 0 || isActionBusy}
                >
                  <DownloadCloud size={16} />
                  {availableUpdates.length > 0 ? t('settings.system.updateAll', { count: availableUpdates.length }) : t('settings.system.allUpdated')}
                </LiquidButton>
              </div>
            </div>
          </BentoCard>

          {/* 3 — Rete & Uptime */}
          <BentoCard
            icon={Network}
            title={t('settings.system.network')}
            subtitle={t('settings.system.networkSubtitle')}
            className="sm:col-span-1 lg:col-span-3"
          >
            <div className="flex flex-1 flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[1.15rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]">
                    <Wifi size={13} /> {t('settings.system.localIp')}
                  </p>
                  <p className="mt-1.5 truncate text-lg font-semibold tracking-[-0.02em] text-[color:var(--ui-text-primary)]">{ipLabel}</p>
                </div>
                <div className="rounded-[1.15rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]">
                    <Clock size={13} /> {t('settings.system.uptime')}
                  </p>
                  <p className="mt-1.5 truncate text-lg font-semibold tracking-[-0.02em] text-[color:var(--ui-text-primary)]">{uptimeLabel}</p>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-[color:var(--ui-text-secondary)]">{uptimeSince}</p>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col rounded-[1.15rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] p-3">
                <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]">{t('settings.system.latency')}</p>
                  <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
                    {latencyValue === null ? '—' : `${Math.round(latencyValue)}${latency?.entity.unit ? ` ${latency.entity.unit}` : ' ms'}`}
                  </p>
                </div>
                <div className="mt-2 h-12 min-w-0 flex-1">
                  <MiniSparkline id="settings-latency-trend" data={latencyHistory} />
                </div>
              </div>
            </div>
          </BentoCard>

          {/* 4 — Sicurezza & Backup */}
          <BentoCard
            icon={ShieldCheck}
            title={t('settings.system.backup')}
            subtitle={t('settings.system.backupSubtitle')}
            className="sm:col-span-1 lg:col-span-3"
          >
            <div className="flex flex-1 flex-col gap-3">
              <div className="rounded-[1.15rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]">
                  {t('settings.system.lastSnapshot')}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
                    {lastBackupLabel ?? t('settings.system.noBackupDetected')}
                    </p>
                  </div>
                  {backupSizeLabel ? (
                    <span className="shrink-0 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">
                      {backupSizeLabel}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-auto space-y-2.5">
                <LiquidButton onClick={handleForceBackup} disabled={!isConnected || isActionBusy}>
                  <ShieldCheck size={16} />
                    {t('settings.system.forceBackup')}
                </LiquidButton>
                <div className="flex flex-wrap gap-2">
                  {security.can('download_backup') ? (
                    <button
                      type="button"
                      onClick={onDownloadBackup}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-3 py-2 text-xs font-semibold text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-surface-glass-strong)]"
                    >
                      <Download size={14} /> {t('settings.system.exportConfig')}
                    </button>
                  ) : null}
                  {security.can('restore_backup') ? (
                    <button
                      type="button"
                      onClick={() => restoreInputRef.current?.click()}
                      disabled={isRestoreBusy}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-3 py-2 text-xs font-semibold text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-surface-glass-strong)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Upload size={14} /> {t('settings.system.restore')}
                    </button>
                  ) : null}
                </div>
                {security.can('reset_dashboard') ? (
                  <button
                    type="button"
                    onClick={() => navigateTo('/settings/data')}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-3 py-2 text-xs font-semibold text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-surface-glass-strong)]"
                  >
                  <Database size={14} /> {t('settings.system.openDataBackup')}
                  </button>
                ) : null}
              </div>
            </div>
          </BentoCard>

          {/* 5 — Danger Zone / Power */}
          <BentoCard
            icon={AlertTriangle}
            title={t('settings.system.power')}
            subtitle={t('settings.system.powerSubtitle')}
            className="sm:col-span-2 lg:col-span-6"
            headerRight={
              <button
                type="button"
                onClick={handleRefreshSystemSensors}
                disabled={!isConnected || systemEntityIds.length === 0 || isActionBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-3 py-2 text-xs font-semibold text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-surface-glass-strong)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                  <RefreshCw size={14} /> {t('settings.system.refreshSensors')}
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {security.can('restart_home_assistant') ? (
                <DangerButton
                  icon={RotateCcw}
                label={t('settings.system.restartHa')}
                hint={t('settings.system.restartHaHint')}
                  disabled={!isConnected || isActionBusy}
                  onConfirm={handleRestartServer}
                />
              ) : null}
              <DangerButton
                icon={Server}
                label={t('settings.system.restartHost')}
                hint={t('settings.system.restartHostHint')}
                disabled={!isConnected || isActionBusy}
                onConfirm={handleRebootHost}
              />
              <DangerButton
                icon={Power}
                label={t('settings.system.shutdown')}
                hint={t('settings.system.shutdownHint')}
                disabled={!isConnected || isActionBusy}
                onConfirm={handleShutdownHost}
              />
            </div>
          </BentoCard>
        </div>

        <input
          ref={restoreInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleRestoreBackup}
        />

        {(actionFeedback || haError) ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {actionFeedback ? (
              <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-3.5 py-2 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                {actionFeedback}
              </p>
            ) : null}
            {haError ? (
              <p className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/[0.07] px-3.5 py-2 text-xs font-semibold text-rose-200">
                <AlertTriangle size={13} /> {haError}
              </p>
            ) : null}
          </div>
        ) : null}

        {developerMode ? (
          <p className="mt-3 flex items-center gap-2 px-1 text-[11px] font-medium text-[color:var(--ui-text-secondary)]">
              <Database size={12} /> {t('settings.system.debugSummary', { entities: Object.keys(haStates).length, sensors: systemSensors.length })}
          </p>
        ) : null}
      </div>

      <UpdatesCenterModal
        isOpen={updatesPageOpen}
        onClose={() => setUpdatesPageOpen(false)}
        updates={availableUpdates}
        isConnected={isConnected}
        isBusy={isActionBusy}
        onInstall={(entityId) => onCallService('update', 'install', { entity_id: entityId })}
        onSkip={(entityId) => onCallService('update', 'skip', { entity_id: entityId })}
        onUpdateAll={handleUpdateAll}
      />
    </div>
  );
}
