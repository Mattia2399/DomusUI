const { test, expect } = require('@playwright/test');

/*
 * The measures of the skeleton of the panels, which only a real browser can check:
 * a header of one row and a row of shortcuts that stay where they are, whatever is open.
 */

// Inside the panel: the page of the tests scrolls to what is pressed.
const place = (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  const panel = node.closest('.panel-shell').getBoundingClientRect();
  return { top: Math.round(rect.top - panel.top), bottom: Math.round(rect.bottom - panel.top), left: Math.round(rect.left - panel.left), width: Math.round(rect.width), height: Math.round(rect.height) };
});

const shapeOf = (page, shape) => page.getByTestId('lab-board-light').getByTestId(`shape-${shape}`);

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/componenti');
  await expect(shapeOf(page, 'sheet').locator('.panel-shell')).toBeVisible({ timeout: 20_000 });
});

test('sheet: the header and the row do not move when a shortcut opens', async ({ page }) => {
  const panel = shapeOf(page, 'sheet');
  const header = panel.locator('.panel-header');
  const nav = panel.locator('.panel-nav');
  const headerAt = await place(header);
  const navAt = await place(nav);
  expect((await place(panel.locator('.panel-header-action'))).height).toBe(44);
  expect((await place(panel.locator('.panel-header-close'))).height).toBe(44);
  expect((await place(panel.locator('.glass-vslider'))).width).toBe(148);

  for (const name of ['Colore', 'Timer']) {
    await nav.getByRole('button', { name }).click();
    await expect(panel.locator('.panel-hero-back')).toBeVisible();
    expect(await place(header)).toEqual(headerAt);
    expect(await place(nav)).toEqual(navAt);
    await expect(nav.getByRole('button', { name })).toHaveClass(/is-selected/);
  }
  await nav.getByRole('button', { name: 'Timer' }).click();
  await expect(panel.locator('.panel-hero-back')).toHaveCount(0);
  await expect(panel.locator('.glass-vslider')).toBeVisible();
  expect(await place(nav)).toEqual(navAt);
});

test('sheet: a page hides the row, and only its list scrolls', async ({ page }) => {
  const panel = shapeOf(page, 'sheet');
  const header = panel.locator('.panel-header');
  const headerAt = await place(header);
  await panel.locator('.panel-nav').getByRole('button', { name: 'Effetti' }).click();
  await expect(panel.locator('.panel-nav')).toBeHidden();
  await expect(panel.getByRole('heading', { level: 3, name: 'Effetti' })).toBeVisible();
  expect(await place(header)).toEqual(headerAt);
  await panel.locator('.panel-page-list').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect(await place(header)).toEqual(headerAt);
  await panel.locator('.panel-page-back').click();
  await expect(panel.locator('.panel-nav')).toBeVisible();
});

test('column: the groups under the protagonist, with no row', async ({ page }) => {
  const panel = shapeOf(page, 'column');
  await expect(panel.locator('.panel-nav')).toBeHidden();
  await expect(panel.locator('.panel-groups')).toBeVisible();
  const hero = await place(panel.locator('.panel-hero'));
  expect((await place(panel.locator('.panel-groups'))).top).toBeGreaterThan(hero.bottom);
});

test('the three parts of the header are on one row, the name in the middle', async ({ page }) => {
  const panel = shapeOf(page, 'sheet');
  const middle = async (selector) => {
    const box = await place(panel.locator(selector));
    return { row: Math.round(box.top + box.height / 2), centre: Math.round(box.left + box.width / 2) };
  };
  const action = await middle('.panel-header-action');
  const name = await middle('.panel-header-text');
  const close = await middle('.panel-header-close');
  expect(Math.abs(action.row - close.row)).toBeLessThanOrEqual(1);
  expect(Math.abs(name.row - close.row)).toBeLessThanOrEqual(1);
  expect(action.centre).toBeLessThan(name.centre);
  expect(close.centre).toBeGreaterThan(name.centre);
  expect(Math.abs(name.centre - (await middle('.glass-vslider')).centre)).toBeLessThanOrEqual(1);
});

test('the sheet is 720 px at most, rounded only on top', async ({ page }) => {
  const panel = shapeOf(page, 'sheet').locator('.panel-shell');
  const style = await panel.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { radius: computed.borderRadius, height: node.getBoundingClientRect().height, viewport: window.innerHeight };
  });
  expect(style.radius).toBe('30px 30px 0px 0px');
  expect(style.height).toBeCloseTo(Math.min(style.viewport * 0.9, 720), 0);
});

test('the sheet and the dialog take the colour of the device, and the column does not', async ({ page }) => {
  const tintOf = (shape) => shapeOf(page, shape).locator('.panel-shell').evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(await tintOf('sheet')).toContain('rgba(255, 159, 10');
  expect(await tintOf('dialog')).toContain('rgba(255, 159, 10');
  expect(await tintOf('column')).toBe('none');
  // On, the power has the colour of the device, in the column too.
  const power = await shapeOf(page, 'column').locator('.panel-header-action').evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(power).toBe('rgb(255, 159, 10)');
});

test.describe('two columns', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('above 520 px: the protagonist at the left, the groups at the right, the same header', async ({ page }) => {
    const panel = shapeOf(page, 'dialog');
    const hero = await place(panel.locator('.glass-vslider'));
    expect([hero.width, hero.height]).toEqual([128, 300]);
    await expect(panel.locator('.panel-nav')).toBeHidden();
    const groups = panel.locator('.panel-groups');
    await expect(groups).toBeVisible();
    expect((await place(groups)).left).toBeGreaterThan(hero.left + hero.width);
    const action = await place(panel.locator('.panel-header-action'));
    const close = await place(panel.locator('.panel-header-close'));
    expect(action.height).toBe(44);
    expect(action.left).toBeLessThan(hero.left);
    expect(action.top).toBe(close.top);
    expect(action.top).toBeLessThan(hero.top);
  });

  test('the width decides the columns: a narrow dialog behaves as a phone, still tinted', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = shapeOf(page, 'dialog');
    await expect(panel.locator('.panel-nav')).toBeVisible();
    await expect(panel.locator('.panel-groups')).toBeHidden();
    const tint = await panel.locator('.panel-shell').evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(tint).toContain('rgba(255, 159, 10');
  });
});
