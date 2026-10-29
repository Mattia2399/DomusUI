/**
 * Notices when the person stops using Domus on this device.
 *
 * Only what the person does counts: pointer, touch, keys, wheel and focus,
 * plus the navigation the runtime reports with `reset`. Home Assistant
 * states, WebSocket traffic and timers never do. Activity only stores a
 * timestamp; one timer checks it when the timeout could have passed.
 *
 * While the page is hidden nothing is counted and nothing fires; back in
 * view, the countdown starts again from zero.
 */
export type IdleControllerOptions = {
  timeoutMs: number;
  onIdle: () => void;
  now?: () => number;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
};

export type IdleController = {
  /** Activity that the DOM does not show, such as a navigation; also restarts after a wake. */
  reset: () => void;
  dispose: () => void;
};

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focusin'] as const;
// A moving mouse is noted at most this often: no work per pixel.
const POINTER_MOVE_THROTTLE_MS = 500;

export function startIdleController({
  timeoutMs,
  onIdle,
  now = () => Date.now(),
  target = window,
  doc = document,
}: IdleControllerOptions): IdleController {
  let lastActivity = now();
  let lastPointerMove = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedule = (delay: number) => {
    clear();
    if (disposed || doc.visibilityState === 'hidden') return;
    timer = setTimeout(check, Math.max(0, delay));
  };

  function check() {
    timer = null;
    if (disposed || doc.visibilityState === 'hidden') return;
    const elapsed = now() - lastActivity;
    if (elapsed >= timeoutMs) {
      // Fires once; the runtime calls reset when the person is back.
      onIdle();
      return;
    }
    schedule(timeoutMs - elapsed);
  }

  const reset = () => {
    lastActivity = now();
    schedule(timeoutMs);
  };

  const noteActivity = () => {
    lastActivity = now();
    // The timer may have fired already (screensaver shown): the next reset restarts it.
  };

  const notePointerMove = () => {
    const time = now();
    if (time - lastPointerMove < POINTER_MOVE_THROTTLE_MS) return;
    lastPointerMove = time;
    lastActivity = time;
  };

  const handleVisibility = () => {
    if (doc.visibilityState === 'hidden') clear();
    else reset();
  };

  const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };
  ACTIVITY_EVENTS.forEach((type) => target.addEventListener(type, noteActivity, listenerOptions));
  target.addEventListener('pointermove', notePointerMove, listenerOptions);
  // Coming back to this window is a fresh start, like coming back to the tab.
  target.addEventListener('focus', reset);
  doc.addEventListener('visibilitychange', handleVisibility);
  schedule(timeoutMs);

  return {
    reset,
    dispose: () => {
      disposed = true;
      clear();
      ACTIVITY_EVENTS.forEach((type) => target.removeEventListener(type, noteActivity, listenerOptions));
      target.removeEventListener('pointermove', notePointerMove, listenerOptions);
      target.removeEventListener('focus', reset);
      doc.removeEventListener('visibilitychange', handleVisibility);
    },
  };
}
