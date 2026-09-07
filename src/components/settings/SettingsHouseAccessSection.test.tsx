import { cleanup, fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import {
  DashboardSecurityProvider,
  createDashboardSecurityValue,
} from '../../security/dashboardAccess';
import SettingsHouseAccessSection from './SettingsHouseAccessSection';
import type { HouseAccessView } from './settingsHouseAccessModel';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });
beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const ownerSecurity = createDashboardSecurityValue({
  runtimeMode: 'real',
  haStatus: 'connected',
  user: { id: 'owner-1', isOwner: true },
});

const limitedSecurity = createDashboardSecurityValue({
  runtimeMode: 'real',
  haStatus: 'connected',
  user: { id: 'limited-1' },
});

const members = [
  { id: 'user-1', name: 'Mattia', roleLabel: 'Owner', isCurrent: true },
  { id: 'user-2', name: 'Sara', roleLabel: 'Membro' },
];

function renderSection(params: {
  view?: HouseAccessView;
  security?: typeof ownerSecurity;
  onViewChange?: (view: HouseAccessView) => void;
} = {}) {
  return render(
    <DashboardSecurityProvider value={params.security ?? ownerSecurity}>
      <SettingsHouseAccessSection
        view={params.view ?? 'overview'}
        onViewChange={params.onViewChange ?? vi.fn()}
        houseMembers={members}
        currentUserName="Mattia"
        currentUserRole="Owner"
      />
    </DashboardSecurityProvider>,
  );
}

describe('SettingsHouseAccessSection', () => {
  it('summarizes members and opens the requested nested view', () => {
    const onViewChange = vi.fn();
    renderSection({ onViewChange });

    expect(screen.getByText('2 persone disponibili')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Membri/ }));
    expect(onViewChange).toHaveBeenCalledWith('members');
  });

  it('shows the normalized Home Assistant member list', () => {
    renderSection({ view: 'members' });

    expect(screen.getByText('Mattia')).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.getByText('Account corrente')).toBeTruthy();
  });

  it('does not present frontend-only guest URLs as real access credentials', () => {
    renderSection({ view: 'guest' });

    expect(screen.getByText('Accessi temporanei in preparazione')).toBeTruthy();
    expect(screen.getByText(/Nessun accesso simulato/)).toBeTruthy();
    expect(screen.queryByText('Rigenera QR')).toBeNull();
    expect(screen.queryByText('Copia Link')).toBeNull();
  });

  it('keeps sharing actions fail-closed for a limited user', () => {
    renderSection({ view: 'share', security: limitedSecurity });

    expect(screen.queryByRole('button', { name: 'Scarica JSON' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Importa JSON' })).toBeNull();
    expect(screen.getByText(/Servono i permessi di modifica/)).toBeTruthy();
  });

  it('exposes role-scoped sharing actions to an owner', () => {
    renderSection({ view: 'share' });

    expect(screen.getByRole('button', { name: 'Scarica JSON' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importa JSON' })).toBeTruthy();
    expect(screen.getByText('Creatore')).toBeTruthy();
  });
});
