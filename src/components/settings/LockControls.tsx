import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BatteryLow, BatteryMedium, DoorOpen, Lock, LockOpen, ShieldCheck, Timer, WifiOff, type LucideIcon } from 'lucide-react';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { SettingsListGroup, SettingsListRow } from './SettingsList';
import type { LockActivityEntry, LockActivityKind, LockPanelData } from './lockPanelTypes';
import { buildLockCardModel, normalizeLockCardState, resolveLockLastChange, resolveLockRingCopy } from '../widgets/lockCardModel';
import { LockRing } from '../widgets/LockRing';
import { resolveLockRingMode, useLockRingPress } from '../widgets/useLockRingPress';
import { GlassSegmentSelect } from '../ui/GlassSegmentSelect';
import { PUSH_PAGE_ATTRIBUTE, usePagePushTransition } from '../ui/usePagePushTransition';
import { useI18n } from '../../i18n/I18nProvider';

type LockControlsProps = {
  lock: LockPanelData;
  onLock: (code?: string) => void;
  onUnlock: (code?: string) => boolean | void;
  onOpen: (code?: string) => void;
  onSecondaryPageChange?: (open: boolean) => void;
};

type LockPanelPage = 'main' | 'history';
type LockActivityFilter = 'all' | 'lock' | 'unlock' | 'open';

const RECENT_ACTIVITY_COUNT = 4;

const PANEL_RING_STYLE = {
  '--lock-ring-size': '9.375rem',
  '--lock-ring-stroke': '2.6',
  '--lock-ring-icon': '37%',
  '--lock-fill-strength': '14%',
} as React.CSSProperties;

const HEADLINE_TONE = {
  secure: 'text-[color:color-mix(in_srgb,#12a372_70%,var(--ui-text-primary))]',
  open: 'text-[color:color-mix(in_srgb,#d97706_70%,var(--ui-text-primary))]',
  transition: 'text-[color:color-mix(in_srgb,#0a84ff_70%,var(--ui-text-primary))]',
  warning: 'text-[color:color-mix(in_srgb,#e5484d_70%,var(--ui-text-primary))]',
  offline: 'text-[color:var(--ui-text-secondary)]',
} as const;

const ACTIVITY_TONE: Record<LockActivityKind, string> = {
  lock: 'bg-[color:color-mix(in_srgb,#12a372_17%,transparent)] text-[color:color-mix(in_srgb,#12a372_70%,var(--ui-text-primary))]',
  unlock: 'bg-[color:color-mix(in_srgb,#d97706_17%,transparent)] text-[color:color-mix(in_srgb,#d97706_70%,var(--ui-text-primary))]',
  open: 'bg-[color:color-mix(in_srgb,#0a84ff_17%,transparent)] text-[color:color-mix(in_srgb,#0a84ff_70%,var(--ui-text-primary))]',
  jam: 'bg-[color:color-mix(in_srgb,#e5484d_17%,transparent)] text-[color:color-mix(in_srgb,#e5484d_70%,var(--ui-text-primary))]',
  other: 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]',
};

const ACTIVITY_ICON: Record<LockActivityKind, LucideIcon> = {
  lock: Lock,
  unlock: LockOpen,
  open: DoorOpen,
  jam: AlertTriangle,
  other: Lock,
};

const COMMAND_TONE = {
  lock: 'text-[color:color-mix(in_srgb,#12a372_70%,var(--ui-text-primary))]',
  unlock: 'text-[color:color-mix(in_srgb,#d97706_70%,var(--ui-text-primary))]',
  open: 'text-[color:color-mix(in_srgb,#0a84ff_70%,var(--ui-text-primary))]',
} as const;

function startOfDay(timestampMs: number) {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const PAGE_DEPTH = (page: string) => (page === 'history' ? 1 : 0);

export function LockControls({
  lock,
  onLock,
  onUnlock,
  onOpen,
  onSecondaryPageChange,
}: LockControlsProps) {
  const { t, locale, formatDate } = useI18n();
  const actionCode = lock.lockCode?.trim() || undefined;
  const [simulatedState, setSimulatedState] = useState(normalizeLockCardState(lock.state));
  const [page, setPage] = useState<LockPanelPage>('main');
  const [filter, setFilter] = useState<LockActivityFilter>('all');
  const maxTimelineEntries = useMemo(() => {
    const parsed = Number(lock.activityLogLimit);
    if (!Number.isFinite(parsed)) {
      return 6;
    }
    return Math.max(1, Math.min(30, Math.round(parsed)));
  }, [lock.activityLogLimit]);
  const [timeline, setTimeline] = useState<LockActivityEntry[]>(() => (lock.activityTimeline ?? []).slice(0, maxTimelineEntries));
  const shouldUseLocalTimeline = !lock.activityTimelineStatus || lock.activityTimelineStatus === 'offline';
  const historyHours = Math.max(1, Math.round(Number(lock.activityLogHours) || 24));

  useEffect(() => {
    setSimulatedState(normalizeLockCardState(lock.state));
  }, [lock.name, lock.state]);

  useEffect(() => {
    const incoming = (lock.activityTimeline ?? []).slice(0, maxTimelineEntries);
    setTimeline((previous) => {
      if (!shouldUseLocalTimeline) {
        return incoming;
      }
      return incoming.length > 0 ? incoming : previous;
    });
  }, [lock.activityTimeline, maxTimelineEntries, shouldUseLocalTimeline]);

  useEffect(() => {
    setTimeline((lock.activityTimeline ?? []).slice(0, maxTimelineEntries));
  }, [lock.name, lock.activityTimeline, lock.activityTimelineStatus, maxTimelineEntries]);

  useEffect(() => {
    setPage('main');
  }, [lock.name]);

  useEffect(() => {
    onSecondaryPageChange?.(page === 'history');
  }, [onSecondaryPageChange, page]);

  useEffect(() => () => onSecondaryPageChange?.(false), [onSecondaryPageChange]);

  usePagePushTransition('lock-panel', page, PAGE_DEPTH);

  const model = useMemo(
    () => buildLockCardModel(
      { title: lock.name, status: simulatedState },
      { state: simulatedState, supportedFeatures: lock.supportedFeatures, rawAttributes: lock.rawAttributes },
      locale,
    ),
    [locale, lock.name, lock.rawAttributes, lock.supportedFeatures, simulatedState],
  );
  const batteryLevel = typeof lock.batteryLevel === 'number' ? lock.batteryLevel : model.batteryLevel;
  const connection = lock.connection;
  const lastChange = resolveLockLastChange(lock, locale);
  const subtitle = model.isUnavailable ? t('controls.lock.unreachable') : lastChange ?? model.stateLabel;

  const pushTimeline = (kind: LockActivityKind) => {
    if (!shouldUseLocalTimeline) return;
    setTimeline((previous) => [
      {
        id: `activity-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        text: '',
        timestampMs: Date.now(),
        kind,
        source: { kind: 'panel' as const },
      },
      ...previous,
    ].slice(0, maxTimelineEntries));
  };

  // The ring and the plain commands share these, so both go through the same confirmation.
  const unlockNow = () => {
    const didUnlock = onUnlock();
    if (didUnlock === false) {
      return false;
    }
    setSimulatedState('unlocked');
    pushTimeline('unlock');
    return true;
  };
  const lockNow = () => {
    setSimulatedState('locked');
    onLock(actionCode);
    pushTimeline('lock');
  };
  const openNow = () => {
    setSimulatedState('opening');
    onOpen();
    pushTimeline('open');
  };

  const ring = useLockRingPress({
    mode: resolveLockRingMode({ enabled: true, state: model.state, canOpen: model.canOpenLatch }),
    canOpenAfterUnlock: model.canOpenLatch,
    onUnlock: unlockNow,
    onLock: lockNow,
    onOpen: openNow,
  });
  const copy = resolveLockRingCopy(model, ring, locale);

  const commands: Array<{ id: 'lock' | 'unlock' | 'open'; label: string; icon: LucideIcon; run: () => void }> = [];
  if (model.state === 'locked') {
    commands.push({ id: 'unlock', label: t('card.lock.unlock'), icon: LockOpen, run: () => { unlockNow(); } });
  }
  if (model.state === 'unlocked' || model.state === 'open') {
    commands.push({ id: 'lock', label: t('card.lock.lock'), icon: Lock, run: lockNow });
  }
  if (model.canOpenLatch) {
    commands.push({ id: 'open', label: t('controls.lock.openDoor'), icon: DoorOpen, run: openNow });
  }

  const lowBattery = typeof batteryLevel === 'number' && batteryLevel <= 20;
  const alert = model.isJammed
    ? { title: t('controls.lock.jammedTitle'), body: t('controls.lock.jammedBody'), action: t('controls.lock.retryLock') }
    : model.isUnavailable
      ? lowBattery
        ? { title: t('controls.lock.lowBatteryTitle', { value: batteryLevel }), body: t('controls.lock.lowBatteryBody') }
        : { title: t('controls.lock.offlineTitle'), body: t('controls.lock.offlineBody') }
      : null;

  const staleNote = model.isUnavailable
    ? typeof model.lastChangedMs === 'number'
      ? t('controls.lock.lastKnownAt', { time: formatDate(new Date(model.lastChangedMs), { hour: '2-digit', minute: '2-digit' }) })
      : t('controls.lock.lastKnown')
    : undefined;
  const batteryTone = batteryLevel === undefined ? 'default' : batteryLevel <= 20 ? 'danger' : batteryLevel < 50 ? 'warning' : 'success';
  const showConnection = Boolean(connection && connection.state !== 'online');
  const hasDetails = Boolean(model.doorState || model.autoLock || batteryLevel !== undefined || showConnection);

  const describeEntry = (entry: LockActivityEntry) => {
    const kind = entry.kind ?? 'other';
    let title = entry.text;
    if (entry.kind) {
      if (entry.source?.kind === 'panel' && (kind === 'lock' || kind === 'unlock' || kind === 'open')) {
        title = t(`controls.lock.youDid.${kind}`);
      } else {
        title = entry.userActor
          ? t(`controls.lock.eventBy.${kind}`, { actor: entry.userActor })
          : t(`controls.lock.event.${kind}`);
      }
    }
    const source = entry.source?.kind === 'automation'
      ? t('controls.lock.source.automation', { name: entry.source.name })
      : entry.source?.kind === 'lock'
        ? t('controls.lock.source.lock')
        : entry.source?.kind === 'panel'
          ? t('controls.lock.source.panel')
          : undefined;
    const time = typeof entry.timestampMs === 'number'
      ? formatDate(new Date(entry.timestampMs), { hour: '2-digit', minute: '2-digit' })
      : undefined;
    return { kind, title, source, time };
  };

  const dayLabel = (timestampMs: number) => {
    const today = startOfDay(Date.now());
    const day = startOfDay(timestampMs);
    if (day === today) return t('controls.lock.today');
    if (day === today - 86_400_000) return t('controls.lock.yesterday');
    const label = formatDate(new Date(timestampMs), { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const groupByDay = (entries: LockActivityEntry[]) => {
    const groups: Array<{ key: number; title: string; entries: LockActivityEntry[] }> = [];
    entries.forEach((entry) => {
      const timestampMs = entry.timestampMs ?? Date.now();
      const key = startOfDay(timestampMs);
      const group = groups.find((candidate) => candidate.key === key);
      if (group) {
        group.entries.push(entry);
      } else {
        groups.push({ key, title: dayLabel(timestampMs), entries: [entry] });
      }
    });
    return groups;
  };

  const activityUnavailableMessage = useMemo(() => {
    if (lock.activityTimelineStatus === 'empty') {
      return t('controls.lock.emptyActivity', { hours: historyHours });
    }
    if (lock.activityTimelineStatus === 'unavailable') {
      return t('controls.lock.unavailableActivity');
    }
    if (lock.activityTimelineStatus === 'offline') {
      return t('controls.lock.offlineActivity');
    }
    return t('controls.lock.noActivity');
  }, [historyHours, lock.activityTimelineStatus, t]);

  const renderActivityRow = (entry: LockActivityEntry, withSource: boolean) => {
    const { kind, title, source, time } = describeEntry(entry);
    const Icon = ACTIVITY_ICON[kind];
    return (
      <div key={entry.id} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ACTIVITY_TONE[kind]}`} aria-hidden="true">
          <Icon size={15} strokeWidth={2.3} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-[color:var(--ui-text-primary)]">{title}</span>
          {withSource && source ? (
            <span className="truncate text-xs text-[color:var(--ui-text-tertiary)]">{source}</span>
          ) : null}
        </span>
        {time ? <span className="shrink-0 text-[13px] tabular-nums text-[color:var(--ui-text-secondary)]">{time}</span> : null}
      </div>
    );
  };

  if (page === 'history') {
    const filtered = timeline.filter((entry) => filter === 'all' || entry.kind === filter);
    const groups = groupByDay(filtered);
    return (
      <div className={`${CONTEXT_PANEL_LAYOUT.shell} w-full min-w-0`} {...{ [PUSH_PAGE_ATTRIBUTE]: 'lock-panel' }}>
        <button
          type="button"
          onClick={() => setPage('main')}
          className="glass-button min-h-11 w-fit rounded-full px-3 text-xs font-semibold"
        >
          <ArrowLeft size={15} />
          <span className="truncate">{t('controls.lock.title')}</span>
        </button>
        <div className="px-1">
          <h2 className="text-[1.625rem] font-bold leading-tight tracking-[-0.02em] text-[color:var(--ui-text-primary)]">
            {t('controls.lock.historyTitle')}
          </h2>
          <p className="mt-1 text-[13px] text-[color:var(--ui-text-secondary)]">
            {t('controls.lock.historySubtitle', { name: lock.name, hours: historyHours })}
          </p>
        </div>
        <GlassSegmentSelect<LockActivityFilter>
          ariaLabel={t('controls.lock.filter')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('controls.lock.filter.all') },
            { value: 'lock', label: t('controls.lock.filter.lock') },
            { value: 'unlock', label: t('controls.lock.filter.unlock') },
            { value: 'open', label: t('controls.lock.filter.open') },
          ]}
        />
        {groups.length > 0 ? (
          groups.map((group) => (
            <SettingsListGroup key={group.key} title={group.title}>
              {group.entries.map((entry) => renderActivityRow(entry, true))}
            </SettingsListGroup>
          ))
        ) : (
          <p className="px-1 text-sm text-[color:var(--ui-text-secondary)]">{t('controls.lock.filterEmpty')}</p>
        )}
      </div>
    );
  }

  const recentGroups = groupByDay(timeline.slice(0, RECENT_ACTIVITY_COUNT));
  const isActivityLoading = lock.activityTimelineStatus === 'loading' && timeline.length === 0;

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell} {...{ [PUSH_PAGE_ATTRIBUTE]: 'lock-panel' }}>
      <div className="context-panel-header flex min-w-0 items-center px-1 pt-1">
        <div className="min-w-0">
          <h2 className="truncate text-[1.3rem] font-bold leading-tight tracking-[-0.02em] text-[color:var(--ui-text-primary)]">
            {lock.name.trim() || t('controls.lock.title')}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-[color:var(--ui-text-secondary)]">{subtitle}</p>
        </div>
      </div>

      <section
        aria-label={model.stateLabel}
        className="context-content-surface relative isolate flex flex-col items-center gap-3.5 overflow-hidden rounded-[1.75rem] px-5 pb-6 pt-7 text-center [container-type:inline-size]"
      >
        <LockRing
          {...ring.bindings}
          style={PANEL_RING_STYLE}
          data-fill-scope="panel"
          withFill
          tone={model.tone}
          icon={ring.isPressing && model.ringIcon === 'busy' ? 'unlock' : model.ringIcon}
          solidCore={model.solidCore}
          lap1={ring.lap1}
          lap2={ring.lap2}
          stage={ring.stage}
          isPressing={ring.isPressing}
          outcome={ring.outcome}
          busy={model.isTransitioning && !ring.isPressing}
          aria-label={copy.ringLabel}
        />
        <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
          <p className={`text-[1.875rem] font-bold leading-tight tracking-[-0.025em] transition-colors ${HEADLINE_TONE[model.tone]}`}>
            {model.headline}
          </p>
          <p
            aria-live="polite"
            className={`max-w-[18rem] text-[13px] leading-snug transition-colors ${
              copy.isHighlighted
                ? ring.stage === 'bridge' || ring.stage === 'open'
                  ? `font-semibold ${HEADLINE_TONE.transition}`
                  : `font-semibold ${HEADLINE_TONE[model.tone]}`
                : 'font-medium text-[color:var(--ui-text-secondary)]'
            } ${ring.isNudging && model.state === 'locked' ? 'motion-safe:animate-[lock-ring-nudge_420ms_ease-in-out]' : ''}`}
          >
            {copy.caption}
          </p>
        </div>
        {lock.protection && lock.protection !== 'none' && !model.isUnavailable ? (
          <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-[color:var(--ui-fill-tertiary)] px-3 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
            <ShieldCheck size={14} aria-hidden="true" />
            <span className="truncate">
              {t(lock.protection === 'code' ? 'controls.lock.protectedCode' : 'controls.lock.protectedDevice')}
            </span>
          </span>
        ) : null}
      </section>

      {commands.length > 0 && !model.isTransitioning ? (
        <div role="group" aria-label={t('controls.lock.commands')} className="-mt-1 flex gap-2.5">
          {commands.map((command) => {
            const Icon = command.icon;
            return (
              <button
                key={command.id}
                type="button"
                onClick={command.run}
                aria-label={`${command.label} ${lock.name}`}
                className={`inline-flex h-[2.875rem] min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] px-3 text-sm font-semibold transition-colors hover:bg-[color:var(--ui-fill-tertiary)] active:scale-[0.98] ${COMMAND_TONE[command.id]}`}
              >
                <Icon size={17} aria-hidden="true" />
                <span className="truncate">{command.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {alert ? (
        <div
          role="status"
          className="flex gap-3 rounded-[1.25rem] border border-[color:color-mix(in_srgb,#e5484d_24%,transparent)] bg-[color:color-mix(in_srgb,#e5484d_10%,transparent)] p-3.5"
        >
          <span className="flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,#e5484d_18%,transparent)] text-[color:color-mix(in_srgb,#e5484d_75%,var(--ui-text-primary))]" aria-hidden="true">
            <AlertTriangle size={17} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-semibold leading-snug text-[color:var(--ui-text-primary)]">{alert.title}</p>
            <p className="text-[13px] leading-snug text-[color:var(--ui-text-secondary)]">{alert.body}</p>
            {'action' in alert && alert.action ? (
              <button
                type="button"
                onClick={lockNow}
                className="mt-2 h-9 w-fit rounded-full bg-[color:#e5484d] px-4 text-[13px] font-semibold text-[color:var(--ui-danger-contrast)] active:scale-[0.98]"
              >
                {alert.action}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasDetails ? (
        <SettingsListGroup title={t('controls.lock.details')}>
          {model.doorState ? (
            <SettingsListRow
              icon={DoorOpen}
              title={t('card.lock.door')}
              subtitle={staleNote}
              value={t(model.doorState === 'open' ? 'card.lock.door.open' : 'card.lock.door.closed')}
              tone={model.doorState === 'open' && !model.isUnavailable ? 'warning' : 'default'}
            />
          ) : null}
          {model.autoLock ? (
            <SettingsListRow
              icon={Timer}
              title={t('card.lock.autoLock')}
              subtitle={staleNote}
              value={!model.autoLock.enabled
                ? t('card.lock.autoLock.off')
                : typeof model.autoLock.delaySeconds === 'number'
                  ? t('card.lock.autoLock.after', { seconds: model.autoLock.delaySeconds })
                  : t('card.lock.autoLock.on')}
            />
          ) : null}
          {batteryLevel !== undefined ? (
            <SettingsListRow
              icon={batteryLevel <= 20 ? BatteryLow : BatteryMedium}
              title={t('controls.lock.battery')}
              value={`${batteryLevel}%`}
              tone={batteryTone}
              meter={batteryTone === 'danger' || batteryTone === 'warning' ? { percent: batteryLevel, tone: batteryTone } : undefined}
            />
          ) : null}
          {showConnection && connection ? (
            <SettingsListRow
              icon={WifiOff}
              title={t('controls.lock.connection')}
              value={connection.label}
              tone={connection.state === 'offline' ? 'danger' : 'default'}
            />
          ) : null}
        </SettingsListGroup>
      ) : null}

      <SettingsListGroup
        title={t('controls.lock.recentActivity')}
        action={timeline.length > 0 ? (
          <button
            type="button"
            onClick={() => setPage('history')}
            className="text-[13px] font-semibold normal-case tracking-normal text-[color:var(--ui-accent)]"
          >
            {t('controls.lock.showAll')}
          </button>
        ) : undefined}
      >
        {isActivityLoading ? (
          [60, 48, 54].map((width, index) => (
            <div key={width} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2 motion-safe:animate-pulse" aria-hidden={index > 0 || undefined}>
              <span className="h-8 w-8 shrink-0 rounded-full bg-[color:var(--ui-fill-tertiary)]" />
              <span className="h-2.5 rounded-full bg-[color:var(--ui-fill-tertiary)]" style={{ width: `${width}%` }} />
              <span className="ml-auto h-2.5 w-9 rounded-full bg-[color:var(--ui-fill-tertiary)]" />
            </div>
          ))
        ) : recentGroups.length > 0 ? (
          recentGroups.map((group) => (
            <React.Fragment key={group.key}>
              <p className="px-4 pb-1 pt-3 text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{group.title}</p>
              {group.entries.map((entry) => renderActivityRow(entry, false))}
            </React.Fragment>
          ))
        ) : (
          <p className="px-4 py-3.5 text-sm leading-5 text-[color:var(--ui-text-secondary)]">
            {model.isUnavailable ? t('controls.lock.offlineActivityPaused') : activityUnavailableMessage}
          </p>
        )}
      </SettingsListGroup>
    </div>
  );
}
