const { test, expect } = require('@playwright/test');

const ownerId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const unlinkedAccountId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const sharedConfiguration = {
  schema: 'premium-home-house-configuration',
  version: 1,
  revision: 1,
  updatedAt: '2026-09-30T12:00:00.000Z',
  updatedByUserId: ownerId,
  publication: { source: 'migration' },
  dashboard: {
    storageVersion: 14,
    sections: [],
    widgets: [
      {
        id: 'members-location-e2e',
        kind: 'members',
        title: 'Famiglia',
        entityId: 'group.house_members',
        status: 'home',
        isOn: true,
        layout: { i: 'members-location-e2e', x: 0, y: 0, w: 4, h: 3 },
      },
    ],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
  },
  security: {
    alarmEntityId: null,
    visibleSensorEntityIds: null,
    visibleCameraEntityIds: null,
  },
  rooms: { customRooms: [], hiddenEntitiesByRoom: {} },
};

const users = [
  {
    id: ownerId,
    name: 'Mattia',
    username: 'mattia@example.test',
    is_owner: true,
    is_admin: true,
    is_active: true,
    system_generated: false,
    group_ids: ['system-admin'],
  },
  {
    id: unlinkedAccountId,
    name: 'Angela',
    username: 'angela@example.test',
    is_owner: false,
    is_admin: false,
    is_active: true,
    system_generated: false,
    group_ids: ['system-users'],
  },
];

const states = {
  'person.mattia': {
    entity_id: 'person.mattia',
    state: 'home',
    attributes: {
      friendly_name: 'Mattia',
      user_id: ownerId,
      source: 'device_tracker.mattia_phone',
      device_trackers: ['device_tracker.mattia_phone'],
    },
    last_changed: '2026-09-30T12:00:00.000Z',
    last_updated: '2026-09-30T12:00:00.000Z',
  },
  'device_tracker.mattia_phone': {
    entity_id: 'device_tracker.mattia_phone',
    state: 'not_home',
    attributes: {
      friendly_name: 'Mattia iPhone',
      source_type: 'gps',
      latitude: 41.9028,
      longitude: 12.4964,
      gps_accuracy: 8,
    },
    last_changed: '2026-09-30T12:00:00.000Z',
    last_updated: '2026-09-30T12:00:00.000Z',
  },
  'person.angela': {
    entity_id: 'person.angela',
    state: 'Lavoro',
    attributes: {
      friendly_name: 'Angela',
      latitude: 45.4642,
      longitude: 9.19,
    },
    last_changed: '2026-09-30T12:00:00.000Z',
    last_updated: '2026-09-30T12:00:00.000Z',
  },
  'person.home_without_coordinates': {
    entity_id: 'person.home_without_coordinates',
    state: 'home',
    attributes: { friendly_name: 'Senza posizione' },
    last_changed: '2026-09-30T12:00:00.000Z',
    last_updated: '2026-09-30T12:00:00.000Z',
  },
};

async function installPanelBridge(page, panelStates = states) {
  await page.goto('/home');
  await page.evaluate(
    ({ ownerId, sharedConfiguration, states, users }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
        version: 2,
        phase: 'done',
        mode: 'real',
        updatedAt: Date.now(),
      }));
      localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');

      const origin = window.location.origin;
      window.addEventListener('message', (event) => {
        if (event.origin !== origin || !event.source || !event.data) return;
        if (event.data.type === 'ha-panel-ready' || event.data.type === 'ha-panel-request-sync') {
          event.source.postMessage({
            type: 'ha-panel-context',
            hassUrl: origin,
            bridgeProtocolVersion: 1,
            capabilities: ['shared_configuration'],
          }, origin);
          event.source.postMessage({
            type: 'ha-panel-snapshot',
            hassUrl: origin,
            bridgeProtocolVersion: 1,
            capabilities: ['shared_configuration'],
            states,
            areas: [],
          }, origin);
          return;
        }

        if (event.data.type === 'ha-panel-call-api') {
          const message = event.data.message ?? {};
          let result = [];
          if (message.type === 'auth/current_user') {
            result = users.find((user) => user.id === ownerId);
          } else if (message.type === 'config/auth/list' || message.type === 'auth/list') {
            result = users;
          } else if (message.type === 'frontend/get_system_data') {
            result = {
              value: message.key === 'premium-home.shared-house.v1' ? sharedConfiguration : null,
            };
          } else if (message.type === 'frontend/get_user_data') {
            result = { value: null };
          } else if (message.type === 'get_services') {
            result = {};
          }
          event.source.postMessage({
            type: 'ha-panel-call-api-result',
            requestId: event.data.requestId,
            ok: true,
            result,
          }, origin);
          return;
        }

        if (event.data.type === 'ha-panel-subscribe-api') {
          event.source.postMessage({
            type: 'ha-panel-subscribe-api-result',
            requestId: event.data.requestId,
            ok: true,
          }, origin);
        }
      });

      document.body.innerHTML = '<iframe title="Home Assistant panel" src="/home" style="width:100vw;height:100vh;border:0"></iframe>';
    },
    { ownerId, sharedConfiguration, states: panelStates, users },
  );
}

test('Members Card loads MapLibre only when opening the person location panel', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const requestedScripts = [];
  const failedLocalRequests = [];
  const pageErrors = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') requestedScripts.push(request.url());
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(process.env.TEST_BASE_URL || 'http://127.0.0.1:3000')) {
      failedLocalRequests.push({ url: request.url(), error: request.failure()?.errorText });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await installPanelBridge(page);
  const panel = page.frameLocator('iframe[title="Home Assistant panel"]');
  const card = panel.getByRole('button', { name: 'Apri Famiglia' });
  await expect(card).toBeVisible();

  expect(requestedScripts.some((url) => /MembersLocationMap|react-maplibre|maplibre-gl/i.test(url))).toBe(false);

  await card.click();

  await expect(panel.getByRole('heading', { name: 'Famiglia' })).toBeVisible();
  await expect(panel.getByText('2 posizioni disponibili')).toBeVisible();
  await expect(panel.locator('.maplibregl-map')).toBeVisible();
  await expect(panel.locator('.maplibregl-marker')).toHaveCount(2);
  await expect(
    panel.locator('.maplibregl-map').locator('..').locator('[aria-busy="true"]'),
  ).toHaveCount(0);
  await expect.poll(
    () => requestedScripts.some((url) => /MembersLocationMap|react-maplibre|maplibre-gl/i.test(url)),
  ).toBe(true);

  const originalCanvasContainer = await panel.locator('.maplibregl-canvas-container').elementHandle();
  expect(originalCanvasContainer).not.toBeNull();
  await page.evaluate(({ ownerId }) => {
    const frame = document.querySelector('iframe[title="Home Assistant panel"]');
    frame?.contentWindow?.postMessage({
      type: 'ha-panel-state-changed',
      entityId: 'person.mattia',
      state: {
        entity_id: 'person.mattia',
        state: 'not_home',
        attributes: {
          friendly_name: 'Mattia',
          user_id: ownerId,
          latitude: 41.9028,
          longitude: 12.4964,
          gps_accuracy: 8,
        },
        last_changed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      },
    }, window.location.origin);
  }, { ownerId });
  await expect(panel.getByText('Fuori casa')).toBeVisible();
  expect(await originalCanvasContainer.evaluate((element) => element.isConnected)).toBe(true);
  await expect(
    panel.locator('.maplibregl-map').locator('..').locator('[aria-busy="true"]'),
  ).toHaveCount(0);

  await page.evaluate(({ ownerId }) => {
    const frame = document.querySelector('iframe[title="Home Assistant panel"]');
    frame?.contentWindow?.postMessage({
      type: 'ha-panel-state-changed',
      entityId: 'person.mattia',
      state: {
        entity_id: 'person.mattia',
        state: 'not_home',
        attributes: {
          friendly_name: 'Mattia',
          user_id: ownerId,
          latitude: 41.91,
          longitude: 12.51,
          gps_accuracy: 5,
        },
        last_changed: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      },
    }, window.location.origin);
  }, { ownerId });
  await expect(panel.getByText('Fuori casa')).toBeVisible();
  await expect(panel.locator('.maplibregl-marker')).toHaveCount(2);
  await expect.poll(
    () => originalCanvasContainer.evaluate((element) => element.isConnected),
  ).toBe(false);
  await expect(
    panel.locator('.maplibregl-map').locator('..').locator('[aria-busy="true"]'),
  ).toHaveCount(0);

  expect(failedLocalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('Members Card arrow opens People and access without loading MapLibre', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const mapLibreRequests = [];
  page.on('request', (request) => {
    if (/MembersLocationMap|react-maplibre|maplibre-gl/i.test(request.url())) {
      mapLibreRequests.push(request.url());
    }
  });

  await installPanelBridge(page);
  const panel = page.frameLocator('iframe[title="Home Assistant panel"]');
  await panel.getByRole('button', { name: 'Apri pannello membri' }).click();

  await expect(panel.getByRole('heading', { name: 'Persone e accessi' })).toBeVisible();
  expect(mapLibreRequests).toEqual([]);
});

test('Members location panel does not load MapLibre when no person has coordinates', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const mapLibreRequests = [];
  page.on('request', (request) => {
    if (/MembersLocationMap|react-maplibre|maplibre-gl/i.test(request.url())) {
      mapLibreRequests.push(request.url());
    }
  });

  await installPanelBridge(page, {
    'person.mattia': {
      ...states['person.mattia'],
      attributes: {
        friendly_name: 'Mattia',
        user_id: ownerId,
        source: 'device_tracker.mattia_phone',
        device_trackers: ['device_tracker.mattia_phone'],
      },
    },
    'device_tracker.mattia_phone': {
      ...states['device_tracker.mattia_phone'],
      attributes: {
        friendly_name: 'Mattia iPhone',
        source_type: 'router',
      },
    },
  });
  const panel = page.frameLocator('iframe[title="Home Assistant panel"]');
  await panel.getByRole('button', { name: 'Apri Famiglia' }).click();

  await expect(panel.getByText('Nessuna coordinata disponibile per i membri.')).toBeVisible();
  await expect(panel.locator('aside.context-sidebar').getByText('Mattia')).toBeVisible();
  await expect(panel.locator('aside.context-sidebar').getByLabel('1 smartphone')).toBeVisible();
  await expect(panel.locator('.maplibregl-map')).toHaveCount(0);
  expect(mapLibreRequests).toEqual([]);
});
