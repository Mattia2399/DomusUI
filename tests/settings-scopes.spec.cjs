const { test, expect } = require('@playwright/test');
const { connectHomeAssistant } = require('./support/fakeHomeAssistant.cjs');
const { accessSelfFor } = require('./support/accessSelf.cjs');

// Settings is organized by who a setting belongs to: the house (Home and
// System groups) or this device; the Profile is the person. See
// docs/settings-scopes.md.

function installCompletedRealWorkspace(page) {
  return page.addInitScript(() => {
    // Only on the first load: a reload must keep what the test changed.
    if (sessionStorage.getItem('settings-scopes.seeded')) return;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('settings-scopes.seeded', '1');
    localStorage.setItem(
      'ha.dashboard.setupJourney.v2',
      JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }),
    );
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.theme', 'light');
    localStorage.setItem('domusui.language.v1', 'it');
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedRealWorkspace(page);
  await connectHomeAssistant(page);
});

test('Settings groups the house, its system and this device, each with its scope', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Impostazioni', exact: true })).toBeVisible();
  for (const [group, description] of [
    ['Casa', 'Impostazioni condivise da tutta la casa'],
    ['Sistema', 'Connessione e configurazione di Domus'],
    ['Questo dispositivo', 'Preferenze valide solo su questo dispositivo'],
  ]) {
    const region = page.getByRole('region', { name: group, exact: true });
    await expect(region).toBeVisible();
    await expect(region.getByText(description)).toBeVisible();
  }
});

test('Settings, Home: waste collection opens and Back returns to Settings', async ({ page }) => {
  await page.goto('/settings');

  await page.getByRole('region', { name: 'Casa', exact: true }).getByRole('button', { name: /^Raccolta rifiuti/ }).click();
  await expect(page).toHaveURL(/\/settings\/home\/waste-collection$/);
  await expect(page.getByRole('heading', { name: 'Raccolta rifiuti', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('region', { name: 'Casa', exact: true })).toBeVisible();
});

test('Settings, System: the connection opens and Back returns to Settings', async ({ page }) => {
  await page.goto('/settings');

  await page.getByRole('region', { name: 'Sistema', exact: true }).getByRole('button', { name: /^Connessioni/ }).click();
  await expect(page).toHaveURL(/\/settings\/connections$/);
  await expect(page.getByRole('heading', { name: 'Connessioni', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('Profile: My devices opens and Back returns to the Profile', async ({ page }) => {
  await page.goto('/settings/profile');

  await page.getByRole('button', { name: /I miei dispositivi/ }).click();
  await expect(page).toHaveURL(/\/settings\/profile\/devices$/);
  await expect(page.getByRole('heading', { name: 'I miei dispositivi', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole('button', { name: /Informazioni personali/ })).toBeVisible();
});

test('Profile and Settings are one page, opened by the avatar and the gear', async ({ page }) => {
  await page.goto('/home');

  await page.getByRole('button', { name: /Apri profilo/ }).click();
  await expect(page).toHaveURL(/\/settings$/);
  const profile = page.getByRole('region', { name: 'Profilo', exact: true });
  await expect(profile).toBeVisible();
  // My devices is one tap away from the top of Settings.
  await profile.getByRole('button', { name: /I miei dispositivi/ }).click();
  await expect(page).toHaveURL(/\/settings\/profile\/devices$/);

  await page.goto('/profile/devices');
  await expect(page).toHaveURL(/\/settings\/profile\/devices$/);
  await expect(page.getByRole('heading', { name: 'I miei dispositivi', exact: true })).toBeVisible();
});

test('Opening and leaving the Profile never shows another Settings page', async ({ page }) => {
  // Records whether the System page title appears at any moment, even for one frame.
  await page.addInitScript(() => {
    window.__systemPageSeen = false;
    // Every added node is checked, so a page replaced in the same task is still seen.
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.textContent?.includes('Stato del sistema')) window.__systemPageSeen = true;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/settings');

  await page.getByRole('region', { name: 'Profilo', exact: true }).getByRole('button').first().click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole('button', { name: /Informazioni personali/ })).toBeVisible();

  // Back from the Profile to Settings, then My devices from the top of Settings.
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('region', { name: 'Casa', exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'Profilo', exact: true }).getByRole('button', { name: /I miei dispositivi/ }).click();
  await expect(page).toHaveURL(/\/settings\/profile\/devices$/);
  await expect(page.getByRole('heading', { name: 'I miei dispositivi', exact: true })).toBeVisible();
  // Checked before any reload, which would reset the record.
  expect(await page.evaluate(() => window.__systemPageSeen)).toBe(false);
});

test('This device: theme and language stay in this browser, as before', async ({ page }) => {
  await page.goto('/settings');

  const device = page.getByRole('region', { name: 'Questo dispositivo', exact: true });
  await device.getByRole('button', { name: /^Aspetto/ }).click();
  await expect(page).toHaveURL(/\/settings\/device\/appearance$/);
  await page.getByRole('radio', { name: 'Scuro' }).click();
  await expect(page.locator('html')).toHaveClass(/dashboard-theme-dark/);
  expect(await page.evaluate(() => localStorage.getItem('ha.dashboard.theme'))).toBe('dark');
  await page.getByRole('button', { name: /Ocean Mist/ }).click();
  expect(await page.evaluate(() => localStorage.getItem('ha.dashboard.background'))).toBe('ocean-mist');

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await device.getByRole('button', { name: /^Lingua/ }).click();
  await expect(page).toHaveURL(/\/settings\/device\/language$/);
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('domusui.language.v1'))).toBe('en');

  // Saved on this device: still there after a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dashboard-theme-dark/);
});

test('Old Profile addresses open This device without adding history', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Impostazioni', exact: true })).toBeVisible();

  await page.goto('/profile/themes');
  await expect(page).toHaveURL(/\/settings\/device\/appearance$/);
  await expect(page.getByRole('heading', { name: 'Aspetto', exact: true })).toBeVisible();

  // The old address was replaced: Back leads to the page before it, not to a redirect loop.
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto('/profile/language');
  await expect(page).toHaveURL(/\/settings\/device\/language$/);
  await expect(page.getByRole('heading', { name: 'Lingua', exact: true })).toBeVisible();
});

const HA = 'http://homeassistant.local:8123';

// A Home Assistant that only knows its Owner: enough for the house entries an
// administrator sees.
async function simulateOwnerHomeAssistant(page) {
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        if (message.type === 'auth') {
          ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
        } else if (message.type === 'subscribe_entities') {
          reply(null);
          ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: {} } }));
        } else if (message.type === 'domusos/access/get_self') {
          reply(accessSelfFor({ id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] }));
        } else if (message.type === 'auth/current_user') {
          reply({ id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] });
        } else if (message.type === 'config/entity_registry/list_for_display') {
          reply({ entity_categories: {}, entities: [] });
        } else if (String(message.type).endsWith('_registry/list')) {
          reply([]);
        } else {
          reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript((hassUrl) => {
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
  }, HA);
}

test('An administrator finds only core configuration in Settings', async ({ page }) => {
  await simulateOwnerHomeAssistant(page);
  await page.goto('/settings');

  const home = page.getByRole('region', { name: 'Casa', exact: true });
  await expect(home.getByRole('button', { name: /^Persone e accessi/ })).toBeVisible();
  await expect(home.getByRole('button')).toHaveText([
    /^Dashboard/,
    /^Piani e stanze/,
    /^Persone e accessi/,
    /^Sicurezza/,
    /^Raccolta rifiuti/,
  ]);
  // House configuration owned by an app stays inside that app.
  await expect(page.getByRole('button', { name: /Energia/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Irrigazione/ })).toHaveCount(0);
});

test('Energy and Irrigation keep their configuration in their own apps', async ({ page }) => {
  await simulateOwnerHomeAssistant(page);

  await page.goto('/consumi');
  await page.getByRole('button', { name: /^Energia/ }).click();
  await expect(page).toHaveURL(/\/consumi\/energia$/);

  await page.goto('/appgallery');
  await page.getByRole('button', { name: /Irrigazione Smart/ }).click();
  await expect(page).toHaveURL(/\/appgallery\/irrigation$/);
  await page.getByTestId('app-workspace-sidebar').getByRole('button', { name: 'Impostazioni' }).click();
  await expect(page).toHaveURL(/\/appgallery\/irrigation\/settings$/);
  await expect(page.getByRole('heading', { name: 'Impostazioni irrigazione' })).toBeVisible();
});
