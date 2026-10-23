import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { AccessControlProvider } from '../../security/AccessControlProvider';
import type { AccessSnapshot } from '../../security/accessControl';
import { accessFor } from '../../test/accessFixtures';
import { PeopleAccessManager } from './PeopleAccessManager';

const ADMIN = 'a'.repeat(32);
const MARIO = 'b'.repeat(32);
const EX = 'c'.repeat(32);

type Assignment = { role: string; grants: string[] };

/** The backend of People and access, in memory, with its rules: revision, roles, grants, targets. */
function fakeBackend({ state = 'absent', assignments = {} as Record<string, Assignment>, revision = 0 } = {}) {
  const policy = { state, revision, assignments: { ...assignments } };
  const users = [
    { user_id: ADMIN, name: 'Mattia', is_admin: true, is_owner: true, is_active: true },
    { user_id: MARIO, name: 'Mario Rossi', is_admin: false, is_owner: false, is_active: true },
    { user_id: EX, name: 'Ex', is_admin: false, is_owner: false, is_active: false },
  ];
  const trusted = () => policy.state === 'absent' || policy.state === 'ready';
  const view = (user: (typeof users)[number]) => {
    const assignment = policy.assignments[user.user_id];
    return {
      ...user,
      manageable: trusted() && user.is_active,
      role: !trusted() ? 'locked' : assignment?.role ?? (user.is_admin ? 'admin' : 'member'),
      assigned: trusted() && Boolean(assignment),
      grants: trusted() ? assignment?.grants ?? [] : [],
    };
  };
  const fail = (code: string) => Promise.reject(Object.assign(new Error(code), { code }));
  const callApi = vi.fn(async (message: Record<string, unknown>) => {
    const user = users.find((entry) => entry.user_id === message.user_id);
    switch (message.type) {
      case 'domusos/access/list_accounts':
        return { state: policy.state, revision: policy.revision, accounts: users.map(view) };
      case 'domusos/access/set_assignment':
      case 'domusos/access/remove_assignment':
        if (!trusted()) return fail('access_store_untrusted');
        if (message.expected_revision !== policy.revision) return fail('revision_conflict');
        if (!user) return fail('unknown_account');
        if (!user.is_active) return fail('account_not_manageable');
        if (message.type === 'domusos/access/set_assignment') {
          // As the backend: the Administrator role only for a Home Assistant administrator (Q24).
          if (message.role === 'admin' && !user.is_admin) return fail('role_requires_ha_admin');
          const redundant = message.role === 'admin' || message.role === 'resident';
          policy.assignments[user.user_id] = { role: String(message.role), grants: redundant ? [] : (message.grants as string[]) };
        } else {
          delete policy.assignments[user.user_id];
        }
        policy.revision += 1;
        policy.state = 'ready';
        return { state: policy.state, revision: policy.revision, account: view(user) };
      case 'domusos/access/reset_policy':
        policy.assignments = {};
        policy.state = 'absent';
        policy.revision = 0;
        return { state: 'absent', previous_state: 'corrupt', previous_revision: null, kept: [] };
      default:
        return fail('unknown_command');
    }
  });
  return { policy, callApi };
}

function renderManager(callApi: (message: Record<string, unknown>) => Promise<unknown>, access: AccessSnapshot, refresh = vi.fn()) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  render(
    <I18nProvider>
      <AccessControlProvider access={access} refresh={refresh}>
        <PeopleAccessManager callApi={callApi} />
      </AccessControlProvider>
    </I18nProvider>,
  );
  return refresh;
}

const adminAccess = () => accessFor('admin', { userId: ADMIN, isAdmin: true, isOwner: true });
const row = (name: RegExp) => screen.getByRole('button', { name });
const dialog = () => screen.getByRole('dialog');

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('People and access', () => {
  it('lists the accounts with their default roles, badges and the honest note', async () => {
    const { callApi } = fakeBackend();
    renderManager(callApi, adminAccess());
    const mario = await screen.findByRole('button', { name: /Mario Rossi/ });
    expect(mario.textContent).toContain('Membro');
    expect(mario.textContent).toContain('Predefinito');
    const owner = row(/Mattia/);
    expect(owner.textContent).toContain('Amministratore');
    expect(owner.textContent).toContain('Proprietario di Home Assistant');
    expect(owner.textContent).toContain('Tu');
    expect(screen.getByText(/I permessi di Home Assistant restano indipendenti/)).toBeTruthy();
    // A disabled account is listed apart and cannot be opened.
    const ex = row(/^Ex/);
    expect(ex.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('region', { name: 'Account disattivati' })).toBeTruthy();
    // No technical id anywhere.
    expect(document.body.textContent).not.toMatch(/access\.control|security\.control|access\.manage/);
  });

  it('gives a member a personal grant in one save and shows what the backend saved', async () => {
    const { callApi, policy } = fakeBackend();
    renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: /Mario Rossi/ }));
    const editor = within(dialog());
    expect(editor.queryByText('Modifiche non salvate')).toBeNull();
    expect((editor.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(editor.getByRole('switch', { name: 'Controllo accessi' }));
    expect(editor.getByText('Modifiche non salvate')).toBeTruthy();
    fireEvent.click(editor.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(editor.getByText('Salvato.')).toBeTruthy());
    expect(callApi).toHaveBeenCalledWith(
      { type: 'domusos/access/set_assignment', user_id: MARIO, role: 'member', grants: ['access.control'], expected_revision: 0 },
      expect.anything(),
    );
    expect(policy.assignments[MARIO]).toEqual({ role: 'member', grants: ['access.control'] });
    expect(row(/Mario Rossi/).textContent).toContain('Personalizzato');
    expect(row(/Mario Rossi/).textContent).toContain('Permessi aggiuntivi: Controllo accessi');
  });

  it('changes a role, then restores the default without writing it', async () => {
    const { callApi, policy } = fakeBackend();
    renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: /Mario Rossi/ }));
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Accesso limitato/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(policy.assignments[MARIO]?.role).toBe('restricted'));
    fireEvent.click(await within(dialog()).findByRole('button', { name: /Ripristina ruolo predefinito/ }));
    await waitFor(() => expect(policy.assignments[MARIO]).toBeUndefined());
    expect(callApi).toHaveBeenLastCalledWith(
      { type: 'domusos/access/remove_assignment', user_id: MARIO, expected_revision: 1 },
      expect.anything(),
    );
    expect(row(/Mario Rossi/).textContent).toContain('Predefinito');
  });

  it('cancels unsaved changes', async () => {
    const { callApi } = fakeBackend();
    renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: /Mario Rossi/ }));
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Pannello/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Annulla' }));
    expect(within(dialog()).queryByText('Modifiche non salvate')).toBeNull();
    expect((within(dialog()).getByRole('radio', { name: /Membro/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('never overwrites a change made elsewhere: it says so and reloads', async () => {
    const { callApi, policy } = fakeBackend();
    renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: /Mario Rossi/ }));
    // Another session saves first.
    policy.assignments[MARIO] = { role: 'wall_panel', grants: [] };
    policy.revision = 1;
    policy.state = 'ready';
    fireEvent.click(within(dialog()).getByRole('switch', { name: 'Controllo allarme' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Salva' }));
    const alert = await within(dialog()).findByRole('alert');
    expect(alert.textContent).toContain('Le autorizzazioni sono state aggiornate da un’altra sessione.');
    expect(document.activeElement).toBe(alert);
    expect(policy.assignments[MARIO]).toEqual({ role: 'wall_panel', grants: [] });
    fireEvent.click(within(alert).getByRole('button', { name: 'Ricarica' }));
    await waitFor(() => expect(within(dialog()).queryByRole('alert')).toBeNull());
    expect((within(dialog()).getByRole('radio', { name: /Pannello/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('offers a non-administrator full house access as a Resident, never the Administrator role', async () => {
    const { callApi, policy } = fakeBackend();
    renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: /Mario Rossi/ }));
    expect(within(dialog()).queryByRole('radio', { name: /Amministratore/ })).toBeNull();
    expect(within(dialog()).getByText('Amministratore è disponibile solo per gli amministratori di Home Assistant.')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Residente/ }));
    expect(within(dialog()).getByText('Accesso completo alla casa, senza funzioni amministrative.')).toBeTruthy();
    expect(within(dialog()).getByText('Un residente ha già questi permessi.')).toBeTruthy();
    const accessSwitch = within(dialog()).getByRole('switch', { name: 'Controllo accessi' }) as HTMLButtonElement;
    expect(accessSwitch.disabled).toBe(true);
    expect(accessSwitch.getAttribute('aria-checked')).toBe('true');
    // Two axes, for reading only: the capabilities decide.
    const summary = within(dialog()).getByText('Accesso alla casa').closest('dl') as HTMLElement;
    expect(summary.textContent).toContain('Completo');
    expect(summary.textContent).toContain('AmministrazioneNo');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(callApi).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'resident', grants: [] }), expect.anything()));
    await waitFor(() => expect(policy.assignments[MARIO]).toEqual({ role: 'resident', grants: [] }));
  });

  it('keeps the Administrator role for a Home Assistant administrator, without redundant permissions', async () => {
    const { callApi } = fakeBackend();
    renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: /Mattia/ }));
    const administrator = within(dialog()).getByRole('radio', { name: /Amministratore/ }) as HTMLInputElement;
    expect(administrator.checked).toBe(true);
    expect(within(dialog()).getByText('Gestisce Domus, persone, accessi e configurazione.')).toBeTruthy();
    expect(within(dialog()).getByText('Un amministratore ha già questi permessi.')).toBeTruthy();
    expect((within(dialog()).getByText('Accesso alla casa').closest('dl') as HTMLElement).textContent).toContain('AmministrazioneSì');
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Residente/ }));
    expect((within(dialog()).getByText('Accesso alla casa').closest('dl') as HTMLElement).textContent).toContain('AmministrazioneNo');
  });

  it('shows a legacy Administrator role on a non-administrator as something to review, and lets it become Resident', async () => {
    const { callApi, policy } = fakeBackend({ state: 'ready', revision: 3, assignments: { [MARIO]: { role: 'admin', grants: [] } } });
    renderManager(callApi, adminAccess());
    const mario = await screen.findByRole('button', { name: /Mario Rossi/ });
    expect(mario.textContent).toContain('Da rivedere');
    fireEvent.click(mario);
    expect(within(dialog()).getByRole('status').textContent).toContain('Scegli Residente');
    expect((within(dialog()).getByText('Accesso alla casa').closest('dl') as HTMLElement).textContent).toContain('AmministrazioneNo');
    expect(within(dialog()).queryByRole('radio', { name: /Amministratore/ })).toBeNull();
    // Nothing is changed by itself.
    expect(policy.assignments[MARIO]).toEqual({ role: 'admin', grants: [] });
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Residente/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(policy.assignments[MARIO]).toEqual({ role: 'resident', grants: [] }));
  });

  it('refreshes the interface at once when an administrator changes their own account', async () => {
    const { callApi } = fakeBackend();
    const refresh = renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: /Mattia/ }));
    expect(within(dialog()).getByText(/potrai sempre gestire gli accessi/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Membro/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('does not refresh the administrator when another account changes', async () => {
    const { callApi } = fakeBackend();
    const refresh = renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: /Mario Rossi/ }));
    fireEvent.click(within(dialog()).getByRole('switch', { name: 'Controllo accessi' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(within(dialog()).getByText('Salvato.')).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows an untrusted policy as a recovery, with nothing to edit, and restores it after confirmation', async () => {
    const { callApi, policy } = fakeBackend({ state: 'corrupt' });
    const refresh = renderManager(callApi, accessFor('locked', { userId: ADMIN, isAdmin: true }));
    expect(await screen.findByText('Le autorizzazioni non sono leggibili')).toBeTruthy();
    expect(row(/Mario Rossi/).hasAttribute('disabled')).toBe(true);
    expect(row(/Mario Rossi/).textContent).toContain('Bloccato');
    fireEvent.click(screen.getByRole('button', { name: /Ripristina autorizzazioni Domus/ }));
    const confirm = within(screen.getByRole('dialog'));
    expect(confirm.getByText(/Gli utenti di Home Assistant e i loro permessi non cambiano/)).toBeTruthy();
    expect(callApi).not.toHaveBeenCalledWith({ type: 'domusos/access/reset_policy' }, expect.anything());
    await act(async () => {
      fireEvent.click(confirm.getByRole('button', { name: 'Ripristina' }));
    });
    await waitFor(() => expect(screen.getByText('Autorizzazioni ripristinate.')).toBeTruthy());
    expect(policy.state).toBe('absent');
    expect(refresh).toHaveBeenCalled();
    expect(row(/Mario Rossi/).hasAttribute('disabled')).toBe(false);
    expect(row(/Mario Rossi/).textContent).toContain('Membro');
  });

  it('offers to try again when the accounts cannot be read', async () => {
    const callApi = vi.fn().mockRejectedValueOnce(new Error('socket closed')).mockResolvedValueOnce({ state: 'absent', revision: 0, accounts: [] });
    renderManager(callApi, adminAccess());
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(2));
  });
  it.each([
    [{ code: 'unknown_command', message: 'Unknown command.' }, 'Questa funzione richiede la versione aggiornata dell’integrazione Domus in Home Assistant.', false],
    [{ code: 'unauthorized', message: 'Unauthorized' }, 'Solo un amministratore di Home Assistant può gestire i ruoli Domus.', false],
    [new Error('socket closed'), 'Non è stato possibile leggere gli account.', true],
  ])('says why the accounts could not be read (%o), offering to try again only when it may help', async (error, text, retry) => {
    const callApi = vi.fn(async () => {
      throw error;
    });
    renderManager(callApi, adminAccess());
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Riprova' })).toHaveLength(retry ? 1 : 0);
  });
});
