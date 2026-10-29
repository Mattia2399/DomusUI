import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startIdleController, type IdleController } from './idleController';

const MINUTE = 60_000;

function fakePage() {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  return {
    target: target as unknown as Window,
    doc: doc as unknown as Document,
    fire: (type: string) => target.dispatchEvent(new Event(type)),
    setVisibility: (state: DocumentVisibilityState) => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

let controller: IdleController | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T08:00:00Z'));
});

afterEach(() => {
  controller?.dispose();
  controller = null;
  vi.useRealTimers();
});

describe('idle controller', () => {
  it('fires once the timeout has passed without activity', () => {
    const page = fakePage();
    const onIdle = vi.fn();
    controller = startIdleController({ timeoutMs: MINUTE, onIdle, target: page.target, doc: page.doc });

    vi.advanceTimersByTime(MINUTE - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * MINUTE);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('counts touches, keys, wheel and focus as activity', () => {
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focusin']) {
      const page = fakePage();
      const onIdle = vi.fn();
      const current = startIdleController({ timeoutMs: MINUTE, onIdle, target: page.target, doc: page.doc });

      vi.advanceTimersByTime(40_000);
      page.fire(type);
      vi.advanceTimersByTime(40_000);
      expect(onIdle, type).not.toHaveBeenCalled();
      vi.advanceTimersByTime(20_000);
      expect(onIdle, type).toHaveBeenCalledTimes(1);
      current.dispose();
    }
  });

  it('notes a moving mouse without doing work for every move', () => {
    const page = fakePage();
    const onIdle = vi.fn();
    const now = vi.fn(() => Date.now());
    controller = startIdleController({ timeoutMs: MINUTE, onIdle, target: page.target, doc: page.doc, now });

    vi.advanceTimersByTime(30_000);
    const calls = now.mock.calls.length;
    for (let index = 0; index < 200; index += 1) page.fire('pointermove');
    // One clock read per move, at most one stored activity per half second.
    expect(now.mock.calls.length - calls).toBe(200);
    vi.advanceTimersByTime(59_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('starts again from now on reset: a navigation or the end of the screensaver', () => {
    const page = fakePage();
    const onIdle = vi.fn();
    controller = startIdleController({ timeoutMs: MINUTE, onIdle, target: page.target, doc: page.doc });

    vi.advanceTimersByTime(50_000);
    controller.reset();
    vi.advanceTimersByTime(50_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(onIdle).toHaveBeenCalledTimes(1);

    controller.reset();
    vi.advanceTimersByTime(MINUTE);
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it('never fires while the page is hidden, and counts again from zero when it is back', () => {
    const page = fakePage();
    const onIdle = vi.fn();
    controller = startIdleController({ timeoutMs: MINUTE, onIdle, target: page.target, doc: page.doc });

    vi.advanceTimersByTime(30_000);
    page.setVisibility('hidden');
    vi.advanceTimersByTime(30 * MINUTE);
    expect(onIdle).not.toHaveBeenCalled();

    page.setVisibility('visible');
    vi.advanceTimersByTime(MINUTE - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('treats coming back to the window as a fresh start', () => {
    const page = fakePage();
    const onIdle = vi.fn();
    controller = startIdleController({ timeoutMs: MINUTE, onIdle, target: page.target, doc: page.doc });

    vi.advanceTimersByTime(50_000);
    page.fire('blur');
    page.fire('focus');
    vi.advanceTimersByTime(50_000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('stops listening and counting once disposed', () => {
    const page = fakePage();
    const onIdle = vi.fn();
    const remove = vi.spyOn(page.target, 'removeEventListener');
    const current = startIdleController({ timeoutMs: MINUTE, onIdle, target: page.target, doc: page.doc });

    current.dispose();
    vi.advanceTimersByTime(10 * MINUTE);
    page.fire('pointerdown');
    page.setVisibility('hidden');
    page.setVisibility('visible');
    vi.advanceTimersByTime(10 * MINUTE);

    expect(onIdle).not.toHaveBeenCalled();
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(
      ['focus', 'focusin', 'keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel'].sort(),
    );
  });
});
