const { test, expect } = require('@playwright/test');
const { accessSelfFor } = require('./support/accessSelf.cjs');

/*
 * Domus Access Control in the interface, against a simulated Home Assistant
 * that answers domusos/access/get_self like the backend. Interface only: the
 * backend and Home Assistant still decide every request (P2.5).
 */

const HA = 'http://homeassistant.local:8123';
const ADMIN = { id: 'a'.repeat(32), name: 'Admin', is_owner: false, is_admin: true, credentials: [], mfa_modules: [] };
const MEMBER = { id: 'b'.repeat(32), name: 'Member', is_owner: false, is_admin: false, credentials: [], mfa_modules: [] };
const RETURN_TO_HA = 'Torna in Home Assistant';
const MAIN_PAGES = ['App Gallery', 'Dashboard', 'Stanze', 'Automazioni', 'Sicurezza', 'Consumi'];

async function simulateHomeAssistant(page, { user = ADMIN, role, grants, state, delayMs = 0, failWith, kiosk } = {}) {
  const home = { messages: [], accessAnsweredAt: null };
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
          case 'subscribe_entities':
            reply(null);
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: {} } }));
            break;
          case 'domusos/access/get_self':
            setTimeout(() => {
              home.accessAnsweredAt = Date.now();
              if (failWith) fail(failWith, failWith === 'unknown_command' ? 'Unknown command.' : 'Domus access control failed');
              else reply(accessSelfFor(user, { role, grants, state }));
            }, delayMs);
            break;
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
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript(([hassUrl, kioskPreferences]) => {
    if (sessionStorage.getItem('access.e2e')) return;
    sessionStorage.setItem('access.e2e', '1');
    localStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
    if (kioskPreferences) localStorage.setItem('domusui.kiosk.v1', JSON.stringify(kioskPreferences));
  }, [HA, kiosk ?? null]);
  return home;
}

const sidebar = (page) => page.getByRole('complementary').first();
const pageLink = (scope, label) => scope.getByRole('button', { name: `Apri ${label}`, exact: true });

async function visiblePages(scope) {
  const visible = [];
  for (const label of MAIN_PAGES) if (await pageLink(scope, label).count()) visible.push(label);
  return visible;
}

test.describe('Access Control in the interface', () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test('an administrator sees every page and the way back to Home Assistant', async ({ page }) => {
    const home = await simulateHomeAssistant(page, { user: ADMIN });
    await page.goto('/home');
    await expect(page.getByRole('button', { name: RETURN_TO_HA })).toBeVisible();
    expect(await visiblePages(page)).toEqual(MAIN_PAGES);
    // The request names no account, role or capability.
    expect(home.messages.filter((message) => message.type === 'domusos/access/get_self').map(({ id, ...rest }) => rest)).toEqual([
      { type: 'domusos/access/get_self' },
    ]);
  });

  test('a member has no way back to Home Assistant and keeps its own pages', async ({ page }) => {
    await simulateHomeAssistant(page, { user: MEMBER });
    await page.goto('/home');
    await expect(pageLink(page, 'Consumi')).toBeVisible();
    await expect(page.getByRole('button', { name: RETURN_TO_HA })).toHaveCount(0);
    expect(await visiblePages(page)).toEqual(MAIN_PAGES);
  });

  test('a restricted account sees only its pages, and an address it may not open says so', async ({ page }) => {
    await simulateHomeAssistant(page, { user: MEMBER, role: 'restricted' });
    await page.goto('/home');
    await expect(pageLink(page, 'Stanze')).toBeVisible();
    expect(await visiblePages(page)).toEqual(['App Gallery', 'Dashboard', 'Stanze']);

    await page.goto('/consumi');
    await expect(page.getByRole('heading', { name: 'Non disponibile per il tuo account' })).toBeVisible();
    await expect(page.getByText('Energia', { exact: true })).toHaveCount(0);
    // The shell stays, and leads to what is available.
    await expect(pageLink(page, 'Dashboard')).toBeVisible();
    await page.getByRole('button', { name: 'Vai alla Home' }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('a member opening an administrator page directly gets "not available", never the page', async ({ page }) => {
    await simulateHomeAssistant(page, { user: MEMBER });
    await page.goto('/settings/device/power');
    await expect(page.getByRole('heading', { name: 'Non disponibile per il tuo account' })).toBeVisible();
    await expect(page.getByText('Alimentazione e ricarica')).toHaveCount(0);

    await page.goto('/settings');
    await expect(page.getByRole('button', { name: /^Aspetto/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Alimentazione e ricarica/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Connessioni/ })).toHaveCount(0);
  });

  test('a slow answer never shows a member, for a moment, what only an administrator has', async ({ page }) => {
    await simulateHomeAssistant(page, { user: MEMBER, delayMs: 4000 });
    await page.goto('/settings/device/power');
    const checking = page.getByText('Verifica dell’account…');
    await expect(checking).toBeVisible();
    let samples = 0;
    for (;;) {
      // One look at the page: while the profile is unknown there is no navigation,
      // no way back to Home Assistant and no administrator page.
      const look = await page.evaluate((returnLabel) => {
        const text = document.body.innerText;
        const buttons = [...document.querySelectorAll('button')].map((button) => button.getAttribute('aria-label') ?? '');
        return {
          checking: text.includes('Verifica dell’account…'),
          pages: buttons.filter((label) => /^Apri (App Gallery|Dashboard|Stanze|Automazioni|Sicurezza|Consumi)$/.test(label)),
          returnToHa: buttons.includes(returnLabel),
          power: text.includes('Alimentazione e ricarica'),
        };
      }, RETURN_TO_HA);
      if (!look.checking) break;
      expect(look).toEqual({ checking: true, pages: [], returnToHa: false, power: false });
      samples += 1;
      await page.waitForTimeout(150);
    }
    expect(samples).toBeGreaterThan(5);
    await expect(page.getByRole('heading', { name: 'Non disponibile per il tuo account' })).toBeVisible();
    await expect(page.getByRole('button', { name: RETURN_TO_HA })).toHaveCount(0);
  });

  test('without an answer the interface grants nothing and offers to try again', async ({ page }) => {
    await simulateHomeAssistant(page, { user: ADMIN, failWith: 'unknown_error' });
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Autorizzazioni non disponibili' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Riprova' })).toBeVisible();
    await expect(page.getByRole('button', { name: RETURN_TO_HA })).toHaveCount(0);
    expect(await visiblePages(page)).toEqual([]);
  });

  test('a Home Assistant without Domus access control is told apart from an error', async ({ page }) => {
    await simulateHomeAssistant(page, { user: ADMIN, failWith: 'unknown_command' });
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Domus non è pronta' })).toBeVisible();
  });

  test('an untrusted policy keeps a member on the safe floor with a notice', async ({ page }) => {
    await simulateHomeAssistant(page, { user: MEMBER, role: 'locked' });
    await page.goto('/home');
    await expect(page.getByText('Le autorizzazioni Domus richiedono attenzione')).toBeVisible();
    expect(await visiblePages(page)).toEqual(['App Gallery', 'Dashboard', 'Stanze']);
    await page.goto('/consumi');
    await expect(page.getByRole('heading', { name: 'Non disponibile per il tuo account' })).toBeVisible();
  });

  test('a locked administrator is not given every page', async ({ page }) => {
    await simulateHomeAssistant(page, { user: ADMIN, role: 'locked' });
    await page.goto('/home');
    await expect(page.getByText(/Un amministratore di Home Assistant può ripristinarle/)).toBeVisible();
    expect(await visiblePages(page)).toEqual(['App Gallery', 'Dashboard', 'Stanze']);
    await expect(page.getByRole('button', { name: RETURN_TO_HA })).toHaveCount(0);
  });
});

test.describe('Access Control on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the bottom bar and the menu of a restricted account match the desktop navigation', async ({ page }) => {
    await simulateHomeAssistant(page, { user: MEMBER, role: 'restricted' });
    await page.goto('/home');
    const bar = page.getByRole('navigation', { name: 'Navigazione principale' });
    await expect(bar).toBeVisible();
    expect(await visiblePages(bar)).toEqual(expect.arrayContaining(['Dashboard']));
    expect(await visiblePages(bar)).not.toContain('Consumi');
    expect(await visiblePages(bar)).not.toContain('Sicurezza');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Access Control with Kiosk mode', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('a wall panel account in Kiosk mode opens its Home with no navigation and no error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await simulateHomeAssistant(page, {
      user: MEMBER,
      role: 'wall_panel',
      kiosk: { version: 1, enabled: true, hideNavigation: true, startRoute: '/home', preferFullscreen: false, keepScreenAwake: false },
    });
    await page.goto('/home');
    await expect(page.getByText('Verifica dell’account…')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: RETURN_TO_HA })).toHaveCount(0);
    expect(await visiblePages(page)).toEqual([]);
    // Its Home opens (Kiosk brings every reload back to the start page).
    await expect(page.locator('[data-access-notice]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
