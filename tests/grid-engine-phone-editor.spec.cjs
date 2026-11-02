const { test, expect, devices } = require('@playwright/test');

/*
 * Editing the Home on a phone, with real touches: a touch selects, a long press
 * lifts, the settings open only from the button on the card.
 */

const widget = (id, title, y) => ({
  id,
  kind: 'sensor',
  title,
  entityId: id,
  dataSource: 'mock',
  value: 21,
  unit: '°C',
  isOn: true,
  layout: { i: id, x: 0, y, w: 1, h: 4 },
});
const layout = {
  version: 14,
  layoutEngine: 'grid-engine-2',
  gridMetricsVersion: 'v2',
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
  sections: [],
  widgets: [widget('sensor.uno', 'Primo', 0), widget('sensor.due', 'Secondo', 4), widget('sensor.tre', 'Terzo', 8)],
};

const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 13'];
test.use({ ...iphone, viewport: { width: 390, height: 844 }, locale: 'it-IT' });

const item = (page, id) => page.locator(`[data-grid-engine-editor-item="${id}"]`);
const settingsOf = (page, id) => page.locator(`[data-grid-engine-editor-settings="${id}"]`);
const sheet = (page) => page.locator('aside.builder-sidebar');

async function centerOf(locator) {
  const box = await locator.boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2];
}

async function touchAt(page, cdp, [x, y], holdMs = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
}

async function expectSheetClosed(page) {
  await expect(sheet(page)).toHaveCSS('opacity', '0');
}

async function openEditor(page, context) {
  await page.addInitScript(({ value }) => {
    if (localStorage.getItem('__phoneEditorFixture') === 'installed') return;
    localStorage.clear();
    localStorage.setItem('__phoneEditorFixture', 'installed');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.demo.builder.layout.v1', JSON.stringify(value));
  }, { value: layout });
  await page.goto('/');
  await page.getByRole('button', { name: 'Apri menu laterale' }).click();
  await page.getByRole('button', { name: 'Modalità modifica', exact: true }).click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await expect(item(page, 'sensor.uno')).toBeVisible({ timeout: 30_000 });
  return context.newCDPSession(page);
}

test('a touch selects without opening the settings, which open from the button on the card', async ({ page, context }) => {
  const cdp = await openEditor(page, context);
  await expect(page.getByText('Tocca una card per selezionarla, tienila premuta per spostarla.')).toBeVisible();

  await touchAt(page, cdp, await centerOf(item(page, 'sensor.due')));
  await expect(item(page, 'sensor.due')).toHaveAttribute('data-editor-state', 'selected');
  await expectSheetClosed(page);
  await expect(settingsOf(page, 'sensor.uno')).toHaveCount(0);

  await touchAt(page, cdp, await centerOf(settingsOf(page, 'sensor.due')));
  await expect(sheet(page)).toHaveCSS('opacity', '1');
  await expect(sheet(page).getByRole('heading', { name: 'Secondo' })).toBeVisible();

  // Closing the settings leaves the card in hand; the empty canvas lets it go.
  await sheet(page).getByRole('button', { name: 'Chiudi pannello contestuale' }).click();
  await expectSheetClosed(page);
  await expect(item(page, 'sensor.due')).toHaveAttribute('data-editor-state', 'selected');

  const terzo = await item(page, 'sensor.tre').boundingBox();
  await touchAt(page, cdp, [terzo.x + terzo.width / 2, terzo.y + terzo.height + 80]);
  await expect(item(page, 'sensor.due')).not.toHaveAttribute('data-editor-state', 'selected');
  await expect(settingsOf(page, 'sensor.due')).toHaveCount(0);
});

test('a long press lifts the card: released in place or moved, the settings stay closed', async ({ page, context }) => {
  const cdp = await openEditor(page, context);

  await touchAt(page, cdp, await centerOf(item(page, 'sensor.uno')), 600);
  await expect(item(page, 'sensor.uno')).toHaveAttribute('data-editor-state', 'selected');
  await expectSheetClosed(page);

  const before = await item(page, 'sensor.tre').boundingBox();
  const [x, y] = await centerOf(item(page, 'sensor.tre'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(600);
  await expect(item(page, 'sensor.tre')).toHaveAttribute('data-editor-state', 'lifted');
  // The move is vertical: the card follows it instead of the page scrolling.
  for (let step = 1; step <= 16; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 25 }] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect.poll(async () => (await item(page, 'sensor.tre').boundingBox()).y).toBeLessThan(before.y - 100);
  await expect(item(page, 'sensor.tre')).toHaveAttribute('data-editor-state', 'selected');
  await expectSheetClosed(page);
});

test('a finger that moves at once scrolls the page and selects nothing', async ({ page, context }) => {
  const cdp = await openEditor(page, context);
  const [x, y] = await centerOf(item(page, 'sensor.due'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 12 }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  await expect(item(page, 'sensor.due')).not.toHaveAttribute('data-editor-state', /.+/);
  await expectSheetClosed(page);
});
