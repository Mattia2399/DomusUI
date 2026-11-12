import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { AccessControlProvider } from '../../security/AccessControlProvider';
import { accessFor } from '../../test/accessFixtures';
import type { MockEntityStateMap } from '../../types/ha';
import { CasaPage } from './CasaPage';

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const STATES: MockEntityStateMap = {
  'alarm_control_panel.casa': { state: 'disarmed' },
  'binary_sensor.bagno': { state: 'off', rawAttributes: { device_class: 'window', friendly_name: 'Finestra bagno' } },
};

/** Domus Core as it answers today: Energy and Irrigation set up, Climate and Waste not. */
function backend(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    'domusos/climate/get_config': { state: 'absent', revision: 0, config: null },
    'domusos/energy/get_state': {
      configured: true, load_error: false, available: true, profile_revision: 1, observed_at: '', modules: {},
      absent_modules: [], offline_modules: [], home_consumption: { status: 'ok', value: 0.6, unit: 'kW', origin: 'device' },
    },
    'domusos/irrigation/get_config': { schema: 'domusos-irrigation', version: 1, revision: 1, mode: 'enabled', settings: {}, sources: {}, zones: [{ id: 'z', entityId: 'switch.siepe' }] },
    'domusos/irrigation/get_state': { available: true, revision: 1, mode: 'enabled', rain: {}, sessions: [], history: [], serverTime: '', legacyAutomations: [] },
    'domusos/waste_collection/get_config': { schema: 'domusos-waste-collection', version: 2, revision: 1, updatedAt: '', updatedByUserId: '', wasteTypes: [], sources: [], mappings: [], exceptions: [], notifications: { enabled: false, time: '20:00', mode: 'recipients', recipients: [], legacyTargetCount: 0 } },
    ...overrides,
  };
  return vi.fn(async (message: Record<string, unknown>) => {
    const type = String(message.type);
    if (type in answers) return answers[type] as never;
    throw new Error(`no answer for ${type}`);
  });
}

function renderCasa(role: Parameters<typeof accessFor>[0], callApi = backend(), states = STATES) {
  const onNavigate = vi.fn();
  render(
    <I18nProvider>
      <AccessControlProvider access={accessFor(role)}>
        <CasaPage runtimeMode="real" haConnected haStates={states} onCallApi={callApi} onNavigate={onNavigate} />
      </AccessControlProvider>
    </I18nProvider>,
  );
  return { onNavigate, callApi };
}

describe('CasaPage', () => {
  it('shows the functions that are set up, each opening the page that exists today', async () => {
    const { onNavigate } = renderCasa('admin');
    expect(screen.getByRole('heading', { level: 1, name: 'Casa' })).toBeTruthy();
    const security = await screen.findByRole('button', { name: /^Sicurezza/ });
    expect(security.textContent).toContain('Disinserito');
    expect(await screen.findByRole('button', { name: /^Energia/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Irrigazione/ })).toBeTruthy();
    fireEvent.click(security);
    expect(onNavigate).toHaveBeenCalledWith('/security');
    fireEvent.click(screen.getByRole('button', { name: /^Energia/ }));
    expect(onNavigate).toHaveBeenCalledWith('/consumi');
  });

  it('offers to add only the functions that are not set up, and opens their setup', async () => {
    const { onNavigate } = renderCasa('admin');
    const add = await screen.findByRole('button', { name: /^Aggiungi una funzione/ });
    await vi.waitFor(() => expect(add.textContent).toContain('Rifiuti'));
    expect(add.textContent).toContain('Clima');
    // Energy and Irrigation are set up: they are not offered.
    expect(add.textContent).not.toMatch(/Energia|Irrigazione|Sicurezza/);
    fireEvent.click(add);
    const sheet = await screen.findByRole('dialog', { name: 'Aggiungi una funzione' });
    fireEvent.click(within(sheet).getByRole('button', { name: /Clima/ }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/climate');
  });

  it('has no button for Domus 3D, which does not exist yet', () => {
    renderCasa('admin');
    const invite = screen.getByRole('region', { name: 'Guarda la casa in 3D' });
    expect(within(invite).queryByRole('button')).toBeNull();
  });

  it('says all is well, or the things to look at, from real data', async () => {
    renderCasa('admin');
    expect((await screen.findByTestId('casa-summary')).textContent).toContain('Tutto in ordine');
    cleanup();
    renderCasa(
      'admin',
      backend({ 'domusos/irrigation/get_state': { available: true, revision: 1, mode: 'fault', rain: {}, sessions: [], history: [], serverTime: '', legacyAutomations: [] } }),
      { ...STATES, 'binary_sensor.bagno': { state: 'on', rawAttributes: { device_class: 'window', friendly_name: 'Finestra bagno' } } },
    );
    const summary = await screen.findByTestId('casa-summary');
    await vi.waitFor(() => expect(summary.textContent).toContain('2 cose da guardare'));
    expect(summary.textContent).toContain('Aperto: Finestra bagno');
    expect(summary.textContent).toContain('L’irrigazione segnala un guasto');
  });

  it('shows a restricted account only what it may open, and asks the backend nothing else', async () => {
    const { callApi } = renderCasa('restricted');
    expect(screen.queryByRole('button', { name: /^Sicurezza/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Automazioni/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^App Gallery/ })).toBeTruthy();
    const asked = callApi.mock.calls.map(([message]) => String(message.type));
    expect(asked.some((type) => type.startsWith('domusos/energy'))).toBe(false);
  });

  it('shows the tools that exist, and opens them', () => {
    const { onNavigate } = renderCasa('admin');
    const tools = screen.getByRole('region', { name: 'Strumenti' });
    fireEvent.click(within(tools).getByRole('button', { name: /^Automazioni/ }));
    expect(onNavigate).toHaveBeenCalledWith('/automations');
    expect(within(tools).queryByText(/Domus 3D|Editor di card/)).toBeNull();
  });
});
