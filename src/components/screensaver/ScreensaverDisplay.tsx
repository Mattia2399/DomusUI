import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { DashboardAppearance, DashboardBackgroundPreset } from '../../theme/dashboardTheme';
import type { ScreensaverMode } from './screensaverPreferences';

/*
 * What the screensaver shows: the time, the date if wanted, and almost
 * nothing else. Loaded on demand by DomusScreensaver.
 */

// The composition moves a few pixels every few minutes, never continuously.
export const BURN_IN_INTERVAL_MS = 3 * 60_000;
/** Offsets in px, in order: the same path every time, always inside the safe area. */
export const BURN_IN_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [14, 0],
  [0, 12],
  [-14, 0],
  [0, -12],
  [10, 10],
  [-10, -10],
  [10, -10],
  [-10, 10],
];
const WAKE_HINT_MS = 6_000;

export function burnInOffset(step: number): readonly [number, number] {
  const index = ((step % BURN_IN_OFFSETS.length) + BURN_IN_OFFSETS.length) % BURN_IN_OFFSETS.length;
  return BURN_IN_OFFSETS[index];
}

/** The current time, updated when the minute changes; no timer per second. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextMinute = () => {
      const current = Date.now();
      timer = setTimeout(() => {
        setNow(new Date());
        scheduleNextMinute();
      }, 60_000 - (current % 60_000) + 20);
    };
    scheduleNextMinute();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** The step of the burn-in path, moving on every interval. */
export function useBurnInStep(): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((current) => current + 1), BURN_IN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return step;
}

/** Hours and minutes in the reader's language and its usual 12/24 h, with any AM/PM apart. */
export function formatScreensaverTime(date: Date, locale: string, timeZone?: string) {
  const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).formatToParts(date);
  const period = parts.find((part) => part.type === 'dayPeriod')?.value ?? null;
  const time = parts
    .filter((part) => part.type !== 'dayPeriod')
    .map((part) => part.value)
    .join('')
    .trim();
  return { time, period };
}

export function formatScreensaverDate(date: Date, locale: string, timeZone?: string) {
  const text = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(date);
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

type ScreensaverDisplayProps = {
  mode: ScreensaverMode;
  showDate: boolean;
  appearance: DashboardAppearance;
  background: DashboardBackgroundPreset;
  reduceMotion: boolean;
};

export function ScreensaverDisplay({ mode, showDate, appearance, background, reduceMotion }: ScreensaverDisplayProps) {
  const { locale, t } = useI18n();
  const now = useMinuteClock();
  const step = useBurnInStep();
  const [hintVisible, setHintVisible] = useState(true);
  const { time, period } = useMemo(() => formatScreensaverTime(now, locale), [now, locale]);
  const date = useMemo(() => formatScreensaverDate(now, locale), [now, locale]);
  const [offsetX, offsetY] = burnInOffset(step);
  const ambient = mode === 'ambient';
  const lightAmbient = ambient && appearance === 'light';

  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), WAKE_HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  const quiet = lightAmbient ? 'text-black/55' : 'text-white/50';

  return (
    <div
      className={
        ambient
          ? `dashboard-shell dashboard-theme-${appearance} dashboard-background-${background} isolate absolute inset-0 overflow-hidden`
          : 'absolute inset-0 overflow-hidden bg-black'
      }
      data-testid="domus-screensaver-display"
    >
      {ambient ? (
        <>
          <div aria-hidden className="dashboard-background-layer" />
          {background === 'neutral' ? (
            // The plain background has no picture: a soft light keeps Ambient from being a flat screen.
            <div
              aria-hidden
              data-testid="domus-screensaver-ambient-light"
              className="absolute inset-0"
              style={{
                backgroundImage: lightAmbient
                  ? 'radial-gradient(circle at 18% 14%, rgb(140 170 255 / 0.32), transparent 46%), radial-gradient(circle at 84% 86%, rgb(255 196 128 / 0.3), transparent 44%)'
                  : 'radial-gradient(circle at 18% 14%, rgb(96 120 255 / 0.3), transparent 46%), radial-gradient(circle at 84% 86%, rgb(255 168 92 / 0.2), transparent 44%)',
              }}
            />
          ) : null}
          {/* Calmer than the dashboard: the picture stays, the words stay readable. */}
          <div aria-hidden className={`absolute inset-0 ${lightAmbient ? 'bg-white/25' : 'bg-black/45'}`} />
        </>
      ) : null}

      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-6"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        }}
      >
        <div
          data-testid="domus-screensaver-composition"
          data-burn-in-step={step % BURN_IN_OFFSETS.length}
          className="flex flex-col items-center text-center"
          style={{
            transform: `translate3d(${offsetX}px, ${offsetY}px, 0)`,
            // A slow glide every few minutes; with reduced motion it simply jumps.
            transition: reduceMotion ? undefined : 'transform 2.4s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          <p
            className={`flex items-baseline font-extralight leading-none tracking-[-0.045em] tabular-nums ${
              lightAmbient ? 'text-black/85' : ambient ? 'text-white' : 'text-white/[0.88]'
            }`}
            style={{ fontSize: 'clamp(4.5rem, min(22vw, 30vh), 13rem)' }}
          >
            <time dateTime={now.toISOString()} data-testid="domus-screensaver-time">
              {time}
            </time>
            {period ? (
              <span className="ml-[0.18em] text-[0.24em] font-normal tracking-normal" data-testid="domus-screensaver-period">
                {period}
              </span>
            ) : null}
          </p>
          {showDate ? (
            <p
              data-testid="domus-screensaver-date"
              className={`mt-[0.9em] text-[clamp(1rem,2.6vw,1.6rem)] font-normal tracking-[0.01em] ${quiet}`}
            >
              {date}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-2"
        style={{
          bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          // The mark moves with the clock: nothing stays on the same pixels for hours.
          transform: `translate3d(${-offsetX}px, ${-offsetY / 2}px, 0)`,
          transition: reduceMotion ? undefined : 'transform 2.4s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <p
          aria-hidden={!hintVisible}
          className={`text-xs font-medium ${quiet}`}
          style={{
            opacity: hintVisible ? 1 : 0,
            transition: reduceMotion ? undefined : 'opacity 1.2s ease',
          }}
        >
          {t('screensaver.wakeHint')}
        </p>
        <p
          aria-hidden
          className={`text-[10px] font-semibold uppercase tracking-[0.42em] ${lightAmbient ? 'text-black/25' : 'text-white/20'}`}
        >
          Domus
        </p>
      </div>
    </div>
  );
}

export default ScreensaverDisplay;
