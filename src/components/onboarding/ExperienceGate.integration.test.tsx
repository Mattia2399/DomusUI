// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSetupJourney } from '../../services/setupJourney';
import { ExperienceGate } from './ExperienceGate';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

vi.mock('./OnboardingExperience', () => ({
  OnboardingExperience: ({ journey, onJourneyChange, offerResume = true }: { journey: { phase: string }; onJourneyChange: (journey: object) => void; offerResume?: boolean }) => (
    <button
      type="button"
      data-phase={journey.phase}
      data-offer-resume={String(offerResume)}
      onClick={() => onJourneyChange({
        version: 3,
        phase: 'done',
        mode: 'real',
        connectionMethod: 'panel',
        updatedAt: Date.now(),
      })}
    >
      Apri la dashboard
    </button>
  ),
  DemoLockedRoute: () => <div>Demo bloccata</div>,
}));

vi.mock('../../pages/Home', () => ({
  default: () => <div>Dashboard Domus UI</div>,
}));

describe('ExperienceGate onboarding completion', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('opens the dashboard after completing onboarding while the embedded route remains /setup', async () => {
    saveSetupJourney({
      phase: 'compose',
      mode: 'real',
      connectionMethod: 'panel',
    }, window.localStorage);

    render(
      <I18nProvider><MemoryRouter initialEntries={['/setup']}>
        <ExperienceGate />
      </MemoryRouter></I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Apri la dashboard' }));

    expect(await screen.findByText('Dashboard Domus UI')).toBeTruthy();
  });

  it('keeps the explicit reconnect route in the quick configuration flow', async () => {
    saveSetupJourney({
      phase: 'done',
      mode: 'real',
      connectionMethod: 'panel',
    }, window.localStorage);

    render(
      <I18nProvider><MemoryRouter initialEntries={['/setup?reconnect=1']}>
        <ExperienceGate />
      </MemoryRouter></I18nProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Apri la dashboard' })).toBeTruthy();
    expect(screen.queryByText('Dashboard Domus UI')).toBeNull();
  });

  it('sends the Demo straight to the address when it asks to connect the home', async () => {
    saveSetupJourney({ phase: 'done', mode: 'demo', start: 'recommended' }, window.localStorage);

    render(
      <I18nProvider><MemoryRouter initialEntries={['/setup']}>
        <ExperienceGate />
      </MemoryRouter></I18nProvider>,
    );

    const setup = await screen.findByRole('button', { name: 'Apri la dashboard' });
    expect(setup.getAttribute('data-phase')).toBe('connect');
    // The Demo just asked for this: no half-way setup to offer resuming.
    expect(setup.getAttribute('data-offer-resume')).toBe('false');
    expect(JSON.parse(window.localStorage.getItem('ha.dashboard.setupJourney.v3') ?? '{}')).toMatchObject({
      phase: 'connect',
      mode: 'real',
      connectionMethod: 'direct',
    });
    expect(screen.queryByText('Demo bloccata')).toBeNull();
  });

  it('opens the translated Consumption route when English is active', async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    saveSetupJourney({
      phase: 'done',
      mode: 'real',
      connectionMethod: 'panel',
    }, window.localStorage);

    render(
      <I18nProvider><MemoryRouter initialEntries={['/consumi']}>
        <ExperienceGate />
      </MemoryRouter></I18nProvider>,
    );

    expect(await screen.findByText('Dashboard Domus UI')).toBeTruthy();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });
});
