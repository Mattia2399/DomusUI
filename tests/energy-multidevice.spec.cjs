const { test, expect } = require('@playwright/test');

/*
 * Energy page with several inverters, batteries and wallboxes against a
 * simulated Home Assistant: get_state carries the device detail, get_profile an
 * Energy Profile v2 that v1 cannot hold, and save_profile accepts profile_v2.
 */

const HA = 'http://homeassistant.local:8123';
const SENSORS = {
  'sensor.grid_power': 1500,
  'sensor.inv1': 2000,
  'sensor.inv2': 1500,
  'sensor.inv3': 'unavailable',
  'sensor.b1_soc': 80,
  'sensor.b2_soc': 40,
  'sensor.b1': 1000,
  'sensor.b2': 400,
  'sensor.wb1': 7400,
  'sensor.wb2': 3700,
};

const q = (value, entity, extra = {}) => ({
  status: value === null ? 'unavailable' : 'ok',
  value,
  unit: /soc/.test(entity) ? '%' : 'W',
  source: value === null ? null : 'measured',
  entity_ids: [entity],
  reason: value === null ? 'state_unavailable' : null,
  freshness: value === null ? null : 'fresh',
  reported_at: value === null ? null : new Date(Date.now() - 5000).toISOString(),
  stale_after: value === null ? null : 1800,
  origin: 'device',
  partial_value: null,
  coverage: { contributing: value === null ? 0 : 1, configured: 1 },
  ...extra,
});
const sum = (value, entities, contributing, extra = {}) => ({
  ...q(value, entities[0], extra),
  entity_ids: entities,
  source: 'derived',
  origin: 'devices_sum',
  coverage: { contributing, configured: entities.length },
  ...(value === null ? { status: 'unavailable', reason: 'partial_devices', source: 'derived' } : {}),
  ...extra,
});
const device = (id, name, quantities, extra = {}) => ({
  device_id: id, name, status: 'online', complete: true, freshness: 'fresh', sign_convention: null, reason: null, quantities, ...extra,
});
const module = (quantities, devices, extra = {}) => ({
  status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities, devices, total: null, ...extra,
});

function energyState() {
  return {
    configured: true,
    load_error: false,
    available: true,
    profile_revision: 5,
    observed_at: new Date().toISOString(),
    modules: {
      grid: module({ net_power: q(1500, 'sensor.grid_power') }, [device('grid-1', null, { net_power: q(1500, 'sensor.grid_power') })], { sign_convention: 'positive_import' }),
      solar: module(
        { production_power: sum(null, ['sensor.inv1', 'sensor.inv2', 'sensor.inv3'], 2, { partial_value: 3500 }) },
        [
          device('solar-1', 'Inverter Tetto', { production_power: q(2000, 'sensor.inv1') }),
          device('solar-2', 'Inverter Pergola', { production_power: q(1500, 'sensor.inv2') }),
          device('solar-3', 'Inverter Garage', { production_power: q(null, 'sensor.inv3') }, { status: 'offline', complete: false, freshness: null, reason: 'sensors_unavailable' }),
        ],
        { complete: false },
      ),
      battery: module(
        {
          state_of_charge: { ...q(66.667, 'sensor.b1_soc'), entity_ids: ['sensor.b1_soc', 'sensor.b2_soc'], source: 'derived', origin: 'devices_weighted_usable', coverage: { contributing: 2, configured: 2 } },
          net_power: sum(600, ['sensor.b1', 'sensor.b2'], 2),
        },
        [
          device('battery-1', 'Batteria Garage', { state_of_charge: q(80, 'sensor.b1_soc'), net_power: q(1000, 'sensor.b1') }, { sign_convention: 'positive_discharge' }),
          device('battery-2', 'Batteria Cantina', { state_of_charge: q(40, 'sensor.b2_soc'), net_power: q(-400, 'sensor.b2') }, { sign_convention: 'positive_charge' }),
        ],
      ),
      wallbox: module(
        { charging_power: sum(11100, ['sensor.wb1', 'sensor.wb2'], 2) },
        [device('wallbox-1', 'Wallbox Box', { charging_power: q(7400, 'sensor.wb1') }), device('wallbox-2', 'Wallbox Cortile', { charging_power: q(3700, 'sensor.wb2') })],
      ),
    },
    absent_modules: ['home'],
    offline_modules: [],
    unsupported_modules: {},
    home_consumption: { ...q(null, 'sensor.grid_power'), source: 'derived', reason: 'source_unavailable', origin: null, coverage: null },
    tariff: null,
  };
}

const PLANT = {
  grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { net_power: 'sensor.grid_power' }, sign_convention: 'positive_import' } }] },
  solar: {
    devices: [
      { id: 'solar-1', name: 'Inverter Tetto', ha_device_id: 'aa11', power: { sensors: { production_power: 'sensor.inv1' } }, energy: { production_energy: ['sensor.inv1_energy'] } },
      { id: 'solar-2', name: 'Inverter Pergola', ha_device_id: 'bb22', power: { sensors: { production_power: 'sensor.inv2' } } },
      { id: 'solar-3', name: 'Inverter Garage', ha_device_id: null, power: { sensors: { production_power: 'sensor.inv3' } } },
    ],
  },
  battery: {
    devices: [
      { id: 'battery-1', name: 'Batteria Garage', ha_device_id: null, capacity: { nominal_kwh: 10, usable_kwh: 10 }, power: { sensors: { state_of_charge: 'sensor.b1_soc', net_power: 'sensor.b1' }, sign_convention: 'positive_discharge' } },
      { id: 'battery-2', name: 'Batteria Cantina', ha_device_id: null, capacity: { nominal_kwh: 5, usable_kwh: 5 }, power: { sensors: { state_of_charge: 'sensor.b2_soc', net_power: 'sensor.b2' }, sign_convention: 'positive_charge' } },
    ],
  },
  wallbox: {
    devices: [
      { id: 'wallbox-1', name: 'Wallbox Box', ha_device_id: null, power: { sensors: { charging_power: 'sensor.wb1' } } },
      { id: 'wallbox-2', name: 'Wallbox Cortile', ha_device_id: null, power: { sensors: { charging_power: 'sensor.wb2' } } },
    ],
  },
};

function profileResult(plant, revision) {
  return {
    profile: null,
    profile_v2: { schema: 'domusos-energy-profile', version: 2, revision, updated_at: null, load_error: false, migrated_from: null, plant, tariff: null, retired_device_ids: [] },
    v1_compatible: false,
    runtime: { supported: true, reason: null, unsupported_modules: {} },
    legacy_v1: null,
    module_status: { grid: 'online', solar: 'online', home: 'absent', battery: 'online', wallbox: 'online' },
    energy_meters: {
      recorder: 'available', verification: 'complete',
      meters: { 'sensor.inv1_energy': { statistic_id: 'sensor.inv1_energy', status: 'valid', reason: null, source: 'recorder', unit: 'kWh', has_sum: true, entity_id: 'sensor.inv1_energy', long_term: true } },
    },
  };
}

const entity = (state, unit) => ({ s: String(state), a: { unit_of_measurement: unit, device_class: unit === '%' ? 'battery' : 'power' }, c: 'ctx', lc: Date.now() / 1000, lu: Date.now() / 1000 });

async function simulateHomeAssistant(page) {
  const home = { saves: [], plant: structuredClone(PLANT), revision: 5 };
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities':
            reply(null);
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: Object.fromEntries(Object.entries(SENSORS).map(([id, value]) => [id, entity(value, /soc/.test(id) ? '%' : 'W')])) } }));
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
            reply(energyState());
            break;
          case 'domusos/energy/get_profile':
            reply(profileResult(home.plant, home.revision));
            break;
          case 'domusos/energy/discover':
            // A suggestion that would replace the plant: shown nowhere, applied never.
            reply({ energy_dashboard: 'used', suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], unassigned: [], candidates: {}, v2: { devices: [], totals: [], meters: {}, ambiguous: [], suggested_plant: { grid: { devices: [] } }, verification: 'complete', recorder: 'available', profile: { configured: true, revision: 5 }, low_confidence: [] } });
            break;
          case 'domusos/energy/save_profile':
            home.saves.push(message);
            if (message.expected_revision !== home.revision) {
              ws.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code: 'revision_conflict', message: 'Energy profile changed' } }));
              break;
            }
            home.plant = message.profile_v2.plant;
            home.revision += 1;
            reply(profileResult(home.plant, home.revision));
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
  }, HA);
  return home;
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

const shoot = async (page, name) => {
  if (process.env.ENERGY_SCREENSHOTS) await page.screenshot({ path: `${process.env.ENERGY_SCREENSHOTS}/${name}.png`, fullPage: false });
};

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 960 }]) {
  test(`multi-device Energy page at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await simulateHomeAssistant(page);
    await page.goto('/consumi/energia');

    const components = page.getByRole('list', { name: 'Componenti dell’impianto' });
    await expect(components.getByRole('listitem')).toHaveCount(4);
    const solar = components.getByRole('button', { name: /Fotovoltaico/ });
    // Two of three inverters report: their 3,5 kW is never shown as the production.
    await expect(solar.getByText('2 di 3 dispositivi')).toBeVisible();
    // A long caption never pushes a tile over its neighbour.
    const [solarBox, gridBox] = await Promise.all([solar.boundingBox(), components.getByRole('button', { name: /Rete/ }).boundingBox()]);
    // Chromium/font rendering can round the shared grid edge differently by a
    // fraction of a pixel across operating systems; a real overlap is larger.
    if (solarBox && gridBox && Math.abs(solarBox.y - gridBox.y) < 4) expect(solarBox.x + solarBox.width).toBeLessThanOrEqual(gridBox.x + 2);
    await expect(solar.getByText('3,5 kW')).toHaveCount(0);
    await expect(components.getByRole('button', { name: /Batteria/ }).getByText('67%')).toBeVisible();
    await expect(components.getByRole('button', { name: /Wallbox/ }).getByText('11,1 kW')).toBeVisible();
    await expect(page.getByTestId('energy-hero').getByText('Dati parziali')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shoot(page, `multidevice-${viewport.width}`);

    await solar.click();
    const sheet = page.getByRole('dialog', { name: 'Fotovoltaico' });
    await expect(sheet.getByText('Dai dispositivi disponibili')).toBeVisible();
    await expect(sheet.getByText('3,5 kW · 2 di 3')).toBeVisible();
    const devices = sheet.getByRole('region', { name: 'Dispositivi' });
    await expect(devices.getByText('Inverter Tetto')).toBeVisible();
    await expect(devices.locator('summary', { hasText: 'Inverter Garage' })).toContainText('Offline');
    // Each inverter opens on its own sensors, keyboard included.
    await devices.locator('summary', { hasText: 'Inverter Pergola' }).focus();
    await page.keyboard.press('Enter');
    await expect(devices.getByText('sensor.inv2')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shoot(page, `multidevice-sheet-${viewport.width}`);
    await sheet.getByRole('button', { name: /Chiudi/ }).click();
    await expect(sheet).toBeHidden();
  });
}

test('the v2 settings save the whole plant through Home Assistant', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const home = await simulateHomeAssistant(page);
  await page.goto('/consumi/energia');
  await page.getByRole('button', { name: 'Impostazioni energia' }).click();

  const plant = page.getByRole('region', { name: 'Impianto' });
  await expect(plant.getByRole('region', { name: 'Fotovoltaico' }).getByText('3 dispositivi')).toBeVisible();
  await plant.getByRole('button', { name: 'Modifica Inverter Pergola' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill('Inverter Pergola sud');
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'multidevice-settings-1440');
  await plant.getByRole('button', { name: 'Salva impianto' }).click();
  await expect(plant.getByText('Impianto salvato.')).toBeVisible();

  expect(home.saves).toHaveLength(1);
  const [save] = home.saves;
  expect(Object.keys(save).sort()).toEqual(['expected_revision', 'id', 'profile_v2', 'type']);
  expect(save.expected_revision).toBe(5);
  expect(save.profile_v2.plant.solar.devices.map((device) => device.name)).toEqual(['Inverter Tetto', 'Inverter Pergola sud', 'Inverter Garage']);
  // Untouched devices, meters and ids travel unchanged; the tariff key is left out, so it is kept.
  expect(save.profile_v2.plant.battery).toEqual(PLANT.battery);
  expect(save.profile_v2.plant.solar.devices[0]).toEqual(PLANT.solar.devices[0]);
  expect('tariff' in save.profile_v2).toBe(false);
  // The discovery suggestion was never applied.
  expect(save.profile_v2.plant.grid).toEqual(PLANT.grid);
});
