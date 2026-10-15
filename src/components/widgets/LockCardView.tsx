import React from 'react';
import { AlertTriangle, Battery, BatteryLow, DoorOpen, Lock, LockOpen, WifiOff } from 'lucide-react';
import {
  formatLockRelativeTime,
  resolveLockLastActivity,
  resolveLockRingCopy,
  type LockCardLayout,
  type LockCardModel,
} from './lockCardModel';
import { LockRing } from './LockRing';
import type { LockRingOutcome, LockRingStage } from './useLockRingPress';
import './LockCard.css';
import { useI18n } from '../../i18n/I18nProvider';

export type LockCardRingState = {
  lap1: number;
  lap2: number;
  stage: LockRingStage;
  isPressing: boolean;
  isNudging: boolean;
  outcome: LockRingOutcome | null;
  bindings: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;
};

type LockCardViewProps = {
  model: LockCardModel;
  layout: LockCardLayout;
  isSelected: boolean;
  isEditMode: boolean;
  ring: LockCardRingState;
  rootRef?: React.Ref<HTMLDivElement>;
  onOpen: () => void;
  onResetHold: () => void;
};

const ACTIVITY_ICONS = {
  locked: Lock,
  unlocked: LockOpen,
  open: DoorOpen,
  jammed: AlertTriangle,
} as const;

// The short hint fits the small compositions; the larger ones say the whole gesture.
const SHORT_COPY_LAYOUTS = new Set<LockCardLayout>(['row', 'compact', 'tile', 'panorama']);
const EXPANDED_LAYOUTS = new Set<LockCardLayout>(['tall', 'panorama']);

type LockDetail = { id: string; label: string; value: string; tone?: 'open' };

export function LockCardView({
  model,
  layout,
  isSelected,
  isEditMode,
  ring,
  rootRef,
  onOpen,
  onResetHold,
}: LockCardViewProps) {
  const { t, locale } = useI18n();
  const copy = resolveLockRingCopy(model, ring, locale);
  const caption = SHORT_COPY_LAYOUTS.has(layout) ? copy.shortCaption : copy.caption;
  const isExpanded = EXPANDED_LAYOUTS.has(layout);
  // A one-row card has no room for a hint: the name gives way to it while it matters.
  const showsHintInName = layout === 'row' && copy.isHighlighted;
  const activity = resolveLockLastActivity(model, locale);
  const lastChangedLabel = typeof model.lastChangedMs === 'number'
    ? formatLockRelativeTime(model.lastChangedMs, locale)
    : undefined;
  const meta = model.isUnavailable
    ? undefined
    : [model.changedBy, lastChangedLabel].filter(Boolean).join(' · ') || undefined;
  const batteryLow = typeof model.batteryLevel === 'number' && model.batteryLevel <= 20;
  const BatteryIcon = batteryLow ? BatteryLow : Battery;
  const ActivityIcon = ACTIVITY_ICONS[model.state as keyof typeof ACTIVITY_ICONS] ?? WifiOff;
  const details: LockDetail[] = [];
  if (model.doorState) {
    details.push({
      id: 'door',
      label: t('card.lock.door'),
      value: t(model.doorState === 'open' ? 'card.lock.door.open' : 'card.lock.door.closed'),
      tone: model.doorState === 'open' ? 'open' : undefined,
    });
  }
  if (model.autoLock) {
    details.push({
      id: 'auto-lock',
      label: t('card.lock.autoLock'),
      value: !model.autoLock.enabled
        ? t('card.lock.autoLock.off')
        : typeof model.autoLock.delaySeconds === 'number'
          ? t('card.lock.autoLock.after', { seconds: model.autoLock.delaySeconds })
          : t('card.lock.autoLock.on'),
    });
  }
  const captionProps = {
    'data-highlight': copy.isHighlighted ? 'true' : 'false',
    'data-nudge': ring.isNudging && model.state === 'locked' ? 'true' : 'false',
    'aria-live': 'polite' as const,
  };

  return (
    <div
      ref={rootRef}
      className={`lock-card ${isSelected ? 'selection-corners' : ''}`}
      data-lock-state={model.state}
      data-lock-tone={model.tone}
      data-lock-layout={layout}
      data-lock-has-details={details.length > 0 ? 'true' : 'false'}
      data-lock-stage={ring.stage}
      data-lock-pressing={ring.isPressing ? 'true' : 'false'}
      onClick={(event) => {
        if (isEditMode) return;
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`${model.title}, ${model.stateLabel}`}
      aria-busy={model.isTransitioning || undefined}
    >
      <div className="liquid-glass-card lock-card__surface">
        <LockRing
          {...ring.bindings}
          className="lock-card__ring"
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
          title={copy.caption}
        />

        {showsHintInName ? (
          <span className="lock-card__title lock-card__caption" {...captionProps}>{caption}</span>
        ) : (
          <span className="lock-card__title" title={model.title}>{model.title}</span>
        )}

        {layout === 'wide' && meta ? <span className="lock-card__meta">{meta}</span> : null}

        {isExpanded ? (
          typeof model.batteryLevel === 'number' ? (
            <span
              className="lock-card__chip"
              data-tone={batteryLow ? 'warning' : undefined}
              aria-label={t('card.lock.batteryValue', { value: model.batteryLevel })}
            >
              <BatteryIcon size={15} aria-hidden="true" />
              {model.batteryLevel}%
            </span>
          ) : meta ? (
            <span className="lock-card__meta lock-card__meta--corner">{meta}</span>
          ) : null
        ) : null}

        <span className="lock-card__headline">{model.headline}</span>

        {layout !== 'row' ? (
          <span className="lock-card__caption" {...captionProps}>{caption}</span>
        ) : null}

        {isExpanded && details.length > 0 ? (
          <ul className="lock-card__details">
            {details.map((detail) => (
              <li key={detail.id} className="lock-card__detail" data-tone={detail.tone}>
                <span>{detail.label}</span>
                <strong>{detail.value}</strong>
              </li>
            ))}
          </ul>
        ) : null}

        {isExpanded ? (
          <span className="lock-card__activity" data-tone={model.tone}>
            <span className="lock-card__activity-icon" aria-hidden="true">
              <ActivityIcon size={14} />
            </span>
            <span className="lock-card__activity-text">{activity.text}</span>
            {activity.time ? <span className="lock-card__activity-time">{activity.time}</span> : null}
          </span>
        ) : null}
      </div>

      {isEditMode ? (
        <div
          role="button"
          tabIndex={0}
          className="lock-card__edit-handle widget-card-handle cursor-grab"
          onClick={(event) => {
            event.stopPropagation();
            onResetHold();
            onOpen();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onResetHold();
              onOpen();
            }
          }}
          aria-label={t('builder.configureNamed', { name: model.title })}
        />
      ) : null}
    </div>
  );
}
