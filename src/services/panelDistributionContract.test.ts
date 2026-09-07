import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PANEL_ELEMENT_NAME = 'ha-dashboard-builder-panel';

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('Home Assistant panel distribution contract', () => {
  it('keeps the HACS integration aligned with the registered custom element', () => {
    const installation = readProjectFile('docs/installation-beta.md');
    const bridge = readProjectFile('docs/home-assistant-panel-bridge.md');
    const integrationConstants = readProjectFile('custom_components/domusos/const.py');
    const integrationSetup = readProjectFile('custom_components/domusos/__init__.py');
    const hacsManifest = JSON.parse(readProjectFile('hacs.json')) as Record<string, unknown>;
    const viteConfig = readProjectFile('vite.config.ts');

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
    expect(bridge).toContain(`customElements.define("${PANEL_ELEMENT_NAME}"`);
    expect(bridge).toContain('"config/area_registry/list"');
    expect(viteConfig).toContain("fileName: 'ha-dashboard-builder-panel.js'");
  });
});
