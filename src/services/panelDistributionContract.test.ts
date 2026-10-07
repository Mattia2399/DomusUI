import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HA_PANEL_ALLOWED_API_TYPES, isValidEnergyMessage as isValidAppEnergyMessage } from '../hooks/useHaPanelBridgeConnection';

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
});
