import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize } from './glassControl';
import './glassAdvanced.css';

/** Seconds as M:SS, or H:MM:SS past the hour. Never negative. */
export function formatRemaining(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

export type GlassCountdownProps = {
  /** When it ends, in milliseconds; without it, the time is fixed in `remaining`. */
  finishesAt?: number;
  /** The seconds left when it is paused. */
  remaining?: number;
  /** The seconds it lasts in all. */
  total: number;
  label: string;
  note?: React.ReactNode;
  /** Pauses and resumes it; without it, it is only to read. */
  onToggle?: () => void;
  size?: GlassControlSize;
  className?: string;
};

/* A ring that empties, with minutes and seconds in the middle. */
export function GlassCountdown({ finishesAt, remaining, total, label, note, onToggle, size = 'group', className }: GlassCountdownProps) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (finishesAt === undefined) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [finishesAt]);
  const left = finishesAt !== undefined ? Math.max(0, (finishesAt - now) / 1000) : Math.max(0, remaining ?? 0);
  const share = total > 0 ? Math.min(100, (left / total) * 100) : 0;
  const body = (
    <>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" className="glass-countdown-track" />
        <circle cx="50" cy="50" r="44" className="glass-countdown-fill" pathLength={100} strokeDasharray={`${share} 100`} transform="rotate(-90 50 50)" />
      </svg>
      <span>
        <b>{formatRemaining(left)}</b>
        {note ? <span>{note}</span> : null}
      </span>
    </>
  );
  return (
    <div className={clsx('glass-countdown', `is-${size}`, className)}>
      {onToggle ? (
        <button type="button" aria-label={label} onClick={onToggle}>
          {body}
        </button>
      ) : (
        <div role="timer" aria-label={label}>
          {body}
        </div>
      )}
    </div>
  );
}

export default GlassCountdown;
