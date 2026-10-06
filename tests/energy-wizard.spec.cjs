const { test, expect } = require('@playwright/test');

/*
 * Energy setup wizard against a simulated Home Assistant: first setup from the
 * discovery, rediscovery on a configured Energy Profile v2 plant, meter choice
 * in the sensor picker, the saved payload, a revision conflict, and an older
 * integration that stores v1 modules only.
 */

const HA = 'http://homeassistant.local:8123';
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 960 }];

const POWER = { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' };
const ENERGY = { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' };
const ENTITIES = {
  'sensor.grid_power': [1500, POWER, 'Contatore rete'],
  'sensor.grid_import_kwh': [5321, ENERGY, 'Energia prelevata'],
  'sensor.grid_export_kwh': [812, ENERGY, 'Energia immessa'],
  'sensor.inv1': [2000, POWER, 'Inverter Tetto potenza'],
  'sensor.inv1_energy': [9000, ENERGY, 'Inverter Tetto energia'],
  'sensor.inv2': [1500, POWER, 'Inverter Pergola potenza'],
  'sensor.inv2_energy': [4000, ENERGY, 'Inverter Pergola energia'],
  'sensor.house': [900, POWER, 'Consumo casa'],
  'sensor.outdoor_temp': [18, { unit_of_measurement: '°C', device_class: 'temperature', state_class: 'measurement' }, 'Temperatura esterna'],
};

const STORED = {
  grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { net_power: 'sensor.grid_power' }, sign_convention: 'positive_import' } }] },
  solar: { devices: [{ id: 'solar-1', name: 'Inverter Tetto', ha_device_id: 'aa11', power: { sensors: { production_power: 'sensor.inv1' } } }] },
};

const meter = (id, status, reason = null) => ({ statistic_id: id, status, reason, source: 'recorder', unit: 'kWh', has_sum: true, entity_id: id, long_term: status === 'valid' });

const proposal = (n, extra = {}) => ({
  key: `solar:dev:inv${n}`, module: 'solar', status: 'new', device_id: `solar-${n}`, ha_device_id: `inv${n}`, name: n === 1 ? 'Inverter Tetto' : 'Inverter Pergola',
  integration: 'fronius', confidence: 'high', eligible: true,
  power: [{ role: 'production_power', entity_id: `sensor.inv${n}`, confidence: 'high', evidence: ['energy_dashboard_device'], sign_convention: null, requires: [] }],
  energy: [{ role: 'production_energy', statistic_ids: [`sensor.inv${n}_energy`], confidence: 'high', evidence: ['energy_dashboard'], statuses: [n === 1 ? 'valid' : 'pending'] }],
  warnings: [],
  ...extra,
});

function discoveryV2(configured) {
  const devices = configured
    ? [
        proposal(1, { status: 'update', device_id: 'solar-1', eligible: false, additions: [{ kind: 'energy', role: 'production_energy', ids: ['sensor.inv1_energy'] }], corrections: [] }),
        proposal(2),
        { key: 'grid:configured:grid-1', module: 'grid', status: 'configured', device_id: 'grid-1', name: null, detected: true },
      ]
    : [
        proposal(1),
        proposal(2),
        { key: 'grid:dev:meter', module: 'grid', status: 'new', device_id: 'grid-1', ha_device_id: 'meter', name: 'Contatore', confidence: 'high', eligible: true,
          power: [{ role: 'net_power', entity_id: 'sensor.grid_power', confidence: 'high', evidence: ['energy_dashboard'], sign_convention: 'positive_import', requires: [] }] },
      ];
  return {
    energy_dashboard: 'used', suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], unassigned: [], candidates: {},
    v2: {
      profile: { configured, revision: configured ? 4 : 0 }, verification: 'complete', recorder: 'available', devices,
      totals: [], ambiguous: [], low_confidence: [],
      // The whole-plant suggestion is never applied as such.
      suggested_plant: { home: { devices: [] } },
      meters: { 'sensor.inv1_energy': meter('sensor.inv1_energy', 'valid'), 'sensor.inv2_energy': meter('sensor.inv2_energy', 'pending', 'awaiting_first_statistics') },
    },
  };
}

const quantity = (entity) => ({
  status: 'ok', value: 1000, unit: 'W', source: 'measured', entity_ids: [entity], reason: null, freshness: 'fresh',
  reported_at: new Date(Date.now() - 5000).toISOString(), stale_after: 1800, origin: 'device', partial_value: null, coverage: { contributing: 1, configured: 1 },
});

function energyState(home) {
  const plant = home.v2 ? home.plant : Object.fromEntries(Object.entries(home.modules).map(([id, power]) => [id, { devices: [{ id: `${id}-1`, name: null, power }] }]));
  const present = Object.keys(plant);
  return {
    configured: present.length > 0, load_error: false, available: present.length > 0, profile_revision: home.revision, observed_at: new Date().toISOString(),
    modules: Object.fromEntries(present.map((id) => {
      const quantities = Object.fromEntries(plant[id].devices.flatMap((device) => Object.entries(device.power?.sensors ?? {}).map(([role, entity]) => [role, quantity(entity)])));
      return [id, {
        status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities, total: null,
        devices: plant[id].devices.map((device) => ({ device_id: device.id, name: device.name, status: 'online', complete: true, freshness: 'fresh', sign_convention: null, reason: null, quantities })),
      }];
    })),
    absent_modules: ['grid', 'solar', 'home', 'battery', 'wallbox'].filter((id) => !present.includes(id)),
    offline_modules: [], unsupported_modules: {}, home_consumption: null, tariff: null,
  };
}

function profileResult(home) {
  const status = Object.fromEntries(['grid', 'solar', 'home', 'battery', 'wallbox'].map((id) => [id, (home.v2 ? home.plant[id] : home.modules[id]) ? 'online' : 'absent']));
  if (!home.v2) return { profile: { revision: home.revision, updated_at: null, load_error: false, modules: home.modules, tariff: null }, module_status: status };
  return {
    profile: null,
    profile_v2: { schema: 'domusos-energy-profile', version: 2, revision: home.revision, updated_at: null, load_error: false, migrated_from: null, plant: home.plant, tariff: null, retired_device_ids: home.retired },
    v1_compatible: false,
    runtime: { supported: true, reason: null, unsupported_modules: {} },
    legacy_v1: null,
    module_status: status,
    energy_meters: { recorder: 'available', verification: 'complete', meters: {} },
  };
}

async function simulateHomeAssistant(page, { v2 = true, plant = {}, modules = {}, revision = 0, retired = [] } = {}) {
  const home = { v2, plant: structuredClone(plant), modules: structuredClone(modules), revision, retired, saves: [], requests: [] };
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        home.requests.push(message.type);
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities': {
            reply(null);
            const now = Date.now() / 1000;
            const states = Object.fromEntries(Object.entries(ENTITIES).map(([id, [state, attributes, name]]) => [id, { s: String(state), a: { ...attributes, friendly_name: name }, c: 'ctx', lc: now, lu: now }]));
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: states } }));
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
            reply(energyState(home));
            break;
          case 'domusos/energy/get_profile':
            reply(profileResult(home));
            break;
          case 'domusos/energy/discover':
            reply(home.v2 ? discoveryV2(Object.keys(home.plant).length > 0) : {
              energy_dashboard: 'not_configured', suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], unassigned: [], candidates: {},
            });
            break;
          case 'domusos/energy/save_profile':
            home.saves.push(message);
            if (message.expected_revision !== home.revision) {
              ws.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code: 'revision_conflict', message: 'Energy profile changed' } }));
              break;
            }
            if (home.v2) home.plant = message.profile_v2.plant;
            else home.modules = message.profile.modules;
            home.revision += 1;
            reply(profileResult(home));
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

const saves = (home) => home.saves.length;

async function openRediscovery(page) {
  await page.goto('/consumi/energia');
  await page.getByRole('button', { name: 'Impostazioni energia' }).click();
  await page.getByRole('button', { name: 'Aggiungi dispositivi o nuovo rilevamento' }).click();
  await expect(page.getByRole('heading', { name: 'Rilevamento' })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test(`first configuration from the discovery at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const home = await simulateHomeAssistant(page);
    await page.goto('/consumi/energia');
    await page.getByRole('button', { name: /Avvia rilevamento/ }).click();

    const fresh = page.getByRole('region', { name: 'Nuovi dispositivi' });
    await expect(fresh.getByText('Inverter Pergola')).toBeVisible();
    await expect(fresh.getByText(/In attesa delle prime statistiche/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shoot(page, `wizard-detect-${viewport.width}`);
    // Nothing is applied on its own.
    await expect(page.getByRole('button', { name: 'Conferma impianto' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Aggiungi i 3 dispositivi affidabili' }).click();
    await expect(fresh.getByRole('button', { name: /^Togli/ })).toHaveCount(3);
    await page.getByRole('button', { name: 'Avanti' }).click();

    await expect(page.getByRole('heading', { name: 'Dispositivi' })).toBeFocused();
    const solar = page.getByRole('region', { name: 'Fotovoltaico' });
    await expect(solar.getByRole('button', { name: /^Modifica Inverter/ })).toHaveCount(2);
    await solar.getByRole('button', { name: 'Modifica Inverter Pergola' }).click();
    await expect(page.getByRole('combobox', { name: 'Energia prodotta 1' })).toHaveValue('sensor.inv2_energy');
    await expectNoHorizontalOverflow(page);
    await shoot(page, `wizard-devices-${viewport.width}`);
    await page.getByRole('button', { name: 'Avanti' }).click();
    await page.getByRole('button', { name: 'Salta per ora' }).click();

    const changes = page.getByRole('region', { name: 'Modifiche' });
    await expect(changes.getByText('Fotovoltaico: aggiunto Inverter Pergola')).toBeVisible();
    await expect(changes.getByText('Segno: Valori positivi = prelievo dalla rete')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shoot(page, `wizard-summary-${viewport.width}`);
    expect(saves(home)).toBe(0);
    await page.getByRole('button', { name: /Salva impianto/ }).click();
    await expect(page.getByText(/Impianto salvato/)).toBeVisible();

    const [save] = home.saves;
    expect(Object.keys(save).sort()).toEqual(['expected_revision', 'id', 'profile_v2', 'type']);
    expect(save.expected_revision).toBe(0);
    expect('tariff' in save.profile_v2).toBe(false);
    expect(save.profile_v2.plant).toEqual({
      grid: { devices: [{ id: 'grid-1', name: 'Contatore', ha_device_id: 'meter', power: { sensors: { net_power: 'sensor.grid_power' }, sign_convention: 'positive_import' } }] },
      solar: { devices: [
        { id: 'solar-1', name: 'Inverter Tetto', ha_device_id: 'inv1', power: { sensors: { production_power: 'sensor.inv1' } }, energy: { production_energy: ['sensor.inv1_energy'] } },
        { id: 'solar-2', name: 'Inverter Pergola', ha_device_id: 'inv2', power: { sensors: { production_power: 'sensor.inv2' } }, energy: { production_energy: ['sensor.inv2_energy'] } },
      ] },
    });
    await expect(page.getByRole('list', { name: 'Componenti dell’impianto' })).toBeVisible();
  });

  test(`rediscovery and meter choice on a v2 plant at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const home = await simulateHomeAssistant(page, { plant: STORED, revision: 4, retired: ['solar-2'] });
    await openRediscovery(page);

    const changes = page.getByRole('region', { name: 'Proposte per i dispositivi configurati' });
    await expect(changes.getByText('Nuova sorgente')).toBeVisible();
    await changes.getByRole('button', { name: 'Applica' }).click();
    await page.getByRole('button', { name: 'Aggiungi Inverter Pergola' }).click();
    await expectNoHorizontalOverflow(page);
    await shoot(page, `wizard-rediscover-${viewport.width}`);
    await page.getByRole('button', { name: 'Avanti' }).click();

    // The grid meter is chosen in the picker: the power sensor and the temperature are not offered.
    await page.getByRole('region', { name: 'Rete' }).getByRole('button', { name: 'Modifica Rete 1' }).click();
    const picker = page.getByRole('combobox', { name: 'Energia prelevata 1' });
    await picker.fill('energia');
    const options = page.getByRole('listbox', { name: 'Sensori disponibili' });
    await expect(options.getByRole('option', { name: /Energia prelevata/ })).toBeVisible();
    await expect(options.getByRole('option', { name: /Contatore rete/ })).toHaveCount(0);
    await expect(options.getByRole('option', { name: /Inverter Tetto energia/ })).toHaveAttribute('aria-disabled', 'true');
    await expectNoHorizontalOverflow(page);
    await shoot(page, `wizard-picker-${viewport.width}`);
    await options.getByRole('option', { name: /Energia prelevata/ }).click();
    await expect(picker).toHaveValue('sensor.grid_import_kwh');
    await page.getByRole('button', { name: 'Avanti' }).click();

    await expect(page.getByRole('region', { name: 'Modifiche' }).getByText('Energia prelevata: aggiunti sensor.grid_import_kwh')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Da confermare' })).toHaveCount(0);
    await page.getByRole('button', { name: /Salva impianto/ }).click();
    // Back to the settings it was opened from, with the saved plant and the outcome.
    await expect(page.getByRole('status').getByText(/Impianto salvato/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Fotovoltaico' }).getByText('Inverter Pergola')).toBeVisible();

    const [save] = home.saves;
    expect(save.expected_revision).toBe(4);
    expect('tariff' in save.profile_v2).toBe(false);
    expect(save.profile_v2.plant).toEqual({
      grid: { devices: [{ ...STORED.grid.devices[0], energy: { import_energy: ['sensor.grid_import_kwh'] } }] },
      solar: { devices: [
        { ...STORED.solar.devices[0], energy: { production_energy: ['sensor.inv1_energy'] } },
        // solar-2 is retired: the new inverter never takes its id.
        { id: 'solar-3', name: 'Inverter Pergola', ha_device_id: 'inv2', power: { sensors: { production_power: 'sensor.inv2' } }, energy: { production_energy: ['sensor.inv2_energy'] } },
      ] },
    });
  });
}

test('a revision conflict keeps the draft and reloads only on request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await simulateHomeAssistant(page, { plant: STORED, revision: 4 });
  await openRediscovery(page);
  await page.getByRole('button', { name: 'Aggiungi Inverter Pergola' }).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  // Someone else saves meanwhile.
  home.revision = 5;
  await page.getByRole('button', { name: /Salva impianto/ }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Le modifiche non salvate restano qui');
  await expect(page.getByRole('region', { name: 'Modifiche' }).getByText('Fotovoltaico: aggiunto Inverter Pergola')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await shoot(page, 'wizard-conflict-390');
  expect(home.plant).toEqual(STORED);
  await alert.getByRole('button', { name: /Carica la versione salvata/ }).click();
  await expect(page.getByRole('button', { name: 'Aggiungi Inverter Pergola' })).toBeVisible();
  expect(home.saves).toHaveLength(1);
});

test('an integration without Energy Profile v2 still saves v1 modules', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const home = await simulateHomeAssistant(page, { v2: false });
  await page.goto('/consumi/energia');
  await page.getByRole('button', { name: /Avvia rilevamento/ }).click();
  await expect(page.getByText('Nessun dispositivo riconosciuto automaticamente')).toBeVisible();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('radio', { name: 'Solo rete' }).click();
  await page.getByRole('region', { name: 'Rete' }).getByRole('button', { name: 'Modifica Rete 1' }).click();
  await page.getByRole('radio', { name: 'Un sensore con segno' }).click();
  const power = page.getByRole('combobox', { name: 'Potenza netta (con segno)' });
  await power.fill('sensor.grid_power');
  // Escape closes the suggestions only, not the wizard.
  await power.press('Escape');
  await expect(page.getByRole('heading', { name: 'Dispositivi' })).toBeVisible();
  await page.getByLabel('Valori positivi = prelievo dalla rete').check();
  // One device per module: a second grid meter needs the newer integration.
  await expect(page.getByRole('region', { name: 'Rete' }).getByRole('button', { name: 'Aggiungi contatore di rete' })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Salta per ora' }).click();
  await page.getByRole('button', { name: /Salva impianto/ }).click();
  await expect(page.getByText(/Impianto salvato/)).toBeVisible();

  expect(home.saves).toHaveLength(1);
  expect(home.saves[0].profile).toEqual({ modules: { grid: { sensors: { net_power: 'sensor.grid_power' }, sign_convention: 'positive_import' } } });
  expect(home.saves[0].expected_revision).toBe(0);
});
