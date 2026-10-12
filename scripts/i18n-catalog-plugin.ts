import type { Plugin } from 'vite';
import { TRANSLATIONS } from '../src/i18n/translations';

const VIRTUAL_PREFIX = 'virtual:domus-i18n/';
const RESOLVED_PREFIX = `\0${VIRTUAL_PREFIX}`;
const SUPPORTED_LOCALES = ['it', 'en', 'fr'] as const;

type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

/**
 * Emits one independent runtime module per locale. The TypeScript catalog
 * remains the single source of truth, but it is evaluated only by Vite while
 * loading the config and never becomes part of the browser entry chunk.
 */
export function i18nCatalogPlugin(): Plugin {
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
      const serialized = JSON.stringify(TRANSLATIONS[locale])
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029');
      return `export default ${serialized};`;
    },
  };
}
