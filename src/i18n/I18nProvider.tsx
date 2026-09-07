import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { TRANSLATIONS, type TranslationKey } from './translations';

export const SUPPORTED_LOCALES = ['it', 'en', 'fr'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LANGUAGE_STORAGE_KEY = 'domusui.language.v1';

export type TranslationParameters = Record<string, string | number>;

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  setHomeAssistantLocale: (locale: unknown) => void;
  t: (key: TranslationKey, parameters?: TranslationParameters) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function normalizeAppLocale(value: unknown): AppLocale | null {
  const candidate =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && typeof (value as { language?: unknown }).language === 'string'
        ? (value as { language: string }).language
        : '';
  const language = candidate.trim().toLowerCase().split(/[-_]/, 1)[0];
  return SUPPORTED_LOCALES.includes(language as AppLocale) ? (language as AppLocale) : null;
}

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'it';
  const candidates = [...(navigator.languages ?? []), navigator.language];
  for (const candidate of candidates) {
    const locale = normalizeAppLocale(candidate);
    if (locale) return locale;
  }
  return 'it';
}

function readStoredLocale(): AppLocale | null {
  if (typeof window === 'undefined') return null;
  return normalizeAppLocale(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

function interpolate(message: string, parameters?: TranslationParameters) {
  if (!parameters) return message;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(parameters, key) ? String(parameters[key]) : match,
  );
}

export function translateForLocale(
  locale: AppLocale,
  key: TranslationKey,
  parameters?: TranslationParameters,
) {
  return interpolate(TRANSLATIONS[locale][key] ?? TRANSLATIONS.it[key], parameters);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [explicitLocale, setExplicitLocale] = useState<AppLocale | null>(readStoredLocale);
  const [homeAssistantLocale, setHomeAssistantLocaleState] = useState<AppLocale | null>(null);
  const [browserLocale] = useState(detectBrowserLocale);
  const locale = explicitLocale ?? homeAssistantLocale ?? browserLocale;

  const setLocale = useCallback((nextLocale: AppLocale) => {
    if (!SUPPORTED_LOCALES.includes(nextLocale)) return;
    setExplicitLocale(nextLocale);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    }
  }, []);

  const setHomeAssistantLocale = useCallback((candidate: unknown) => {
    setHomeAssistantLocaleState(normalizeAppLocale(candidate));
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dataset.domusLocale = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    setHomeAssistantLocale,
    t: (key, parameters) => translateForLocale(locale, key, parameters),
    formatNumber: (number, options) => new Intl.NumberFormat(locale, options).format(number),
    formatDate: (date, options) => new Intl.DateTimeFormat(locale, options).format(date),
  }), [locale, setHomeAssistantLocale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const fallbackI18nContext: I18nContextValue = {
  locale: 'it',
  setLocale: () => undefined,
  setHomeAssistantLocale: () => undefined,
  t: (key, parameters) => translateForLocale('it', key, parameters),
  formatNumber: (value, options) => new Intl.NumberFormat('it', options).format(value),
  formatDate: (value, options) => new Intl.DateTimeFormat('it', options).format(value),
};

export function useI18n() {
  const value = useContext(I18nContext);
  return value ?? fallbackI18nContext;
}
