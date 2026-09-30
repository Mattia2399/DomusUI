// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/onboarding/OnboardingExperience.tsx'),
  'utf8',
);

describe('Onboarding persistence lazy boundary', () => {
  it('loads the organizer only when setup reaches its organization phase', () => {
    expect(source).toContain("import('./OnboardingOrganizer').then");
    expect(source).not.toContain("from './OnboardingOrganizer'");
    expect(source).toContain("label={ot('organizer.loading')}");
    expect(source).toContain("description={ot('organizer.loadingDescription')}");
  });

  it('loads template and storage code only when the prepared dashboard is opened', () => {
    expect(source).toContain("import('../../templates/starterDashboardTemplate')");
    expect(source).toContain("import('../../services/dashboardStorage')");
    expect(source).not.toContain(
      "from '../../templates/starterDashboardTemplate'",
    );
    expect(source).not.toContain("from '../../services/dashboardStorage'");
    expect(source).toContain('await loadStarterDashboardPersistence()');
  });

  it('guards the deferred action with busy and failure states', () => {
    expect(source).toContain('if (templatePreparing) return');
    expect(source).toContain('aria-busy={templatePreparing}');
    expect(source).toContain("setTemplateSaveError(ot('complete.templateError'))");
  });
});
