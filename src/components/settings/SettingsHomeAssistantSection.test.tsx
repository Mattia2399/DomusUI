import { cleanup, fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import SettingsHomeAssistantSection from './SettingsHomeAssistantSection';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });
beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const baseProps = {
  appearance: 'dark' as const,
  haUrl: 'https://home.example.test',
  onUrlChange: vi.fn(),
  haToken: 'secret-token',
  onTokenChange: vi.fn(),
  haRememberToken: false,
  onRememberTokenChange: vi.fn(),
  haStatus: 'disconnected' as const,
  haError: null,
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onStartOAuth: vi.fn(async () => undefined),
  isOAuthBusy: false,
};

describe('SettingsHomeAssistantSection', () => {
  it('keeps connection values controlled by its parent', () => {
    const onUrlChange = vi.fn();
    const onTokenChange = vi.fn();
    const onConnect = vi.fn();

    render(
      <SettingsHomeAssistantSection
        {...baseProps}
        onUrlChange={onUrlChange}
        onTokenChange={onTokenChange}
        onConnect={onConnect}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('http://homeassistant.local:8123'), {
      target: { value: 'https://casa.example.test' },
    });
    fireEvent.change(screen.getByDisplayValue('secret-token'), {
      target: { value: 'next-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connetti' }));

    expect(onUrlChange).toHaveBeenCalledWith('https://casa.example.test');
    expect(onTokenChange).toHaveBeenCalledWith('next-token');
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('does not put a remembered token back into the input', () => {
    const onTokenChange = vi.fn();
    const onRememberTokenChange = vi.fn();

    render(
      <SettingsHomeAssistantSection
        {...baseProps}
        haRememberToken
        onTokenChange={onTokenChange}
        onRememberTokenChange={onRememberTokenChange}
      />,
    );

    const tokenInput = screen.getByPlaceholderText('Token salvato su questo dispositivo');
    expect(tokenInput.getAttribute('value')).toBe('');
    expect(screen.getByText('Salvato')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancella' }));
    expect(onTokenChange).toHaveBeenCalledWith('');
    expect(onRememberTokenChange).toHaveBeenCalledWith(false);
  });

  it('locks manual controls when the panel bridge manages the connection', () => {
    render(<SettingsHomeAssistantSection {...baseProps} haManagedByParent />);

    expect(screen.getByPlaceholderText('http://homeassistant.local:8123').hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: 'Connetti' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accedi con OAuth' })).toBeNull();
    expect(
      screen.getByText(/Connessione live gestita automaticamente dal pannello Home Assistant/),
    ).toBeTruthy();
  });

  it('reports an OAuth failure without changing the connection authority', async () => {
    const onStartOAuth = vi.fn(async () => {
      throw new Error('OAuth non disponibile');
    });

    render(
      <SettingsHomeAssistantSection {...baseProps} onStartOAuth={onStartOAuth} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accedi con OAuth' }));

    expect(await screen.findByText('OAuth non disponibile')).toBeTruthy();
    expect(onStartOAuth).toHaveBeenCalledTimes(1);
  });
});
