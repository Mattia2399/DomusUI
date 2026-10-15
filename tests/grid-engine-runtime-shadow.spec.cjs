const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';
const RUNTIME_SHADOW_PREFIX = '[DomusUI:grid-engine2:runtime-shadow]';
const SHADOW_PREFIX = '[DomusUI:grid-engine2:shadow]';
const EXPECT_RUNTIME_SHADOW = process.env.VITE_GRID_ENGINE_2_RUNTIME_SHADOW === 'true';
const EXPECT_RECONCILIATION = EXPECT_RUNTIME_SHADOW
  && process.env.VITE_GRID_ENGINE_2_RUNTIME_SHADOW_RECONCILE === 'true';
const EXPECT_SHADOW = process.env.VITE_GRID_ENGINE_2_SHADOW === 'true';
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

function runtimeShadowFixture() {
  const breakpoints = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  const ids = ['runtime.light', ...Array.from({ length: 21 }, (_, index) => `runtime.root-${index + 1}`)];
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
      widget(ids[0], 'light', 'Runtime Shadow Light', byId.get(ids[0])),
      ...ids.slice(1).map((id, index) => widget(id, 'sensor', `Runtime Root ${index + 1}`, byId.get(id))),
    ],
  };
}

function runtimeShadowReconciliationFixture() {
  const fixture = runtimeShadowFixture();
  const stackId = 'section-stack-grid-99';
  const nested = fixture.widgets.at(-1);
  nested.parentSectionId = stackId;
  nested.layout = { i: nested.id, x: 0, y: 0, w: 1, h: 1 };
  const stackLayouts = {};
  Object.entries(fixture.responsiveLayouts.root).forEach(([breakpoint, items]) => {
    const y = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const stackItem = { i: stackId, x: 0, y, w: breakpoint === 'xs' ? 2 : 2, h: 2 };
    fixture.responsiveLayouts.root[breakpoint] = [stackItem, ...items];
    stackLayouts[breakpoint] = [{ i: nested.id, x: 0, y: 0, w: 1, h: 1 }];
  });
  fixture.responsiveLayouts.stacks = { [stackId]: stackLayouts };
  fixture.sections = [{
    id: stackId,
    kind: 'stack-grid',
    title: 'Runtime Stack',
    layout: fixture.responsiveLayouts.root.xl[0],
    stackColumns: 2,
    stackColumnsMode: 'manual',
    stackShowBackground: true,
    stackShowBorder: true,
    stackShowHeader: true,
  }];
  return fixture;
}

async function rendererGeometry(page) {
  return page.locator('.sections-grid > *:not(.react-grid-placeholder)').evaluateAll((items) =>
    items.map((item) => ({
      id: item.getAttribute('data-grid-item-id') || item.textContent?.trim().slice(0, 40),
      className: item.className,
      style: item.getAttribute('style'),
      x: item.getAttribute('data-grid-x'),
      y: item.getAttribute('data-grid-y'),
      w: item.getAttribute('data-grid-w'),
      h: item.getAttribute('data-grid-h'),
    })),
  );
}

async function stableGeometry(page) {
  await page.waitForFunction(() => new Promise((resolve) => {
    let previous = '';
    let stableFrames = 0;
    const inspect = () => {
      const current = JSON.stringify([...document.querySelectorAll('.sections-grid > *:not(.react-grid-placeholder)')].map((item) => ({
        style: item.getAttribute('style'),
        x: item.getAttribute('data-grid-x'),
        y: item.getAttribute('data-grid-y'),
        w: item.getAttribute('data-grid-w'),
        h: item.getAttribute('data-grid-h'),
      })));
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 3) resolve(true);
      else requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  }));
  return rendererGeometry(page);
}

test(`Runtime Shadow ${EXPECT_RUNTIME_SHADOW ? 'enabled' : 'disabled'} is independent and observational`, async ({ page }) => {
  test.setTimeout(120_000);
  const reports = [];
  const legacyShadowReports = [];
  const browserErrors = [];
  const haRequests = [];
  page.on('console', async (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
    const detail = message.args()[1];
    if (message.text().includes(RUNTIME_SHADOW_PREFIX)) {
      reports.push(detail ? await detail.jsonValue().catch(() => ({ event: 'unreadable' })) : { event: 'missing' });
    } else if (message.text().includes(SHADOW_PREFIX)) {
      legacyShadowReports.push(detail ? await detail.jsonValue().catch(() => ({ event: 'unreadable' })) : { event: 'missing' });
    }
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || request.resourceType() === 'websocket') haRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(
    ({ storageKey, runtimeKey, layout }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(storageKey, JSON.stringify(layout));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
      const originalSetItem = Storage.prototype.setItem;
      window.__runtimeShadowStorageWrites = [];
      window.__trackRuntimeShadowStorageWrites = false;
      Storage.prototype.setItem = function observedSetItem(key, value) {
        if (window.__trackRuntimeShadowStorageWrites) window.__runtimeShadowStorageWrites.push([key, value]);
        return originalSetItem.call(this, key, value);
      };
    },
    { storageKey: STORAGE_KEY, runtimeKey: RUNTIME_KEY, layout: runtimeShadowFixture() },
  );

  await page.goto('/?view=home');
  await expect(page.locator('.sections-grid > *:not(.react-grid-placeholder)')).toHaveCount(22);
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(EXPECT_RENDERER ? 1 : 0);
  const editToggle = page.getByRole('button', { name: 'Attiva o disattiva modalità modifica' });
  await expect(editToggle).toHaveAttribute('aria-pressed', 'false');
  const initialGeometry = await stableGeometry(page);
  await page.evaluate(() => { window.__trackRuntimeShadowStorageWrites = true; });

  if (!EXPECT_RUNTIME_SHADOW) {
    await page.waitForTimeout(450);
    expect(reports).toEqual([]);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
    expect(resources.some((name) => name.includes('runtimeShadowMode'))).toBe(false);
  } else {
    await expect.poll(() => reports.filter((report) => report.event === 'report').length).toBeGreaterThan(0);
    const initialReport = reports.find((report) => report.event === 'report');
    expect(initialReport.breakpoint).toBe('xl');
    expect(initialReport.counts.roots).toBe(22);
    expect(initialReport.baseline).toEqual({
      quality: 'explicit-complete-candidate',
      provenance: 'responsive-layout-root',
      confidence: 'provisional',
    });
    expect(initialReport.reference).toBe('legacy-runtime-input');
    expect(initialReport.baselineIdAudit.recognizedRootIds).toBe(22);
    expect(initialReport.baselineIdAudit.structuralIds.xl).toBe(22);
    expect(initialReport.baselineIdAudit.renderedRootIds.xl).toBe(22);
    expect(initialReport.baselineIdAudit.unknownIdsCount).toBe(0);
    expect(initialReport.baselineIdAudit.missingIdsCount).toBe(0);
    expect(initialReport.baselineIdAudit.affectedBreakpoints).toEqual([]);
    expect(JSON.stringify(initialReport)).not.toContain('runtime.light');
    expect(initialReport.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(await stableGeometry(page)).toEqual(initialGeometry);

    const lightRoot = page.locator('.sections-grid > *').filter({ hasText: 'Runtime Shadow Light' }).first();
    await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', 'off');
    const reportsBeforeExpansion = reports.length;
    await lightRoot.locator('.light-card__toggle').press('Enter');
    await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', 'on');
    await expect.poll(() => reports.length).toBeGreaterThan(reportsBeforeExpansion);
    expect(reports.at(-1).counts.overrides).toBe(1);
    const expandedGeometry = await stableGeometry(page);
    expect(expandedGeometry).not.toEqual(initialGeometry);
    await expect(editToggle).toHaveAttribute('aria-pressed', 'false');

    const reportsBeforeBreakpoint = reports.length;
    await page.setViewportSize({ width: 500, height: 820 });
    await expect.poll(() => reports.slice(reportsBeforeBreakpoint).some((report) => report.breakpoint === 'xs')).toBe(true);
    const xsGeometry = await stableGeometry(page);
    const xsReportCount = reports.length;
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    // Two diagnostic settle windows: enough to expose a duplicate scheduling
    // loop without making geometry readiness depend on a fixed delay.
    await page.waitForTimeout(400);
    expect(reports.length).toBe(xsReportCount);
    expect(await stableGeometry(page)).toEqual(xsGeometry);

    const signatures = reports.filter((report) => report.event === 'report').map((report) => report.signature);
    expect(new Set(signatures).size).toBe(signatures.length);
  }

  if (EXPECT_SHADOW) {
    await expect.poll(() => legacyShadowReports.some((report) => report.event === 'report')).toBe(true);
  } else {
    expect(legacyShadowReports).toEqual([]);
  }
  expect(await page.evaluate(() => window.__runtimeShadowStorageWrites)).toEqual([]);
  expect(haRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
  await expect(page.locator('.dashboard-edit-overlay')).toHaveCount(0);
});

test(`Runtime Shadow reconciliation ${EXPECT_RECONCILIATION ? 'enabled' : 'inactive'} is projection-only`, async ({ page }) => {
  test.setTimeout(120_000);
  const reports = [];
  const browserErrors = [];
  const haRequests = [];
  page.on('console', async (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
    const detail = message.args()[1];
    if (message.text().includes(RUNTIME_SHADOW_PREFIX)) {
      reports.push(detail ? await detail.jsonValue().catch(() => ({ event: 'unreadable' })) : { event: 'missing' });
    }
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || request.resourceType() === 'websocket') haRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(
    ({ storageKey, runtimeKey, layout }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(storageKey, JSON.stringify(layout));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
      const originalSetItem = Storage.prototype.setItem;
      window.__runtimeShadowStorageWrites = [];
      window.__trackRuntimeShadowStorageWrites = false;
      Storage.prototype.setItem = function observedSetItem(key, value) {
        if (window.__trackRuntimeShadowStorageWrites) window.__runtimeShadowStorageWrites.push([key, value]);
        return originalSetItem.call(this, key, value);
      };
    },
    { storageKey: STORAGE_KEY, runtimeKey: RUNTIME_KEY, layout: runtimeShadowReconciliationFixture() },
  );

  await page.goto('/?view=home');
  await expect(page.locator('.sections-grid > *:not(.react-grid-placeholder)')).toHaveCount(22);
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(EXPECT_RENDERER ? 1 : 0);
  const initialGeometry = await stableGeometry(page);
  await page.evaluate(() => { window.__trackRuntimeShadowStorageWrites = true; });

  if (!EXPECT_RUNTIME_SHADOW) {
    await page.waitForTimeout(450);
    expect(reports).toEqual([]);
  } else {
    await expect.poll(() => reports.some((report) => report.event === 'report')).toBe(true);
    const report = reports.find((entry) => entry.event === 'report');
    expect(report.baseline.quality).toBe('unreliable');
    expect(report.baselineIdAudit.unknownIdsCount).toBe(1);
    expect(report.reconciliation.originalIssues).toContain('UNKNOWN_LAYOUT_ID');
    expect(report.reconciliation.classifications[0]).toMatchObject({
      classification: 'EXISTING_NESTED_WIDGET',
      evidence: 'exact-current-nested-widget',
      parentRole: 'stack',
    });
    if (EXPECT_RECONCILIATION) {
      expect(report.reconciliation).toMatchObject({
        status: 'reconciled',
        reconciledBaselineQuality: 'reconciled-provisional',
        classifiedNestedCount: 1,
        excludedFromDiagnosticProjectionCount: 1,
        remainingIssues: [],
        confidence: 'provisional',
      });
      if (report.solver === 'not-run') {
        // A live Stack may have a runtime-computed height with no structural
        // causal source. Reconciliation succeeded, but override extraction
        // must still refuse to guess that geometry.
        expect(report.issues).toContain('UNSUPPORTED_DYNAMIC_STACK');
        expect(report.comparison).toBe('insufficient-data');
      }
    } else {
      expect(report.reconciliation.status).toBe('disabled');
      expect(report.reconciliation.excludedFromDiagnosticProjectionCount).toBe(0);
      expect(report.solver).toBe('not-run');
    }
    expect(JSON.stringify(report)).not.toContain('runtime.root-21');
  }

  const reportCount = reports.length;
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(400);
  expect(reports.length).toBe(reportCount);
  expect(await stableGeometry(page)).toEqual(initialGeometry);
  expect(await page.evaluate(() => window.__runtimeShadowStorageWrites)).toEqual([]);
  expect(haRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
  await expect(page.locator('.dashboard-edit-overlay')).toHaveCount(0);
});
