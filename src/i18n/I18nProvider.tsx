import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TranslationKey } from './translations';

export const SUPPORTED_LOCALES = ['it', 'en', 'fr', 'hu'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LANGUAGE_STORAGE_KEY = 'domusui.language.v1';

export type TranslationParameters = Record<string, string | number>;
type TranslationCatalog = Readonly<Record<TranslationKey, string>>;
type TranslationCatalogModule = { default: TranslationCatalog };

const catalogLoaders: Record<AppLocale, () => Promise<TranslationCatalogModule>> = {
  it: () => import('virtual:domus-i18n/it'),
  en: () => import('virtual:domus-i18n/en'),
  fr: () => import('virtual:domus-i18n/fr'),
  hu: () => import('virtual:domus-i18n/hu'),
};
const loadedCatalogs = new Map<AppLocale, TranslationCatalog>();
const pendingCatalogs = new Map<AppLocale, Promise<TranslationCatalog>>();

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

/**
 * Language used when neither Home Assistant nor the browser asks for a
 * supported one (e.g. a German or Spanish installation): English is the
 * most widely understood option for the international HACS audience.
 */
export const FALLBACK_LOCALE: AppLocale = 'en';

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === 'undefined') return FALLBACK_LOCALE;
  const candidates = [...(navigator.languages ?? []), navigator.language];
  for (const candidate of candidates) {
    const locale = normalizeAppLocale(candidate);
    if (locale) return locale;
  }
  return FALLBACK_LOCALE;
}

export function readStoredLocale(): AppLocale | null {
  if (typeof window === 'undefined') return null;
  return normalizeAppLocale(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function resolveInitialLocale(): AppLocale {
  return readStoredLocale() ?? detectBrowserLocale();
}

export function isTranslationCatalogLoaded(locale: AppLocale) {
  return loadedCatalogs.has(locale);
}

export function preloadTranslationCatalog(locale: AppLocale): Promise<TranslationCatalog> {
  const loaded = loadedCatalogs.get(locale);
  if (loaded) return Promise.resolve(loaded);
  const pending = pendingCatalogs.get(locale);
  if (pending) return pending;

  const request = catalogLoaders[locale]().then((module) => {
    loadedCatalogs.set(locale, module.default);
    pendingCatalogs.delete(locale);
    return module.default;
  }).catch((error) => {
    pendingCatalogs.delete(locale);
    throw error;
  });
  pendingCatalogs.set(locale, request);
  return request;
}

export async function preloadInitialTranslationCatalog() {
  const locale = resolveInitialLocale();
  await preloadTranslationCatalog(locale);
  return locale;
}

export async function preloadAllTranslationCatalogs() {
  await Promise.all(SUPPORTED_LOCALES.map((locale) => preloadTranslationCatalog(locale)));
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
  const catalog = loadedCatalogs.get(locale);
  const fallback = loadedCatalogs.get(FALLBACK_LOCALE) ?? loadedCatalogs.get('it');
  return interpolate(catalog?.[key] ?? fallback?.[key] ?? key, parameters);
}

/**
 * `forcedLocale` pins the language for an embedded subtree (the presentation
 * website renders its cards in the page's language). In that mode the provider
 * never touches <html lang>, which belongs to the host page.
 */
export function I18nProvider({ children, forcedLocale }: { children: ReactNode; forcedLocale?: AppLocale }) {
  const [explicitLocale, setExplicitLocale] = useState<AppLocale | null>(readStoredLocale);
  const [homeAssistantLocale, setHomeAssistantLocaleState] = useState<AppLocale | null>(null);
  const [browserLocale] = useState(detectBrowserLocale);
  const requestedLocale = forcedLocale ?? explicitLocale ?? homeAssistantLocale ?? browserLocale;
  const [locale, setActiveLocale] = useState<AppLocale | null>(() => {
    if (loadedCatalogs.has(requestedLocale)) return requestedLocale;
    return SUPPORTED_LOCALES.find((candidate) => loadedCatalogs.has(candidate)) ?? null;
  });

  const setLocale = useCallback((nextLocale: AppLocale) => {
    if (!SUPPORTED_LOCALES.includes(nextLocale)) return;
    if (!forcedLocale && loadedCatalogs.has(nextLocale)) setActiveLocale(nextLocale);
    setExplicitLocale(nextLocale);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    }
  }, [forcedLocale]);

  const setHomeAssistantLocale = useCallback((candidate: unknown) => {
    const nextLocale = normalizeAppLocale(candidate);
    if (!forcedLocale && !explicitLocale && nextLocale && loadedCatalogs.has(nextLocale)) {
      setActiveLocale(nextLocale);
    }
    setHomeAssistantLocaleState(nextLocale);
  }, [explicitLocale, forcedLocale]);

  useEffect(() => {
    let cancelled = false;
    void preloadTranslationCatalog(requestedLocale).then(() => {
      if (!cancelled) setActiveLocale(requestedLocale);
    }).catch(() => {
      if (cancelled) return;
      const fallback = SUPPORTED_LOCALES.find((candidate) => loadedCatalogs.has(candidate)) ?? null;
      setActiveLocale(fallback);
    });
    return () => {
      cancelled = true;
    };
  }, [requestedLocale]);

  useEffect(() => {
    if (!locale || forcedLocale || typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dataset.domusLocale = locale;
  }, [forcedLocale, locale]);

  const value = useMemo<I18nContextValue | null>(() => locale ? ({
    locale,
    setLocale,
    setHomeAssistantLocale,
    t: (key, parameters) => translateForLocale(locale, key, parameters),
    formatNumber: (number, options) => new Intl.NumberFormat(locale, options).format(number),
    formatDate: (date, options) => new Intl.DateTimeFormat(locale, options).format(date),
  }) : null, [locale, setHomeAssistantLocale, setLocale]);

  if (!value) return null;
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
