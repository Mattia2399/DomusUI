import { enterFullscreen, readFullscreenStatus } from './kioskDisplay';
import { getKioskPreferences, saveKioskPreferences } from './kioskPreferences';
import { requestKioskLaunch, updateKioskSession } from './kioskSession';

/** Asks for full screen inside the tap that wants it, and keeps the result in the session. */
export function askKioskFullscreen() {
  void enterFullscreen().then((result) => {
    updateKioskSession({ fullscreen: result === 'active' ? readFullscreenStatus('inactive') : result });
  });
}

/**
 * "Start panel mode": call it from the tap itself. Full screen is asked
 * first, while the browser still counts the gesture; then the dashboard
 * hides its navigation and opens the start page.
 */
export function startKioskPanel() {
  const preferences = getKioskPreferences();
  if (!preferences.enabled) saveKioskPreferences({ ...preferences, enabled: true });
  if (preferences.preferFullscreen) askKioskFullscreen();
  requestKioskLaunch();
}
