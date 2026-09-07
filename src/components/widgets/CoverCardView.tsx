import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Blinds, DoorOpen, SlidersHorizontal, Square } from 'lucide-react';
import GlassSlider from '../ui/GlassSlider';
import type { CoverCardModel } from './coverCardModel';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import './CoverCard.css';
import { useI18n } from '../../i18n/I18nProvider';

type CoverCardViewProps = {
  model: CoverCardModel;
  layoutVariant: WidgetDisplayVariant;
  isSelected: boolean;
  isEditMode: boolean;
  rootRef?: React.Ref<HTMLDivElement>;
  onOpen: () => void;
  onPositionChange?: (position: number) => void;
  onTiltPositionChange?: (position: number) => void;
  onOpenCover?: () => void;
  onStopCover?: () => void;
  onCloseCover?: () => void;
};

type CoverCardControlMode = 'position' | 'tilt';

const COVER_POSITION_STEP = 10;

const TILT_PRESETS = [
  { value: 0, label: '0', ariaLabel: '0 gradi' },
  { value: 25, label: '23', ariaLabel: '23 gradi' },
  { value: 50, label: '45', ariaLabel: '45 gradi' },
  { value: 75, label: '68', ariaLabel: '68 gradi' },
  { value: 100, label: '90', ariaLabel: '90 gradi' },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function snapPosition(value: number) {
  return clamp(Math.round(value / COVER_POSITION_STEP) * COVER_POSITION_STEP, 0, 100);
}

function findNearestTiltPreset(value: number) {
  return TILT_PRESETS.reduce((nearest, option) =>
    Math.abs(option.value - value) < Math.abs(nearest.value - value) ? option : nearest,
  );
}

function resolveDeviceIcon(model: CoverCardModel) {
  if (model.deviceClass === 'door' || model.deviceClass === 'garage' || model.deviceClass === 'gate' || model.deviceClass === 'window') {
    return DoorOpen;
  }
  if (model.deviceClass === 'damper') {
    return Square;
  }
  return Blinds;
}

export function CoverCardView({
  model,
  layoutVariant,
  isSelected,
  isEditMode,
  rootRef,
  onOpen,
  onPositionChange,
  onTiltPositionChange,
  onOpenCover,
  onStopCover,
  onCloseCover,
}: CoverCardViewProps) {
  const { t } = useI18n();
  const [controlMode, setControlMode] = useState<CoverCardControlMode>('position');
  const [draftPosition, setDraftPosition] = useState<number | null>(null);
  const pointerActiveRef = useRef(false);
  const skipNextBlurCommitRef = useRef(false);
  const DeviceIcon = resolveDeviceIcon(model);
  const canUsePosition = model.isAvailable && model.supportsSetPosition && Boolean(onPositionChange);
  const canUseTilt = model.isAvailable && model.hasTilt && model.supportsSetTiltPosition && Boolean(onTiltPositionChange);
  const usesStackedControls = canUseTilt && (layoutVariant === 'standard' || layoutVariant === 'full');
  const usesQuickActions = layoutVariant === 'full';
  const canOpenCover = model.isAvailable && model.supportsOpen && Boolean(onOpenCover);
  const canStopCover = model.isAvailable && model.supportsStop && Boolean(onStopCover);
  const canCloseCover = model.isAvailable && model.supportsClose && Boolean(onCloseCover);
  const activeTiltPreset = findNearestTiltPreset(model.tiltPosition);
  const sliderValue = draftPosition ?? snapPosition(model.position);
  const sliderCoverage = clamp(100 - sliderValue, 0, 100);
  const sliderInputValue = sliderCoverage;
  const positionFromSliderInput = (value: number) => snapPosition(100 - value);
  const visualMovementClass = model.state === 'opening'
    ? 'cover-card__blind--moving cover-card__blind--opening'
    : model.state === 'closing'
      ? 'cover-card__blind--moving cover-card__blind--closing'
      : '';
  const style = useMemo(
    () => ({
      '--cover-card-position': `${model.position}%`,
      '--cover-card-coverage': `${model.coverage}%`,
      '--cover-card-tilt': `${model.tiltPosition}%`,
      '--cover-slider-coverage': `${sliderCoverage}%`,
    }) as React.CSSProperties,
    [model.coverage, model.position, model.tiltPosition, sliderCoverage],
  );
  const subtitle =
    model.isAvailable
      ? `${model.stateLabel} • ${t('card.openingPercent', { value: model.position })}`
      : model.stateLabel;

  useEffect(() => {
    if (!canUseTilt && controlMode === 'tilt') {
      setControlMode('position');
    }
  }, [canUseTilt, controlMode]);

  useEffect(() => {
    if (!pointerActiveRef.current) {
      setDraftPosition(null);
    }
  }, [model.position]);

  const commitPosition = (rawValue: number) => {
    const nextPosition = snapPosition(rawValue);
    setDraftPosition(nextPosition);
    onPositionChange?.(nextPosition);
  };

  const renderTiltSegments = () => (
    <div className="cover-card__tilt-segments" role="group" aria-label={t('card.editTilt', { name: model.title })}>
      {TILT_PRESETS.map((option) => {
        const active = option.value === activeTiltPreset.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`cover-card__tilt-option ${active ? 'cover-card__tilt-option--active' : ''}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onTiltPositionChange?.(option.value);
            }}
            aria-pressed={active}
            aria-label={t('controls.cover.setTilt', { degrees: option.ariaLabel })}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const renderPositionSlider = () => (
    <div className="cover-card__cover-slider">
      <span className={`cover-card__cover-slider-fill ${visualMovementClass}`} aria-hidden="true" />
      <span className="cover-card__cover-slider-handle" aria-hidden="true" />
      <GlassSlider
        variant="overlay"
        className="cover-card__cover-range"
        min={0}
        max={100}
        step={COVER_POSITION_STEP}
        value={sliderInputValue}
        disabled={!canUsePosition}
        aria-label={t('card.editPositionAria', { name: model.title })}
        aria-valuetext={t('card.openingPercent', { value: sliderValue })}
        onPointerDown={(event) => {
          event.stopPropagation();
          pointerActiveRef.current = true;
          setDraftPosition(positionFromSliderInput(Number(event.currentTarget.value)));
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          pointerActiveRef.current = false;
          commitPosition(positionFromSliderInput(Number(event.currentTarget.value)));
          skipNextBlurCommitRef.current = true;
        }}
        onPointerCancel={(event) => {
          event.stopPropagation();
          pointerActiveRef.current = false;
          setDraftPosition(null);
        }}
        onChange={(event) => setDraftPosition(positionFromSliderInput(Number(event.currentTarget.value)))}
        onClick={(event) => event.stopPropagation()}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            commitPosition(positionFromSliderInput(Number(event.currentTarget.value)));
          }
        }}
        onBlur={(event) => {
          if (skipNextBlurCommitRef.current) {
            skipNextBlurCommitRef.current = false;
            return;
          }
          if (draftPosition !== null && !pointerActiveRef.current) {
            commitPosition(positionFromSliderInput(Number(event.currentTarget.value)));
          }
        }}
      />
    </div>
  );

  const renderQuickActions = () => (
    <div className="cover-card__quick-actions" role="group" aria-label={t('card.quickCommands', { name: model.title })}>
      <button
        type="button"
        className="cover-card__quick-action"
        disabled={!canOpenCover}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onOpenCover?.();
        }}
      >
        {t('controls.cover.open')}
      </button>
      <button
        type="button"
        className="cover-card__quick-action cover-card__quick-action--stop"
        disabled={!canStopCover}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onStopCover?.();
        }}
      >
        {t('controls.cover.stop')}
      </button>
      <button
        type="button"
        className="cover-card__quick-action"
        disabled={!canCloseCover}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onCloseCover?.();
        }}
      >
        {t('controls.cover.close')}
      </button>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`cover-card ${isSelected ? 'selection-corners' : ''}`}
      data-cover-state={model.state}
      data-cover-tone={model.tone}
      data-cover-variant={layoutVariant}
      data-cover-device={model.deviceClass}
      data-cover-available={model.isAvailable ? 'true' : 'false'}
      data-cover-tilt={model.hasTilt ? 'true' : 'false'}
      data-cover-control-mode={controlMode}
      data-cover-pending={model.pending ? 'true' : 'false'}
      style={style}
      onClick={(event) => {
        if (isEditMode) return;
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`${model.title}, ${model.stateLabel}, ${model.position}%`}
      aria-busy={model.isMoving || model.pending || undefined}
    >
      <div className="liquid-glass-card cover-card__surface">
        <span className="cover-card__icon-shell" aria-hidden="true">
          <DeviceIcon className="cover-card__icon" />
        </span>

        <span className="cover-card__meta">
          <span className="cover-card__title" title={model.title}>{model.title}</span>
          <span className="cover-card__subtitle" title={subtitle}>{subtitle}</span>
        </span>

        {canUseTilt && !usesStackedControls ? (
          <button
            type="button"
            className="cover-card__mode-button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setDraftPosition(null);
              setControlMode((current) => current === 'position' ? 'tilt' : 'position');
            }}
            aria-label={t(controlMode === 'position' ? 'card.editSlats' : 'card.editPosition')}
            title={controlMode === 'position' ? t('card.slats') : t('card.cover.position')}
          >
            {controlMode === 'position' ? <Blinds /> : <SlidersHorizontal />}
            <span className="cover-card__mode-label">
              {controlMode === 'position' ? t('card.slats') : t('card.cover.position')}
            </span>
          </button>
        ) : null}

        <div
          className={`cover-card__controls ${usesStackedControls ? 'cover-card__controls--stacked' : ''} ${
            usesQuickActions ? 'cover-card__controls--with-actions' : ''
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {usesStackedControls ? (
            <>
              {renderTiltSegments()}
              {renderPositionSlider()}
              {usesQuickActions ? renderQuickActions() : null}
            </>
          ) : controlMode === 'tilt' && canUseTilt ? (
            renderTiltSegments()
          ) : (
            <>
              {renderPositionSlider()}
              {usesQuickActions ? renderQuickActions() : null}
            </>
          )}
        </div>
      </div>

      {isEditMode ? (
        <div
          role="button"
          tabIndex={0}
          className="cover-card__edit-handle widget-card-handle cursor-grab"
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
          aria-label={t('card.configure', { name: model.title })}
        />
      ) : null}
    </div>
  );
}
