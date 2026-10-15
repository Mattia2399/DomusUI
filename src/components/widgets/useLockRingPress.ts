import React, { useCallback, useEffect, useRef, useState } from 'react';

// How the ring reacts to a press, from the state the lock is in when the press starts.
// - hold-unlock: locked. The first lap unlocks; holding on, a second lap opens the latch.
// - tap-or-hold-open: unlocked with a latch. A tap locks, holding opens the latch.
// - tap: a tap locks (unlocked without latch, open, jammed).
// - none: no action (transitioning, offline, edit mode).
export type LockRingMode = 'hold-unlock' | 'tap-or-hold-open' | 'tap' | 'none';
export type LockRingStage = 'idle' | 'unlock' | 'bridge' | 'open';
export type LockRingOutcome = 'lock' | 'unlock' | 'open';

export const LOCK_RING_LAP_MS = 900;
const LOCK_RING_BRIDGE_MS = 150;
const LOCK_RING_TAP_MS = 220;
const LOCK_RING_NUDGE_MS = 1600;
const LOCK_RING_OUTCOME_MS = 620;

type UseLockRingPressOptions = {
  mode: LockRingMode;
  // Whether the second lap is available after the first one (the lock exposes a latch).
  canOpenAfterUnlock: boolean;
  // Returns false when the unlock is waiting on a confirmation: the press stops there.
  onUnlock: () => boolean | void;
  onLock: () => void;
  onOpen: () => void;
};

type Press = {
  from: Exclude<LockRingMode, 'none'>;
  startedAt: number;
  unlocked: boolean;
};

function haptic(pattern: number) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is optional.
  }
}

export function useLockRingPress({ mode, canOpenAfterUnlock, onUnlock, onLock, onOpen }: UseLockRingPressOptions) {
  const [lap1, setLap1] = useState(0);
  const [lap2, setLap2] = useState(0);
  const [stage, setStage] = useState<LockRingStage>('idle');
  const [isPressing, setIsPressing] = useState(false);
  const [isNudging, setIsNudging] = useState(false);
  const [outcome, setOutcome] = useState<LockRingOutcome | null>(null);

  const pressRef = useRef<Press | null>(null);
  const frameRef = useRef<number | null>(null);
  const nudgeTimeoutRef = useRef<number | null>(null);
  const outcomeTimeoutRef = useRef<number | null>(null);
  const optionsRef = useRef({ mode, canOpenAfterUnlock, onUnlock, onLock, onOpen });
  optionsRef.current = { mode, canOpenAfterUnlock, onUnlock, onLock, onOpen };

  const clearFrame = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearFrame();
    pressRef.current = null;
    setLap1(0);
    setLap2(0);
    setStage('idle');
    setIsPressing(false);
  }, [clearFrame]);

  const finish = useCallback((result: LockRingOutcome | null) => {
    reset();
    if (!result) return;
    if (outcomeTimeoutRef.current !== null) window.clearTimeout(outcomeTimeoutRef.current);
    setOutcome(result);
    outcomeTimeoutRef.current = window.setTimeout(() => {
      outcomeTimeoutRef.current = null;
      setOutcome(null);
    }, LOCK_RING_OUTCOME_MS);
  }, [reset]);

  const nudge = useCallback(() => {
    if (nudgeTimeoutRef.current !== null) window.clearTimeout(nudgeTimeoutRef.current);
    setIsNudging(true);
    nudgeTimeoutRef.current = window.setTimeout(() => {
      nudgeTimeoutRef.current = null;
      setIsNudging(false);
    }, LOCK_RING_NUDGE_MS);
  }, []);

  const tick = useCallback(() => {
    const press = pressRef.current;
    if (!press) return;
    const elapsed = performance.now() - press.startedAt;

    if (press.from === 'hold-unlock') {
      if (!press.unlocked) {
        const progress = Math.min(1, elapsed / LOCK_RING_LAP_MS);
        if (progress < 1) {
          setLap1(progress);
          frameRef.current = window.requestAnimationFrame(tick);
          return;
        }
        press.unlocked = true;
        setLap1(1);
        haptic(12);
        const started = optionsRef.current.onUnlock();
        if (started === false || !optionsRef.current.canOpenAfterUnlock) {
          finish('unlock');
          return;
        }
        setStage('bridge');
      }
      const progress = Math.min(1, (elapsed - LOCK_RING_LAP_MS - LOCK_RING_BRIDGE_MS) / LOCK_RING_LAP_MS);
      if (progress >= 1) {
        haptic(18);
        optionsRef.current.onOpen();
        finish('open');
        return;
      }
      if (progress > 0) {
        setStage('open');
        setLap2(progress);
      }
      frameRef.current = window.requestAnimationFrame(tick);
      return;
    }

    if (press.from === 'tap-or-hold-open') {
      const progress = Math.min(1, (elapsed - LOCK_RING_TAP_MS) / LOCK_RING_LAP_MS);
      if (progress >= 1) {
        haptic(18);
        optionsRef.current.onOpen();
        finish('open');
        return;
      }
      if (progress > 0) {
        setStage('open');
        setLap2(progress);
      }
      frameRef.current = window.requestAnimationFrame(tick);
    }
  }, [finish]);

  const start = useCallback(() => {
    const currentMode = optionsRef.current.mode;
    if (currentMode === 'none' || pressRef.current) return;
    clearFrame();
    if (nudgeTimeoutRef.current !== null) {
      window.clearTimeout(nudgeTimeoutRef.current);
      nudgeTimeoutRef.current = null;
    }
    setIsNudging(false);
    pressRef.current = { from: currentMode, startedAt: performance.now(), unlocked: false };
    setIsPressing(true);
    if (currentMode === 'hold-unlock') {
      setStage('unlock');
      setLap1(0.01);
    }
    if (currentMode !== 'tap') {
      frameRef.current = window.requestAnimationFrame(tick);
    }
  }, [clearFrame, tick]);

  const end = useCallback(() => {
    const press = pressRef.current;
    if (!press) return;
    const elapsed = performance.now() - press.startedAt;
    if (press.from === 'hold-unlock') {
      if (press.unlocked) {
        finish('unlock');
        return;
      }
      reset();
      nudge();
      return;
    }
    if (press.from === 'tap-or-hold-open' && elapsed >= LOCK_RING_TAP_MS) {
      reset();
      return;
    }
    optionsRef.current.onLock();
    finish('lock');
  }, [finish, nudge, reset]);

  // A cancelled pointer (system gesture, scroll) never commits a pending tap.
  const cancel = useCallback(() => {
    const press = pressRef.current;
    if (!press) return;
    if (press.from === 'hold-unlock' && press.unlocked) {
      finish('unlock');
      return;
    }
    reset();
  }, [finish, reset]);

  useEffect(() => () => {
    clearFrame();
    if (nudgeTimeoutRef.current !== null) window.clearTimeout(nudgeTimeoutRef.current);
    if (outcomeTimeoutRef.current !== null) window.clearTimeout(outcomeTimeoutRef.current);
  }, [clearFrame]);

  useEffect(() => {
    if (mode === 'none' && !pressRef.current) {
      setIsNudging(false);
    }
  }, [mode]);

  const isInactive = mode === 'none' && !isPressing;

  const bindings = {
    'aria-disabled': isInactive || undefined,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (isInactive) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some embedded browsers reject pointer capture; the press still works over the ring.
      }
      start();
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      end();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      cancel();
    },
    onLostPointerCapture: () => end(),
    onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
      end();
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || isInactive) return;
      start();
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      end();
    },
    onBlur: () => cancel(),
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  };

  return {
    lap1,
    lap2,
    stage,
    isPressing,
    isNudging,
    outcome,
    isInactive,
    bindings,
    reset,
  };
}

export function resolveLockRingMode({
  enabled,
  state,
  canOpen,
}: {
  enabled: boolean;
  state: string;
  canOpen: boolean;
}): LockRingMode {
  if (!enabled) return 'none';
  if (state === 'locked') return 'hold-unlock';
  if (state === 'unlocked') return canOpen ? 'tap-or-hold-open' : 'tap';
  if (state === 'open' || state === 'jammed') return 'tap';
  return 'none';
}
