const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';
const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

const seededLayout = {
  version: 13,
  widgetTypeLayoutOverrides: {},
  sections: [
    {
      id: 'section-stack-test',
      kind: 'stack-grid',
      title: 'Grid Stack Test',
      stackColumns: 3,
      stackShowBackground: true,
      stackShowBorder: true,
      stackShowHeader: true,
      stackUseFavoritesGrid: false,
      layout: { i: 'section-stack-test', x: 0, y: 3, w: 12, h: 10 },
    },
  ],
  widgets: [
    {
      id: 'light.root_a',
      kind: 'light',
      title: 'Root Light A',
      entityId: 'light.living_room_lamp',
      dataSource: 'mock',
      status: 'Idle',
      isOn: true,
      value: 60,
      unit: '%',
      layout: { i: 'light.root_a', x: 0, y: 0, w: 2, h: 2 },
    },
    {
      id: 'sensor.root_a',
      kind: 'sensor',
      title: 'Root Sensor A',
      entityId: 'sensor.nest_wifi_download',
      dataSource: 'mock',
      status: 'Tracking',
      isOn: true,
      value: 42,
      unit: '%',
      layout: { i: 'sensor.root_a', x: 3, y: 0, w: 2, h: 2 },
    },
    {
      id: 'climate.root_a',
      kind: 'climate',
      title: 'Root Climate A',
      entityId: 'climate.air_conditioner',
      dataSource: 'mock',
      status: 'Idle',
      isOn: true,
      value: 23,
      unit: 'C',
      layout: { i: 'climate.root_a', x: 6, y: 0, w: 3, h: 3 },
    },
    {
      id: 'light.stack_a',
      kind: 'light',
      title: 'Stack Light A',
      entityId: 'light.lamp_2',
      dataSource: 'mock',
      parentSectionId: 'section-stack-test',
      status: 'Idle',
      isOn: true,
      value: 75,
      unit: '%',
      layout: { i: 'light.stack_a', x: 0, y: 0, w: 2, h: 2 },
    },
    {
      id: 'sensor.stack_a',
      kind: 'sensor',
      title: 'Stack Sensor A',
      entityId: 'sensor.living_room_humidity',
      dataSource: 'mock',
      parentSectionId: 'section-stack-test',
      status: 'Tracking',
      isOn: true,
      value: 48,
      unit: '%',
      layout: { i: 'sensor.stack_a', x: 2, y: 0, w: 2, h: 2 },
    },
    {
      id: 'media.stack_a',
      kind: 'media',
      title: 'Stack Media A',
      entityId: 'media_player.living_room_tv',
      dataSource: 'mock',
      parentSectionId: 'section-stack-test',
      status: 'paused',
      isOn: false,
      value: 0,
      unit: '%',
      layout: { i: 'media.stack_a', x: 4, y: 0, w: 2, h: 3 },
    },
  ],
};

async function dragBy(page, locator, dx, dy) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Cannot drag: target has no bounding box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

async function enterEditMode(page) {
  const directEditButton = page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first();
  await directEditButton.waitFor({ state: 'visible' });
  await directEditButton.click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await page.waitForSelector('.sections-grid.is-editing .react-grid-item');
}

async function readRootPositions(page) {
  return page.evaluate(() => {
    const grid = document.querySelector('.sections-grid');
    const gridRect = grid?.getBoundingClientRect();
    return [...document.querySelectorAll('.sections-grid > .react-grid-item')]
      .filter((node) => !node.classList.contains('react-grid-placeholder'))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const text = [
          node.textContent ?? '',
          ...[...node.querySelectorAll('[aria-label]')].map((child) => child.getAttribute('aria-label') ?? ''),
        ]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        return {
          text,
          x: Math.round(rect.left - (gridRect?.left ?? 0)),
          y: Math.round(rect.top - (gridRect?.top ?? 0)),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          transform: getComputedStyle(node).transform,
        };
      });
  });
}

async function readStackOverlayPositions(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.builder-grid .react-grid-item')]
      .filter((node) => !node.classList.contains('react-grid-placeholder'))
      .map((node) => {
        const button = node.querySelector('button[aria-label^="Muovi"]');
        const rect = node.getBoundingClientRect();
        return {
          label: button?.getAttribute('aria-label') ?? '',
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          transform: getComputedStyle(node).transform,
        };
      });
  });
}

function findByText(items, text) {
  const match = items.find((item) => item.text?.includes(text) || item.label?.includes(text));
  if (!match) {
    throw new Error(`Missing item containing "${text}"`);
  }
  return match;
}

function delta(a, b) {
  return { dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y), dw: Math.abs(a.w - b.w), dh: Math.abs(a.h - b.h) };
}

function assertPositionStable(before, after, label, tolerance = 1) {
  const beforeItem = findByText(before, label);
  const afterItem = findByText(after, label);
  const itemDelta = delta(beforeItem, afterItem);
  expect(itemDelta.dx).toBeLessThanOrEqual(tolerance);
  expect(itemDelta.dy).toBeLessThanOrEqual(tolerance);
  expect(itemDelta.dw).toBeLessThanOrEqual(tolerance);
  expect(itemDelta.dh).toBeLessThanOrEqual(tolerance);
}

test('GridEngine keeps one canvas breakpoint while live card state updates rerender the dashboard', async ({ page }) => {
  test.setTimeout(30000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript((runtimeKey) => {
    localStorage.clear();
    localStorage.setItem(runtimeKey, 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  }, RUNTIME_KEY);

  await page.goto(`${BASE_URL}/?view=home`);
  await page.waitForSelector('.sections-grid > .react-grid-item');

  const snapshots = [];
  for (let index = 0; index < 20; index += 1) {
    snapshots.push(
      await page.locator('.sections-grid > .react-grid-item').evaluateAll((items) =>
        items.map((item) => item.getAttribute('style')),
      ),
    );
    await page.waitForTimeout(200);
  }

  expect(new Set(snapshots.map((snapshot) => JSON.stringify(snapshot))).size).toBe(1);
});

test('Responsive preview constrains the real canvas and exposes one active breakpoint', async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript((runtimeKey) => {
    localStorage.clear();
    localStorage.setItem(runtimeKey, 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  }, RUNTIME_KEY);

  await page.goto(`${BASE_URL}/home`);
  await enterEditMode(page);

  const responsiveToolbar = page.getByRole('toolbar', { name: 'Anteprima responsive della dashboard' });
  await expect(responsiveToolbar.getByRole('button', { name: 'Annulla ultima modifica' })).toBeVisible();
  await expect(responsiveToolbar.getByRole('status')).toBeVisible();

  await page.getByRole('radio', { name: 'Anteprima mobile' }).click();
  await expect(page.locator('.behance-canvas-shell')).toHaveAttribute('data-preview-width', '390');
  await expect(page.getByLabel('Breakpoint visualizzato XS')).toBeVisible();
  await expect(page.getByRole('button', { name: /Breakpoint da modificare:/ })).toHaveCount(0);

  const mobileBounds = await page.evaluate(() => {
    const host = document.querySelector('.behance-canvas-shell');
    const scroll = host?.parentElement;
    const hostRect = host?.getBoundingClientRect();
    const scrollRect = scroll?.getBoundingClientRect();
    return {
      hostLeft: hostRect?.left ?? 0,
      hostRight: hostRect?.right ?? 0,
      scrollLeft: scrollRect?.left ?? 0,
      scrollRight: scrollRect?.right ?? 0,
    };
  });
  expect(mobileBounds.hostLeft).toBeGreaterThanOrEqual(mobileBounds.scrollLeft - 1);
  expect(mobileBounds.hostRight).toBeLessThanOrEqual(mobileBounds.scrollRight + 1);

  await page.getByRole('radio', { name: 'Anteprima tablet', exact: true }).click();
  await expect(page.locator('.behance-canvas-shell')).toHaveAttribute('data-preview-width', '768');
  await expect(page.getByLabel('Breakpoint visualizzato MD')).toBeVisible();

  await page.getByRole('radio', { name: 'Anteprima desktop' }).click();
  await expect(page.locator('.behance-canvas-shell')).toHaveAttribute('data-preview-width', '1280');
  await expect(page.getByLabel('Breakpoint visualizzato XL')).toBeVisible();

  await page.getByRole('radio', { name: 'Anteprima automatica' }).click();
  await expect(page.locator('.behance-canvas-shell')).toHaveAttribute('data-preview-width', 'auto');

  // These CSS viewport widths correspond to a 1920px desktop observed at
  // 80%, 100%, 125% and 150% browser zoom. The dashboard shell must remain
  // clipped to its own canvas instead of creating page-level horizontal scroll.
  for (const width of [2400, 1920, 1536, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const bounds = await page.evaluate(() => {
      const host = document.querySelector('.behance-canvas-shell');
      const scroll = host?.parentElement;
      const toolbar = document.querySelector('[aria-label="Anteprima responsive della dashboard"]');
      const hostRect = host?.getBoundingClientRect();
      const scrollRect = scroll?.getBoundingClientRect();
      const toolbarRect = toolbar?.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        hostLeft: hostRect?.left ?? 0,
        hostRight: hostRect?.right ?? 0,
        scrollLeft: scrollRect?.left ?? 0,
        scrollRight: scrollRect?.right ?? 0,
        toolbarLeft: toolbarRect?.left ?? 0,
        toolbarRight: toolbarRect?.right ?? 0,
      };
    });
    expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(bounds.hostLeft).toBeGreaterThanOrEqual(bounds.scrollLeft - 1);
    expect(bounds.hostRight).toBeLessThanOrEqual(bounds.scrollRight + 1);
    expect(bounds.toolbarLeft).toBeGreaterThanOrEqual(0);
    expect(bounds.toolbarRight).toBeLessThanOrEqual(bounds.viewportWidth);
  }

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.getByRole('toolbar', { name: 'Anteprima responsive della dashboard' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Anteprima desktop' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Anteprima tablet', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Anteprima tablet verticale' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Anteprima mobile' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Cronologia modifiche' })).toBeVisible();

  await page.setViewportSize({ width: 520, height: 820 });
  await expect(page.getByRole('toolbar', { name: 'Anteprima responsive della dashboard' })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Cronologia modifiche' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apri catalogo componenti' })).toContainText('Catalogo');
});

test('Long labels stay inside the canvas with the desktop Builder open across the beta viewport matrix', async ({
  page,
}) => {
  test.setTimeout(60000);
  const longLabelLayout = JSON.parse(JSON.stringify(seededLayout));
  longLabelLayout.widgets[0].title =
    'Lampada principale del soggiorno con un nome volutamente molto lungo';
  longLabelLayout.widgets[1].title =
    'Sensore ambientale multifunzione della zona giorno con descrizione estesa';
  longLabelLayout.sections[0].title =
    'Controlli preferiti della zona giorno con un titolo particolarmente lungo';

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(
    ({ key, value, runtimeKey }) => {
      localStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { key: STORAGE_KEY, value: longLabelLayout, runtimeKey: RUNTIME_KEY },
  );

  await page.goto(`${BASE_URL}/home`);
  await page.waitForSelector('.sections-grid > .react-grid-item');

  const readOverflow = () =>
    page.evaluate(() => {
      const grid = document.querySelector('.sections-grid');
      const host = document.querySelector('.behance-canvas-shell');
      if (!grid || !host) throw new Error('Canvas dashboard non trovato');
      const gridRect = grid.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const rootItems = [...grid.children].filter(
        (node) =>
          node instanceof HTMLElement &&
          node.classList.contains('react-grid-item') &&
          !node.classList.contains('react-grid-placeholder'),
      );
      const outsideItems = rootItems
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 90) ?? '',
            left: Math.round(rect.left - gridRect.left),
            right: Math.round(rect.right - gridRect.right),
            bottom: Math.round(rect.bottom - gridRect.bottom),
          };
        })
        .filter((item) => item.left < -1 || item.right > 1 || item.bottom > 1);
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        hostOverflow: host.scrollWidth - host.clientWidth,
        gridBeyondHost: gridRect.right - hostRect.right,
        outsideItems,
      };
    });

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 900 },
    { width: 1024, height: 900 },
    { width: 768, height: 1024 },
    { width: 520, height: 820 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => (await readOverflow()).outsideItems, {
        timeout: 5_000,
        message: `Il canvas deve stabilizzarsi senza clipping a ${viewport.width}px`,
      })
      .toEqual([]);
    const overflow = await readOverflow();
    expect(overflow.documentOverflow).toBeLessThanOrEqual(1);
    expect(overflow.gridBeyondHost).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await enterEditMode(page);
  await page
    .locator('.sections-grid > .react-grid-item')
    .filter({ hasText: longLabelLayout.widgets[0].title })
    .first()
    .click({ position: { x: 100, y: 28 } });
  await expect(page.locator('aside.builder-sidebar')).toBeVisible();

  const builderGeometry = await page.evaluate(() => {
    const host = document.querySelector('.behance-canvas-shell');
    const sidebar = document.querySelector('aside.builder-sidebar');
    if (!host || !sidebar) throw new Error('Builder desktop non trovato');
    const hostRect = host.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      hostRight: hostRect.right,
      sidebarLeft: sidebarRect.left,
      sidebarRight: sidebarRect.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(builderGeometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(builderGeometry.hostRight).toBeLessThanOrEqual(builderGeometry.sidebarLeft + 1);
  expect(builderGeometry.sidebarRight).toBeLessThanOrEqual(builderGeometry.viewportWidth + 1);
});

test('Demo keeps an edited root layout across route changes and refresh', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(
    ({ key, value, runtimeKey }) => {
      if (!localStorage.getItem(key)) {
        localStorage.clear();
        localStorage.setItem(key, JSON.stringify(value));
      }
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { key: STORAGE_KEY, value: seededLayout, runtimeKey: RUNTIME_KEY },
  );

  await page.goto(`${BASE_URL}/home`);
  await enterEditMode(page);
  await page.locator('.sections-grid > .react-grid-item').filter({ hasText: 'Root Light A' }).first().click({ position: { x: 100, y: 28 } });
  await page.getByRole('radio', { name: 'Layout', exact: true }).click();
  await page.getByRole('button', { name: /Mini, 1 per 1/ }).click();
  await page.getByLabel('Attiva o disattiva modalità modifica').filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Salva ed esci', exact: true }).click();
  await expect(page.locator('.sections-grid')).not.toHaveClass(/is-editing/);

  const beforeNavigation = await readRootPositions(page);
  await page.getByLabel('Apri Stanze').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/rooms/);
  await page.getByLabel('Apri Dashboard').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/home/);
  await page.waitForSelector('.sections-grid > .react-grid-item');
  const afterRouteChange = await readRootPositions(page);
  assertPositionStable(beforeNavigation, afterRouteChange, 'Root Light A');
  assertPositionStable(beforeNavigation, afterRouteChange, 'Root Sensor A');

  await page.reload();
  await page.waitForSelector('.sections-grid > .react-grid-item');
  await expect(
    page.locator('.sections-grid > .react-grid-item').filter({ hasText: 'Root Light A' }).first(),
  ).toContainText('Accesa');
  const afterRefresh = await readRootPositions(page);
  assertPositionStable(beforeNavigation, afterRefresh, 'Root Light A');
  assertPositionStable(beforeNavigation, afterRefresh, 'Root Sensor A');
});

test('GridEngine preserves XL while editing XS/SM and keeps stack reflow stable', async ({ page }) => {
  test.setTimeout(120000);
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(
    ({ key, value, runtimeKey }) => {
      localStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { key: STORAGE_KEY, value: seededLayout, runtimeKey: RUNTIME_KEY },
  );

  await page.goto(`${BASE_URL}/?view=home`);
  await enterEditMode(page);

  const xlRootBeforeClick = await readRootPositions(page);
  const rootLightItem = page.locator('.sections-grid > .react-grid-item').filter({ hasText: 'Root Light A' }).first();
  await rootLightItem.click({ position: { x: 100, y: 28 } });
  await expect(page.getByRole('radio', { name: 'Layout', exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  const xlRootAfterClick = await readRootPositions(page);
  assertPositionStable(xlRootBeforeClick, xlRootAfterClick, 'Root Light A');
  assertPositionStable(xlRootBeforeClick, xlRootAfterClick, 'Root Sensor A');

  const rootLightBeforeLayoutPicker = findByText(xlRootAfterClick, 'Root Light A');
  await page.getByRole('radio', { name: 'Layout', exact: true }).click();
  await page.getByRole('button', { name: /Mini, 1 per 1/ }).click();
  await page.waitForTimeout(350);
  const xlRootAfterLayoutPicker = await readRootPositions(page);
  const rootLightAfterLayoutPicker = findByText(xlRootAfterLayoutPicker, 'Root Light A');
  expect(rootLightAfterLayoutPicker.w).toBeLessThan(rootLightBeforeLayoutPicker.w);
  expect(rootLightAfterLayoutPicker.h).toBeLessThanOrEqual(rootLightBeforeLayoutPicker.h);

  await expect(page.getByLabel('Muovi Stack Light A')).toBeVisible({ timeout: 5000 });
  const xlStackBeforeClick = await readStackOverlayPositions(page);
  await page.getByLabel('Muovi Stack Light A').click();
  await page.waitForTimeout(250);
  const xlStackAfterClick = await readStackOverlayPositions(page);
  assertPositionStable(xlStackBeforeClick, xlStackAfterClick, 'Stack Light A');
  assertPositionStable(xlStackBeforeClick, xlStackAfterClick, 'Stack Sensor A');

  await dragBy(page, page.locator('.sections-grid > .react-grid-item').filter({ hasText: 'Root Light A' }).first(), 260, 120);
  const xlAfterRootDrag = await readRootPositions(page);
  const xlRootLight = findByText(xlAfterRootDrag, 'Root Light A');

  const moveLabels = await page.locator('button[aria-label^="Muovi"]').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')),
  );
  console.log(`GRID_ENGINE_MOVE_LABELS ${JSON.stringify(moveLabels)}`);
  await page.getByLabel('Muovi Stack Light A').scrollIntoViewIfNeeded();
  await dragBy(page, page.getByLabel('Muovi Stack Light A'), 180, 140);
  const xlStackAfterDrag = await readStackOverlayPositions(page);
  const xlStackLight = findByText(xlStackAfterDrag, 'Stack Light A');

  await page.setViewportSize({ width: 520, height: 820 });
  await page.waitForTimeout(700);
  await dragBy(page, page.locator('.sections-grid > .react-grid-item').filter({ hasText: 'Root Sensor A' }).first(), 20, 180);
  const smAfterRootDrag = await readRootPositions(page);
  const smRootSensor = findByText(smAfterRootDrag, 'Root Sensor A');

  await page.setViewportSize({ width: 390, height: 820 });
  await page.waitForTimeout(700);
  await page.getByLabel('Muovi Stack Sensor A').scrollIntoViewIfNeeded();
  await dragBy(page, page.getByLabel('Muovi Stack Sensor A'), 10, 160);
  const xsStackAfterDrag = await readStackOverlayPositions(page);
  const xsStackSensor = findByText(xsStackAfterDrag, 'Stack Sensor A');

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForTimeout(250);
  await expect.poll(async () => {
    const positions = await readRootPositions(page);
    return delta(xlRootLight, findByText(positions, 'Root Light A')).dx;
  }, { timeout: 15_000 }).toBeLessThanOrEqual(3);
  await expect.poll(async () => {
    const positions = await readRootPositions(page);
    return delta(xlRootLight, findByText(positions, 'Root Light A')).dy;
  }, { timeout: 15_000 }).toBeLessThanOrEqual(3);
  await expect.poll(async () => {
    const positions = await readStackOverlayPositions(page);
    return delta(xlStackLight, findByText(positions, 'Stack Light A')).dy;
  }, { timeout: 15_000 }).toBeLessThanOrEqual(3);
  const xlAfterReturnRoot = await readRootPositions(page);
  const xlRootLightReturned = findByText(xlAfterReturnRoot, 'Root Light A');
  const xlAfterReturnStack = await readStackOverlayPositions(page);
  const xlStackLightReturned = findByText(xlAfterReturnStack, 'Stack Light A');

  const rootDelta = delta(xlRootLight, xlRootLightReturned);
  const stackDelta = delta(xlStackLight, xlStackLightReturned);
  const report = {
    rootDeltaAfterMobileRoundTrip: rootDelta,
    stackDeltaAfterMobileRoundTrip: stackDelta,
    smRootSensor,
    xsStackSensor,
    consoleErrors: consoleErrors.slice(0, 5),
  };
  console.log(`GRID_ENGINE_TEST_REPORT ${JSON.stringify(report, null, 2)}`);

  expect(consoleErrors).toEqual([]);
  expect(smRootSensor.x).toBeGreaterThan(100);
  expect(rootDelta.dx).toBeLessThanOrEqual(3);
  expect(rootDelta.dy).toBeLessThanOrEqual(3);
  expect(stackDelta.dx).toBeLessThanOrEqual(3);
  expect(stackDelta.dy).toBeLessThanOrEqual(3);
});
