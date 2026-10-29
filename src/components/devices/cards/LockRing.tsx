import React from 'react';
import { CircleAlert, DoorOpen, LoaderCircle, Lock, LockOpen } from 'lucide-react';
import { clsx } from 'clsx';
import type { DevicesTranslator } from '../../../i18n/devicesTranslations';
import type { LockCommand, SecurityModel } from '../model/security';
import { LOCK_KEY } from './securityText';
import '../theme/devices.css';

/*
 * The lock with two rings, as on the board. Held while locked, the first lap
 * unlocks it and the second, if the lock can, opens the door; let go too soon
 * and it asks to hold a little longer. Unlocked, a tap locks it and holding
 * opens the door. Open or jammed, a tap locks it. Keyboard: hold Enter or Space.
 */

export type RingPhase = 'lap1' | 'lap2' | 'lap2b';
export type RingTone = 'secure' | 'open' | 'transition' | 'warning' | 'off';

// The laps last as their animation in devices.css.
const LAP_MS = 900;
const SECOND_LAP_MS = 1050;
const OPEN_ONLY_MS = 1120;
const TAP_MS = 220;
const NUDGE_MS = 1600;

const BUSY = new Set(['locking', 'unlocking', 'opening']);

export function useLockRing(model: SecurityModel, onCommand: (command: LockCommand) => void, disabled = false) {
  const [press, setPress] = React.useState<{ phase: RingPhase; from: 'locked' | 'unlocked'; t0: number } | null>(null);
  const [nudge, setNudge] = React.useState(false);
  const timers = React.useRef<number[]>([]);
  const nudgeTimer = React.useRef<number | undefined>(undefined);
  // The timers call the command of the last render, not of the one that started them.
  const command = React.useRef(onCommand);
  React.useEffect(() => {
    command.current = onCommand;
  });
  const clear = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };
  React.useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(nudgeTimer.current);
    },
    [],
  );

  const lock = model.lock;
  const pressable = !disabled && model.available && (lock === 'locked' || lock === 'unlocked');
  const tapLocks = !disabled && model.available && (lock === 'open' || lock === 'jammed');
  const later = (run: () => void, ms: number) => timers.current.push(window.setTimeout(run, ms));

  const start = () => {
    clear();
    setNudge(false);
    const t0 = Date.now();
    if (lock === 'locked') {
      setPress({ phase: 'lap1', from: 'locked', t0 });
      later(() => {
        command.current('unlock');
        if (!model.canOpen) {
          setPress(null);
          return;
        }
        setPress({ phase: 'lap2', from: 'locked', t0 });
        later(() => {
          setPress(null);
          command.current('open');
        }, SECOND_LAP_MS);
      }, LAP_MS);
    } else if (lock === 'unlocked') {
      setPress({ phase: 'lap2b', from: 'unlocked', t0 });
      if (model.canOpen) {
        later(() => {
          setPress(null);
          command.current('open');
        }, OPEN_ONLY_MS);
      }
    }
  };
  const end = () => {
    if (!press) return;
    const elapsed = Date.now() - press.t0;
    clear();
    setPress(null);
    if (press.phase === 'lap1') {
      setNudge(true);
      window.clearTimeout(nudgeTimer.current);
      nudgeTimer.current = window.setTimeout(() => setNudge(false), NUDGE_MS);
    } else if (press.from === 'unlocked' && (elapsed < TAP_MS || !model.canOpen)) {
      command.current('lock');
    }
  };
  const isKey = (event: React.KeyboardEvent) => event.key === 'Enter' || event.key === ' ';

  const handlers: React.ButtonHTMLAttributes<HTMLButtonElement> = disabled
    ? {}
    : {
        onPointerDown: (event) => {
          if (!pressable || (event.pointerType === 'mouse' && event.button !== 0)) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // A pointer that cannot be captured still ends on the ring.
          }
          start();
        },
        onPointerUp: end,
        onPointerCancel: () => {
          clear();
          setPress(null);
        },
        onPointerLeave: (event) => {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
          end();
        },
        onClick: () => {
          if (tapLocks) command.current('lock');
        },
        onKeyDown: (event) => {
          if (!isKey(event)) return;
          event.preventDefault();
          if (event.repeat) return;
          if (pressable) start();
          else if (tapLocks) command.current('lock');
        },
        onKeyUp: (event) => {
          if (!isKey(event)) return;
          event.preventDefault();
          end();
        },
        onContextMenu: (event) => event.preventDefault(),
      };

  return { phase: press?.phase ?? null, nudge, handlers };
}

export type LockRingState = ReturnType<typeof useLockRing>;

export function lockRingTone(model: SecurityModel): RingTone {
  if (!model.available || !model.lock) return 'off';
  if (model.lock === 'locked') return 'secure';
  if (model.lock === 'unlocked' || model.lock === 'open') return 'open';
  if (model.lock === 'jammed') return 'warning';
  return 'transition';
}

/** What the ring says: the state, a line on what to do, the same short for a card, and its label. */
export function lockRingText(model: SecurityModel, ring: Pick<LockRingState, 'phase' | 'nudge'>, dt: DevicesTranslator) {
  const lock = model.lock;
  if (!model.available || !lock) {
    const headline = dt('unavailable');
    return { headline, caption: '', short: '', aria: dt('ringAriaBusy', { name: model.name, state: headline }) };
  }
  const headline = dt(LOCK_KEY[lock]);
  let caption: string;
  let short: string;
  if (lock === 'locked') {
    caption = dt('ringCapLocked');
    short = dt('ringShortLocked');
  } else if (lock === 'unlocked') {
    caption = model.canOpen ? dt('ringCapUnlockedOpen') : dt('ringCapUnlocked');
    short = model.canOpen ? dt('ringShortUnlockedOpen') : dt('ringShortUnlocked');
  } else if (lock === 'open') {
    caption = dt('ringCapOpen');
    short = dt('ringShortOpen');
  } else if (lock === 'jammed') {
    caption = dt('ringCapJammed');
    short = dt('ringShortJammed');
  } else {
    caption = lock === 'opening' ? dt('ringCapOpening') : dt('ringCapWaiting');
    short = dt('ringShortWaiting');
  }
  if (ring.nudge) {
    caption = dt('ringCapNudge');
    short = dt('ringShortNudge');
  }
  if (ring.phase && ring.phase !== 'lap1') {
    caption = dt('ringCapSecond');
    short = dt('ringShortSecond');
  }
  const aria =
    lock === 'locked'
      ? dt(model.canOpen ? 'ringAriaLockedOpen' : 'ringAriaLocked', { name: model.name })
      : lock === 'unlocked'
        ? dt(model.canOpen ? 'ringAriaUnlockedOpen' : 'ringAriaUnlocked', { name: model.name })
        : lock === 'open' || lock === 'jammed'
          ? dt('lockAria', { name: model.name })
          : dt('ringAriaBusy', { name: model.name, state: headline });
  return { headline, caption, short, aria };
}

/** The colour of the ring's words: none while locked and left alone. */
export function lockRingInk(model: SecurityModel, ring: Pick<LockRingState, 'phase' | 'nudge'>) {
  const quiet = model.lock === 'locked' && !ring.phase && !ring.nudge;
  return quiet ? null : `dv-ring-ink is-${lockRingTone(model)}`;
}

export type LockRingProps = {
  model: SecurityModel;
  ring: LockRingState;
  label: string;
  size?: 'sm' | 'lg';
  /** In the edit mode of a section the ring is only a picture. */
  inert?: boolean;
};

export function LockRing({ model, ring, label, size = 'sm', inert = false }: LockRingProps) {
  const lock = model.lock;
  const busy = lock !== null && BUSY.has(lock);
  const solid = lock === 'locked' || lock === 'jammed';
  const Icon = busy
    ? LoaderCircle
    : lock === 'unlocked'
      ? LockOpen
      : lock === 'open'
        ? DoorOpen
        : lock === 'jammed'
          ? CircleAlert
          : Lock;
  const large = size === 'lg';
  const radius = large ? 47 : 46;
  return (
    <button
      type="button"
      className={clsx(
        'dv-ring',
        large && 'dv-ring-lg',
        `is-${lockRingTone(model)}`,
        solid && 'is-solid',
        ring.phase && `is-press is-${ring.phase}`,
        ring.nudge && 'is-nudge',
        busy && 'is-busy',
      )}
      aria-label={label}
      disabled={!model.available}
      tabIndex={inert ? -1 : undefined}
      aria-hidden={inert ? true : undefined}
      {...(inert ? {} : ring.handlers)}
    >
      <svg className="dv-ring-laps" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="dv-ring-lap1" cx="50" cy="50" r={radius} />
        <circle className="dv-ring-lap2" cx="50" cy="50" r={radius} />
      </svg>
      {busy ? (
        <svg className="dv-ring-busy" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} />
        </svg>
      ) : null}
      <span className="dv-ring-core">
        <Icon size={large ? 42 : 21} strokeWidth={large ? 1.8 : 2.2} aria-hidden="true" />
      </span>
    </button>
  );
}

export default LockRing;
