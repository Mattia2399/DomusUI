const { test, expect } = require('@playwright/test');

/*
 * The panel of a light on a phone: it opens at once with an empty protagonist, and nothing
 * in the header moves when its code arrives.
 */

const layout = {
  version: 14,
  layoutEngine: 'grid-engine-2',
  gridMetricsVersion: 'v2',
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
  sections: [],
  widgets: [{
    id: 'light.living_room_lamp',
    kind: 'light',
    title: 'Lampada',
    entityId: 'light.living_room_lamp',
    dataSource: 'mock',
    status: 'on',
    isOn: true,
    value: 60,
    layout: { i: 'light.living_room_lamp', x: 0, y: 0, w: 2, h: 4 },
  }],
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const place = (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), centre: Math.round(rect.left + rect.width / 2) };
});

const install = (page) => page.addInitScript((value) => {
  localStorage.clear();
  localStorage.setItem('domusui.language.v1', 'it');
  localStorage.setItem('ha.dashboard.demo.builder.layout.v1', JSON.stringify(value));
  localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
  localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
  localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
  localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
}, layout);

test('a panel opens at once with an empty protagonist, and the header stays when its code arrives', async ({ page }) => {
  await install(page);
  // The code of the light panel does not arrive until the test lets it.
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(/entries\/light\.tsx/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/home');
  await page.locator('.dv-tile-body').first().tap();

  const empty = page.locator('.panel-hero-empty');
  await expect(empty).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await expect(page.getByRole('heading', { name: 'Lampada' })).toBeVisible();
  const before = { name: await place(page.locator('.panel-header-text')), close: await place(page.locator('.panel-header-close')), hero: await place(empty) };

  release();
  const slider = page.locator('.panel-hero .glass-vslider');
  await expect(slider).toBeVisible({ timeout: 20_000 });
  await expect(empty).toHaveCount(0);
  expect((await place(slider)).centre).toBe(before.hero.centre);
  expect(await place(page.locator('.panel-header-close'))).toEqual(before.close);
  expect((await place(page.locator('.panel-header-text'))).top).toBe(before.name.top);
});
