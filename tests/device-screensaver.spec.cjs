const { test, expect } = require('@playwright/test');
const { accessSelfFor } = require('./support/accessSelf.cjs');

/*
 * Settings › This device › Screensaver, against a simulated Home Assistant.
 * Time is driven by Playwright's clock: nobody waits a real minute. Screens
 * are captured at 390, 820 and 1440 px, light and dark, when
 * SCREENSAVER_SCREENSHOTS is set.
 */

const HA = 'http://homeassistant.local:8123';
const USER = { id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] };
const ROUTE = '/settings/device/screensaver';
const STORAGE_KEY = 'domusui.screensaver.v1';

async function simulateHomeAssistant(page, { screensaver, background } = {}) {
  const home = { messages: [], socket: null, entitiesId: null };
  /** A state change pushed by Home Assistant, as a light switched by someone else. */
  home.pushState = (state) => {
    home.socket.send(JSON.stringify({
      id: home.entitiesId,
      type: 'event',
      event: { c: { 'light.cucina': { '+': { s: state, lu: Date.now() / 1000 } } } },
    }));
  };
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    home.socket = ws;
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        home.messages.push(message);
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities': {
            home.entitiesId = message.id;
            reply(null);
            const now = Date.now() / 1000;
            ws.send(JSON.stringify({
              id: message.id,
              type: 'event',
              event: { a: { 'light.cucina': { s: 'off', a: { friendly_name: 'Luce cucina' }, c: 'ctx', lc: now, lu: now } } },
            }));
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
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript(([hassUrl, key, initial, wallpaper]) => {
    if (sessionStorage.getItem('screensaver.e2e')) return;
    sessionStorage.setItem('screensaver.e2e', '1');
    localStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
    if (initial) localStorage.setItem(key, JSON.stringify(initial));
    if (wallpaper) localStorage.setItem('ha.dashboard.background', wallpaper);
  }, [HA, STORAGE_KEY, screensaver ?? null, background ?? null]);
  return home;
}

const screensaver = (page) => page.getByTestId('domus-screensaver');
const screensaverSwitch = (page) => page.getByRole('switch', { name: 'Screensaver' });
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STORAGE_KEY);
const ON_ONE_MINUTE = { version: 1, enabled: true, timeoutMinutes: 1, mode: 'minimal', showDate: true };

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function capture(page, name) {
  await expectNoHorizontalOverflow(page);
  if (process.env.SCREENSAVER_SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSAVER_SCREENSHOTS}/${name}.png` });
}

/** The clock and date must fit the screen, inside the safe area. */
async function expectCompositionInside(page, width, height) {
  for (const testId of ['domus-screensaver-time', 'domus-screensaver-date']) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, testId).not.toBeNull();
    expect(box.x, testId).toBeGreaterThanOrEqual(0);
    expect(box.y, testId).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, testId).toBeLessThanOrEqual(width);
    expect(box.y + box.height, testId).toBeLessThanOrEqual(height);
  }
}

/** Wakes it the way a finger does, where the given point is. */
async function tapAt(page, x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

test('A–B: reached from Settings › This device, turned on with 1 minute, kept at once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simulateHomeAssistant(page);
  await page.goto('/settings');

  const device = page.getByRole('region', { name: 'Questo dispositivo' });
  await expect(device.getByRole('button', { name: /^Screensaver/ })).toContainText('No');
  await device.getByRole('button', { name: /^Screensaver/ }).click();
  await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));
  await expect(screensaverSwitch(page)).toHaveAttribute('aria-checked', 'false');

  await screensaverSwitch(page).click();
  await page.getByRole('button', { name: /Avvia dopo/ }).click();
  await page.getByRole('option', { name: '1 minuto' }).click();

  await expect.poll(() => stored(page)).toEqual(ON_ONE_MINUTE);
  await expect(page.getByText('Attivo: compare dopo 1 minuto senza tocchi e sparisce al primo tocco.')).toBeVisible();
});

test('C–D: appears after a minute without activity and the tap only brings back the same page', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.clock.install();
  const home = await simulateHomeAssistant(page, { screensaver: ON_ONE_MINUTE });
  await page.goto('/settings/device/appearance');
  await expect(page.getByRole('heading', { name: 'Aspetto' })).toBeVisible();
  const messagesBefore = home.messages.length;

  await page.clock.fastForward(30_000);
  await expect(screensaver(page)).toHaveCount(0);
  await page.clock.fastForward(31_000);
  await expect(screensaver(page)).toBeVisible();
  await expect(screensaver(page)).toHaveAttribute('data-source', 'idle');
  await expect(page.getByTestId('domus-screensaver-time')).toBeVisible();
  // The app below is out of reach while it shows.
  expect(await page.evaluate(() => document.getElementById('root').inert)).toBe(true);

  await tapAt(page, 410, 600);
  await expect(screensaver(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/device\/appearance$/);
  await expect(page.getByRole('heading', { name: 'Aspetto' })).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('root').inert)).toBe(false);
  // Showing and closing it sent nothing to Home Assistant.
  expect(home.messages.slice(messagesBefore).filter((message) => message.type === 'call_service')).toEqual([]);
});

test.describe('E: the first touch', () => {
  // A real touch screen: the browser sends its click where the finger was.
  test.use({ hasTouch: true });

  test('E: the tap that wakes it does not press what is below', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install();
    await simulateHomeAssistant(page, { screensaver: ON_ONE_MINUTE });
    await page.goto('/settings');
    const appearanceRow = page.getByRole('region', { name: 'Questo dispositivo' }).getByRole('button', { name: /^Aspetto/ });
    await appearanceRow.scrollIntoViewIfNeeded();
    const box = await appearanceRow.boundingBox();

    await page.clock.fastForward(61_000);
    await expect(screensaver(page)).toBeVisible();
    // Right on the Appearance row, which would open its page.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(screensaver(page)).toHaveCount(0);
    await page.clock.fastForward(1_000);
    await expect(page).toHaveURL(/\/settings$/);

    // The next tap works as usual.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/\/settings\/device\/appearance$/);
  });

  test('E: a mouse click that wakes it does not press what is below either', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.clock.install();
    await simulateHomeAssistant(page, { screensaver: ON_ONE_MINUTE });
    await page.goto('/settings');
    const appearanceRow = page.getByRole('region', { name: 'Questo dispositivo' }).getByRole('button', { name: /^Aspetto/ });
    await appearanceRow.scrollIntoViewIfNeeded();
    const box = await appearanceRow.boundingBox();

    await page.clock.fastForward(61_000);
    await expect(screensaver(page)).toBeVisible();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(screensaver(page)).toHaveCount(0);
    await page.clock.fastForward(1_000);
    await expect(page).toHaveURL(/\/settings$/);
  });
});

test('a menu left open below is still open after waking, by touch or by key', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.clock.install();
  await simulateHomeAssistant(page, { screensaver: ON_ONE_MINUTE });
  await page.goto(ROUTE);
  // A Headless UI list, which closes on an outside tap and on Escape.
  await page.getByRole('button', { name: /Avvia dopo/ }).click();
  await expect(page.getByRole('listbox')).toBeVisible();

  await page.clock.fastForward(61_000);
  await expect(screensaver(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(screensaver(page)).toHaveCount(0);
  await expect(page.getByRole('listbox')).toBeVisible();

  await page.clock.fastForward(61_000);
  await expect(screensaver(page)).toBeVisible();
  await tapAt(page, 100, 1000);
  await expect(screensaver(page)).toHaveCount(0);
  await expect(page.getByRole('listbox')).toBeVisible();
  expect((await stored(page)).timeoutMinutes).toBe(1);
});

test('F–G: previews Minimal and Ambient at once, without saving, and a key closes them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await simulateHomeAssistant(page, { screensaver: ON_ONE_MINUTE });
  await page.goto(ROUTE);

  await page.getByRole('button', { name: 'Avvia anteprima' }).click();
  await expect(screensaver(page)).toHaveAttribute('data-source', 'preview');
  await expect(screensaver(page)).toHaveAttribute('data-mode', 'minimal');
  await page.keyboard.press('Escape');
  await expect(screensaver(page)).toHaveCount(0);

  await page.getByRole('radio', { name: 'Ambient' }).click();
  await page.getByRole('button', { name: 'Avvia anteprima' }).click();
  await expect(screensaver(page)).toHaveAttribute('data-mode', 'ambient');
  await expect(page.locator('[data-testid="domus-screensaver-display"] .dashboard-background-layer')).toHaveCount(1);
  await page.mouse.move(200, 200);
  await page.mouse.move(400, 360);
  await expect(screensaver(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));
  expect((await stored(page)).mode).toBe('ambient');
});

test('H–I: kept after a reload, and once turned off it no longer appears', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await simulateHomeAssistant(page, { screensaver: ON_ONE_MINUTE });
  await page.goto(ROUTE);
  await page.reload();

  await expect(screensaverSwitch(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: /Avvia dopo/ })).toContainText('1 minuto');
  await page.clock.fastForward(61_000);
  await expect(screensaver(page)).toBeVisible();
  await tapAt(page, 200, 400);
  await expect(screensaver(page)).toHaveCount(0);

  await screensaverSwitch(page).click();
  await expect.poll(async () => (await stored(page)).enabled).toBe(false);
  await page.clock.fastForward(30 * 60_000);
  await expect(screensaver(page)).toHaveCount(0);
});

test('updates from Home Assistant are not activity', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.clock.install();
  const home = await simulateHomeAssistant(page, { screensaver: ON_ONE_MINUTE });
  await page.goto('/settings');
  await expect.poll(() => home.entitiesId).not.toBeNull();

  for (const state of ['on', 'off', 'on']) {
    await page.clock.fastForward(20_000);
    home.pushState(state);
  }
  await page.clock.fastForward(2_000);
  await expect(screensaver(page)).toBeVisible();
});

for (const scheme of ['light', 'dark']) {
  test(`Ambient uses the background chosen on this device, in ${scheme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.emulateMedia({ colorScheme: scheme });
    await simulateHomeAssistant(page, { screensaver: { ...ON_ONE_MINUTE, mode: 'ambient' }, background: 'home-hub' });
    await page.goto(ROUTE);
    await page.getByRole('button', { name: 'Avvia anteprima' }).click();
    await expect(screensaver(page)).toHaveCSS('opacity', '1');

    const display = page.getByTestId('domus-screensaver-display');
    await expect(display).toHaveClass(/dashboard-background-home-hub/);
    await expect(display).toHaveClass(new RegExp(`dashboard-theme-${scheme}`));
    // Only the plain background needs the soft light of its own.
    await expect(page.getByTestId('domus-screensaver-ambient-light')).toHaveCount(0);
    await capture(page, `screensaver-ambient-home-hub-1180x820-${scheme}`);
  });
}

for (const [width, height] of [[390, 844], [820, 1180], [1180, 820], [1440, 960]]) {
  for (const scheme of ['light', 'dark']) {
    test(`fits ${width}×${height} in ${scheme} mode, Minimal and Ambient, and its settings`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await simulateHomeAssistant(page, { screensaver: ON_ONE_MINUTE });
      await page.goto(ROUTE);
      await expect(screensaverSwitch(page)).toHaveAttribute('aria-checked', 'true');
      await capture(page, `screensaver-settings-${width}x${height}-${scheme}`);

      for (const mode of ['Minimal', 'Ambient']) {
        await page.getByRole('radio', { name: mode }).click();
        await page.getByRole('button', { name: 'Avvia anteprima' }).click();
        await expect(screensaver(page)).toBeVisible();
        // Fully faded in before it is measured and captured.
        await expect(screensaver(page)).toHaveCSS('opacity', '1');
        await expectCompositionInside(page, width, height);
        await capture(page, `screensaver-${mode.toLowerCase()}-${width}x${height}-${scheme}`);
        await page.keyboard.press('Escape');
        await expect(screensaver(page)).toHaveCount(0);
      }
    });
  }
}
