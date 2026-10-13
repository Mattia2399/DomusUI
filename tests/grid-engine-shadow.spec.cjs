const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';
const SHADOW_PREFIX = '[DomusUI:grid-engine2:shadow]';
const EXPECT_SHADOW = process.env.VITE_GRID_ENGINE_2_SHADOW === 'true';

const seededLayout = {
  version: 14,
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
  sections: [
    {
      id: 'shadow-greeting',
      kind: 'greeting',
      title: 'Shadow fixture',
      layout: { i: 'shadow-greeting', x: 0, y: 0, w: 6, h: 2 },
    },
  ],
  widgets: [
    {
      id: 'shadow-light',
      kind: 'light',
      title: 'Luce Shadow',
      entityId: 'light.living_room_lamp',
      dataSource: 'mock',
      status: 'Accesa',
      isOn: true,
      value: 60,
      unit: '%',
      layout: { i: 'shadow-light', x: 6, y: 0, w: 3, h: 2 },
    },
  ],
};

async function readRendererGeometry(page) {
  return page.locator('.sections-grid > .react-grid-item:not(.react-grid-placeholder)').evaluateAll((items) =>
    items.map((item) => ({
      className: item.className,
      style: item.getAttribute('style'),
    })),
  );
}

test(`Shadow Mode ${EXPECT_SHADOW ? 'enabled' : 'disabled'} is observational only`, async ({ page }) => {
  test.setTimeout(60000);
  const shadowReports = [];
  const browserErrors = [];
  page.on('console', async (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
    if (!message.text().includes(SHADOW_PREFIX)) return;
    const detail = message.args()[1];
    shadowReports.push(detail ? await detail.jsonValue().catch(() => ({ event: 'unreadable' })) : { event: 'missing' });
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(
    ({ storageKey, runtimeKey, layout }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(storageKey, JSON.stringify(layout));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { storageKey: STORAGE_KEY, runtimeKey: RUNTIME_KEY, layout: seededLayout },
  );

  await page.goto('/?view=home');
  await expect(page.locator('.sections-grid')).toHaveClass(/react-grid-layout/);
  await expect(page.locator('.sections-grid > .react-grid-item:not(.react-grid-placeholder)')).toHaveCount(2);
  const storageBefore = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const geometryBefore = await readRendererGeometry(page);

  if (EXPECT_SHADOW) {
    await expect.poll(() => shadowReports.filter((report) => report.event === 'report').length).toBeGreaterThan(0);
    const report = shadowReports.find((entry) => entry.event === 'report');
    expect(Object.keys(report.breakpoints).sort()).toEqual(['2xl', 'lg', 'md', 'sm', 'xl', 'xs']);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.durationMs).toBeLessThan(100);
    console.log(`[grid-engine-2 shadow report] ${JSON.stringify({
      durationMs: report.durationMs,
      summary: report.summary,
      breakpoints: Object.fromEntries(Object.entries(report.breakpoints).map(([breakpoint, current]) => [breakpoint, {
        items: current.items,
        valid: current.valid,
        collisions: current.collisions,
        outOfBounds: current.outOfBounds,
        solver: current.solver,
      }])),
    })}`);
  } else {
    await page.waitForTimeout(700);
    expect(shadowReports).toEqual([]);
  }

  expect(await readRendererGeometry(page)).toEqual(geometryBefore);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(storageBefore);

  if (EXPECT_SHADOW) {
    await page.waitForTimeout(500);
    const signatures = shadowReports
      .filter((report) => report.event === 'report')
      .map((report) => report.signature);
    expect(new Set(signatures).size).toBe(signatures.length);
  }
  expect(browserErrors).toEqual([]);
});
