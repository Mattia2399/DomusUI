import type React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLockRingMode, useLockRingPress, type LockRingMode } from './useLockRingPress';

type Options = Parameters<typeof useLockRingPress>[0];

function key(name: string) {
  return { key: name, repeat: false, preventDefault() {}, stopPropagation() {} } as unknown as React.KeyboardEvent<HTMLButtonElement>;
}

function setup(mode: LockRingMode, overrides: Partial<Options> = {}) {
  const options: Options = {
    mode,
    canOpenAfterUnlock: true,
    onUnlock: vi.fn(() => true),
    onLock: vi.fn(),
    onOpen: vi.fn(),
    ...overrides,
  };
  const hook = renderHook((props: Options) => useLockRingPress(props), { initialProps: options });
  const press = () => act(() => hook.result.current.bindings.onKeyDown?.(key('Enter')));
  const release = () => act(() => hook.result.current.bindings.onKeyUp?.(key('Enter')));
  const wait = (ms: number) => act(() => {
    vi.advanceTimersByTime(ms);
  });
  return { hook, options, press, release, wait };
}

describe('useLockRingPress', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('unlocks on the first lap and opens the latch on the second', () => {
    const { hook, options, press, release, wait } = setup('hold-unlock');
    press();
    wait(500);
    expect(options.onUnlock).not.toHaveBeenCalled();
    wait(450);
    expect(options.onUnlock).toHaveBeenCalledTimes(1);
    expect(hook.result.current.stage).toBe('bridge');
    wait(600);
    expect(hook.result.current.stage).toBe('open');
    expect(options.onOpen).not.toHaveBeenCalled();
    wait(500);
    expect(options.onOpen).toHaveBeenCalledTimes(1);
    expect(hook.result.current.outcome).toBe('open');
    release();
    expect(options.onLock).not.toHaveBeenCalled();
  });

  it('stays unlocked when released between the two laps', () => {
    const { hook, options, press, release, wait } = setup('hold-unlock');
    press();
    wait(1200);
    release();
    wait(2000);
    expect(options.onUnlock).toHaveBeenCalledTimes(1);
    expect(options.onOpen).not.toHaveBeenCalled();
    expect(hook.result.current.stage).toBe('idle');
  });

  it('nudges instead of unlocking when the hold is too short', () => {
    const { hook, options, press, release, wait } = setup('hold-unlock');
    press();
    wait(400);
    release();
    expect(options.onUnlock).not.toHaveBeenCalled();
    expect(hook.result.current.isNudging).toBe(true);
    wait(1700);
    expect(hook.result.current.isNudging).toBe(false);
  });

  it('stops after the first lap when the unlock waits for a confirmation', () => {
    const { options, press, wait } = setup('hold-unlock', { onUnlock: vi.fn(() => false) });
    press();
    wait(3000);
    expect(options.onUnlock).toHaveBeenCalledTimes(1);
    expect(options.onOpen).not.toHaveBeenCalled();
  });

  it('never starts the second lap without a latch', () => {
    const { options, press, wait } = setup('hold-unlock', { canOpenAfterUnlock: false });
    press();
    wait(3000);
    expect(options.onUnlock).toHaveBeenCalledTimes(1);
    expect(options.onOpen).not.toHaveBeenCalled();
  });

  it('locks on a tap and opens on a hold once unlocked', () => {
    const tap = setup('tap-or-hold-open');
    tap.press();
    tap.wait(100);
    tap.release();
    expect(tap.options.onLock).toHaveBeenCalledTimes(1);
    expect(tap.options.onOpen).not.toHaveBeenCalled();

    const hold = setup('tap-or-hold-open');
    hold.press();
    hold.wait(1200);
    hold.release();
    expect(hold.options.onOpen).toHaveBeenCalledTimes(1);
    expect(hold.options.onLock).not.toHaveBeenCalled();
  });

  it('does nothing while inactive', () => {
    const { hook, options, press, release, wait } = setup('none');
    press();
    wait(3000);
    release();
    expect(options.onUnlock).not.toHaveBeenCalled();
    expect(options.onLock).not.toHaveBeenCalled();
    expect(hook.result.current.isInactive).toBe(true);
  });
});

describe('resolveLockRingMode', () => {
  it('maps lock states to ring gestures', () => {
    expect(resolveLockRingMode({ enabled: true, state: 'locked', canOpen: true })).toBe('hold-unlock');
    expect(resolveLockRingMode({ enabled: true, state: 'unlocked', canOpen: true })).toBe('tap-or-hold-open');
    expect(resolveLockRingMode({ enabled: true, state: 'unlocked', canOpen: false })).toBe('tap');
    expect(resolveLockRingMode({ enabled: true, state: 'jammed', canOpen: true })).toBe('tap');
    expect(resolveLockRingMode({ enabled: true, state: 'unlocking', canOpen: true })).toBe('none');
    expect(resolveLockRingMode({ enabled: false, state: 'locked', canOpen: true })).toBe('none');
  });
});
