// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/onboarding/ExperienceGate.tsx'),
  'utf8',
);

describe('ExperienceGate lazy boundaries', () => {
  it('keeps onboarding implementation out of returning-user startup', () => {
    expect(source).toContain("const loadOnboardingExperience = () => import('./OnboardingExperience')");
    expect(source).toContain('const OnboardingExperience = React.lazy(');
    expect(source).toContain('const DemoLockedRoute = React.lazy(');
    expect(source).not.toContain("from './OnboardingExperience'");
  });

  it('keeps the setup screens and their words out of startup', () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
    // The gate needs only the appearance hook, not the setup screens it lives beside.
    expect(source).toContain("from './deviceAppearance'");
    expect(source).not.toContain("from './OnboardingGlass'");
    // One module per language, imported on demand only.
    const words = read('src/i18n/onboardingTranslations.ts');
    expect(words).not.toMatch(/^import (?!type).*'\.\/onboarding\//m);
    for (const locale of ['it', 'en', 'fr']) expect(words).toContain(`${locale}: () => import('./onboarding/${locale}')`);
    // Startup asks for the starting language without waiting for it.
    const main = read('src/main.tsx');
    expect(main).toContain('void loadOnboardingTranslations(resolveInitialLocale()).catch(() => undefined);');
  });

  it('shows an accessible fallback while onboarding is loading', () => {
    const onboardingBranch = source.slice(
      source.indexOf("if (journey.phase !== 'done'"),
      source.indexOf("if (journey.mode === 'demo'"),
    );

    expect(onboardingBranch).toContain(
      '<LazyLoadBoundary fallback={<DashboardLoading />}>',
    );
  });
});
