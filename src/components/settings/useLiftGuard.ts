import { useEffect } from 'react';

/*
 * A long press opens the panel while the finger is still down. When it lifts, the
 * browser sends a click to whatever now lies under it: the backdrop, which would
 * close the sheet at once, or a control of the panel, which would press it. That
 * click belongs to the gesture that is over, so it stops here.
 *
 * It is recognised by its order: a lift with no press since the panel opened. Any
 * new press is a new gesture and ends the guard, so nothing else is ever held back.
 */

const LIFT_CLICK_WINDOW_MS = 800;

export function useLiftGuard(openId: string | null | undefined) {
  useEffect(() => {
    if (!openId) return undefined;
    let lifted = false;
    let timer: number | undefined;

    const stop = () => {
      window.removeEventListener('pointerdown', stop, true);
      window.removeEventListener('pointerup', onLift, true);
      window.removeEventListener('click', onClick, true);
      window.clearTimeout(timer);
    };
    const onLift = () => {
      lifted = true;
      timer = window.setTimeout(stop, LIFT_CLICK_WINDOW_MS);
    };
    const onClick = (event: MouseEvent) => {
      if (lifted) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
      stop();
    };

    window.addEventListener('pointerdown', stop, true);
    window.addEventListener('pointerup', onLift, true);
    window.addEventListener('click', onClick, true);
    return stop;
  }, [openId]);
}
