import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityDashboard } from './SecurityDashboard';

const deviceAuth = vi.hoisted(() => ({
  isEnrolled: false,
  authenticate: vi.fn(async () => false),
  verifyOrEnroll: vi.fn(async () => false),
  isBiometricAvailable: vi.fn(async () => false),
}));

vi.mock('../hooks/useDeviceAuth', () => ({
  useDeviceAuth: () => deviceAuth,
}));

const alarmEntityId = 'alarm_control_panel.home';
const baseAlarmEntity = {
  state: 'disarmed',
  rawAttributes: {
    friendly_name: 'Allarme Casa',
    code_format: 'number',
    code_arm_required: true,
    supported_features: 63,
  },
};

const alarmProfile = {
  widgetId: 'alarm-card',
  entityId: alarmEntityId,
  unlockCode: '1234',
  localExtraCode: '56',
  requireDeviceConfirmation: false,
};

function renderSecurity({
  entity = baseAlarmEntity,
  connected = true,
  onCallService = vi.fn(async () => true),
  profile = alarmProfile,
  extraStates = {},
  sensorEntityOptions = [],
  cameraEntityOptions = [],
  canManageSecurity = false,
} = {}) {
  const props = {
    runtimeMode: 'real',
    haConnected: connected,
    haStates: { ...(entity ? { [alarmEntityId]: entity } : {}), ...extraStates },
    alarmEntityOptions: [alarmEntityId],
    alarmSecurityProfiles: profile ? [profile] : [],
    sensorEntityOptions,
    cameraEntityOptions,
    canManageSecurity,
    onCallService,
  };
  return { ...render(<SecurityDashboard {...props} />), props, onCallService };
}

function enterNumericCode(getByRole, code) {
  for (const digit of code) {
    fireEvent.click(getByRole('button', { name: digit }));
  }
}

describe('/security alarm authorization', () => {
  beforeEach(() => {
    window.localStorage.clear();
    deviceAuth.isEnrolled = false;
    deviceAuth.authenticate.mockClear();
    deviceAuth.isBiometricAvailable.mockResolvedValue(false);
  });

  afterEach(cleanup);

  it('does not present invented security events in real mode', async () => {
    const view = renderSecurity();

    await view.findByText('Nessun evento registrato in questa sessione.');
    expect(view.queryByText('Dati demo')).toBeNull();
    expect(view.queryByText('Movimento rilevato')).toBeNull();
    expect(view.queryByText('Allarme inserito')).toBeNull();
  });

  it('validates the combined local credential and sends only the HA PIN', async () => {
    const { getByRole, findAllByText, findByText, queryByText, onCallService } = renderSecurity();

    await findAllByText('Disinserito');
    fireEvent.click(getByRole('radio', { name: 'Casa' }));

    expect(queryByText(/non valido/i)).toBeNull();
    enterNumericCode(getByRole, '999956');
    fireEvent.click(getByRole('button', { name: 'Conferma' }));

    await findByText('Comando non autorizzato o non completato.');
    expect(onCallService).not.toHaveBeenCalled();

    fireEvent.click(getByRole('button', { name: 'Cancella' }));
    enterNumericCode(getByRole, '123456');
    fireEvent.click(getByRole('button', { name: 'Conferma' }));

    await waitFor(() => {
      expect(onCallService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_arm_home', {
        entity_id: alarmEntityId,
        code: '1234',
      });
    });
    expect(deviceAuth.authenticate).not.toHaveBeenCalled();
  });

  it('waits for the Home Assistant state before presenting the command as confirmed', async () => {
    const view = renderSecurity({ profile: null });

    await view.findAllByText('Disinserito');
    fireEvent.click(view.getByRole('radio', { name: 'Casa' }));
    enterNumericCode(view.getByRole, '1234');
    fireEvent.click(view.getByRole('button', { name: 'Conferma' }));

    await view.findByText(/In attesa della conferma di Home Assistant/i);
    expect(view.getAllByText('Disinserito').length).toBeGreaterThan(0);

    view.rerender(
      <SecurityDashboard
        {...view.props}
        haStates={{ [alarmEntityId]: { ...baseAlarmEntity, state: 'armed_home' } }}
      />,
    );

    await view.findByText(/Stato confermato: Inserito Casa/i);
    expect(view.getAllByText('Inserito Casa').length).toBeGreaterThan(0);
  });

  it('gives configured device confirmation precedence and uses the stored HA PIN after success', async () => {
    deviceAuth.isEnrolled = true;
    deviceAuth.isBiometricAvailable.mockResolvedValue(true);
    deviceAuth.authenticate.mockResolvedValueOnce(true);
    const onCallService = vi.fn(async () => true);
    const securedProfile = { ...alarmProfile, requireDeviceConfirmation: true };
    const view = renderSecurity({ profile: securedProfile, onCallService });

    await view.findAllByText('Disinserito');
    await waitFor(() => expect(deviceAuth.isBiometricAvailable).toHaveBeenCalled());
    fireEvent.click(view.getByRole('radio', { name: 'Casa' }));

    await waitFor(() => expect(deviceAuth.authenticate).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(onCallService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_arm_home', {
        entity_id: alarmEntityId,
        code: '1234',
      });
    });
  });

  it('uses the HA entity rules directly when no Alarm card or code requirement exists', async () => {
    const onCallService = vi.fn(async () => true);
    const entityWithoutCode = {
      ...baseAlarmEntity,
      rawAttributes: {
        friendly_name: 'Allarme senza codice',
        code_arm_required: false,
        supported_features: 3,
      },
    };
    const view = renderSecurity({ entity: entityWithoutCode, profile: null, onCallService });

    await view.findAllByText('Disinserito');
    fireEvent.click(view.getByRole('radio', { name: 'Casa' }));

    await waitFor(() => {
      expect(onCallService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_arm_home', {
        entity_id: alarmEntityId,
      });
    });
    expect(view.queryByText('Conferma sicura')).toBeNull();
  });

  it('never lets SOS bypass the explicit danger confirmation and the configured Alarm credential', async () => {
    const onCallService = vi.fn(async () => true);
    const view = renderSecurity({ onCallService });

    await view.findAllByText('Disinserito');
    fireEvent.click(view.getByRole('button', { name: 'SOS' }));
    await view.findByRole('heading', { name: 'Attivare SOS emergenza?' });
    expect(onCallService).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole('button', { name: 'Attiva SOS' }));
    await view.findByText('Conferma sicura');
    enterNumericCode(view.getByRole, '123456');
    fireEvent.click(view.getByRole('button', { name: 'Conferma' }));

    await waitFor(() => {
      expect(onCallService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_trigger', {
        entity_id: alarmEntityId,
        code: '1234',
      });
    });
  });

  it('fails closed while Home Assistant is disconnected', async () => {
    const onCallService = vi.fn(async () => true);
    const { getByRole, findAllByText } = renderSecurity({ connected: false, onCallService });

    await findAllByText('Non disponibile');
    const primaryControl = getByRole('button', { name: /Non disponibile/i });
    expect(primaryControl.disabled).toBe(true);
    expect(onCallService).not.toHaveBeenCalled();
  });

  it('discovers registry cameras and falls back to unclassified binary sensors', async () => {
    window.localStorage.setItem('ha.dashboard.security.visibleSensorEntityIds', '[]');
    window.localStorage.setItem('ha.dashboard.security.visibleCameraEntityIds', '[]');

    const view = renderSecurity({
      extraStates: {
        'binary_sensor.contatto_ausiliario': {
          state: 'off',
          rawAttributes: { friendly_name: 'Contatto ausiliario' },
        },
      },
      sensorEntityOptions: ['binary_sensor.contatto_ausiliario'],
      cameraEntityOptions: ['camera.ingresso'],
    });

    await view.findByText('Contatto ausiliario');
    await view.findByText('Ingresso');
    expect(view.queryByText('Nessun sensore disponibile.')).toBeNull();
    expect(view.queryByText('Nessuna telecamera trovata.')).toBeNull();
  });

  it('keeps an explicit v2 empty selection empty', async () => {
    window.localStorage.setItem(
      'ha.dashboard.security.visibleCameraEntityIds',
      JSON.stringify({ version: 2, mode: 'custom', ids: [] }),
    );

    const view = renderSecurity({ cameraEntityOptions: ['camera.ingresso'] });

    await view.findByText('Nessuna telecamera trovata.');
    expect(view.queryByText('Ingresso')).toBeNull();
  });

  it('keeps the saved sensor selection while Home Assistant registries load progressively', async () => {
    const firstSensorId = 'binary_sensor.front_door';
    const secondSensorId = 'binary_sensor.garage_door';
    window.localStorage.setItem(
      'ha.dashboard.security.visibleSensorEntityIds',
      JSON.stringify({ version: 2, mode: 'custom', ids: [firstSensorId, secondSensorId] }),
    );
    const extraStates = {
      [firstSensorId]: {
        state: 'off',
        rawAttributes: { friendly_name: 'Porta ingresso', device_class: 'door' },
      },
      [secondSensorId]: {
        state: 'off',
        rawAttributes: { friendly_name: 'Porta garage', device_class: 'door' },
      },
    };
    const view = renderSecurity({ extraStates, sensorEntityOptions: [firstSensorId] });

    await view.findByText('Porta ingresso');
    expect(view.queryByText('Porta garage')).toBeNull();

    view.rerender(
      <SecurityDashboard
        {...view.props}
        sensorEntityOptions={[firstSensorId, secondSensorId]}
      />,
    );

    await view.findByText('Porta garage');
    expect(JSON.parse(window.localStorage.getItem('ha.dashboard.security.visibleSensorEntityIds'))).toEqual({
      version: 2,
      mode: 'custom',
      ids: [firstSensorId, secondSensorId],
    });
  });

  it('opens a security camera in the shared fullscreen viewer', async () => {
    const cameraEntityId = 'camera.ingresso';
    const view = renderSecurity({
      cameraEntityOptions: [cameraEntityId],
      extraStates: {
        [cameraEntityId]: {
          state: 'streaming',
          rawAttributes: { friendly_name: 'Ingresso principale' },
          supportedFeatures: 2,
        },
      },
    });

    fireEvent.click(await view.findByRole('button', { name: 'Apri Ingresso principale' }));

    await view.findByRole('dialog', { name: 'Ingresso principale' });
    expect(view.getByRole('button', { name: 'Chiudi telecamera' })).toBeTruthy();
  });

  it('offers a permission-gated local edit mode for the mobile security page', async () => {
    const restrictedView = renderSecurity();
    await restrictedView.findAllByText('Disinserito');
    expect(restrictedView.queryByRole('button', { name: 'Modifica sicurezza' })).toBeNull();
    restrictedView.unmount();

    const adminView = renderSecurity({ canManageSecurity: true });
    await adminView.findAllByText('Disinserito');
    fireEvent.click(adminView.getByRole('button', { name: 'Modifica sicurezza' }));

    await adminView.findByText('Impostazioni Sicurezza');
    expect(adminView.queryByRole('button', { name: /Disinserire|Inserire/i })).toBeNull();

    fireEvent.click(adminView.getByRole('button', { name: 'Termina modifica sicurezza' }));
    await adminView.findAllByText('Disinserito');
  });

  it('opens the complete nested sensor page from the clickable perimeter title', async () => {
    const sensorIds = Array.from({ length: 6 }, (_, index) => `binary_sensor.door_${index + 1}`);
    const extraStates = Object.fromEntries(sensorIds.map((entityId, index) => [
      entityId,
      {
        state: 'off',
        rawAttributes: { friendly_name: `Porta ${index + 1}`, device_class: 'door' },
      },
    ]));
    const view = renderSecurity({ extraStates, sensorEntityOptions: sensorIds });

    fireEvent.click(await view.findByRole('button', { name: 'Perimetro' }));

    await view.findByRole('button', { name: 'Indietro' });
    await view.findByText('Sensori del perimetro');
    expect(window.location.pathname).toBe('/security/sensors');
    expect(view.getAllByText('Porta 6').length).toBeGreaterThan(0);
  });
});
