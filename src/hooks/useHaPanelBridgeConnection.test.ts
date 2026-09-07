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
    expect(validatePanelApiMessage({ type: 'call_service', domain: 'light!', service: 'turn_on' })).toBe(false);
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
      'unknown_capability',
      42,
    ])).toEqual(['shared_configuration', 'app_configurations', 'revision_history', 'dashboard_reset_marker']);
    expect(parsePanelBridgeCapabilities(null)).toEqual([]);
  });

  it('reads the Home Assistant locale from both current and legacy payload shapes', () => {
    expect(parsePanelLocale('en-GB')).toBe('en-GB');
    expect(parsePanelLocale({ language: 'fr-FR' })).toBe('fr-FR');
    expect(parsePanelLocale({ language: '' })).toBeNull();
    expect(parsePanelLocale(null)).toBeNull();
  });
});
