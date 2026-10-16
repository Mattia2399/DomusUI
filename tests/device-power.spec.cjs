const { test, expect } = require('@playwright/test');

/*
 * Settings › This device › Power and charging, against a simulated Home
 * Assistant. The charger is switched by DomusOS in Home Assistant, never by
 * the browser: the simulation plays the integration's controller (the real
 * one is covered by tests_python/test_device_power_manager.py), and every
 * test checks that the page itself sent no switch command. Screens are
 * captured at 390, 820 and 1440 px, light and dark, when
 * DEVICE_POWER_SCREENSHOTS is set.
 */

const HA = 'http://homeassistant.local:8123';
const USER = { id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] };
const ROUTE = '/settings/device/power';
const BATTERY = 'sensor.tablet_battery';
const CHARGER = 'switch.presa_tablet';

const ENTITIES = {
  [BATTERY]: ['55', { friendly_name: 'Batteria tablet', device_class: 'battery', unit_of_measurement: '%' }],
  'sensor.temperatura_soggiorno': ['21', { friendly_name: 'Temperatura soggiorno', unit_of_measurement: '°C' }],
  [CHARGER]: ['off', { friendly_name: 'Presa tablet' }],
  'switch.presa_tv': ['on', { friendly_name: 'Presa TV' }],
  'light.cucina': ['off', { friendly_name: 'Luce cucina' }],
};

const POLICY_KEYS = ['client_id', 'label', 'enabled', 'battery_entity_id', 'switch_entity_id', 'start_threshold', 'stop_threshold'];

async function simulateHomeAssistant(page, { policies = [], user = USER } = {}) {
  const home = {
    policies,
    states: Object.fromEntries(Object.entries(ENTITIES).map(([id, [state, attributes]]) => [id, { state, attributes }])),
    /** The switch services called by the simulated integration. */
    commands: [],
    /** Every message the page sent. */
    messages: [],
    socket: null,
    entitiesId: null,
  };

  const runtimeOf = (policy) => {
    const level = Number(home.states[policy.battery_entity_id]?.state);
    const trusted = Number.isFinite(level) && level >= 0 && level <= 100;
    const switchState = home.states[policy.switch_entity_id]?.state;
    const status = !policy.enabled
      ? 'disabled'
      : !trusted
        ? 'battery_unavailable'
        : switchState !== 'on' && switchState !== 'off'
          ? 'switch_unavailable'
          : switchState === 'on'
            ? 'charging'
            : 'waiting';
    return {
      status,
      battery_level: trusted ? level : null,
      switch_on: switchState === 'on' ? true : switchState === 'off' ? false : null,
      last_action: policy.last_action ?? null,
      last_error: null,
    };
  };
  const view = (policy) => {
    const { last_action: _ignored, ...stored } = policy;
    return { ...stored, runtime: runtimeOf(policy) };
  };
  const state = () => ({ status: 'ready', policies: home.policies.map(view) });

  const pushState = (entityId) => {
    if (!home.socket || home.entitiesId === null) return;
    const { state: value, attributes } = home.states[entityId];
    home.socket.send(JSON.stringify({
      id: home.entitiesId,
      type: 'event',
      event: { c: { [entityId]: { '+': { s: value, a: attributes, lu: Date.now() / 1000 } } } },
    }));
  };

  /** The integration's controller: only between the thresholds, with hysteresis. */
  const evaluate = () => {
    for (const policy of home.policies) {
      if (!policy.enabled) continue;
      const runtime = runtimeOf(policy);
      if (runtime.status === 'battery_unavailable' || runtime.status === 'switch_unavailable') continue;
      const desired = runtime.battery_level <= policy.start_threshold
        ? true
        : runtime.battery_level >= policy.stop_threshold
          ? false
          : null;
      if (desired === null || desired === runtime.switch_on) continue;
      const service = desired ? 'turn_on' : 'turn_off';
      home.commands.push({ service, entity_id: policy.switch_entity_id });
      home.states[policy.switch_entity_id].state = desired ? 'on' : 'off';
      policy.last_action = { action: service, at: new Date().toISOString() };
      pushState(policy.switch_entity_id);
    }
  };

  home.setState = (entityId, value) => {
    home.states[entityId].state = value;
    pushState(entityId);
    evaluate();
  };

  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    home.socket = ws;
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        home.messages.push(message);
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        const fail = (code, text) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code, message: text } }));
        const current = home.policies.find((policy) => policy.policy_id === message.policy_id);
        if (message.type.startsWith('domusos/device_power/')) {
          if (!user.is_admin) {
            fail('unauthorized', 'Unauthorized');
            continue;
          }
          if (message.policy_id && !current) {
            fail('policy_not_found', 'Policy not found');
            continue;
          }
          if (current && message.expected_revision !== current.revision) {
            fail('revision_conflict', 'Policy changed');
            continue;
          }
        }
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities': {
            home.entitiesId = message.id;
            reply(null);
            const now = Date.now() / 1000;
            const states = Object.fromEntries(Object.entries(home.states).map(([id, { state: value, attributes }]) => [
              id, { s: value, a: attributes, c: 'ctx', lc: now, lu: now },
            ]));
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: states } }));
            break;
          }
          case 'auth/current_user':
            reply(user);
            break;
          case 'config/entity_registry/list_for_display':
            reply({ entity_categories: {}, entities: [] });
            break;
          case 'config/area_registry/list':
          case 'config/entity_registry/list':
          case 'config/device_registry/list':
            reply([]);
            break;
          case 'domusos/device_power/get_state':
            reply(state());
            break;
          case 'domusos/device_power/save_policy': {
            const sent = message.policy;
            if (Object.keys(sent).sort().join() !== [...POLICY_KEYS].sort().join()) {
              fail('invalid_policy', 'Unexpected fields');
              break;
            }
            if (!(sent.start_threshold < sent.stop_threshold)) {
              fail('invalid_policy', 'Start must be below stop');
              break;
            }
            const now = new Date().toISOString();
            const saved = current
              ? { ...current, ...sent, revision: current.revision + 1, updated_at: now }
              : { ...sent, policy_id: 'a'.repeat(32), revision: 1, created_at: now, updated_at: now };
            home.policies = current ? home.policies.map((item) => (item === current ? saved : item)) : [...home.policies, saved];
            evaluate();
            reply({ policy: view(saved), ...state() });
            break;
          }
          case 'domusos/device_power/delete_policy':
            home.policies = home.policies.filter((item) => item !== current);
            reply(state());
            break;
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript((hassUrl) => {
    if (sessionStorage.getItem('device-power.e2e')) return;
    sessionStorage.setItem('device-power.e2e', '1');
    localStorage.clear();
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

/** The page never switches anything itself. */
function expectNoSwitchCommandFromPage(home) {
  const switching = home.messages.filter((message) =>
    (message.type === 'call_service' && message.domain === 'switch') || /turn_on|turn_off/.test(message.type));
  expect(switching).toEqual([]);
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function capture(page, name) {
  await expectNoHorizontalOverflow(page);
  if (process.env.DEVICE_POWER_SCREENSHOTS) {
    await page.screenshot({ path: `${process.env.DEVICE_POWER_SCREENSHOTS}/${name}.png`, fullPage: true });
  }
}

const statusValue = (page, title) =>
  page.getByRole('region', { name: 'Stato' }).locator('div', { has: page.getByText(title, { exact: true }) }).last();

async function choose(page, label, query, option) {
  const input = page.getByRole('combobox', { name: label });
  await input.fill(query);
  await page.getByRole('option', { name: new RegExp(option) }).click();
  // The list keeps the focus until it has closed.
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveValue(/\./);
}

async function configure(page) {
  await choose(page, 'Sensore batteria', 'batteria', 'Batteria tablet');
  await choose(page, 'Alimentazione caricatore', 'presa tablet', 'Presa tablet');
  await page.getByLabel('Nome del dispositivo').fill('Tablet soggiorno');
  await expect(page.getByLabel('Avvia ricarica sotto')).toHaveValue('30');
  await expect(page.getByLabel('Interrompi ricarica sopra')).toHaveValue('80');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByText('Configurazione salvata.')).toBeVisible();
}

test('A–C: reached from Settings › This device, saved once and kept after a reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await simulateHomeAssistant(page);
  await page.goto('/settings');

  const device = page.getByRole('region', { name: 'Questo dispositivo' });
  await device.getByRole('button', { name: /Alimentazione e ricarica/ }).click();
  await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));
  await expect(page.getByRole('heading', { name: 'Alimentazione e ricarica' })).toBeVisible();
  await expect(page.getByText('Configurazione incompleta')).toBeVisible();

  // Only fitting entities: batteries and switches, never a light or a temperature.
  await page.getByRole('combobox', { name: 'Sensore batteria' }).fill('');
  await page.getByRole('combobox', { name: 'Sensore batteria' }).click();
  await expect(page.getByRole('option')).toHaveText([/Batteria tablet/]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await configure(page);
  const [save] = home.messages.filter((message) => message.type === 'domusos/device_power/save_policy');
  expect(save.policy).toEqual({
    client_id: expect.stringMatching(/^[a-f0-9]{32}$/),
    label: 'Tablet soggiorno',
    enabled: true,
    battery_entity_id: BATTERY,
    switch_entity_id: CHARGER,
    start_threshold: 30,
    stop_threshold: 80,
  });
  await expect(statusValue(page, 'Stato automazione')).toContainText('In attesa');

  await page.reload();
  await expect(page.getByLabel('Nome del dispositivo')).toHaveValue('Tablet soggiorno');
  await expect(page.getByRole('combobox', { name: 'Sensore batteria' })).toHaveValue(BATTERY);
  await expect(page.getByRole('combobox', { name: 'Alimentazione caricatore' })).toHaveValue(CHARGER);
  await expect(page.getByRole('button', { name: 'Salva' })).toBeDisabled();
  // The same browser keeps its reference: still one policy, still this device's.
  expect(home.policies).toHaveLength(1);
  expect(home.policies[0].client_id).toBe(save.policy.client_id);
  expectNoSwitchCommandFromPage(home);
});

test('D–F: Home Assistant charges below 30 %, stops above 80 % and waits on an unavailable sensor', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const home = await simulateHomeAssistant(page);
  await page.goto(ROUTE);
  await configure(page);
  expect(home.commands).toEqual([]);

  home.setState(BATTERY, '25');
  expect(home.commands).toEqual([{ service: 'turn_on', entity_id: CHARGER }]);
  await expect(statusValue(page, 'Batteria')).toContainText('25 %');
  await expect(statusValue(page, 'Alimentazione')).toContainText('Accesa');

  // Between the thresholds nothing changes.
  home.setState(BATTERY, '60');
  expect(home.commands).toHaveLength(1);

  home.setState(BATTERY, '85');
  expect(home.commands).toEqual([
    { service: 'turn_on', entity_id: CHARGER },
    { service: 'turn_off', entity_id: CHARGER },
  ]);
  await expect(statusValue(page, 'Alimentazione')).toContainText('Spenta');

  home.setState(BATTERY, 'unavailable');
  home.setState(BATTERY, 'unknown');
  expect(home.commands).toHaveLength(2);
  await expect(statusValue(page, 'Batteria')).toContainText('Non disponibile');
  await page.reload();
  await expect(statusValue(page, 'Stato automazione')).toContainText('Sensore batteria non disponibile');
  expectNoSwitchCommandFromPage(home);
});

test('G–H: turned off it sends nothing more, and removing it leaves the switch as it is', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const home = await simulateHomeAssistant(page);
  await page.goto(ROUTE);
  await configure(page);
  home.setState(BATTERY, '25');
  expect(home.commands).toHaveLength(1);

  await expect(page.getByText('Disattivando la gestione automatica, lo stato attuale dell’alimentazione non verrà modificato.')).toBeVisible();
  await page.getByRole('switch', { name: 'Gestione automatica' }).click();
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByText('Configurazione salvata.')).toBeVisible();
  await expect(statusValue(page, 'Stato automazione')).toContainText('Gestione disattivata');
  // Still on: turning the automation off does not switch the charger.
  expect(home.states[CHARGER].state).toBe('on');

  home.setState(BATTERY, '90');
  home.setState(BATTERY, '10');
  expect(home.commands).toHaveLength(1);

  await page.getByRole('button', { name: 'Rimuovi configurazione' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rimuovere la configurazione?' });
  await expect(dialog.getByText('La configurazione verrà rimossa. Lo stato attuale dello switch non verrà modificato.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Rimuovi' }).click();
  await expect(page.getByText('Configurazione rimossa.')).toBeVisible();
  await expect(page.getByText('Configurazione incompleta')).toBeVisible();

  expect(home.policies).toEqual([]);
  expect(home.commands).toHaveLength(1);
  expect(home.states[CHARGER].state).toBe('on');
  expectNoSwitchCommandFromPage(home);
});

test('validation reports a start level above the stop level and saves nothing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await simulateHomeAssistant(page);
  await page.goto(ROUTE);
  await choose(page, 'Sensore batteria', 'batteria', 'Batteria tablet');
  await choose(page, 'Alimentazione caricatore', 'presa tablet', 'Presa tablet');
  await page.getByLabel('Avvia ricarica sotto').fill('90');
  await page.getByRole('button', { name: 'Salva' }).click();

  await expect(page.getByText('Deve essere maggiore della soglia di avvio.')).toBeVisible();
  await expect(page.getByLabel('Avvia ricarica sotto')).toHaveValue('90');
  expect(home.messages.filter((message) => message.type === 'domusos/device_power/save_policy')).toEqual([]);
});

test('another device keeps its own policy, listed for the administrator', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const now = new Date().toISOString();
  const home = await simulateHomeAssistant(page, {
    policies: [{
      policy_id: 'b'.repeat(32),
      client_id: 'other-tablet-0001',
      label: 'Tablet camera',
      enabled: true,
      battery_entity_id: BATTERY,
      switch_entity_id: 'switch.presa_tv',
      start_threshold: 20,
      stop_threshold: 90,
      revision: 3,
      created_at: now,
      updated_at: now,
    }],
  });
  await page.goto(ROUTE);

  const existing = page.getByRole('region', { name: 'Configurazioni esistenti' });
  await expect(existing.getByText('Tablet camera')).toBeVisible();
  await expect(page.getByText('Configurazione incompleta')).toBeVisible();
  await expect(page.getByLabel('Nome del dispositivo')).toHaveValue('');
  await expect(existing.getByRole('button', { name: 'Collega a questo dispositivo' })).toBeVisible();
  await capture(page, 'device-power-existing-390-light');
  expectNoSwitchCommandFromPage(home);
});

test('Power and charging is not offered to a person without administration rights', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await simulateHomeAssistant(page, { user: { ...USER, id: 'member', is_owner: false, is_admin: false } });
  await page.goto('/settings');
  await expect(page.getByRole('region', { name: 'Questo dispositivo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Alimentazione e ricarica/ })).toHaveCount(0);

  await page.goto(ROUTE);
  await expect(page.getByText(/Solo un amministratore di Home Assistant/)).toBeVisible();
  expect(home.messages.filter((message) => message.type.startsWith('domusos/device_power/'))).toEqual([]);
});

for (const width of [390, 820, 1440]) {
  for (const scheme of ['light', 'dark']) {
    test(`fits ${width} px in ${scheme} mode, with controls large enough to touch`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 820 ? 1180 : 960 });
      await page.emulateMedia({ colorScheme: scheme });
      const home = await simulateHomeAssistant(page);
      await page.goto(ROUTE);
      await configure(page);
      home.setState(BATTERY, '25');
      await expect(statusValue(page, 'Alimentazione')).toContainText('Accesa');
      // The automation status comes from Home Assistant with the next periodic read.
      await expect(statusValue(page, 'Stato automazione')).toContainText('In carica', { timeout: 20_000 });

      for (const control of [
        page.getByRole('combobox', { name: 'Sensore batteria' }),
        page.getByRole('combobox', { name: 'Alimentazione caricatore' }),
        page.getByLabel('Avvia ricarica sotto'),
        page.getByLabel('Interrompi ricarica sopra'),
        page.getByRole('button', { name: 'Salva' }),
        page.getByRole('button', { name: 'Rimuovi configurazione' }),
      ]) {
        const box = await control.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(40);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
      await capture(page, `device-power-${width}-${scheme}`);
    });
  }
}
