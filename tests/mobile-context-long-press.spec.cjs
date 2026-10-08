const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';

test.use({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

const rootLayout = {
  version: 13,
  widgetTypeLayoutOverrides: {},
  sections: [],
  widgets: [
    {
      id: 'light.living_room_lamp',
      kind: 'light',
      title: 'Root Light',
      entityId: 'light.living_room_lamp',
      dataSource: 'mock',
      status: 'Idle',
      isOn: true,
      value: 60,
      unit: '%',
      layout: { i: 'light.living_room_lamp', x: 0, y: 0, w: 2, h: 2 },
    },
    {
      id: 'fan.root',
      kind: 'fan',
      title: 'Root Fan',
      entityId: 'fan.root',
      dataSource: 'mock',
      status: 'on',
      isOn: true,
      value: 50,
      unit: '%',
      layout: { i: 'fan.root', x: 2, y: 0, w: 2, h: 2 },
    },
    {
      id: 'calendar.root',
      kind: 'calendar',
      title: 'Root Calendar',
      entityId: 'calendar.root',
      dataSource: 'mock',
      status: 'on',
      isOn: true,
      value: 0,
      unit: '',
      layout: { i: 'calendar.root', x: 0, y: 2, w: 4, h: 3 },
    },
    {
      id: 'humidifier.root',
      kind: 'humidifier',
      title: 'Root Humidifier',
      entityId: 'humidifier.root',
      dataSource: 'mock',
      status: 'on',
      isOn: true,
      value: 50,
      unit: '%',
      layout: { i: 'humidifier.root', x: 0, y: 5, w: 2, h: 2 },
    },
  ],
};

const stackLayout = {
  version: 13,
  widgetTypeLayoutOverrides: {},
  sections: [
    {
      id: 'section-stack-context',
      kind: 'stack-grid',
      title: 'Context Stack',
      stackColumns: 4,
      stackShowBackground: true,
      stackShowBorder: true,
      stackShowHeader: true,
      stackUseFavoritesGrid: false,
      layout: { i: 'section-stack-context', x: 0, y: 0, w: 12, h: 10 },
    },
  ],
  widgets: [
    {
      id: 'light.stack',
      kind: 'light',
      title: 'Stack Light',
      entityId: 'light.living_room_lamp',
      dataSource: 'mock',
      parentSectionId: 'section-stack-context',
      status: 'Idle',
      isOn: true,
      value: 60,
      unit: '%',
      layout: { i: 'light.stack', x: 0, y: 0, w: 2, h: 2 },
    },
    {
      id: 'calendar.stack',
      kind: 'calendar',
      title: 'Stack Calendar',
      entityId: 'calendar.stack',
      dataSource: 'mock',
      parentSectionId: 'section-stack-context',
      status: 'on',
      isOn: true,
      value: 0,
      unit: '',
      layout: { i: 'calendar.stack', x: 0, y: 2, w: 4, h: 3 },
    },
  ],
};

async function installCompletedDemo(page, layout) {
  await page.addInitScript(({ key, runtimeKey, value }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(runtimeKey, 'demo');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2,
      phase: 'done',
      mode: 'demo',
      updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  }, { key: STORAGE_KEY, runtimeKey: RUNTIME_KEY, value: layout });
}

async function longPress(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();

  const client = await page.context().newCDPSession(page);
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await page.waitForTimeout(540);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

async function expectContextPanel(page, title) {
  const panel = page.locator('.device-context-surface');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: title })).toBeVisible();
  await panel.getByRole('button', { name: /Chiudi.*dispositivo/i }).click();
  await expect(panel).toHaveCount(0);
}

test('mobile Light long-press opens context without breaking a short tap', async ({ page }) => {
  await installCompletedDemo(page, rootLayout);
  await page.goto('/home');

  const light = page.locator('.light-card').first();
  const lightAction = light.locator('.light-card__toggle');
  await expect(light).toHaveAttribute('data-light-state', 'on', { timeout: 30_000 });

  await longPress(page, lightAction);
  await expectContextPanel(page, 'Root Light');
  await expect(light).toHaveAttribute('data-light-state', 'on');

  await lightAction.tap();
  await expect(light).toHaveAttribute('data-light-state', 'off');
  await expect(page.locator('.device-context-surface')).toHaveCount(0);
});

for (const { cardName, selector, title } of [
  {
    cardName: 'Calendar',
    selector: '.calendar-card .widget-card-handle',
    title: 'Root Calendar',
  },
  {
    cardName: 'Fan',
    selector: '.fan-card .device-control-card__meta',
    title: 'Root Fan',
  },
  {
    cardName: 'Humidifier',
    selector: '.humidifier-card .device-control-card__meta',
    title: 'Root Humidifier',
  },
]) {
  test(`mobile ${cardName} primary action opens its context panel`, async ({ page }) => {
    await installCompletedDemo(page, rootLayout);
    await page.goto('/home');

    await longPress(page, page.locator(selector).first());
    await expectContextPanel(page, title);
  });
}

test('mobile long-press reaches Light and Calendar inside a stack', async ({ page }) => {
  await installCompletedDemo(page, stackLayout);
  await page.goto('/home');

  await longPress(page, page.locator('.light-card__toggle').first());
  await expectContextPanel(page, 'Stack Light');

  await longPress(page, page.locator('.calendar-card .widget-card-handle').first());
  await expectContextPanel(page, 'Stack Calendar');
});
