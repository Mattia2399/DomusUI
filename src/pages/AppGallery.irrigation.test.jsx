import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppGallery } from './AppGallery';

const buildConsumptionCoreDocument = () => ({
  schema: 'domusos-irrigation',
  version: 1,
  revision: 1,
  mode: 'stopped',
  legacyAutomations: [],
  settings: {
    maximumManualDurationMin: 30,
    maxConcurrentZones: 1,
    parallelSafetyAcknowledged: false,
    rainSensorEnabled: false,
    rainSensorEntityId: '',
    blockOnRainSensorUnavailable: true,
    rainDuringCycle: 'stop_immediately',
  },
  sources: {
    weatherEntityId: '',
    humidityEntityId: '',
    outdoorTempEntityId: '',
    soilMoistureEntityId: '',
    waterUsageEntityId: 'sensor.irrigation_water_usage_l',
    waterAverageEntityId: '',
  },
  zones: [],
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/appgallery/irrigation');
});

afterEach(() => cleanup());

describe('Irrigation App Library configuration', () => {
  it('shows the house configuration only to authorized editors and confirms it through HA', async () => {
    let coreDocument = {
      schema: 'domusos-irrigation', version: 1, revision: 1, mode: 'stopped', legacyAutomations: [],
      settings: { maximumManualDurationMin: 30, maxConcurrentZones: 1, parallelSafetyAcknowledged: false, rainSensorEnabled: true, rainSensorEntityId: 'binary_sensor.rain_sensor', blockOnRainSensorUnavailable: true, rainDuringCycle: 'stop_immediately' },
      sources: { weatherEntityId: 'weather.home', humidityEntityId: '', outdoorTempEntityId: '', soilMoistureEntityId: 'sensor.soil_moisture', waterUsageEntityId: '', waterAverageEntityId: '' },
      zones: [{ id: 'north-lawn', name: 'Prato Nord', entityId: 'switch.irrigation_north_lawn', enabled: true, days: ['mon'], startTimes: ['05:30'], baseDuration: 15, manualDurationMin: 15, iconKey: 'tree-pine' }],
    };
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return coreDocument;
      if (message.type === 'domusos/irrigation/get_state') return { available: true, revision: coreDocument.revision, mode: 'stopped', rain: { enabled: true, active: false, available: true, blocked: false, reason: null }, sessions: [], history: [], legacyAutomations: [], serverTime: new Date().toISOString() };
      if (message.type === 'domusos/irrigation/save_config') {
        coreDocument = { ...coreDocument, ...message.config, revision: coreDocument.revision + 1 };
        return coreDocument;
      }
      return null;
    });
    const onNotify = vi.fn();

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haEntityIds={[
          'binary_sensor.rain_sensor',
          'weather.home',
          'sensor.soil_moisture',
          'switch.irrigation_north_lawn',
        ]}
        onCallApi={onCallApi}
        onNotify={onNotify}
      />,
    );

    await waitFor(() => expect(onCallApi).toHaveBeenCalledWith(
      { type: 'domusos/irrigation/get_config' },
      { reportError: false, throwOnError: true },
    ));
    fireEvent.click(screen.getAllByRole('button', { name: 'Zone', exact: true })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Gestisci zone irrigazione' }));
    expect(screen.getByRole('heading', { name: 'Gestisci zone' })).toBeTruthy();
    expect(screen.getAllByRole('navigation', { name: 'Navigazione Irrigazione Smart' })).toHaveLength(1);

    fireEvent.change(screen.getAllByLabelText('Nome')[0], { target: { value: 'Prato condiviso' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Panoramica' })[0]);
    expect(screen.queryByText('Prato condiviso')).toBeNull();
    expect(screen.getAllByText('Prato Nord').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Zone', exact: true })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Gestisci zone irrigazione' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Salva zone' })[0]);
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(
      'success',
      'Configurazione irrigazione salvata per tutta la casa.',
    ));
    expect(coreDocument).toMatchObject({ revision: 2, zones: [expect.objectContaining({ name: 'Prato condiviso' })] });
    fireEvent.click(screen.getAllByRole('button', { name: 'Panoramica' })[0]);
    expect(screen.getAllByText('Prato condiviso').length).toBeGreaterThan(0);
  });

  it('does not expose configuration navigation to a limited user', () => {
    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation"
        canConfigureApps={false}
        currentUserId="limited-1"
        haConnected={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Impostazioni' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gestisci zone irrigazione' })).toBeNull();
  });

  it('prepares hidden legacy automations before opening the HA automation editor', async () => {
    const coreDocument = {
      ...buildConsumptionCoreDocument(),
      legacyAutomations: ['automation.irrigazione_smart_giardino'],
    };
    const initialState = {
      available: true,
      revision: 1,
      mode: 'stopped',
      rain: {},
      sessions: [],
      history: [],
      legacyAutomations: coreDocument.legacyAutomations,
      legacyAutomationsReadyForRemoval: false,
      legacyAutomationsRequireRestart: false,
      serverTime: new Date().toISOString(),
    };
    const preparedState = {
      ...initialState,
      legacyAutomationsReadyForRemoval: true,
    };
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return coreDocument;
      if (message.type === 'domusos/irrigation/get_state') return initialState;
      if (message.type === 'domusos/irrigation/prepare_legacy_removal') return preparedState;
      return null;
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        onCallApi={onCallApi}
      />,
    );

    await waitFor(() => expect(screen.getAllByText('Automazioni precedenti disattivate').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: 'Rivedi e rimuovi' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Rendi visibili' }));
    await waitFor(() => expect(onCallApi).toHaveBeenCalledWith(
      { type: 'domusos/irrigation/prepare_legacy_removal' },
      { reportError: false, throwOnError: true },
    ));
    fireEvent.click(await screen.findByRole('button', { name: 'Apri automazioni HA' }));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/config/automation/dashboard'),
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('resolves irrigation nested routes and keeps protected settings fail-closed', () => {
    const { rerender } = render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation/calendar"
        canConfigureApps
        currentUserId="owner-1"
        haConnected={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Calendario irrigazione' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Calendario' }).some((button) => button.getAttribute('aria-current') === 'page')).toBe(true);

    rerender(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation/zones/manage"
        canConfigureApps
        currentUserId="owner-1"
        haConnected={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Gestisci zone' })).toBeTruthy();

    rerender(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation/settings"
        canConfigureApps={false}
        currentUserId="limited-1"
        haConnected={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Il giardino è pronto' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Impostazioni irrigazione' })).toBeNull();
  });

  it('loads real Home Assistant history for the overview consumption chart', async () => {
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return buildConsumptionCoreDocument();
      if (message.type === 'domusos/irrigation/get_state') return {
        available: true, revision: 1, mode: 'stopped', rain: {}, sessions: [], history: [], legacyAutomations: [], serverTime: new Date().toISOString(),
      };
      if (message.type === 'frontend/get_system_data') return null;
      if (message.type === 'history/history_during_period') {
        return [[
          { entity_id: 'sensor.irrigation_water_usage_l', state: '100', last_changed: '2026-08-20T08:00:00Z' },
          { entity_id: 'sensor.irrigation_water_usage_l', state: '125', last_changed: '2026-08-21T08:00:00Z' },
        ]];
      }
      return null;
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haStates={{
          'sensor.irrigation_water_usage_l': {
            state: '125',
            rawAttributes: { unit_of_measurement: 'L', state_class: 'total_increasing' },
          },
        }}
        haEntityIds={['sensor.irrigation_water_usage_l']}
        onCallApi={onCallApi}
      />,
    );

    await waitFor(() => expect(onCallApi).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'history/history_during_period',
        entity_ids: ['sensor.irrigation_water_usage_l'],
      }),
      { reportError: false },
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apri riepilogo idrico' }).textContent).toContain('25 L'));
  });

  it('caches each consumption period and reuses it when the user goes back', async () => {
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return buildConsumptionCoreDocument();
      if (message.type === 'domusos/irrigation/get_state') return {
        available: true, revision: 1, mode: 'stopped', rain: {}, sessions: [], history: [], legacyAutomations: [], serverTime: new Date().toISOString(),
      };
      if (message.type === 'frontend/get_system_data') return null;
      if (message.type === 'history/history_during_period') {
        return {
          'sensor.irrigation_water_usage_l': [
            { s: '100', lu: 1787817600 },
            { s: '140', lu: 1787821200 },
          ],
        };
      }
      return null;
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation/consumption"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haStates={{
          'sensor.irrigation_water_usage_l': {
            state: '140',
            rawAttributes: { unit_of_measurement: 'L', state_class: 'total_increasing' },
          },
        }}
        haEntityIds={['sensor.irrigation_water_usage_l']}
        onCallApi={onCallApi}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Grafico consumi irrigazione')).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: '30 giorni' }));
    await waitFor(() => expect(onCallApi.mock.calls.filter(([message]) => message.type === 'history/history_during_period')).toHaveLength(2));
    await waitFor(() => expect(screen.getByLabelText('Grafico consumi irrigazione')).toBeTruthy());

    fireEvent.click(screen.getByRole('radio', { name: '7 giorni' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: '7 giorni' }).getAttribute('aria-checked')).toBe('true'));
    expect(onCallApi.mock.calls.filter(([message]) => message.type === 'history/history_during_period')).toHaveLength(2);
  });

  it('keeps real mode empty instead of leaking Demo zones and telemetry', async () => {
    const emptyDocument = {
      ...buildConsumptionCoreDocument(),
      revision: 0,
      sources: Object.fromEntries(Object.keys(buildConsumptionCoreDocument().sources).map((key) => [key, ''])),
    };
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return emptyDocument;
      if (message.type === 'frontend/get_system_data') return { value: null };
      if (message.type === 'domusos/irrigation/get_state') return {
        available: true, revision: 0, mode: 'stopped', rain: {}, sessions: [], history: [], legacyAutomations: [], serverTime: new Date().toISOString(),
      };
      return null;
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        onCallApi={onCallApi}
      />,
    );

    await waitFor(() => expect(onCallApi).toHaveBeenCalledWith(
      { type: 'domusos/irrigation/get_state' },
      { reportError: false, throwOnError: true },
    ));
    expect(screen.queryByText('Prato Nord')).toBeNull();
    expect(screen.queryByText('1.240 L')).toBeNull();
    expect(screen.getAllByText('N/D').length).toBeGreaterThan(0);
  });

  it('shows a visible safety message when an unavailable rain sensor blocks a manual start', async () => {
    const coreDocument = {
      ...buildConsumptionCoreDocument(),
      mode: 'enabled',
      settings: {
        ...buildConsumptionCoreDocument().settings,
        rainSensorEnabled: true,
        rainSensorEntityId: 'binary_sensor.rain',
        blockOnRainSensorUnavailable: true,
      },
      zones: [{
        id: 'garden', name: 'Giardino', entityId: 'switch.garden', enabled: true,
        days: ['mon'], startTimes: ['06:00'], baseDuration: 10, manualDurationMin: 10,
      }],
    };
    const onNotify = vi.fn();
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return coreDocument;
      if (message.type === 'domusos/irrigation/get_state') return {
        available: true,
        revision: 1,
        mode: 'enabled',
        rain: { enabled: true, active: false, available: false, blocked: true, reason: 'rain_sensor_unavailable' },
        sessions: [], history: [], legacyAutomations: [], serverTime: new Date().toISOString(),
      };
      return null;
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haStates={{
          'binary_sensor.rain': { state: 'unavailable', rawAttributes: {} },
          'switch.garden': { state: 'off', rawAttributes: {} },
        }}
        haEntityIds={['binary_sensor.rain', 'switch.garden']}
        onCallApi={onCallApi}
        onNotify={onNotify}
      />,
    );

    await waitFor(() => expect(screen.getAllByText('Giardino').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: 'Zone', exact: true })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Avvia Giardino' }));

    expect(await screen.findByText('Avvio bloccato: il sensore pioggia non è verificabile.')).toBeTruthy();
    expect(onNotify).toHaveBeenCalledWith(
      'warning',
      'Avvio bloccato: il sensore pioggia non è verificabile.',
    );
    expect(onCallApi).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'domusos/irrigation/start_zone' }),
      expect.anything(),
    );
  });

  it('migrates the previous shared configuration once and asks Core to disable legacy automations', async () => {
    const emptyDocument = {
      ...buildConsumptionCoreDocument(),
      revision: 0,
      sources: Object.fromEntries(Object.keys(buildConsumptionCoreDocument().sources).map((key) => [key, ''])),
    };
    const legacyConfiguration = {
      ...emptyDocument.settings,
      ...emptyDocument.sources,
      zones: [{ id: 'garden', name: 'Giardino', entityId: 'switch.garden', enabled: true, days: ['mon'], startTimes: ['06:00'], baseDuration: 10, manualDurationMin: 10 }],
    };
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return emptyDocument;
      if (message.type === 'frontend/get_system_data') return {
        value: {
          schema: 'domusos-app-configurations', version: 1, revision: 3,
          updatedAt: new Date().toISOString(), updatedByUserId: 'owner-1',
          apps: { irrigation: legacyConfiguration },
        },
      };
      if (message.type === 'domusos/irrigation/save_config') return {
        ...emptyDocument,
        ...message.config,
        revision: 1,
      };
      if (message.type === 'domusos/irrigation/get_state') return {
        available: true, revision: 1, mode: 'stopped', rain: {}, sessions: [], history: [], legacyAutomations: [], serverTime: new Date().toISOString(),
      };
      return null;
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haEntityIds={['switch.garden']}
        onCallApi={onCallApi}
      />,
    );

    await waitFor(() => expect(onCallApi).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'domusos/irrigation/save_config',
        expected_revision: 0,
        migrate_legacy: true,
      }),
      { reportError: false, throwOnError: true },
    ));
    expect(await screen.findAllByText('Giardino')).not.toHaveLength(0);
  });

  it('keeps the concurrent-zone number in the local configuration draft', async () => {
    const coreDocument = {
      ...buildConsumptionCoreDocument(),
      zones: [
        { id: 'garden', name: 'Giardino', entityId: 'switch.garden', enabled: true, days: ['mon'], startTimes: ['06:00'], baseDuration: 10, manualDurationMin: 10 },
        { id: 'terrace', name: 'Terrazzo', entityId: 'switch.terrace', enabled: true, days: ['tue'], startTimes: ['06:00'], baseDuration: 10, manualDurationMin: 10 },
      ],
    };
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return coreDocument;
      if (message.type === 'domusos/irrigation/get_state') return {
        available: true, revision: 1, mode: 'stopped', rain: {}, sessions: [], history: [], legacyAutomations: [], serverTime: new Date().toISOString(),
      };
      return null;
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation/settings"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haEntityIds={['switch.garden', 'switch.terrace']}
        onCallApi={onCallApi}
      />,
    );

    await screen.findByRole('heading', { name: 'Impostazioni irrigazione' });
    fireEvent.click(screen.getByRole('button', { name: 'Aumenta zone simultanee' }));
    expect(screen.getAllByText('2/2').length).toBeGreaterThan(0);
    expect(screen.getByText('Conferma capacità idraulica')).toBeTruthy();
  });

  it('explains why a safety setting cannot change during a live cycle', async () => {
    const coreDocument = {
      ...buildConsumptionCoreDocument(),
      zones: [
        { id: 'garden', name: 'Giardino', entityId: 'switch.garden', enabled: true, days: ['mon'], startTimes: ['06:00'], baseDuration: 10, manualDurationMin: 10 },
        { id: 'terrace', name: 'Terrazzo', entityId: 'switch.terrace', enabled: true, days: ['tue'], startTimes: ['06:00'], baseDuration: 10, manualDurationMin: 10 },
      ],
    };
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return coreDocument;
      if (message.type === 'domusos/irrigation/get_state') return {
        available: true,
        revision: 1,
        mode: 'enabled',
        rain: {},
        sessions: [{ id: 'live-1', zoneId: 'garden', entityId: 'switch.garden', state: 'running', source: 'manual', startedAt: new Date().toISOString(), deadline: new Date(Date.now() + 300000).toISOString(), remainingSeconds: 300, durationMin: 5 }],
        history: [],
        legacyAutomations: [],
        serverTime: new Date().toISOString(),
      };
      return null;
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation/settings"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haStates={{ 'switch.garden': { state: 'on' }, 'switch.terrace': { state: 'off' } }}
        haEntityIds={['switch.garden', 'switch.terrace']}
        onCallApi={onCallApi}
      />,
    );

    expect(await screen.findByText('Irrigazione in corso')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aumenta zone simultanee' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Conferma capacità idraulica' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Salva configurazione' })[0]);

    expect(await screen.findByText(/prima di modificare il numero di zone simultanee/)).toBeTruthy();
    expect(onCallApi).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'domusos/irrigation/save_config' }),
      expect.anything(),
    );
  });

  it('keeps the backend remaining time frozen while a zone is paused', async () => {
    const coreDocument = {
      ...buildConsumptionCoreDocument(),
      mode: 'paused',
      zones: [
        { id: 'garden', name: 'Giardino', entityId: 'switch.garden', enabled: true, days: ['mon'], startTimes: ['06:00'], baseDuration: 5, manualDurationMin: 5 },
      ],
    };
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return coreDocument;
      if (message.type === 'domusos/irrigation/get_state') return {
        available: true,
        revision: 1,
        mode: 'paused',
        rain: {},
        sessions: [{
          id: 'paused-1', zoneId: 'garden', entityId: 'switch.garden', state: 'paused',
          source: 'manual', startedAt: new Date().toISOString(), deadline: null,
          remainingSeconds: 279, durationMin: 5,
        }],
        history: [],
        legacyAutomations: [],
        serverTime: new Date().toISOString(),
      };
      return null;
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation/zones"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haStates={{ 'switch.garden': { state: 'off' } }}
        haEntityIds={['switch.garden']}
        onCallApi={onCallApi}
      />,
    );

    expect(await screen.findByText('4:39')).toBeTruthy();
    expect(screen.getByText('Ciclo in pausa · ripresa manuale richiesta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Arresta Giardino e azzera il tempo residuo' })).toBeTruthy();
  });

  it('rehydrates configuration when another client changes the rain protection toggle', async () => {
    let coreDocument = {
      ...buildConsumptionCoreDocument(),
      settings: {
        ...buildConsumptionCoreDocument().settings,
        rainSensorEnabled: true,
        rainSensorEntityId: 'binary_sensor.rain',
      },
    };
    let pushState;
    const buildState = () => ({
      available: true,
      revision: coreDocument.revision,
      mode: 'stopped',
      rain: {
        enabled: coreDocument.settings.rainSensorEnabled,
        active: false,
        available: true,
        blocked: false,
        reason: null,
      },
      sessions: [], history: [], legacyAutomations: [], serverTime: new Date().toISOString(),
    });
    const onCallApi = vi.fn(async (message) => {
      if (message.type === 'domusos/irrigation/get_config') return coreDocument;
      if (message.type === 'domusos/irrigation/get_state') return buildState();
      return null;
    });
    const onSubscribeApi = vi.fn(async (_message, callback) => {
      pushState = callback;
      return () => {};
    });

    render(
      <AppGallery
        suppressBrowserNavigation
        navigationRoute="/appgallery/irrigation"
        runtimeMode="real"
        canConfigureApps
        currentUserId="owner-1"
        haConnected
        haStates={{ 'binary_sensor.rain': { state: 'off' } }}
        haEntityIds={['binary_sensor.rain']}
        onCallApi={onCallApi}
        onSubscribeApi={onSubscribeApi}
      />,
    );

    await waitFor(() => expect(pushState).toBeTypeOf('function'));
    await waitFor(() => {
      expect(screen.getAllByRole('switch', { name: /sensore pioggia/i }).every((toggle) => toggle.getAttribute('aria-checked') === 'true')).toBe(true);
    });

    coreDocument = {
      ...coreDocument,
      revision: 2,
      settings: { ...coreDocument.settings, rainSensorEnabled: false },
    };
    act(() => pushState(buildState()));

    await waitFor(() => {
      expect(onCallApi.mock.calls.filter(([message]) => message.type === 'domusos/irrigation/get_config')).toHaveLength(2);
      expect(screen.getAllByRole('switch', { name: /sensore pioggia/i }).every((toggle) => toggle.getAttribute('aria-checked') === 'false')).toBe(true);
    });
  });
});
