import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Blinds, Square } from 'lucide-react';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import GlassSlider from '../ui/GlassSlider';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import {
  COVER_FEATURE_CLOSE,
  COVER_FEATURE_OPEN,
  coverSupportsCloseTilt,
  coverSupportsOpenTilt,
  coverSupportsSetPosition,
  coverSupportsSetTiltPosition,
  coverSupportsStop,
  coverSupportsStopTilt,
  coverSupportsTilt,
  normalizeCoverState,
  resolveCoverPosition,
  resolveCoverPositionAttribute,
  resolveCoverTiltAttribute,
  resolveCoverTiltPosition,
} from '../../utils/coverUtils';
import { ContextPanelHeader } from './ContextPanelHeader';
import { normalizeCoverDeviceClass } from '../widgets/coverCardModel';
import '../widgets/CoverCard.css';
import { useI18n } from '../../i18n/I18nProvider';

type CoverControlsProps = {
  cover: {
    name: string;
    state: string;
    status?: string;
    position?: number;
    tiltPosition?: number;
    supportedFeatures?: number;
    supportsOpen?: boolean;
    supportsClose?: boolean;
    supportsStop?: boolean;
    supportsSetPosition?: boolean;
    supportsOpenTilt?: boolean;
    supportsCloseTilt?: boolean;
    supportsSetTiltPosition?: boolean;
    supportsStopTilt?: boolean;
    rawAttributes?: Record<string, unknown>;
  };
  onOpen: () => void;
  onClose: () => void;
  onStop: () => void;
  onSetPosition?: (position: number) => void;
  onOpenTilt?: () => void;
  onCloseTilt?: () => void;
  onStopTilt?: () => void;
  onSetTiltPosition?: (position: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const TILT_PRESETS = [
  { value: 0, label: '0', ariaLabel: '0 deg' },
  { value: 25, label: '23', ariaLabel: '23 deg' },
  { value: 50, label: '45', ariaLabel: '45 deg' },
  { value: 75, label: '68', ariaLabel: '68 deg' },
  { value: 100, label: '90', ariaLabel: '90 deg' },
];

function findNearestTiltPreset(value: number) {
  return TILT_PRESETS.reduce((nearest, option) =>
    Math.abs(option.value - value) < Math.abs(nearest.value - value) ? option : nearest,
  );
}

export function CoverControls({
  cover,
  onOpen,
  onClose,
  onStop,
  onSetPosition,
  onOpenTilt,
  onCloseTilt,
  onStopTilt,
  onSetTiltPosition,
}: CoverControlsProps) {
  const { t } = useI18n();
  const normalizedState = normalizeCoverState(cover.state);
  const supportedFeatures = cover.supportedFeatures;
  const supportsOpen =
    cover.supportsOpen ??
    (
      supportedFeatures === undefined ||
      supportedFeatures === 0 ||
      (supportedFeatures & COVER_FEATURE_OPEN) !== 0
    );
  const supportsClose =
    cover.supportsClose ??
    (
      supportedFeatures === undefined ||
      supportedFeatures === 0 ||
      (supportedFeatures & COVER_FEATURE_CLOSE) !== 0
    );
  const supportsSetPosition = cover.supportsSetPosition ?? coverSupportsSetPosition(supportedFeatures);
  const supportsStop = cover.supportsStop ?? coverSupportsStop(supportedFeatures);
  const supportsOpenTilt = cover.supportsOpenTilt ?? coverSupportsOpenTilt(supportedFeatures);
  const supportsCloseTilt = cover.supportsCloseTilt ?? coverSupportsCloseTilt(supportedFeatures);
  const supportsSetTiltPosition =
    cover.supportsSetTiltPosition ??
    (
      coverSupportsSetTiltPosition(supportedFeatures) ||
      coverSupportsTilt(supportedFeatures, cover.rawAttributes)
    );
  const supportsStopTilt = cover.supportsStopTilt ?? coverSupportsStopTilt(supportedFeatures);
  const supportsTilt = supportsOpenTilt || supportsCloseTilt || supportsSetTiltPosition || supportsStopTilt;

  const resolvedPosition = resolveCoverPosition(
    normalizedState,
    cover.position ?? resolveCoverPositionAttribute(cover.rawAttributes),
    70,
  );
  const resolvedTiltPosition = resolveCoverTiltPosition(
    cover.tiltPosition ?? resolveCoverTiltAttribute(cover.rawAttributes),
    50,
  );

  const [currentPosition, setCurrentPosition] = useState(resolvedPosition);
  const [tiltPosition, setTiltPosition] = useState(resolvedTiltPosition);

  useEffect(() => {
    setCurrentPosition(resolvedPosition);
  }, [resolvedPosition, cover.name]);

  useEffect(() => {
    setTiltPosition(resolvedTiltPosition);
  }, [resolvedTiltPosition, cover.name]);

  const displayStatus = useMemo(() => {
    const stateKey = ['open', 'closed', 'opening', 'closing', 'stopped', 'unavailable'].includes(normalizedState)
      ? `controls.cover.state.${normalizedState}` as const
      : 'controls.cover.state.unknown';
    return `${t(stateKey)} | ${currentPosition}%`;
  }, [currentPosition, normalizedState, t]);

  const blindCoverage = 100 - currentPosition;
  const tiltDegrees = Math.round((tiltPosition / 100) * 90);
  const isMoving = normalizedState === 'opening' || normalizedState === 'closing';
  const deviceClass = normalizeCoverDeviceClass(
    cover.rawAttributes?.device_class,
    `${cover.name} ${String(cover.rawAttributes?.friendly_name ?? '')}`,
  );
  const visualTone =
    isMoving
      ? 'moving'
      : normalizedState === 'closed'
        ? 'closed'
        : normalizedState === 'unavailable' || normalizedState === 'unknown'
          ? 'offline'
          : 'open';
  const visualMovementClass = normalizedState === 'opening'
    ? 'cover-card__blind--moving cover-card__blind--opening'
    : normalizedState === 'closing'
      ? 'cover-card__blind--moving cover-card__blind--closing'
      : '';
  const visualToneVars = {
    '--cover-card-coverage': `${blindCoverage}%`,
    '--cover-card-position': `${currentPosition}%`,
    '--cover-card-tilt': `${tiltPosition}%`,
  } as React.CSSProperties;
  const activeTiltPreset = findNearestTiltPreset(tiltPosition);

  const handlePositionChange = (nextValue: number) => {
    if (!supportsSetPosition) {
      return;
    }
    const safe = clamp(Math.round(nextValue), 0, 100);
    setCurrentPosition(safe);
    onSetPosition?.(safe);
  };

  const handleTiltChange = (nextValue: number) => {
    if (!supportsTilt) {
      return;
    }
    const safe = clamp(Math.round(nextValue), 0, 100);
    setTiltPosition(safe);
    onSetTiltPosition?.(safe);
  };

  const canUseTiltPreset = (value: number) => {
    if (supportsSetTiltPosition) {
      return true;
    }
    if (value === 0) {
      return supportsCloseTilt;
    }
    if (value === 100) {
      return supportsOpenTilt;
    }
    return false;
  };

  const handleTiltPresetSelect = (value: number) => {
    if (!canUseTiltPreset(value)) {
      return;
    }
    if (supportsSetTiltPosition) {
      handleTiltChange(value);
      return;
    }
    if (value === 0) {
      setTiltPosition(0);
      onCloseTilt?.();
      return;
    }
    if (value === 100) {
      setTiltPosition(100);
      onOpenTilt?.();
    }
  };

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell}>
      <ContextPanelHeader title={cover.name} subtitle={displayStatus} icon={<Blinds size={21} />} fallbackTitle={t('controls.cover.title')} />

      <div className={CONTEXT_PANEL_LAYOUT.section}>
        <div className="grid gap-4">
          <div className="flex justify-center">
            <div
              className="cover-card cover-controls__visual relative aspect-[7/10] w-full max-w-[clamp(12rem,68vw,16.5rem)]"
              data-cover-device={deviceClass}
              data-cover-tone={visualTone}
              style={visualToneVars}
            >
              <span className="cover-card__rail cover-controls__rail">
                <span className="cover-card__frame-glow" />
                <span className={`cover-card__blind ${visualMovementClass}`} />
                <span className="cover-card__handle-line" />

                <GlassSlider
                  variant="overlay"
                  min={0}
                  max={100}
                  value={100 - currentPosition}
                  onChange={(event) => handlePositionChange(100 - Number(event.target.value))}
                  disabled={!supportsSetPosition}
                  className={`absolute inset-0 z-20 opacity-0 appearance-none ${
                    supportsSetPosition ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'
                  } [writing-mode:vertical-lr] [-webkit-appearance:slider-vertical]`}
                  aria-label={t('controls.cover.position')}
                />
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                if (!supportsOpen) {
                  return;
                }
                setCurrentPosition(100);
                onOpen();
              }}
              disabled={!supportsOpen}
              className={`glass-button flex h-12 min-w-0 items-center justify-center rounded-2xl px-2 text-xs font-semibold transition-all active:scale-95 ${
                supportsOpen ? 'text-[color:var(--ui-text-primary)]' : 'cursor-not-allowed text-[color:var(--ui-text-disabled)]'
              }`}
              aria-label={t('controls.cover.open')}
              title={t('controls.cover.open')}
            >
              <ArrowUp size={16} />
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={!supportsStop}
              className={`glass-button flex h-12 min-w-0 items-center justify-center rounded-2xl px-2 text-xs font-semibold transition-all active:scale-95 ${
                supportsStop
                  ? 'text-[color:var(--ui-text-primary)]'
                  : 'cursor-not-allowed text-[color:var(--ui-text-disabled)]'
              }`}
              aria-label={t('controls.cover.stop')}
              title={t('controls.cover.stop')}
            >
              <Square size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!supportsClose) {
                  return;
                }
                setCurrentPosition(0);
                onClose();
              }}
              disabled={!supportsClose}
              className={`glass-button flex h-12 min-w-0 items-center justify-center rounded-2xl px-2 text-xs font-semibold transition-all active:scale-95 ${
                supportsClose ? 'text-[color:var(--ui-text-primary)]' : 'cursor-not-allowed text-[color:var(--ui-text-disabled)]'
              }`}
              aria-label={t('controls.cover.close')}
              title={t('controls.cover.close')}
            >
              <ArrowDown size={16} />
            </button>
          </div>

          {supportsTilt ? (
            <div className="dashboard-content-surface-soft rounded-[1.65rem] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.cover.tilt')}</p>
                </div>
                {supportsStopTilt ? (
                  <button
                    type="button"
                    onClick={onStopTilt}
                    className="glass-button flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-all active:scale-95"
                    aria-label={t('controls.cover.stopTilt')}
                    title={t('controls.cover.stopTilt')}
                  >
                    <Square size={13} />
                  </button>
                ) : null}
              </div>

              <GlassSegmentSelect
                ariaLabel={t('controls.cover.tilt')}
                minOptionWidth="2rem"
                options={TILT_PRESETS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  ariaLabel: t('controls.cover.setTilt', { degrees: option.ariaLabel }),
                  disabled: !canUseTiltPreset(option.value),
                }))}
                value={activeTiltPreset.value}
                onChange={handleTiltPresetSelect}
                optionClassName="px-2"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
