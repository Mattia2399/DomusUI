import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type HassLike = {
  panels?: Record<string, unknown>;
  userData?: Record<string, unknown>;
};

type BridgePanelForTest = HTMLElement & {
  hass: HassLike;
  _iframe: HTMLIFrameElement | null;
  _onMessage: (event: MessageEvent) => Promise<void>;
};

type PanelBridgeTestApi = {
  resolveNativeHomePath: (hass: HassLike | null | undefined) => string;
  navigateToNativeHome: (
    hostPanel: { navigate?: (path: string) => void } | null,
    hass: HassLike,
    browserNavigate?: (path: string) => void,
  ) => string;
  HaDashboardBuilderPanel: CustomElementConstructor;
};

function loadPanelBridgeForTest(): PanelBridgeTestApi {
  const documentation = readFileSync(
    resolve(process.cwd(), 'docs/home-assistant-panel-bridge.md'),
    'utf8',
  );
  const match = documentation.match(/```js\r?\n([\s\S]*?)\r?\n```/);
  if (!match) throw new Error('Panel bridge source not found.');
  const instrumented = match[1].replace(
    'customElements.define("ha-dashboard-builder-panel", HaDashboardBuilderPanel);',
    'return { resolveNativeHomePath, navigateToNativeHome, HaDashboardBuilderPanel };',
  );
  return Function(instrumented)() as PanelBridgeTestApi;
}

const bridge = loadPanelBridgeForTest();

afterEach(() => {
  document.body.replaceChildren();
});

describe('Home Assistant panel host navigation', () => {
  it('prefers the native Home panel, then supports legacy Lovelace', () => {
    expect(bridge.resolveNativeHomePath({
      panels: { home: {}, lovelace: {} },
    })).toBe('/home/overview');
    expect(bridge.resolveNativeHomePath({
      panels: { lovelace: {} },
    })).toBe('/lovelace');
  });

  it('uses an actually registered native panel when Home and Lovelace are absent', () => {
    expect(bridge.resolveNativeHomePath({
      panels: {
        domusos: { component_name: 'ha-panel-custom', url_path: 'domusos' },
        custom_dashboard: { component_name: 'custom', url_path: 'custom-dashboard' },
        history: { component_name: 'ha-panel-history', url_path: 'history' },
      },
    })).toBe('/history');
  });

  it('uses hostPanel.navigate without changing default_panel', () => {
    const navigate = vi.fn();
    const browserNavigate = vi.fn();
    const hass = {
      panels: { home: {}, lovelace: {} },
      userData: { default_panel: 'domusos', vibrate: true },
    };

    expect(bridge.navigateToNativeHome({ navigate }, hass, browserNavigate)).toBe('/home/overview');
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/home/overview');
    expect(browserNavigate).not.toHaveBeenCalled();
    expect(hass.userData).toEqual({ default_panel: 'domusos', vibrate: true });
  });

  it('falls back to a real browser navigation when the host API is unavailable or fails', () => {
    const browserNavigate = vi.fn();
    expect(bridge.navigateToNativeHome(null, { panels: { lovelace: {} } }, browserNavigate)).toBe('/lovelace');
    expect(browserNavigate).toHaveBeenLastCalledWith('/lovelace');

    const brokenHost = { navigate: vi.fn(() => { throw new Error('router unavailable'); }) };
    expect(bridge.navigateToNativeHome(brokenHost, { panels: { home: {} } }, browserNavigate)).toBe('/home/overview');
    expect(browserNavigate).toHaveBeenLastCalledWith('/home/overview');
  });

  it('accepts the iframe command once and ignores a rapid duplicate', async () => {
    const elementName = `ha-dashboard-builder-panel-test-${Date.now()}`;
    customElements.define(elementName, bridge.HaDashboardBuilderPanel);
    const hostPanel = document.createElement('ha-panel-custom') as HTMLElement & {
      navigate: ReturnType<typeof vi.fn>;
    };
    hostPanel.navigate = vi.fn();
    const panel = document.createElement(elementName) as BridgePanelForTest;
    panel.hass = { panels: { home: {} }, userData: { default_panel: 'domusos' } };
    hostPanel.append(panel);
    document.body.append(hostPanel);

    const iframe = panel.querySelector('iframe');
    expect(iframe?.contentWindow).toBeTruthy();
    const event = {
      origin: window.location.origin,
      source: iframe!.contentWindow,
      data: { type: 'ha-panel-navigate-home' },
    } as unknown as MessageEvent;

    await panel._onMessage(event);
    await panel._onMessage(event);

    expect(hostPanel.navigate).toHaveBeenCalledOnce();
    expect(hostPanel.navigate).toHaveBeenCalledWith('/home/overview');
  });
});
