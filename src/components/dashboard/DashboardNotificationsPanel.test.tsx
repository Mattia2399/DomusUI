import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationProvider, useNotifications } from '../../context/NotificationProvider';
import { DashboardNotificationsPanel } from './DashboardNotificationsPanel';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

afterEach(cleanup);

function NotificationPanelHarness() {
  const { addNotification } = useNotifications();
  return (
    <>
      <button type="button" onClick={() => addNotification('info', 'Luce aggiornata')}>
        Crea notifica
      </button>
      <DashboardNotificationsPanel isOpen onClose={vi.fn()} />
    </>
  );
}

describe('DashboardNotificationsPanel', () => {
  it('does not mark notifications as read merely by opening the center', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    render(
      <I18nProvider>
        <NotificationProvider>
          <NotificationPanelHarness />
        </NotificationProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crea notifica' }));

    expect(screen.getByText('1 non letta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Segna lette' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Segna come letta: Luce aggiornata' })).toBeTruthy();
  });

  it('marks every visible notification as read only after explicit confirmation', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    render(
      <I18nProvider>
        <NotificationProvider>
          <NotificationPanelHarness />
        </NotificationProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crea notifica' }));
    fireEvent.click(screen.getByRole('button', { name: 'Segna lette' }));

    expect(screen.getByText('Tutto aggiornato')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Segna lette' })).toBeNull();
  });
});
