import React from 'react';
import { AlertTriangle, Battery, BatteryLow, DoorOpen, Lock, LockOpen, WifiOff } from 'lucide-react';
import {
  formatLockRelativeTime,
  resolveLockLastActivity,
  resolveLockRingCopy,
  type LockCardModel,
} from './lockCardModel';
import { LockRing } from './LockRing';
import type { LockRingOutcome, LockRingStage } from './useLockRingPress';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
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
  layoutVariant: WidgetDisplayVariant;
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

type LockDetail = { id: string; label: string; value: string; tone?: 'open' | 'warning' };

export function LockCardView({
  model,
  layoutVariant,
  isSelected,
  isEditMode,
  ring,
  rootRef,
  onOpen,
  onResetHold,
}: LockCardViewProps) {
  const { t, locale } = useI18n();
  const copy = resolveLockRingCopy(model, ring, locale);
  const isSmall = layoutVariant === 'mini' || layoutVariant === 'compact';
  const isFull = layoutVariant === 'full';
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
  const lockRing = (
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
  );

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
      data-lock-variant={layoutVariant}
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
        {isSmall ? (
          <div className="lock-card__small">
            {lockRing}
            <span className="lock-card__text">
              <span className="lock-card__title" title={model.title}>{model.title}</span>
              <span className="lock-card__headline">{model.headline}</span>
              <span className="lock-card__caption" {...captionProps}>{copy.shortCaption}</span>
            </span>
          </div>
        ) : null}

        {layoutVariant === 'standard' ? (
          <>
            <div className="lock-card__header">
              <span className="lock-card__title" title={model.title}>{model.title}</span>
              {meta ? <span className="lock-card__meta">{meta}</span> : null}
            </div>
            <div className="lock-card__body">
              {lockRing}
              <span className="lock-card__text">
                <span className="lock-card__headline">{model.headline}</span>
                <span className="lock-card__caption" {...captionProps}>{copy.caption}</span>
              </span>
            </div>
          </>
        ) : null}

        {isFull ? (
          <>
            <div className="lock-card__header">
              <span className="lock-card__title" title={model.title}>{model.title}</span>
              {typeof model.batteryLevel === 'number' ? (
                <span
                  className="lock-card__chip"
                  data-tone={batteryLow ? 'warning' : undefined}
                  aria-label={t('card.lock.batteryValue', { value: model.batteryLevel })}
                >
                  <BatteryIcon size={15} aria-hidden="true" />
                  {model.batteryLevel}%
                </span>
              ) : meta ? (
                <span className="lock-card__meta">{meta}</span>
              ) : null}
            </div>
            <div className="lock-card__hero">
              {lockRing}
              <span className="lock-card__text">
                <span className="lock-card__headline">{model.headline}</span>
                <span className="lock-card__caption" {...captionProps}>{copy.caption}</span>
              </span>
            </div>
            <div className="lock-card__extra">
              {details.length > 0 ? (
                <ul className="lock-card__details">
                  {details.map((detail) => (
                    <li key={detail.id} className="lock-card__detail" data-tone={detail.tone}>
                      <span>{detail.label}</span>
                      <strong>{detail.value}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="lock-card__activity">
                <span className="lock-card__section-title">{t('card.lock.lastActivity')}</span>
                <span className="lock-card__activity-row" data-tone={model.tone}>
                  <span className="lock-card__activity-icon" aria-hidden="true">
                    <ActivityIcon size={14} />
                  </span>
                  <span className="lock-card__activity-text">{activity.text}</span>
                  {activity.time ? <span className="lock-card__activity-time">{activity.time}</span> : null}
                </span>
              </div>
            </div>
          </>
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
