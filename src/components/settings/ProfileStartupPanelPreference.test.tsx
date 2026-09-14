import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import type { HaFrontendPreferencesCallApi } from '../../services/haFrontendPreferences';
import ProfileStartupPanelPreference from './ProfileStartupPanelPreference';

function createApi(initialPanel: string | null = null) {
  let core: Record<string, unknown> = { vibrate: true };
  if (initialPanel) core.default_panel = initialPanel;
  const callApi = vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === 'frontend/get_user_data') return { value: { ...core } };
    if (message.type === 'frontend/set_user_data') {
      core = { ...(message.value as Record<string, unknown>) };
      return null;
    }
    if (message.type === 'get_panels') return { lovelace: {}, domusos: {} };
    throw new Error('unexpected request');
  }) as unknown as HaFrontendPreferencesCallApi;
  return { callApi, getCore: () => core };
}

function renderPreference(props: Partial<ComponentProps<typeof ProfileStartupPanelPreference>> = {}) {
  const api = createApi();
  render(
    <I18nProvider>
      <ProfileStartupPanelPreference
        runtimeMode="real"
        haStatus="connected"
        haUserId="user-1"
        onCallApi={api.callApi}
        {...props}
      />
    </I18nProvider>,
  );
  return api;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProfileStartupPanelPreference', () => {
  it('is hidden in Demo mode', () => {
    renderPreference({ runtimeMode: 'demo' });
    expect(screen.queryByText('Schermata iniziale')).toBeNull();
  });

  it('loads the per-user Home Assistant preference', async () => {
    const api = createApi('domusos');
    renderPreference({ onCallApi: api.callApi });
    const toggle = await screen.findByRole('switch', { name: 'Apri Domus UI all’avvio' });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
  });

  it('optimistically enables the setting and reports confirmed success', async () => {
    const api = createApi('lovelace');
    const onNotify = vi.fn();
    renderPreference({ onCallApi: api.callApi, onNotify });
    const toggle = await screen.findByRole('switch', { name: 'Apri Domus UI all’avvio' });
    await waitFor(() => expect(toggle.getAttribute('aria-busy')).toBeNull());

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await screen.findByRole('status');
    expect(api.getCore()).toEqual({ vibrate: true, default_panel: 'domusos' });
    expect(onNotify).toHaveBeenCalledWith('info', 'Domus UI si aprirà all’avvio di Home Assistant.');
  });

  it('restores the previous valid panel when disabled', async () => {
    const api = createApi('lovelace');
    const { callApi } = api;
    renderPreference({ onCallApi: callApi });
    const toggle = await screen.findByRole('switch');
    await waitFor(() => expect(toggle.getAttribute('aria-busy')).toBeNull());
    fireEvent.click(toggle);
    await screen.findByRole('status');
    await waitFor(() => expect(api.getCore().default_panel).toBe('domusos'));

    fireEvent.click(toggle);
    await waitFor(() => expect(api.getCore().default_panel).toBe('lovelace'));
    expect(await screen.findByText('La schermata iniziale precedente è stata ripristinata.')).toBeTruthy();
  });

  it('reverts the toggle and exposes an error when saving fails', async () => {
    let reads = 0;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_user_data') {
        reads += 1;
        return { value: { default_panel: 'lovelace' } };
      }
      throw new Error('offline');
    }) as unknown as HaFrontendPreferencesCallApi;
    renderPreference({ onCallApi: callApi });
    const toggle = await screen.findByRole('switch');
    await waitFor(() => expect(reads).toBe(1));

    fireEvent.click(toggle);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Home Assistant non ha confermato');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('disables the control while Home Assistant is offline', async () => {
    renderPreference({ haStatus: 'disconnected' });
    const toggle = await screen.findByRole('switch');
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Connettiti a Home Assistant/)).toBeTruthy();
  });
});
