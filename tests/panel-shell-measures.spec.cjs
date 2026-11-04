const { test, expect } = require('@playwright/test');

/*
 * The measures of the skeleton of the panels, which only a real browser can check:
 * a zone of controls of one height, and a protagonist and a main action that stay
 * where they are, whichever screen is open, whatever the zone holds.
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

for (const shape of ['sheet', 'column']) {
  test(`${shape}: the zone is 148 px and nothing moves when a shortcut opens`, async ({ page }) => {
    const panel = shapeOf(page, shape);
    const hero = panel.locator('.glass-vslider');
    const zone = panel.locator('.panel-control-zone');
    const action = panel.locator('.panel-footer-action');
    const heroAt = await place(hero);
    const actionAt = await place(action);
    const zoneAt = await place(zone);
    expect(zoneAt.height).toBe(148);
    expect(actionAt.height).toBe(64);
    expect(heroAt.width).toBe(148);

    const opens = panel.locator('.panel-control-row .glass-shortcut[aria-expanded]');
    const total = await opens.count();
    expect(total).toBe(3);
    for (let index = 0; index < total; index += 1) {
      await opens.nth(index).click();
      await expect(panel.locator('.panel-control-screen')).toBeVisible();
      expect(await place(hero)).toEqual(heroAt);
      expect(await place(zone)).toEqual(zoneAt);
      expect(await place(action)).toEqual(actionAt);
      await panel.getByRole('button', { name: 'Indietro' }).click();
      await expect(panel.locator('.panel-control-screen')).toHaveCount(0);
    }
    expect(await place(hero)).toEqual(heroAt);
  });
}

test('the three parts are on the middle axis, in one column', async ({ page }) => {
  const panel = shapeOf(page, 'sheet');
  const centre = async (selector) => {
    const box = await place(panel.locator(selector));
    return Math.round(box.left + box.width / 2);
  };
  const middle = await centre('.panel-header-icon');
  expect(await centre('.glass-vslider')).toBe(middle);
  expect(await centre('.panel-footer-action')).toBe(middle);
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
  // The colour stays on the icon and the slider of the column.
  const iconOf = await shapeOf(page, 'column').locator('.panel-header-icon').evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(iconOf).toBe('rgb(255, 159, 10)');
});

test.describe('two columns', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('above 520 px: the protagonist at the left, the groups at the right, the action in the header', async ({ page }) => {
    const panel = shapeOf(page, 'dialog');
    const hero = await place(panel.locator('.glass-vslider'));
    expect([hero.width, hero.height]).toEqual([128, 300]);
    await expect(panel.locator('.panel-control-zone')).toBeHidden();
    const groups = panel.locator('.panel-groups');
    await expect(groups).toBeVisible();
    expect((await place(groups)).left).toBeGreaterThan(hero.left + hero.width);
    const action = await place(panel.locator('.panel-footer-action'));
    const close = await place(panel.locator('.panel-header-close'));
    expect(action.width).toBe(48);
    expect(action.left + action.width).toBeLessThanOrEqual(close.left);
    expect(action.top).toBeLessThan(hero.top);
    await expect(panel.locator('.panel-footer-back')).toBeHidden();
  });

  test('the width decides the columns, the surface what it looks like: a narrow dialog has one column, still tinted', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = shapeOf(page, 'dialog');
    await expect(panel.locator('.panel-control-zone')).toBeVisible();
    await expect(panel.locator('.panel-groups')).toBeHidden();
    const tint = await panel.locator('.panel-shell').evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(tint).toContain('rgba(255, 159, 10');
  });
});
