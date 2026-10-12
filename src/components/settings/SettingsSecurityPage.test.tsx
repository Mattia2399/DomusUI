import { cleanup, fireEvent, render as renderTestingLibrary, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { SECURITY_CENTER_STORAGE_KEYS } from '../../services/securityCenterSelection';
import { clearAllWidgetSecrets, getWidgetSecrets, isWidgetSecretsRemembered } from '../../services/widgetSecrets';
import SettingsSecurityPage from './SettingsSecurityPage';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  clearAllWidgetSecrets();
});
afterEach(() => cleanup());

const haStates = {
  'alarm_control_panel.casa': { state: 'disarmed', rawAttributes: { friendly_name: 'Allarme casa' } },
  'alarm_control_panel.garage': { state: 'disarmed', rawAttributes: { friendly_name: 'Allarme garage' } },
  'binary_sensor.porta': { state: 'off', rawAttributes: { friendly_name: 'Porta ingresso', device_class: 'door' } },
  'binary_sensor.finestra': { state: 'off', rawAttributes: { friendly_name: 'Finestra cucina', device_class: 'window' } },
  'binary_sensor.movimento': { state: 'off', rawAttributes: { friendly_name: 'Movimento corridoio', device_class: 'motion' } },
  'binary_sensor.lavatrice': { state: 'off', rawAttributes: { friendly_name: 'Lavatrice in funzione' } },
  'camera.giardino': { state: 'idle', rawAttributes: { friendly_name: 'Giardino' } },
};

function renderPage(overrides: Partial<Parameters<typeof SettingsSecurityPage>[0]> = {}) {
  const handlers = { onOpenSecurityCenter: vi.fn(), onOpenProfileSecurity: vi.fn() };
  render(
    <SettingsSecurityPage
      haStates={haStates}
      alarmCards={[{ widgetId: 'w-alarm', entityId: 'alarm_control_panel.casa', requireDeviceConfirmation: true }]}
      canManage
      deviceAuthUser={{ id: 'owner', name: 'owner', displayName: 'Mattia' }}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

const centerRow = (name: RegExp) =>
  within(screen.getByRole('region', { name: 'Centro sicurezza' })).getByRole('button', { name });

describe('SettingsSecurityPage', () => {
  it('shows what the Security center shows on this device', () => {
    renderPage();

    expect(centerRow(/Allarme principale/).textContent).toContain('Allarme casa');
    // The washing machine is not a security sensor.
    expect(centerRow(/Sensori mostrati/).textContent).toContain('3 di 3');
    expect(centerRow(/Telecamere mostrate/).textContent).toContain('1 di 1');
  });

  it('chooses the main alarm and the sensors to show, as the Security center reads them', () => {
    renderPage();

    fireEvent.click(centerRow(/Allarme principale/));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Allarme garage' }));
    expect(window.localStorage.getItem(SECURITY_CENTER_STORAGE_KEYS.alarmEntityId)).toBe('alarm_control_panel.garage');
    expect(centerRow(/Allarme principale/).textContent).toContain('Allarme garage');

    fireEvent.click(centerRow(/Sensori mostrati/));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('switch', { name: 'Finestra cucina' }));
    expect(JSON.parse(window.localStorage.getItem(SECURITY_CENTER_STORAGE_KEYS.visibleSensorEntityIds) ?? '')).toEqual({
      version: 2,
      mode: 'custom',
      ids: ['binary_sensor.movimento', 'binary_sensor.porta'],
    });
    expect(centerRow(/Sensori mostrati/).textContent).toContain('2 di 3');

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mostra tutti' }));
    expect(window.localStorage.getItem(SECURITY_CENTER_STORAGE_KEYS.visibleSensorEntityIds)).toBeNull();
    expect(centerRow(/Sensori mostrati/).textContent).toContain('3 di 3');
  });

  it('saves the codes of an alarm card on this device only', () => {
    renderPage();
    const alarms = within(screen.getByRole('region', { name: 'Protezione allarmi' }));
    expect(alarms.getByRole('button', { name: /Allarme casa/ }).textContent).toContain('Conferma dispositivo');

    fireEvent.click(alarms.getByRole('button', { name: /Allarme casa/ }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByText('Conferma dispositivo attiva')).toBeTruthy();
    fireEvent.change(sheet.getByLabelText('PIN Home Assistant'), { target: { value: ' 1234 ' } });
    fireEvent.change(sheet.getByLabelText('Codice extra locale'), { target: { value: '99' } });
    fireEvent.click(sheet.getByRole('switch', { name: 'Ricorda su questo dispositivo' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Salva' }));

    expect(getWidgetSecrets('w-alarm')).toEqual({ alarmUnlockCode: '1234', alarmLocalExtraCode: '99' });
    expect(isWidgetSecretsRemembered('w-alarm')).toBe(true);
    expect(alarms.getByRole('button', { name: /Allarme casa/ }).textContent).toContain('PIN salvato · codice extra · conferma dispositivo');

    fireEvent.click(alarms.getByRole('button', { name: /Allarme casa/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancella i codici' }));
    expect(getWidgetSecrets('w-alarm')).toEqual({});
  });

  it('points to the profile for the personal device confirmation', () => {
    const { onOpenProfileSecurity, onOpenSecurityCenter } = renderPage();

    const confirmations = within(screen.getByRole('region', { name: 'Conferme' }));
    fireEvent.click(confirmations.getByRole('button', { name: /Azioni sensibili/ }));
    expect(onOpenProfileSecurity).toHaveBeenCalledOnce();
    fireEvent.click(centerRow(/Apri il Centro sicurezza/));
    expect(onOpenSecurityCenter).toHaveBeenCalledOnce();
  });

  it('is read-only for someone who cannot manage security', () => {
    renderPage({ canManage: false });

    expect(screen.getByText('Solo un amministratore può cambiare queste impostazioni.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Centro sicurezza' })).queryByRole('button', { name: /Sensori mostrati/ })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Protezione allarmi' })).queryByRole('button')).toBeNull();
  });
});
