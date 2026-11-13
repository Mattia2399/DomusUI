import type { Plugin } from 'vite';
import { TRANSLATIONS } from '../src/i18n/translations';

const VIRTUAL_PREFIX = 'virtual:domus-i18n/';
const RESOLVED_PREFIX = `\0${VIRTUAL_PREFIX}`;
const SUPPORTED_LOCALES = ['it', 'en', 'fr', 'hu'] as const;
// The language I18nProvider falls back to (FALLBACK_LOCALE).
const FALLBACK_LOCALE = 'en';

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

/**
 * Emits one independent runtime module per locale. The TypeScript catalog
 * remains the single source of truth, but it is evaluated only by Vite while
 * loading the config and never becomes part of the browser entry chunk.
 *
 * `locales` lists the languages a build can show. Any other one stands for the
 * fallback catalog instead of shipping its own: the public website has Italian
 * and English pages only, so it never publishes the French catalog.
 */
export function i18nCatalogPlugin({ locales = SUPPORTED_LOCALES }: { locales?: readonly SupportedLocale[] } = {}): Plugin {
  const fallback: SupportedLocale = locales.includes(FALLBACK_LOCALE) ? FALLBACK_LOCALE : locales[0];
  return {
    name: 'domus-i18n-catalogs',
    resolveId(source) {
      if (!source.startsWith(VIRTUAL_PREFIX)) return null;
      const locale = source.slice(VIRTUAL_PREFIX.length);
      return isSupportedLocale(locale) ? `${RESOLVED_PREFIX}${locale}` : null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED_PREFIX)) return null;
      const locale = id.slice(RESOLVED_PREFIX.length);
      if (!isSupportedLocale(locale)) return null;
      if (!locales.includes(locale)) return `export { default } from '${VIRTUAL_PREFIX}${fallback}';`;
      const serialized = JSON.stringify(TRANSLATIONS[locale])
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029');
      return `export default ${serialized};`;
    },
  };
}
