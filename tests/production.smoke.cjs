const { test, expect } = require('@playwright/test');

/*
 * The distributed build must start: Home, /consumi and /consumi/energia from
 * the files of dist/ (playwright.production.config.cjs), with the production
 * Content Security Policy. Home Assistant is simulated on the same origin as
 * the app, so the real `connect-src 'self'` allows its websocket. Any page
 * error, any "Contenuto non caricato" or an empty root fails the test.
 */

const plant = {
  grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { net_power: 'sensor.grid_power' }, sign_convention: 'positive_import' } }] },
  solar: { devices: [{ id: 'solar-1', name: null, ha_device_id: null, power: { sensors: { production_power: 'sensor.pv' } } }] },
};
const modules = { grid: plant.grid.devices[0].power, solar: plant.solar.devices[0].power };

const quantity = (entity, value) => ({
  status: 'ok', value, unit: 'W', source: 'measured', entity_ids: [entity], reason: null, freshness: 'fresh',
  reported_at: new Date(Date.now() - 5000).toISOString(), stale_after: 1800, origin: 'device', partial_value: null, coverage: { contributing: 1, configured: 1 },
});
const module = (role, entity, value, extra = {}) => {
  const quantities = { [role]: quantity(entity, value) };
  return {
    status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities, total: null,
    devices: [{ device_id: `${entity}-device`, name: null, status: 'online', complete: true, freshness: 'fresh', sign_convention: null, reason: null, quantities }],
    ...extra,
  };
};

const ENERGY_STATE = () => ({
  configured: true, load_error: false, available: true, profile_revision: 1, observed_at: new Date().toISOString(),
  modules: {
    grid: module('net_power', 'sensor.grid_power', 400, { sign_convention: 'positive_import' }),
    solar: module('production_power', 'sensor.pv', 1800),
  },
  absent_modules: ['home', 'battery', 'wallbox'], offline_modules: [], unsupported_modules: {}, tariff: null,
  home_consumption: { ...quantity('sensor.grid_power', 2200), source: 'derived', origin: null, coverage: null },
});

const PROFILE = {
  profile: { revision: 1, updated_at: null, load_error: false, modules, tariff: null },
  profile_v2: { schema: 'domusos-energy-profile', version: 2, revision: 1, updated_at: null, load_error: false, migrated_from: null, plant, tariff: null, retired_device_ids: [] },
  v1_compatible: true,
  runtime: { supported: true, reason: null, unsupported_modules: {} },
  legacy_v1: null,
  module_status: { grid: 'online', solar: 'online', home: 'absent', battery: 'absent', wallbox: 'absent' },
  energy_meters: { recorder: 'available', verification: 'complete', meters: {} },
};

async function simulateHomeAssistant(page, origin) {
  await page.routeWebSocket(`${origin.replace(/^http/, 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities': {
            reply(null);
            const now = Date.now() / 1000;
            const state = (value) => ({ s: String(value), a: { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' }, c: 'ctx', lc: now, lu: now });
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: { 'sensor.grid_power': state(400), 'sensor.pv': state(1800) } } }));
            break;
          }
          case 'auth/current_user':
            reply({ id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] });
            break;
          case 'config/entity_registry/list_for_display':
            reply({ entity_categories: {}, entities: [] });
            break;
          case 'config/area_registry/list':
          case 'config/entity_registry/list':
          case 'config/device_registry/list':
            reply([]);
            break;
          case 'domusos/energy/get_state':
            reply(ENERGY_STATE());
            break;
          case 'domusos/energy/get_profile':
            reply(PROFILE);
            break;
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript((hassUrl) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
  }, origin);
}

/** Client-side navigation, as the app's own links do: the production assets stay relative to the app root. */
const navigate = (page, path) => page.evaluate((target) => {
  window.history.pushState({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, path);

/** The surface ran without errors: checked first, so a crash reports its cause. */
async function expectHealthy(page, problems, surface) {
  // Let the lazy chunks of the surface load and run.
  await page.waitForLoadState('networkidle');
  expect(problems, `${surface}: ${problems.join('\n')}`).toEqual([]);
  await expect(page.getByText('Contenuto non caricato'), `${surface} shows the chunk error screen`).toHaveCount(0);
  await expect(page.locator('#root > *').first()).toBeVisible();
}

test('the production build starts and renders Home, Consumi and Energia', async ({ page, baseURL }) => {
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    // A failed lazy chunk is reported to the console by the app's error boundary.
    if (message.type() === 'error' && /Lazy-loaded UI failed|ReferenceError|TypeError|SyntaxError|Content Security Policy/.test(message.text())) {
      problems.push(`console: ${message.text().split('\n')[0]}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && /\/assets\//.test(response.url())) problems.push(`HTTP ${response.status()} ${response.url()}`);
  });
  const origin = new URL(baseURL).origin;
  await simulateHomeAssistant(page, origin);

  await page.goto('/');
  await expectHealthy(page, problems, 'Home');
  await expect(page.getByRole('main').first()).toBeVisible();

  await navigate(page, '/consumi');
  await expectHealthy(page, problems, '/consumi');
  await expect(page.getByRole('heading', { name: 'Consumi' }).first()).toBeVisible();

  await navigate(page, '/consumi/energia');
  await expectHealthy(page, problems, '/consumi/energia');
  await expect(page.getByRole('list', { name: 'Componenti dell’impianto' })).toBeVisible();
});
