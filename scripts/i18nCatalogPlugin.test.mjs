// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { i18nCatalogPlugin } from './i18n-catalog-plugin';

/*
 * One runtime catalog per language; a build that never shows a language
 * (the public website: Italian and English pages) publishes the fallback
 * catalog in its place instead of a catalog nobody reads
 * (docs/performance-site-budget.md).
 */

const load = (plugin, locale) => plugin.load(`\u0000virtual:domus-i18n/${locale}`);

describe('i18n catalog plugin', () => {
  it('emits every catalog for the app by default', () => {
    const plugin = i18nCatalogPlugin();
    for (const locale of ['it', 'en', 'fr']) expect(load(plugin, locale)).toMatch(/^export default \{/);
  });

  it('stands the fallback catalog in for a language the build never shows', () => {
    const plugin = i18nCatalogPlugin({ locales: ['it', 'en'] });
    expect(load(plugin, 'it')).toMatch(/^export default \{/);
    expect(load(plugin, 'en')).toMatch(/^export default \{/);
    expect(load(plugin, 'fr')).toBe("export { default } from 'virtual:domus-i18n/en';");
  });

  it('keeps only the website pages languages in the website build', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.site.config.ts'), 'utf8');
    expect(config).toContain("i18nCatalogPlugin({ locales: ['it', 'en'] })");
    const siteLocale = readFileSync(resolve(process.cwd(), 'src/components/site/i18n/SiteLocaleProvider.tsx'), 'utf8');
    expect(siteLocale).toContain("export type SiteLocale = 'it' | 'en';");
    // The app keeps all of its languages.
    expect(readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')).toContain('i18nCatalogPlugin(),');
  });
});
