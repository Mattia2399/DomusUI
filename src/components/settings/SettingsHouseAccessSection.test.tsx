import { cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import {
  DashboardSecurityProvider,
  createDashboardSecurityValue,
} from '../../security/dashboardAccess';
import SettingsHouseAccessSection from './SettingsHouseAccessSection';
import type { HouseAccessView, PersonAccountLinking } from './settingsHouseAccessModel';

// Canvas cropping is not available in jsdom: the chooser receives a prepared image.
vi.mock('../../services/personPicture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/personPicture')>()),
  preparePersonPicture: vi.fn(async () => new Blob(['prepared'], { type: 'image/jpeg' })),
}));

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });
beforeEach(() => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
});
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
  showSubviewHeader?: boolean;
} = {}) {
  return render(
    <DashboardSecurityProvider value={params.security ?? ownerSecurity}>
      <SettingsHouseAccessSection
        view={params.view ?? 'overview'}
        onViewChange={params.onViewChange ?? vi.fn()}
        houseMembers={members}
        currentUserName="Mattia"
        currentUserRole="Owner"
        showSubviewHeader={params.showSubviewHeader}
      />
    </DashboardSecurityProvider>,
  );
}

const householdMembers = [
  { id: 'user:u-mattia', name: 'Mattia', userId: 'u-mattia', personEntityId: 'person.mattia', hasAccount: true, roleLabel: 'Creatore', isCurrent: true },
  { id: 'person:person.angela', name: 'Angela', personEntityId: 'person.angela', hasAccount: false },
  { id: 'user:u-angela', name: 'Angela', userId: 'u-angela', hasAccount: true, roleLabel: 'Membro' },
];

describe('SettingsHouseAccessSection', () => {
  it('lists people apart from Home Assistant logins that no person represents', () => {
    render(
      <DashboardSecurityProvider value={ownerSecurity}>
        <SettingsHouseAccessSection
          view="members"
          onViewChange={vi.fn()}
          houseMembers={householdMembers}
          currentUserName="Mattia"
          currentUserRole="Creatore"
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByText('Persone')).toBeTruthy();
    expect(screen.getByText('Account senza persona')).toBeTruthy();
    expect(screen.getByText('Senza accesso')).toBeTruthy();
    expect(screen.getByText('Account non collegato')).toBeTruthy();
    // A person without a login shows no role; the linked owner and the account do.
    expect(screen.getAllByText(/^(Creatore|Membro)$/)).toHaveLength(2);
  });

  const renderMembers = (personLinking?: PersonAccountLinking) =>
    render(
      <DashboardSecurityProvider value={ownerSecurity}>
        <SettingsHouseAccessSection
          view="members"
          onViewChange={vi.fn()}
          houseMembers={householdMembers}
          personLinking={personLinking}
          currentUserName="Mattia"
          currentUserRole="Creatore"
        />
      </DashboardSecurityProvider>,
    );

  it('offers no link actions without the administrator linking capability', () => {
    renderMembers();
    expect(screen.queryByRole('button', { name: /Collega a una persona/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Scollega account/ })).toBeNull();
  });

  const linking = (extra: Partial<PersonAccountLinking> = {}) => ({
    link: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
    edit: vi.fn(async () => undefined),
    ...extra,
  });

  it('links an account to the person suggested by name after confirmation', async () => {
    const personLinking = linking();
    renderMembers(personLinking);

    fireEvent.click(screen.getByRole('button', { name: 'Collega a una persona: Angela' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Collega l’account di Angela')).toBeTruthy();
    expect(within(dialog).getByText('Stesso nome')).toBeTruthy();
    expect((within(dialog).getByRole('radio') as HTMLInputElement).checked).toBe(true);
    expect(personLinking.link).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Collega' }));
    await waitFor(() => expect(personLinking.link).toHaveBeenCalledWith('person.angela', 'u-angela'));
    expect(await screen.findByText('Account collegato a Angela.')).toBeTruthy();
  });

  it('unlinks after confirmation and reports Home Assistant errors', async () => {
    const personLinking = linking({
      unlink: vi.fn(async () => {
        throw new Error('Home Assistant non ha accettato la modifica.');
      }),
    });
    renderMembers(personLinking);

    fireEvent.click(screen.getByRole('button', { name: 'Scollega account: Mattia' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Scollega' }));
    await waitFor(() => expect(personLinking.unlink).toHaveBeenCalledWith('person.mattia'));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('non ha accettato');
  });

  it('offers person creation only when the bridge supports it', () => {
    renderMembers(linking());
    expect(screen.queryByRole('button', { name: 'Aggiungi persona' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Crea persona/ })).toBeNull();
  });

  it('adds a person with an optional login and blocks duplicate names', async () => {
    const personLinking = linking({ create: vi.fn(async () => undefined) });
    renderMembers(personLinking);

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi persona' }));
    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByRole('textbox', { name: 'Nome' });
    const createButton = within(dialog).getByRole('button', { name: 'Crea' }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: 'angela' } });
    expect(within(dialog).getByText('Esiste già una persona con questo nome.')).toBeTruthy();
    expect(createButton.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: ' Giulia ' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Angela' }));
    fireEvent.click(createButton);
    await waitFor(() => expect(personLinking.create).toHaveBeenCalledWith('Giulia', 'u-angela', null));
    expect(await screen.findByText('Persona Giulia creata.')).toBeTruthy();
  });

  it('creates the person for an account with its name prefilled', async () => {
    const personLinking = linking({ create: vi.fn(async () => undefined) });
    renderMembers(personLinking);

    fireEvent.click(screen.getByRole('button', { name: 'Crea persona: Angela' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Crea la persona di Angela')).toBeTruthy();
    expect((within(dialog).getByRole('textbox', { name: 'Nome' }) as HTMLInputElement).value).toBe('Angela');
    // Angela already exists as a person without a login: linking is the right move.
    expect(within(dialog).getByText(/usa «Collega»/)).toBeTruthy();
    expect(within(dialog).queryByRole('radio')).toBeNull();

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome' }), { target: { value: 'Angela R.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crea' }));
    await waitFor(() => expect(personLinking.create).toHaveBeenCalledWith('Angela R.', 'u-angela', null));
  });

  it('renames a person and blocks names already used by someone else', async () => {
    const personLinking = linking();
    renderMembers(personLinking);
    // Without picture support the avatar is not a button, but people can still be renamed.
    expect(screen.queryByRole('button', { name: /^Foto di / })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Modifica persona: Angela' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Modifica Angela')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Scegli foto' })).toBeNull();
    const nameInput = within(dialog).getByRole('textbox', { name: 'Nome' }) as HTMLInputElement;
    const saveButton = within(dialog).getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
    expect(nameInput.value).toBe('Angela');
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: 'mattia' } });
    expect(within(dialog).getByText('Esiste già una persona con questo nome.')).toBeTruthy();
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: ' Angela Rossi ' } });
    fireEvent.click(saveButton);
    await waitFor(() => expect(personLinking.edit).toHaveBeenCalledWith('person.angela', { name: 'Angela Rossi' }));
    expect(await screen.findByText('Persona Angela Rossi aggiornata.')).toBeTruthy();
  });

  it('changes a person photo from the avatar only when pictures can be uploaded', async () => {
    const personLinking = linking({ supportsPictures: true });
    renderMembers(personLinking);
    // Only people get a photo, not bare logins.
    expect(screen.queryAllByRole('button', { name: /^Foto di / })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Foto di Mattia' }));
    const dialog = await screen.findByRole('dialog');
    const saveButton = within(dialog).getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const file = new File(['raw'], 'me.heic', { type: 'image/heic' });
    fireEvent.change(within(dialog).getByLabelText('Scegli foto', { selector: 'input' }), { target: { files: [file] } });
    await waitFor(() => expect(saveButton.disabled).toBe(false));
    expect(await within(dialog).findByRole('button', { name: 'Rimuovi foto' })).toBeTruthy();

    fireEvent.click(saveButton);
    await waitFor(() =>
      expect(personLinking.edit).toHaveBeenCalledWith('person.mattia', { picture: expect.any(Blob) }),
    );
    expect(await screen.findByText('Persona Mattia aggiornata.')).toBeTruthy();
  });

  it('removes an existing photo', async () => {
    const personLinking = linking({ supportsPictures: true });
    render(
      <DashboardSecurityProvider value={ownerSecurity}>
        <SettingsHouseAccessSection
          view="members"
          onViewChange={vi.fn()}
          houseMembers={[{ ...householdMembers[0], avatarUrl: '/api/image/serve/abc/512x512' }]}
          personLinking={personLinking}
        />
      </DashboardSecurityProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Foto di Mattia' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rimuovi foto' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(personLinking.edit).toHaveBeenCalledWith('person.mattia', { picture: null }));
  });

  it('creates a person with the chosen photo', async () => {
    const create = vi.fn(async () => undefined);
    renderMembers(linking({ create, supportsPictures: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi persona' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome' }), { target: { value: 'Giulia' } });
    fireEvent.change(within(dialog).getByLabelText('Scegli foto', { selector: 'input' }), {
      target: { files: [new File(['raw'], 'giulia.jpg', { type: 'image/jpeg' })] },
    });
    await within(dialog).findByRole('button', { name: 'Rimuovi foto' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crea' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('Giulia', null, expect.any(Blob)));
  });

  it('counts only people in the overview when Home Assistant people exist', () => {
    render(
      <DashboardSecurityProvider value={ownerSecurity}>
        <SettingsHouseAccessSection
          view="overview"
          onViewChange={vi.fn()}
          houseMembers={householdMembers}
          currentUserName="Mattia"
          currentUserRole="Creatore"
        />
      </DashboardSecurityProvider>,
    );

    expect(screen.getByText('2 persone disponibili')).toBeTruthy();
  });

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

  it('leaves title and back navigation to the routed page header', () => {
    renderSection({ view: 'members', showSubviewHeader: false });

    expect(screen.queryByRole('button', { name: 'Casa e accessi' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Membri della casa' })).toBeNull();
    expect(screen.getByText('Sara')).toBeTruthy();
  });
});
