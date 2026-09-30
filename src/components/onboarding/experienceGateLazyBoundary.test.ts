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
