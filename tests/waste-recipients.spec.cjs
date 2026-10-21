const { test, expect } = require('@playwright/test');
const { accessSelfFor } = require('./support/accessSelf.cjs');

/*
 * Waste Collection reminders to people, against a simulated Home Assistant:
 * a new configuration, an explicit conversion of a previous one, a removed
 * person, a readiness change and the two test paths. Screens are captured at
 * 390, 820 and 1440 px, light and dark, when WASTE_SCREENSHOTS is set.
 */

const HA = 'http://homeassistant.local:8123';
const USER = { id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] };
const ROUTE = '/settings/home/waste-collection';

const PEOPLE = {
  'person.mattia': ['home', { id: 'p-mattia', friendly_name: 'Mattia', user_id: 'u-mattia' }],
  'person.erika': ['home', { id: 'p-erika', friendly_name: 'Erika', user_id: 'u-erika' }],
  'person.anna': ['home', { id: 'p-anna', friendly_name: 'Anna' }],
  'person.andrea_1': ['home', { id: 'p-dup', friendly_name: 'Andrea' }],
  'person.andrea_2': ['home', { id: 'p-dup', friendly_name: 'Andrea' }],
};

function wasteDocument(notifications) {
  return {
    schema: 'domusos-waste-collection',
    version: 2,
    revision: 4,
    updatedAt: '2026-10-09T10:00:00Z',
    updatedByUserId: 'owner',
    wasteTypes: [
      { id: 'organic', name: 'Organico', icon: 'mdi:leaf', color: '#22c55e', aliases: [] },
      { id: 'paper', name: 'Carta e cartone', icon: 'mdi:package-variant', color: '#3b82f6', aliases: [] },
    ],
    sources: [],
    mappings: [],
    exceptions: [],
    notifications: { enabled: false, time: '20:00', mode: 'recipients', recipients: [], legacyTargetCount: 0, ...notifications },
  };
}

async function simulateHomeAssistant(page, notifications, readiness = {}) {
  const home = {
    document: wasteDocument(notifications),
    readiness: { 'p-mattia': 'ready', 'p-erika': 'no_devices', 'p-anna': 'no_account', ...readiness },
    saves: [],
    tests: 0,
    messages: [],
  };
  const recipients = () => [
    ...['p-anna', 'p-erika', 'p-mattia'].map((personId) => ({
      person_id: personId,
      person_entity_id: Object.keys(PEOPLE).find((entityId) => PEOPLE[entityId][1].id === personId),
      status: home.readiness[personId],
      selectable: true,
    })),
    { person_id: 'p-dup', person_entity_id: null, status: 'ambiguous', selectable: false },
  ];
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        home.messages.push(message);
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        const fail = (code, text) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code, message: text } }));
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities': {
            reply(null);
            const now = Date.now() / 1000;
            const states = Object.fromEntries(Object.entries(PEOPLE).map(([id, [state, attributes]]) => [
              id, { s: state, a: attributes, c: 'ctx', lc: now, lu: now },
            ]));
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: states } }));
            break;
          }
          case 'domusos/access/get_self':
            reply(accessSelfFor(USER));
            break;
          case 'auth/current_user':
            reply(USER);
            break;
          case 'config/entity_registry/list_for_display':
            reply({ entity_categories: {}, entities: [] });
            break;
          case 'config/area_registry/list':
          case 'config/entity_registry/list':
          case 'config/device_registry/list':
            reply([]);
            break;
          case 'domusos/waste_collection/get_config':
            reply(home.document);
            break;
          case 'domusos/waste_collection/preview':
            reply({ generatedAt: '2026-10-09T10:00:00Z', warnings: [], events: [] });
            break;
          case 'domusos/waste_collection/save_config': {
            home.saves.push(message);
            if (message.expected_revision !== home.document.revision) {
              fail('revision_conflict', 'Configuration changed');
              break;
            }
            const sent = message.config.notifications;
            if ('targets' in sent || 'legacyTargets' in sent) {
              fail('invalid_config', 'Technical targets cannot be changed');
              break;
            }
            if (home.document.notifications.mode === 'legacy' && sent.mode === 'recipients' && sent.recipients.length === 0) {
              fail('invalid_config', 'Choose at least one person');
              break;
            }
            home.document = {
              ...home.document,
              ...message.config,
              notifications: { ...sent, legacyTargetCount: home.document.notifications.legacyTargetCount },
              revision: home.document.revision + 1,
            };
            reply(home.document);
            break;
          }
          case 'domusos/waste_collection/test_notification':
            home.tests += 1;
            reply(home.document.notifications.mode === 'legacy'
              ? { mode: 'legacy', sent: ['notify.mobile_app_old_phone'], failed: [] }
              : { mode: 'recipients', status: 'delivered', recipients: home.document.notifications.recipients.map((person_id) => ({ person_id, status: 'delivered' })) });
            break;
          case 'domusos/profile/list_recipients':
            reply({ recipients: recipients() });
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

async function capture(page, name) {
  await expectNoHorizontalOverflow(page);
  if (process.env.WASTE_SCREENSHOTS) await page.screenshot({ path: `${process.env.WASTE_SCREENSHOTS}/${name}.png` });
}

const sheet = (page) => page.getByRole('dialog', { name: 'Scegli i destinatari' });
const person = (page, name) => sheet(page).getByRole('checkbox', { name });
const recipientsSaved = (home) => home.saves.at(-1).config.notifications;

test('a new configuration sends to the people chosen and keeps them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await simulateHomeAssistant(page, {});
  await page.goto(ROUTE);

  await page.getByRole('switch', { name: 'Avvisami la sera prima' }).click();
  await expect(page.getByText('Chi riceve l’avviso')).toBeVisible();
  await expect(page.getByText(/notify\./)).toHaveCount(0);
  await page.getByRole('button', { name: /Seleziona persone/ }).click();
  await person(page, 'Mattia').click();
  await person(page, 'Erika').click();
  await expect(person(page, 'Erika')).toContainText('Deve configurare un dispositivo');
  await sheet(page).getByRole('button', { name: 'Fine' }).click();
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByText('Modifiche non salvate')).toHaveCount(0);

  expect(recipientsSaved(home)).toEqual({ enabled: true, time: '20:00', mode: 'recipients', recipients: ['p-mattia', 'p-erika'] });

  await page.reload();
  const chips = page.getByRole('list', { name: 'Chi riceve l’avviso' });
  await expect(chips).toContainText('Mattia');
  await expect(chips).toContainText('Erika');
});

test('a previous configuration is converted only when the administrator confirms', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const home = await simulateHomeAssistant(page, { enabled: true, mode: 'legacy', legacyTargetCount: 1 });
  await page.goto(ROUTE);

  const legacy = page.getByTestId('waste-legacy-recipients');
  await expect(legacy.getByText('Configurazione precedente')).toBeVisible();
  await expect(page.getByText(/notify\./)).toHaveCount(0);

  // The previous path still tests as before.
  await page.getByRole('button', { name: /Invia una prova/ }).click();
  await expect(page.getByText('Notifica di prova inviata.')).toBeVisible();

  await legacy.getByRole('button', { name: /Converti in persone/ }).click();
  const dialog = page.getByRole('region', { name: 'Converti in persone' });
  await expect(dialog.getByText(/Ogni persona sceglie autonomamente/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Annulla' }).click();
  await expect(dialog).toHaveCount(0);
  expect(home.saves).toHaveLength(0);

  await legacy.getByRole('button', { name: /Converti in persone/ }).click();
  await expect(dialog.getByRole('button', { name: /Converti e salva/ })).toBeDisabled();
  await dialog.getByRole('button', { name: /Seleziona persone/ }).click();
  // Nobody is guessed from the old target names.
  for (const name of ['Mattia', 'Erika', 'Anna']) await expect(person(page, name)).toHaveAttribute('aria-checked', 'false');
  await capture(page, 'waste-convert-picker-1440');
  await person(page, 'Mattia').click();
  await sheet(page).getByRole('button', { name: 'Fine' }).click();
  await dialog.getByRole('button', { name: /Converti e salva/ }).click();

  await expect(page.getByText('Ora i promemoria arrivano alle persone scelte.')).toBeVisible();
  await expect(page.getByTestId('waste-legacy-recipients')).toHaveCount(0);
  expect(home.saves).toHaveLength(1);
  expect(recipientsSaved(home)).toEqual({ enabled: true, time: '20:00', mode: 'recipients', recipients: ['p-mattia'] });

  // From now on the test goes to people, reported without devices.
  await page.getByRole('button', { name: /Invia una prova/ }).click();
  await expect(page.getByText('Notifica di prova inviata.')).toBeVisible();
  expect(home.tests).toBe(2);
  await expect(page.getByText(/notify\.|mobile_app/)).toHaveCount(0);
});

test('a removed person stays selected until the administrator removes it', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const home = await simulateHomeAssistant(page, { enabled: true, recipients: ['p-mattia', 'p-gone'] });
  await page.goto(ROUTE);

  await page.getByRole('button', { name: /Seleziona persone/ }).click();
  const removed = sheet(page).getByRole('checkbox', { name: 'Rimuovi Persona rimossa' });
  await expect(removed).toHaveAttribute('aria-checked', 'true');
  expect(home.saves).toHaveLength(0);
  await removed.click();
  await sheet(page).getByRole('button', { name: 'Fine' }).click();
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByText('Modifiche non salvate')).toHaveCount(0);

  expect(recipientsSaved(home).recipients).toEqual(['p-mattia']);
});

test('a change of readiness never changes who is chosen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await simulateHomeAssistant(page, { enabled: true, recipients: ['p-mattia'] });
  await page.goto(ROUTE);

  await page.getByRole('button', { name: /Seleziona persone/ }).click();
  await expect(person(page, 'Mattia')).toContainText('Pronto');
  home.readiness['p-mattia'] = 'no_devices';
  await sheet(page).getByRole('button', { name: 'Aggiorna' }).click();

  await expect(person(page, 'Mattia')).toContainText('Deve configurare un dispositivo');
  await expect(person(page, 'Mattia')).toHaveAttribute('aria-checked', 'true');
  await sheet(page).getByRole('button', { name: 'Fine' }).click();
  await expect(page.getByText('Modifiche non salvate')).toHaveCount(0);
  expect(home.saves).toHaveLength(0);
});

for (const [width, height] of [[390, 844], [820, 1180], [1440, 960]]) {
  for (const scheme of ['light', 'dark']) {
    test(`recipients hold together at ${width}px in ${scheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await simulateHomeAssistant(page, { enabled: true, recipients: ['p-mattia', 'p-erika', 'p-dup', 'p-gone'] });
      await page.goto(ROUTE);

      await expect(page.getByText('Chi riceve l’avviso')).toBeVisible();
      await page.getByText('Chi riceve l’avviso').scrollIntoViewIfNeeded();
      await capture(page, `waste-recipients-${width}-${scheme}`);
      await page.getByRole('button', { name: /Seleziona persone/ }).click();
      await expect(sheet(page).getByTestId('recipient-row')).toHaveCount(5);
      await expect(sheet(page).getByText('Identità persona da controllare')).toBeVisible();
      await capture(page, `waste-picker-${width}-${scheme}`);
    });

    test(`a previous configuration holds together at ${width}px in ${scheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await simulateHomeAssistant(page, { enabled: true, mode: 'legacy', legacyTargetCount: 1 });
      await page.goto(ROUTE);

      const legacy = page.getByTestId('waste-legacy-recipients');
      await legacy.scrollIntoViewIfNeeded();
      await capture(page, `waste-legacy-${width}-${scheme}`);
      await legacy.getByRole('button', { name: /Converti in persone/ }).click();
      await expect(page.getByRole('region', { name: 'Converti in persone' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Converti in persone' }).getByRole('button', { name: /Seleziona persone/ })).toBeVisible();
      await capture(page, `waste-convert-${width}-${scheme}`);
    });
  }
}
