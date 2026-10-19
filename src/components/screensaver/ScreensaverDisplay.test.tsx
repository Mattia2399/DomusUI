import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import {
  BURN_IN_INTERVAL_MS,
  BURN_IN_OFFSETS,
  ScreensaverDisplay,
  burnInOffset,
  formatScreensaverDate,
  formatScreensaverTime,
} from './ScreensaverDisplay';

// A fixed instant read in UTC, so the runner's time zone never matters.
const MONDAY_AFTERNOON = new Date('2026-10-19T14:05:30Z');

function renderDisplay(props: Partial<Parameters<typeof ScreensaverDisplay>[0]> = {}) {
  return render(
    <I18nProvider>
      <ScreensaverDisplay mode="minimal" showDate appearance="dark" background="neutral" reduceMotion={false} {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('screensaver time and date', () => {
  it('writes the time as each language does, without seconds', () => {
    expect(formatScreensaverTime(MONDAY_AFTERNOON, 'it', 'UTC')).toEqual({ time: '14:05', period: null });
    expect(formatScreensaverTime(MONDAY_AFTERNOON, 'fr', 'UTC')).toEqual({ time: '14:05', period: null });
    expect(formatScreensaverTime(MONDAY_AFTERNOON, 'en', 'UTC')).toEqual({ time: '2:05', period: 'PM' });
  });

  it('writes the date in the language of Domus, with a capital first letter', () => {
    expect(formatScreensaverDate(MONDAY_AFTERNOON, 'it', 'UTC')).toBe('Lunedì 19 ottobre');
    expect(formatScreensaverDate(MONDAY_AFTERNOON, 'fr', 'UTC')).toBe('Lundi 19 octobre');
    expect(formatScreensaverDate(MONDAY_AFTERNOON, 'en', 'UTC')).toBe('Monday, October 19');
  });

  it('shows the time and changes it with the minute, not every second', () => {
    vi.setSystemTime(new Date(2026, 9, 19, 14, 5, 30));
    const setTimer = vi.spyOn(globalThis, 'setTimeout');
    renderDisplay();

    expect(screen.getByTestId('domus-screensaver-time').textContent).toBe('14:05');
    expect(screen.getByTestId('domus-screensaver-date').textContent).toBe('Lunedì 19 ottobre');
    // The next update is planned for the next minute, not in a second.
    const clockDelays = setTimer.mock.calls.map(([, delay]) => delay).filter((delay) => typeof delay === 'number');
    expect(clockDelays.some((delay) => delay! > 29_000 && delay! <= 30_100)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByTestId('domus-screensaver-time').textContent).toBe('14:05');
    act(() => {
      vi.advanceTimersByTime(1_100);
    });
    expect(screen.getByTestId('domus-screensaver-time').textContent).toBe('14:06');
    setTimer.mockRestore();
  });

  it('can leave the date out', () => {
    renderDisplay({ showDate: false });
    expect(screen.queryByTestId('domus-screensaver-date')).toBeNull();
  });

  it('keeps an English AM/PM apart from the digits', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    vi.setSystemTime(new Date(2026, 9, 19, 21, 40));
    renderDisplay();

    expect(screen.getByTestId('domus-screensaver-time').textContent).toBe('9:40');
    expect(screen.getByTestId('domus-screensaver-period').textContent).toBe('PM');
    expect(screen.getByText('Tap to return')).toBeTruthy();
  });
});

describe('screensaver burn-in protection', () => {
  it('follows a fixed path of small offsets', () => {
    expect(BURN_IN_OFFSETS[0]).toEqual([0, 0]);
    expect(BURN_IN_OFFSETS.every(([x, y]) => Math.abs(x) <= 16 && Math.abs(y) <= 16)).toBe(true);
    expect(burnInOffset(1)).toEqual(BURN_IN_OFFSETS[1]);
    expect(burnInOffset(BURN_IN_OFFSETS.length)).toEqual(BURN_IN_OFFSETS[0]);
    expect(burnInOffset(BURN_IN_OFFSETS.length + 2)).toEqual(burnInOffset(2));
  });

  it('moves the composition a step every interval, in the same order each time', () => {
    renderDisplay();
    const composition = () => screen.getByTestId('domus-screensaver-composition');
    const seen: string[] = [];

    for (let step = 0; step < BURN_IN_OFFSETS.length + 1; step += 1) {
      const [x, y] = BURN_IN_OFFSETS[step % BURN_IN_OFFSETS.length];
      expect(composition().style.transform).toBe(`translate3d(${x}px, ${y}px, 0)`);
      seen.push(composition().getAttribute('data-burn-in-step')!);
      act(() => {
        vi.advanceTimersByTime(BURN_IN_INTERVAL_MS);
      });
    }
    expect(seen).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '0']);
  });

  it('glides slowly, or jumps without animation with reduced motion', () => {
    const { unmount } = renderDisplay();
    expect(screen.getByTestId('domus-screensaver-composition').style.transition).toContain('transform');
    unmount();

    renderDisplay({ reduceMotion: true });
    const composition = screen.getByTestId('domus-screensaver-composition');
    expect(composition.style.transition).toBe('');
    act(() => {
      vi.advanceTimersByTime(BURN_IN_INTERVAL_MS);
    });
    expect(composition.style.transform).toBe(`translate3d(${BURN_IN_OFFSETS[1][0]}px, ${BURN_IN_OFFSETS[1][1]}px, 0)`);
  });
});

describe('screensaver modes', () => {
  it('Minimal is the time on black, with nothing of the dashboard', () => {
    renderDisplay();
    const display = screen.getByTestId('domus-screensaver-display');
    expect(display.className).toContain('bg-black');
    expect(display.querySelector('.dashboard-background-layer')).toBeNull();
  });

  it('Ambient reuses the Domus background of this device, dimmed', () => {
    renderDisplay({ mode: 'ambient', background: 'ocean-mist', appearance: 'dark' });
    const display = screen.getByTestId('domus-screensaver-display');
    expect(display.className).toContain('dashboard-background-ocean-mist');
    expect(display.className).toContain('dashboard-theme-dark');
    expect(display.querySelector('.dashboard-background-layer')).not.toBeNull();
  });

  it('shows the way back for a few seconds, then lets it fade', () => {
    renderDisplay();
    const hint = screen.getByText('Tocca per tornare');
    expect(hint.style.opacity).toBe('1');
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(hint.style.opacity).toBe('0');
  });
});
