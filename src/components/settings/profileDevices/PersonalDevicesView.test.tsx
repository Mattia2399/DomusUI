import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../../i18n/I18nProvider';
import { usePersonalDevices } from '../../../hooks/usePersonalDevices';
import { createFakeProfileBackend, type FakeProfileBackend } from '../../../test/fakeProfileBackend';
import PersonalDevicesView, { type PersonalDevicesAvailability } from './PersonalDevicesView';

function Harness({ backend, availability = 'ready' }: { backend: FakeProfileBackend; availability?: PersonalDevicesAvailability }) {
  const controller = usePersonalDevices({ callApi: backend.callApi, enabled: availability === 'ready' });
  return <PersonalDevicesView controller={controller} availability={availability} callApi={backend.callApi} />;
}

const renderView = (backend: FakeProfileBackend, availability?: PersonalDevicesAvailability) =>
  render(
    <I18nProvider>
      <Harness backend={backend} availability={availability} />
    </I18nProvider>,
  );

const commands = (backend: FakeProfileBackend) =>
  backend.messages.map((message) => message.type).filter((type) => type !== 'domusos/profile/get_self');

const PIXEL = { haDeviceId: 'ha-pixel', displayName: 'Pixel 8', kind: 'phone' as const };
const IPAD = { haDeviceId: 'ha-ipad', displayName: 'iPad', kind: 'tablet' as const };

beforeEach(() => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('PersonalDevicesView', () => {
  it('shows a skeleton, then the empty state with a way to add a device', async () => {
    const backend = createFakeProfileBackend();
    backend.holdNextCommand();
    renderView(backend);

    expect(screen.getByRole('status', { name: 'Caricamento dei dispositivi…' })).toBeTruthy();
    act(() => backend.release());

    expect(await screen.findByText('Nessun dispositivo personale')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aggiungi dispositivo/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Notifiche Domus' }).getAttribute('aria-checked')).toBe('true');
  });

  it('lists devices by status with plain-language copy and hides technical details', async () => {
    const backend = createFakeProfileBackend({
      haDevices: [PIXEL, { ...IPAD, status: 'unavailable', target: 'unavailable' }],
      owned: [{ haDeviceId: 'ha-gone', label: 'Vecchio telefono' }, { haDeviceId: 'ha-ipad' }, { haDeviceId: 'ha-pixel', label: 'Lavoro' }],
    });
    renderView(backend);

    const items = await screen.findAllByTestId('personal-device');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual(['Lavoro', 'iPad', 'Vecchio telefono']);
    expect(within(items[0]).getByText('Pixel 8')).toBeTruthy();
    expect(within(items[0]).getByText('Collegato')).toBeTruthy();
    expect(within(items[0]).getAllByText('Pronto per le notifiche').length).toBeGreaterThan(0);
    expect(within(items[1]).getByText('Temporaneamente non disponibile')).toBeTruthy();
    expect(within(items[2]).getByText('Non più disponibile in Home Assistant')).toBeTruthy();
    expect(within(items[0]).getByText(/Presenza: Non configurata/)).toBeTruthy();

    const details = items[0].querySelector('details');
    expect(details?.open).toBe(false);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('user-1');
    expect(text).not.toMatch(/webhook|token|push_url/i);
  });

  it('keeps device choices when the general switch is turned off', async () => {
    const backend = createFakeProfileBackend({ haDevices: [PIXEL], owned: [{ haDeviceId: 'ha-pixel' }] });
    renderView(backend);

    fireEvent.click(await screen.findByRole('switch', { name: 'Notifiche Domus' }));
    await waitFor(() => expect(screen.getByTestId('general-off-note')).toBeTruthy());
    expect(screen.getByTestId('general-off-note').textContent).toContain('Le notifiche generali sono disattivate.');

    const deviceSwitch = screen.getByRole('switch', { name: 'Notifiche su Pixel 8' });
    expect(deviceSwitch.getAttribute('aria-checked')).toBe('true');
    expect((deviceSwitch as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('In pausa: le notifiche generali sono disattivate.')).toBeTruthy();
    expect(commands(backend)).toEqual(['domusos/profile/save_self']);
    expect(backend.devices[0].notificationsEnabled).toBe(true);

    fireEvent.click(deviceSwitch);
    await waitFor(() => expect(backend.devices[0].notificationsEnabled).toBe(false));
    expect(backend.notificationsEnabled).toBe(false);
  });

  it('keeps the stored value but blocks the switch when the device cannot notify', async () => {
    const backend = createFakeProfileBackend({
      haDevices: [{ ...PIXEL, target: 'ambiguous' }],
      owned: [{ haDeviceId: 'ha-pixel' }],
    });
    renderView(backend);

    const deviceSwitch = await screen.findByRole('switch', { name: 'Notifiche su Pixel 8' });
    expect(deviceSwitch.getAttribute('aria-checked')).toBe('true');
    expect((deviceSwitch as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Configurazione notifiche da controllare').length).toBeGreaterThan(0);
  });

  it('ignores repeated taps while a change is in flight', async () => {
    const backend = createFakeProfileBackend({ haDevices: [PIXEL], owned: [{ haDeviceId: 'ha-pixel' }] });
    renderView(backend);
    const deviceSwitch = await screen.findByRole('switch', { name: 'Notifiche su Pixel 8' });

    backend.holdNextCommand();
    fireEvent.click(deviceSwitch);
    await waitFor(() => expect(deviceSwitch.getAttribute('aria-busy')).toBe('true'));
    fireEvent.click(deviceSwitch);
    fireEvent.click(deviceSwitch);
    expect((deviceSwitch as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Rinomina Pixel 8' })).toHaveProperty('disabled', true);

    act(() => backend.release());
    await waitFor(() => expect(deviceSwitch.getAttribute('aria-checked')).toBe('false'));
    expect(commands(backend)).toEqual(['domusos/profile/update_device']);
    expect(backend.messages.at(-1)).toMatchObject({ expected_revision: 1 });
  });

  it('sends quick changes to different devices one after the other, each with the latest revision', async () => {
    const backend = createFakeProfileBackend({
      haDevices: [PIXEL, IPAD],
      owned: [{ haDeviceId: 'ha-pixel' }, { haDeviceId: 'ha-ipad' }],
    });
    renderView(backend);
    const pixel = await screen.findByRole('switch', { name: 'Notifiche su Pixel 8' });
    const ipad = screen.getByRole('switch', { name: 'Notifiche su iPad' });

    backend.holdNextCommand();
    fireEvent.click(pixel);
    fireEvent.click(ipad);
    await waitFor(() => expect(pixel.getAttribute('aria-busy')).toBe('true'));
    expect(commands(backend)).toEqual(['domusos/profile/update_device']);

    act(() => backend.release());
    await waitFor(() => expect(ipad.getAttribute('aria-checked')).toBe('false'));
    const updates = backend.messages.filter((message) => message.type === 'domusos/profile/update_device');
    expect(updates.map((message) => message.expected_revision)).toEqual([1, 2]);
    expect(backend.devices.map((device) => device.notificationsEnabled)).toEqual([false, false]);
  });

  it('reloads after a revision conflict and never retries on its own', async () => {
    const backend = createFakeProfileBackend({ haDevices: [PIXEL], owned: [{ haDeviceId: 'ha-pixel' }] });
    renderView(backend);
    const deviceSwitch = await screen.findByRole('switch', { name: 'Notifiche su Pixel 8' });

    backend.renameElsewhere('pd_1', 'Rinominato altrove');
    fireEvent.click(deviceSwitch);

    expect(await screen.findByText(/Il profilo è stato aggiornato da un altro dispositivo\./)).toBeTruthy();
    expect(await screen.findByRole('article', { name: 'Rinominato altrove' })).toBeTruthy();
    expect(commands(backend)).toEqual(['domusos/profile/update_device']);
    expect(backend.messages.filter((message) => message.type === 'domusos/profile/get_self')).toHaveLength(2);
    expect(backend.devices[0].notificationsEnabled).toBe(true);
  });

  it('renames with a trimmed label and clears it back to the Home Assistant name', async () => {
    const backend = createFakeProfileBackend({ haDevices: [PIXEL], owned: [{ haDeviceId: 'ha-pixel' }] });
    renderView(backend);

    fireEvent.click(await screen.findByRole('button', { name: 'Rinomina Pixel 8' }));
    const input = await screen.findByLabelText('Nome in Domus');
    fireEvent.change(input, { target: { value: 'x'.repeat(65) } });
    expect(screen.getByRole('alert').textContent).toBe('Usa al massimo 64 caratteri.');
    expect(screen.getByRole('button', { name: 'Salva' })).toHaveProperty('disabled', true);

    fireEvent.change(input, { target: { value: '  Ufficio  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByRole('article', { name: 'Ufficio' })).toBeTruthy();
    expect(backend.messages.at(-1)).toMatchObject({ type: 'domusos/profile/update_device', label: 'Ufficio' });
    expect(screen.getByText('Nome aggiornato.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rinomina Ufficio' }));
    fireEvent.change(await screen.findByLabelText('Nome in Domus'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByRole('article', { name: 'Pixel 8' })).toBeTruthy();
    expect(backend.messages.at(-1)).toMatchObject({ type: 'domusos/profile/update_device', label: null });
  });

  it('removes a device Home Assistant no longer knows, after saying what stays', async () => {
    const backend = createFakeProfileBackend({ owned: [{ haDeviceId: 'ha-gone', label: 'Vecchio' }] });
    renderView(backend);

    fireEvent.click(await screen.findByRole('button', { name: 'Rimuovi Vecchio' }));
    expect(await screen.findByText(/Il dispositivo non verrà rimosso da Home Assistant/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi dal profilo' }));

    expect(await screen.findByText('Nessun dispositivo personale')).toBeTruthy();
    expect(backend.messages.at(-1)).toEqual({ type: 'domusos/profile/remove_device', expected_revision: 1, device_id: 'pd_1' });
  });

  it('adds a verified device after a light confirmation', async () => {
    const backend = createFakeProfileBackend({
      haDevices: [
        { haDeviceId: 'ha-other', displayName: 'Telefono di casa', discovery: 'owned_by_other' },
        IPAD,
        PIXEL,
      ],
      owned: [{ haDeviceId: 'ha-ipad' }],
    });
    renderView(backend);

    fireEvent.click(await screen.findByRole('button', { name: /Aggiungi dispositivo/ }));
    const rows = await screen.findAllByTestId('discovery-device');
    expect(rows.map((row) => row.getAttribute('data-discovery-status'))).toEqual(['available', 'already_owned', 'owned_by_other']);
    expect(within(rows[2]).getByText('Questo dispositivo non può essere associato.')).toBeTruthy();
    expect(within(rows[2]).queryByRole('button')).toBeNull();
    expect(within(rows[1]).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Associa Pixel 8' }));
    expect(await screen.findByText('Collegare Pixel 8 al tuo profilo?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }));

    expect(await screen.findByRole('article', { name: 'Pixel 8' })).toBeTruthy();
    expect(await screen.findByText('Dispositivo collegato al tuo profilo.')).toBeTruthy();
    expect(backend.messages.find((message) => message.type === 'domusos/profile/add_device')).toEqual({
      type: 'domusos/profile/add_device',
      expected_revision: 1,
      ha_device_id: 'ha-pixel',
    });
  });

  it('refreshes the discovery on request', async () => {
    const backend = createFakeProfileBackend();
    renderView(backend);
    fireEvent.click(await screen.findByRole('button', { name: /Aggiungi dispositivo/ }));
    expect(await screen.findByText('Non sono stati trovati nuovi dispositivi collegati al tuo account.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna' }));
    await waitFor(() =>
      expect(backend.messages.filter((message) => message.type === 'domusos/profile/discover_devices')).toHaveLength(2),
    );
  });

  it('disables every change while offline', async () => {
    const backend = createFakeProfileBackend({ haDevices: [PIXEL], owned: [{ haDeviceId: 'ha-pixel' }] });
    const { rerender } = renderView(backend);
    await screen.findByRole('article', { name: 'Pixel 8' });

    rerender(
      <I18nProvider>
        <Harness backend={backend} availability="offline" />
      </I18nProvider>,
    );
    expect(screen.getByText('Connettiti a Home Assistant per modificare i tuoi dispositivi.')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Notifiche Domus' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('switch', { name: 'Notifiche su Pixel 8' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Rimuovi Pixel 8' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Aggiungi dispositivo/ })).toHaveProperty('disabled', true);
  });

  it('explains when the integration has no personal devices yet', () => {
    const backend = createFakeProfileBackend();
    renderView(backend, 'unsupported');
    expect(screen.getByText('Aggiorna l’integrazione Domus UI per gestire i dispositivi personali.')).toBeTruthy();
    expect(backend.messages).toHaveLength(0);
  });

  it('offers a retry when the profile cannot be read', async () => {
    const backend = createFakeProfileBackend();
    backend.failNextCommand('profile_unavailable');
    renderView(backend);

    expect(await screen.findByText('Il profilo Domus non è disponibile in questo momento.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Nessun dispositivo personale')).toBeTruthy();
  });
});
