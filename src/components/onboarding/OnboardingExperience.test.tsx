// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupJourney } from '../../services/setupJourney';
import { OnboardingExperience } from './OnboardingExperience';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { loadDashboardLayout } from '../../services/dashboardStorage';
import { loadOnboardingTranslations } from '../../i18n/onboardingTranslations';

const panelCallApi = vi.fn(async (_message?: Record<string, unknown>) => null as unknown);
const panel = {
  status: 'connected',
  haStates: {
    'light.kitchen': { state: 'on', attributes: {} },
    'lock.front_door': { state: 'locked', attributes: {} },
  } as Record<string, unknown>,
};

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
    status: panel.status,
    error: null,
    haStates: panel.haStates,
    haAreas: [{ area_id: 'kitchen', name: 'Cucina' }],
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    callApi: panelCallApi,
  }),
}));

const SHARED_DASHBOARD = {
  schema: 'premium-home-house-configuration',
  version: 1,
  revision: 44,
  updatedAt: '2026-08-26T08:30:00.000Z',
  updatedByUserId: 'owner-1',
  dashboard: {
    storageVersion: 14,
    sections: [{ id: 'section-greeting', kind: 'greeting', layout: { i: 'section-greeting', x: 0, y: 0, w: 12, h: 2 } }],
    widgets: [
      { id: 'light.kitchen', kind: 'light', title: 'Cucina', entityId: 'light.kitchen', layout: { i: 'light.kitchen', x: 0, y: 2, w: 2, h: 2 } },
    ],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
  },
  security: { alarmEntityId: null, visibleSensorEntityIds: null, visibleCameraEntityIds: null },
  rooms: { customRooms: [], hiddenEntitiesByRoom: {} },
};

/** Home Assistant as the panel answers it; each read can be replaced. */
function homeAssistant(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    'frontend/get_system_data': { value: null },
    'auth/current_user': { name: 'Mattia', is_admin: true },
    'config/area_registry/list': [{ area_id: 'kitchen', name: 'Cucina' }],
    'config/floor_registry/list': [{ floor_id: 'ground', name: 'Piano terra' }],
    'config/device_registry/list': [
      { id: 'lamp', area_id: 'kitchen' },
      { id: 'lock', area_id: null },
    ],
    'config/entity_registry/list_for_display': { entities: [{ ei: 'light.kitchen' }, { ei: 'lock.front_door' }] },
    ...overrides,
  };
  panelCallApi.mockImplementation(async (message?: Record<string, unknown>) => answers[String(message?.type)] ?? null);
}

function Harness({ initial, forceConfiguration }: { initial: Omit<SetupJourney, 'version' | 'updatedAt'>; forceConfiguration?: boolean }) {
  const [journey, setJourney] = useState<SetupJourney>({ version: 3, updatedAt: Date.now(), ...initial });
  return <OnboardingExperience journey={journey} onJourneyChange={setJourney} forceConfiguration={forceConfiguration} />;
}

function renderSetup(initial: Omit<SetupJourney, 'version' | 'updatedAt'>, forceConfiguration?: boolean) {
  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <I18nProvider><Harness initial={initial} forceConfiguration={forceConfiguration} /></I18nProvider>
    </MemoryRouter>,
  );
}

/** A setup that opens half-way first offers to resume it. */
async function resume() {
  fireEvent.click(await screen.findByRole('button', { name: /Riprendi da dove eri/ }));
}

const storedJourney = () => JSON.parse(window.localStorage.getItem('ha.dashboard.setupJourney.v3') ?? '{}');
const panelScan = { phase: 'scan', mode: 'real', connectionMethod: 'panel', hassUrl: 'https://ha.example.test' } as const;

describe('OnboardingExperience', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });
  // As at startup (main.tsx), the setup words of the language are already there.
  beforeAll(() => loadOnboardingTranslations('it'));

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    vi.clearAllMocks();
    panel.status = 'connected';
    homeAssistant();
  });

  it('reads the home inside the panel and sums it up in words', async () => {
    renderSetup(panelScan);
    await resume();

    expect(await screen.findByRole('heading', { name: 'Ecco la casa di Mattia' })).toBeTruthy();
    expect(screen.getByText('1 stanza su 1 piano, 2 dispositivi. Niente è stato cambiato.')).toBeTruthy();
    expect(screen.getByText('1 luce')).toBeTruthy();
    expect(screen.getByText('1 per la sicurezza')).toBeTruthy();
    expect(screen.getByText('1 dispositivo senza stanza')).toBeTruthy();
    expect(screen.queryByText(/non rispond/)).toBeNull();
    expect(screen.getByText('2 di 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Continua/ }));
    expect(await screen.findByRole('heading', { name: 'Com’è la tua Home al primo accesso?' })).toBeTruthy();
    expect(screen.getByText('3 di 3')).toBeTruthy();
  });

  it('offers the dashboard the home already has, after the summary', async () => {
    homeAssistant({ 'frontend/get_system_data': { value: SHARED_DASHBOARD } });
    renderSetup(panelScan);
    await resume();

    fireEvent.click(await screen.findByRole('button', { name: /Continua/ }));
    expect(await screen.findByRole('heading', { name: 'Domus UI è già configurata in questa casa' })).toBeTruthy();
    expect(screen.getByText(/1 sezione · 1 card · aggiornata il/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Usa questa dashboard/ }));
    await waitFor(() => expect(storedJourney()).toMatchObject({ phase: 'done', mode: 'real', start: 'existing' }));
  });

  it('starts the recommended Home with the real devices', async () => {
    renderSetup({ ...panelScan, phase: 'compose', summary: undefined });
    await resume();

    // The preview shows the first real devices of the recommended Home, with their state.
    expect(await screen.findByText('front door')).toBeTruthy();
    expect(screen.getByText('Chiusa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Apri la Home/ }));
    await waitFor(() => expect(loadDashboardLayout('real').sections).toHaveLength(2));
    const layout = loadDashboardLayout('real');
    expect(layout.widgets).toHaveLength(7);
    expect(layout.widgets.find((widget) => widget.kind === 'lock')?.entityId).toBe('lock.front_door');
    expect(Object.keys(layout.responsiveLayouts.root ?? {})).toHaveLength(6);
    expect(storedJourney()).toMatchObject({ phase: 'done', start: 'recommended' });
  });

  it('starts an empty Home when chosen', async () => {
    renderSetup({ ...panelScan, phase: 'compose' });
    await resume();

    fireEvent.click(await screen.findByRole('radio', { name: /Home vuota/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apri la Home/ }));
    await waitFor(() => expect(storedJourney()).toMatchObject({ phase: 'done', start: 'empty' }));
    const layout = loadDashboardLayout('real');
    expect([layout.sections.length, layout.widgets.length]).toEqual([0, 0]);
  });

  it('tells a non-administrator what is limited, then goes on to the summary', async () => {
    homeAssistant({ 'auth/current_user': { name: 'Giulia', is_admin: false } });
    renderSetup(panelScan);
    await resume();

    expect(await screen.findByRole('heading', { name: 'Hai accesso come utente' })).toBeTruthy();
    // Inside the panel the account is Home Assistant's: no other account to sign in with.
    expect(screen.queryByRole('button', { name: 'Accedi con un altro account' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Continua così/ }));
    expect(await screen.findByRole('heading', { name: 'Ecco la casa di Giulia' })).toBeTruthy();
    expect(storedJourney()).toMatchObject({ limitedAccepted: true });
  });

  it('says which read did not answer, and lets the person retry or carry on', async () => {
    homeAssistant({ 'config/floor_registry/list': null });
    renderSetup(panelScan);
    await resume();

    expect(await screen.findByText('Non siamo riusciti a leggere i piani')).toBeTruthy();
    expect(screen.getByText('1 stanza, 2 dispositivi. Niente è stato cambiato.')).toBeTruthy();
    homeAssistant();
    fireEvent.click(screen.getByRole('button', { name: /Riprova/ }));
    expect(await screen.findByText('1 stanza su 1 piano, 2 dispositivi. Niente è stato cambiato.')).toBeTruthy();
    expect(screen.queryByText('Non siamo riusciti a leggere i piani')).toBeNull();
  });

  it('offers to resume a setup left half-way, or to start over', async () => {
    const view = renderSetup({ phase: 'connect', mode: 'real', connectionMethod: 'direct', hassUrl: 'http://homeassistant.local:8123' });

    expect(await screen.findByText('Eri all’accesso · homeassistant.local:8123')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Riprendi da dove eri/ }));
    expect(await screen.findByRole('heading', { name: 'Dov’è la tua casa?' })).toBeTruthy();
    expect((screen.getByLabelText('Indirizzo di Home Assistant') as HTMLInputElement).value).toBe('http://homeassistant.local:8123');
    view.unmount();

    renderSetup({ phase: 'summary', mode: 'real', connectionMethod: 'panel', summary: undefined });
    fireEvent.click(await screen.findByRole('button', { name: 'Ricomincia da capo' }));
    expect(await screen.findByRole('button', { name: /^Inizia/ })).toBeTruthy();
  });

  it('says nobody answers at the address before sending anyone to sign in there', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    renderSetup({ phase: 'connect', mode: 'real', connectionMethod: 'direct' });
    await resume();

    fireEvent.change(screen.getByLabelText('Indirizzo di Home Assistant'), { target: { value: 'http://192.168.1.250:8123' } });
    expect(screen.getByText('Indirizzo valido')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Accedi con Home Assistant/ }));

    expect(await screen.findByRole('heading', { name: 'Non troviamo Home Assistant' })).toBeTruthy();
    // The error screen in place of the sign-in: nobody was sent to an address that does not answer.
    expect(screen.getByText('192.168.1.250:8123')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cambia indirizzo' }));
    expect(await screen.findByRole('heading', { name: 'Dov’è la tua casa?' })).toBeTruthy();
  });

  it('ends the search of the home network, and says when it found nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    renderSetup({ phase: 'connect', mode: 'real', connectionMethod: 'direct' });
    await resume();

    expect(await screen.findByText('Non l’abbiamo trovata da sola: scrivi l’indirizzo')).toBeTruthy();
    expect(screen.queryByText('Cerchiamo Home Assistant nella rete di casa…')).toBeNull();
  });

  it('fills the address the search found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null)));
    renderSetup({ phase: 'connect', mode: 'real', connectionMethod: 'direct' });
    await resume();

    expect(await screen.findByText('Trovata nella tua rete: homeassistant.local:8123')).toBeTruthy();
    expect((screen.getByLabelText('Indirizzo di Home Assistant') as HTMLInputElement).value).toBe('http://homeassistant.local:8123');
  });

  it('a step after the sign-in without a session asks to sign in again instead of leaving', async () => {
    renderSetup({
      phase: 'compose',
      mode: 'real',
      connectionMethod: 'direct',
      hassUrl: 'https://casa.example.test',
      summary: { entities: 1, devices: 1, areas: 1, unavailable: 0, domains: { light: 1 }, userName: 'Mattia', canManageHa: true },
    });
    await resume();

    expect(await screen.findByRole('heading', { name: 'Accedi di nuovo' })).toBeTruthy();
    expect(screen.getByText('Casa di Mattia')).toBeTruthy();
  });

  it('says the sign-in was not completed when Home Assistant comes back without a valid answer', async () => {
    window.history.replaceState({}, '', '/setup?ha_oauth_callback=1&code=abc&state=forged');
    renderSetup({ phase: 'redirect', mode: 'real', connectionMethod: 'direct', hassUrl: 'http://homeassistant.local:8123' });

    expect(await screen.findByRole('heading', { name: 'Accesso non completato' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Riprova l’accesso/ })).toBeTruthy();
    expect(storedJourney()).toMatchObject({ phase: 'connect' });
  });

  it('asks an expired session only to sign in again, with the saved address', async () => {
    renderSetup({
      phase: 'done',
      mode: 'real',
      connectionMethod: 'direct',
      hassUrl: 'https://casa.example.test',
      summary: { entities: 1, devices: 1, areas: 1, unavailable: 0, domains: { light: 1 }, userName: 'Mattia', canManageHa: true },
    }, true);

    expect(await screen.findByRole('heading', { name: 'Accedi di nuovo' })).toBeTruthy();
    expect(screen.getByText('Casa di Mattia')).toBeTruthy();
    expect(screen.getByText('casa.example.test')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Inizia/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cambia' }));
    expect(await screen.findByLabelText('Indirizzo di Home Assistant')).toBeTruthy();
  });
});
