import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { en } from './en';
import { it, type SiteCopy } from './it';

export type SiteLocale = 'it' | 'en';

export const SITE_LOCALES: readonly SiteLocale[] = ['it', 'en'];

const COPY: Record<SiteLocale, SiteCopy> = { it, en };

type SiteLocaleContextValue = {
  locale: SiteLocale;
  copy: SiteCopy;
  /**
   * How the language switch changes language: real URLs on the standalone
   * website (`/` and `/en/`, indexable), or in-place state inside the app's
   * /beta preview.
   */
  switchTo: Record<SiteLocale, { href: string } | { onSelect: () => void }>;
};

const SiteLocaleContext = createContext<SiteLocaleContextValue | null>(null);

export function SiteLocaleProvider({
  locale,
  switchTo,
  children,
}: {
  locale: SiteLocale;
  switchTo: SiteLocaleContextValue['switchTo'];
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, copy: COPY[locale], switchTo }), [locale, switchTo]);
  return <SiteLocaleContext.Provider value={value}>{children}</SiteLocaleContext.Provider>;
}

export function useSiteLocale() {
  const value = useContext(SiteLocaleContext);
  if (!value) throw new Error('useSiteLocale must be used inside <SiteLocaleProvider>.');
  return value;
}

/** Shortcut for components that only need the strings. */
export const useSiteCopy = () => useSiteLocale().copy;
