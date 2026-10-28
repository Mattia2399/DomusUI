const { test, expect } = require('@playwright/test');

test('production keeps the legacy root renderer before explicit Home 2.0 activation', async ({ page }) => {
  const runtimeSolverReports = [];
  page.on('console', (message) => {
    if (message.text().includes('[DomusUI:grid-engine2:runtime-render]')) {
      runtimeSolverReports.push(message.text());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
  await page.goto('/?view=home');
  await expect(page.locator('.sections-grid:not([data-grid-engine-root-renderer])')).toHaveCount(1);
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(0);
  await expect(page.locator('[data-grid-engine-runtime-render-decision]')).toHaveCount(0);
  expect(runtimeSolverReports).toEqual([]);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(resources.some((name) => name.includes('GridEngineRootRenderer-'))).toBe(false);
});
