import { describe, expect, it } from 'vitest';
import {
  isValidPanelRequestId,
  parsePanelBridgeCapabilities,
  parsePanelLocale,
  resolvePanelBridgeHeartbeatStatus,
  validatePanelApiMessage,
  validatePanelServiceRequest,
} from './useHaPanelBridgeConnection';

describe('Home Assistant panel bridge schema', () => {
  it('accepts only valid service names and object payloads', () => {
    expect(validatePanelServiceRequest('light', 'turn_on', { entity_id: 'light.sala' })).toBe(true);
    expect(validatePanelServiceRequest('light;drop', 'turn_on', {})).toBe(false);
    expect(validatePanelServiceRequest('light', '../turn_on', {})).toBe(false);
    expect(validatePanelServiceRequest('light', 'turn_on', 'payload')).toBe(false);
  });

  it('allows only websocket message types used by the dashboard', () => {
    expect(validatePanelApiMessage({ type: 'auth/current_user' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'config/area_registry/list' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'config/area_registry/update', area_id: 'living' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'get_panels' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'get_panels', secret: true })).toBe(false);
    expect(validatePanelApiMessage({ type: 'frontend/get_user_data', key: 'core' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'frontend/get_user_data', key: 'other' })).toBe(false);
    expect(validatePanelApiMessage({
      type: 'frontend/set_user_data',
      key: 'core',
      value: { default_panel: 'domusos', vibrate: true },
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/set_user_data',
      key: 'core',
      value: { default_panel: '../config' },
    })).toBe(false);
    expect(validatePanelApiMessage({ type: 'unknown/admin_command' })).toBe(false);
    expect(validatePanelApiMessage({
      type: 'frontend/get_system_data',
      key: 'premium-home.shared-house.v1',
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/get_system_data',
      key: 'premium-home.dashboard-revisions.v1',
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/get_system_data',
      key: 'premium-home.dashboard-reset.v1',
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/get_system_data',
      key: 'domusos.app-configurations.v1',
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/set_system_data',
      key: 'premium-home.dashboard-revisions.v1',
      value: {
        schema: 'premium-home-dashboard-revision-history',
        version: 1,
        updatedAt: '2026-08-05T10:00:00.000Z',
        entries: [],
      },
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/set_system_data',
      key: 'premium-home.shared-house.v1',
      value: null,
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/set_system_data',
      key: 'premium-home.dashboard-revisions.v1',
      value: null,
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/set_system_data',
      key: 'premium-home.dashboard-reset.v1',
      value: {
        schema: 'domusos-dashboard-reset',
        version: 1,
        resetId: 'reset-123456',
        status: 'complete',
        requestedAt: '2026-08-25T10:00:00.000Z',
        completedAt: '2026-08-25T10:00:01.000Z',
        requestedByUserId: 'owner-1',
      },
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/set_system_data',
      key: 'domusos.app-configurations.v1',
      value: {
        schema: 'domusos-app-configurations',
        version: 1,
        revision: 1,
        updatedAt: '2026-08-26T10:00:00.000Z',
        updatedByUserId: 'owner-1',
        apps: { irrigation: {} },
      },
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'frontend/set_system_data',
      key: 'premium-home.dashboard-reset.v1',
      value: { schema: 'wrong' },
    })).toBe(false);
    expect(validatePanelApiMessage({
      type: 'frontend/set_system_data',
      key: 'another-app.secret',
      value: null,
    })).toBe(false);
    expect(validatePanelApiMessage({
      type: 'frontend/get_system_data',
      key: 'another-app.secret',
    })).toBe(false);
    expect(validatePanelApiMessage({
      type: 'frontend/set_system_data',
      key: 'premium-home.shared-house.v1',
      value: { schema: 'wrong' },
    })).toBe(false);
    expect(validatePanelApiMessage({ type: 'call_service', domain: 'light', service: 'turn_on', service_data: {} })).toBe(true);
    expect(validatePanelApiMessage({ type: 'domusos/irrigation/get_config' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'domusos/irrigation/subscribe' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'domusos/irrigation/prepare_legacy_removal' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'domusos/waste_collection/get_config' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'domusos/waste_collection/preview', days: 7 })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'domusos/waste_collection/save_config',
      config: { wasteTypes: [], sources: [], mappings: [], exceptions: [], notifications: {} },
      expected_revision: 1,
    })).toBe(true);
    expect(validatePanelApiMessage({ type: 'domusos/waste_collection/preview', days: 90 })).toBe(false);
    expect(validatePanelApiMessage({ type: 'domusos/irrigation/delete_everything' })).toBe(false);
    expect(validatePanelApiMessage({
      type: 'calendar/event/subscribe',
      entity_id: 'calendar.domus_ui',
      start: '2026-09-23T00:00:00.000Z',
      end: '2026-09-30T00:00:00.000Z',
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'calendar/event/create',
      entity_id: 'calendar.domus_ui',
      event: {
        start: '2026-09-24T10:00:00.000Z',
        end: '2026-09-24T11:00:00.000Z',
        summary: 'Controllo casa',
      },
    })).toBe(true);
    expect(validatePanelApiMessage({
      type: 'calendar/event/delete',
      entity_id: 'light.not_a_calendar',
      uid: 'event-1',
    })).toBe(false);
    expect(validatePanelApiMessage({
      type: 'calendar/event/update',
      entity_id: 'calendar.domus_ui',
      uid: '',
      event: {
        start: '2026-09-24',
        end: '2026-09-25',
        summary: 'Evento',
      },
    })).toBe(false);
    expect(validatePanelApiMessage({ type: 'call_service', domain: 'light!', service: 'turn_on' })).toBe(false);
  });

  it('allows only the four Energy commands with their exact shapes', () => {
    for (const type of ['get_state', 'discover', 'get_profile']) {
      expect(validatePanelApiMessage({ type: `domusos/energy/${type}` })).toBe(true);
      expect(validatePanelApiMessage({ type: `domusos/energy/${type}`, entity_id: 'sensor.x' })).toBe(false);
    }
    const save = {
      type: 'domusos/energy/save_profile',
      profile: { modules: { solar: { sensors: { production_power: 'sensor.pv' } } } },
      expected_revision: 3,
    };
    expect(validatePanelApiMessage(save)).toBe(true);
    expect(validatePanelApiMessage({ ...save, expected_revision: null })).toBe(true);
    expect(validatePanelApiMessage({ ...save, expected_revision: -1 })).toBe(false);
    expect(validatePanelApiMessage({ ...save, expected_revision: 1.5 })).toBe(false);
    expect(validatePanelApiMessage({ ...save, profile: { modules: [] } })).toBe(false);
    expect(validatePanelApiMessage({ ...save, migrate: true })).toBe(false);
    const { expected_revision: _omitted, ...withoutRevision } = save;
    expect(validatePanelApiMessage(withoutRevision)).toBe(false);
    expect(validatePanelApiMessage({
      ...save,
      profile: { modules: { grid: { sensors: { net_power: 'x'.repeat(20_001) } } } },
    })).toBe(false);
    // Energy Profile v2: a whole plant, with or without a tariff, never next to a v1 profile.
    const saveV2 = { type: 'domusos/energy/save_profile', profile_v2: { plant: { solar: { devices: [] } } }, expected_revision: 3 };
    expect(validatePanelApiMessage(saveV2)).toBe(true);
    expect(validatePanelApiMessage({ ...saveV2, profile_v2: { ...saveV2.profile_v2, tariff: null } })).toBe(true);
    expect(validatePanelApiMessage({ ...saveV2, profile: save.profile })).toBe(false);
    expect(validatePanelApiMessage({ ...saveV2, profile_v2: { modules: {} } })).toBe(false);
    expect(validatePanelApiMessage({ ...saveV2, expected_revision: -1 })).toBe(false);
    const { expected_revision: _missing, ...v2WithoutRevision } = saveV2;
    expect(validatePanelApiMessage(v2WithoutRevision)).toBe(false);
    // A large plant fits; an oversized one does not.
    expect(validatePanelApiMessage({ ...saveV2, profile_v2: { plant: { solar: { devices: [], note: 'x'.repeat(60_000) } } } })).toBe(true);
    expect(validatePanelApiMessage({ ...saveV2, profile_v2: { plant: { solar: { devices: [], note: 'x'.repeat(131_073) } } } })).toBe(false);
    expect(validatePanelApiMessage({ type: 'domusos/energy/control_inverter' })).toBe(false);
    expect(validatePanelApiMessage({ type: 'domusos/energy/subscribe' })).toBe(false);
  });

  it('rejects malformed response correlation ids', () => {
    expect(isValidPanelRequestId('ha-panel-call-api-1720000000000-abc123')).toBe(true);
    expect(isValidPanelRequestId('other-1720000000000-abc123')).toBe(false);
    expect(isValidPanelRequestId('../request')).toBe(false);
  });

  it('separates a quiet bridge from a bridge that is no longer reachable', () => {
    expect(resolvePanelBridgeHeartbeatStatus(19_999)).toBe('connected');
    expect(resolvePanelBridgeHeartbeatStatus(20_000)).toBe('reconnecting');
    expect(resolvePanelBridgeHeartbeatStatus(39_999)).toBe('reconnecting');
    expect(resolvePanelBridgeHeartbeatStatus(40_000)).toBe('offline');
  });

  it('accepts only declared persistence capabilities from the panel bridge', () => {
    expect(parsePanelBridgeCapabilities([
      'shared_configuration',
      'app_configurations',
      'revision_history',
      'dashboard_reset_marker',
      'irrigation_core',
      'energy_core',
      'calendar_v1',
      'waste_collection_v1',
      'host_navigation',
      'person_links',
      'person_create',
      'person_picture',
      'unknown_capability',
      42,
    ])).toEqual(['shared_configuration', 'app_configurations', 'revision_history', 'dashboard_reset_marker', 'irrigation_core', 'energy_core', 'calendar_v1', 'waste_collection_v1', 'host_navigation', 'person_links', 'person_create', 'person_picture']);
    expect(parsePanelBridgeCapabilities(null)).toEqual([]);
  });

  it('reads the Home Assistant locale from both current and legacy payload shapes', () => {
    expect(parsePanelLocale('en-GB')).toBe('en-GB');
    expect(parsePanelLocale({ language: 'fr-FR' })).toBe('fr-FR');
    expect(parsePanelLocale({ language: '' })).toBeNull();
    expect(parsePanelLocale(null)).toBeNull();
  });
});
