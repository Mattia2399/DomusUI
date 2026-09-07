// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSetupJourney } from '../../services/setupJourney';
import { ExperienceGate } from './ExperienceGate';
import { I18nProvider } from '../../i18n/I18nProvider';

vi.mock('./OnboardingExperience', () => ({
  OnboardingExperience: ({ onJourneyChange }: { onJourneyChange: (journey: object) => void }) => (
    <button
      type="button"
      onClick={() => onJourneyChange({
        version: 2,
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
      phase: 'complete',
      mode: 'real',
      connectionMethod: 'panel',
    }, window.localStorage);

    render(
      <I18nProvider><MemoryRouter initialEntries={['/setup']}>
        <ExperienceGate />
      </MemoryRouter></I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apri la dashboard' }));

    expect(await screen.findByText('Dashboard Domus UI')).toBeTruthy();
  });

  it('keeps the explicit reconnect route in the quick configuration flow', () => {
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

    expect(screen.getByRole('button', { name: 'Apri la dashboard' })).toBeTruthy();
    expect(screen.queryByText('Dashboard Domus UI')).toBeNull();
  });
});
