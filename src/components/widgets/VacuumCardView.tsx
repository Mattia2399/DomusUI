import React from 'react';
import { AlertTriangle, Battery, Bot, Home, Pause, Play, RotateCw, Square } from 'lucide-react';
import type { VacuumCardModel } from './vacuumCardModel';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import './VacuumCard.css';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';

const VACUUM_STATE_KEYS: Record<VacuumCardModel['state'], TranslationKey> = {
  docked: 'vacuum.state.docked', cleaning: 'vacuum.state.cleaning', paused: 'vacuum.state.paused',
  error: 'vacuum.state.error', returning: 'vacuum.state.returning', idle: 'vacuum.state.idle',
  unavailable: 'vacuum.state.unavailable', unknown: 'vacuum.state.unknown',
};
const VACUUM_ACTION_KEYS: Record<VacuumCardModel['primaryAction'], TranslationKey> = {
  start: 'vacuum.action.start', pause: 'vacuum.action.pause', resume: 'vacuum.action.resume',
  details: 'vacuum.action.error', none: 'vacuum.action.unavailable',
};

type VacuumCardViewProps = {
  model: VacuumCardModel;
  layoutVariant: WidgetDisplayVariant;
  isSelected: boolean;
  isEditMode: boolean;
  rootRef?: React.Ref<HTMLDivElement>;
  onOpen: () => void;
  onStartPause?: () => void;
  onStop?: () => void;
  onReturnToBase?: () => void;
};

function PrimaryIcon({ model }: { model: VacuumCardModel }) {
  if (model.primaryAction === 'pause') return <Pause size={15} />;
  if (model.primaryAction === 'details') return <AlertTriangle size={15} />;
  if (model.primaryAction === 'start' || model.primaryAction === 'resume') return <Play size={15} />;
  if (model.state === 'returning') return <RotateCw size={15} />;
  return <Bot size={15} />;
}

export function VacuumCardView({
  model,
  layoutVariant,
  isSelected,
  isEditMode,
  rootRef,
  onOpen,
  onStartPause,
  onStop,
  onReturnToBase,
}: VacuumCardViewProps) {
  const { t } = useI18n();
  const stateLabel = t(VACUUM_STATE_KEYS[model.state]);
  const primaryActionLabel = model.primaryAction === 'none'
    ? model.state === 'cleaning' ? t('vacuum.action.cleaning')
      : model.state === 'paused' ? t('vacuum.state.paused')
        : model.state === 'returning' ? t('vacuum.action.returning')
          : model.primaryActionEnabled ? t('vacuum.action.controls') : t('vacuum.action.unavailable')
    : t(VACUUM_ACTION_KEYS[model.primaryAction]);
  const handlePrimaryAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isEditMode || !model.primaryActionEnabled) return;
    if (model.primaryAction === 'details' || model.primaryAction === 'none') {
      onOpen();
      return;
    }
    onStartPause?.();
  };

  const stats = [
    model.cleanedAreaLabel ? { label: t('vacuum.stat.area'), value: model.cleanedAreaLabel } : null,
    model.cleaningTimeLabel ? { label: t('vacuum.stat.time'), value: model.cleaningTimeLabel } : null,
    model.fanSpeedLabel ? { label: t('vacuum.stat.power'), value: model.fanSpeedLabel } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  return (
    <div
      ref={rootRef}
      className={`vacuum-card ${isSelected ? 'selection-corners' : ''}`}
      data-vacuum-variant={layoutVariant}
      data-vacuum-tone={model.tone}
      data-vacuum-state={model.state}
      data-command-pending={model.commandPending ? 'true' : 'false'}
      aria-busy={model.commandPending || undefined}
      data-vacuum-map={model.mapUrl ? 'true' : 'false'}
      onClick={(event) => {
        if (isEditMode) return;
        event.stopPropagation();
        onOpen();
      }}
    >
      <div className="vacuum-card__surface">
        <div className="vacuum-card__glow" aria-hidden="true" />

        <div className="vacuum-card__meta">
          <p className="vacuum-card__title">{model.title}</p>
          <p className="vacuum-card__subtitle">{model.state === 'error' && model.errorLabel ? model.errorLabel : stateLabel}</p>
        </div>

        {model.batteryLevel !== undefined ? (
          <div className="vacuum-card__battery" aria-label={`${t('vacuum.stat.battery')} ${model.batteryLevel}%`}>
            <Battery size={11} />
            <span>{model.batteryLevel}%</span>
          </div>
        ) : null}

        <div className="vacuum-card__visual" aria-hidden="true">
          {model.mapUrl ? <img src={model.mapUrl} alt="" className="vacuum-card__map" /> : null}
          <div className="vacuum-card__floor" />
          <div className="vacuum-card__route vacuum-card__route--one" />
          <div className="vacuum-card__route vacuum-card__route--two" />
          <div className="vacuum-card__robot">
            <span className="vacuum-card__robot-sensor" />
            <Bot size={18} />
          </div>
        </div>

        {stats.length > 0 ? (
          <div className="vacuum-card__stats">
            {stats.slice(0, 3).map((item) => (
              <div key={item.label} className="vacuum-card__stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <div className="vacuum-card__controls">
          <button
            type="button"
            className="vacuum-card__primary"
            disabled={!model.primaryActionEnabled}
            onClick={handlePrimaryAction}
            aria-label={`${primaryActionLabel}: ${model.title}`}
          >
            <PrimaryIcon model={model} />
            <span>{primaryActionLabel}</span>
          </button>

          {(layoutVariant === 'standard' || layoutVariant === 'full') && model.supportsReturnHome ? (
            <button
              type="button"
              className="vacuum-card__secondary"
              disabled={!model.isAvailable || model.state === 'docked'}
              onClick={(event) => {
                event.stopPropagation();
                if (!isEditMode) onReturnToBase?.();
              }}
              aria-label={t('vacuum.action.returnHome', { name: model.title })}
            >
              <Home size={15} />
              <span>{t('vacuum.action.base')}</span>
            </button>
          ) : null}

          {layoutVariant === 'full' && model.supportsStop ? (
            <button
              type="button"
              className="vacuum-card__secondary"
              disabled={!model.isAvailable || !model.isActive}
              onClick={(event) => {
                event.stopPropagation();
                if (!isEditMode) onStop?.();
              }}
              aria-label={t('vacuum.action.stopAria', { name: model.title })}
            >
              <Square size={13} />
              <span>{t('vacuum.action.stop')}</span>
            </button>
          ) : null}
        </div>
      </div>

      {isEditMode ? (
        <div
          role="button"
          tabIndex={0}
          className="vacuum-card__edit-handle widget-card-handle"
          aria-label={t('vacuum.action.open', { name: model.title })}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen();
            }
          }}
        />
      ) : null}
    </div>
  );
}
