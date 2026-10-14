import { describe, expect, it } from 'vitest';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { fitGreetingTitle, getGreetingDefaults, resolveGreetingResponsiveDensity } from './GreetingCard';

function buildState(): DashboardStateShape {
  return {
    userName: 'Mattia',
    favorites: [
      { id: 'one', name: 'Uno', status: 'on', image: '', imgClass: '', isOn: true },
      { id: 'two', name: 'Due', status: 'on', image: '', imgClass: '', isOn: true },
    ],
    livingRoomMasterOff: false,
    lamp: {
      name: 'Lampada',
      isOn: true,
      brightness: 67,
      status: 'on',
      hsColor: [30, 70],
      colorTemp: 3600,
    },
    climate: {
      name: 'Clima',
      mode: 'cool',
      isOn: false,
      status: 'idle',
      currentTemp: 24,
      targetTemp: 23,
      minTemp: 16,
      maxTemp: 30,
    },
    speaker: {
      isPlaying: false,
      status: 'idle',
      progress: 0,
    },
    weather: {
      available: true,
      source: 'ha',
      location: 'Casa',
      condition: 'rainy',
      temperature: 18,
      feelsLike: 17,
      high: 20,
      low: 12,
      precipitation: 90,
      precipitationAmount: 8,
      pressure: 1005,
      dewPoint: 12,
      cloudCoverage: 90,
      windGustSpeed: 45,
      windBearing: 180,
      humidity: 80,
      windSpeed: 24,
      uvIndex: 1,
      visibility: 8,
      forecast: [],
    },
    wifiDownloadMbps: 900,
  };
}

describe('GreetingCard summary', () => {
  it('summarizes the home without duplicating weather or individual device values', () => {
    const defaults = getGreetingDefaults(buildState(), new Date('2026-07-28T14:00:00'));

    expect(defaults.title).toBe('Buon pomeriggio, Mattia!');
    expect(defaults.subtitle).toBe('Casa pronta. 2 preferiti attivi.');
    expect(defaults.subtitle.toLowerCase()).not.toContain('pioggia');
    expect(defaults.subtitle).not.toContain('900');
    expect(defaults.subtitle).not.toContain('67');
  });

  it('uses a generic greeting when no user name is available', () => {
    const state = buildState();
    state.userName = '   ';

    const defaults = getGreetingDefaults(state, new Date('2026-07-28T14:00:00'));

    expect(defaults.title).toBe('Buon pomeriggio!');
    expect(defaults.name).toBe('');
  });

  it.each([
    ['XS', 300, 96, false, 'tiny'],
    ['SM', 430, 136, false, 'compact'],
    ['MD', 680, 164, false, 'compact'],
    ['XL', 980, 190, false, 'regular'],
    ['preview compatta', 980, 190, true, 'compact'],
  ] as const)('adapts the typography to the real %s card size', (_label, width, height, compact, expected) => {
    expect(resolveGreetingResponsiveDensity({ width, height, hasSize: true, compact })).toBe(expected);
  });
});

describe('GreetingCard title', () => {
  // 54 px per letter at 100 px, the estimate used where canvas is missing.
  const measure = (text: string) => text.length * 54;

  it('fits the greeting on one line in the width of a phone', () => {
    const fitted = fitGreetingTitle({ width: 232, height: 106, title: 'Buon pomeriggio!', reservedHeight: 30, measure });

    expect(fitted).toEqual({ lines: ['Buon pomeriggio!'], size: 26 });
  });

  it('moves the name to its own line rather than cut the greeting', () => {
    const fitted = fitGreetingTitle({
      width: 232,
      height: 106,
      title: 'Buon pomeriggio, Mattia!',
      splitLines: ['Buon pomeriggio,', 'Mattia!'],
      reservedHeight: 30,
      measure,
    });

    expect(fitted).toEqual({ lines: ['Buon pomeriggio,', 'Mattia!'], size: 26 });
  });

  it('keeps the title within the height left by the date and the subtitle', () => {
    const fitted = fitGreetingTitle({ width: 466, height: 90, title: 'Buon pomeriggio!', reservedHeight: 46, measure });

    expect(fitted).toEqual({ lines: ['Buon pomeriggio!'], size: 40 });
  });

  it('never grows past 48 px on a wide card', () => {
    expect(fitGreetingTitle({ width: 1200, height: 200, title: 'Buonasera!', reservedHeight: 30, measure }).size).toBe(48);
  });
});
