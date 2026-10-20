import { use, useSyncExternalStore } from 'react';
import { useI18n, type AppLocale } from './I18nProvider';
import type { OnboardingMessages, OnboardingTranslationKey } from './onboarding/it';

export type { OnboardingTranslationKey } from './onboarding/it';

/*
 * The words of first-run setup, one module per language
 * (src/i18n/onboarding/*.ts). They are not part of startup: a person whose
 * home is set up never downloads them. The setup screens load the current
 * language when they open (useOnboardingTranslations), alongside their code.
 */
const loaders: Record<AppLocale, () => Promise<{ default: OnboardingMessages }>> = {
  it: () => import('./onboarding/it'),
  en: () => import('./onboarding/en'),
  fr: () => import('./onboarding/fr'),
};

const loaded = new Map<AppLocale, OnboardingMessages>();
const pending = new Map<AppLocale, Promise<OnboardingMessages>>();
const listeners = new Set<() => void>();
let version = 0;
// The language shown until another one has arrived (after a change of language).
let lastLoaded: AppLocale | null = null;

/** Loads the words of a language once; a failed attempt can be retried. */
export function loadOnboardingTranslations(locale: AppLocale): Promise<OnboardingMessages> {
  const ready = loaded.get(locale);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(locale);
  if (inFlight) return inFlight;
  const request = loaders[locale]().then(
    (module) => {
      loaded.set(locale, module.default);
      lastLoaded = locale;
      pending.delete(locale);
      version += 1;
      listeners.forEach((listener) => listener());
      return module.default;
    },
    (error: unknown) => {
      pending.delete(locale);
      throw error;
    },
  );
  pending.set(locale, request);
  return request;
}

export function isOnboardingTranslationsLoaded(locale: AppLocale) {
  return loaded.has(locale);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentVersion = () => version;

/**
 * Makes the words of the current language available to the setup screens.
 * With no language loaded yet it suspends (the screen's loading state shows);
 * after a change of language the previous words stay until the new ones arrive.
 * A failed load reaches the nearest error boundary, which offers to retry.
 */
export function useOnboardingTranslations(): void {
  const { locale } = useI18n();
  useSyncExternalStore(subscribe, currentVersion, currentVersion);
  if (loaded.has(locale)) return;
  const request = loadOnboardingTranslations(locale);
  if (loaded.size === 0) use(request);
}

export function translateOnboarding(
  locale: AppLocale,
  key: OnboardingTranslationKey,
  parameters?: Record<string, string | number>,
) {
  const messages = loaded.get(locale) ?? (lastLoaded ? loaded.get(lastLoaded) : undefined);
  const message = messages?.[key] ?? key;
  if (!parameters) return message;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : match,
  );
}

/** Forget every loaded language (tests). */
export function resetOnboardingTranslations() {
  loaded.clear();
  pending.clear();
  lastLoaded = null;
  version += 1;
}
