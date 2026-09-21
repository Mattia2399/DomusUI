import React from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { BinarySensorGlyph } from './BinarySensorGlyph';
import type { resolveBinarySensorPresentation } from './binarySensorPresentation';
import './SensorCard.css';

type BinarySensorCardViewProps = {
  title: string;
  presentation: ReturnType<typeof resolveBinarySensorPresentation>;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  rootRef?: React.Ref<HTMLDivElement>;
};

export function BinarySensorCardView({
  title,
  presentation,
  isSelected,
  isEditMode,
  onClick,
  rootRef,
}: BinarySensorCardViewProps) {
  const { t } = useI18n();
  return (
    <div ref={rootRef} className="sensor-card binary-sensor-card" data-binary-state={presentation.state} data-binary-tone={presentation.tone}>
      <div className={`liquid-glass-card binary-sensor-card__surface ${isSelected ? 'selection-corners' : ''}`}>
        <span className="binary-sensor-card__icon"><BinarySensorGlyph icon={presentation.icon} state={presentation.state} size={20} /></span>
        <span className="binary-sensor-card__content">
          <span className="binary-sensor-card__title" title={title}>{title}</span>
          <span className="binary-sensor-card__state" title={presentation.label}>{presentation.label}</span>
        </span>
        <span className="binary-sensor-card__indicator" aria-hidden="true" />
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => { event.stopPropagation(); onClick(); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }
        }}
        className={`sensor-card__handle widget-card-handle ${isEditMode ? 'cursor-grab' : 'cursor-pointer'}`}
        aria-label={`${t('card.open', { name: title })}: ${presentation.label}`}
      />
    </div>
  );
}
