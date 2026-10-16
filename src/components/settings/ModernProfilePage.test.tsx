import { cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import ModernProfilePage from './ModernProfilePage';
import { createFakeProfileBackend } from '../../test/fakeProfileBackend';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

// The devices screen is lazy-loaded; load its module once so tests never race the import.
beforeAll(async () => {
  await import('./profileDevices/PersonalDevicesView');
});

beforeEach(() => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  currentUserId: 'user-1',
  userAvatarAlt: 'Mattia',
  userEmail: 'mattia@example.com',
  userRoleLabel: 'Owner',
  presenceTrackerCount: 2,
  houseMembers: [
    {
      id: 'person.mattia',
      name: 'Mattia',
      userId: 'user-1',
      isCurrent: true,
    },
  ],
  movementTimeline: [
    {
      id: 'movement-1',
      title: 'Casa',
      subtitle: 'Presenza rilevata',
      timestampLabel: '14:20',
      timestampMs: 1,
      isCurrent: true,
    },
  ],
  movementPoints: [],
  movementUpdatedLabel: 'Aggiornato alle 14:20',
  haStatus: 'connected' as const,
};

describe('ModernProfilePage', () => {
  it('keeps the overview focused on the current person', () => {
    render(<ModernProfilePage {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Profilo', level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Informazioni personali/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Attività e spostamenti/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /I miei dispositivi/ })).toBeTruthy();
    // In the demo there is no Home Assistant user, so no personal preference to show.
    expect(screen.queryByRole('region', { name: 'Preferenze' })).toBeNull();
    expect(screen.queryByText('Persone/Membri')).toBeNull();
    // House and device settings live in Settings, not in the Profile.
    expect(screen.queryByRole('radiogroup', { name: 'Tema del dispositivo' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Temi colorati/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Lingua/ })).toBeNull();
    expect(screen.queryByText('Raccolta rifiuti')).toBeNull();
    expect(screen.queryByText('Connessioni')).toBeNull();
  });

  it('drills into personal activity and returns to the overview', () => {
    render(<ModernProfilePage {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Attività e spostamenti/ }));
    expect(screen.getByRole('heading', { name: 'Attività e spostamenti' })).toBeTruthy();
    expect(screen.getByText('Cronologia recente')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByRole('heading', { name: 'Profilo', level: 1 })).toBeTruthy();
  });

  it('keeps the Home Assistant startup panel among the personal preferences', () => {
    render(<ModernProfilePage {...baseProps} runtimeMode="real" haUserId="user-1" />);

    expect(screen.getByRole('region', { name: 'Preferenze' }).textContent).toContain('Schermata iniziale');
  });

  it('sends appearance and language to Settings, This device', () => {
    const onNavigate = vi.fn();
    render(<ModernProfilePage {...baseProps} navigationRoute="/profile" onNavigate={onNavigate} />);

    expect(screen.getByText(/Aspetto e lingua valgono solo su questo dispositivo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apri Questo dispositivo' }));
    expect(onNavigate).toHaveBeenCalledWith('/settings/device');
  });

  it('closes the profile when back is pressed from the overview', () => {
    const onClose = vi.fn();
    render(<ModernProfilePage {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('collapses the mobile identity beside the back button while scrolling', () => {
    render(<ModernProfilePage {...baseProps} />);

    const scrollContainer = screen.getByTestId('modern-profile-scroll');
    const collapsingHeader = screen.getByTestId('profile-collapsing-header');
    expect(collapsingHeader.getAttribute('data-collapsed')).toBe('false');

    scrollContainer.scrollTop = 96;
    fireEvent.scroll(scrollContainer);

    expect(collapsingHeader.getAttribute('data-collapsed')).toBe('true');
    expect(collapsingHeader.getAttribute('data-collapse-progress')).toBe('1.00');
    expect(collapsingHeader.textContent).toContain('Mattia');
    expect(collapsingHeader.textContent).toContain('mattia@example.com');
  });

  it('keeps nested profile navigation addressable by URL', () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <ModernProfilePage {...baseProps} navigationRoute="/profile" onNavigate={onNavigate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Informazioni personali/ }));
    expect(onNavigate).toHaveBeenCalledWith('/profile/personal');

    rerender(
      <ModernProfilePage
        {...baseProps}
        navigationRoute="/profile/devices"
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByRole('heading', { name: 'I miei dispositivi' })).toBeTruthy();
  });

  it('shows the overview at the old appearance and language addresses', () => {
    const { rerender } = render(<ModernProfilePage {...baseProps} navigationRoute="/profile/themes" />);
    expect(screen.getByRole('heading', { name: 'Profilo', level: 1 })).toBeTruthy();

    rerender(<ModernProfilePage {...baseProps} navigationRoute="/profile/language" />);
    expect(screen.getByRole('heading', { name: 'Profilo', level: 1 })).toBeTruthy();
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('it');
  });

  it('opens the support center from the profile overview', () => {
    const onNavigate = vi.fn();
    render(
      <ModernProfilePage {...baseProps} navigationRoute="/profile" onNavigate={onNavigate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Supporto e feedback/ }));
    expect(onNavigate).toHaveBeenCalledWith('/support');
  });

  it('counts the personal devices of the profile, not the presence trackers', async () => {
    const backend = createFakeProfileBackend({
      haDevices: [{ haDeviceId: 'ha-1', displayName: 'Pixel' }],
      owned: [{ haDeviceId: 'ha-1' }],
    });
    render(
      <ModernProfilePage
        {...baseProps}
        presenceTrackerCount={4}
        runtimeMode="real"
        profileDevicesSupported
        onCallApi={backend.callApi}
      />,
    );

    const row = screen.getByRole('button', { name: /I miei dispositivi/ });
    await waitFor(() => expect(row.textContent).toContain('1'));
    expect(row.textContent).toContain('Dove ricevi le notifiche Domus');
    expect(row.textContent).not.toContain('4');
    expect(backend.messages).toEqual([{ type: 'domusos/profile/get_self' }]);
  });

  it('says the device count is unavailable without Profile Core support', () => {
    const onCallApi = vi.fn();
    render(<ModernProfilePage {...baseProps} runtimeMode="real" onCallApi={onCallApi} />);

    expect(screen.getByRole('button', { name: /I miei dispositivi/ }).textContent).toContain('Non disponibile');
    expect(onCallApi).not.toHaveBeenCalled();
  });

  it('falls back to unavailable when the integration has no profile commands', async () => {
    const onCallApi = vi.fn(async () => {
      throw Object.assign(new Error('Unknown command.'), { code: 'unknown_command' });
    });
    render(
      <ModernProfilePage {...baseProps} runtimeMode="real" profileDevicesSupported onCallApi={onCallApi} />,
    );

    const row = screen.getByRole('button', { name: /I miei dispositivi/ });
    await waitFor(() => expect(row.textContent).toContain('Non disponibile'));
    fireEvent.click(row);
    expect(await screen.findByText('Aggiorna l’integrazione Domus UI per gestire i dispositivi personali.')).toBeTruthy();
    expect(onCallApi).toHaveBeenCalledTimes(1);
  });

  it('keeps the tracker count only as a presence figure in the activity page', () => {
    render(<ModernProfilePage {...baseProps} presenceTrackerCount={3} navigationRoute="/profile/activity" />);

    expect(screen.getByTestId('profile-activity-summary').textContent).toContain('3 fonti di presenza');
  });
});
