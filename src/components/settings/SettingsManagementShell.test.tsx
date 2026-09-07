import { cleanup, fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import SettingsManagementShell from './SettingsManagementShell';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });
beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const sharedProps = {
  menuTitle: 'Profilo',
  menuSubtitle: 'Account e persone',
  detailTitle: 'Persone/Membri',
  detailSubtitle: 'Utenti e ruoli',
  displayName: 'Mattia',
  displayEmail: 'mattia@example.com',
  displayRole: 'Owner',
  avatarSrc: '/avatar.png',
  avatarAlt: 'Mattia',
  onAvatarError: vi.fn(),
  onBack: vi.fn(),
  onClose: vi.fn(),
  navigation: <button type="button">Sicurezza</button>,
  children: <div>Contenuto dettaglio</div>,
};

describe('SettingsManagementShell', () => {
  it('can embed the existing section content inside a routed page without an overlay shell', () => {
    render(
      <SettingsManagementShell
        {...sharedProps}
        presentation="embedded"
        isCompactViewport={false}
        showMenuOnCompact={false}
        showDetailOnCompact={false}
      />,
    );

    expect(screen.getByText('Contenuto dettaglio')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Profilo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chiudi' })).toBeNull();
  });

  it('uses a stable desktop master-detail layout', () => {
    render(
      <SettingsManagementShell
        {...sharedProps}
        isCompactViewport={false}
        showMenuOnCompact={false}
        showDetailOnCompact={false}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Profilo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Persone/Membri' })).toBeTruthy();
    expect(screen.getByText('Contenuto dettaglio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(sharedProps.onClose).toHaveBeenCalled();
  });

  it('shows either the root navigation or the detail page on compact viewports', () => {
    const { rerender } = render(
      <SettingsManagementShell
        {...sharedProps}
        isCompactViewport
        showMenuOnCompact
        showDetailOnCompact={false}
      />,
    );

    expect(screen.getByText('Mattia')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sicurezza' })).toBeTruthy();
    expect(screen.queryByText('Contenuto dettaglio')).toBeNull();

    rerender(
      <SettingsManagementShell
        {...sharedProps}
        isCompactViewport
        showMenuOnCompact={false}
        showDetailOnCompact
      />,
    );

    expect(screen.queryByRole('button', { name: 'Sicurezza' })).toBeNull();
    expect(screen.getByText('Contenuto dettaglio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Torna a Profilo' }));
    expect(sharedProps.onBack).toHaveBeenCalled();
  });
});
