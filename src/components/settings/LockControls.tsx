import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BatteryLow, BatteryMedium, DoorOpen, History, Lock, LockOpen, Timer, Wifi, WifiOff } from 'lucide-react';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { ContextPanelHeader } from './ContextPanelHeader';
import { SettingsListGroup, SettingsListRow } from './SettingsList';
import { buildLockCardModel, normalizeLockCardState, resolveLockRingCopy } from '../widgets/lockCardModel';
import { LockRing } from '../widgets/LockRing';
import { resolveLockRingMode, useLockRingPress } from '../widgets/useLockRingPress';
import { useI18n } from '../../i18n/I18nProvider';

type LockControlsProps = {
  lock: {
    name: string;
    state: string;
    status?: string;
    changedBy?: string;
    activityLogLimit?: number;
    activityLogHours?: number;
    activityTimeline?: Array<{
      id: string;
      text: string;
    }>;
    activityTimelineStatus?: 'idle' | 'loading' | 'available' | 'empty' | 'unavailable' | 'offline';
    supportedFeatures?: number;
    batteryLevel?: number;
    connection?: {
      state: 'online' | 'offline' | 'unknown';
      label: string;
    };
    rawAttributes?: Record<string, unknown>;
    lockCode?: string;
  };
  onLock: (code?: string) => void;
  onUnlock: (code?: string) => boolean | void;
  onOpen: (code?: string) => void;
};

type TimelineEntry = {
  id: string;
  text: string;
};

const PANEL_RING_STYLE = {
  '--lock-ring-size': 'clamp(8rem, 40vw, 10rem)',
  '--lock-ring-stroke': '3',
} as React.CSSProperties;

export function LockControls({
  lock,
  onLock,
  onUnlock,
  onOpen,
}: LockControlsProps) {
  const { t, locale, formatDate } = useI18n();
  const actionCode = lock.lockCode?.trim() || undefined;
  const [simulatedState, setSimulatedState] = useState(normalizeLockCardState(lock.state));
  const maxTimelineEntries = useMemo(() => {
    const parsed = Number(lock.activityLogLimit);
    if (!Number.isFinite(parsed)) {
      return 6;
    }
    return Math.max(1, Math.min(30, Math.round(parsed)));
  }, [lock.activityLogLimit]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>(() => (lock.activityTimeline ?? []).slice(0, maxTimelineEntries));
  const timelineActor = lock.changedBy?.trim() || t('controls.lock.system');
  const shouldUseLocalTimeline = !lock.activityTimelineStatus || lock.activityTimelineStatus === 'offline';

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
  const HeaderIcon = model.isJammed || model.isUnavailable ? AlertTriangle : model.isOpen ? DoorOpen : model.isLocked ? Lock : LockOpen;

  const pushTimeline = (key: 'controls.lock.lockedBy' | 'controls.lock.unlockedBy' | 'controls.lock.openedBy') => {
    if (!shouldUseLocalTimeline) return;
    const text = t(key, { actor: timelineActor, time: formatDate(new Date(), { hour: '2-digit', minute: '2-digit' }) });
    setTimeline((prev) => [
      {
        id: `activity-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        text,
      },
      ...prev,
    ].slice(0, maxTimelineEntries));
  };

  // The same gesture as the card: the first lap unlocks, the second opens the latch.
  const ring = useLockRingPress({
    mode: resolveLockRingMode({ enabled: true, state: model.state, canOpen: model.canOpenLatch }),
    canOpenAfterUnlock: model.canOpenLatch,
    onUnlock: () => {
      const didUnlock = onUnlock();
      if (didUnlock === false) {
        return false;
      }
      setSimulatedState('unlocked');
      pushTimeline('controls.lock.unlockedBy');
      return true;
    },
    onLock: () => {
      setSimulatedState('locked');
      onLock(actionCode);
      pushTimeline('controls.lock.lockedBy');
    },
    onOpen: () => {
      setSimulatedState('opening');
      onOpen();
      pushTimeline('controls.lock.openedBy');
    },
  });
  const copy = resolveLockRingCopy(model, ring, locale);

  const activityUnavailableMessage = useMemo(() => {
    const historyHours = Math.max(1, Math.round(Number(lock.activityLogHours) || 24));
    if (lock.activityTimelineStatus === 'loading') {
      return t('controls.lock.loadingActivity');
    }
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
  }, [lock.activityLogHours, lock.activityTimelineStatus, t]);

  const batteryTone = batteryLevel === undefined ? 'default' : batteryLevel <= 20 ? 'danger' : batteryLevel <= 50 ? 'warning' : 'success';
  const hasDetails = Boolean(model.doorState || model.autoLock || batteryLevel !== undefined || connection);
  const headlineTone = {
    secure: 'text-[color:color-mix(in_srgb,#12a372_70%,var(--ui-text-primary))]',
    open: 'text-[color:color-mix(in_srgb,#d97706_70%,var(--ui-text-primary))]',
    transition: 'text-[color:color-mix(in_srgb,#0a84ff_70%,var(--ui-text-primary))]',
    warning: 'text-[color:color-mix(in_srgb,#e5484d_70%,var(--ui-text-primary))]',
    offline: 'text-[color:var(--ui-text-secondary)]',
  }[model.tone];
  const captionTone = copy.isHighlighted
    ? ring.stage === 'bridge' || ring.stage === 'open'
      ? 'font-semibold text-[color:color-mix(in_srgb,#0a84ff_70%,var(--ui-text-primary))]'
      : `font-semibold ${headlineTone}`
    : 'font-medium text-[color:var(--ui-text-secondary)]';

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell}>
      <ContextPanelHeader
        title={lock.name}
        subtitle={model.stateLabel}
        icon={<HeaderIcon size={21} />}
        fallbackTitle={t('controls.lock.title')}
      />

      <section className={`${CONTEXT_PANEL_LAYOUT.section} flex flex-col items-center gap-4 py-8 text-center`}>
        <LockRing
          {...ring.bindings}
          style={PANEL_RING_STYLE}
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
          <p className={`text-[1.875rem] font-bold leading-tight tracking-[-0.025em] transition-colors ${headlineTone}`}>
            {model.headline}
          </p>
          <p
            aria-live="polite"
            className={`max-w-[18rem] text-[13px] leading-snug transition-colors ${captionTone} ${
              ring.isNudging && model.state === 'locked' ? 'motion-safe:animate-[lock-ring-nudge_420ms_ease-in-out]' : ''
            }`}
          >
            {copy.caption}
          </p>
        </div>
      </section>

      {hasDetails ? (
        <SettingsListGroup title={t('controls.lock.details')}>
          {model.doorState ? (
            <SettingsListRow
              icon={DoorOpen}
              title={t('card.lock.door')}
              value={t(model.doorState === 'open' ? 'card.lock.door.open' : 'card.lock.door.closed')}
              tone={model.doorState === 'open' ? 'warning' : 'default'}
            />
          ) : null}
          {model.autoLock ? (
            <SettingsListRow
              icon={Timer}
              title={t('card.lock.autoLock')}
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
              meter={batteryTone === 'default' ? undefined : { percent: batteryLevel, tone: batteryTone }}
            />
          ) : null}
          {connection ? (
            <SettingsListRow
              icon={connection.state === 'offline' ? WifiOff : Wifi}
              title={t('controls.lock.connection')}
              value={connection.label}
              tone={connection.state === 'online' ? 'success' : connection.state === 'offline' ? 'danger' : 'default'}
            />
          ) : null}
        </SettingsListGroup>
      ) : null}

      <SettingsListGroup title={t('controls.lock.recentActivity')}>
        {timeline.length > 0 ? (
          timeline.map((entry) => (
            <SettingsListRow key={entry.id} icon={History} title={entry.text} />
          ))
        ) : (
          <p className="px-4 py-3.5 text-sm leading-5 text-[color:var(--ui-text-secondary)]">{activityUnavailableMessage}</p>
        )}
      </SettingsListGroup>
    </div>
  );
}
