import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, House, Maximize, MonitorSmartphone, Play, Sun } from 'lucide-react';
import { useKioskCopy, type KioskCopyKey } from '../../i18n/kioskCopy';
import { isStandaloneDisplay, supportsFullscreen, supportsWakeLock, type FullscreenStatus, type WakeLockStatus } from '../kiosk/kioskDisplay';
import {
  DEFAULT_KIOSK_START_ROUTE,
  resolveKioskStartRoute,
  saveKioskPreferences,
  useKioskPreferences,
  type KioskPreferences,
} from '../kiosk/kioskPreferences';
import { startKioskPanel } from '../kiosk/kioskLaunch';
import { useKioskSession } from '../kiosk/kioskSession';
import GlassDropdown from '../ui/GlassDropdown';
import GlassToggle from '../ui/GlassToggle';
import ProfileGroup from './ProfileGroup';

const ICON = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-transparent text-white shadow-[0_6px_14px_var(--ui-shadow-soft)]';

const FULLSCREEN_COPY: Record<FullscreenStatus, KioskCopyKey> = {
  active: 'fullscreenActive',
  inactive: 'fullscreenInactive',
  unsupported: 'fullscreenUnsupported',
  rejected: 'fullscreenRejected',
  standalone: 'fullscreenStandalone',
};

const WAKE_LOCK_COPY: Record<WakeLockStatus, KioskCopyKey> = {
  active: 'wakeLockActive',
  inactive: 'wakeLockInactive',
  released: 'wakeLockReleased',
  unsupported: 'wakeLockUnsupported',
  error: 'wakeLockError',
};

type KioskSettingsProps = {
  /** The main pages the person can reach now, as the navigation names them. */
  startRoutes: readonly { path: string; label: string }[];
};

function Row({
  icon,
  color,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <span className={`${ICON} ${color}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

/**
 * Settings › This device › Kiosk mode. Every choice is kept at once in this
 * browser; the panel itself starts with its own button, from a real tap, as
 * browsers require for full screen.
 */
export function KioskSettings({ startRoutes }: KioskSettingsProps) {
  const c = useKioskCopy();
  const preferences = useKioskPreferences();
  const session = useKioskSession();
  const reduceMotion = useReducedMotion();
  const [storageFailed, setStorageFailed] = useState(false);

  const update = (change: Partial<KioskPreferences>) => {
    setStorageFailed(!saveKioskPreferences({ ...preferences, ...change }));
  };

  const routes = startRoutes.length > 0 ? startRoutes : [{ path: DEFAULT_KIOSK_START_ROUTE, label: 'Home' }];
  const startRoute = resolveKioskStartRoute(
    preferences.startRoute,
    routes.map(({ path }) => path),
  );
  const startOptions = routes.map(({ path, label }) => ({ id: path, name: label }));
  // Before the panel starts, the status says what this browser can do.
  const fullscreen: FullscreenStatus = session.active
    ? session.fullscreen
    : isStandaloneDisplay()
      ? 'standalone'
      : supportsFullscreen()
        ? 'inactive'
        : 'unsupported';
  const wakeLock: WakeLockStatus = session.active ? session.wakeLock : supportsWakeLock() ? 'inactive' : 'unsupported';
  const reveal = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, height: 0, overflow: 'hidden' },
        animate: { opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } },
        exit: { opacity: 0, height: 0, overflow: 'hidden' },
        transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
      };

  return (
    <div className="space-y-6">
      <div>
        <ProfileGroup title={c('group')}>
          <Row
            icon={<MonitorSmartphone size={17} aria-hidden="true" />}
            color="bg-slate-600"
            title={c('toggle')}
            hint={preferences.enabled ? c('onBody') : c('offBody')}
          >
            <GlassToggle checked={preferences.enabled} onChange={(enabled) => update({ enabled })} label={c('toggle')} />
          </Row>
        </ProfileGroup>
        <p className="mt-2 px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
          {storageFailed ? c('storageUnavailable') : c('notSecurity')}
        </p>
      </div>

      <AnimatePresence initial={false}>
        {preferences.enabled ? (
          <motion.div key="details" {...reveal}>
            <div className="space-y-6 pb-1">
              <ProfileGroup title={c('experienceGroup')}>
                <Row
                  icon={preferences.hideNavigation ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  color="bg-indigo-500"
                  title={c('hideNavigation')}
                  hint={c('hideNavigationHint')}
                >
                  <GlassToggle
                    checked={preferences.hideNavigation}
                    onChange={(hideNavigation) => update({ hideNavigation })}
                    label={c('hideNavigation')}
                  />
                </Row>
                <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`${ICON} bg-sky-500`}>
                      <House size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{c('startPage')}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">{c('startPageHint')}</span>
                    </span>
                  </div>
                  <GlassDropdown
                    ariaLabel={c('startPage')}
                    className="w-full sm:w-48"
                    options={startOptions}
                    selected={startOptions.find((option) => option.id === startRoute) ?? null}
                    onChange={(option) => update({ startRoute: option.id })}
                  />
                </div>
              </ProfileGroup>

              <ProfileGroup title={c('displayGroup')}>
                <Row icon={<Sun size={17} aria-hidden="true" />} color="bg-amber-500" title={c('keepAwake')} hint={c('keepAwakeHint')}>
                  <GlassToggle
                    checked={preferences.keepScreenAwake}
                    onChange={(keepScreenAwake) => update({ keepScreenAwake })}
                    label={c('keepAwake')}
                  />
                </Row>
                <Row icon={<Maximize size={17} aria-hidden="true" />} color="bg-emerald-600" title={c('fullscreen')} hint={c('fullscreenHint')}>
                  <GlassToggle
                    checked={preferences.preferFullscreen}
                    onChange={(preferFullscreen) => update({ preferFullscreen })}
                    label={c('fullscreen')}
                  />
                </Row>
              </ProfileGroup>

              <ProfileGroup title={c('statusGroup')}>
                {[
                  { title: c('statusFullscreen'), value: c(FULLSCREEN_COPY[fullscreen]), on: fullscreen === 'active' || fullscreen === 'standalone' },
                  { title: c('statusWakeLock'), value: c(WAKE_LOCK_COPY[wakeLock]), on: wakeLock === 'active' },
                ].map((status) => (
                  <div key={status.title} className="flex items-center justify-between gap-3 px-4 py-3.5" data-testid="kiosk-status">
                    <span className="text-sm font-semibold">{status.title}</span>
                    <span className="inline-flex min-w-0 items-center gap-2 text-right text-sm text-[color:var(--ui-text-secondary)]">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${status.on ? 'bg-emerald-500' : 'bg-[color:var(--ui-text-tertiary)] opacity-60'}`}
                      />
                      {status.value}
                    </span>
                  </div>
                ))}
              </ProfileGroup>

              <div>
                <button
                  type="button"
                  className="liquid-glass-selection inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold sm:w-auto"
                  onClick={() => startKioskPanel()}
                >
                  <Play size={15} aria-hidden="true" />
                  {c('launch')}
                </button>
                <p className="mt-2 px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{c('launchHint')}</p>
                <p className="mt-1 px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{c('exitHint')}</p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default KioskSettings;
