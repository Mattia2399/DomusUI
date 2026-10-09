import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import type { WasteCollectionCallApi, WasteCollectionDocument } from '../../services/wasteCollectionClient';
import WasteCollectionSettings from './WasteCollectionSettings';

const document: WasteCollectionDocument = {
  schema: 'domusos-waste-collection',
  version: 2,
  revision: 1,
  updatedAt: '2026-10-06T10:00:00Z',
  updatedByUserId: 'owner-1',
  wasteTypes: [
    { id: 'organic', name: 'Organico', icon: 'mdi:leaf', color: '#22c55e', aliases: [] },
    { id: 'paper', name: 'Carta', icon: 'mdi:package-variant', color: '#3b82f6', aliases: [] },
  ],
  sources: [],
  mappings: [],
  exceptions: [],
  notifications: { enabled: false, time: '20:00', mode: 'recipients', recipients: [], legacyTargetCount: 0 },
};

const legacyDocument: WasteCollectionDocument = {
  ...document,
  notifications: { enabled: true, time: '20:00', mode: 'legacy', recipients: [], legacyTargetCount: 1 },
};

const PEOPLE = {
  recipients: [
    { person_id: 'p-mattia', person_entity_id: 'person.mattia', status: 'ready', selectable: true },
    { person_id: 'p-erika', person_entity_id: 'person.erika', status: 'no_devices', selectable: true },
  ],
};

const PERSON_STATES = {
  'person.mattia': { rawAttributes: { id: 'p-mattia', friendly_name: 'Mattia' } },
  'person.erika': { rawAttributes: { id: 'p-erika', friendly_name: 'Erika' } },
} as never;

// The recipient picker is lazy-loaded; load it once so tests never race the import.
beforeAll(async () => {
  await import('../people/PersonRecipientPicker');
});

beforeEach(() => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function createCallApi(config: WasteCollectionDocument = document, testResult?: unknown) {
  return vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === 'domusos/profile/list_recipients') return PEOPLE;
    if (message.type === 'domusos/waste_collection/test_notification') return testResult;
    if (message.type === 'domusos/waste_collection/get_config') return config;
    if (message.type === 'domusos/waste_collection/preview') return {
      generatedAt: '2026-10-06T10:00:00Z',
      warnings: [],
      events: [
        { uid: 'domus-ui-waste:organic:2026-10-07', summary: 'Organico', start: '2026-10-07', end: '2026-10-08', all_day: true },
        { uid: 'domus-ui-waste:paper:2026-10-07', summary: 'Carta', start: '2026-10-07', end: '2026-10-08', all_day: true },
      ],
    };
    if (message.type === 'domusos/waste_collection/save_config') {
      const sent = message.config as { notifications: WasteCollectionDocument['notifications'] };
      return {
        ...config,
        ...(message.config as object),
        notifications: { ...sent.notifications, legacyTargetCount: config.notifications.legacyTargetCount },
        revision: config.revision + 1,
      };
    }
    return config;
  }) as unknown as WasteCollectionCallApi & ReturnType<typeof vi.fn>;
}

function renderSettings(callApi: WasteCollectionCallApi, canConfigure = true) {
  return render(
    <I18nProvider>
      <WasteCollectionSettings callApi={callApi} connected canConfigure={canConfigure} haStates={PERSON_STATES} recipientsSupported />
    </I18nProvider>,
  );
}

const saveCall = (callApi: ReturnType<typeof vi.fn>) =>
  callApi.mock.calls.map(([message]) => message as Record<string, unknown>)
    .filter((message) => message.type === 'domusos/waste_collection/save_config');

describe('WasteCollectionSettings', () => {
  it('shows the next seven days as a week strip and offers fixed days only once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-06T09:00:00') });
    renderSettings(createCallApi());

    const week = await screen.findByRole('group', { name: 'Prossimi 7 giorni' });
    const days = within(week).getAllByRole('button');
    expect(days).toHaveLength(7);
    expect(days[0].getAttribute('aria-label')).toBe('Oggi: Nessun ritiro');
    expect(days[1].getAttribute('aria-label')).toBe('Domani: Organico, Carta');
    // The first day with a collection is selected and previewed below the strip.
    expect(days[1].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Organico', 'Carta']);

    fireEvent.click(days[0]);
    expect(days[0].getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^Giorni fissi/ }));
    await waitFor(() => expect(screen.getByRole('group', { name: 'In quali giorni' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^Giorni fissi/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'lunedì', pressed: true })).toBeTruthy();
    expect(screen.getByText('Ogni settimana · lunedì')).toBeTruthy();
    expect(screen.queryByLabelText('Quando passa la prossima volta?')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ogni quanto/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Ogni 2 settimane' }));
    // Tuesday 6 October: the next Monday collection is on the 12th.
    expect((screen.getByLabelText('Quando passa la prossima volta?') as HTMLInputElement).value).toBe('2026-10-12');
    expect(screen.getByText('Da quel giorno contiamo ogni 2 settimane.')).toBeTruthy();
    expect(screen.getByText('Modifiche non salvate')).toBeTruthy();
    vi.useRealTimers();
  });

  it('removes a waste type with its linked collections and can undo it', async () => {
    renderSettings(createCallApi({
      ...document,
      sources: [{ id: 'fixed-1', kind: 'fixed', name: 'Giorni fissi', enabled: true, entityIds: [], rules: [
        { id: 'r1', wasteTypeId: 'organic', enabled: true, weekdays: ['mon'], intervalWeeks: 1, anchorDate: '2026-10-05', startDate: '', endDate: '' },
      ] }],
      exceptions: [{ id: 'e1', date: '2026-12-25', wasteTypeId: 'organic', action: 'skip' }],
    }));

    fireEvent.click(await screen.findByRole('button', { name: 'Rimuovi Organico' }));
    expect(screen.getByRole('status').textContent).toContain('Hai eliminato Organico e 2 voci collegate.');
    expect(screen.queryByLabelText('Colore di Organico')).toBeNull();
    expect(screen.queryByRole('group', { name: 'In quali giorni' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.getByLabelText('Colore di Organico')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'In quali giorni' })).toBeTruthy();
    expect(screen.queryByText('Modifiche non salvate')).toBeNull();
  });

  it('turns linked calendar titles from older configurations into other names', async () => {
    const callApi = createCallApi({
      ...document,
      sources: [{ id: 'cal-1', kind: 'calendar', name: 'Comune', enabled: true, entityIds: ['calendar.comune'], rules: [] }],
      mappings: [
        { id: 'm1', sourceId: 'cal-1', match: 'Ritiro umido', wasteTypeId: 'organic' },
        { id: 'm2', sourceId: 'cal-1', match: 'carta', wasteTypeId: 'paper' },
      ],
    });
    renderSettings(callApi);

    expect(((await screen.findByLabelText('Altri nomi di Organico')) as HTMLInputElement).value).toBe('Ritiro umido');
    // "carta" already matches the type name, so it is not repeated.
    expect((screen.getByLabelText('Altri nomi di Carta') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Nomi degli eventi')).toBeNull();
  });

  it('keeps the color swatch and remove button beside the name, with other names in their own field', async () => {
    renderSettings(createCallApi());

    const colorInput = await screen.findByLabelText('Colore di Organico');
    expect((colorInput as HTMLInputElement).type).toBe('color');
    expect(screen.getByLabelText('Altri nomi di Organico')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Altri nomi di Organico'), { target: { value: 'Umido, Rifiuti organici' } });
    expect((screen.getByLabelText('Altri nomi di Organico') as HTMLInputElement).value).toBe('Umido, Rifiuti organici');
  });

  it('picks an icon for a waste type and shows it in the week preview', async () => {
    const callApi = createCallApi();
    const { container } = renderSettings(callApi);

    const iconButton = await screen.findByRole('button', { name: 'Icona di Carta' });
    expect(iconButton.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.lucide-package')).toBeTruthy();

    fireEvent.click(iconButton);
    const choices = screen.getByRole('group', { name: 'Icona di Carta' });
    expect(within(choices).getByRole('button', { name: 'Cartone', pressed: true })).toBeTruthy();
    fireEvent.click(within(choices).getByRole('button', { name: 'Carta e giornali' }));

    expect(screen.queryByRole('group', { name: 'Icona di Carta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(callApi).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'domusos/waste_collection/save_config',
        config: expect.objectContaining({
          wasteTypes: expect.arrayContaining([expect.objectContaining({ id: 'paper', icon: 'mdi:newspaper' })]),
        }),
      }),
      expect.anything(),
    ));
  });

  it('a new configuration chooses people, never technical notify targets', async () => {
    const callApi = createCallApi();
    renderSettings(callApi);

    await screen.findByText('Prossimi 7 giorni');
    fireEvent.click(screen.getByRole('switch', { name: 'Avvisami la sera prima' }));
    expect(await screen.findByText('Chi riceve l’avviso')).toBeTruthy();
    expect(screen.getByText('Scegli almeno una persona.')).toBeTruthy();
    expect(screen.queryByText(/notify\./)).toBeNull();
    expect(callApi.mock.calls.some(([message]) => (message as { type: string }).type === 'get_services')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Seleziona persone/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Mattia' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Erika' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fine' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() => expect(saveCall(callApi)).toHaveLength(1));
    expect((saveCall(callApi)[0].config as { notifications: unknown }).notifications).toEqual({
      enabled: true, time: '20:00', mode: 'recipients', recipients: ['p-mattia', 'p-erika'],
    });
  });

  it('shows a previous configuration as such and converts it only on explicit confirmation', async () => {
    const callApi = createCallApi(legacyDocument);
    renderSettings(callApi);

    const legacy = await screen.findByTestId('waste-legacy-recipients');
    expect(within(legacy).getByText('Configurazione precedente')).toBeTruthy();
    expect(within(legacy).getByText('Questa configurazione usa ancora dispositivi Home Assistant selezionati direttamente.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Seleziona persone/ })).toBeNull();

    // Cancelling writes nothing.
    fireEvent.click(within(legacy).getByRole('button', { name: /Converti in persone/ }));
    const dialog = await screen.findByRole('region', { name: 'Converti in persone' });
    expect(within(dialog).getByText(/Ogni persona sceglie autonomamente i propri dispositivi/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Converti in persone' })).toBeNull());
    expect(saveCall(callApi)).toHaveLength(0);

    fireEvent.click(within(legacy).getByRole('button', { name: /Converti in persone/ }));
    const again = await screen.findByRole('region', { name: 'Converti in persone' });
    expect(window.document.activeElement?.textContent).toBe('Converti in persone');
    const confirm = within(again).getByRole('button', { name: /Converti e salva/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(again).getByRole('button', { name: /Seleziona persone/ }));
    const mattia = await screen.findByRole('checkbox', { name: 'Mattia' });
    // Nobody is preselected, whatever the previous targets were called.
    expect(screen.getAllByRole('checkbox').every((box) => box.getAttribute('aria-checked') === 'false')).toBe(true);
    fireEvent.click(mattia);
    fireEvent.click(screen.getByRole('button', { name: 'Fine' }));
    fireEvent.click(within(again).getByRole('button', { name: /Converti e salva/ }));

    await waitFor(() => expect(saveCall(callApi)).toHaveLength(1));
    expect((saveCall(callApi)[0].config as { notifications: unknown }).notifications).toEqual({
      enabled: true, time: '20:00', mode: 'recipients', recipients: ['p-mattia'],
    });
    expect(await screen.findByText('Ora i promemoria arrivano alle persone scelte.')).toBeTruthy();
    expect(screen.queryByTestId('waste-legacy-recipients')).toBeNull();
  });

  it('reports a people test by outcome, never by device', async () => {
    const callApi = createCallApi(
      { ...document, notifications: { ...document.notifications, enabled: true, recipients: ['p-mattia', 'p-erika'] } },
      { mode: 'recipients', status: 'partial', recipients: [
        { person_id: 'p-mattia', status: 'delivered' },
        { person_id: 'p-erika', status: 'skipped', reason: 'no_devices' },
      ] },
    );
    renderSettings(callApi);

    fireEvent.click(await screen.findByRole('button', { name: /Invia una prova/ }));

    expect(await screen.findByText('Invio parziale: alcune persone non sono raggiungibili.')).toBeTruthy();
    expect(window.document.body.textContent).not.toMatch(/no_devices|p-erika|notify\./);
  });

  it('keeps the previous test path for a previous configuration', async () => {
    const callApi = createCallApi(legacyDocument, { mode: 'legacy', sent: ['notify.mobile_app_phone'], failed: [] });
    renderSettings(callApi);

    fireEvent.click(await screen.findByRole('button', { name: /Invia una prova/ }));

    expect(await screen.findByText('Notifica di prova inviata.')).toBeTruthy();
  });

  it('reports unsaved changes so leaving the page can ask for confirmation', async () => {
    const onDirtyChange = vi.fn();
    render(
      <I18nProvider>
        <WasteCollectionSettings callApi={createCallApi()} connected canConfigure haStates={PERSON_STATES} recipientsSupported onDirtyChange={onDirtyChange} />
      </I18nProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Altri nomi di Carta'), { target: { value: 'Giornali' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it('keeps controls read-only for non administrators', async () => {
    renderSettings(createCallApi(), false);

    expect(await screen.findByText(/Solo Owner e Admin/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
  });
});
