const { test, expect, devices } = require('@playwright/test');

/*
 * Editing the Home on a phone, with CDP touch input: the card remains a native
 * pan surface and the selected card's touch-action:none handle owns long-press
 * drag, pointer capture and Grid Engine autoscroll.
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
  widgets: [
    widget('sensor.uno', 'Primo', 0),
    widget('sensor.due', 'Secondo', 8),
    widget('sensor.tre', 'Terzo', 16),
    ...Array.from({ length: 9 }, (_, index) => widget(
      `sensor.extra-${index + 1}`,
      `Extra ${index + 1}`,
      24 + index * 8,
    )),
  ],
};

const phoneSwapLayout = (() => {
  const ids = ['sensor.swap-a', 'sensor.swap-b', 'sensor.swap-unrelated'];
  const breakpoints = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  const root = Object.fromEntries(Object.keys(breakpoints).map((breakpoint) => [breakpoint, [
    { i: ids[0], x: 0, y: 0, w: 1, h: 4 },
    { i: ids[1], x: 1, y: 0, w: 1, h: 4 },
    { i: ids[2], x: 0, y: 6, w: 1, h: 4 },
  ]]));
  const sensorOverrides = Object.fromEntries(Object.keys(breakpoints).map((breakpoint) => [
    breakpoint,
    { w: 1, h: 4 },
  ]));
  return {
    version: 14,
    layoutEngine: 'grid-engine-2',
    gridMetricsVersion: 'v2',
    widgetTypeLayoutOverrides: { sensor: sensorOverrides },
    widgetLayoutOverrides: {},
    responsiveLayouts: { root },
    sections: [],
    widgets: [
      { ...widget(ids[0], 'Swap A', 0), layout: { i: ids[0], x: 0, y: 0, w: 1, h: 4 } },
      { ...widget(ids[1], 'Swap B', 0), layout: { i: ids[1], x: 1, y: 0, w: 1, h: 4 } },
      { ...widget(ids[2], 'Swap invariata', 6), layout: { i: ids[2], x: 0, y: 6, w: 1, h: 4 } },
    ],
  };
})();

const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 13'];
test.use({ ...iphone, viewport: { width: 390, height: 844 }, locale: 'it-IT' });

const item = (page, id) => page.locator(`[data-grid-engine-editor-item="${id}"]`);
const rootItem = (page, id) => page.locator(`[data-grid-engine-root-item="${id}"]`);
const dragHandleOf = (page, id) => page.locator(`[data-grid-engine-editor-drag="${id}"]`);
const settingsOf = (page, id) => page.locator(`[data-grid-engine-editor-settings="${id}"]`);
const sheet = (page) => page.locator('aside.builder-sidebar');
const renderer = (page) => page.locator('[data-grid-engine-root-renderer="grid-engine-2"]');
const editorHost = (page) => page.locator('[data-grid-engine-editor="active"]');
const editorScrollContainer = (page) => page.locator('.glass-scrollbar:has([data-grid-engine-editor="active"])');

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

async function selectForTouchDrag(page, id) {
  await item(page, id).scrollIntoViewIfNeeded();
  await item(page, id).tap();
  await expect(item(page, id)).toHaveAttribute('data-editor-state', 'selected');
  await expect(dragHandleOf(page, id)).toBeVisible();
  await expect(dragHandleOf(page, id)).toHaveCSS('touch-action', 'none');
}

async function scrollTopOf(locator) {
  return locator.evaluate((element) => element.scrollTop);
}

async function geometryOf(page, id) {
  const locator = rootItem(page, id);
  return {
    x: Number(await locator.getAttribute('data-grid-x')),
    y: Number(await locator.getAttribute('data-grid-y')),
    w: Number(await locator.getAttribute('data-grid-w')),
    h: Number(await locator.getAttribute('data-grid-h')),
  };
}

async function rootOrder(page, ids) {
  const entries = await Promise.all(ids.map(async (id) => ({ id, ...(await geometryOf(page, id)) })));
  return entries.sort((first, second) => first.y - second.y || first.x - second.x).map((entry) => entry.id);
}

async function visibleEditableId(scrollContainer) {
  return scrollContainer.evaluate((container) => {
    const viewport = container.getBoundingClientRect();
    const candidate = Array.from(container.querySelectorAll('[data-grid-engine-editor-item]')).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= viewport.top + 70 && rect.bottom <= viewport.bottom - 120;
    });
    return candidate?.getAttribute('data-grid-engine-editor-item') ?? null;
  });
}

async function expectSheetClosed(page) {
  await expect(sheet(page)).toHaveCSS('opacity', '0');
}

async function openEditor(page, context, fixture = layout) {
  await page.addInitScript(({ value }) => {
    if (localStorage.getItem('__phoneEditorFixture') === 'installed') return;
    localStorage.clear();
    localStorage.setItem('__phoneEditorFixture', 'installed');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.demo.builder.layout.v1', JSON.stringify(value));
  }, { value: fixture });
  await page.goto('/');
  await page.getByRole('button', { name: 'Apri menu laterale' }).click();
  await page.getByRole('button', { name: 'Modalità modifica', exact: true }).click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await expect(item(page, fixture.widgets[0].id)).toBeVisible({ timeout: 30_000 });
  return context.newCDPSession(page);
}

test('a touch selects without opening the settings, which open from the button on the card', async ({ page, context }) => {
  const cdp = await openEditor(page, context);
  await expect(page.getByText('Tocca una card per selezionarla, poi tieni premuta la maniglia per spostarla.')).toBeVisible();
  await expect(item(page, 'sensor.due')).toHaveCSS('touch-action', 'pan-y');

  await item(page, 'sensor.due').tap();
  await expect(item(page, 'sensor.due')).toHaveAttribute('data-editor-state', 'selected');
  await expectSheetClosed(page);
  await expect(settingsOf(page, 'sensor.uno')).toHaveCount(0);

  await settingsOf(page, 'sensor.due').tap();
  await expect(sheet(page)).toHaveCSS('opacity', '1');
  await expect(sheet(page).getByRole('heading', { name: 'Secondo' })).toBeVisible();

  // Closing the settings leaves the card in hand; the empty canvas lets it go.
  // The settings of a card close with Fine, at the right of its head.
  await sheet(page).getByRole('button', { name: 'Fine', exact: true }).click();
  await expectSheetClosed(page);
  await expect(item(page, 'sensor.due')).toHaveAttribute('data-editor-state', 'selected');

  const terzo = await item(page, 'sensor.tre').boundingBox();
  await touchAt(page, cdp, [terzo.x + terzo.width / 2, terzo.y + terzo.height + 80]);
  await expect(item(page, 'sensor.due')).not.toHaveAttribute('data-editor-state', 'selected');
  await expect(settingsOf(page, 'sensor.due')).toHaveCount(0);
});

test('the pre-declared touch handle survives small initial movement and drags without native scroll', async ({ page, context }) => {
  const cdp = await openEditor(page, context);
  const scrollContainer = editorScrollContainer(page);

  await selectForTouchDrag(page, 'sensor.uno');
  const stationaryStart = await scrollTopOf(scrollContainer);
  await touchAt(page, cdp, await centerOf(dragHandleOf(page, 'sensor.uno')), 600);
  await expect(item(page, 'sensor.uno')).toHaveAttribute('data-editor-state', 'selected');
  expect(await scrollTopOf(scrollContainer)).toBe(stationaryStart);
  await expectSheetClosed(page);

  await selectForTouchDrag(page, 'sensor.tre');
  const before = await item(page, 'sensor.tre').boundingBox();
  const previous = await item(page, 'sensor.due').boundingBox();
  const sourceGridY = Number(await rootItem(page, 'sensor.tre').getAttribute('data-grid-y'));
  const previousGridY = Number(await rootItem(page, 'sensor.due').getAttribute('data-grid-y'));
  const rowStep = (before.y - previous.y) / (sourceGridY - previousGridY);
  const movePixels = rowStep * 4;
  const [x, y] = await centerOf(dragHandleOf(page, 'sensor.tre'));
  const scrollBeforeDrag = await scrollTopOf(scrollContainer);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  // Physical fingers rarely remain on one pixel. This movement stays below
  // the controller's long-press tolerance and must not hand the gesture to
  // native scrolling.
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 2, y: y + 2 }] });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 4, y: y + 4 }] });
  await page.waitForTimeout(400);
  await expect(item(page, 'sensor.tre')).toHaveAttribute('data-editor-state', 'lifted');
  expect(await scrollTopOf(scrollContainer)).toBe(scrollBeforeDrag);
  // The move is vertical: the card follows it instead of the page scrolling.
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 4, y: y + 4 - (movePixels * step) / 6 }],
    });
    await page.waitForTimeout(30);
  }
  // An exact cell landing has zero residual visual offset; the preview grid
  // coordinate is the authoritative proof that the card followed the finger.
  await expect.poll(async () => Number(await rootItem(page, 'sensor.tre').getAttribute('data-grid-y'))).toBe(sourceGridY - 4);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect.poll(async () => Number(await rootItem(page, 'sensor.tre').getAttribute('data-grid-y'))).toBe(sourceGridY - 4);
  await expect.poll(async () => (await item(page, 'sensor.tre').boundingBox()).y).toBeLessThan(before.y - 20);
  expect(Math.abs(await scrollTopOf(scrollContainer) - scrollBeforeDrag)).toBeLessThanOrEqual(1);
  await expect(item(page, 'sensor.tre')).toHaveAttribute('data-editor-state', 'selected');
  await expectSheetClosed(page);
});

test('the card remains a natural scroll surface before drag and selects nothing while panning', async ({ page, context }) => {
  const cdp = await openEditor(page, context);
  const scrollContainer = editorScrollContainer(page);
  await scrollContainer.evaluate((element) => { element.scrollTop = 0; });
  const before = await scrollTopOf(scrollContainer);
  const [x, y] = await centerOf(item(page, 'sensor.due'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 14 }] });
    await page.waitForTimeout(24);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeGreaterThan(before + 30);
  await expect(item(page, 'sensor.due')).not.toHaveAttribute('data-editor-state', /.+/);
  await expectSheetClosed(page);
});

test('touch autoscroll is edge-only, stops, commits one Manual transaction, and pointercancel is fail-closed', async ({ page, context }) => {
  test.setTimeout(120_000);
  const cdp = await openEditor(page, context);
  const scrollContainer = editorScrollContainer(page);
  const scrollBounds = await scrollContainer.boundingBox();
  if (!scrollBounds) throw new Error('Phone editor scroll surface has no bounds.');
  const maximum = await scrollContainer.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(maximum).toBeGreaterThan(300);
  await scrollContainer.evaluate((element) => { element.scrollTop = (element.scrollHeight - element.clientHeight) / 2; });
  await page.waitForTimeout(100);

  const id = await visibleEditableId(scrollContainer);
  if (!id) throw new Error('No editable card is fully visible at the middle scroll position.');
  await selectForTouchDrag(page, id);
  const initial = await geometryOf(page, id);
  const [x, y] = await centerOf(dragHandleOf(page, id));
  const startScroll = await scrollTopOf(scrollContainer);
  const bottomEdgeY = scrollBounds.y + scrollBounds.height - 4;
  const centerY = scrollBounds.y + scrollBounds.height / 2;

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(600);
  await expect(renderer(page)).toHaveAttribute('data-grid-engine-editor-gesture', 'DRAGGING');
  expect(await scrollTopOf(scrollContainer)).toBe(startScroll);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: bottomEdgeY }] });
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeGreaterThan(startScroll + 30);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: centerY }] });
  await page.waitForTimeout(120);
  const stoppedAt = await scrollTopOf(scrollContainer);
  await page.waitForTimeout(250);
  expect(Math.abs(await scrollTopOf(scrollContainer) - stoppedAt)).toBeLessThanOrEqual(1);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(renderer(page)).toHaveAttribute('data-grid-engine-editor-gesture', 'IDLE');
  const releasedAt = await scrollTopOf(scrollContainer);
  await page.waitForTimeout(250);
  expect(Math.abs(await scrollTopOf(scrollContainer) - releasedAt)).toBeLessThanOrEqual(1);
  const committed = await geometryOf(page, id);
  expect(committed).not.toEqual(initial);

  // Releasing the handle restores native panning immediately; no canvas-wide
  // touch lock survives the Grid Engine transaction.
  await scrollContainer.evaluate((element) => { element.scrollTop = (element.scrollHeight - element.clientHeight) / 2; });
  await page.waitForTimeout(80);
  const panId = await visibleEditableId(scrollContainer);
  if (!panId) throw new Error('No card is visible for the post-drag native pan.');
  const [panX, panY] = await centerOf(item(page, panId));
  const panStart = await scrollTopOf(scrollContainer);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: panX, y: panY }] });
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: panX, y: panY - step * 14 }],
    });
    await page.waitForTimeout(24);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeGreaterThan(panStart + 20);

  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => geometryOf(page, id)).toEqual(initial);

  // A second gesture autoscrolls upward, then pointercancel must discard its
  // preview and stop the animation without adding another transaction.
  await scrollContainer.evaluate((element) => { element.scrollTop = (element.scrollHeight - element.clientHeight) / 2; });
  await page.waitForTimeout(100);
  const cancelId = await visibleEditableId(scrollContainer);
  if (!cancelId) throw new Error('No editable card is visible for pointer cancellation.');
  await selectForTouchDrag(page, cancelId);
  const beforeCancel = await geometryOf(page, cancelId);
  const [cancelX, cancelY] = await centerOf(dragHandleOf(page, cancelId));
  const cancelStartScroll = await scrollTopOf(scrollContainer);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelX, y: cancelY }] });
  await page.waitForTimeout(600);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: cancelX, y: scrollBounds.y + 4 }],
  });
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeLessThan(cancelStartScroll - 30);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(renderer(page)).toHaveAttribute('data-grid-engine-editor-gesture', 'IDLE');
  const cancelledAt = await scrollTopOf(scrollContainer);
  await page.waitForTimeout(250);
  expect(Math.abs(await scrollTopOf(scrollContainer) - cancelledAt)).toBeLessThanOrEqual(1);
  expect(await geometryOf(page, cancelId)).toEqual(beforeCancel);
});

test('the same touch handle drives Automatic reorder without native scrolling', async ({ page, context }) => {
  const cdp = await openEditor(page, context);
  const scrollContainer = editorScrollContainer(page);
  await scrollContainer.evaluate((element) => { element.scrollTop = 0; });
  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();
  await expect(editorHost(page)).toHaveAttribute('data-grid-engine-editor-mode', 'automatic');
  await selectForTouchDrag(page, 'sensor.uno');
  const ids = layout.widgets.map((entry) => entry.id);
  const initialOrder = await rootOrder(page, ids);
  const initial = await geometryOf(page, 'sensor.uno');
  const [x, y] = await centerOf(dragHandleOf(page, 'sensor.uno'));
  const sourceBounds = await rootItem(page, 'sensor.uno').boundingBox();
  const targetId = await page.locator('[data-grid-engine-root-item]').evaluateAll((elements, source) => {
    return elements
      .map((element) => ({
        id: element.getAttribute('data-grid-engine-root-item'),
        x: Number(element.getAttribute('data-grid-x')),
        y: Number(element.getAttribute('data-grid-y')),
      }))
      .filter((entry) => entry.id && entry.x === source.x && entry.y > source.y)
      .sort((first, second) => first.y - second.y)[0]?.id ?? null;
  }, initial);
  if (!targetId) throw new Error('Automatic reorder has no following card in the same XS lane.');
  const target = await rootItem(page, targetId).boundingBox();
  if (!sourceBounds || !target) throw new Error('Automatic reorder target has no bounds.');
  const handleOffsetY = y - sourceBounds.y;
  const scrollBefore = await scrollTopOf(scrollContainer);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(600);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x, y: target.y + handleOffsetY }],
  });
  await expect(editorHost(page)).toHaveAttribute('data-grid-engine-editor-operation', 'REORDER');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => rootOrder(page, ids)).not.toEqual(initialOrder);
  await expect.poll(() => geometryOf(page, 'sensor.uno')).not.toEqual(initial);
  expect(Math.abs(await scrollTopOf(scrollContainer) - scrollBefore)).toBeLessThanOrEqual(1);
});

test('the touch handle previews and commits a direct Automatic horizontal swap on XS', async ({ page, context }) => {
  const cdp = await openEditor(page, context, phoneSwapLayout);
  const scrollContainer = editorScrollContainer(page);
  await scrollContainer.evaluate((element) => { element.scrollTop = 0; });
  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();
  await expect(editorHost(page)).toHaveAttribute('data-grid-engine-editor-mode', 'automatic');

  const aId = 'sensor.swap-a';
  const bId = 'sensor.swap-b';
  const unrelatedId = 'sensor.swap-unrelated';
  await selectForTouchDrag(page, aId);
  const initial = {
    a: await geometryOf(page, aId),
    b: await geometryOf(page, bId),
    unrelated: await geometryOf(page, unrelatedId),
  };
  const source = await rootItem(page, aId).boundingBox();
  const target = await rootItem(page, bId).boundingBox();
  const handle = await centerOf(dragHandleOf(page, aId));
  if (!source || !target) throw new Error('XS horizontal swap has no browser bounds.');
  const endX = target.x + (handle[0] - source.x);
  const scrollBefore = await scrollTopOf(scrollContainer);

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: handle[0], y: handle[1] }],
  });
  await page.waitForTimeout(600);
  for (let step = 1; step <= 12; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: handle[0] + (endX - handle[0]) * step / 12,
        y: handle[1],
      }],
    });
    await page.waitForTimeout(25);
  }
  await expect(editorHost(page)).toHaveAttribute('data-grid-engine-editor-operation', 'SWAP');
  const preview = {
    a: await geometryOf(page, aId),
    b: await geometryOf(page, bId),
    unrelated: await geometryOf(page, unrelatedId),
  };
  expect(preview).toEqual({
    a: { ...initial.a, x: initial.b.x, y: initial.b.y },
    b: { ...initial.b, x: initial.a.x, y: initial.a.y },
    unrelated: initial.unrelated,
  });

  for (const jitter of [-2, 2, -1, 1, 0]) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: endX + jitter, y: handle[1] }],
    });
    await page.waitForTimeout(35);
    expect({
      a: await geometryOf(page, aId),
      b: await geometryOf(page, bId),
      unrelated: await geometryOf(page, unrelatedId),
    }).toEqual(preview);
  }

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(renderer(page)).toHaveAttribute('data-grid-engine-editor-gesture', 'IDLE');
  await expect.poll(async () => ({
    a: await geometryOf(page, aId),
    b: await geometryOf(page, bId),
    unrelated: await geometryOf(page, unrelatedId),
  })).toEqual(preview);
  expect(Math.abs(await scrollTopOf(scrollContainer) - scrollBefore)).toBeLessThanOrEqual(1);

  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => geometryOf(page, aId)).toEqual(initial.a);
  await expect.poll(() => geometryOf(page, bId)).toEqual(initial.b);
  await page.getByRole('button', { name: 'Ripeti ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => geometryOf(page, aId)).toEqual(preview.a);
  await expect.poll(() => geometryOf(page, bId)).toEqual(preview.b);
});
