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
  // The first panel of a run is compiled on request by the development server.
  await expect(panel).toBeVisible({ timeout: 30_000 });
  // Right after a load the demo may not have the entity yet: for a moment the old content has a title of its own.
  await expect(panel.getByRole('heading', { name: title }).first()).toBeVisible();
  // A shared panel brings its own Close once loaded, and the one of the sheet steps aside: ask again.
  // On a busy machine a click that landed can outlast its time: the next try finds the panel already closed.
  await expect(async () => {
    if ((await panel.count()) === 0) return;
    await panel.getByRole('button', { name: /Chiudi.*dispositivo/i }).click({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
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

test('mobile long-press on a card of the three sizes opens its shared panel', async ({ page }) => {
  await installCompletedDemo(page, {
    version: 14,
    layoutEngine: 'grid-engine-2',
    gridMetricsVersion: 'v2',
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
    sections: [],
    widgets: [{
      id: 'robot',
      kind: 'vacuum',
      title: 'Root Robot',
      entityId: 'vacuum.demo_robot',
      dataSource: 'ha',
      isOn: false,
      layout: { i: 'robot', x: 0, y: 0, w: 2, h: 4 },
    }],
  });
  await page.goto('/home');

  const body = page.locator('[data-grid-engine-root-item="robot"] .dv-tile-body');
  await expect(body).toBeVisible({ timeout: 30_000 });
  await longPress(page, body);
  await expect(page.locator('.device-context-surface .panel-shell')).toBeVisible({ timeout: 30_000 });
  await expectContextPanel(page, 'Root Robot');
});

test('the finger that opened a panel neither closes it nor presses what lies under it', async ({ page }) => {
  const widget = (id, kind, title, entityId, y) => ({ id, kind, title, entityId, dataSource: 'ha', isOn: false, layout: { i: id, x: 0, y, w: 2, h: 4 } });
  await installCompletedDemo(page, {
    version: 14,
    layoutEngine: 'grid-engine-2',
    gridMetricsVersion: 'v2',
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
    sections: [],
    widgets: [
      widget('alarm', 'alarm', 'Root Alarm', 'alarm_control_panel.home_alarm', 0),
      widget('calendar', 'calendar', 'Root Agenda', 'calendar.domus_ui', 4),
    ],
  });
  await page.goto('/home');
  const body = (id) => page.locator(`[data-grid-engine-root-item="${id}"] .dv-tile-body`);
  await expect(body('alarm')).toBeVisible({ timeout: 30_000 });

  // Twice each: from the second time on the panel appears while the finger is still down.
  for (const [id, title] of [['alarm', 'Root Alarm'], ['alarm', 'Root Alarm'], ['calendar', 'Root Agenda'], ['calendar', 'Root Agenda'], ['alarm', 'Root Alarm']]) {
    await longPress(page, body(id));
    const shown = page.locator(id === 'alarm' ? '.device-context-surface .dv-panel' : '.device-context-surface .panel-shell');
    await expect(shown).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await expect(shown).toBeVisible();
    if (id === 'alarm') await expect(page.locator('.dv-pn-mode.is-on')).toHaveCount(1);
    await expectContextPanel(page, title);
    await page.waitForTimeout(500);
  }
});

test('on a card of the three sizes a touch opens the panel, the icon only commands, and a swipe scrolls', async ({ page }) => {
  const widget = (id, kind, y, h = 4) => ({ id, kind, title: `Root ${kind}`, entityId: id, dataSource: 'mock', isOn: false, value: 1, layout: { i: id, x: 0, y, w: 2, h } });
  await installCompletedDemo(page, {
    version: 14,
    layoutEngine: 'grid-engine-2',
    gridMetricsVersion: 'v2',
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
    sections: [],
    widgets: [widget('fan.demo_breeze', 'fan', 0), ...Array.from({ length: 8 }, (_, index) => widget(`climate.filler_${index}`, 'climate', 4 + index * 4))],
  });
  await page.goto('/home');
  const card = page.locator('[data-grid-engine-root-item="fan.demo_breeze"]');
  const body = card.locator('.dv-tile-body');
  await expect(body).toBeVisible({ timeout: 30_000 });
  const client = await page.context().newCDPSession(page);
  const touch = (type, x, y) => client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
  const tap = async (x, y) => {
    await touch('touchStart', x, y);
    await page.waitForTimeout(60);
    await touch('touchEnd', x, y);
  };

  // The icon commands the device and opens nothing.
  const icon = card.locator('button.dv-icon-button');
  const pressed = await icon.getAttribute('aria-pressed');
  const iconBox = await icon.boundingBox();
  await tap(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2);
  await expect(icon).not.toHaveAttribute('aria-pressed', pressed ?? 'false');
  await expect(page.locator('.device-context-surface')).toHaveCount(0);

  // A swipe that starts on the card moves the page and opens nothing.
  const box = await card.boundingBox();
  const x = box.x + 16;
  const y = box.y + box.height - 16;
  await touch('touchStart', x, y);
  for (let step = 1; step <= 8; step += 1) {
    await touch('touchMove', x, y - step * 20);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', x, y);
  // Long enough for the page to stop gliding: a touch during the glide only stops it.
  await page.waitForTimeout(2000);
  await expect(page.locator('.device-context-surface')).toHaveCount(0);
  expect((await card.boundingBox()).y).toBeLessThan(box.y);

  // After scrolling, a touch on the surface of a card opens its panel, and it stays open.
  const other = page.locator('[data-grid-engine-root-item="climate.filler_1"]');
  const otherBox = await other.boundingBox();
  await tap(otherBox.x + 14, otherBox.y + otherBox.height / 2);
  await expect(page.locator('.device-context-surface .panel-shell')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await expect(page.locator('.device-context-surface .panel-shell')).toBeVisible({ timeout: 30_000 });
});
