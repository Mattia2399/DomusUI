import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, Clock3, MoonStar, Play, Sparkles } from 'lucide-react';
import { useScreensaverCopy } from '../../i18n/screensaverCopy';
import {
  SCREENSAVER_TIMEOUT_MINUTES,
  requestScreensaverPreview,
  saveScreensaverPreferences,
  useScreensaverPreferences,
  type ScreensaverMode,
  type ScreensaverPreferences,
} from '../screensaver/screensaverPreferences';
import GlassDropdown from '../ui/GlassDropdown';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import GlassToggle from '../ui/GlassToggle';
import ProfileGroup from './ProfileGroup';

const ICON = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-transparent text-white shadow-[0_6px_14px_var(--ui-shadow-soft)]';

/**
 * Settings › This device › Screensaver. Like the other preferences of this
 * device, every change applies and is kept at once in this browser.
 */
export function ScreensaverSettings() {
  const c = useScreensaverCopy();
  const preferences = useScreensaverPreferences();
  const reduceMotion = useReducedMotion();
  const [storageFailed, setStorageFailed] = useState(false);

  const update = (change: Partial<ScreensaverPreferences>) => {
    setStorageFailed(!saveScreensaverPreferences({ ...preferences, ...change }));
  };

  const duration = (minutes: number) => c(minutes === 1 ? 'minuteOne' : 'minuteMany', { count: minutes });
  const timeoutOptions = SCREENSAVER_TIMEOUT_MINUTES.map((minutes) => ({ id: String(minutes), name: duration(minutes) }));
  const reveal = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        // Clipped only while it opens or closes, so the groups keep their shadows.
        initial: { opacity: 0, height: 0, overflow: 'hidden' },
        animate: { opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } },
        exit: { opacity: 0, height: 0, overflow: 'hidden' },
        transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
      };

  return (
    <div className="space-y-6">
      <div>
        <ProfileGroup title={c('group')}>
          <div className="flex items-center gap-3 px-4 py-4">
            <span className={`${ICON} bg-indigo-500`}>
              <MoonStar size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{c('toggle')}</span>
              <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                {preferences.enabled ? c('onBody', { duration: duration(preferences.timeoutMinutes) }) : c('offBody')}
              </span>
            </span>
            <GlassToggle checked={preferences.enabled} onChange={(enabled) => update({ enabled })} label={c('toggle')} />
          </div>
        </ProfileGroup>
        <p className="mt-2 px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
          {storageFailed ? c('storageUnavailable') : c('deviceNote')}
        </p>
      </div>

      <AnimatePresence initial={false}>
        {preferences.enabled ? (
          <motion.div key="details" {...reveal}>
            <div className="space-y-6 pb-1">
              <ProfileGroup title={c('activationGroup')}>
                <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`${ICON} bg-sky-500`}>
                      <Clock3 size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{c('startAfter')}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">{c('startAfterHint')}</span>
                    </span>
                  </div>
                  <GlassDropdown
                    ariaLabel={c('startAfter')}
                    className="w-full sm:w-44"
                    options={timeoutOptions}
                    selected={timeoutOptions.find((option) => option.id === String(preferences.timeoutMinutes)) ?? null}
                    onChange={(option) =>
                      update({ timeoutMinutes: Number(option.id) as ScreensaverPreferences['timeoutMinutes'] })
                    }
                  />
                </div>
              </ProfileGroup>

              <ProfileGroup title={c('appearanceGroup')}>
                <div className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`${ICON} bg-violet-500`}>
                      <Sparkles size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{c('mode')}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                        {preferences.mode === 'ambient' ? c('ambientHint') : c('minimalHint')}
                      </span>
                    </span>
                  </div>
                  <GlassSegmentSelect<ScreensaverMode>
                    ariaLabel={c('mode')}
                    className="mt-3"
                    value={preferences.mode}
                    onChange={(mode) => update({ mode })}
                    options={[
                      { value: 'minimal', label: c('minimal') },
                      { value: 'ambient', label: c('ambient') },
                    ]}
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-4">
                  <span className={`${ICON} bg-rose-500`}>
                    <CalendarDays size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold">{c('showDate')}</span>
                  <GlassToggle checked={preferences.showDate} onChange={(showDate) => update({ showDate })} label={c('showDate')} />
                </div>
              </ProfileGroup>

              <ProfileGroup title={c('previewGroup')} description={c('previewHint')}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[color:var(--ui-accent)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)] focus-visible:bg-[color:var(--ui-fill-tertiary)] focus-visible:outline-none"
                  onClick={() => requestScreensaverPreview(preferences)}
                >
                  <Play size={15} aria-hidden="true" />
                  {c('preview')}
                </button>
              </ProfileGroup>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default ScreensaverSettings;
