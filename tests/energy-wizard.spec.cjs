const { test, expect } = require('@playwright/test');

/*
 * Guided Energy setup against a simulated Home Assistant: a simple plant (grid
 * and one inverter), a complete one (two inverters, two batteries, a wallbox,
 * F1/F2/F3 meters), an ambiguous detection, a plant without energy meters, a
 * rediscovery on a configured Energy Profile v2 plant, a revision conflict
 * and an older integration that stores v1 modules only. Screens are captured
 * at 390, 820 and 1440 px when ENERGY_SCREENSHOTS is set.
 */

const HA = 'http://homeassistant.local:8123';
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 960 }];

const POWER = { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' };
const ENERGY = { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' };
const SOC = { unit_of_measurement: '%', device_class: 'battery', state_class: 'measurement' };
const ENTITIES = {
  'sensor.grid_power': [1500, POWER, 'Contatore rete'],
  'sensor.grid_import_kwh': [5321, ENERGY, 'Energia prelevata'],
  'sensor.grid_export_kwh': [812, ENERGY, 'Energia immessa'],
  'sensor.grid_f1': [2100, ENERGY, 'Prelievo F1'],
  'sensor.grid_f2': [1800, ENERGY, 'Prelievo F2'],
  'sensor.grid_f3': [1400, ENERGY, 'Prelievo F3'],
  'sensor.inv1': [3800, POWER, 'Inverter Tetto potenza'],
  'sensor.inv1_energy': [9000, ENERGY, 'Inverter Tetto energia'],
  'sensor.inv2': [1900, POWER, 'Inverter Pergola potenza'],
  'sensor.inv2_energy': [4000, ENERGY, 'Inverter Pergola energia'],
  'sensor.bat1_soc': [80, SOC, 'Batteria Garage carica'],
  'sensor.bat1_power': [-1200, POWER, 'Batteria Garage potenza'],
  'sensor.bat2_soc': [45, SOC, 'Batteria Cantina carica'],
  'sensor.bat2_charge': [0, POWER, 'Batteria Cantina in carica'],
  'sensor.bat2_discharge': [300, POWER, 'Batteria Cantina in scarica'],
  'sensor.wallbox_power': [7400, POWER, 'Wallbox potenza'],
  'sensor.house': [900, POWER, 'Consumo casa'],
  'sensor.outdoor_temp': [18, { unit_of_measurement: '°C', device_class: 'temperature', state_class: 'measurement' }, 'Temperatura esterna'],
};

const meter = (id, status, reason = null) => ({ statistic_id: id, status, reason, source: 'recorder', unit: 'kWh', has_sum: true, entity_id: id, long_term: status === 'valid' });
const power = (role, entity, extra = {}) => ({ role, entity_id: entity, confidence: 'high', evidence: ['energy_dashboard_device'], sign_convention: null, requires: [], ...extra });
const energy = (role, ids, statuses) => ({ role, statistic_ids: ids, confidence: 'high', evidence: ['energy_dashboard'], statuses });
const found = (key, module, n, name, extra = {}) => ({
  key, module, status: 'new', device_id: `${module}-${n}`, ha_device_id: key, name, integration: 'fronius', confidence: 'high', eligible: true, warnings: [], ...extra,
});

const GRID = found('meter', 'grid', 1, 'Contatore', { power: [power('net_power', 'sensor.grid_power', { evidence: ['energy_dashboard'], sign_convention: 'positive_import' })] });
const INV1 = found('inv1', 'solar', 1, 'Inverter Tetto', { power: [power('production_power', 'sensor.inv1')], energy: [energy('production_energy', ['sensor.inv1_energy'], ['valid'])] });
const INV2 = found('inv2', 'solar', 2, 'Inverter Pergola', { power: [power('production_power', 'sensor.inv2')], energy: [energy('production_energy', ['sensor.inv2_energy'], ['pending'])] });
const METERS = {
  'sensor.inv1_energy': meter('sensor.inv1_energy', 'valid'),
  'sensor.inv2_energy': meter('sensor.inv2_energy', 'pending', 'awaiting_first_statistics'),
  'sensor.grid_f1': meter('sensor.grid_f1', 'valid'),
  'sensor.grid_f2': meter('sensor.grid_f2', 'valid'),
  'sensor.grid_f3': meter('sensor.grid_f3', 'valid'),
  'sensor.grid_export_kwh': meter('sensor.grid_export_kwh', 'valid'),
};

const discovery = (devices, extra = {}, v1 = {}) => ({
  energy_dashboard: 'used', suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], unassigned: [], candidates: {}, ...v1,
  v2: {
    profile: { configured: false, revision: 0 }, verification: 'complete', recorder: 'available', devices,
    totals: [], ambiguous: [], low_confidence: [], meters: METERS,
    // The whole-plant suggestion is never applied as such.
    suggested_plant: { home: { devices: [] } },
    ...extra,
  },
});

const SCENARIOS = {
  simple: () => discovery([GRID, INV1]),
  complete: () => discovery([
    { ...GRID, energy: [energy('import_energy', ['sensor.grid_f1', 'sensor.grid_f2', 'sensor.grid_f3'], ['valid', 'valid', 'valid']), energy('export_energy', ['sensor.grid_export_kwh'], ['valid'])] },
    INV1,
    INV2,
    found('bat1', 'battery', 1, 'Batteria Garage', { power: [power('state_of_charge', 'sensor.bat1_soc'), power('net_power', 'sensor.bat1_power', { requires: ['sign_convention'] })] }),
    found('bat2', 'battery', 2, 'Batteria Cantina', {
      confidence: 'medium', eligible: false,
      power: [power('state_of_charge', 'sensor.bat2_soc'), power('charge_power', 'sensor.bat2_charge'), power('discharge_power', 'sensor.bat2_discharge')],
    }),
  ], {}, { proposals: { wallbox: { charging_power: [{ entity_id: 'sensor.wallbox_power', confidence: 'medium', score: 60, evidence: [], sign_convention: null, requires: [] }] } } }),
  ambiguous: () => discovery([GRID, INV1, { key: 'battery:x', module: 'battery', status: 'conflict', device_id: null, name: 'Accumulo doppio', confidence: 'medium', eligible: false }], {
    ambiguous: [{ module: 'solar', role: 'production_power', entity_ids: ['sensor.inv1', 'sensor.inv2'], reason: 'multiple_candidates' }],
    totals: [{ module: 'solar', kind: 'power', role: 'production_power', ids: ['sensor.inv2'], status: 'presumed', covers: [], evidence: [] }],
  }),
  nometers: () => discovery([GRID, { ...INV1, energy: [] }], { meters: {} }),
};

const STORED = {
  grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { net_power: 'sensor.grid_power' }, sign_convention: 'positive_import' } }] },
  solar: { devices: [{ id: 'solar-1', name: 'Inverter Tetto', ha_device_id: 'inv1', power: { sensors: { production_power: 'sensor.inv1' } } }] },
};

function rediscovery() {
  const result = discovery([
    { ...INV1, status: 'update', device_id: 'solar-1', eligible: false, additions: [{ kind: 'energy', role: 'production_energy', ids: ['sensor.inv1_energy'] }], corrections: [] },
    INV2,
    { key: 'grid:configured:grid-1', module: 'grid', status: 'configured', device_id: 'grid-1', name: null, detected: true },
  ]);
  result.v2.profile = { configured: true, revision: 4 };
  return result;
}

const quantity = (entity) => ({
  status: 'ok', value: 1000, unit: 'W', source: 'measured', entity_ids: [entity], reason: null, freshness: 'fresh',
  reported_at: new Date(Date.now() - 5000).toISOString(), stale_after: 1800, origin: 'device', partial_value: null, coverage: { contributing: 1, configured: 1 },
});

function energyState(home) {
  const plant = home.v2 ? home.plant : Object.fromEntries(Object.entries(home.modules).map(([id, sources]) => [id, { devices: [{ id: `${id}-1`, name: null, power: sources }] }]));
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

async function simulateHomeAssistant(page, { v2 = true, plant = {}, modules = {}, revision = 0, retired = [], discover = SCENARIOS.simple } = {}) {
  const home = { v2, plant: structuredClone(plant), modules: structuredClone(modules), revision, retired, saves: [] };
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
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
            reply(home.v2 ? discover() : {
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

/** Every screen is checked for overflow and captured for the visual review. */
async function screen(page, name) {
  await expectNoHorizontalOverflow(page);
  if (process.env.ENERGY_SCREENSHOTS) await page.screenshot({ path: `${process.env.ENERGY_SCREENSHOTS}/${name}.png`, fullPage: false });
}

const step = (page, name) => expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
const next = (page, name = 'Avanti') => page.getByRole('button', { name, exact: true }).click();

async function startSetup(page) {
  await page.goto('/consumi/energia');
  await page.getByRole('button', { name: /Avvia rilevamento/ }).click();
  await step(page, 'Benvenuto');
}

for (const viewport of VIEWPORTS) {
  const w = viewport.width;

  test(`A · simple plant: grid and one inverter at ${w}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const home = await simulateHomeAssistant(page, { discover: SCENARIOS.simple });
    await startSetup(page);
    await expect(page.getByRole('heading', { name: 'Configuriamo Domus Energy' })).toBeVisible();
    await screen(page, `A-${w}-1-welcome`);
    await next(page, 'Iniziamo');

    await step(page, 'Il tuo impianto');
    await expect(page.getByRole('checkbox', { name: 'Fotovoltaico' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('checkbox', { name: 'Batteria' })).toHaveAttribute('aria-checked', 'false');
    await screen(page, `A-${w}-2-plant`);
    await next(page);

    await step(page, 'Rilevamento automatico');
    await expect(page.getByRole('heading', { name: 'Abbiamo trovato il tuo impianto' })).toBeVisible();
    const results = page.getByRole('list', { name: 'Risultato del rilevamento' });
    await expect(results.getByText('Pronto')).toHaveCount(2);
    // Technical names stay in the closed details.
    await expect(results.getByText('sensor.inv1', { exact: false })).toBeHidden();
    await screen(page, `A-${w}-3-detect`);
    expect(home.saves).toHaveLength(0);
    await next(page, 'Usa i dispositivi trovati');

    await step(page, 'Rete elettrica');
    await expect(page.getByRole('button', { name: 'Modifica Contatore' })).toContainText('Pronto');
    await page.getByRole('button', { name: 'Modifica Contatore' }).click();
    // The sign comes from the Energy dashboard: shown as a picture and preselected.
    await expect(page.getByRole('radio', { name: 'Positivo quando prelevo dalla rete' })).toBeChecked();
    await screen(page, `A-${w}-4-grid`);
    await next(page);

    await step(page, 'Fotovoltaico');
    await expect(page.getByRole('button', { name: 'Modifica Inverter Tetto' })).toContainText('3,8 kW ora');
    await screen(page, `A-${w}-5-solar`);
    await next(page);

    await step(page, 'Storico dei consumi');
    await expect(page.getByRole('group', { name: 'Produzione fotovoltaica' })).toContainText('Contatore trovato');
    await screen(page, `A-${w}-6-history`);
    await next(page);
    await step(page, 'Tariffa');
    await next(page, 'Salta per ora');

    await step(page, 'Controllo finale');
    await expect(page.getByRole('heading', { name: 'Tutto pronto' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'In breve' })).toContainText('2dispositivi configurati');
    await screen(page, `A-${w}-7-summary`);
    expect(home.saves).toHaveLength(0);
    await page.getByRole('button', { name: /Salva impianto/ }).click();

    await expect(page.getByRole('heading', { name: 'Domus Energy è pronto' })).toBeVisible();
    await screen(page, `A-${w}-8-success`);
    const [save] = home.saves;
    expect(Object.keys(save).sort()).toEqual(['expected_revision', 'id', 'profile_v2', 'type']);
    expect(save.expected_revision).toBe(0);
    expect('tariff' in save.profile_v2).toBe(false);
    expect(save.profile_v2.plant).toEqual({
      grid: { devices: [{ id: 'grid-1', name: 'Contatore', ha_device_id: 'meter', power: { sensors: { net_power: 'sensor.grid_power' }, sign_convention: 'positive_import' } }] },
      solar: { devices: [{ id: 'solar-1', name: 'Inverter Tetto', ha_device_id: 'inv1', power: { sensors: { production_power: 'sensor.inv1' } }, energy: { production_energy: ['sensor.inv1_energy'] } }] },
    });
    await next(page, 'Vai a Domus Energy');
    await expect(page.getByRole('list', { name: 'Componenti dell’impianto' })).toBeVisible();
  });

  test(`B · complete plant: two inverters, two batteries, a wallbox at ${w}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const home = await simulateHomeAssistant(page, { discover: SCENARIOS.complete });
    await startSetup(page);
    await next(page, 'Iniziamo');

    await step(page, 'Il tuo impianto');
    await page.getByRole('checkbox', { name: 'Wallbox' }).click();
    await screen(page, `B-${w}-1-plant`);
    await next(page);

    await step(page, 'Rilevamento automatico');
    await expect(page.getByRole('list', { name: 'Risultato del rilevamento' }).getByText('Da verificare', { exact: true })).toBeVisible();
    await screen(page, `B-${w}-2-detect`);
    await next(page, 'Usa i dispositivi trovati');

    await step(page, 'Rete elettrica');
    await next(page);
    await step(page, 'Fotovoltaico');
    await expect(page.getByRole('list', { name: 'Dispositivi: Fotovoltaico' }).getByRole('listitem')).toHaveCount(2);
    await screen(page, `B-${w}-3-solar`);
    await next(page);

    await step(page, 'Batteria');
    // The signed battery needs its convention: nothing moves on until it is chosen.
    await expect(page.getByRole('button', { name: 'Avanti', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Modifica Batteria Garage' }).click();
    await expect(page.getByText('Adesso il sensore indica -1,2 kW.')).toBeVisible();
    await screen(page, `B-${w}-4-battery-sign`);
    await page.getByRole('radio', { name: 'Negativo quando si scarica' }).check();
    await page.getByRole('textbox', { name: 'Capacità utilizzabile (kWh)' }).fill('9,5');
    // The second battery is only a suggestion: added on purpose.
    await page.getByRole('button', { name: 'Aggiungi Batteria Cantina' }).click();
    await screen(page, `B-${w}-5-batteries`);
    await next(page);

    await step(page, 'Wallbox');
    await expect(page.getByText('Consigliato da Domus')).toBeVisible();
    await screen(page, `B-${w}-6-wallbox-recommendation`);
    await page.getByRole('button', { name: 'Usa questo sensore' }).click();
    await expect(page.getByRole('button', { name: 'Chiudi Wallbox 1' })).toContainText('7,4 kW ora');
    await next(page);

    await step(page, 'Storico dei consumi');
    const bought = page.getByRole('group', { name: 'Energia acquistata' });
    await expect(bought.getByText('Domus sommerà queste tre fasce per ottenere il totale.')).toBeVisible();
    await expect(bought.getByRole('list', { name: 'Parti di Energia acquistata' })).toContainText('F1');
    await screen(page, `B-${w}-7-history`);
    await bought.getByRole('button', { name: 'Conferma' }).click();
    await next(page);
    await step(page, 'Tariffa');
    await next(page, 'Salta per ora');

    await step(page, 'Controllo finale');
    await expect(page.getByRole('group', { name: 'Il tuo impianto' })).toContainText('2 inverter');
    await screen(page, `B-${w}-8-summary`);
    await page.getByRole('button', { name: /Salva impianto/ }).click();
    await expect(page.getByRole('heading', { name: 'Domus Energy è pronto' })).toBeVisible();
    await screen(page, `B-${w}-9-success`);

    const plant = home.saves[0].profile_v2.plant;
    expect(plant.grid.devices[0].energy).toEqual({ import_energy: ['sensor.grid_f1', 'sensor.grid_f2', 'sensor.grid_f3'], export_energy: ['sensor.grid_export_kwh'] });
    expect(plant.solar.devices.map((device) => device.id)).toEqual(['solar-1', 'solar-2']);
    expect(plant.battery.devices).toEqual([
      { id: 'battery-1', name: 'Batteria Garage', ha_device_id: 'bat1', capacity: { nominal_kwh: null, usable_kwh: 9.5 }, power: { sensors: { state_of_charge: 'sensor.bat1_soc', net_power: 'sensor.bat1_power' }, sign_convention: 'positive_charge' } },
      { id: 'battery-2', name: 'Batteria Cantina', ha_device_id: 'bat2', power: { sensors: { state_of_charge: 'sensor.bat2_soc', charge_power: 'sensor.bat2_charge', discharge_power: 'sensor.bat2_discharge' } } },
    ]);
    expect(plant.wallbox.devices).toEqual([{ id: 'wallbox-1', name: null, ha_device_id: null, power: { sensors: { charging_power: 'sensor.wallbox_power' } } }]);
  });

  test(`C · ambiguous detection at ${w}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const home = await simulateHomeAssistant(page, { discover: SCENARIOS.ambiguous });
    await startSetup(page);
    await next(page, 'Iniziamo');
    await page.getByRole('checkbox', { name: 'Batteria' }).click();
    await next(page);

    const results = page.getByRole('list', { name: 'Risultato del rilevamento' });
    await expect(results.getByRole('listitem').filter({ hasText: 'Fotovoltaico' })).toContainText('Da verificare');
    await expect(results.getByRole('listitem').filter({ hasText: 'Batteria' })).toContainText('Da verificare');
    await screen(page, `C-${w}-1-detect`);
    await next(page, 'Usa i dispositivi trovati');
    await next(page);

    await step(page, 'Fotovoltaico');
    const doubts = page.getByRole('region', { name: 'Da decidere' });
    await expect(doubts).toContainText('Più sensori possibili');
    await expect(doubts).toContainText('Inverter Pergola potenza');
    await expect(page.getByRole('button', { name: 'Usa comunque come totale' })).toBeVisible();
    await screen(page, `C-${w}-2-solar-doubts`);
    await next(page);

    await step(page, 'Batteria');
    await expect(page.getByRole('region', { name: 'Da decidere' })).toContainText('Accumulo doppio corrisponde a più dispositivi configurati');
    await screen(page, `C-${w}-3-battery-conflict`);
    expect(home.saves).toHaveLength(0);
  });

  test(`D · no energy meters at ${w}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const home = await simulateHomeAssistant(page, { discover: SCENARIOS.nometers });
    await startSetup(page);
    await next(page, 'Iniziamo');
    await next(page);
    await next(page, 'Usa i dispositivi trovati');
    await step(page, 'Rete elettrica');
    await next(page);
    await step(page, 'Fotovoltaico');
    await next(page);

    await step(page, 'Storico dei consumi');
    await expect(page.getByText('Non abbiamo trovato un contatore energetico.')).toBeVisible();
    await screen(page, `D-${w}-1-history`);
    await next(page, 'Continua senza storico');
    await next(page, 'Salta per ora');
    await screen(page, `D-${w}-2-summary`);
    await page.getByRole('button', { name: /Salva impianto/ }).click();
    await expect(page.getByText('Monitoraggio in tempo reale pronto. Lo storico potrà essere configurato in seguito.')).toBeVisible();
    await screen(page, `D-${w}-3-success`);
    expect(home.saves[0].profile_v2.plant.solar.devices[0]).toEqual({ id: 'solar-1', name: 'Inverter Tetto', ha_device_id: 'inv1', power: { sensors: { production_power: 'sensor.inv1' } } });
  });
}

async function openRediscovery(page) {
  await page.goto('/consumi/energia');
  await page.getByRole('button', { name: 'Impostazioni energia' }).click();
  await page.getByRole('button', { name: 'Aggiungi dispositivi o nuovo rilevamento' }).click();
  await step(page, 'Il tuo impianto');
}

for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
  test(`rediscovery and meter choice on a v2 plant at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const home = await simulateHomeAssistant(page, { plant: STORED, revision: 4, retired: ['solar-2'], discover: rediscovery });
    await openRediscovery(page);
    await expect(page.getByRole('checkbox', { name: 'Fotovoltaico' })).toHaveAttribute('aria-disabled', 'true');
    await next(page);
    await step(page, 'Rilevamento automatico');
    await next(page, 'Usa i dispositivi trovati');
    await step(page, 'Rete elettrica');
    await next(page);
    await step(page, 'Fotovoltaico');
    await expect(page.getByRole('button', { name: 'Modifica Inverter Pergola' })).toContainText('Nuovo');
    await next(page);

    await step(page, 'Storico dei consumi');
    const produced = page.getByRole('group', { name: 'Produzione fotovoltaica' }).first();
    await produced.getByRole('button', { name: 'Usa questo contatore' }).click();
    // The grid meter is chosen in the full picker: the power sensor and the temperature are not offered.
    const bought = page.getByRole('group', { name: 'Energia acquistata' });
    await bought.getByRole('button', { name: 'Scegli un contatore: Energia acquistata' }).click();
    const picker = bought.getByRole('combobox', { name: 'Energia acquistata 1' });
    await picker.fill('energia');
    const options = page.getByRole('listbox', { name: 'Sensori disponibili' });
    await expect(options.getByRole('option', { name: /Energia prelevata/ })).toBeVisible();
    await expect(options.getByRole('option', { name: /Contatore rete/ })).toHaveCount(0);
    await expect(options.getByRole('option', { name: /Inverter Tetto energia/ })).toHaveAttribute('aria-disabled', 'true');
    await screen(page, `R-${viewport.width}-picker`);
    await options.getByRole('option', { name: /Energia prelevata/ }).click();
    await expect(picker).toHaveValue('sensor.grid_import_kwh');
    await next(page);

    await step(page, 'Controllo finale');
    await page.getByText('Mostra riepilogo tecnico').click();
    await expect(page.getByRole('region', { name: 'Modifiche' }).getByText('Energia prelevata: aggiunti sensor.grid_import_kwh')).toBeVisible();
    await page.getByRole('button', { name: /Salva impianto/ }).click();
    await next(page, 'Vai a Domus Energy');
    // Back to the settings it was opened from, with the saved plant and the outcome.
    await expect(page.getByRole('status').getByText(/Impianto salvato/)).toBeVisible();

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
  const home = await simulateHomeAssistant(page, { plant: STORED, revision: 4, discover: rediscovery });
  await openRediscovery(page);
  await next(page);
  await next(page, 'Usa i dispositivi trovati');
  await next(page);
  await next(page);
  await next(page);
  await step(page, 'Controllo finale');
  // Someone else saves meanwhile.
  home.revision = 5;
  await page.getByRole('button', { name: /Salva impianto/ }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Le modifiche non salvate restano qui');
  await screen(page, 'conflict-390');
  expect(home.plant).toEqual(STORED);
  await alert.getByRole('button', { name: /Carica la versione salvata/ }).click();
  await step(page, 'Il tuo impianto');
  expect(home.saves).toHaveLength(1);
});

test('an integration without Energy Profile v2 still saves v1 modules', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const home = await simulateHomeAssistant(page, { v2: false });
  await startSetup(page);
  await next(page, 'Iniziamo');
  await next(page);
  await expect(page.getByRole('heading', { name: 'Nessun dispositivo riconosciuto automaticamente' })).toBeVisible();
  await next(page);

  await step(page, 'Rete elettrica');
  // A first device opens on its own; one device per module, without names.
  await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveCount(0);
  await page.getByRole('radio', { name: /Un solo sensore/ }).check();
  await page.getByRole('combobox', { name: 'Potenza scambiata con la rete' }).fill('sensor.grid_power');
  await page.getByRole('combobox', { name: 'Potenza scambiata con la rete' }).press('Escape');
  await expect(page.getByRole('heading', { level: 2, name: 'Rete elettrica' })).toBeVisible();
  await page.getByRole('radio', { name: 'Positivo quando prelevo dalla rete' }).check();
  await expect(page.getByRole('button', { name: 'Aggiungi un altro contatore di rete' })).toBeDisabled();
  await screen(page, 'legacy-820-grid');
  await next(page);
  await next(page, 'Salta per ora');
  await page.getByRole('button', { name: /Salva impianto/ }).click();
  await expect(page.getByRole('heading', { name: 'Domus Energy è pronto' })).toBeVisible();

  expect(home.saves).toHaveLength(1);
  expect(home.saves[0].profile).toEqual({ modules: { grid: { sensors: { net_power: 'sensor.grid_power' }, sign_convention: 'positive_import' } } });
  expect(home.saves[0].expected_revision).toBe(0);
});
