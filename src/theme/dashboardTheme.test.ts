import { describe, expect, it } from 'vitest';
import {
  normalizeDashboardBackground,
  resolveDashboardThemePreferences,
} from './dashboardTheme';

describe('dashboard theme contract', () => {
  it('keeps appearance and visual background as independent axes', () => {
    expect(resolveDashboardThemePreferences('auto', 'sunset-amber')).toEqual({
      appearanceMode: 'auto',
      background: 'sunset-amber',
      migratedLegacyBackground: false,
    });
  });

  it('accepts the Dynamic background without making it the default', () => {
    expect(normalizeDashboardBackground('dynamic')).toBe('dynamic');
    expect(resolveDashboardThemePreferences('auto', null)).toMatchObject({ background: 'neutral' });
  });

  it('rejects removed and unknown backgrounds', () => {
    expect(normalizeDashboardBackground('total-white')).toBeNull();
    expect(normalizeDashboardBackground('custom-css')).toBeNull();
  });

  it('migrates legacy neutral appearances without overriding an explicit mode', () => {
    expect(resolveDashboardThemePreferences('auto', 'total-white')).toMatchObject({
      appearanceMode: 'light',
      background: 'neutral',
    });
    expect(resolveDashboardThemePreferences('dark', 'total-white')).toMatchObject({
      appearanceMode: 'dark',
      background: 'neutral',
    });
  });
});
