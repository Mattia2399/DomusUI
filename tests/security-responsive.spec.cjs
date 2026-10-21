const { test, expect } = require('@playwright/test');
const { connectHomeAssistant } = require('./support/fakeHomeAssistant.cjs');

function installCompletedRealWorkspace(page) {
  return page.addInitScript(() => {
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
  });
}

for (const viewport of [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]) {
  test(`/security stays inside ${viewport.width}px and keeps controls touch friendly`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installCompletedRealWorkspace(page);
    await connectHomeAssistant(page);
    await page.goto('/security');

    await expect(page.getByRole('heading', { name: 'Sicurezza', exact: true })).toBeVisible();
    const hub = page.locator('section').filter({ hasText: 'Hub Sicurezza' }).first();
    await expect(hub).toBeVisible();

    const measurements = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      minButtonHeight: Math.min(
        ...Array.from(document.querySelectorAll('.dashboard-shell button'))
          .filter((button) => button.getClientRects().length > 0)
          .map((button) => button.getBoundingClientRect().height)
          .filter((height) => height > 0),
      ),
    }));

    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
    expect(measurements.minButtonHeight).toBeGreaterThanOrEqual(31);

    const hubBox = await hub.boundingBox();
    expect(hubBox).not.toBeNull();
    expect(hubBox.x).toBeGreaterThanOrEqual(-1);
    expect(hubBox.x + hubBox.width).toBeLessThanOrEqual(viewport.width + 1);
  });
}
