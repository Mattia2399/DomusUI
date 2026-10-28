const { test, expect } = require('@playwright/test');

const INTRO_TITLE = /Tutta la casa\.\s*Un solo gesto\./;

test.beforeEach(async ({ page }) => {
  await page.goto('/home');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
});

async function startSetup(page) {
  await expect(page.getByRole('heading', { name: INTRO_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Inizia', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Come vuoi iniziare?' })).toBeVisible();
}

test('fresh users can enter the isolated Demo and only open Home or Rooms', async ({ page }) => {
  await startSetup(page);
  await page.getByRole('button', { name: /Prova la Demo/ }).click();

  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('ha.dashboard.runtimeMode.v1'))).toBe('demo');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('dialog', { name: 'Questa è la casa Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Demo · Collega la tua casa/i })).toBeVisible();

  await page.goto('/rooms');
  await expect(page).toHaveURL(/\/rooms$/);
  await page.goto('/security');
  await expect(page.getByRole('heading', { name: 'Questa sezione richiede una casa collegata' })).toBeVisible();
  await expect(page.getByText('Nella Demo puoi esplorare Home e Stanze.', { exact: false })).toBeVisible();
});

test('the address step searches the home network and validates what is typed', async ({ page }) => {
  // Nothing answers on the default address: the search ends and asks for the address.
  await page.route('http://homeassistant.local:8123/**', (route) => route.abort('namenotresolved'));
  await startSetup(page);
  await page.getByRole('button', { name: /Collega la tua casa/ }).click();
  await expect(page.getByRole('heading', { name: 'Dov’è la tua casa?' })).toBeVisible();
  await expect(page.getByText('Non l’abbiamo trovata da sola: scrivi l’indirizzo')).toBeVisible();

  const field = page.getByLabel('Indirizzo di Home Assistant');
  await field.fill('casa');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('http://192.168.1.20:8123');
  await expect(page.getByText('Indirizzo valido')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accedi con Home Assistant' })).toBeEnabled();
});

test('an address nobody answers on explains why and lets the user change it', async ({ page }) => {
  await page.route('http://192.168.1.20:8123/**', (route) => route.abort('connectionrefused'));
  await page.route('http://homeassistant.local:8123/**', (route) => route.abort('namenotresolved'));
  await startSetup(page);
  await page.getByRole('button', { name: /Collega la tua casa/ }).click();
  await page.getByLabel('Indirizzo di Home Assistant').fill('http://192.168.1.20:8123');
  await page.getByRole('button', { name: 'Accedi con Home Assistant' }).click();

  await expect(page.getByRole('heading', { name: 'Non troviamo Home Assistant' })).toBeVisible();
  await expect(page.getByText('Sei fuori casa?')).toBeVisible();
  await page.getByRole('button', { name: 'Cambia indirizzo' }).click();
  await expect(page.getByRole('heading', { name: 'Dov’è la tua casa?' })).toBeVisible();
  await expect(page.getByLabel('Indirizzo di Home Assistant')).toHaveValue('http://192.168.1.20:8123');
});

test('first configuration returns from OAuth to the setup analysis instead of Home', async ({ page }) => {
  let oauthReturnTo = null;
  await page.route('http://homeassistant.local:8123/manifest.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/auth/authorize**', async (route) => {
    const rawState = new URL(route.request().url()).searchParams.get('state');
    oauthReturnTo = rawState ? JSON.parse(rawState).returnTo : null;
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>OAuth mock</title>' });
  });
  await startSetup(page);
  await page.getByRole('button', { name: /Collega la tua casa/ }).click();
  await expect(page.getByRole('heading', { name: 'Dov’è la tua casa?' })).toBeVisible();
  await page.getByLabel('Indirizzo di Home Assistant').fill('http://homeassistant.local:8123');
  await page.getByRole('button', { name: 'Accedi con Home Assistant' }).click({ noWaitAfter: true });

  await expect.poll(() => oauthReturnTo).toBe('/setup');
});

test('a first panel installation reads the home, summarises it and opens the Home with its guide', async ({ page }) => {
  await page.evaluate(() => {
    document.body.innerHTML = '<iframe title="Home Assistant panel" src="/local/dashboard/index.html" style="width:100vw;height:100vh;border:0"></iframe>';
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin || !event.source || !event.data) return;
      if (event.data.type === 'ha-panel-ready' || event.data.type === 'ha-panel-request-sync') {
        event.source.postMessage({
          type: 'ha-panel-context',
          hassUrl: 'http://homeassistant.local:8123',
        }, window.location.origin);
        event.source.postMessage({
          type: 'ha-panel-snapshot',
          hassUrl: 'http://homeassistant.local:8123',
          states: {
            'light.kitchen': {
              entity_id: 'light.kitchen',
              state: 'on',
              attributes: { friendly_name: 'Cucina' },
              last_changed: new Date().toISOString(),
              last_updated: new Date().toISOString(),
            },
          },
          areas: [{ area_id: 'kitchen', name: 'Cucina' }],
        }, window.location.origin);
        return;
      }
      if (event.data.type !== 'ha-panel-call-api') return;
      const type = event.data.message?.type;
      const result =
        type === 'frontend/get_system_data'
          ? { value: null }
          : type === 'auth/current_user'
          ? { name: 'Mattia', is_owner: true, is_admin: true }
          : type?.includes('entity_registry')
            ? { entities: [{ entity_id: 'light.kitchen', area_id: 'kitchen' }] }
            : type?.includes('device_registry')
              ? { devices: [{ id: 'device-kitchen', area_id: 'kitchen' }] }
              : type === 'config/area_registry/list'
                ? [{ area_id: 'kitchen', name: 'Cucina' }]
                : [];
      event.source.postMessage({
        type: 'ha-panel-call-api-result',
        requestId: event.data.requestId,
        ok: true,
        result,
      }, window.location.origin);
    });
  });

  const panel = page.frameLocator('iframe[title="Home Assistant panel"]');
  await expect(panel.getByRole('heading', { name: INTRO_TITLE })).toBeVisible();
  await panel.getByRole('button', { name: 'Inizia', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Come vuoi iniziare?' })).toBeVisible();
  await panel.getByRole('button', { name: /Collega la tua casa/ }).click();

  // Inside Home Assistant the sign-in is already done: no address, straight to the reading.
  await expect(panel.getByRole('heading', { name: 'Ecco la casa di Mattia' })).toBeVisible();
  await expect(panel.getByText('1 luce', { exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="Home Assistant panel"]')).toHaveAttribute('src', '/local/dashboard/index.html');
  await panel.getByRole('button', { name: 'Continua' }).click();

  await expect(panel.getByRole('heading', { name: 'Com’è la tua Home al primo accesso?' })).toBeVisible();
  await expect(panel.getByRole('radio', { name: /Home consigliata/ })).toHaveAttribute('aria-checked', 'true');
  await panel.getByRole('button', { name: 'Apri la Home' }).click();

  await expect(panel.getByRole('dialog', { name: 'La tua Home è pronta' })).toBeVisible();
  expect(page.frames().find((frame) => frame !== page.mainFrame())?.url()).toContain('/local/dashboard/index.html');
});

test('a completed installation signs in again without first-run steps', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2,
      phase: 'done',
      mode: 'real',
      hassUrl: 'http://homeassistant.local:8123',
      updatedAt: Date.now(),
    }));
  });

  await page.goto('/setup?reconnect=1');
  await expect(page.getByRole('heading', { name: 'Accedi di nuovo' })).toBeVisible();
  await expect(page.getByText('homeassistant.local:8123')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accedi con Home Assistant' })).toBeVisible();
  await expect(page.locator('.sw-count')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: INTRO_TITLE })).toHaveCount(0);
  // The v2 journey moved to the v3 key.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.setupJourney.v2'))).toBeNull();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('ha.dashboard.setupJourney.v3') ?? '{}').phase)).toBe('done');
});

test('a setup left half-way offers to resume, and the summary shows Home categories', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl: 'http://homeassistant.local:8123',
      clientId: window.location.origin,
      expires: Date.now() + 3_600_000,
      refresh_token: 'refresh',
      access_token: 'access',
      expires_in: 1800,
    }));
    localStorage.setItem('ha.dashboard.setupJourney.v3', JSON.stringify({
      version: 3,
      phase: 'summary',
      mode: 'real',
      hassUrl: 'http://homeassistant.local:8123',
      summary: {
        entities: 28,
        devices: 12,
        areas: 4,
        floors: 2,
        unavailable: 1,
        unassigned: 3,
        domains: { light: 7, lock: 2, climate: 3, sensor: 16 },
        categories: { lights: 7, thermostats: 3, security: 2 },
        userName: 'Mattia',
        canManageHa: true,
      },
      updatedAt: Date.now(),
    }));
  });

  await page.goto('/setup');
  await expect(page.getByText('Eri all’analisi della casa · homeassistant.local:8123')).toBeVisible();
  await page.getByRole('button', { name: 'Riprendi da dove eri' }).click();

  await expect(page.getByRole('heading', { name: 'Ecco la casa di Mattia' })).toBeVisible();
  await expect(page.getByText('4 stanze su 2 piani, 12 dispositivi. Niente è stato cambiato.')).toBeVisible();
  await expect(page.getByText('7 luci', { exact: true })).toBeVisible();
  await expect(page.getByText('3 termostati', { exact: true })).toBeVisible();
  await expect(page.getByText('2 per la sicurezza', { exact: true })).toBeVisible();
  await expect(page.getByText('1 dispositivo non risponde')).toBeVisible();
  await expect(page.getByText('3 dispositivi senza stanza')).toBeVisible();
  await expect(page.getByText('light', { exact: true })).toHaveCount(0);
});

test('starting over from the resume offer forgets the half-done setup', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('ha.dashboard.setupJourney.v3', JSON.stringify({
      version: 3,
      phase: 'connect',
      mode: 'real',
      hassUrl: 'http://homeassistant.local:8123',
      updatedAt: Date.now(),
    }));
  });
  await page.goto('/setup');
  await page.getByRole('button', { name: 'Ricomincia da capo' }).click();
  await expect(page.getByRole('button', { name: 'Inizia', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.setupJourney.v3'))).toBeNull();
});

test('a resumed step after the sign-in without a session asks to sign in again instead of leaving', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.setupJourney.v3', JSON.stringify({
      version: 3,
      phase: 'compose',
      mode: 'real',
      hassUrl: 'http://homeassistant.local:8123',
      connectionMethod: 'direct',
      summary: { entities: 4, devices: 2, areas: 1, unavailable: 0, domains: {}, canManageHa: true, userName: 'Mattia' },
      updatedAt: Date.now(),
    }));
  });
  await page.goto('/setup');
  await page.getByRole('button', { name: 'Riprendi da dove eri' }).click();
  await expect(page.getByRole('heading', { name: 'Accedi di nuovo' })).toBeVisible();
  await expect(page.getByText('Casa di Mattia')).toBeVisible();
  await expect(page).toHaveURL(/127\.0\.0\.1|localhost/);
  await page.getByRole('button', { name: 'Cambia', exact: true }).click();
  await expect(page.getByLabel('Indirizzo di Home Assistant')).toHaveValue('http://homeassistant.local:8123');
});
