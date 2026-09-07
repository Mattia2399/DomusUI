import React, { useMemo } from 'react';
import type { SensorCardModel, SensorTrendDirection } from './sensorCardModel';
import './SensorCard.css';
import { useI18n } from '../../i18n/I18nProvider';

type SensorCardViewProps = {
  model: SensorCardModel;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  rootRef?: React.Ref<HTMLDivElement>;
};

function SensorStatusGlyph({ activeBars }: { activeBars: number }) {
  return (
    <svg viewBox="0 0 20 20" className="sensor-card__status-glyph" fill="none" aria-hidden="true">
      {[
        { x: 1.5, y: 12.5, height: 6 },
        { x: 8.1, y: 9.2, height: 9.3 },
        { x: 14.7, y: 5.2, height: 13.3 },
      ].map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width="2.5"
          height={bar.height}
          rx="1.2"
          fill="currentColor"
          opacity={index < activeBars ? 1 : 0.2}
        />
      ))}
    </svg>
  );
}

function TrendIcon({ direction }: { direction: SensorTrendDirection }) {
  if (direction === 'up') return <span aria-hidden="true">↗</span>;
  if (direction === 'down') return <span aria-hidden="true">↘</span>;
  if (direction === 'stable') return <span aria-hidden="true">→</span>;
  return <span aria-hidden="true">•</span>;
}

function buildSparklinePoints(history: number[]) {
  if (history.length < 2) return '';
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = Math.max(0.001, max - min);
  return history
    .map((value, index) => {
      const x = (index / Math.max(1, history.length - 1)) * 100;
      const y = 28 - ((value - min) / span) * 24;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function SensorCardView({
  model,
  isSelected,
  isEditMode,
  onClick,
  rootRef,
}: SensorCardViewProps) {
  const { t } = useI18n();
  const sparklinePoints = useMemo(() => buildSparklinePoints(model.history), [model.history]);
  const levelPosition = `${(model.levelRatio * 100).toFixed(1)}%`;
  const rootStyle = {
    '--sensor-level-position': levelPosition,
  } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      className="sensor-card"
      data-sensor-group={model.visualGroup}
      data-sensor-level={model.level}
      data-sensor-available={model.available ? 'true' : 'false'}
      style={rootStyle}
    >
      <div className={`liquid-glass-card sensor-card__surface ${isSelected ? 'selection-corners' : ''}`}>
        <p className="sensor-card__title" title={model.title}>
          {model.title}
        </p>

        <div
          className="sensor-card__status"
          title={model.status.label}
          aria-label={model.status.label}
          style={model.status.color ? { color: model.status.color } : undefined}
        >
          <SensorStatusGlyph activeBars={model.status.activeBars} />
        </div>

        <div className="sensor-card__value" aria-label={`${model.valueText}${model.unit ? ` ${model.unit}` : ''}`}>
          <span className="sensor-card__value-text sensor-card__value-text--compact" aria-hidden="true">
            {model.compactValueText}
          </span>
          <span className="sensor-card__value-text sensor-card__value-text--full" aria-hidden="true">
            {model.valueText}
          </span>
          {model.unit ? (
            <span className="sensor-card__unit" title={model.unit}>
              {model.unit}
            </span>
          ) : null}
        </div>

        <div className="sensor-card__trend" data-trend={model.trend.direction}>
          <span className="sensor-card__trend-icon">
            <TrendIcon direction={model.trend.direction} />
          </span>
          <span className="sensor-card__trend-label">{model.trend.label}</span>
          {model.trend.deltaText ? <span className="sensor-card__trend-delta">{model.trend.deltaText}</span> : null}
        </div>

        <div className="sensor-card__visual" data-visualization={model.visualization}>
          <div className="sensor-card__visual-labels">
            <span>Min {model.range.minText}</span>
            <span>Max {model.range.maxText}</span>
          </div>
          <div className="sensor-card__visual-plot">
            {model.visualization === 'sparkline' ? (
              <svg
                className="sensor-card__sparkline"
                viewBox="0 0 100 32"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline points={sparklinePoints} fill="none" vectorEffect="non-scaling-stroke" />
              </svg>
            ) : (
              <div className="sensor-card__range-fill" />
            )}
            <span className="sensor-card__current-marker" />
          </div>
        </div>

        <div className="sensor-card__stats" aria-label="Statistiche sensore">
          <span><small>{t('card.sensor.minimum')}</small><strong>{model.stats.minText}</strong></span>
          <span><small>{t('card.sensor.average')}</small><strong>{model.stats.averageText}</strong></span>
          <span><small>{t('card.sensor.maximum')}</small><strong>{model.stats.maxText}</strong></span>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }
        }}
        className={`sensor-card__handle widget-card-handle ${isEditMode ? 'cursor-grab' : 'cursor-pointer'}`}
        aria-label={t('card.open', { name: model.title })}
      />
    </div>
  );
}
