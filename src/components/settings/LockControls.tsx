import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, DoorOpen, Lock, Unlock, Wifi, WifiOff } from 'lucide-react';
import { useHoldToConfirm } from '../../hooks/useHoldToConfirm';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { ContextPanelHeader } from './ContextPanelHeader';
import { normalizeLockCardState } from '../widgets/lockCardModel';
import { BatteryLevelGlyph } from './DeviceMetadataCard';
import { DeviceTelemetryStrip, type DeviceTelemetryStripItem } from './DeviceTelemetryStrip';
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

const RING_RADIUS = 57;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const LOCK_FEATURE_OPEN = 1;

function formatTimeLabel(date: Date) {
  return date.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function resolveBatteryLevel(lock: LockControlsProps['lock']) {
  const candidates = [
    lock.batteryLevel,
    lock.rawAttributes?.battery_level,
    lock.rawAttributes?.battery,
    lock.rawAttributes?.battery_percentage,
    lock.rawAttributes?.battery_percent,
    lock.rawAttributes?.battery_state_of_charge,
  ];

  for (const candidate of candidates) {
    const value = toFiniteNumber(candidate);
    if (value !== undefined) {
      return Math.max(0, Math.min(100, Math.round(value)));
    }
  }

  return undefined;
}

export function LockControls({
  lock,
  onLock,
  onUnlock,
  onOpen,
}: LockControlsProps) {
  const { t, formatDate } = useI18n();
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

  const supportedFeatures = typeof lock.supportedFeatures === 'number'
    ? lock.supportedFeatures
    : typeof lock.rawAttributes?.supported_features === 'number'
      ? lock.rawAttributes.supported_features
      : undefined;
  const supportsOpen = typeof supportedFeatures === 'number' && (supportedFeatures & LOCK_FEATURE_OPEN) !== 0;
  const batteryLevel = resolveBatteryLevel(lock);
  const connection = lock.connection;
  const telemetryItems = useMemo<DeviceTelemetryStripItem[]>(() => {
    const items: DeviceTelemetryStripItem[] = [];
    if (batteryLevel !== undefined) {
      items.push({
        id: 'battery',
        icon: <BatteryLevelGlyph percentage={batteryLevel} compact />,
        label: t('controls.lock.battery'),
        value: `${batteryLevel}%`,
        tone: batteryLevel <= 20 ? 'danger' : batteryLevel <= 50 ? 'warning' : 'success',
      });
    }
    if (connection) {
      items.push({
        id: 'connection',
        icon: connection.state === 'offline' ? <WifiOff size={15} /> : <Wifi size={15} />,
        label: t('controls.lock.connection'),
        value: connection.label,
        tone: connection.state === 'online' ? 'success' : connection.state === 'offline' ? 'danger' : 'neutral',
      });
    }
    return items;
  }, [batteryLevel, connection, t]);
  const isLocked = simulatedState === 'locked' || simulatedState === 'locking';
  const isUnlocked = simulatedState === 'unlocked' || simulatedState === 'open' || simulatedState === 'opening';
  const isOpen = simulatedState === 'open' || simulatedState === 'opening';
  const isTransitioning = simulatedState === 'locking' || simulatedState === 'unlocking' || simulatedState === 'opening';
  const isJammed = simulatedState === 'jammed';
  const isUnavailable = simulatedState === 'unavailable' || simulatedState === 'unknown';
  const canLock = isUnlocked && !isTransitioning && !isUnavailable;
  const canUnlock = isLocked && !isTransitioning && !isUnavailable;
  const canOpen = supportsOpen && !isTransitioning && !isJammed && !isUnavailable;
  const statusLabel = t(`controls.lock.state.${simulatedState}`);
  const HeaderIcon = isJammed || isUnavailable ? AlertTriangle : isOpen ? DoorOpen : isLocked ? Lock : Unlock;

  const pushTimeline = (text: string) => {
    setTimeline((prev) => [
      {
        id: `activity-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        text,
      },
      ...prev,
    ].slice(0, maxTimelineEntries));
  };

  const {
    progress,
    isHolding,
    isSuccessPulse,
    startHold,
    endHold,
  } = useHoldToConfirm({
    enabled: canUnlock,
    durationMs: 1000,
    onComplete: () => {
      const didUnlock = onUnlock();
      if (didUnlock === false) {
        return;
      }
      setSimulatedState('unlocked');
      if (shouldUseLocalTimeline) {
        pushTimeline(t('controls.lock.unlockedBy', { actor: timelineActor, time: formatDate(new Date(), { hour: '2-digit', minute: '2-digit' }) }));
      }
    },
  });

  const ringDashOffset = RING_CIRCUMFERENCE * (1 - progress);

  const panelAuraClass = useMemo(() => {
    if (isJammed) return 'border-rose-200/20 bg-rose-500/12';
    if (isTransitioning) return 'border-sky-200/18 bg-sky-500/10';
    if (isLocked) return 'border-emerald-100/16 bg-emerald-300/8';
    return 'border-orange-200/18 bg-orange-500/12';
  }, [isJammed, isLocked, isTransitioning]);
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

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell}>
      <ContextPanelHeader
        title={lock.name}
        subtitle={statusLabel}
        icon={<HeaderIcon size={21} />}
        fallbackTitle={t('controls.lock.title')}
      />

      <div className={`${CONTEXT_PANEL_LAYOUT.section} mb-1`}>
        <div className="mt-6 flex flex-col items-center">
          <div
            className={`relative flex h-[clamp(8rem,42vw,10rem)] w-[clamp(8rem,42vw,10rem)] items-center justify-center rounded-full border border-[color:var(--ui-border)] ${panelAuraClass} transition-all duration-200 ${
              isHolding ? 'scale-[1.03]' : 'scale-100'
            } ${
              isSuccessPulse
                ? 'shadow-[0_0_0_1px_rgba(74,222,128,0.85),0_0_34px_rgba(74,222,128,0.44)]'
                : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
            }`}
            onMouseDown={(event) => {
              if (!canUnlock) {
                return;
              }
              event.preventDefault();
              startHold();
            }}
            onMouseUp={endHold}
            onMouseLeave={endHold}
            onTouchStart={(event) => {
              if (!canUnlock) {
                return;
              }
              event.preventDefault();
              startHold();
            }}
            onTouchEnd={endHold}
            onTouchCancel={endHold}
            onContextMenu={(event) => event.preventDefault()}
          >
            <svg
              className={`absolute inset-0 transition-opacity duration-150 ${progress > 0 || isHolding ? 'opacity-100' : 'opacity-0'}`}
              viewBox="0 0 150 150"
              fill="none"
            >
              <circle cx="75" cy="75" r={RING_RADIUS} stroke="var(--ui-border-strong)" strokeWidth="6" />
              <circle
                cx="75"
                cy="75"
                r={RING_RADIUS}
                stroke="var(--ui-accent)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringDashOffset}
                transform="rotate(-90 75 75)"
                style={{ transition: isHolding ? 'none' : 'stroke-dashoffset 110ms linear' }}
              />
            </svg>
            <div className="flex h-[clamp(4.6rem,24vw,6rem)] w-[clamp(4.6rem,24vw,6rem)] items-center justify-center rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-primary)] shadow-[inset_0_1px_0_rgb(var(--ui-accent-rgb)/0.12)]">
              <HeaderIcon size={36} />
            </div>
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">
            {canUnlock
              ? t('controls.lock.holdUnlock')
              : canLock
                ? t('controls.lock.readyLock')
                : isJammed
                  ? t('controls.lock.actionRequired')
                  : statusLabel}
          </p>
        </div>

        <div className="dashboard-content-surface-soft mt-6 flex flex-wrap gap-1.5 rounded-3xl p-1.5">
          <button
            type="button"
            onClick={() => {
              if (!canLock) {
                return;
              }
              setSimulatedState('locked');
              onLock(actionCode);
              if (shouldUseLocalTimeline) {
                pushTimeline(t('controls.lock.lockedBy', { actor: timelineActor, time: formatDate(new Date(), { hour: '2-digit', minute: '2-digit' }) }));
              }
            }}
            disabled={!canLock}
            className={`glass-button inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all ${
              canLock
                ? 'text-[color:var(--ui-text-primary)] active:scale-[0.98]'
                : 'cursor-not-allowed text-[color:var(--ui-text-disabled)]'
            }`}
          >
            <Lock size={16} />
            {t('controls.lock.lock')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canUnlock) {
                return;
              }
              const didUnlock = onUnlock();
              if (didUnlock === false) {
                return;
              }
              setSimulatedState('unlocked');
              if (shouldUseLocalTimeline) {
                pushTimeline(t('controls.lock.unlockedBy', { actor: timelineActor, time: formatDate(new Date(), { hour: '2-digit', minute: '2-digit' }) }));
              }
            }}
            disabled={!canUnlock}
            className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-all ${
              canUnlock
                ? 'border-[color:color-mix(in_srgb,var(--ui-danger)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-danger)_14%,transparent)] text-[color:var(--ui-danger)] hover:bg-[color:color-mix(in_srgb,var(--ui-danger)_20%,transparent)] active:scale-[0.98]'
                : 'cursor-not-allowed border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-disabled)]'
            }`}
          >
            <Unlock size={16} />
            {t('controls.lock.unlock')}
          </button>
          {supportsOpen ? (
            <button
              type="button"
              onClick={() => {
                if (!canOpen) {
                  return;
                }
                setSimulatedState('opening');
                onOpen();
                if (shouldUseLocalTimeline) {
                  pushTimeline(t('controls.lock.openedBy', { actor: timelineActor, time: formatDate(new Date(), { hour: '2-digit', minute: '2-digit' }) }));
                }
              }}
              disabled={!canOpen}
              className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-all ${
                canOpen
                  ? 'border-[color:color-mix(in_srgb,var(--ui-warning)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-warning)_13%,transparent)] text-[color:var(--ui-warning)] hover:bg-[color:color-mix(in_srgb,var(--ui-warning)_19%,transparent)] active:scale-[0.98]'
                  : 'cursor-not-allowed border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-disabled)]'
              }`}
            >
              <DoorOpen size={16} />
              {t('controls.lock.open')}
            </button>
          ) : null}
        </div>

      </div>

      <DeviceTelemetryStrip items={telemetryItems} />

      <div className={CONTEXT_PANEL_LAYOUT.sectionCompact}>
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[color:var(--ui-text-secondary)]">{t('controls.lock.recentActivity')}</p>
        <div className="mt-3 space-y-2.5">
          {timeline.length > 0 ? (
            timeline.map((entry) => (
              <div
                key={entry.id}
                className="dashboard-content-surface rounded-2xl px-3.5 py-2.5 text-sm text-[color:var(--ui-text-secondary)]"
              >
                {entry.text}
              </div>
            ))
          ) : (
            <div className="dashboard-content-surface rounded-2xl px-3.5 py-2.5 text-sm text-[color:var(--ui-text-tertiary)]">
              {activityUnavailableMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


