// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const providerSource = readFileSync(
  resolve(process.cwd(), 'src/i18n/I18nProvider.tsx'),
  'utf8',
);
const greetingSource = readFileSync(
  resolve(process.cwd(), 'src/components/widgets/GreetingCard.tsx'),
  'utf8',
);

describe('i18n lazy catalog boundary', () => {
  it('loads every locale through an independent dynamic module', () => {
    for (const locale of ['it', 'en', 'fr']) {
      expect(providerSource).toContain(`import('virtual:domus-i18n/${locale}')`);
    }

    expect(providerSource).toContain("import type { TranslationKey } from './translations'");
    expect(providerSource).not.toContain('import { TRANSLATIONS');
  });

  it('does not pull the complete Italian catalog into Home for greeting defaults', () => {
    expect(greetingSource).toContain("import type { TranslationKey } from '../../i18n/translations'");
    expect(greetingSource).not.toContain('italianTranslations');
  });
});
