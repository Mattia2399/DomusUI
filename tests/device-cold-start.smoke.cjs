const { test, expect } = require('@playwright/test');

/*
 * Cold starts of the distributed build (dist/, production CSP) on the paths
 * whose code loads on demand: Settings and its System page (the chart library
 * loads only with the CPU trend), the This device pages, and a fresh start
 * with Kiosk or the screensaver turned on (their running code is a separate
 * chunk). Any page error, failed chunk or chunk error screen fails.
 */

const USER = { id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] };

async function simulateHomeAssistant(page, origin, preferences = {}) {
  await page.routeWebSocket(`${origin.replace(/^http/, 'ws')}/api/websocket`, (ws) => {
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
          case 'domusos/device_power/get_state':
            reply({ status: 'ready', policies: [] });
            break;
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript(([hassUrl, stored]) => {
    if (sessionStorage.getItem('cold-start.smoke')) return;
    sessionStorage.setItem('cold-start.smoke', '1');
    localStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
    for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, JSON.stringify(value));
  }, [origin, preferences]);
}

const navigate = (page, path) => page.evaluate((target) => {
  window.history.pushState({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, path);

function watchProblems(page) {
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Lazy-loaded UI failed|ReferenceError|TypeError|SyntaxError|Content Security Policy/.test(message.text())) {
      problems.push(`console: ${message.text().split('\n')[0]}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && /\/assets\//.test(response.url())) problems.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return problems;
}

async function expectHealthy(page, problems, surface) {
  await page.waitForLoadState('networkidle');
  expect(problems, `${surface}: ${problems.join('\n')}`).toEqual([]);
  await expect(page.getByText('Contenuto non caricato'), `${surface} shows the chunk error screen`).toHaveCount(0);
  await expect(page.locator('#root > *').first()).toBeVisible();
}

test('a fresh Settings, its System page and the This device pages load their own code', async ({ page, baseURL }) => {
  const problems = watchProblems(page);
  await simulateHomeAssistant(page, new URL(baseURL).origin);

  await page.goto('/settings');
  await expectHealthy(page, problems, '/settings');
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible();

  for (const [path, heading] of [
    ['/settings/system', 'Sistema'],
    ['/settings/device/screensaver', 'Screensaver'],
    ['/settings/device/kiosk', 'Modalità Kiosk'],
    ['/settings/device/power', 'Alimentazione e ricarica'],
  ]) {
    await navigate(page, path);
    await expectHealthy(page, problems, path);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  }
});

test('a fresh start with Kiosk on comes up as the panel', async ({ page, baseURL }) => {
  const problems = watchProblems(page);
  await simulateHomeAssistant(page, new URL(baseURL).origin, {
    'domusui.kiosk.v1': { version: 1, enabled: true, hideNavigation: true, startRoute: '/home', preferFullscreen: true, keepScreenAwake: false },
  });

  await page.goto('/settings');
  await expectHealthy(page, problems, 'Kiosk start');
  await expect(page).toHaveURL(/\/home$/);
  // The running panel is its own chunk: its corner is there once it loaded.
  await expect(page.getByTestId('kiosk-exit-handle')).toBeVisible();
});

test('a fresh start with the screensaver on shows it when idle, and wakes', async ({ page, baseURL }) => {
  const problems = watchProblems(page);
  await page.clock.install();
  await simulateHomeAssistant(page, new URL(baseURL).origin, {
    'domusui.screensaver.v1': { version: 1, enabled: true, timeoutMinutes: 1, mode: 'minimal', showDate: true },
  });

  await page.goto('/');
  await expectHealthy(page, problems, 'Home');
  await page.clock.fastForward(61_000);
  await expect(page.getByTestId('domus-screensaver')).toBeVisible();
  await expect(page.getByTestId('domus-screensaver-time')).toBeVisible();
  await page.mouse.click(300, 300);
  await expect(page.getByTestId('domus-screensaver')).toHaveCount(0);
  expect(problems).toEqual([]);
});
