const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';
const EXPECT_SHADOW = process.env.VITE_GRID_ENGINE_2_SHADOW === 'true';
const EXPECT_RENDERER = process.env.VITE_GRID_ENGINE_2_RENDERER === 'true';

const seededLayout = {
  version: 14,
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
  sections: [{
    id: 'inspector-greeting',
    kind: 'greeting',
    title: 'Inspector fixture',
    layout: { i: 'inspector-greeting', x: 0, y: 0, w: 6, h: 2 },
  }],
  widgets: [{
    id: 'inspector-light',
    kind: 'light',
    title: 'Inspector light',
    entityId: 'light.inspector_fixture',
    dataSource: 'mock',
    status: 'On',
    isOn: true,
    value: 50,
    unit: '%',
    layout: { i: 'inspector-light', x: 6, y: 0, w: 3, h: 2 },
  }],
};

async function canvasGeometry(page) {
  return page.locator('.sections-grid > .react-grid-item:not(.react-grid-placeholder)').evaluateAll((items) =>
    items.map((item) => ({ className: item.className, style: item.getAttribute('style') })),
  );
}

async function inspectorGeometry(inspector, side) {
  return inspector.locator(`[data-inspector-card="${side}"]`).evaluateAll((cards) => cards.map((card) => ({
    id: card.getAttribute('data-item-id'),
    x: Number(card.getAttribute('data-x')),
    y: Number(card.getAttribute('data-y')),
    w: Number(card.getAttribute('data-w')),
    h: Number(card.getAttribute('data-h')),
  })).sort((first, second) => first.id.localeCompare(second.id)));
}

function overlap(first, second) {
  return first.x < second.x + second.w && first.x + first.w > second.x &&
    first.y < second.y + second.h && first.y + first.h > second.y;
}

test(`Shadow Inspector ${EXPECT_SHADOW ? 'enabled' : 'disabled'} lifecycle`, async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.addInitScript(({ storageKey, runtimeKey, layout }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(runtimeKey, 'demo');
    localStorage.setItem(storageKey, JSON.stringify(layout));
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('inspector-test-secret', 'do-not-transfer-this-value');
  }, { storageKey: STORAGE_KEY, runtimeKey: RUNTIME_KEY, layout: seededLayout });

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/grid-test');
  const inspector = page.getByTestId('shadow-inspector');

  if (!EXPECT_SHADOW) {
    await expect(inspector.getByTestId('inspector-disabled')).toBeVisible();
    await expect(inspector).toHaveAttribute('data-source-kind', 'none');
    return;
  }

  await expect(inspector.getByTestId('inspector-source')).toContainText('Collisione controllata');
  await expect(inspector.locator('[data-inspector-card="legacy"]')).toHaveCount(4);
  await expect(inspector.locator('[data-inspector-card="solver"]')).toHaveCount(4);
  expect(await inspector.locator('[data-inspector-card="legacy"][data-categories*="OVERLAP"]').count()).toBeGreaterThan(0);
  const normalizedCollision = await inspectorGeometry(inspector, 'solver');
  expect(normalizedCollision.every((item, index) => normalizedCollision.slice(index + 1).every((other) => !overlap(item, other)))).toBe(true);

  await inspector.getByRole('button', { name: 'Geometrie identiche' }).click();
  await expect(inspector.getByTestId('inspector-no-differences')).toBeVisible();
  expect(await inspectorGeometry(inspector, 'legacy')).toEqual(await inspectorGeometry(inspector, 'solver'));

  const breakpoints = [['2xl', 12], ['xl', 12], ['lg', 8], ['md', 6], ['sm', 4], ['xs', 2]];
  for (const [breakpoint, cols] of breakpoints) {
    await inspector.getByRole('button', { name: `Inspector breakpoint ${breakpoint}` }).click();
    await expect(inspector.getByTestId('inspector-breakpoint')).toContainText(breakpoint);
    await expect(inspector.getByTestId('inspector-cols')).toContainText(String(cols));
  }

  await inspector.getByRole('button', { name: 'Stack sintetici' }).click();
  await expect(inspector.getByTestId('inspector-stack-list')).toContainText('stack-vertical');
  await expect(inspector.getByTestId('inspector-stack-list')).toContainText('INSUFFICIENT_DATA');
  await inspector.getByRole('button', { name: 'Densità 30 elementi' }).click();
  await expect(inspector.locator('[data-inspector-card="legacy"]')).toHaveCount(30);
  await expect(inspector.locator('[data-inspector-card="solver"]')).toHaveCount(30);
  await expect(inspector.getByTestId('inspector-render-ms')).not.toHaveText('n/d');
  console.log(`[shadow-inspector performance] ${JSON.stringify({
    fixture: 'density-30',
    analysis: await inspector.getByTestId('inspector-analysis-ms').textContent(),
    conversion: await inspector.getByTestId('inspector-conversion-ms').textContent(),
    comparison: await inspector.getByTestId('inspector-comparison-ms').textContent(),
    renderSample: await inspector.getByTestId('inspector-render-ms').textContent(),
  })}`);

  await inspector.getByRole('button', { name: 'Real Shadow' }).click();
  await expect(inspector.getByTestId('inspector-real-empty')).toBeVisible();

  const home = await context.newPage();
  await home.setViewportSize({ width: 1920, height: 1080 });
  await home.goto('/?view=home');
  await expect(home.locator('.sections-grid > .react-grid-item:not(.react-grid-placeholder)')).toHaveCount(2);
  if (EXPECT_RENDERER) {
    await expect(home.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(1);
  }
  const homeGeometryBefore = await canvasGeometry(home);
  const storageBefore = await home.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  await expect(inspector).toHaveAttribute('data-source-kind', 'real-shadow');
  await expect(inspector).toHaveAttribute('data-snapshot-lifecycle', 'initial');
  await expect(inspector.getByTestId('inspector-source')).toHaveText('Real Shadow');
  const initialSnapshotId = await inspector.getAttribute('data-snapshot-id');
  expect(await page.locator('body').textContent()).not.toContain('do-not-transfer-this-value');

  await inspector.getByRole('button', { name: /Richiedi snapshot reale/ }).click();
  await page.waitForTimeout(250);
  expect(await inspector.getAttribute('data-snapshot-id')).toBe(initialSnapshotId);
  expect(await canvasGeometry(home)).toEqual(homeGeometryBefore);
  expect(await home.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(storageBefore);

  const firstObservedBreakpoint = await inspector.getAttribute('data-observed-breakpoint');
  await home.setViewportSize({ width: 800, height: 900 });
  await expect.poll(() => inspector.getAttribute('data-snapshot-lifecycle')).toBe('updated');
  await expect.poll(() => inspector.getAttribute('data-observed-breakpoint')).not.toBe(firstObservedBreakpoint);
  expect(await inspector.getAttribute('data-snapshot-id')).not.toBe(initialSnapshotId);

  expect(await home.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(storageBefore);
});
