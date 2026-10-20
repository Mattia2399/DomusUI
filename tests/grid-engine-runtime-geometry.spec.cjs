const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';
const GEOMETRY_PREFIX = '[DomusUI:grid-engine2:runtime-geometry]';
const EXPECT_RUNTIME_SHADOW = process.env.VITE_GRID_ENGINE_2_RUNTIME_SHADOW === 'true';
const EXPECT_GEOMETRY = EXPECT_RUNTIME_SHADOW
  && process.env.VITE_GRID_ENGINE_2_RUNTIME_GEOMETRY_INSPECT === 'true';
const EXPECT_RENDERER = process.env.VITE_GRID_ENGINE_2_RENDERER === 'true';

function widget(id, kind, title, layout) {
  return {
    id,
    kind,
    title,
    entityId: `${kind}.${id.replaceAll('.', '_')}`,
    dataSource: 'mock',
    placementPolicy: 'manual',
    status: kind === 'light' ? 'Spenta' : 'Attivo',
    isOn: false,
    value: kind === 'light' ? 0 : 64,
    unit: '%',
    layout: { i: id, ...layout },
  };
}

function geometryFixture() {
  const breakpoints = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  const ids = [
    'geometry.private-light',
    'geometry.direct',
    'geometry.chain',
    'geometry.other-lane',
    ...Array.from({ length: 17 }, (_, index) => `geometry.fill-${index + 1}`),
  ];
  const layoutFor = (cols) => {
    const span = cols <= 4 ? 1 : 2;
    const laneX = Math.min(span, Math.max(0, cols - span));
    const fixed = [
      { i: ids[0], x: 0, y: 0, w: span, h: 1 },
      { i: ids[1], x: 0, y: 1, w: span, h: 1 },
      { i: ids[2], x: 0, y: 2, w: span, h: 1 },
      { i: ids[3], x: laneX, y: 0, w: Math.max(1, Math.min(span, cols - laneX)), h: 2 },
    ];
    const perRow = Math.max(1, Math.floor(cols / span));
    return [
      ...fixed,
      ...ids.slice(4).map((id, index) => ({
        i: id,
        x: (index % perRow) * span,
        y: 4 + Math.floor(index / perRow),
        w: span,
        h: 1,
      })),
    ];
  };
  const desktop = layoutFor(12);
  const byId = new Map(desktop.map((item) => [item.i, item]));
  return {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root: Object.fromEntries(
        Object.entries(breakpoints).map(([breakpoint, cols]) => [breakpoint, layoutFor(cols)]),
      ),
    },
    sections: [],
    widgets: [
      widget(ids[0], 'light', 'Geometry Light', byId.get(ids[0])),
      widget(ids[1], 'sensor', 'Geometry Direct', byId.get(ids[1])),
      widget(ids[2], 'sensor', 'Geometry Chain', byId.get(ids[2])),
      widget(ids[3], 'sensor', 'Geometry Other Lane', byId.get(ids[3])),
      ...ids.slice(4).map((id, index) => widget(id, 'sensor', `Geometry Fill ${index + 1}`, byId.get(id))),
    ],
  };
}

function densityFixture(count) {
  const breakpoints = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  const ids = Array.from({ length: count }, (_, index) => `geometry.density-${index + 1}`);
  const layoutFor = (cols) => {
    const span = cols <= 4 ? 1 : 2;
    const perRow = Math.max(1, Math.floor(cols / span));
    return ids.map((id, index) => ({
      i: id,
      x: (index % perRow) * span,
      y: Math.floor(index / perRow),
      w: span,
      h: 1,
    }));
  };
  const desktop = layoutFor(12);
  return {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root: Object.fromEntries(
        Object.entries(breakpoints).map(([breakpoint, cols]) => [breakpoint, layoutFor(cols)]),
      ),
    },
    sections: [],
    widgets: ids.map((id, index) => widget(id, 'sensor', `Geometry Density ${index + 1}`, desktop[index])),
  };
}

async function installFixture(page, layout = geometryFixture()) {
  await page.addInitScript(
    ({ storageKey, runtimeKey, layout }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(storageKey, JSON.stringify(layout));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
      const originalSetItem = Storage.prototype.setItem;
      window.__runtimeGeometryWrites = [];
      window.__trackRuntimeGeometryWrites = false;
      Storage.prototype.setItem = function observedSetItem(key, value) {
        if (window.__trackRuntimeGeometryWrites) window.__runtimeGeometryWrites.push([key, value]);
        return originalSetItem.call(this, key, value);
      };
    },
    { storageKey: STORAGE_KEY, runtimeKey: RUNTIME_KEY, layout },
  );
}

async function rootRects(page) {
  return page.locator('[data-grid-engine-runtime-geometry-id]').evaluateAll((markers) =>
    Object.fromEntries(markers.map((marker) => {
      const root = marker.closest('[data-grid-engine-root-item], .react-grid-item');
      const rect = root.getBoundingClientRect();
      return [marker.getAttribute('data-grid-engine-runtime-geometry-id'), {
        left: Math.round(rect.left * 10) / 10,
        top: Math.round(rect.top * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      }];
    })),
  );
}

async function waitForGeometryReport(reports, predicate, startIndex = 0) {
  await expect.poll(() => reports.slice(startIndex).findLast(predicate) ?? null, {
    timeout: 15_000,
    intervals: [100, 250, 500],
  }).not.toBeNull();
  return reports.slice(startIndex).findLast(predicate);
}

test(`runtime geometry inspection ${EXPECT_GEOMETRY ? 'enabled' : 'disabled'} is read-only`, async ({ page }) => {
  test.setTimeout(120_000);
  const reports = [];
  const browserErrors = [];
  const haRequests = [];
  page.on('console', async (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
    if (!message.text().includes(GEOMETRY_PREFIX)) return;
    const detail = message.args()[1];
    reports.push(detail ? await detail.jsonValue().catch(() => ({ event: 'unreadable' })) : { event: 'missing' });
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || request.resourceType() === 'websocket') haRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await installFixture(page);
  await page.goto('/?view=home');
  await expect(page.locator('.sections-grid > .react-grid-item')).toHaveCount(21);
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(EXPECT_RENDERER ? 1 : 0);
  await page.evaluate(() => { window.__trackRuntimeGeometryWrites = true; });

  if (!EXPECT_GEOMETRY) {
    await page.waitForTimeout(500);
    expect(reports).toEqual([]);
    await expect(page.locator('[data-grid-engine-runtime-geometry-id]')).toHaveCount(0);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
    expect(resources.some((name) => name.includes('runtimeGeometryDomInspection'))).toBe(false);
    expect(await page.evaluate(() => window.__runtimeGeometryWrites)).toEqual([]);
    expect(haRequests).toEqual([]);
    expect(browserErrors).toEqual([]);
    return;
  }

  await expect(page.locator('[data-grid-engine-runtime-geometry-id]')).toHaveCount(21);
  const initial = await waitForGeometryReport(reports, (report) =>
    report.event === 'geometry-report' && report.counts.solverChanges === 0);
  expect(initial.counts.roots).toBe(21);
  expect(initial.counts.finalCellOverlaps).toBe(0);
  expect(initial.counts.observedDomOverlaps).toBe(0);
  expect(initial.counts.stableDom).toBe(21);
  expect(initial.counts.transientDom).toBe(0);
  expect(initial.counts.domSnapshots).toBe(2);
  expect(initial.dom.status).toBe('stable');
  expect(initial.dom.renderer).toBe(EXPECT_RENDERER ? 'grid-engine-2' : 'legacy');
  expect(initial.elements).toHaveLength(21);
  expect(initial.elements.every((entry) => entry.classification.solver === 'unchanged')).toBe(true);
  expect(JSON.stringify(initial)).not.toContain('geometry.private-light');
  const collapsedRects = await rootRects(page);

  const observedRendererModes = [initial.dom.renderer];
  const lightRoot = page.locator('.sections-grid > .react-grid-item').filter({ hasText: 'Geometry Light' }).first();
  await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', 'off');
  const reportsBeforeOn = reports.length;
  await lightRoot.locator('.light-card__toggle').press('Enter');
  await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', 'on');
  const on = await waitForGeometryReport(reports, (report) =>
    report.event === 'geometry-report' && report.counts.solverChanges >= 3, reportsBeforeOn);
  expect(on.counts.directCollisions).toBeGreaterThanOrEqual(1);
  expect(on.counts.collisionChainCandidates).toBeGreaterThanOrEqual(1);
  expect(on.counts.unexplainedMovements).toBe(0);
  expect(on.counts.finalCellOverlaps).toBe(0);
  expect(on.dom.status).toBe('stable');
  expect(on.counts.stableDom).toBe(21);
  expect(on.elements.filter((entry) => entry.classification.solver === 'direct-collision')).toHaveLength(1);
  expect(on.elements.filter((entry) => entry.classification.solver === 'collision-chain-candidate')).toHaveLength(1);

  const reportsBeforeOff = reports.length;
  await lightRoot.locator('.light-card__toggle').press('Enter');
  await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', 'off');
  const offAgain = await waitForGeometryReport(reports, (report) =>
    report.event === 'geometry-report' && report.counts.solverChanges === 0, reportsBeforeOff);
  expect(offAgain.signature).toBe(initial.signature);
  expect(offAgain.dom.status).toBe('stable');
  await expect.poll(async () => await rootRects(page)).toEqual(collapsedRects);

  for (const viewport of [
    { width: 1600, height: 940 },
    { width: 1200, height: 900 },
    { width: 900, height: 850 },
    { width: 650, height: 820 },
    { width: 500, height: 820 },
  ]) {
    const before = reports.length;
    await page.setViewportSize(viewport);
    await page.waitForTimeout(700);
    for (const responsive of reports.slice(before)) {
      expect(responsive.counts.roots).toBe(21);
      expect(responsive.counts.finalCellOverlaps).toBe(0);
      expect(responsive.counts.observedDomOverlaps).toBe(0);
      expect(responsive.dom.status).toBe('stable');
      observedRendererModes.push(responsive.dom.renderer);
    }
  }
  expect(new Set(observedRendererModes)).toEqual(new Set([EXPECT_RENDERER ? 'grid-engine-2' : 'legacy']));
  expect(new Set(reports.map((report) => report.breakpoint)).size).toBeGreaterThanOrEqual(3);

  // Invalidate an in-flight LG observation with a breakpoint change and a
  // second Light update. Only the final, current context may be published.
  const beforeLgSettle = reports.length;
  await page.setViewportSize({ width: 1200, height: 900 });
  const lgSettled = await waitForGeometryReport(reports, (report) =>
    report.event === 'geometry-report', beforeLgSettle);
  const beforeRapidChanges = reports.length;
  await lightRoot.locator('.light-card__toggle').press('Enter');
  await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', 'on');
  await page.waitForTimeout(40);
  await page.setViewportSize({ width: 900, height: 850 });
  await page.waitForTimeout(40);
  await lightRoot.locator('.light-card__toggle').press('Enter');
  await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', 'off');
  const rapidFinal = await waitForGeometryReport(reports, (report) =>
    report.event === 'geometry-report' &&
      report.breakpoint !== lgSettled.breakpoint &&
      report.counts.solverChanges === 0,
  beforeRapidChanges);
  await page.waitForTimeout(1_400);
  const rapidReports = reports.slice(beforeRapidChanges);
  expect(rapidReports.every((report) => report.breakpoint === rapidFinal.breakpoint)).toBe(true);
  expect(rapidReports.every((report) => report.counts.solverChanges === 0)).toBe(true);
  expect(rapidReports.filter((report) => report.signature === rapidFinal.signature)).toHaveLength(1);
  expect(rapidFinal.dom.status).toBe('stable');

  await page.waitForTimeout(500);
  const reportCount = reports.length;
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(400);
  expect(reports.length).toBe(reportCount);
  expect(await page.evaluate(() => window.__runtimeGeometryWrites)).toEqual([]);
  expect(haRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
  await expect(page.locator('.dashboard-edit-overlay')).toHaveCount(0);
  console.log('[runtime-geometry browser performance]', JSON.stringify({
    renderer: EXPECT_RENDERER ? 'grid-engine-2' : 'legacy',
    roots: 21,
    samples: reports.map((report) => report.timings),
  }));
});

for (const rootCount of [11, 30]) test(`runtime geometry inspection measures a ${rootCount}-root fixture once`, async ({ page }) => {
  test.skip(!EXPECT_GEOMETRY, 'requires the separate runtime geometry inspection flag');
  test.setTimeout(90_000);
  const reports = [];
  const haRequests = [];
  page.on('console', async (message) => {
    if (!message.text().includes(GEOMETRY_PREFIX)) return;
    const detail = message.args()[1];
    reports.push(detail ? await detail.jsonValue().catch(() => ({ event: 'unreadable' })) : { event: 'missing' });
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || request.resourceType() === 'websocket') haRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await installFixture(page, densityFixture(rootCount));
  await page.goto('/?view=home');
  await expect(page.locator('.sections-grid > .react-grid-item')).toHaveCount(rootCount);
  const report = await waitForGeometryReport(reports, (entry) =>
    entry.event === 'geometry-report' && entry.counts.roots === rootCount);
  expect(report.status).toBe('available');
  expect(report.elements).toHaveLength(rootCount);
  expect(report.counts.finalCellOverlaps).toBe(0);
  expect(report.counts.observedDomOverlaps).toBe(0);
  expect(report.counts.stableDom).toBe(rootCount);
  expect(report.counts.transientDom).toBe(0);
  expect(report.counts.unavailableDom).toBe(0);
  expect(report.counts.domSnapshots).toBe(2);
  expect(report.dom.status).toBe('stable');
  expect(report.dom.renderer).toBe(EXPECT_RENDERER ? 'grid-engine-2' : 'legacy');
  expect(haRequests).toEqual([]);
  console.log(`[runtime-geometry browser performance ${rootCount}]`, JSON.stringify({
    renderer: EXPECT_RENDERER ? 'grid-engine-2' : 'legacy',
    roots: rootCount,
    timings: report.timings,
  }));
});
