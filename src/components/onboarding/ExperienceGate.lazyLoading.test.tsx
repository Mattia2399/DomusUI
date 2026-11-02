// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Setup and its words load on demand: what a cold start shows while they
 * arrive, and when one of them cannot be loaded. A failure never counts as
 * a finished setup.
 */

const JOURNEY_KEY = 'ha.dashboard.setupJourney.v3';

function storeJourney(phase: string) {
  window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({
    version: 3, phase, mode: 'real', connectionMethod: 'direct', updatedAt: Date.now(),
  }));
}

// After resetModules every import is fresh: under a full parallel run it can take longer than a second.
const LOADED = { timeout: 5000 };

const storedPhase = () => JSON.parse(window.localStorage.getItem(JOURNEY_KEY) ?? '{}').phase;

/** A stand-in for the setup screens that uses the real words. */
async function mockSetupScreens(onLoad = () => undefined) {
  vi.doMock('./OnboardingExperience', async () => {
    onLoad();
    const words = await import('../../i18n/onboardingTranslations');
    const { useI18n } = await import('../../i18n/I18nProvider');
    function OnboardingExperience({ journey }: { journey: { phase: string } }) {
      words.useOnboardingTranslations();
      const { locale } = useI18n();
      return <h1>{words.translateOnboarding(locale, 'intro.start')} · {journey.phase}</h1>;
    }
    return { OnboardingExperience, DemoLockedRoute: () => null };
  });
}

async function renderGate(path = '/setup') {
  const [{ ExperienceGate }, { I18nProvider }] = await Promise.all([
    import('./ExperienceGate'),
    import('../../i18n/I18nProvider'),
  ]);
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <ExperienceGate />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('ExperienceGate lazy setup', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    window.localStorage.setItem('domusui.language.v1', 'it');
    vi.doMock('../../pages/Home', () => ({ default: () => <div>Dashboard Domus UI</div> }));
  });

  afterEach(() => {
    cleanup();
    vi.doUnmock('./OnboardingExperience');
    vi.doUnmock('../../i18n/onboarding/it');
    vi.doUnmock('../../pages/Home');
    vi.restoreAllMocks();
  });

  it('never loads setup for a home that is already set up', async () => {
    storeJourney('done');
    const loaded = vi.fn();
    await mockSetupScreens(loaded);
    await renderGate('/');
    expect(await screen.findByText('Dashboard Domus UI', undefined, LOADED)).toBeTruthy();
    expect(loaded).not.toHaveBeenCalled();
  });

  it('shows the loading state until setup and its words have arrived', async () => {
    storeJourney('intro');
    let release: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.doMock('../../i18n/onboarding/it', async () => {
      await arrived;
      return vi.importActual('../../i18n/onboarding/it');
    });
    await mockSetupScreens();
    await renderGate();

    expect(await screen.findByRole('status', undefined, LOADED)).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    release();
    expect(await screen.findByRole('heading', { name: 'Inizia · intro' }, LOADED)).toBeTruthy();
  });

  it('resumes an interrupted setup at the step it reached', async () => {
    storeJourney('scan');
    await mockSetupScreens();
    await renderGate();
    expect(await screen.findByRole('heading', { name: 'Inizia · scan' }, LOADED)).toBeTruthy();
    expect(storedPhase()).toBe('scan');
  });

  it('offers to reload when the words cannot be loaded, without finishing setup', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storeJourney('intro');
    let attempts = 0;
    vi.doMock('../../i18n/onboarding/it', () => {
      attempts += 1;
      throw new Error('Failed to fetch dynamically imported module');
    });
    await mockSetupScreens();
    await renderGate();

    expect(await screen.findByRole('alert', undefined, LOADED)).toBeTruthy();
    // One failed load reaches the boundary: React's retries reuse it instead of starting new ones.
    expect(attempts).toBe(1);
    expect(screen.getByText('Contenuto non caricato')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ricarica Domus UI' })).toBeTruthy();
    expect(screen.queryByText('Dashboard Domus UI')).toBeNull();
    expect(storedPhase()).toBe('intro');
  });

  it('offers to reload when setup itself cannot be loaded, without finishing setup', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storeJourney('connect');
    vi.doMock('./OnboardingExperience', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    await renderGate();

    expect(await screen.findByRole('button', { name: 'Ricarica Domus UI' }, LOADED)).toBeTruthy();
    expect(screen.queryByText('Dashboard Domus UI')).toBeNull();
    expect(storedPhase()).toBe('connect');
  });
});
