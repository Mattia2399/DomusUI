const { test, expect } = require('@playwright/test');

/*
 * The light panel on a phone: everything on the middle axis, and a slider and a
 * power button that stay where they are, whichever screen is open.
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

test('the slider and the power stay still on every screen of the light panel', async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.clear();
    localStorage.setItem('domusui.language.v1', 'it');
    localStorage.setItem('ha.dashboard.demo.builder.layout.v1', JSON.stringify(value));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  }, layout);
  await page.goto('/home');
  await page.locator('.dv-tile-body').first().tap();
  await expect(page.locator('.dv-panel-stage')).toBeVisible({ timeout: 20_000 });
  // The sheet is still sliding up: wait for it to settle before measuring.
  await page.waitForTimeout(600);

  const slider = page.locator('.dv-vslider');
  const power = page.locator('.dv-panel-dock > .dv-round');
  const sliderPlace = await place(slider);
  const powerPlace = await place(power);
  expect(sliderPlace.bottom - sliderPlace.top).toBeGreaterThan(200);
  expect(sliderPlace.centre).toBe(powerPlace.centre);
  expect(await place(page.locator('.dv-panel-head > span').first())).toMatchObject({ centre: sliderPlace.centre });

  const shortcuts = page.locator('.dv-panel-shortcuts .dv-panel-shortcut');
  const total = await shortcuts.count();
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index += 1) {
    await shortcuts.nth(index).click();
    await expect(page.locator('.dv-panel-stage.has-section')).toBeVisible();
    expect(await place(slider)).toEqual(sliderPlace);
    expect(await place(power)).toEqual(powerPlace);
    // What a screen holds stays inside the zone that was left for it.
    const zone = await page.locator('.dv-panel-side').evaluate((node) => node.getBoundingClientRect().bottom);
    expect(zone).toBeLessThanOrEqual(powerPlace.top);
    await page.locator('.dv-panel-dock .dv-panel-shortcut').click();
    await expect(page.locator('.dv-panel-stage.has-section')).toHaveCount(0);
  }
  expect(await place(slider)).toEqual(sliderPlace);
});
