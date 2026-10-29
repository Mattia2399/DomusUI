// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const source = read('src/components/onboarding/OnboardingExperience.tsx');
// The steps after the sign-in (reading, summary, the Home to start with) load apart.
const homeSteps = read('src/components/onboarding/SetupHomeSteps.tsx');

describe('Onboarding persistence lazy boundary', () => {
  it('no longer organizes rooms in setup: that is Rooms › Rooms and sections', () => {
    expect(source).not.toContain('OnboardingOrganizer');
  });

  it('loads the drifting cards of the intro apart from setup', () => {
    expect(source).toContain("const SetupMosaic = lazy(() => import('./SetupMosaic'));");
    expect(source).not.toContain("from './SetupMosaic'");
  });

  it('loads the steps after the sign-in apart, fetched ahead while the first steps are on screen', () => {
    expect(source).toContain("const loadSetupHomeSteps = () => import('./SetupHomeSteps');");
    expect(source).not.toContain("from './SetupHomeSteps'");
    expect(source).toContain('void loadSetupHomeSteps().catch(() => undefined)');
  });

  it('loads template and storage code only when the prepared dashboard is opened', () => {
    for (const file of [source, homeSteps]) {
      expect(file).not.toContain("from '../../templates/starterDashboardTemplate'");
      expect(file).not.toContain("from '../../services/dashboardStorage'");
    }
    expect(homeSteps).toContain("import('../../templates/starterDashboardTemplate')");
    expect(homeSteps).toContain("import('../../services/dashboardStorage')");
    expect(homeSteps).toContain('await loadStarterDashboardPersistence()');
  });

  it('guards the deferred action with busy and failure states', () => {
    expect(homeSteps).toContain('if (opening) return');
    expect(homeSteps).toContain('aria-busy={opening}');
    expect(homeSteps).toContain('setOpenError(true)');
  });
});
