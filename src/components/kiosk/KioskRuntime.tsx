import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import GlassModal from '../ui/GlassModal';
import { createScreenWakeLock, leaveOwnedFullscreen, readFullscreenStatus, supportsFullscreen } from './kioskDisplay';
import { askKioskFullscreen } from './kioskLaunch';
import { saveKioskPreferences, useKioskPreferences } from './kioskPreferences';
import { getKioskSession, updateKioskSession, useKioskSession } from './kioskSession';

/*
 * The running panel, loaded only on a Kiosk device: it follows full screen,
 * keeps the screen awake and offers the way out. Mounted while the panel is
 * on; unmounting it is the cleanup (wake lock released, Domus's own full
 * screen left). Inactivity stays with the screensaver.
 */

// Held this long on the corner, Kiosk offers to close; a tap does nothing.
export const KIOSK_EXIT_HOLD_MS = 3_000;
const HOLD_MOVE_TOLERANCE_PX = 12;

export function KioskRuntime() {
  const { t } = useI18n();
  const preferences = useKioskPreferences();
  const session = useKioskSession();
  const [exitOpen, setExitOpen] = useState(false);
  const { keepScreenAwake, hideNavigation, preferFullscreen } = preferences;

  // Full screen belongs to this tab: followed here, never stored.
  useEffect(() => {
    const sync = () => updateKioskSession({ fullscreen: readFullscreenStatus(getKioskSession().fullscreen) });
    sync();
    // Leaving full screen (Esc, a browser gesture) keeps Kiosk on.
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      void leaveOwnedFullscreen();
      updateKioskSession({ fullscreen: 'inactive' });
    };
  }, []);

  useEffect(() => {
    if (!keepScreenAwake) {
      updateKioskSession({ wakeLock: 'inactive' });
      return undefined;
    }
    const lock = createScreenWakeLock({ onStatus: (wakeLock) => updateKioskSession({ wakeLock }) });
    lock.start();
    return () => lock.stop();
  }, [keepScreenAwake]);

  // The keyboard way out: Ctrl+Alt+K. Nothing else is taken from the keyboard.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey && event.code === 'KeyK') {
        event.preventDefault();
        setExitOpen(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const canReturnToFullscreen =
    preferFullscreen && session.fullscreen !== 'active' && session.fullscreen !== 'standalone' && supportsFullscreen();

  return (
    <>
      {hideNavigation ? <KioskExitHandle label={t('kiosk.exit.handle')} onHold={() => setExitOpen(true)} /> : null}
      <GlassModal
        isOpen={exitOpen}
        onClose={() => setExitOpen(false)}
        title={t('kiosk.exit.title')}
        description={t('kiosk.exit.body')}
        variant="dialog"
        size="sm"
        footer={(
          <div className="flex flex-col gap-3">
            {canReturnToFullscreen ? (
              <button
                type="button"
                className="liquid-glass-control inline-flex min-h-10 w-full items-center justify-center px-4 text-sm font-semibold"
                onClick={() => {
                  setExitOpen(false);
                  askKioskFullscreen();
                }}
              >
                {t('kiosk.exit.fullscreen')}
              </button>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="liquid-glass-control inline-flex min-h-10 items-center justify-center px-4 text-sm font-semibold"
                onClick={() => setExitOpen(false)}
              >
                {t('kiosk.exit.cancel')}
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-accent-strong)] px-5 text-sm font-semibold text-[color:var(--ui-accent-contrast)]"
                onClick={() => {
                  setExitOpen(false);
                  // The page stays where it is; only Kiosk ends.
                  saveKioskPreferences({ ...preferences, enabled: false });
                }}
              >
                {t('kiosk.exit.confirm')}
              </button>
            </div>
          </div>
        )}
      />
    </>
  );
}

/**
 * A small corner handle: held for three seconds it offers to leave Kiosk.
 * Not a lock: it only keeps a passing hand from closing the panel.
 */
function KioskExitHandle({ label, onHold }: { label: string; onHold: () => void }) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    originRef.current = null;
    setHolding(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  return (
    <button
      type="button"
      data-testid="kiosk-exit-handle"
      aria-label={label}
      title={label}
      className="group fixed z-[190] flex h-11 w-11 touch-none select-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-focus-ring)]"
      style={{
        left: 'max(0.25rem, env(safe-area-inset-left))',
        bottom: 'max(0.25rem, env(safe-area-inset-bottom))',
        WebkitTouchCallout: 'none',
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        originRef.current = { x: event.clientX, y: event.clientY };
        setHolding(true);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setHolding(false);
          onHold();
        }, KIOSK_EXIT_HOLD_MS);
      }}
      onPointerMove={(event) => {
        const origin = originRef.current;
        if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > HOLD_MOVE_TOLERANCE_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(event) => event.preventDefault()}
      // A key press (Enter, Space) is deliberate: it opens the question at once. A tap does not.
      onClick={(event) => {
        if (event.detail === 0) onHold();
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
        <circle cx="12" cy="12" r="3" className="fill-[color:var(--ui-text-tertiary)] opacity-40 group-focus-visible:opacity-90" />
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={100}
          className="kiosk-exit-progress stroke-[color:var(--ui-accent)]"
          data-holding={holding}
          style={{ strokeDasharray: 100, strokeDashoffset: holding ? 0 : 100 }}
        />
      </svg>
    </button>
  );
}

export default KioskRuntime;
