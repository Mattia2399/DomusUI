import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectBrowserLocale,
  FALLBACK_LOCALE,
  I18nProvider,
  LANGUAGE_STORAGE_KEY,
  normalizeAppLocale,
  useI18n,
} from './I18nProvider';

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  document.documentElement.lang = 'it';
  delete document.documentElement.dataset.domusLocale;
});

describe('I18nProvider', () => {
  it('normalizes supported Home Assistant and browser locale formats', () => {
    expect(normalizeAppLocale('it-IT')).toBe('it');
    expect(normalizeAppLocale('en_GB')).toBe('en');
    expect(normalizeAppLocale({ language: 'fr-FR' })).toBe('fr');
    expect(normalizeAppLocale('de-DE')).toBeNull();
  });

  it('picks the first supported browser language and falls back to English otherwise', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get');
    const language = vi.spyOn(navigator, 'language', 'get');

    languages.mockReturnValue(['it-IT', 'en-US']);
    language.mockReturnValue('it-IT');
    expect(detectBrowserLocale()).toBe('it');

    languages.mockReturnValue(['de-DE', 'fr-FR']);
    language.mockReturnValue('de-DE');
    expect(detectBrowserLocale()).toBe('fr');

    // A German or Spanish installation must not land on Italian.
    languages.mockReturnValue(['de-DE', 'de']);
    language.mockReturnValue('de-DE');
    expect(detectBrowserLocale()).toBe(FALLBACK_LOCALE);
    expect(FALLBACK_LOCALE).toBe('en');
  });

  it('shows English when both Home Assistant and the browser use an unsupported language', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-ES', 'es']);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
    const { result } = renderHook(() => useI18n(), { wrapper });

    act(() => result.current.setHomeAssistantLocale({ language: 'es' }));
    expect(result.current.locale).toBe('en');
    expect(result.current.t('profile.title')).toBe('Profile');
  });

  it('uses the Home Assistant locale until the user makes a device-local choice', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });

    act(() => result.current.setHomeAssistantLocale({ language: 'fr-FR' }));
    expect(result.current.locale).toBe('fr');
    expect(result.current.t('profile.title')).toBe('Profil');

    act(() => result.current.setLocale('en'));
    expect(result.current.locale).toBe('en');
    expect(result.current.t('profile.title')).toBe('Profile');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    act(() => result.current.setHomeAssistantLocale('it-IT'));
    expect(result.current.locale).toBe('en');
  });
});
