import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import { clampColor, colorAtPoint, pointOfColor, type HueSaturation } from './glassColorPickerGeometry';
import './glassColorPicker.css';

export type { HueSaturation } from './glassColorPickerGeometry';

export type GlassColorPickerProps = GlassControlState & {
  value: HueSaturation;
  /** While dragging, at most once every SEND_EVERY_MS, and always with the last colour. */
  onChange: (value: HueSaturation) => void;
  label: string;
  /** The colour in words, for a screen reader. */
  valueText?: (value: HueSaturation) => string;
  /** `hero` is as large as the space it is given allows, and stays round. */
  size?: 'default' | 'hero';
  className?: string;
};

const SEND_EVERY_MS = 120;
/** After the finger lifts, how long the handle waits for the device to report the colour. */
const HOLD_AFTER_LIFT_MS = 2000;
const KEY_STEP = 5;

/*
 * A soft colour disc with a white handle, for hue and saturation. It takes any
 * size: its width decides, and it stays round. Drag it, or use the arrows: left
 * and right turn the hue, up and down change the saturation.
 */
export function GlassColorPicker({ value, onChange, label, valueText, size = 'default', disabled: isDisabled = false, pending = false, error = false, className }: GlassColorPickerProps) {
  const disabled = controlBlocked({ disabled: isDisabled, pending });
  const [dragging, setDragging] = React.useState(false);
  // What the finger chose, shown until the device has answered.
  const [held, setHeld] = React.useState<HueSaturation | null>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const change = React.useRef(onChange);
  const send = React.useRef<{ last: number; waiting: HueSaturation | null; timer: number | null }>({ last: 0, waiting: null, timer: null });
  const release = React.useRef<number | null>(null);

  React.useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  React.useEffect(
    () => () => {
      if (send.current.timer !== null) window.clearTimeout(send.current.timer);
      if (release.current !== null) window.clearTimeout(release.current);
    },
    [],
  );

  const flush = () => {
    const state = send.current;
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.timer = null;
    if (!state.waiting) return;
    const next = state.waiting;
    state.waiting = null;
    state.last = Date.now();
    change.current(next);
  };

  const emit = (next: HueSaturation) => {
    const state = send.current;
    state.waiting = next;
    const wait = SEND_EVERY_MS - (Date.now() - state.last);
    if (wait <= 0) flush();
    else if (state.timer === null) state.timer = window.setTimeout(flush, wait);
  };

  const hold = (next: HueSaturation) => {
    if (release.current !== null) window.clearTimeout(release.current);
    release.current = null;
    setHeld(next);
  };

  const letGo = () => {
    if (release.current !== null) window.clearTimeout(release.current);
    release.current = window.setTimeout(() => setHeld(null), HOLD_AFTER_LIFT_MS);
  };

  const pick = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = root.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const next = colorAtPoint(event.clientX - box.left, event.clientY - box.top, box.width);
    hold(next);
    emit(next);
  };

  const shown = held ?? value;
  const point = pointOfColor(shown);

  return (
    <div
      ref={root}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(shown.hue)}
      aria-valuetext={valueText?.(shown)}
      aria-disabled={disabled || undefined}
      {...controlStateAria({ pending, error })}
      className={clsx('glass-color-picker', size === 'hero' && 'is-hero', dragging && 'is-dragging', isDisabled && 'is-disabled', controlStateClass({ pending, error }), className)}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
        pick(event);
      }}
      onPointerMove={(event) => {
        if (dragging) pick(event);
      }}
      onPointerUp={() => {
        if (!dragging) return;
        setDragging(false);
        flush();
        letGo();
      }}
      onPointerCancel={() => {
        if (!dragging) return;
        setDragging(false);
        flush();
        letGo();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        const step = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
        const moves: Record<string, HueSaturation> = {
          ArrowLeft: { ...shown, hue: shown.hue - step },
          ArrowRight: { ...shown, hue: shown.hue + step },
          ArrowDown: { ...shown, saturation: shown.saturation - step },
          ArrowUp: { ...shown, saturation: shown.saturation + step },
        };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        const next = clampColor(move);
        hold(next);
        emit(next);
        letGo();
      }}
    >
      <span className="glass-color-picker-disc" aria-hidden="true" />
      <span className="glass-color-picker-handle" aria-hidden="true" style={{ left: `${point.left}%`, top: `${point.top}%` }} />
    </div>
  );
}

export default GlassColorPicker;
