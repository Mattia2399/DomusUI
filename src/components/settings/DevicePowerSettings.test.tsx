import { act, cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { DOMUS_CLIENT_ID_STORAGE_KEY } from '../../services/domusClientId';
import type { DevicePowerCallApi } from '../../services/devicePowerClient';
import type { MockEntityStateMap } from '../../types/ha';
import DevicePowerSettings from './DevicePowerSettings';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

const CLIENT_ID = 'client-local-0001';
const OTHER_ID = 'fedcba9876543210fedcba9876543210';
const OWN_ID = '0123456789abcdef0123456789abcdef';

type WirePolicy = Record<string, unknown> & { policy_id: string; revision: number; client_id: string | null };

const wirePolicy = (overrides: Partial<WirePolicy> = {}): WirePolicy => ({
  policy_id: OWN_ID,
  client_id: CLIENT_ID,
  label: 'Tablet soggiorno',
  enabled: true,
  battery_entity_id: 'sensor.tablet_battery',
  switch_entity_id: 'switch.presa_tablet',
  start_threshold: 30,
  stop_threshold: 80,
  revision: 1,
  created_at: '2026-10-16T08:00:00+00:00',
  updated_at: '2026-10-16T08:00:00+00:00',
  runtime: { status: 'charging', battery_level: 42, switch_on: true, last_action: null, last_error: null },
  ...overrides,
});

/** A Home Assistant that keeps policies the way the integration does. */
function fakeIntegration(initial: WirePolicy[] = [], status = 'ready') {
  let policies = initial.map((policy) => ({ ...policy }));
  let failNext: Record<string, unknown> | null = null;
  const state = () => ({ status, policies: policies.map((policy) => ({ ...policy })) });
  const reject = (code: string) => {
    throw { code, message: code };
  };
  const callApi = vi.fn(async (message: Record<string, unknown>) => {
    if (failNext) {
      const failure = failNext;
      failNext = null;
      throw failure;
    }
    const current = policies.find((policy) => policy.policy_id === message.policy_id);
    if (message.policy_id && !current) reject('policy_not_found');
    if (current && message.expected_revision !== current.revision) reject('revision_conflict');
    switch (message.type) {
      case 'domusos/device_power/get_state':
        return state();
      case 'domusos/device_power/save_policy': {
        const policy = message.policy as Record<string, unknown>;
        const saved = current
          ? { ...current, ...policy, revision: current.revision + 1 }
          : wirePolicy({ ...policy, policy_id: OTHER_ID.replace(/f/g, 'a'), revision: 1 } as Partial<WirePolicy>);
        policies = current ? policies.map((item) => (item === current ? saved : item)) : [...policies, saved];
        return { policy: saved, ...state() };
      }
      case 'domusos/device_power/bind_policy': {
        const saved = { ...current!, client_id: message.client_id as string, revision: current!.revision + 1 };
        policies = policies.map((item) => (item === current ? saved : item));
        return { policy: saved, ...state() };
      }
      case 'domusos/device_power/delete_policy':
        policies = policies.filter((item) => item !== current);
        return state();
      default:
        return reject('unknown_command');
    }
  });
  return {
    callApi: callApi as unknown as DevicePowerCallApi,
    calls: callApi.mock.calls as unknown as [Record<string, unknown>][],
    sent: (type: string) =>
      (callApi.mock.calls as unknown as [Record<string, unknown>][]).filter(([message]) => message.type === `domusos/device_power/${type}`),
    failNextWith: (error: Record<string, unknown>) => {
      failNext = error;
    },
    changeElsewhere: () => {
      policies = policies.map((policy) => ({ ...policy, stop_threshold: 90, revision: policy.revision + 1 }));
    },
  };
}

const haStates: MockEntityStateMap = {
  'sensor.tablet_battery': {
    state: '42',
    unit: '%',
    rawAttributes: { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Batteria tablet' },
  } as MockEntityStateMap[string],
  'sensor.temperature': { state: '21', unit: '°C', rawAttributes: { friendly_name: 'Temperatura' } } as MockEntityStateMap[string],
  'switch.presa_tablet': { state: 'on', rawAttributes: { friendly_name: 'Presa tablet' } } as MockEntityStateMap[string],
  'light.cucina': { state: 'off', rawAttributes: { friendly_name: 'Luce cucina' } } as MockEntityStateMap[string],
};

function renderPage(
  integration: ReturnType<typeof fakeIntegration>,
  props: Partial<{ supported: boolean; isAdmin: boolean; connected: boolean; haStates: MockEntityStateMap }> = {},
) {
  return render(
    <DevicePowerSettings
      callApi={integration.callApi}
      connected={props.connected ?? true}
      supported={props.supported ?? true}
      isAdmin={props.isAdmin ?? true}
      haStates={props.haStates ?? haStates}
    />,
  );
}

/** Types an entity into a picker and closes its list. */
function choose(label: string, entityId: string) {
  const input = screen.getByRole('combobox', { name: label });
  fireEvent.change(input, { target: { value: entityId } });
  fireEvent.keyDown(input, { key: 'Escape' });
}

const row = (title: string) => screen.getByText(title, { selector: 'span' }).closest('div')!.parentElement!;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  window.localStorage.setItem(DOMUS_CLIENT_ID_STORAGE_KEY, CLIENT_ID);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DevicePowerSettings', () => {
  it('says when this version of DomusOS has no power management, without asking it', () => {
    const integration = fakeIntegration();
    renderPage(integration, { supported: false });

    expect(screen.getByText('Gestione alimentazione non disponibile con questa versione di DomusOS.')).toBeTruthy();
    expect(integration.calls).toHaveLength(0);
  });

  it('treats an integration that does not know the commands as unsupported', async () => {
    const integration = fakeIntegration();
    integration.failNextWith({ code: 'unknown_command', message: 'Unknown command.' });
    renderPage(integration);

    expect(await screen.findByText('Gestione alimentazione non disponibile con questa versione di DomusOS.')).toBeTruthy();
  });

  it('is for administrators only', () => {
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration, { isAdmin: false });

    expect(screen.getByText(/Solo un amministratore di Home Assistant/)).toBeTruthy();
    expect(integration.calls).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
  });

  it('never commands anything while the saved configurations are unreadable', async () => {
    renderPage(fakeIntegration([], 'corrupt'));

    expect(await screen.findByText('Configurazioni non leggibili')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
  });

  it('starts incomplete, from 30 % and 80 %, and offers only fitting entities', async () => {
    renderPage(fakeIntegration());

    expect(await screen.findByText('Configurazione incompleta')).toBeTruthy();
    expect((screen.getByLabelText('Avvia ricarica sotto') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('Interrompi ricarica sopra') as HTMLInputElement).value).toBe('80');

    fireEvent.click(within(screen.getByRole('combobox', { name: 'Sensore batteria' }).parentElement!).getByRole('button'));
    const batteryOptions = await screen.findAllByRole('option');
    expect(batteryOptions.map((option) => option.textContent)).toEqual(['Batteria tabletsensor.tablet_battery']);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sensore batteria' }), { key: 'Escape' });

    fireEvent.click(within(screen.getByRole('combobox', { name: 'Alimentazione caricatore' }).parentElement!).getByRole('button'));
    const switchOptions = await screen.findAllByRole('option');
    expect(switchOptions.map((option) => option.textContent)).toEqual(['Presa tabletswitch.presa_tablet']);
  });

  it('creates the policy of this device on Save', async () => {
    const integration = fakeIntegration();
    renderPage(integration);
    await screen.findByText('Configurazione incompleta');

    fireEvent.change(screen.getByLabelText('Nome del dispositivo'), { target: { value: '  Tablet cucina ' } });
    choose('Sensore batteria', 'sensor.tablet_battery');
    choose('Alimentazione caricatore', 'switch.presa_tablet');
    fireEvent.change(screen.getByLabelText('Avvia ricarica sotto'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(await screen.findByText('Configurazione salvata.')).toBeTruthy();
    const [[message]] = integration.sent('save_policy');
    expect(message).toEqual({
      type: 'domusos/device_power/save_policy',
      policy: {
        client_id: CLIENT_ID,
        label: 'Tablet cucina',
        enabled: true,
        battery_entity_id: 'sensor.tablet_battery',
        switch_entity_id: 'switch.presa_tablet',
        start_threshold: 25,
        stop_threshold: 80,
      },
    });
    // Nothing is switched from the browser.
    expect(integration.calls.some(([sent]) => /turn_|call_service/.test(String(sent.type)))).toBe(false);
    expect(screen.getByRole('button', { name: 'Salva' }).hasAttribute('disabled')).toBe(true);
  });

  it('says so when this browser cannot keep its reference', async () => {
    const original = Storage.prototype.getItem;
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === DOMUS_CLIENT_ID_STORAGE_KEY) throw new Error('blocked');
      return original.call(this, key);
    });
    const integration = fakeIntegration();
    try {
      renderPage(integration);
      await screen.findByText('Configurazione incompleta');
      choose('Sensore batteria', 'sensor.tablet_battery');
      choose('Alimentazione caricatore', 'switch.presa_tablet');
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      expect(await screen.findByText(/Questo browser non conserva dati locali/)).toBeTruthy();
      expect(integration.sent('save_policy')).toHaveLength(0);
    } finally {
      getItem.mockRestore();
    }
  });

  it('refuses a start level that is not below the stop level, without correcting it', async () => {
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration);
    await screen.findByText('In carica');

    fireEvent.change(screen.getByLabelText('Avvia ricarica sotto'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(screen.getByText('Deve essere maggiore della soglia di avvio.')).toBeTruthy();
    expect((screen.getByLabelText('Avvia ricarica sotto') as HTMLInputElement).value).toBe('80');
    expect(screen.getByLabelText('Interrompi ricarica sopra').getAttribute('aria-invalid')).toBe('true');
    expect(integration.sent('save_policy')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Avvia ricarica sotto'), { target: { value: '101' } });
    expect(screen.getByText('Un numero intero tra 0 e 100.')).toBeTruthy();
  });

  it('shows the live battery, power and automation state', async () => {
    renderPage(fakeIntegration([wirePolicy()]));

    expect(await screen.findByText('In carica')).toBeTruthy();
    expect(within(row('Batteria')).getByText('42 %')).toBeTruthy();
    expect(within(row('Alimentazione')).getByText('Accesa')).toBeTruthy();
  });

  it('names an unavailable sensor or switch instead of guessing', async () => {
    renderPage(
      fakeIntegration([
        wirePolicy({ runtime: { status: 'battery_unavailable', battery_level: null, switch_on: true, last_action: null, last_error: null } }),
      ]),
      { haStates: { ...haStates, 'sensor.tablet_battery': { ...haStates['sensor.tablet_battery'], state: 'unavailable' } } },
    );

    expect(await screen.findByText('Sensore batteria non disponibile')).toBeTruthy();
    expect(within(row('Batteria')).getByText('Non disponibile')).toBeTruthy();
  });

  it('reports a failed command', async () => {
    renderPage(
      fakeIntegration([
        wirePolicy({
          runtime: {
            status: 'error',
            battery_level: 20,
            switch_on: false,
            last_action: null,
            last_error: { code: 'service_call_failed', at: '2026-10-16T09:00:00+00:00' },
          },
        }),
      ]),
    );

    expect(await screen.findByText('Errore')).toBeTruthy();
    expect(screen.getByText('L’ultimo comando non è riuscito: Domus riproverà.')).toBeTruthy();
  });

  it('turns the automation off without touching the switch', async () => {
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration);
    await screen.findByText('In carica');

    expect(screen.getByText('Disattivando la gestione automatica, lo stato attuale dell’alimentazione non verrà modificato.')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Gestione automatica' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(await screen.findByText('Configurazione salvata.')).toBeTruthy();
    const [[message]] = integration.sent('save_policy');
    expect(message).toMatchObject({ policy_id: OWN_ID, expected_revision: 1, policy: { enabled: false } });
    expect(screen.getByText('Gestione disattivata')).toBeTruthy();
  });

  it('shows the newer version when the policy was changed elsewhere', async () => {
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration);
    await screen.findByText('In carica');

    integration.changeElsewhere();
    fireEvent.change(screen.getByLabelText('Avvia ricarica sotto'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(await screen.findByText(/Questa configurazione è stata modificata altrove\./)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Interrompi ricarica sopra') as HTMLInputElement).value).toBe('90'));
    expect((screen.getByLabelText('Avvia ricarica sotto') as HTMLInputElement).value).toBe('30');
  });

  it('explains a switch already managed by another policy', async () => {
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration);
    await screen.findByText('In carica');

    fireEvent.change(screen.getByLabelText('Avvia ricarica sotto'), { target: { value: '20' } });
    integration.failNextWith({ code: 'switch_in_use', message: 'switch_in_use' });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(await screen.findByText('Questo switch è già gestito da un’altra configurazione attiva.')).toBeTruthy();
  });

  it('removes the policy after confirmation, leaving the switch as it is', async () => {
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration);
    await screen.findByText('In carica');

    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi configurazione' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('La configurazione verrà rimossa. Lo stato attuale dello switch non verrà modificato.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rimuovi' }));

    expect(await screen.findByText('Configurazione rimossa.')).toBeTruthy();
    expect(integration.sent('delete_policy')[0][0]).toEqual({
      type: 'domusos/device_power/delete_policy',
      policy_id: OWN_ID,
      expected_revision: 1,
    });
    expect(screen.getByText('Configurazione incompleta')).toBeTruthy();
  });

  it('lets an administrator link a policy whose browser was cleared', async () => {
    const orphan = wirePolicy({ policy_id: OTHER_ID, client_id: null, label: 'Tablet ingresso' });
    const integration = fakeIntegration([orphan]);
    renderPage(integration);

    const group = await screen.findByRole('region', { name: 'Configurazioni esistenti' });
    expect(within(group).getByText('Tablet ingresso')).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: 'Collega a questo dispositivo' }));

    expect(await screen.findByText('Configurazione collegata a questo dispositivo.')).toBeTruthy();
    expect(integration.sent('bind_policy')[0][0]).toEqual({
      type: 'domusos/device_power/bind_policy',
      policy_id: OTHER_ID,
      expected_revision: 1,
      client_id: CLIENT_ID,
    });
    expect(screen.queryByRole('region', { name: 'Configurazioni esistenti' })).toBeNull();
    expect((screen.getByLabelText('Nome del dispositivo') as HTMLInputElement).value).toBe('Tablet ingresso');
  });

  it('keeps the other devices apart: no link while this one has a policy', async () => {
    const other = wirePolicy({ policy_id: OTHER_ID, client_id: 'client-other-0002', label: 'Tablet camera' });
    renderPage(fakeIntegration([wirePolicy(), other]));

    const group = await screen.findByRole('region', { name: 'Configurazioni esistenti' });
    expect(within(group).getByText('Tablet camera')).toBeTruthy();
    expect(within(group).queryByRole('button', { name: 'Collega a questo dispositivo' })).toBeNull();
    expect(within(group).getByRole('button', { name: 'Elimina: Tablet camera' })).toBeTruthy();
    expect((screen.getByLabelText('Nome del dispositivo') as HTMLInputElement).value).toBe('Tablet soggiorno');
  });

  it('refreshes the live state while open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration);
    await screen.findByText('In carica');
    const before = integration.sent('get_state').length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(integration.sent('get_state').length).toBe(before + 1);
  });

  it('follows a change made elsewhere, unless this form was touched', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration);
    await screen.findByText('In carica');

    integration.changeElsewhere();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect((screen.getByLabelText('Interrompi ricarica sopra') as HTMLInputElement).value).toBe('90');

    fireEvent.change(screen.getByLabelText('Avvia ricarica sotto'), { target: { value: '15' } });
    integration.changeElsewhere();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect((screen.getByLabelText('Avvia ricarica sotto') as HTMLInputElement).value).toBe('15');
    expect((screen.getByLabelText('Interrompi ricarica sopra') as HTMLInputElement).value).toBe('90');
  });

  it('keeps the page when one periodic read fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const integration = fakeIntegration([wirePolicy()]);
    renderPage(integration);
    await screen.findByText('In carica');

    integration.failNextWith({ code: 'unknown_error', message: 'socket closed' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByText('In carica')).toBeTruthy();
    expect(screen.queryByText('Impossibile leggere le configurazioni.')).toBeNull();
  });
});
