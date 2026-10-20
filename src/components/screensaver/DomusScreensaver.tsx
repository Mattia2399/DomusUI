import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LazyLoadErrorBoundary } from '../common/LazyLoadBoundary';
import type { DashboardAppearance, DashboardBackgroundPreset } from '../../theme/dashboardTheme';
import { startIdleController, type IdleController } from './idleController';
import type { ScreensaverSession } from './ScreensaverOverlay';
import { onScreensaverPreviewRequest, useScreensaverPreferences } from './screensaverPreferences';

/*
 * The screensaver of this device: one runtime for the whole app, mounted once
 * by the dashboard. It is an overlay of Domus, never a display or OS control.
 * Here stays only what must always run: the idle countdown, the preferences
 * and the preview request. What is shown, and the overlay that takes the
 * waking gesture (ScreensaverOverlay), load on demand, ahead of time once the
 * screensaver is on, so it never appears late. If that code cannot load, the
 * screensaver simply does not appear: the dashboard is never affected.
 */
const loadOverlay = () => import('./ScreensaverOverlay');
const ScreensaverOverlay = React.lazy(loadOverlay);

type Session = ScreensaverSession;

type DomusScreensaverProps = {
  /** The current address: a navigation is activity. */
  route: string;
  appearance: DashboardAppearance;
  background: DashboardBackgroundPreset;
};

/** Runs the idle countdown and shows the screensaver over everything. */
export function DomusScreensaver({ route, appearance, background }: DomusScreensaverProps) {
  const preferences = useScreensaverPreferences();
  const [session, setSession] = useState<Session | null>(null);
  const controllerRef = useRef<IdleController | null>(null);
  const { enabled, timeoutMinutes, mode, showDate } = preferences;

  // Any change of the configuration starts the countdown again from now.
  useEffect(() => {
    if (!enabled) {
      // Turned off while showing: it closes at once.
      setSession((current) => (current?.source === 'idle' ? null : current));
      return undefined;
    }
    void loadOverlay();
    const controller = startIdleController({
      timeoutMs: timeoutMinutes * 60_000,
      onIdle: () => setSession((current) => current ?? { source: 'idle', preferences }),
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
    // `preferences` is read for the session only; the four values decide the restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeoutMinutes, mode, showDate]);

  useEffect(() => {
    controllerRef.current?.reset();
  }, [route]);

  useEffect(
    () =>
      onScreensaverPreviewRequest((previewPreferences) => {
        void loadOverlay();
        setSession({ source: 'preview', preferences: previewPreferences });
      }),
    [],
  );

  const handleWake = useCallback(() => {
    setSession((current) => {
      // A preview leaves the countdown as it was.
      if (current?.source === 'idle') controllerRef.current?.reset();
      return null;
    });
  }, []);

  if (!session || typeof document === 'undefined') return null;
  return createPortal(
    <LazyLoadErrorBoundary failure={null}>
      <React.Suspense fallback={null}>
        <ScreensaverOverlay session={session} appearance={appearance} background={background} onWake={handleWake} />
      </React.Suspense>
    </LazyLoadErrorBoundary>,
    document.body,
  );
}

export default DomusScreensaver;
