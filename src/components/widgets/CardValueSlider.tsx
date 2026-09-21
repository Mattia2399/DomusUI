import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import GlassSlider from '../ui/GlassSlider';
import './CardValueSlider.css';

type Props = {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  valueText: string;
  disabled?: boolean;
  tone: 'fan' | 'humidity';
  segmentCount?: number;
  markerValue?: number;
  snap: (value: number) => number;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onCancel: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function CardValueSlider({
  value, min, max, step, label, valueText, disabled = false, tone, segmentCount,
  markerValue, snap, onPreview, onCommit, onCancel,
}: Props) {
  const pointerActiveRef = useRef(false);
  const skipNextBlurRef = useRef(false);
  const safeValue = clamp(value, min, max);
  const range = Math.max(1, max - min);
  const progress = ((safeValue - min) / range) * 100;
  const markerProgress = markerValue === undefined ? undefined : ((clamp(markerValue, min, max) - min) / range) * 100;
  const discreteSegments = segmentCount !== undefined && segmentCount > 1 && segmentCount <= 12
    ? Math.round(segmentCount)
    : 0;
  const style = {
    '--card-value-progress': `${progress}%`,
    '--card-value-marker': `${markerProgress ?? 0}%`,
    '--card-value-segments': discreteSegments,
  } as CSSProperties;

  const commit = (raw: number) => {
    const next = snap(clamp(raw, min, max));
    onPreview(next);
    onCommit(next);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    let next: number;
    if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    else if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1;
      const keyboardStep = discreteSegments ? range / discreteSegments : step;
      next = safeValue + direction * keyboardStep;
    } else return;
    event.preventDefault();
    commit(next);
    skipNextBlurRef.current = true;
  };

  return (
    <div className="card-value-slider card-control-track" data-tone={tone} data-segmented={discreteSegments ? 'true' : 'false'} style={style}>
      <span className="card-value-slider__fill" aria-hidden="true" />
      {discreteSegments ? <span className="card-value-slider__segments" aria-hidden="true" /> : null}
      {markerProgress !== undefined ? <span className="card-value-slider__marker" aria-hidden="true" /> : null}
      <span className="card-value-slider__handle" aria-hidden="true" />
      <GlassSlider
        variant="overlay"
        className="card-value-slider__input"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        disabled={disabled || max <= min}
        aria-label={label}
        aria-valuetext={valueText}
        onPointerDown={(event) => {
          event.stopPropagation();
          pointerActiveRef.current = true;
          onPreview(snap(Number(event.currentTarget.value)));
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          pointerActiveRef.current = false;
          commit(Number(event.currentTarget.value));
          skipNextBlurRef.current = true;
        }}
        onPointerCancel={(event) => {
          event.stopPropagation();
          pointerActiveRef.current = false;
          onCancel();
        }}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onPreview(snap(Number(event.currentTarget.value)))}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (skipNextBlurRef.current) {
            skipNextBlurRef.current = false;
            return;
          }
          if (!pointerActiveRef.current && Number(event.currentTarget.value) !== safeValue) {
            commit(Number(event.currentTarget.value));
          }
        }}
      />
    </div>
  );
}
