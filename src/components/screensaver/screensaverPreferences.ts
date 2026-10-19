import { useSyncExternalStore } from 'react';

/**
 * Screensaver preferences of this browser (Settings › This device). They
 * never leave it: no profile, no house document, no DomusOS command.
 */
export const SCREENSAVER_STORAGE_KEY = 'domusui.screensaver.v1';
const SCREENSAVER_STORAGE_VERSION = 1;

export const SCREENSAVER_TIMEOUT_MINUTES = [1, 2, 5, 10, 15, 30] as const;
export type ScreensaverTimeoutMinutes = (typeof SCREENSAVER_TIMEOUT_MINUTES)[number];
export const SCREENSAVER_MODES = ['minimal', 'ambient'] as const;
export type ScreensaverMode = (typeof SCREENSAVER_MODES)[number];

export type ScreensaverPreferences = Readonly<{
  enabled: boolean;
  timeoutMinutes: ScreensaverTimeoutMinutes;
  mode: ScreensaverMode;
  showDate: boolean;
}>;

/** Off until someone turns it on on this device. */
export const DEFAULT_SCREENSAVER_PREFERENCES: ScreensaverPreferences = Object.freeze({
  enabled: false,
  timeoutMinutes: 5,
  mode: 'minimal',
  showDate: true,
});

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reads a stored document. Anything unreadable, of another version or not an
 * object gives the defaults, so the screensaver is off; a single invalid field
 * falls back on its own default, and `enabled` is on only when it says `true`.
 * Unknown fields are ignored.
 */
export function parseScreensaverPreferences(value: unknown): ScreensaverPreferences {
  if (!isRecord(value) || value.version !== SCREENSAVER_STORAGE_VERSION) return DEFAULT_SCREENSAVER_PREFERENCES;
  const defaults = DEFAULT_SCREENSAVER_PREFERENCES;
  const timeout = value.timeoutMinutes;
  const mode = value.mode;
  return {
    enabled: value.enabled === true,
    timeoutMinutes: (SCREENSAVER_TIMEOUT_MINUTES as readonly unknown[]).includes(timeout)
      ? (timeout as ScreensaverTimeoutMinutes)
      : defaults.timeoutMinutes,
    mode: (SCREENSAVER_MODES as readonly unknown[]).includes(mode) ? (mode as ScreensaverMode) : defaults.mode,
    showDate: typeof value.showDate === 'boolean' ? value.showDate : defaults.showDate,
  };
}

export function serializeScreensaverPreferences(preferences: ScreensaverPreferences): string {
  const { enabled, timeoutMinutes, mode, showDate } = parseScreensaverPreferences({
    ...preferences,
    version: SCREENSAVER_STORAGE_VERSION,
  });
  return JSON.stringify({ version: SCREENSAVER_STORAGE_VERSION, enabled, timeoutMinutes, mode, showDate });
}

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readScreensaverPreferences(storage: PreferenceStorage | null = browserStorage()): ScreensaverPreferences {
  try {
    const raw = storage?.getItem(SCREENSAVER_STORAGE_KEY);
    return raw ? parseScreensaverPreferences(JSON.parse(raw)) : DEFAULT_SCREENSAVER_PREFERENCES;
  } catch {
    return DEFAULT_SCREENSAVER_PREFERENCES;
  }
}

// One shared copy for the whole page: the Settings page writes, the runtime follows at once.
let current: ScreensaverPreferences | null = null;
const listeners = new Set<() => void>();

function snapshot(): ScreensaverPreferences {
  if (current === null) current = readScreensaverPreferences();
  return current;
}

function publish(next: ScreensaverPreferences) {
  current = next;
  listeners.forEach((listener) => listener());
}

// Another tab of this browser changed them.
function handleStorage(event: StorageEvent) {
  if (event.key === SCREENSAVER_STORAGE_KEY || event.key === null) publish(readScreensaverPreferences());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    // Nobody was listening: another tab may have changed them meanwhile.
    current = readScreensaverPreferences();
    if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', handleStorage);
  };
}

/** Saves and applies the preferences; false when this browser keeps nothing. */
export function saveScreensaverPreferences(
  next: ScreensaverPreferences,
  storage: PreferenceStorage | null = browserStorage(),
): boolean {
  const serialized = serializeScreensaverPreferences(next);
  const normalized = parseScreensaverPreferences(JSON.parse(serialized));
  let saved = false;
  try {
    storage?.setItem(SCREENSAVER_STORAGE_KEY, serialized);
    saved = Boolean(storage);
  } catch {
    saved = false;
  }
  // Applied for this visit even when it cannot be kept.
  publish(normalized);
  return saved;
}

export function useScreensaverPreferences(): ScreensaverPreferences {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_SCREENSAVER_PREFERENCES);
}

/** Forget the shared copy (tests). */
export function resetScreensaverPreferencesCache() {
  current = null;
}

// Settings › Screensaver asks the runtime for a preview; nothing is saved or reset by it.
type PreviewListener = (preferences: ScreensaverPreferences) => void;
const previewListeners = new Set<PreviewListener>();

export function requestScreensaverPreview(preferences: ScreensaverPreferences) {
  previewListeners.forEach((listener) => listener(preferences));
}

export function onScreensaverPreviewRequest(listener: PreviewListener) {
  previewListeners.add(listener);
  return () => {
    previewListeners.delete(listener);
  };
}
