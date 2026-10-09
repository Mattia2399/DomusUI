const { test, expect } = require('@playwright/test');

/*
 * Profile → My devices against a simulated Home Assistant that applies the
 * Profile Core revision rules: the full self-service flow, removing a device
 * Home Assistant no longer knows, and presence for users with and without a
 * linked Person. Screens are captured at 390, 820 and 1440 px, light and
 * dark, when PROFILE_SCREENSHOTS is set.
 */

const HA = 'http://homeassistant.local:8123';
const USER = { id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] };

function createHome({ haDevices = [], owned = [], entities = {} } = {}) {
  return {
    revision: owned.length > 0 ? 1 : 0,
    notificationsEnabled: true,
    nextId: owned.length + 1,
    haDevices,
    entities,
    devices: owned.map((device, index) => ({
      id: `pd_${index + 1}`,
      ha_device_id: device.haDeviceId,
      label: device.label,
      added_at: '2026-01-01T10:00:00+00:00',
      notifications: true,
    })),
    messages: [],
  };
}

function snapshot(home) {
  const live = (device) => {
    const source = home.haDevices.find((entry) => entry.haDeviceId === device.ha_device_id);
    return {
      device_id: device.id,
      status: source ? 'active' : 'missing',
      display_name: source ? source.displayName : null,
      kind: source ? source.kind || 'phone' : 'other',
      capabilities: { notifications: Boolean(source), presence: false },
      notification_target_status: source ? 'ready' : 'unsupported',
      presence: { tracker_entity_ids: [], in_person_trackers: false },
    };
  };
  return {
    owner: { user_id: USER.id, person_id: null, person_entity_id: null, person_status: 'unknown' },
    persisted: home.revision > 0,
    revision: home.revision,
    profile: {
      revision: home.revision,
      state: 'active',
      created_at: null,
      updated_at: null,
      notifications: { enabled: home.notificationsEnabled },
      personal_devices: home.devices.map((device) => ({
        id: device.id,
        source: { kind: 'ha_device', ha_device_id: device.ha_device_id },
        ...(device.label ? { label: device.label } : {}),
        added_at: device.added_at,
        notifications: { enabled: device.notifications },
      })),
    },
    live_devices: home.devices.map(live),
  };
}

function handleProfile(home, message) {
  const conflict = () => ({ error: { code: 'revision_conflict', message: 'Profile changed' } });
  if (message.type !== 'domusos/profile/get_self' && message.type !== 'domusos/profile/discover_devices'
    && message.expected_revision !== home.revision) {
    return conflict();
  }
  const commit = () => {
    home.revision += 1;
    return { result: snapshot(home) };
  };
  switch (message.type) {
    case 'domusos/profile/get_self':
      return { result: snapshot(home) };
    case 'domusos/profile/discover_devices':
      return {
        result: {
          revision: home.revision,
          devices: home.haDevices.map((device) => {
            const mine = home.devices.some((stored) => stored.ha_device_id === device.haDeviceId);
            return {
              ha_device_id: device.haDeviceId,
              display_name: device.displayName,
              kind: device.kind || 'phone',
              status: mine ? 'already_owned' : 'available',
              claimable: !mine,
              confidence: 'verified',
              capabilities: { notifications: true, presence: false },
              notification_target_status: 'ready',
              presence: { tracker_entity_ids: [], in_person_trackers: false },
            };
          }),
        },
      };
    case 'domusos/profile/save_self':
      home.notificationsEnabled = message.profile.notifications.enabled;
      return commit();
    case 'domusos/profile/add_device':
      home.devices.push({
        id: `pd_${home.nextId++}`,
        ha_device_id: message.ha_device_id,
        added_at: '2026-02-01T10:00:00+00:00',
        notifications: true,
      });
      return commit();
    case 'domusos/profile/remove_device':
      home.devices = home.devices.filter((device) => device.id !== message.device_id);
      return commit();
    case 'domusos/profile/update_device':
      home.devices = home.devices.map((device) => {
        if (device.id !== message.device_id) return device;
        const next = { ...device };
        if ('label' in message) next.label = (message.label || '').trim() || undefined;
        if (message.notifications) next.notifications = message.notifications.enabled;
        return next;
      });
      return commit();
    default:
      return { error: { code: 'unknown_command', message: 'Unknown command' } };
  }
}

async function simulateHomeAssistant(page, options) {
  const home = createHome(options);
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        home.messages.push(message);
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        if (typeof message.type === 'string' && message.type.startsWith('domusos/profile/')) {
          const outcome = handleProfile(home, message);
          ws.send(JSON.stringify(outcome.error
            ? { id: message.id, type: 'result', success: false, error: outcome.error }
            : { id: message.id, type: 'result', success: true, result: outcome.result }));
          continue;
        }
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities': {
            reply(null);
            const now = Date.now() / 1000;
            const states = Object.fromEntries(Object.entries(home.entities).map(([id, [state, attributes]]) => [
              id, { s: String(state), a: attributes, c: 'ctx', lc: now, lu: now },
            ]));
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: states } }));
            break;
          }
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

const profileCommands = (home) => home.messages
  .map((message) => message.type)
  .filter((type) => typeof type === 'string' && type.startsWith('domusos/profile/') && type !== 'domusos/profile/get_self');

const touchesPeople = (home) => home.messages.some((message) =>
  message.type === 'person/update' || message.type === 'person/create' || message.domain === 'person');

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function capture(page, name) {
  await expectNoHorizontalOverflow(page);
  if (process.env.PROFILE_SCREENSHOTS) {
    await page.screenshot({ path: `${process.env.PROFILE_SCREENSHOTS}/${name}.png`, fullPage: true });
  }
}

const devicesRow = (page) => page.getByRole('button', { name: /I miei dispositivi Dove ricevi le notifiche Domus/ });

test('a user links, adjusts and removes a personal device', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await simulateHomeAssistant(page, {
    haDevices: [{ haDeviceId: 'ha-pixel', displayName: 'Pixel 8' }],
  });
  await page.goto('/profile');

  await expect(devicesRow(page)).toContainText('0');
  await devicesRow(page).click();
  await expect(page).toHaveURL(/\/profile\/devices$/);
  await expect(page.getByText('Nessun dispositivo personale')).toBeVisible();
  await capture(page, 'devices-empty-390');

  await page.getByRole('button', { name: 'Aggiungi dispositivo' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Verificato per il tuo account')).toBeVisible();
  await capture(page, 'devices-discovery-390');
  await sheet.getByRole('button', { name: 'Associa Pixel 8' }).click();
  await expect(sheet.getByText('Collegare Pixel 8 al tuo profilo?')).toBeVisible();
  await sheet.getByRole('button', { name: 'Collega' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const device = page.getByRole('article', { name: 'Pixel 8' });
  await expect(device).toBeVisible();
  await expect(device.getByText('Collegato')).toBeVisible();
  await expect(page.getByText('Dispositivo collegato al tuo profilo.')).toBeVisible();

  const deviceSwitch = page.getByRole('switch', { name: 'Notifiche su Pixel 8' });
  await deviceSwitch.click();
  await expect(deviceSwitch).toHaveAttribute('aria-checked', 'false');

  await page.getByRole('button', { name: 'Rinomina Pixel 8' }).click();
  await page.getByLabel('Nome in Domus').fill('  Telefono lavoro ');
  await page.getByRole('button', { name: 'Salva' }).click();
  const renamed = page.getByRole('article', { name: 'Telefono lavoro' });
  await expect(renamed).toBeVisible();
  await expect(renamed.getByText('Pixel 8')).toBeVisible();
  await capture(page, 'devices-list-390');

  await page.getByRole('button', { name: 'Rimuovi Telefono lavoro' }).click();
  await expect(page.getByText(/Il dispositivo non verrà rimosso da Home Assistant/)).toBeVisible();
  await page.getByRole('button', { name: 'Rimuovi dal profilo' }).click();
  await expect(page.getByText('Nessun dispositivo personale')).toBeVisible();

  expect(profileCommands(home)).toEqual([
    'domusos/profile/discover_devices',
    'domusos/profile/add_device',
    'domusos/profile/update_device',
    'domusos/profile/update_device',
    'domusos/profile/remove_device',
  ]);
  const writes = home.messages.filter((message) => typeof message.type === 'string'
    && message.type.startsWith('domusos/profile/') && 'expected_revision' in message);
  expect(writes.map((message) => message.expected_revision)).toEqual([0, 1, 2, 3]);
  for (const message of writes) {
    expect(Object.keys(message)).not.toContain('user_id');
    expect(Object.keys(message)).not.toContain('person_id');
  }
  expect(touchesPeople(home)).toBe(false);
});

test('a device Home Assistant no longer knows can still be removed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const home = await simulateHomeAssistant(page, { owned: [{ haDeviceId: 'ha-gone', label: 'Vecchio telefono' }] });
  await page.goto('/profile/devices');

  const device = page.getByRole('article', { name: 'Vecchio telefono' });
  await expect(device.getByText('Non più disponibile in Home Assistant')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Notifiche su Vecchio telefono' })).toBeDisabled();
  await page.getByRole('button', { name: 'Rimuovi Vecchio telefono' }).click();
  await page.getByRole('button', { name: 'Rimuovi dal profilo' }).click();
  await expect(page.getByText('Nessun dispositivo personale')).toBeVisible();
  expect(profileCommands(home)).toEqual(['domusos/profile/remove_device']);
});

test('presence never borrows a Person or tracker by name', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const home = await simulateHomeAssistant(page, {
    entities: {
      'person.owner': ['home', { friendly_name: 'Owner', device_trackers: ['device_tracker.owner_phone'], latitude: 45, longitude: 9 }],
      'device_tracker.owner_phone': ['home', { friendly_name: 'Owner', user_id: 'owner', latitude: 45, longitude: 9 }],
    },
  });
  await page.goto('/profile/activity');

  await expect(page.getByText('Nessuna attività disponibile')).toBeVisible();
  await expect(page.getByText('Fonti di presenza').locator('..')).toContainText('0');
  expect(touchesPeople(home)).toBe(false);
});

test('presence follows the Person linked to the user', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await simulateHomeAssistant(page, {
    entities: {
      'person.owner': ['home', {
        friendly_name: 'Someone else', user_id: 'owner', device_trackers: ['device_tracker.pixel'], source: 'device_tracker.pixel',
      }],
      'device_tracker.pixel': ['home', { friendly_name: 'Pixel 8' }],
      'device_tracker.unrelated': ['home', { friendly_name: 'Owner', user_id: 'owner' }],
    },
  });
  await page.goto('/profile/activity');

  await expect(page.getByText('Fonti di presenza').locator('..')).toContainText('1');
});

for (const [width, height] of [[390, 844], [820, 1180], [1440, 960]]) {
  for (const scheme of ['light', 'dark']) {
    test(`devices page holds together at ${width}px in ${scheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await simulateHomeAssistant(page, {
        haDevices: [
          { haDeviceId: 'ha-pixel', displayName: 'Pixel 8 Pro di casa con un nome molto lungo' },
          { haDeviceId: 'ha-ipad', displayName: 'iPad', kind: 'tablet' },
        ],
        owned: [{ haDeviceId: 'ha-pixel' }, { haDeviceId: 'ha-ipad', label: 'Tablet cucina' }, { haDeviceId: 'ha-gone' }],
      });
      await page.goto('/profile/devices');
      await expect(page.getByRole('article')).toHaveCount(3);
      await capture(page, `devices-${width}-${scheme}`);
      await page.getByRole('button', { name: 'Aggiungi dispositivo' }).click();
      await expect(page.getByRole('dialog').getByText('Già collegato al tuo profilo').first()).toBeVisible();
      await capture(page, `devices-discovery-${width}-${scheme}`);
    });
  }
}
