import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HA_PANEL_ALLOWED_API_TYPES,
  isValidEnergyMessage as isValidAppEnergyMessage,
  isValidProfileMessage as isValidAppProfileMessage,
  isValidDeviceTimerMessage as isValidAppDeviceTimerMessage,
  isValidStatisticsMessage as isValidAppStatisticsMessage,
  validatePanelApiMessage,
} from '../hooks/useHaPanelBridgeConnection';
import { isDashboardAdministrativeApiMessage } from '../security/dashboardAccess';

const PANEL_ELEMENT_NAME = 'ha-dashboard-builder-panel';

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function readPanelBridgeSource() {
  const documentation = readProjectFile('docs/home-assistant-panel-bridge.md');
  const match = documentation.match(/```js\r?\n([\s\S]*?)\r?\n```/);
  if (!match) throw new Error('Panel bridge source not found.');
  return match[1];
}

describe('Home Assistant panel distribution contract', () => {
  it('keeps the HACS integration aligned with the registered custom element', () => {
    const installation = readProjectFile('docs/installation-beta.md');
    const bridgeDocumentation = readProjectFile('docs/home-assistant-panel-bridge.md');
    const bridge = readPanelBridgeSource();
    const integrationConstants = readProjectFile('custom_components/domusos/const.py');
    const integrationSetup = readProjectFile('custom_components/domusos/__init__.py');
    const hacsManifest = JSON.parse(readProjectFile('hacs.json')) as Record<string, unknown>;
    const viteConfig = readProjectFile('vite.config.ts');
    const bridgeHook = readProjectFile('src/hooks/useHaPanelBridgeConnection.ts');

    expect(installation).toContain('You do not need to edit `configuration.yaml`');
    expect(integrationConstants).toContain(`PANEL_WEB_COMPONENT = "${PANEL_ELEMENT_NAME}"`);
    expect(integrationSetup).toContain('await panel_custom.async_register_panel(');
    expect(integrationSetup).toContain('getattr(frontend, "async_panel_exists", None)');
    expect(integrationSetup).not.toContain('if frontend.async_panel_exists(');
    expect(integrationSetup).toContain('"app_url": f"{STATIC_URL_PATH}/index.html?v={VERSION}"');
    expect(hacsManifest).toMatchObject({
      zip_release: true,
      filename: 'domusos.zip',
    });
    expect(bridgeDocumentation).toContain(`customElements.define("${PANEL_ELEMENT_NAME}"`);
    expect(bridge).toContain('"config/area_registry/list"');
    expect(bridge).toContain('const toBridgeErrorMessage = (error, fallback) =>');
    expect(bridge).toContain('toBridgeErrorMessage(error, "Richiesta API Home Assistant fallita.")');
    expect(bridge).toContain('if (payload.type === "ha-panel-navigate-home")');
    expect(bridge).toContain('const hostPanel = this.closest("ha-panel-custom")');
    expect(bridge).toContain('hostPanel.navigate(targetPath)');
    expect(bridge).toContain('window.location.assign(path)');
    expect(bridgeHook).toContain("return postToParent({ type: 'ha-panel-navigate-home' });");
    expect(bridgeHook).toContain("'host_navigation'");
    // Person <-> login links: declared capability, allowlisted, strictly validated.
    expect(bridge).toContain('"person_links"');
    expect(bridge).toContain('"person/list", "person/update", "person/create"');
    expect(bridge).toMatch(/if \(message\.type === "person\/update"\) \{\s+return isValidPersonUpdate\(message\);/);
    expect(bridge).toMatch(/if \(message\.type === "person\/create"\) \{\s+return isValidPersonCreate\(message\);/);
    expect(bridge).toContain('"person_create"');
    expect(bridgeHook).toContain("'person_links'");
    expect(bridgeHook).toContain("'person_create'");
    // Person pictures: admin-only upload of small images through the HA image API.
    expect(bridge).toContain('"person_picture"');
    expect(bridge).toContain('subscribe-api|upload-image)');
    expect(bridge).toContain('if (payload.type === "ha-panel-upload-image")');
    expect(bridge).toContain('!isValidImageUpload(payload.file)');
    expect(bridge).toContain('!this._hass?.user?.is_admin');
    expect(bridge).toContain('this._hass.fetchWithAuth("/api/image/upload", { method: "POST", body })');
    expect(bridgeHook).toContain("'person_picture'");
    expect(bridgeHook).toContain("type: 'ha-panel-upload-image'");
    expect(bridge).not.toContain('window.history.pushState');
    expect(bridge).not.toContain('window.history.replaceState');
    expect(bridge).not.toContain('location-changed');
    expect(viteConfig).toContain("fileName: 'ha-dashboard-builder-panel.js'");
  });

  it('allowlists exactly the Energy commands in both bridge halves', () => {
    const bridge = readPanelBridgeSource();
    const hostTypes = [...bridge.matchAll(/"(domusos\/energy\/[a-z_]+)"/g)].map((match) => match[1]);
    const appTypes = [...HA_PANEL_ALLOWED_API_TYPES].filter((type) => type.startsWith('domusos/energy/'));

    expect(new Set(hostTypes)).toEqual(new Set(appTypes));
    expect(appTypes.sort()).toEqual([
      'domusos/energy/discover',
      'domusos/energy/get_history',
      'domusos/energy/get_profile',
      'domusos/energy/get_state',
      'domusos/energy/save_profile',
    ]);
    expect(bridge).toContain('"energy_core"');
  });

  it('validates Energy message shapes in the HACS host script', () => {
    const bridge = readPanelBridgeSource();
    const pick = (pattern: RegExp) => {
      const match = bridge.match(pattern);
      if (!match) throw new Error(`Host bridge fragment not found: ${pattern}`);
      return match[0];
    };
    const source = [
      pick(/const isRecord = [^\r\n]+\r?\n/),
      pick(/const hasExactKeys = [\s\S]*?;\r?\n/),
      pick(/const ENERGY_SAVES = [^\r\n]+\r?\n/),
      pick(/const ENERGY_HISTORY_KEYS = [^\r\n]+\r?\n/),
      pick(/const isValidEnergyMessage = [\s\S]*?\r?\n};\r?\n/),
    ].join('');
    const isValidEnergyMessage = new Function(`${source}return isValidEnergyMessage;`)() as (
      message: Record<string, unknown>,
    ) => boolean;
    const save = {
      type: 'domusos/energy/save_profile',
      profile: { modules: {} },
      expected_revision: 0,
    };

    expect(isValidEnergyMessage({ type: 'domusos/energy/get_state' })).toBe(true);
    expect(isValidEnergyMessage({ type: 'domusos/energy/discover', scope: 'all' })).toBe(false);
    expect(isValidEnergyMessage(save)).toBe(true);
    expect(isValidEnergyMessage({ ...save, expected_revision: null })).toBe(true);
    expect(isValidEnergyMessage({ ...save, expected_revision: -2 })).toBe(false);
    expect(isValidEnergyMessage({ ...save, profile: null })).toBe(false);
    expect(isValidEnergyMessage({ ...save, extra: 1 })).toBe(false);
    // Energy Profile v2: a whole plant instead of v1 modules, never both.
    const saveV2 = { type: 'domusos/energy/save_profile', profile_v2: { plant: {} }, expected_revision: 4 };
    expect(isValidEnergyMessage(saveV2)).toBe(true);
    expect(isValidEnergyMessage({ ...saveV2, profile_v2: { plant: {}, tariff: null } })).toBe(true);
    expect(isValidEnergyMessage({ ...saveV2, profile: { modules: {} } })).toBe(false);
    expect(isValidEnergyMessage({ ...saveV2, profile_v2: { modules: {} } })).toBe(false);
    expect(isValidEnergyMessage({ ...saveV2, profile_v2: { plant: [] } })).toBe(false);
    expect(isValidEnergyMessage({ type: saveV2.type, profile_v2: saveV2.profile_v2 })).toBe(false);
    expect(isValidEnergyMessage({ ...saveV2, profile_v2: { plant: { solar: 'x'.repeat(131_072) } } })).toBe(false);
    // History: only the documented parameters with their types; Home Assistant checks the period.
    const history = { type: 'domusos/energy/get_history', range: '24h' };
    const custom = { type: history.type, start: '2026-10-01T00:00:00+02:00', end: '2026-10-02', bucket: 'hour', include_devices: true, compare: 'previous' };
    for (const validate of [isValidEnergyMessage, isValidAppEnergyMessage]) {
      expect(validate(history)).toBe(true);
      expect(validate(custom)).toBe(true);
      expect(validate({ type: history.type })).toBe(true);
      expect(validate({ ...history, series: ['production'] })).toBe(false);
      expect(validate({ ...history, range: 24 })).toBe(false);
      expect(validate({ ...custom, start: 'x'.repeat(41) })).toBe(false);
      expect(validate({ ...custom, include_devices: 'true' })).toBe(false);
      expect(validate({ ...custom, compare: 'last_year' })).toBe(false);
      expect(validate({ type: 'domusos/energy/get_state', range: '24h' })).toBe(false);
    }
    expect(bridge).toMatch(/if \(message\.type\.startsWith\("domusos\/energy\/"\)\) \{\s+return isValidEnergyMessage\(message\);/);
  });

  it('allowlists exactly the self-service Profile commands in both bridge halves', () => {
    const bridge = readPanelBridgeSource();
    const hostTypes = [...bridge.matchAll(/"(domusos\/profile\/[a-z_]+)"/g)].map((match) => match[1]);
    const appTypes = [...HA_PANEL_ALLOWED_API_TYPES].filter((type) => type.startsWith('domusos/profile/'));

    expect(new Set(hostTypes)).toEqual(new Set(appTypes));
    expect(appTypes.sort()).toEqual([
      'domusos/profile/add_device',
      'domusos/profile/discover_devices',
      'domusos/profile/get_self',
      'domusos/profile/list_recipients',
      'domusos/profile/remove_device',
      'domusos/profile/save_self',
      'domusos/profile/test_self',
      'domusos/profile/update_device',
    ]);
    expect(bridge).toContain('"profile_core_v1"');
    expect(bridge).toContain('"profile_devices_v1"');
    expect(bridge).toContain('"profile_notifications_v1"');
    expect(bridge).toContain('"profile_recipients_v1"');
    // The app treats the recipient list as administrative, like Home Assistant does.
    expect(isDashboardAdministrativeApiMessage({ type: 'domusos/profile/list_recipients' })).toBe(true);
    // No per-person detail command exists.
    for (const type of ['get_recipient_profile', 'get_recipient_devices', 'get_recipient_status']) {
      expect([...HA_PANEL_ALLOWED_API_TYPES]).not.toContain(`domusos/profile/${type}`);
    }
    // The router is backend only: no generic send command crosses the bridge.
    expect(bridge).not.toMatch(/"domusos\/notifications\//);
    expect([...HA_PANEL_ALLOWED_API_TYPES].some((type) => type.startsWith('domusos/notifications/'))).toBe(false);
  });

  it('lets the Domus frame ask for full screen and a wake lock, and nothing of Home Assistant is touched', () => {
    const bridge = readPanelBridgeSource();
    expect(bridge).toContain('this._iframe.allow = "fullscreen; screen-wake-lock";');
    expect(bridge).toContain('this._iframe.allowFullscreen = true;');
    // Kiosk works inside its own frame: never the parent page, its DOM or its styles.
    const kioskSources = ['DomusKiosk.tsx', 'KioskRuntime.tsx', 'kioskLaunch.ts', 'kioskDisplay.ts', 'kioskSession.ts', 'kioskPreferences.ts'].map((file) =>
      readFileSync(resolve(process.cwd(), 'src/components/kiosk', file), 'utf8'),
    );
    for (const source of kioskSources) {
      expect(source).not.toMatch(/window\.parent|parent\.document|window\.top|top\.document|shadowRoot|home-assistant-main/);
    }
  });

  it('forwards the own access profile and People and access, never the shadow diagnostics', () => {
    const bridge = readPanelBridgeSource();
    const hostTypes = new Set([...bridge.matchAll(/"(domusos\/access\/[a-z_]+)"/g)].map((match) => match[1]));
    const appTypes = [...HA_PANEL_ALLOWED_API_TYPES].filter((type) => type.startsWith('domusos/access/')).sort();
    const expected = [
      'domusos/access/get_self',
      'domusos/access/list_accounts',
      'domusos/access/remove_assignment',
      'domusos/access/reset_policy',
      'domusos/access/set_assignment',
    ];

    expect([...hostTypes].sort()).toEqual(expected);
    expect(appTypes).toEqual(expected);
    expect(bridge).toContain('"access_v1"');
    expect(bridge).toContain('"access_admin_v1"');
    for (const type of ['get_shadow_diagnostics', 'reset_shadow_diagnostics']) {
      expect(bridge).not.toContain(`"domusos/access/${type}"`);
      expect(validatePanelApiMessage({ type: `domusos/access/${type}` })).toBe(false);
    }
    // Who acts is the connection's: nothing about it may travel with any request.
    for (const type of ['get_self', 'list_accounts', 'reset_policy']) {
      expect(validatePanelApiMessage({ type: `domusos/access/${type}` })).toBe(true);
      for (const extra of [{ user_id: 'a'.repeat(32) }, { role: 'admin' }, { capabilities: ['energy.manage'] }]) {
        expect(validatePanelApiMessage({ type: `domusos/access/${type}`, ...extra })).toBe(false);
      }
    }
    const set = { type: 'domusos/access/set_assignment', user_id: 'b'.repeat(32), role: 'member', grants: ['access.control'], expected_revision: 3 };
    expect(validatePanelApiMessage(set)).toBe(true);
    for (const spoof of [{ assigned_by: 'a'.repeat(32) }, { assigned_at: 'now' }, { is_admin: true }, { capabilities: [] }, { policy_state: 'ready' }]) {
      expect(validatePanelApiMessage({ ...set, ...spoof })).toBe(false);
    }
    expect(validatePanelApiMessage({ ...set, role: 'locked' })).toBe(false);
    expect(validatePanelApiMessage({ ...set, role: 'resident' })).toBe(true);
    expect(validatePanelApiMessage({ ...set, grants: ['access.manage'] })).toBe(false);
    expect(validatePanelApiMessage({ ...set, user_id: 'person.mario' })).toBe(false);
    expect(validatePanelApiMessage({ ...set, expected_revision: -1 })).toBe(false);
    expect(validatePanelApiMessage({ type: 'domusos/access/remove_assignment', user_id: 'b'.repeat(32), expected_revision: 3 })).toBe(true);
    expect(validatePanelApiMessage({ type: 'domusos/access/remove_assignment', user_id: 'b'.repeat(32), expected_revision: 3, role: 'admin' })).toBe(false);
    expect(isDashboardAdministrativeApiMessage({ type: 'domusos/access/get_self' })).toBe(false);
  });

  it('allowlists exactly the device power commands in both bridge halves, all administrative', () => {
    const bridge = readPanelBridgeSource();
    const hostTypes = [...bridge.matchAll(/"(domusos\/device_power\/[a-z_]+)"/g)].map((match) => match[1]);
    const appTypes = [...HA_PANEL_ALLOWED_API_TYPES].filter((type) => type.startsWith('domusos/device_power/'));

    expect(new Set(hostTypes)).toEqual(new Set(appTypes));
    expect(appTypes.sort()).toEqual([
      'domusos/device_power/bind_policy',
      'domusos/device_power/delete_policy',
      'domusos/device_power/get_state',
      'domusos/device_power/save_policy',
    ]);
    expect(bridge).toContain('"device_power_v1"');
    for (const type of appTypes) {
      expect(isDashboardAdministrativeApiMessage({ type })).toBe(true);
    }
    // The controllers run in Home Assistant: no command switches anything from a client.
    expect(appTypes.some((type) => /turn_|switch_on|switch_off|set_switch/.test(type))).toBe(false);
  });

  it('validates device power message shapes in the HACS host script', () => {
    const bridge = readPanelBridgeSource();
    const pick = (pattern: RegExp) => {
      const match = bridge.match(pattern);
      if (!match) throw new Error(`Host bridge fragment not found: ${pattern}`);
      return match[0];
    };
    const source = [
      pick(/const isRecord = [^\r\n]+\r?\n/),
      pick(/const hasExactKeys = [\s\S]*?;\r?\n/),
      pick(/const DEVICE_POWER_POLICY_KEYS = [\s\S]*?\];\r?\n/),
      pick(/const isValidDevicePowerMessage = [\s\S]*?\r?\n};\r?\n/),
    ].join('');
    const validate = new Function(`${source}return isValidDevicePowerMessage;`)() as (
      message: Record<string, unknown>,
    ) => boolean;
    const policy = {
      client_id: 'client-0001',
      label: 'Tablet soggiorno',
      enabled: true,
      battery_entity_id: 'sensor.tablet_battery_level',
      switch_entity_id: 'switch.presa_tablet',
      start_threshold: 30,
      stop_threshold: 80,
    };
    const id = '0123456789abcdef0123456789abcdef';
    const save = { type: 'domusos/device_power/save_policy', policy };

    expect(validate({ type: 'domusos/device_power/get_state' })).toBe(true);
    expect(validate(save)).toBe(true);
    expect(validate({ ...save, policy_id: id, expected_revision: 2 })).toBe(true);
    expect(validate({ ...save, policy: { ...policy, client_id: null, label: null } })).toBe(true);
    expect(validate({ type: 'domusos/device_power/bind_policy', policy_id: id, expected_revision: 1, client_id: 'client-0002' })).toBe(true);
    expect(validate({ type: 'domusos/device_power/delete_policy', policy_id: id, expected_revision: 1 })).toBe(true);

    expect(validate({ type: 'domusos/device_power/get_state', client_id: 'client-0001' })).toBe(false);
    expect(validate({ ...save, policy_id: id })).toBe(false);
    expect(validate({ ...save, expected_revision: 1 })).toBe(false);
    expect(validate({ ...save, entity_id: 'switch.presa_tablet' })).toBe(false);
    expect(validate({ ...save, policy: { ...policy, strategy: 'schedule' } })).toBe(false);
    expect(validate({ ...save, policy: { ...policy, switch_entity_id: 'light.presa' } })).toBe(false);
    expect(validate({ ...save, policy: { ...policy, battery_entity_id: 'switch.presa_tablet' } })).toBe(false);
    expect(validate({ ...save, policy: { ...policy, start_threshold: 80, stop_threshold: 30 } })).toBe(false);
    expect(validate({ ...save, policy: { ...policy, stop_threshold: 101 } })).toBe(false);
    expect(validate({ ...save, policy: { ...policy, start_threshold: 30.5 } })).toBe(false);
    expect(validate({ ...save, policy: { ...policy, label: 'x'.repeat(65) } })).toBe(false);
    expect(validate({ ...save, policy: { ...policy, client_id: 'short' } })).toBe(false);
    expect(validate({ type: 'domusos/device_power/delete_policy', policy_id: 'nope', expected_revision: 1 })).toBe(false);
    expect(validate({ type: 'domusos/device_power/turn_on', entity_id: 'switch.presa_tablet' })).toBe(false);
  });

  it('allowlists the device timer commands and the statistics in both bridge halves, none administrative', () => {
    const bridge = readPanelBridgeSource();
    const hostTypes = [...bridge.matchAll(/"(domusos\/device_timers\/[a-z_]+|recorder\/[a-z_]+)"/g)].map((match) => match[1]);
    const appTypes = [...HA_PANEL_ALLOWED_API_TYPES].filter(
      (type) => type.startsWith('domusos/device_timers/') || type.startsWith('recorder/'),
    );

    expect(new Set(hostTypes)).toEqual(new Set(appTypes));
    expect(appTypes.sort()).toEqual([
      'domusos/device_timers/cancel_timer',
      'domusos/device_timers/get_state',
      'domusos/device_timers/set_timer',
      'domusos/device_timers/subscribe',
      'recorder/statistics_during_period',
    ]);
    expect(bridge).toContain('"device_timers_v1"');
    expect(bridge).toContain('"statistics_v1"');
    expect(bridge).toContain('const SUBSCRIBE_TYPES = new Set(["domusos/irrigation/subscribe", "domusos/device_timers/subscribe", "calendar/event/subscribe"]);');
    for (const type of appTypes) {
      expect(isDashboardAdministrativeApiMessage({ type })).toBe(false);
    }
  });

  it('validates device timer and statistics shapes alike in the HACS host script and the app', () => {
    const bridge = readPanelBridgeSource();
    const pick = (pattern: RegExp) => {
      const match = bridge.match(pattern);
      if (!match) throw new Error(`Host bridge fragment not found: ${pattern}`);
      return match[0];
    };
    const source = [
      pick(/const isRecord = [^\r\n]+\r?\n/),
      pick(/const hasExactKeys = [\s\S]*?;\r?\n/),
      pick(/const DEVICE_TIMER_ENTITY = [^\r\n]+\r?\n/),
      pick(/const isValidDeviceTimerMessage = [\s\S]*?\r?\n};\r?\n/),
      pick(/const STATISTICS_KEYS = [^\r\n]+\r?\n/),
      pick(/const STATISTICS_PERIODS = [^\r\n]+\r?\n/),
      pick(/const STATISTICS_UNITS = [^\r\n]+\r?\n/),
      pick(/const isValidStatisticsMessage = [\s\S]*?includes\(unit\)\);\r?\n/),
    ].join('');
    const [hostTimer, hostStatistics] = new Function(`${source}return [isValidDeviceTimerMessage, isValidStatisticsMessage];`)() as Array<
      (message: Record<string, unknown>) => boolean
    >;
    const set = { type: 'domusos/device_timers/set_timer', entity_id: 'switch.presa_tv', minutes: 30 };
    const statistics = {
      type: 'recorder/statistics_during_period',
      start_time: '2026-10-27T00:00:00.000Z',
      end_time: '2026-10-27T10:30:00.000Z',
      statistic_ids: ['sensor.presa_tv_energy'],
      period: 'hour',
      types: ['change'],
      units: { energy: 'kWh' },
    };
    const timers: Array<[Record<string, unknown>, boolean]> = [
      [{ type: 'domusos/device_timers/get_state' }, true],
      [{ type: 'domusos/device_timers/subscribe' }, true],
      [set, true],
      [{ ...set, entity_id: 'fan.soffitto', minutes: 1440 }, true],
      [{ ...set, entity_id: 'humidifier.bagno', minutes: 1 }, true],
      [{ type: 'domusos/device_timers/cancel_timer', entity_id: 'switch.presa_tv' }, true],
      [{ type: 'domusos/device_timers/get_state', entity_id: 'switch.presa_tv' }, false],
      [{ ...set, entity_id: 'light.salotto' }, false],
      [{ ...set, entity_id: 'lock.porta' }, false],
      [{ ...set, minutes: 0 }, false],
      [{ ...set, minutes: 1441 }, false],
      [{ ...set, minutes: 1.5 }, false],
      [{ ...set, minutes: '30' }, false],
      [{ ...set, user_id: 'a'.repeat(32) }, false],
      [{ type: 'domusos/device_timers/cancel_timer' }, false],
      [{ type: 'domusos/device_timers/turn_off', entity_id: 'switch.presa_tv' }, false],
    ];
    const reads: Array<[Record<string, unknown>, boolean]> = [
      [statistics, true],
      [{ ...statistics, period: '5minute', types: ['mean'], units: { power: 'W' } }, true],
      [{ ...statistics, statistic_ids: ['sensor.a', 'sensor.b'], types: ['change', 'mean'], units: {} }, true],
      [{ ...statistics, statistic_ids: [] }, false],
      [{ ...statistics, statistic_ids: Array.from({ length: 11 }, (_, index) => `sensor.s${index}`) }, false],
      [{ ...statistics, statistic_ids: ['switch.presa_tv'] }, false],
      [{ ...statistics, period: 'year' }, false],
      [{ ...statistics, types: ['sum'] }, false],
      [{ ...statistics, units: { energy: 'J' } }, false],
      [{ ...statistics, units: { constructor: 'kWh' } }, false],
      [{ ...statistics, start_time: 'yesterday' }, false],
      [{ ...statistics, units: undefined }, false],
      [{ ...statistics, extra: true }, false],
    ];
    for (const [message, expected] of timers) {
      expect(hostTimer(message), JSON.stringify(message)).toBe(expected);
      expect(isValidAppDeviceTimerMessage(message), JSON.stringify(message)).toBe(expected);
      if (message.type === 'domusos/device_timers/turn_off') continue;
      expect(validatePanelApiMessage(message), JSON.stringify(message)).toBe(expected);
    }
    for (const [message, expected] of reads) {
      expect(hostStatistics(message), JSON.stringify(message)).toBe(expected);
      expect(isValidAppStatisticsMessage(message), JSON.stringify(message)).toBe(expected);
      expect(validatePanelApiMessage(message), JSON.stringify(message)).toBe(expected);
    }
  });

  it('lets only the entity state words cross the bridge', () => {
    const bridge = readPanelBridgeSource();
    const pick = (pattern: RegExp) => {
      const match = bridge.match(pattern);
      if (!match) throw new Error(`Host bridge fragment not found: ${pattern}`);
      return match[0];
    };
    const source = [
      pick(/const hasExactKeys = [\s\S]*?;\r?\n/),
      pick(/const isValidTranslationsMessage = [\s\S]*?\);\r?\n/),
    ].join('');
    const isValidTranslationsMessage = new Function(`${source}return isValidTranslationsMessage;`)() as (
      message: Record<string, unknown>,
    ) => boolean;
    const request = { type: 'frontend/get_translations', language: 'it', category: 'entity_component' };

    expect(bridge).toContain('"state_translations_v1"');
    expect(HA_PANEL_ALLOWED_API_TYPES.has('frontend/get_translations')).toBe(true);
    expect(isValidTranslationsMessage(request)).toBe(true);
    expect(isValidTranslationsMessage({ ...request, category: 'entity' })).toBe(true);
    expect(isValidTranslationsMessage({ ...request, language: 'pt-BR' })).toBe(true);
    expect(isValidTranslationsMessage({ ...request, category: 'config' })).toBe(false);
    expect(isValidTranslationsMessage({ ...request, category: 'issues' })).toBe(false);
    expect(isValidTranslationsMessage({ ...request, language: '../it' })).toBe(false);
    expect(isValidTranslationsMessage({ ...request, integration: ['hue'] })).toBe(false);
    expect(isValidTranslationsMessage({ type: request.type, language: 'it' })).toBe(false);
  });

  it('validates Profile message shapes identically in both bridge halves', () => {
    const bridge = readPanelBridgeSource();
    const pick = (pattern: RegExp) => {
      const match = bridge.match(pattern);
      if (!match) throw new Error(`Host bridge fragment not found: ${pattern}`);
      return match[0];
    };
    const source = [
      pick(/const isRecord = [^\r\n]+\r?\n/),
      pick(/const hasExactKeys = [\s\S]*?;\r?\n/),
      pick(/const PROFILE_SELF_KEYS = [^\r\n]+\r?\n/),
      pick(/const isValidProfileMessage = [\s\S]*?\r?\n};\r?\n/),
    ].join('');
    const isValidHostProfileMessage = new Function(`${source}return isValidProfileMessage;`)() as (
      message: Record<string, unknown>,
    ) => boolean;
    const save = {
      type: 'domusos/profile/save_self',
      expected_revision: 0,
      profile: { notifications: { enabled: false } },
    };
    const add = { type: 'domusos/profile/add_device', expected_revision: 0, ha_device_id: 'a'.repeat(32) };
    const remove = { type: 'domusos/profile/remove_device', expected_revision: 3, device_id: 'dev-1' };
    const update = { type: 'domusos/profile/update_device', expected_revision: 3, device_id: 'dev-1' };
    const accepted = [
      { type: 'domusos/profile/discover_devices' },
      add,
      { ...add, label: '  Telefono  ' },
      { ...add, label: null },
      remove,
      { ...update, label: 'Telefono' },
      { ...update, label: null },
      { ...update, notifications: { enabled: false } },
      { ...update, label: '', notifications: { enabled: true } },
      { type: 'domusos/profile/get_self' },
      { type: 'domusos/profile/test_self' },
      { type: 'domusos/profile/test_self', personal_device_id: 'dev-1' },
      { type: 'domusos/profile/list_recipients' },
      save,
      { ...save, expected_revision: 4, profile: { notifications: { enabled: true }, preferences: {}, personal_devices: [] } },
    ];
    const refused = [
      { type: 'domusos/profile/discover_devices', user_id: 'someone' },
      { type: 'domusos/profile/discover_devices', person_id: 'erika' },
      { ...add, user_id: 'someone' },
      { ...add, owner_user_id: 'someone' },
      { ...add, device_id: 'chosen-by-client' },
      { ...add, added_at: '2026-10-09T09:00:00+00:00' },
      { ...add, notifications: { enabled: true } },
      { ...add, expected_revision: null },
      { ...add, ha_device_id: '../etc' },
      { ...add, ha_device_id: 7 },
      { ...add, label: 3 },
      { ...add, label: 'x'.repeat(257) },
      { type: add.type, ha_device_id: add.ha_device_id },
      { ...remove, ha_device_id: 'a'.repeat(32) },
      { ...remove, device_id: 'Dev 1' },
      { ...remove, person_id: 'erika' },
      { type: remove.type, device_id: 'dev-1' },
      update,
      { ...update, label: 'x', ha_device_id: 'b'.repeat(32) },
      { ...update, label: 'x', added_at: '2026-10-09T09:00:00+00:00' },
      { ...update, label: 'x', source: { kind: 'ha_device' } },
      { ...update, label: 'x', user_id: 'someone' },
      { ...update, notifications: { enabled: 'false' } },
      { ...update, notifications: { enabled: true, quiet: true } },
      { type: 'domusos/profile/get_self', user_id: 'someone' },
      { type: 'domusos/profile/get_self', person_id: 'erika' },
      { ...save, user_id: 'someone' },
      { ...save, person_id: 'erika' },
      { ...save, owner_user_id: 'someone' },
      { ...save, profile: { ...save.profile, owner_user_id: 'someone' } },
      { ...save, profile: { ...save.profile, user_id: 'someone' } },
      { type: save.type, profile: save.profile },
      { ...save, expected_revision: null },
      { ...save, expected_revision: -1 },
      { ...save, expected_revision: 1.5 },
      { ...save, expected_revision: '1' },
      { ...save, profile: {} },
      { ...save, profile: { notifications: { enabled: 'false' } } },
      { ...save, profile: { notifications: { enabled: false, quiet_hours: {} } } },
      { ...save, profile: { ...save.profile, preferences: [] } },
      { ...save, profile: { ...save.profile, personal_devices: {} } },
      { ...save, profile: { ...save.profile, personal_devices: ['x'.repeat(20_001)] } },
      { type: 'domusos/profile/get_profile', user_id: 'someone' },
      ...[
        { user_id: 'someone' },
        { person_id: 'erika' },
        { owner_user_id: 'someone' },
        { ha_device_id: 'a'.repeat(32) },
        { message: 'spam' },
        { title: 'spam' },
        { target: ['notify.mobile_app_x'] },
        { service: 'notify.mobile_app_x' },
        { data: { push: true } },
        { recipients: ['erika'] },
        { expected_revision: 0 },
        { personal_device_id: 'Dev 1' },
        { personal_device_id: { id: 'dev-1' } },
        { personal_device_id: null },
      ].map((extra) => ({ type: 'domusos/profile/test_self', ...extra })),
      ...[
        { user_id: 'someone' },
        { person_id: 'erika' },
        { include_devices: true },
        { include_preferences: true },
        { filter: 'ready' },
        { target: 'notify.mobile_app_x' },
        { service: 'notify.mobile_app_x' },
        { device_id: 'dev-1' },
        { options: { devices: true } },
      ].map((extra) => ({ type: 'domusos/profile/list_recipients', ...extra })),
    ];

    for (const message of accepted) {
      expect(isValidHostProfileMessage(message)).toBe(true);
      expect(isValidAppProfileMessage(message)).toBe(true);
      expect(validatePanelApiMessage(message)).toBe(true);
    }
    for (const message of refused) {
      expect(isValidHostProfileMessage(message)).toBe(false);
      expect(isValidAppProfileMessage(message)).toBe(false);
      expect(validatePanelApiMessage(message)).toBe(false);
    }
  });
});
