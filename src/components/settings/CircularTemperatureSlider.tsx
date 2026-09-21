import React, { useRef, useState } from 'react';

const SLIDER_CENTER = 100;
const SLIDER_RADIUS = 74;
const SLIDER_ARC_START = 0.62;
const SLIDER_ARC_END = 0.38;
const SLIDER_ARC_SPAN = 0.76;
const SLIDER_TICK_COUNT = 54;

export function snapTemperatureToStep(value: number, step: number, min: number) {
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }
  const snapped = min + Math.round((value - min) / step) * step;
  const precision = Math.min(Math.max((`${step}`.split('.')[1]?.length ?? 0) + 1, 1), 4);
  return Number(snapped.toFixed(precision));
}

type CircularTemperatureSliderProps = {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  accentColor?: string;
  glowFilter?: string;
  pending?: boolean;
  disabled?: boolean;
  segmentCount?: number;
  className?: string;
  children?: React.ReactNode;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getPointOnSliderArc(progress: number) {
  const normalizedProgress = normalizeProgress(progress);
  const angle = -90 + normalizedProgress * 360;
  const radians = (angle * Math.PI) / 180;
  return {
    x: SLIDER_CENTER + SLIDER_RADIUS * Math.cos(radians),
    y: SLIDER_CENTER + SLIDER_RADIUS * Math.sin(radians),
  };
}

function normalizeProgress(progress: number) {
  return ((progress % 1) + 1) % 1;
}

function getProgressDistanceFromStart(progress: number) {
  return normalizeProgress(progress - SLIDER_ARC_START);
}

function getCircularProgressDistance(first: number, second: number) {
  const distance = Math.abs(normalizeProgress(first) - normalizeProgress(second));
  return Math.min(distance, 1 - distance);
}

function getSliderArcPath(startProgress: number, endProgress: number, sweepFlag: 0 | 1 = 1) {
  const start = getPointOnSliderArc(startProgress);
  const end = getPointOnSliderArc(endProgress);
  const arcDistance =
    sweepFlag === 1
      ? normalizeProgress(endProgress - startProgress)
      : normalizeProgress(startProgress - endProgress);
  const largeArcFlag = arcDistance > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${SLIDER_RADIUS} ${SLIDER_RADIUS} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

function isProgressOnSliderArc(progress: number) {
  return getProgressDistanceFromStart(progress) <= SLIDER_ARC_SPAN;
}

function clampProgressToSliderArc(progress: number) {
  const normalizedProgress = normalizeProgress(progress);
  if (isProgressOnSliderArc(normalizedProgress)) {
    return normalizedProgress;
  }

  const distanceToStart = getCircularProgressDistance(normalizedProgress, SLIDER_ARC_START);
  const distanceToEnd = getCircularProgressDistance(normalizedProgress, SLIDER_ARC_END);
  return distanceToStart <= distanceToEnd ? SLIDER_ARC_START : SLIDER_ARC_END;
}

function getArcProgressFromValue(value: number | undefined, min: number | undefined, max: number | undefined) {
  if (value === undefined || min === undefined || max === undefined || max <= min) {
    return SLIDER_ARC_START;
  }
  const valueProgress = clamp((value - min) / (max - min), 0, 1);
  return normalizeProgress(SLIDER_ARC_START + valueProgress * SLIDER_ARC_SPAN);
}

export function CircularTemperatureSlider({
  value,
  min,
  max,
  step = 0.5,
  unit = '\u00B0C',
  label = 'Temperatura impostata',
  accentColor = '#32D74B',
  glowFilter,
  pending = false,
  disabled = false,
  segmentCount,
  className = '',
  children,
  onChange,
  onCommit,
}: CircularTemperatureSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const lastInteractionValueRef = useRef<number | undefined>(value);
  const canUseSlider = !disabled && min !== undefined && max !== undefined && max > min;
  const snappedValue =
    canUseSlider && value !== undefined ? snapTemperatureToStep(clamp(value, min, max), step, min) : undefined;
  const arcProgress = getArcProgressFromValue(snappedValue, min, max);
  const sliderTrackPath = getSliderArcPath(SLIDER_ARC_START, SLIDER_ARC_END);
  const discreteSegments = segmentCount !== undefined && Number.isFinite(segmentCount) && segmentCount > 1 && segmentCount <= 12
    ? Math.round(segmentCount)
    : 0;
  const activeSegments = discreteSegments && snappedValue !== undefined && min !== undefined && max !== undefined
    ? Math.round(((snappedValue - min) / (max - min)) * discreteSegments)
    : 0;
  const activeArcDistance = getProgressDistanceFromStart(arcProgress);
  const sliderActivePath =
    activeArcDistance > 0.001 ? getSliderArcPath(SLIDER_ARC_START, arcProgress) : null;
  const handlePoint = getPointOnSliderArc(arcProgress);

  const resolveValueFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canUseSlider) {
      return undefined;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
    const rawProgress = ((angle + 90 + 360) % 360) / 360;
    const arc = clampProgressToSliderArc(rawProgress);
    const valueProgress = getProgressDistanceFromStart(arc) / SLIDER_ARC_SPAN;
    return snapTemperatureToStep(min + valueProgress * (max - min), step, min);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canUseSlider || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    const nextValue = resolveValueFromPointer(event);
    if (nextValue !== undefined) {
      lastInteractionValueRef.current = nextValue;
      onChange?.(nextValue);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !canUseSlider) {
      return;
    }
    event.preventDefault();
    const nextValue = resolveValueFromPointer(event);
    if (nextValue !== undefined) {
      lastInteractionValueRef.current = nextValue;
      onChange?.(nextValue);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !canUseSlider) {
      return;
    }
    event.preventDefault();
    const nextValue = lastInteractionValueRef.current;
    if (nextValue !== undefined) {
      onCommit?.(nextValue);
    }
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    lastInteractionValueRef.current = value;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const commitKeyboardValue = (nextValue: number) => {
    if (!canUseSlider) {
      return;
    }
    const snapped = snapTemperatureToStep(clamp(nextValue, min, max), step, min);
    onChange?.(snapped);
    onCommit?.(snapped);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canUseSlider || snappedValue === undefined) {
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      commitKeyboardValue(snappedValue + step);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      commitKeyboardValue(snappedValue - step);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      commitKeyboardValue(min);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      commitKeyboardValue(max);
    }
  };

  return (
    <div
      className={`relative flex aspect-square items-center justify-center select-none ${
        canUseSlider ? 'cursor-grab touch-none active:cursor-grabbing' : ''
      } ${className}`}
      role="slider"
      tabIndex={canUseSlider ? 0 : -1}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={snappedValue}
      aria-valuetext={snappedValue !== undefined ? `${snappedValue}${unit}` : undefined}
      data-slider-segments={discreteSegments || undefined}
      aria-disabled={!canUseSlider}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      style={{ touchAction: 'none' }}
      title={canUseSlider && min !== undefined && max !== undefined ? `Scorri per impostare da ${min}${unit} a ${max}${unit}` : undefined}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 200" aria-hidden="true">
        {!discreteSegments && Array.from({ length: SLIDER_TICK_COUNT }).map((_, index) => {
          const tickProgress = index / SLIDER_TICK_COUNT;
          if (!isProgressOnSliderArc(tickProgress)) {
            return null;
          }
          return (
            <line
              key={`tick-${index}`}
              x1="100"
              y1="21"
              x2="100"
              y2={index % 5 === 0 ? '31' : '27'}
              stroke="var(--ui-border-strong)"
              strokeWidth={index % 5 === 0 ? 1.4 : 0.9}
              strokeLinecap="round"
              transform={`rotate(${(360 / SLIDER_TICK_COUNT) * index} 100 100)`}
            />
          );
        })}
        {discreteSegments ? Array.from({ length: discreteSegments }, (_, index) => {
          const segmentSpan = SLIDER_ARC_SPAN / discreteSegments;
          const gap = Math.min(0.012, segmentSpan * 0.16);
          const start = SLIDER_ARC_START + segmentSpan * index + gap / 2;
          const end = SLIDER_ARC_START + segmentSpan * (index + 1) - gap / 2;
          return <path key={index} d={getSliderArcPath(start, end)} fill="none" stroke={index < activeSegments ? accentColor : 'var(--ui-fill-secondary)'} strokeWidth="18" strokeLinecap="round" style={index < activeSegments ? { filter: glowFilter } : undefined} />;
        }) : <path d={sliderTrackPath} fill="none" stroke="var(--ui-fill-secondary)" strokeWidth="18" strokeLinecap="round" />}
        {!discreteSegments && sliderActivePath ? (
          <path
            d={sliderActivePath}
            fill="none"
            stroke={accentColor}
            strokeWidth="18"
            strokeLinecap="round"
            className="transition-[stroke,filter] duration-200"
            style={{ filter: glowFilter }}
          />
        ) : null}
        <circle
          data-temperature-slider-handle="true"
          cx={handlePoint.x}
          cy={handlePoint.y}
          r="8"
          fill="var(--ui-accent-contrast)"
          stroke="var(--ui-border-strong)"
          strokeWidth="1.5"
          style={{
            transition: 'filter 160ms ease',
            filter: pending
              ? 'drop-shadow(0 0 8px rgba(255,255,255,0.36))'
              : 'drop-shadow(0 4px 10px rgba(0,0,0,0.32)) drop-shadow(0 0 8px rgba(255,255,255,0.22))',
          }}
        />
      </svg>
      {children}
    </div>
  );
}
