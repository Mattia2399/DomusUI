// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupJourney } from '../../services/setupJourney';
import { OnboardingExperience } from './OnboardingExperience';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

const panelCallApi = vi.fn(async (_message?: Record<string, unknown>) => null as unknown);
const panelConnect = vi.fn(async () => undefined);
const panelDisconnect = vi.fn();

vi.mock('../../hooks/useHaLiveConnection', () => ({
  useHaLiveConnection: () => ({
    status: 'disconnected',
    error: null,
    haStates: {},
    haAreas: [],
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    callApi: vi.fn(async () => null),
  }),
}));

vi.mock('../../hooks/useHaPanelBridgeConnection', () => ({
  useHaPanelBridgeConnection: () => ({
    isManagedByParent: true,
    hassUrl: 'https://ha.example.test',
    status: 'connected',
    error: null,
    haStates: {
      'light.kitchen': { state: 'on', attributes: {} },
      'lock.front_door': { state: 'locked', attributes: {} },
    },
    haAreas: [{ area_id: 'kitchen', name: 'Cucina' }],
    connect: panelConnect,
    disconnect: panelDisconnect,
    callApi: panelCallApi,
  }),
}));

describe('OnboardingExperience panel discovery', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    vi.clearAllMocks();
    panelCallApi.mockImplementation(async () => null);
  });

  it('shows discovery before confirmation and continues with the panel transport', async () => {
    const onJourneyChange = vi.fn();
    const journey: SetupJourney = {
      version: 2,
      phase: 'discover',
      mode: 'real',
      connectionMethod: 'panel',
      updatedAt: Date.now(),
    };

    render(
      <MemoryRouter initialEntries={['/setup']}>
        <I18nProvider>
          <OnboardingExperience journey={journey} onJourneyChange={onJourneyChange} />
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Cerchiamo la tua casa' })).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Rilevamento della casa' })).toBeTruthy();
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Abbiamo trovato la tua casa' })).toBeTruthy(),
      { timeout: 2_000 },
    );
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Usa questa casa/ }));

    expect(onJourneyChange).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'scan',
        mode: 'real',
        hassUrl: 'https://ha.example.test',
        connectionMethod: 'panel',
      }),
    );
  });

  it('offers the shared configuration fast path before layout and organization', async () => {
    panelCallApi.mockImplementation(async (message: Record<string, unknown>) => {
      if (message.type !== 'frontend/get_system_data') return null;
      return {
        value: {
          schema: 'premium-home-house-configuration',
          version: 1,
          revision: 44,
          updatedAt: '2026-08-26T08:30:00.000Z',
          updatedByUserId: 'owner-1',
          dashboard: {
            storageVersion: 14,
            sections: [
              { id: 'section-greeting', kind: 'greeting', layout: { i: 'section-greeting', x: 0, y: 0, w: 12, h: 2 } },
            ],
            widgets: [
              {
                id: 'light.kitchen',
                kind: 'light',
                title: 'Cucina',
                entityId: 'light.kitchen',
                layout: { i: 'light.kitchen', x: 0, y: 2, w: 2, h: 2 },
              },
            ],
            widgetTypeLayoutOverrides: {},
            widgetLayoutOverrides: {},
            responsiveLayouts: {},
          },
          security: {
            alarmEntityId: null,
            visibleSensorEntityIds: null,
            visibleCameraEntityIds: null,
          },
          rooms: {
            customRooms: [],
            hiddenEntitiesByRoom: {},
          },
        },
      };
    });

    const initialJourney: SetupJourney = {
      version: 2,
      phase: 'scan',
      mode: 'real',
      connectionMethod: 'panel',
      hassUrl: 'https://ha.example.test',
      updatedAt: Date.now(),
    };

    function Harness() {
      const [journey, setJourney] = useState(initialJourney);
      return <OnboardingExperience journey={journey} onJourneyChange={setJourney} />;
    }

    render(
      <MemoryRouter initialEntries={['/setup']}>
        <I18nProvider><Harness /></I18nProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Domus UI è già configurato' })).toBeTruthy();
    expect(screen.getByText(/Versione 44/)).toBeTruthy();
    expect(screen.getByText('Sezioni')).toBeTruthy();
    expect(screen.getByText('Card')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Scegli il punto di partenza' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Usa questa configurazione' }));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem('ha.dashboard.setupJourney.v2') ?? '{}')).toMatchObject({
        phase: 'done',
        mode: 'real',
      });
    });
  });
});
