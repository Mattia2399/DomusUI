const { test, expect } = require('@playwright/test');

/*
 * The panels on a phone: everything on the middle axis, a protagonist and a main action
 * that stay where they are whichever screen is open, and a zone of 148 px that holds
 * every screen without scrolling.
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

const devices = (id, kind, title, status, x, y) => ({
  id,
  kind,
  title,
  entityId: id,
  dataSource: 'mock',
  status,
  isOn: true,
  layout: { i: id, x, y, w: 2, h: 4 },
});

const place = (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), centre: Math.round(rect.left + rect.width / 2) };
});

const SHORTCUTS = '.panel-control-row .glass-shortcut';
const BACK = '.panel-footer-back .glass-shortcut';

/** A screen holds what it has inside the zone: it neither scrolls nor grows. */
async function expectZoneHolds(page) {
  const zone = await page.locator('.panel-control-zone').evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight }));
  expect(zone.client).toBe(148);
  expect(zone.scroll).toBeLessThanOrEqual(zone.client);
}

test('a panel opens at once with an empty protagonist, and nothing moves when its code arrives', async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.clear();
    localStorage.setItem('domusui.language.v1', 'it');
    localStorage.setItem('ha.dashboard.demo.builder.layout.v1', JSON.stringify(value));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  }, layout);
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
  const before = {
    hero: await place(empty),
    zone: await place(page.locator('.panel-control-zone')),
    footer: await place(page.locator('.panel-footer')),
    icon: await place(page.locator('.panel-header-icon')),
  };

  release();
  const slider = page.locator('.panel-hero .glass-vslider');
  await expect(slider).toBeVisible({ timeout: 20_000 });
  await expect(empty).toHaveCount(0);
  expect(await place(slider)).toEqual(before.hero);
  expect(await place(page.locator('.panel-control-zone'))).toEqual(before.zone);
  expect(await place(page.locator('.panel-footer'))).toEqual(before.footer);
  expect(await place(page.locator('.panel-header-icon'))).toEqual(before.icon);
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
  await expect(page.locator('.panel-shell')).toBeVisible({ timeout: 20_000 });
  // The sheet is still sliding up: wait for it to settle before measuring.
  await page.waitForTimeout(600);

  const slider = page.locator('.panel-hero .glass-vslider');
  const power = page.locator('.panel-footer-action');
  const sliderPlace = await place(slider);
  const powerPlace = await place(power);
  expect(sliderPlace.bottom - sliderPlace.top).toBeGreaterThan(200);
  expect(sliderPlace.centre).toBe(powerPlace.centre);
  expect(await place(page.locator('.panel-header-icon'))).toMatchObject({ centre: sliderPlace.centre });

  const shortcuts = page.locator(SHORTCUTS);
  const total = await shortcuts.count();
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index += 1) {
    const shortcut = shortcuts.nth(index);
    // A shortcut that acts at once opens nothing.
    if ((await shortcut.getAttribute('aria-expanded')) === null) continue;
    await shortcut.click();
    await expect(page.locator('.panel-control-screen')).toBeVisible();
    expect(await place(slider)).toEqual(sliderPlace);
    expect(await place(power)).toEqual(powerPlace);
    await expectZoneHolds(page);
    await page.locator(BACK).click();
    await expect(page.locator('.panel-control-screen')).toHaveCount(0);
  }
  expect(await place(slider)).toEqual(sliderPlace);

  // Colour: the disc takes the place of the slider, and a drag on it changes the light.
  await shortcuts.first().click();
  await page.locator('.panel-control-screen .liquid-segmented-control').getByText('Colore', { exact: true }).click();
  const disc = page.getByRole('slider', { name: 'Colore personalizzato' });
  await expect(disc).toBeVisible();
  await expectZoneHolds(page);
  const round = await disc.boundingBox();
  expect(Math.abs(round.width - round.height)).toBeLessThanOrEqual(1);
  expect(Math.round(round.x + round.width / 2)).toBe(sliderPlace.centre);
  expect(round.y).toBeGreaterThanOrEqual(sliderPlace.top - 1);
  expect(round.y + round.height).toBeLessThanOrEqual(sliderPlace.bottom + 1);
  expect(await place(power)).toEqual(powerPlace);

  // To the right edge of the disc: the hue of a right angle clockwise from the top, fully saturated.
  await page.mouse.move(round.x + round.width / 2, round.y + round.height / 2);
  await page.mouse.down();
  await page.mouse.move(round.x + round.width * 0.96, round.y + round.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => disc.getAttribute('aria-valuenow')).toBe('90');
  await expect(disc).toHaveAttribute('aria-valuetext', /Tonalità 90 gradi, saturazione 100%/);
  // The panel takes the colour: the device received it, not only the handle.
  await page.waitForTimeout(2200);
  await expect(disc).toHaveAttribute('aria-valuenow', '90');
});

test('the panels with a slider have it in one place, and every screen leaves it there', async ({ page }) => {
  const shared = [
    devices('fan.demo_breeze', 'fan', 'Ventola', 'on', 0, 0),
    devices('cover.living_room_shutter', 'cover', 'Tapparella', 'open', 2, 0),
    devices('climate.living_room', 'climate', 'Clima', 'heat', 0, 4),
  ];
  await page.addInitScript((value) => {
    localStorage.clear();
    localStorage.setItem('domusui.language.v1', 'it');
    localStorage.setItem('ha.dashboard.demo.builder.layout.v1', JSON.stringify(value));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  }, { ...layout, widgets: [...layout.widgets.map((widget) => ({ ...widget, layout: { ...widget.layout, x: 2, y: 4 } })), ...shared] });
  await page.goto('/home');
  await expect(page.locator('.dv-tile-body')).toHaveCount(4, { timeout: 20_000 });

  let reference = null;
  let powerReference = null;
  for (const name of ['Lampada', 'Ventola', 'Tapparella', 'Clima']) {
    const card = page.locator(`.dv-tile-body[aria-label*="${name}"]`);
    const bounds = await card.boundingBox();
    await card.tap({ position: { x: bounds.width - 12, y: 12 } });
    await expect(page.locator('.panel-hero .glass-vslider')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);

    const slider = page.locator('.panel-hero .glass-vslider');
    const power = page.locator('.panel-footer-action');
    const here = await place(slider);
    const powerHere = await place(power);
    reference ??= here;
    powerReference ??= powerHere;
    expect(here).toEqual(reference);
    expect(powerHere).toEqual(powerReference);
    await expectZoneHolds(page);

    const shortcuts = page.locator(SHORTCUTS);
    for (let index = 0; index < (await shortcuts.count()); index += 1) {
      if ((await shortcuts.nth(index).getAttribute('aria-expanded')) === null) continue;
      await shortcuts.nth(index).click();
      expect(await place(slider)).toEqual(reference);
      expect(await place(power)).toEqual(powerReference);
      await expectZoneHolds(page);
      await page.locator(BACK).click();
    }
    await page.locator('.panel-header-close').click();
    await expect(page.locator('.panel-shell')).toHaveCount(0);
  }
});
