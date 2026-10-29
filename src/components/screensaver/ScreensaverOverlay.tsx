import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { DashboardAppearance, DashboardBackgroundPreset } from '../../theme/dashboardTheme';
import { ScreensaverDisplay } from './ScreensaverDisplay';
import type { ScreensaverPreferences } from './screensaverPreferences';

/*
 * The screensaver on screen: the picture, and the overlay that takes the
 * gesture waking it so nothing of the page below hears it. Loaded on demand
 * by DomusScreensaver, ahead of time once the screensaver is on, so it never
 * appears late; the idle countdown itself stays in the dashboard.
 */

// A mouse must really move to wake the screen; a nudged desk does not.
const WAKE_MOVE_PX = 24;
// The overlay keeps the gesture that wakes it until it ends, then steps aside.
const WAKE_RELEASE_MS = 60;
const WAKE_FALLBACK_MS = 800;
// After a touch, the click a browser may still send is kept from the page.
const TOUCH_CLICK_GUARD_MS = 400;
const FADE_MS = 240;
const CAPTURED_EVENTS = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointercancel',
  'touchstart',
  'touchend',
  'mousedown',
  'mouseup',
  'click',
  'auxclick',
  'dblclick',
  'contextmenu',
  'wheel',
  'keydown',
  'keyup',
  'keypress',
] as const;

export type ScreensaverSession = { source: 'idle' | 'preview'; preferences: ScreensaverPreferences };

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

type Phase = 'entering' | 'shown' | 'leaving';

export function ScreensaverOverlay({
  session,
  appearance,
  background,
  onWake,
}: {
  session: ScreensaverSession;
  appearance: DashboardAppearance;
  background: DashboardBackgroundPreset;
  onWake: () => void;
}) {
  const { t } = useI18n();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [reduceMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<Phase>(reduceMotion ? 'shown' : 'entering');
  const moveOriginRef = useRef<{ x: number; y: number } | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeRef = useRef<{ waiting: 'pointer' | 'key' | null; touch: boolean } | null>(null);

  // The app below cannot be reached while the screensaver is shown; focus comes back afterwards.
  useEffect(() => {
    const appRoot = document.getElementById('root');
    const madeInert = Boolean(appRoot && !appRoot.inert);
    if (appRoot && madeInert) appRoot.inert = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    surfaceRef.current?.focus({ preventScroll: true });
    let frame = 0;
    if (!reduceMotion) frame = requestAnimationFrame(() => setPhase('shown'));
    return () => {
      cancelAnimationFrame(frame);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (appRoot && madeInert) appRoot.inert = false;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      if (wakeRef.current?.touch) guardNextClick();
    };
  }, [reduceMotion]);

  const finish = useCallback(
    (delay: number) => {
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      finishTimerRef.current = setTimeout(onWake, delay);
    },
    [onWake],
  );

  /** The first gesture only wakes Domus: it is held here and never reaches the page. */
  const startWake = useCallback(
    (waiting: 'pointer' | 'key' | null, touch = false) => {
      if (wakeRef.current) return;
      wakeRef.current = { waiting, touch };
      setPhase('leaving');
      if (waiting === null) finish(reduceMotion ? 0 : FADE_MS);
      // A gesture whose end never arrives here still lets the screen go.
      else fallbackTimerRef.current = setTimeout(onWake, WAKE_FALLBACK_MS);
    },
    [finish, onWake, reduceMotion],
  );

  const endGesture = useCallback(
    (kind: 'pointer' | 'key') => {
      if (wakeRef.current?.waiting === kind) finish(WAKE_RELEASE_MS);
    },
    [finish],
  );

  /*
   * Every gesture is taken at the very start of its way, on the window in the
   * capture phase, so nothing of the page sees it: no button, no card, and no
   * open dialog that would close on an outside tap or on Escape.
   */
  useEffect(() => {
    const handle = (event: Event) => {
      event.stopImmediatePropagation();
      if (event.cancelable) event.preventDefault();
      switch (event.type) {
        case 'pointerdown': {
          const { pointerType } = event as PointerEvent;
          startWake('pointer', pointerType === 'touch' || pointerType === 'pen');
          break;
        }
        case 'touchstart':
          if (wakeRef.current) wakeRef.current.touch = true;
          else startWake('pointer', true);
          break;
        case 'pointerup':
        case 'touchend':
          endGesture('pointer');
          break;
        case 'keydown':
          startWake('key');
          break;
        case 'keyup':
          endGesture('key');
          break;
        case 'wheel':
          startWake(null);
          break;
        case 'pointermove': {
          const move = event as PointerEvent;
          // Fingers and pens wake on touch; only a mouse wakes by moving.
          if (move.pointerType === 'touch' || move.pointerType === 'pen') break;
          const origin = moveOriginRef.current;
          if (!origin) moveOriginRef.current = { x: move.clientX, y: move.clientY };
          else if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) >= WAKE_MOVE_PX) startWake(null);
          break;
        }
        default:
        // mousedown, mouseup, click and the like: only kept from the page.
      }
    };
    const options: AddEventListenerOptions = { capture: true, passive: false };
    CAPTURED_EVENTS.forEach((type) => window.addEventListener(type, handle, options));
    return () => CAPTURED_EVENTS.forEach((type) => window.removeEventListener(type, handle, options));
  }, [endGesture, startWake]);

  return (
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('screensaver.label')}
      tabIndex={-1}
      data-testid="domus-screensaver"
      data-source={session.source}
      data-mode={session.preferences.mode}
      className="fixed inset-0 z-[600] select-none outline-none"
      style={{
        opacity: phase === 'shown' ? 1 : 0,
        transition: reduceMotion ? undefined : `opacity ${FADE_MS}ms ease-out`,
        touchAction: 'none',
        cursor: 'none',
      }}
    >
      <ScreensaverDisplay
        mode={session.preferences.mode}
        showDate={session.preferences.showDate}
        appearance={appearance}
        background={background}
        reduceMotion={reduceMotion}
      />
    </div>
  );
}

/** Keeps the click a touch can still produce after the overlay is gone. */
function guardNextClick() {
  const block = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener('click', block, true);
  };
  window.addEventListener('click', block, true);
  setTimeout(() => window.removeEventListener('click', block, true), TOUCH_CLICK_GUARD_MS);
}

export default ScreensaverOverlay;
