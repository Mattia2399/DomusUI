const { test, expect } = require('@playwright/test');
const { accessSelfFor } = require('./support/accessSelf.cjs');

/*
 * Settings › This device › Kiosk mode, against a simulated Home Assistant.
 * Full screen and the screen wake lock are replaced by recording stand-ins
 * (headless Chromium cannot show either): this suite checks what Domus does
 * with them, kioskDisplay.test.ts checks the browser contract. Time is driven
 * by Playwright's clock. Screens are captured when KIOSK_SCREENSHOTS is set.
 */

const HA = 'http://homeassistant.local:8123';
const USER = { id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] };
const ROUTE = '/settings/device/kiosk';
const KIOSK_KEY = 'domusui.kiosk.v1';
const SCREENSAVER_KEY = 'domusui.screensaver.v1';
const KIOSK_ON = { version: 1, enabled: true, hideNavigation: true, startRoute: '/home', preferFullscreen: true, keepScreenAwake: true };

async function simulateHomeAssistant(page, { kiosk, screensaver, fullscreen = 'ok', wakeLock = 'ok' } = {}) {
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
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: {} } }));
            break;
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
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript(([hassUrl, keys, initial, apis]) => {
    if (!sessionStorage.getItem('kiosk.e2e')) {
      sessionStorage.setItem('kiosk.e2e', '1');
      localStorage.clear();
      localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
      localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
      localStorage.setItem('hass_auth_tokens', JSON.stringify({
        hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
      }));
      if (initial.kiosk) localStorage.setItem(keys.kiosk, JSON.stringify(initial.kiosk));
      if (initial.screensaver) localStorage.setItem(keys.screensaver, JSON.stringify(initial.screensaver));
    }
    // Recording stand-ins for the two browser features.
    const record = (window.__kiosk = { fullscreenRequests: 0, fullscreenExits: 0, wakeLockRequests: 0, wakeLockReleases: 0 });
    let fullscreenElement = null;
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => apis.fullscreen !== 'missing' });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
    Element.prototype.requestFullscreen = apis.fullscreen === 'missing'
      ? undefined
      : async function requestFullscreen() {
        record.fullscreenRequests += 1;
        if (apis.fullscreen === 'refuse') throw new TypeError('Permissions check failed');
        fullscreenElement = this;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
    document.exitFullscreen = async () => {
      record.fullscreenExits += 1;
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    window.__leaveFullscreenFromOutside = () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: apis.wakeLock === 'missing'
        ? undefined
        : {
          request: async () => {
            record.wakeLockRequests += 1;
            const target = new EventTarget();
            const sentinel = {
              released: false,
              release: async () => {
                record.wakeLockReleases += 1;
                sentinel.released = true;
                target.dispatchEvent(new Event('release'));
              },
              addEventListener: (type, listener) => target.addEventListener(type, listener),
            };
            return sentinel;
          },
        },
    });
  }, [HA, { kiosk: KIOSK_KEY, screensaver: SCREENSAVER_KEY }, { kiosk: kiosk ?? null, screensaver: screensaver ?? null }, { fullscreen, wakeLock }]);
}

const kioskSwitch = (page) => page.getByRole('switch', { name: 'Modalità Kiosk' });
const record = (page) => page.evaluate(() => window.__kiosk);
/** Wake locks held now (the development build mounts effects twice and lets the first go). */
const heldWakeLocks = async (page) => {
  const { wakeLockRequests, wakeLockReleases } = await record(page);
  return wakeLockRequests - wakeLockReleases;
};
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KIOSK_KEY);
const handle = (page) => page.getByTestId('kiosk-exit-handle');
const exitDialog = (page) => page.getByRole('dialog', { name: 'Uscire dalla modalità Kiosk?' });
const leftSidebar = (page) => page.locator('aside.liquid-glass-panel');
const bottomBar = (page) => page.getByRole('navigation', { name: 'Navigazione principale' });
const menuButton = (page) => page.getByRole('button', { name: 'Apri menu laterale' });
const mainContent = (page) => page.locator('#dashboard-main-content');

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function capture(page, name) {
  await expectNoHorizontalOverflow(page);
  if (process.env.KIOSK_SCREENSHOTS) await page.screenshot({ path: `${process.env.KIOSK_SCREENSHOTS}/${name}.png` });
}

/** Holds the exit corner as a finger would, for the given time. */
async function holdHandle(page, ms) {
  const box = await handle(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.fastForward(ms);
  await page.mouse.up();
}

test('A–C: turned on in Settings › This device, then started: the navigation goes and Home opens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.clock.install();
  await simulateHomeAssistant(page);
  await page.goto('/settings');

  const device = page.getByRole('region', { name: 'Questo dispositivo' });
  await expect(device.getByRole('button', { name: /^Modalità Kiosk/ })).toContainText('No');
  await device.getByRole('button', { name: /^Modalità Kiosk/ }).click();
  await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));

  await kioskSwitch(page).click();
  await expect.poll(() => stored(page)).toEqual(KIOSK_ON);
  // Saving is not starting: the navigation is still there, nothing was asked of the browser.
  await expect(leftSidebar(page)).toBeVisible();
  expect((await record(page)).fullscreenRequests).toBe(0);
  await expect(page.getByRole('button', { name: /Pagina iniziale/ })).toContainText('Home');

  await page.getByRole('button', { name: 'Avvia modalità pannello' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(leftSidebar(page)).toHaveCount(0);
  await expect(handle(page)).toBeVisible();
  await expect.poll(async () => (await record(page)).fullscreenRequests).toBe(1);
  await expect.poll(() => heldWakeLocks(page)).toBe(1);
});

for (const [width, height] of [[1440, 960], [1180, 820], [820, 1180], [390, 844]]) {
  test(`D: at ${width}×${height} the page takes the room of the hidden navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await simulateHomeAssistant(page, { kiosk: { ...KIOSK_ON, enabled: false } });
    await page.goto('/home');
    await expect(mainContent(page)).toBeVisible();
    const before = await mainContent(page).boundingBox();
    const hadSidebar = await leftSidebar(page).count();
    const hadMenu = await menuButton(page).count();
    const hadBottomBar = await bottomBar(page).count();
    expect(hadSidebar + hadMenu + hadBottomBar).toBeGreaterThan(0);

    await page.evaluate(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    }, [KIOSK_KEY, KIOSK_ON]);
    await page.reload();
    await expect(handle(page)).toBeVisible();

    await expect(leftSidebar(page)).toHaveCount(0);
    await expect(menuButton(page)).toHaveCount(0);
    await expect(bottomBar(page)).toHaveCount(0);
    const after = await mainContent(page).boundingBox();
    // No empty column where the sidebar was, no inset left for the mobile bars.
    expect(after.x).toBeLessThanOrEqual(Math.min(before.x, 24));
    expect(after.width).toBeGreaterThanOrEqual(before.width);
    if (hadMenu) expect(after.y).toBeLessThan(before.y);
    await expectNoHorizontalOverflow(page);
  });
}

test('E: the screensaver still comes, and its wake brings back the panel as it was', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.clock.install();
  await simulateHomeAssistant(page, {
    kiosk: KIOSK_ON,
    screensaver: { version: 1, enabled: true, timeoutMinutes: 1, mode: 'ambient', showDate: true },
  });
  await page.goto('/home');
  await expect(handle(page)).toBeVisible();

  await page.clock.fastForward(61_000);
  const screensaver = page.getByTestId('domus-screensaver');
  await expect(screensaver).toBeVisible();
  await page.mouse.click(600, 400);
  await expect(screensaver).toHaveCount(0);

  await expect(page).toHaveURL(/\/home$/);
  await expect(handle(page)).toBeVisible();
  await expect(leftSidebar(page)).toHaveCount(0);
  await expect(exitDialog(page)).toHaveCount(0);
});

test('F: a tap on the corner does nothing; held for 3 seconds it asks, and Cancel stays', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.clock.install();
  await simulateHomeAssistant(page, { kiosk: KIOSK_ON });
  await page.goto('/home');
  await expect(handle(page)).toBeVisible();

  await handle(page).click();
  await holdHandle(page, 1_000);
  await expect(exitDialog(page)).toHaveCount(0);

  await holdHandle(page, 3_100);
  await expect(exitDialog(page)).toBeVisible();
  await exitDialog(page).getByRole('button', { name: 'Annulla' }).click();
  await expect(exitDialog(page)).toHaveCount(0);
  await expect(handle(page)).toBeVisible();
  expect((await stored(page)).enabled).toBe(true);
});

test('G: Leave brings the navigation back on the same page and lets the screen sleep', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await simulateHomeAssistant(page, { kiosk: { ...KIOSK_ON, enabled: false } });
  await page.goto(ROUTE);
  await kioskSwitch(page).click();
  await page.getByRole('button', { name: 'Avvia modalità pannello' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(() => heldWakeLocks(page)).toBe(1);

  // The keyboard way: Ctrl+Alt+K.
  await page.keyboard.press('Control+Alt+KeyK');
  await expect(exitDialog(page)).toBeVisible();
  await page.waitForTimeout(500);
  await capture(page, 'kiosk-exit-1440x960');
  await exitDialog(page).getByRole('button', { name: 'Esci' }).click();

  await expect(leftSidebar(page)).toBeVisible();
  await expect(handle(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/home$/);
  expect((await stored(page)).enabled).toBe(false);
  await expect.poll(() => heldWakeLocks(page)).toBe(0);
  await expect.poll(async () => (await record(page)).fullscreenExits).toBe(1);
});

test('H: after a reload the panel comes back on its start page, without asking for full screen', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await simulateHomeAssistant(page, { kiosk: { ...KIOSK_ON, startRoute: '/rooms' } });
  await page.goto('/settings');

  await expect(page).toHaveURL(/\/rooms$/);
  await expect(handle(page)).toBeVisible();
  await expect(menuButton(page)).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/rooms$/);
  await expect(handle(page)).toBeVisible();
  expect((await record(page)).fullscreenRequests).toBe(0);
  await expect.poll(() => heldWakeLocks(page)).toBe(1);
});

test('the person can leave full screen without leaving Kiosk, and go back to it', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.clock.install();
  await simulateHomeAssistant(page, { kiosk: { ...KIOSK_ON, enabled: false } });
  await page.goto(ROUTE);
  await kioskSwitch(page).click();
  await page.getByRole('button', { name: 'Avvia modalità pannello' }).click();
  await expect.poll(async () => (await record(page)).fullscreenRequests).toBe(1);

  await page.evaluate(() => window.__leaveFullscreenFromOutside());
  await expect(handle(page)).toBeVisible();
  await holdHandle(page, 3_100);
  await exitDialog(page).getByRole('button', { name: 'Torna a schermo intero' }).click();
  await expect.poll(async () => (await record(page)).fullscreenRequests).toBe(2);
  await expect(handle(page)).toBeVisible();
});

test('I: without full screen Kiosk works anyway and says why', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await simulateHomeAssistant(page, { kiosk: { ...KIOSK_ON, enabled: false }, fullscreen: 'missing' });
  await page.goto(ROUTE);
  await kioskSwitch(page).click();
  await expect(page.getByTestId('kiosk-status').filter({ hasText: 'Schermo intero' })).toContainText('Non supportato dal browser');

  await page.getByRole('button', { name: 'Avvia modalità pannello' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(handle(page)).toBeVisible();
  await expect(menuButton(page)).toHaveCount(0);
});

test('a refused full screen leaves Kiosk on', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await simulateHomeAssistant(page, { kiosk: { ...KIOSK_ON, enabled: false }, fullscreen: 'refuse' });
  await page.goto(ROUTE);
  await kioskSwitch(page).click();
  await page.getByRole('button', { name: 'Avvia modalità pannello' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(handle(page)).toBeVisible();
  expect((await stored(page)).enabled).toBe(true);
});

test('J: without a wake lock Kiosk works anyway and says why', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simulateHomeAssistant(page, { kiosk: { ...KIOSK_ON, enabled: false }, wakeLock: 'missing' });
  await page.goto(ROUTE);
  await kioskSwitch(page).click();
  await expect(page.getByTestId('kiosk-status').filter({ hasText: 'Schermo sempre attivo' })).toContainText('Non supportato dal browser');

  await page.getByRole('button', { name: 'Avvia modalità pannello' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(handle(page)).toBeVisible();
  await expect(bottomBar(page)).toHaveCount(0);
});

for (const scheme of ['light', 'dark']) {
  for (const [width, height] of [[390, 844], [820, 1180], [1180, 820], [1440, 960]]) {
    test(`looks right at ${width}×${height} in ${scheme} mode: settings, panel and its screensaver`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.clock.install();
      await simulateHomeAssistant(page, {
        kiosk: { ...KIOSK_ON, enabled: false },
        screensaver: { version: 1, enabled: true, timeoutMinutes: 1, mode: width >= 1000 ? 'ambient' : 'minimal', showDate: true },
      });
      await page.goto(ROUTE);
      await kioskSwitch(page).click();
      await expect(page.getByRole('button', { name: 'Avvia modalità pannello' })).toBeVisible();
      await capture(page, `kiosk-settings-${width}x${height}-${scheme}`);

      await page.getByRole('button', { name: 'Avvia modalità pannello' }).click();
      await expect(page).toHaveURL(/\/home$/);
      await expect(handle(page)).toBeVisible();
      // The handle keeps clear of the screen edges and the safe area.
      const box = await handle(page).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      await capture(page, `kiosk-home-${width}x${height}-${scheme}`);

      await page.clock.fastForward(61_000);
      await expect(page.getByTestId('domus-screensaver')).toHaveCSS('opacity', '1');
      await capture(page, `kiosk-screensaver-${width}x${height}-${scheme}`);
    });
  }
}
