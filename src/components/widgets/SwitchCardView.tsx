import React from 'react';
import {
  Droplets,
  Fan,
  Flame,
  Lightbulb,
  Monitor,
  Plug,
  Power,
  Router,
  Sprout,
  ToggleRight,
  Tv,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { SwitchCardModel, SwitchDeviceIcon } from './switchCardModel';
import './SwitchCard.css';
import { useI18n } from '../../i18n/I18nProvider';

type SwitchCardViewProps = {
  model: SwitchCardModel;
  isSelected: boolean;
  isEditMode: boolean;
  onToggle: () => void;
  onOpen: () => void;
  rootRef?: React.Ref<HTMLDivElement>;
};

const SWITCH_ICON_MAP: Record<SwitchDeviceIcon, LucideIcon> = {
  power: Power,
  plug: Plug,
  toggle: ToggleRight,
  fan: Fan,
  light: Lightbulb,
  irrigation: Sprout,
  water: Droplets,
  heater: Flame,
  tv: Tv,
  monitor: Monitor,
  router: Router,
  pool: Waves,
};

export function SwitchCardView({
  model,
  isSelected,
  isEditMode,
  onToggle,
  onOpen,
  rootRef,
}: SwitchCardViewProps) {
  const { t } = useI18n();
  const DeviceIcon = SWITCH_ICON_MAP[model.deviceIcon];
  const canToggle = !isEditMode && model.available && !model.pending;

  const handleSurfaceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canToggle || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  };

  return (
    <div
      ref={rootRef}
      className="switch-card"
      data-switch-state={model.available ? (model.isOn ? 'on' : 'off') : 'unavailable'}
      data-switch-pending={model.pending ? 'true' : 'false'}
      data-switch-has-consumption={model.consumption.available ? 'true' : 'false'}
    >
      <div
        className={`liquid-glass-card switch-card__surface ${isSelected ? 'selection-corners' : ''}`}
        role={!isEditMode ? 'switch' : undefined}
        tabIndex={canToggle ? 0 : undefined}
        aria-checked={!isEditMode ? model.isOn : undefined}
        aria-disabled={!isEditMode && !canToggle ? true : undefined}
        aria-busy={model.pending || undefined}
        onClick={canToggle ? onToggle : undefined}
        onKeyDown={handleSurfaceKeyDown}
      >
        <span className={`switch-card__icon-shell ${model.pending ? 'switch-card__icon-shell--pending' : ''}`} aria-hidden="true">
          <DeviceIcon className="switch-card__icon" />
        </span>

        <span className="switch-card__meta">
          <span className="switch-card__title" title={model.title}>{model.title}</span>
          <span className="switch-card__status switch-card__status--base">{model.statusLabel}</span>
          <span className="switch-card__status switch-card__status--compact">{model.compactStatusLabel}</span>
        </span>

        <span className="switch-card__state-indicator" aria-hidden="true">
          <span className="switch-card__state-dot" />
        </span>

        <span className="switch-card__consumption" aria-label={`${model.consumption.label}: ${model.consumption.combinedText}`}>
          <small>{model.consumption.label}</small>
          <span className="switch-card__consumption-value">
            <strong>{model.consumption.valueText}</strong>
            {model.consumption.unit ? <span>{model.consumption.unit}</span> : null}
          </span>
          {model.consumption.helperText ? (
            <span className="switch-card__consumption-helper">{model.consumption.helperText}</span>
          ) : null}
        </span>
      </div>

      {isEditMode ? (
        <div
          role="button"
          tabIndex={0}
          className="switch-card__edit-handle widget-card-handle cursor-grab"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onOpen();
            }
          }}
          aria-label={t('builder.configureNamed', { name: model.title })}
        />
      ) : null}
    </div>
  );
}
