import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import type { ProfileRecipientsCallApi } from '../../services/profileRecipientsClient';
import PersonRecipientPicker, { type PersonRecipientPickerProps } from './PersonRecipientPicker';
import type { PersonStates } from './personRecipientModel';

type Entry = { person_id: string; person_entity_id: string | null; status: string; selectable: boolean };

const entry = (personId: string, entityId: string | null, status = 'ready'): Entry => ({
  person_id: personId,
  person_entity_id: entityId,
  status,
  selectable: status !== 'ambiguous',
});

const STATES: PersonStates = {
  'person.mattia': { rawAttributes: { id: 'p-mattia', friendly_name: 'Mattia', entity_picture: '/api/image/serve/m/512x512' } },
  'person.erika': { rawAttributes: { id: 'p-erika', friendly_name: 'Erika' } },
  'person.andrea_1': { rawAttributes: { id: 'p-a1', friendly_name: 'Andrea' } },
  'person.andrea_2': { rawAttributes: { id: 'p-a2', friendly_name: 'Andrea' } },
};

function backend(initial: Entry[]) {
  let answer: Entry[] | Error = initial;
  let release: (() => void) | null = null;
  const callApi = vi.fn(async () => {
    if (release === null && hold) await new Promise<void>((resolve) => { release = resolve; });
    if (answer instanceof Error) throw answer;
    return { recipients: answer };
  });
  let hold = false;
  return {
    callApi: callApi as unknown as ProfileRecipientsCallApi,
    calls: callApi,
    set(next: Entry[] | Error) { answer = next; },
    holdNext() { hold = true; release = null; },
    release() { hold = false; release?.(); },
  };
}

function Harness({ initial = [], onChange, ...props }: Partial<PersonRecipientPickerProps> & { initial?: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <PersonRecipientPicker
        value={value}
        onChange={(next) => {
          onChange?.(next);
          setValue(next);
        }}
        states={STATES}
        supported
        online
        {...props}
      />
      <output data-testid="value">{value.join(',')}</output>
    </>
  );
}

const renderPicker = (props: Partial<PersonRecipientPickerProps> & { initial?: string[] }) =>
  render(
    <I18nProvider>
      <Harness {...props} />
    </I18nProvider>,
  );

const open = () => fireEvent.click(screen.getByRole('button', { name: /Seleziona persone/ }));
const row = (name: string) => screen.getByRole('checkbox', { name });
const value = () => screen.getByTestId('value').textContent;

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('PersonRecipientPicker', () => {
  it('loads only when opened and selects by person id', async () => {
    const api = backend([entry('p-mattia', 'person.mattia')]);
    const onChange = vi.fn();
    renderPicker({ callApi: api.callApi, onChange });
    expect(api.calls).not.toHaveBeenCalled();

    open();
    const mattia = await screen.findByRole('checkbox', { name: 'Mattia' });
    expect(within(mattia).getByText('Pronto')).toBeTruthy();
    expect(mattia.querySelector('img')?.getAttribute('src')).toBe('/api/image/serve/m/512x512');
    expect(screen.getByRole('dialog', { name: 'Scegli i destinatari' })).toBeTruthy();

    fireEvent.click(mattia);
    expect(onChange).toHaveBeenLastCalledWith(['p-mattia']);
    expect(mattia.getAttribute('aria-checked')).toBe('true');
    expect(api.calls).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no_devices', 'Deve configurare un dispositivo'],
    ['no_profile', 'Profilo Domus non configurato'],
    ['no_account', 'Nessun account Home Assistant collegato'],
    ['notifications_disabled', 'Notifiche disattivate'],
    ['temporarily_unavailable', 'Temporaneamente non disponibile'],
    ['account_disabled', 'Account Home Assistant disattivato'],
    ['account_unavailable', 'Account non disponibile'],
    ['profile_unavailable', 'Profilo temporaneamente non disponibile'],
  ])('a person with status %s can still be chosen', async (status, label) => {
    const api = backend([entry('p-erika', 'person.erika', status)]);
    renderPicker({ callApi: api.callApi });
    open();

    const erika = await screen.findByRole('checkbox', { name: 'Erika' });
    expect(within(erika).getByText(label)).toBeTruthy();
    expect((erika as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(erika);
    expect(value()).toBe('p-erika');
  });

  it('shows an ambiguous identity without letting anyone pick it, nor guessing by name', async () => {
    const api = backend([entry('p-mattia', null, 'ambiguous')]);
    renderPicker({ callApi: api.callApi });
    open();

    const rows = await screen.findAllByTestId('recipient-row');
    expect(rows).toHaveLength(1);
    const ambiguous = within(rows[0]).getByRole('checkbox');
    expect(ambiguous.getAttribute('aria-label')).toBe('Persona senza nome');
    expect(within(rows[0]).getByText('Identità persona da controllare')).toBeTruthy();
    expect(within(rows[0]).getByText('Home Assistant contiene più identità con lo stesso identificatore.')).toBeTruthy();
    expect((ambiguous as HTMLButtonElement).disabled).toBe(true);
    // The name of person.mattia is never borrowed for the ambiguous id.
    expect(within(rows[0]).queryByText('Mattia')).toBeNull();
  });

  it('keeps an already chosen ambiguous person until it is removed', async () => {
    const api = backend([entry('p-mattia', null, 'ambiguous')]);
    const onChange = vi.fn();
    renderPicker({ callApi: api.callApi, initial: ['p-mattia'], onChange });
    open();

    const ambiguous = (await screen.findAllByTestId('recipient-row'))[0];
    const control = within(ambiguous).getByRole('checkbox');
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(control);
    expect(value()).toBe('');
    // Once removed it cannot be added back.
    expect((within((await screen.findAllByTestId('recipient-row'))[0]).getByRole('checkbox') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a removed person selected and visible until the administrator removes it', async () => {
    const api = backend([entry('p-mattia', 'person.mattia')]);
    const onChange = vi.fn();
    renderPicker({ callApi: api.callApi, initial: ['removed-person-id'], onChange });
    open();

    const removed = await screen.findByRole('checkbox', { name: 'Rimuovi Persona rimossa' });
    expect(removed.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByText('Persona rimossa').length).toBeGreaterThan(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(value()).toBe('removed-person-id');

    fireEvent.click(removed);
    expect(value()).toBe('');
    expect(screen.queryByRole('checkbox', { name: /Persona rimossa/ })).toBeNull();
  });

  it('a refresh updates only the status, never the selection', async () => {
    const api = backend([entry('p-mattia', 'person.mattia')]);
    const onChange = vi.fn();
    renderPicker({ callApi: api.callApi, initial: ['p-mattia'], onChange });
    open();
    expect(within(await screen.findByRole('checkbox', { name: 'Mattia' })).getByText('Pronto')).toBeTruthy();

    api.set([entry('p-mattia', 'person.mattia', 'no_devices')]);
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna' }));

    await waitFor(() => expect(within(row('Mattia')).getByText('Deve configurare un dispositivo')).toBeTruthy());
    expect(row('Mattia').getAttribute('aria-checked')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
    expect(api.calls).toHaveBeenCalledTimes(2);
  });

  it('keeps two people with the same name apart', async () => {
    const api = backend([entry('p-a1', 'person.andrea_1'), entry('p-a2', 'person.andrea_2', 'no_devices')]);
    renderPicker({ callApi: api.callApi });
    open();

    const andreas = await screen.findAllByRole('checkbox', { name: 'Andrea' });
    expect(andreas).toHaveLength(2);
    fireEvent.click(andreas[1]);
    expect(value()).toBe('p-a2');
  });

  it('searches by displayed name only; the selection stays by id', async () => {
    const api = backend([entry('p-mattia', 'person.mattia'), entry('p-erika', 'person.erika')]);
    renderPicker({ callApi: api.callApi, initial: ['p-erika'] });
    open();
    await screen.findByRole('checkbox', { name: 'Mattia' });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca persone' }), { target: { value: 'matt' } });
    expect(screen.queryByRole('checkbox', { name: 'Erika' })).toBeNull();
    fireEvent.click(row('Mattia'));
    expect(value()).toBe('p-erika,p-mattia');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca persone' }), { target: { value: 'p-erika' } });
    expect(screen.getByText('Nessuna persona corrisponde alla ricerca.')).toBeTruthy();
    expect(value()).toBe('p-erika,p-mattia');
  });

  it('follows a renamed person through its id', async () => {
    const api = backend([entry('p-mattia', 'person.mattia_t')]);
    const states: PersonStates = { 'person.mattia_t': { rawAttributes: { id: 'p-mattia', friendly_name: 'Mattia T.' } } };
    renderPicker({ callApi: api.callApi, initial: ['p-mattia'], states });

    expect(screen.getByText('Mattia T.')).toBeTruthy();
    open();
    expect((await screen.findByRole('checkbox', { name: 'Mattia T.' })).getAttribute('aria-checked')).toBe('true');
    expect(value()).toBe('p-mattia');
  });

  it('keeps the selection when the list cannot be loaded, and retries', async () => {
    const api = backend([entry('p-mattia', 'person.mattia')]);
    api.set(new Error('socket closed'));
    renderPicker({ callApi: api.callApi, initial: ['p-mattia', 'p-erika'] });
    open();

    expect(await screen.findByText('Non è stato possibile caricare le persone.')).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(value()).toBe('p-mattia,p-erika');

    api.set([entry('p-mattia', 'person.mattia')]);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('checkbox', { name: 'Mattia' })).toBeTruthy();
    expect(value()).toBe('p-mattia,p-erika');
  });

  it('offline: shows what is selected but cannot change it', () => {
    const api = backend([entry('p-mattia', 'person.mattia')]);
    renderPicker({ callApi: api.callApi, initial: ['p-mattia'], online: false });

    expect(screen.getByText('Mattia')).toBeTruthy();
    expect(screen.getByText('Connettiti a Home Assistant per aggiornare i destinatari.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Seleziona persone/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.calls).not.toHaveBeenCalled();
    expect(value()).toBe('p-mattia');
  });

  it('without the capability it never calls the integration', () => {
    const api = backend([]);
    renderPicker({ callApi: api.callApi, supported: false, initial: ['p-mattia'] });

    expect(screen.getByText('Selezione destinatari non disponibile')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Seleziona persone/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.calls).not.toHaveBeenCalled();
  });

  it('tells a non-administrator, without crashing or listing anyone', async () => {
    const api = backend([]);
    api.set(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }));
    renderPicker({ callApi: api.callApi, initial: ['p-mattia'] });
    open();

    expect(await screen.findByText('Solo un amministratore può scegliere i destinatari.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
    expect(value()).toBe('p-mattia');
  });

  it('shows skeleton rows while loading and an empty state when nobody exists', async () => {
    const api = backend([]);
    api.holdNext();
    renderPicker({ callApi: api.callApi });
    open();

    expect(await screen.findByRole('status', { name: 'Caricamento delle persone…' })).toBeTruthy();
    act(() => api.release());
    expect(await screen.findByText('Nessuna persona disponibile')).toBeTruthy();
    expect(screen.getByText('Configura le persone in Home Assistant prima di scegliere i destinatari.')).toBeTruthy();
  });

  it('respects a maximum without ever removing anyone', async () => {
    const api = backend([entry('p-mattia', 'person.mattia'), entry('p-erika', 'person.erika')]);
    renderPicker({ callApi: api.callApi, initial: ['p-mattia'], maxRecipients: 1 });
    open();

    await screen.findByRole('checkbox', { name: 'Mattia' });
    expect(screen.getByText('Puoi scegliere al massimo 1 persone.')).toBeTruthy();
    expect((row('Erika') as HTMLButtonElement).disabled).toBe(true);
    expect((row('Mattia') as HTMLButtonElement).disabled).toBe(false);
  });

  it('is keyboard operable and gives focus back on close', async () => {
    const api = backend([entry('p-mattia', 'person.mattia')]);
    renderPicker({ callApi: api.callApi });
    const trigger = screen.getByRole('button', { name: /Seleziona persone/ });
    trigger.focus();
    fireEvent.click(trigger);

    const mattia = await screen.findByRole('checkbox', { name: 'Mattia' });
    expect(mattia.tagName).toBe('BUTTON');
    expect(mattia.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(mattia.getAttribute('aria-describedby')!)?.textContent).toContain('Pronto');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('never renders account, device or target details', async () => {
    const api = backend([entry('p-mattia', 'person.mattia')]);
    const leaky = {
      recipients: [{ ...entry('p-mattia', 'person.mattia'), user_id: 'u-secret', devices: ['Galaxy S26'], notify: 'notify.mobile_app_s26' }],
    };
    (api.calls as unknown as { mockImplementation: (fn: () => Promise<unknown>) => void }).mockImplementation(async () => leaky);
    renderPicker({ callApi: api.callApi });
    open();
    await screen.findByRole('checkbox', { name: 'Mattia' });

    const text = document.body.textContent ?? '';
    for (const secret of ['u-secret', 'Galaxy', 'notify', 'person.mattia', 'p-mattia']) {
      expect(text).not.toContain(secret);
    }
  });
});
