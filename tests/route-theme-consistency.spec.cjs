const { test, expect } = require('@playwright/test');

const primaryRoutes = [
  '/rooms',
  '/security',
  '/consumi',
  '/automations',
  '/appgallery',
  '/settings',
  '/profile',
  '/support',
];

const nestedRoutes = [
  '/security/cameras',
  '/consumi/energia',
  '/consumi/acqua',
  '/consumi/gas',
  '/consumi/report',
  '/appgallery/technical',
  '/appgallery/irrigation',
  '/appgallery/pool',
  '/settings/devices',
  '/settings/entities',
  '/settings/dashboard',
  '/settings/attention',
  '/settings/connections',
  '/settings/data',
  '/settings/system',
  '/settings/advanced',
];

function installCompletedRealWorkspace(page, appearance) {
  return page.addInitScript((theme) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2,
      phase: 'done',
      mode: 'real',
      updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.theme', theme);
    localStorage.setItem('ha.dashboard.background', 'neutral');
  }, appearance);
}

async function expectSemanticPageChrome(page, appearance) {
  const shell = page.locator('.dashboard-shell').first();
  await expect(shell).toHaveClass(new RegExp(`dashboard-theme-${appearance}`));

  for (const [selector, token] of [
    ['.dashboard-page-title:visible', '--ui-text-primary'],
    ['.dashboard-page-subtitle:visible', '--ui-text-secondary'],
    ['.dashboard-page-eyebrow:visible', '--ui-text-tertiary'],
  ]) {
    const element = page.locator(selector).first();
    if (await element.count()) {
      const [actual, expected] = await Promise.all([
        element.evaluate((node) => getComputedStyle(node).color),
        shell.evaluate((node, property) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${property})`;
          node.appendChild(probe);
          const resolved = getComputedStyle(probe).color;
          probe.remove();
          return resolved;
        }, token),
      ]);
      expect(actual).toBe(expected);
    }
  }

  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(overflow.content).toBeLessThanOrEqual(overflow.viewport + 1);
}

for (const appearance of ['light', 'dark']) {
  for (const [label, routes] of [
    ['primary', primaryRoutes],
    ['nested', nestedRoutes],
  ]) {
    test(`${appearance} ${label} routes keep semantic chrome and mobile bounds`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await installCompletedRealWorkspace(page, appearance);

      for (const route of routes) {
        await page.goto(route);
        await expectSemanticPageChrome(page, appearance);
      }
    });
  }
}
