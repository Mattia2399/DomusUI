import React from 'react';
import { AlertTriangle, DoorOpen, Loader2, Lock, LockOpen, WifiOff } from 'lucide-react';
import type { LockCardTone } from './lockCardModel';
import type { LockRingOutcome, LockRingStage } from './useLockRingPress';
import './LockRing.css';

export type LockRingIcon = 'lock' | 'unlock' | 'door' | 'alert' | 'offline' | 'busy';

type LockRingProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  tone: LockCardTone;
  icon: LockRingIcon;
  solidCore: boolean;
  lap1: number;
  lap2: number;
  stage: LockRingStage;
  isPressing: boolean;
  outcome: LockRingOutcome | null;
  busy: boolean;
};

const ICONS = {
  lock: Lock,
  unlock: LockOpen,
  door: DoorOpen,
  alert: AlertTriangle,
  offline: WifiOff,
  busy: Loader2,
} as const;

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function LockRing({
  tone,
  icon,
  solidCore,
  lap1,
  lap2,
  stage,
  isPressing,
  outcome,
  busy,
  className,
  style,
  ...buttonProps
}: LockRingProps) {
  const Icon = ICONS[icon];
  const first = clampProgress(lap1);
  const second = clampProgress(lap2);
  const press = Math.max(first, second);

  return (
    <button
      type="button"
      {...buttonProps}
      className={`lock-ring ${className ?? ''}`}
      data-tone={tone}
      data-solid={solidCore ? 'true' : 'false'}
      data-stage={stage}
      data-pressing={isPressing ? 'true' : 'false'}
      data-outcome={outcome ?? undefined}
      style={{ ...style, '--lock-ring-press': press.toFixed(3) } as React.CSSProperties}
    >
      <svg className="lock-ring__laps" viewBox="0 0 100 100" aria-hidden="true">
        <circle
          className="lock-ring__lap lock-ring__lap--unlock"
          cx="50"
          cy="50"
          r="46"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={(100 * (1 - first)).toFixed(2)}
          data-visible={first > 0 ? 'true' : 'false'}
        />
        <circle
          className="lock-ring__lap lock-ring__lap--open"
          cx="50"
          cy="50"
          r="46"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={(100 * (1 - second)).toFixed(2)}
          data-visible={second > 0 ? 'true' : 'false'}
        />
      </svg>
      {busy ? (
        <svg className="lock-ring__spinner" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" pathLength={100} strokeDasharray="24 76" />
        </svg>
      ) : null}
      <span className="lock-ring__core" aria-hidden="true">
        <Icon className={`lock-ring__icon ${icon === 'busy' ? 'lock-ring__icon--spin' : ''}`} />
      </span>
    </button>
  );
}
