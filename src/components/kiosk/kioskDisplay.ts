/**
 * The two browser features Kiosk can ask for, by feature detection only.
 * Both are enhancements: Kiosk works without them. Each tab has its own
 * full screen and its own wake lock; neither is ever shared or stored.
 */

export type FullscreenStatus = 'active' | 'inactive' | 'unsupported' | 'rejected' | 'standalone';
export type WakeLockStatus = 'active' | 'inactive' | 'released' | 'unsupported' | 'error';

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};
type WakeLockNavigator = { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };
type VisibilityDocument = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/** Full screen of the Domus document; inside the Home Assistant panel it fills the screen with Domus only. */
export function supportsFullscreen(doc: Document = document): boolean {
  return Boolean(doc.fullscreenEnabled) && typeof doc.documentElement?.requestFullscreen === 'function';
}

export function isFullscreen(doc: Document = document): boolean {
  return Boolean(doc.fullscreenElement);
}

/** An installed app already without browser bars. */
export function isStandaloneDisplay(win: Pick<Window, 'matchMedia'> = window): boolean {
  try {
    return win.matchMedia('(display-mode: fullscreen)').matches || win.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function supportsWakeLock(nav: WakeLockNavigator = navigator as unknown as WakeLockNavigator): boolean {
  return typeof nav?.wakeLock?.request === 'function';
}

// Full screen Domus asked for in this tab: leaving Kiosk leaves it; one the person chose stays.
let ownsFullscreen = false;

/** Asks for full screen; only from a tap or a key, as browsers require. */
export async function enterFullscreen(doc: Document = document): Promise<'active' | 'unsupported' | 'rejected'> {
  if (!supportsFullscreen(doc)) return 'unsupported';
  if (doc.fullscreenElement) return 'active';
  try {
    await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    ownsFullscreen = true;
    return 'active';
  } catch {
    return 'rejected';
  }
}

/** Leaves the full screen Domus asked for, and only that one. */
export async function leaveOwnedFullscreen(doc: Document = document): Promise<void> {
  if (!ownsFullscreen) return;
  ownsFullscreen = false;
  await leaveFullscreen(doc);
}

/** What full screen is now, keeping a refusal in view until something changes. */
export function readFullscreenStatus(previous: FullscreenStatus, doc: Document = document): FullscreenStatus {
  if (isStandaloneDisplay()) return 'standalone';
  if (!supportsFullscreen(doc)) return 'unsupported';
  if (isFullscreen(doc)) return 'active';
  return previous === 'rejected' ? 'rejected' : 'inactive';
}

export async function leaveFullscreen(doc: Document = document): Promise<void> {
  if (!doc.fullscreenElement || typeof doc.exitFullscreen !== 'function') return;
  try {
    await doc.exitFullscreen();
  } catch {
    // Already left, or the browser keeps it: nothing to undo.
  }
}

export type ScreenWakeLock = { start: () => void; stop: () => void };

/**
 * Keeps the screen awake while wanted and the page is visible. The browser
 * may let go at any time (hidden page, battery saver): it is asked again
 * once when the page is visible again, never in a loop.
 */
export function createScreenWakeLock({
  onStatus,
  nav = navigator as unknown as WakeLockNavigator,
  doc = document,
}: {
  onStatus: (status: WakeLockStatus) => void;
  nav?: WakeLockNavigator;
  doc?: VisibilityDocument;
}): ScreenWakeLock {
  let wanted = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let requesting = false;

  const acquire = async () => {
    if (!supportsWakeLock(nav)) {
      onStatus('unsupported');
      return;
    }
    if (!wanted || requesting || sentinel || doc.visibilityState !== 'visible') return;
    requesting = true;
    try {
      const lock = await nav.wakeLock!.request('screen');
      if (!wanted) {
        void lock.release().catch(() => undefined);
        return;
      }
      sentinel = lock;
      lock.addEventListener('release', () => {
        if (sentinel === lock) sentinel = null;
        if (wanted) onStatus('released');
      });
      onStatus('active');
    } catch {
      // Refused (permission, battery saver): asked again only when the page comes back.
      onStatus('error');
    } finally {
      requesting = false;
    }
  };

  const handleVisibility = () => {
    if (doc.visibilityState === 'visible') void acquire();
  };

  return {
    start: () => {
      if (wanted) return;
      wanted = true;
      doc.addEventListener('visibilitychange', handleVisibility);
      void acquire();
    },
    stop: () => {
      if (!wanted) return;
      wanted = false;
      doc.removeEventListener('visibilitychange', handleVisibility);
      const lock = sentinel;
      sentinel = null;
      if (lock && !lock.released) void lock.release().catch(() => undefined);
      onStatus(supportsWakeLock(nav) ? 'inactive' : 'unsupported');
    },
  };
}
