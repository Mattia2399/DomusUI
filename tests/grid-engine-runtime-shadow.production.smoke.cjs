const { test, expect } = require('@playwright/test');

const PREFIX = '[DomusUI:grid-engine2:runtime-shadow]';
const GEOMETRY_PREFIX = '[DomusUI:grid-engine2:runtime-geometry]';

test('production removes Runtime Shadow even when its environment opt-in was true at build time', async ({ page }) => {
  const reports = [];
  page.on('console', (message) => {
    if (message.text().includes(PREFIX) || message.text().includes(GEOMETRY_PREFIX)) reports.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
  await page.goto('/?view=home');
  await expect(page.locator('.sections-grid')).toHaveCount(1);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(reports).toEqual([]);
  expect(resources.some((name) => name.includes('runtimeShadowMode'))).toBe(false);
  expect(resources.some((name) => name.includes('runtimeGeometryDomInspection'))).toBe(false);
});
