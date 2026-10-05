const { test, expect } = require('@playwright/test');

/*
 * Energy page against a simulated Home Assistant: the websocket answers the
 * auth handshake, streams the bound sensors through subscribe_entities and
 * serves the domusos/energy commands for a complete installation.
 */

const HA = 'http://homeassistant.local:8123';
const SENSORS = {
  'sensor.grid_power': 2900,
  'sensor.pv_power': 4300,
  'sensor.battery_power': 900,
  'sensor.battery_soc': 54,
  'sensor.wallbox_power': 7400,
};

function quantity(value, entity, extra = {}) {
  return {
    status: 'ok',
    value,
    unit: entity === 'sensor.battery_soc' ? '%' : 'W',
    source: 'measured',
    entity_ids: [entity],
    reason: null,
    freshness: 'fresh',
    reported_at: new Date(Date.now() - 5000).toISOString(),
    stale_after: entity === 'sensor.battery_soc' ? 10800 : 1800,
    ...extra,
  };
}

function energyState(values, { staleSolar = false } = {}) {
  const solarExtra = staleSolar
    ? { freshness: 'stale', reported_at: new Date(Date.now() - 35 * 60_000).toISOString() }
    : {};
  const module = (quantities, freshness = 'fresh') => ({ status: 'online', complete: true, freshness, sign_convention: null, quantities });
  const grid = values['sensor.grid_power'];
  const battery = values['sensor.battery_power'];
  return {
    configured: true,
    load_error: false,
    available: true,
    profile_revision: 3,
    observed_at: new Date().toISOString(),
    modules: {
      grid: { ...module({ net_power: quantity(grid, 'sensor.grid_power') }), sign_convention: 'positive_import' },
      solar: module({ production_power: quantity(values['sensor.pv_power'], 'sensor.pv_power', solarExtra) }, staleSolar ? 'stale' : 'fresh'),
      battery: {
        ...module({
          state_of_charge: quantity(values['sensor.battery_soc'], 'sensor.battery_soc'),
          net_power: quantity(battery, 'sensor.battery_power'),
        }),
        sign_convention: 'positive_discharge',
      },
      wallbox: module({ charging_power: quantity(values['sensor.wallbox_power'], 'sensor.wallbox_power') }),
    },
    absent_modules: ['home'],
    offline_modules: [],
    home_consumption: { ...quantity(grid + values['sensor.pv_power'] + battery, 'sensor.grid_power'), source: 'derived', stale_after: null },
    tariff: { scheme: 'three_band', band: 'F2', band_label: 'F2', price: 0.27, export_price: 0.09, vat_percent: 10, currency: 'EUR' },
  };
}

const entity = (state, unit) => ({ s: String(state), a: { unit_of_measurement: unit, device_class: unit === '%' ? 'battery' : 'power' }, c: 'ctx', lc: Date.now() / 1000, lu: Date.now() / 1000 });

/** Simulated Home Assistant; `home.update(id, value)` streams a new sensor state. */
async function simulateHomeAssistant(page, options = {}) {
  const values = { ...SENSORS };
  const home = { energyRequests: 0, socket: null, entitiesId: null };
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    home.socket = ws;
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2025.1.0' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2025.1.0' }));
            break;
          case 'subscribe_entities':
            home.entitiesId = message.id;
            reply(null);
            ws.send(JSON.stringify({
              id: message.id,
              type: 'event',
              event: { a: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, entity(value, id === 'sensor.battery_soc' ? '%' : 'W')])) },
            }));
            break;
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
            home.energyRequests += 1;
            reply(energyState(values, options));
            break;
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  home.update = (id, value) => {
    values[id] = value;
    home.socket.send(JSON.stringify({ id: home.entitiesId, type: 'event', event: { c: { [id]: { '+': { s: String(value), lu: Date.now() / 1000 } } } } }));
  };
  await page.addInitScript((hassUrl) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    // Stored OAuth tokens make the dashboard reconnect on load, as after a login.
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
  }, HA);
  return home;
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 960 }]) {
  test(`configured Energy page at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await simulateHomeAssistant(page);
    const render = page.waitForResponse((response) => /grid-solar-battery-ev\.(avif|webp|png)$/.test(response.url()));
    await page.goto('/consumi/energia');

    const hero = page.getByTestId('energy-hero');
    await expect(hero.getByRole('heading', { name: 'Consumo della casa' })).toBeVisible();
    await expect(hero.getByText('8,1 kW')).toBeVisible();
    await expect(hero.getByText('Calcolato da rete, fotovoltaico e batteria')).toBeVisible();
    // Solar, battery discharge and grid import feed only the home: the split is calculated.
    await expect(hero.getByText('Calcolata dai contatori')).toBeVisible();
    await expect(hero.getByRole('list', { name: 'Da dove arriva l’energia della casa' }).getByRole('listitem')).toHaveCount(3);
    // Chromium supports AVIF, so the compressed render is the one downloaded.
    expect((await render).url()).toMatch(/\.avif$/);

    const components = page.getByRole('list', { name: 'Componenti dell’impianto' });
    await expect(components.getByRole('listitem')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Impostazioni energia' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await components.getByRole('button', { name: /Rete/ }).click();
    const grid = page.getByRole('dialog', { name: 'Rete' });
    await expect(grid.getByText('Costo attuale stimato, IVA inclusa')).toBeVisible();
    await expect(grid.getByText(/≈\s0,86\s€\/h/)).toBeVisible();
    await expect(grid.getByText('Flussi · calcolati')).toBeVisible();
    await grid.getByRole('button', { name: /Chiudi/ }).click();
    await expect(grid).toBeHidden();
  });
}

test('live sensor changes refresh the projection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await simulateHomeAssistant(page);
  await page.goto('/consumi/energia');
  const hero = page.getByTestId('energy-hero');
  await expect(hero.getByText('8,1 kW')).toBeVisible();
  const before = home.energyRequests;

  home.update('sensor.pv_power', 5300);

  await expect(hero.getByText('9,1 kW')).toBeVisible();
  expect(home.energyRequests).toBeGreaterThan(before);
});

test('stale values keep their reading and say since when', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await simulateHomeAssistant(page, { staleSolar: true });
  await page.goto('/consumi/energia');

  await expect(page.getByTestId('energy-hero').getByText('Dati non aggiornati')).toBeVisible();
  const solar = page.getByRole('list', { name: 'Componenti dell’impianto' }).getByRole('button', { name: /Fotovoltaico/ });
  await expect(solar.getByText('4,3 kW')).toBeVisible();
  await expect(solar.getByText('Non aggiornato da 35 min')).toBeVisible();
});
