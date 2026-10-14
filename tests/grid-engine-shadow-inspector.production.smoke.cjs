const { test, expect } = require('@playwright/test');

test('production excludes the Shadow Inspector route and never activates its transport', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeBroadcastChannel = window.BroadcastChannel;
    window.__shadowInspectorChannelCount = 0;
    if (NativeBroadcastChannel) {
      window.BroadcastChannel = class ObservedBroadcastChannel extends NativeBroadcastChannel {
        constructor(name) {
          if (name === 'domusui:grid-engine2:shadow-inspector:v1') {
            window.__shadowInspectorChannelCount += 1;
          }
          super(name);
        }
      };
    }
  });

  await page.goto('/grid-test');
  await expect(page.getByTestId('shadow-inspector')).toHaveCount(0);
  expect(await page.evaluate(() => window.__shadowInspectorChannelCount)).toBe(0);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(resources.some((name) => name.includes('shadowInspectorTransport'))).toBe(false);
});
