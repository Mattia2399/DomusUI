import { afterEach, describe, expect, it, vi } from 'vitest';

/* Public files keep the app's folder even after the router changes the page URL. */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  window.history.replaceState({}, '', '/');
});

describe('public asset URLs', () => {
  it('resolve a relative base from the page the app started on, not the current route', async () => {
    vi.stubEnv('BASE_URL', './');
    window.history.replaceState({}, '', '/domusos_static/index.html?v=1');
    const { captureAppBase, publicAssetUrl } = await import('./publicAssets');
    captureAppBase();
    // Outside Home Assistant the router moves the page to a nested route.
    window.history.pushState({}, '', '/consumi/energia');

    expect(publicAssetUrl('images/energy/mobile/grid-only.png')).toBe(`${window.location.origin}/domusos_static/images/energy/mobile/grid-only.png`);
  });

  it('keep an absolute base as it is', async () => {
    vi.stubEnv('BASE_URL', '/');
    window.history.replaceState({}, '', '/consumi/energia');
    const { captureAppBase, publicAssetUrl } = await import('./publicAssets');
    captureAppBase();

    expect(publicAssetUrl('images/energy/mobile/grid-only.png')).toBe('/images/energy/mobile/grid-only.png');
  });
});
