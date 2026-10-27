const { test, expect } = require('@playwright/test');

test('production editor does not expose the Grid Engine 2.0 preview command', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
  await page.goto('/home');
  await page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first().click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await page.waitForSelector('.sections-grid.is-editing');

  await expect(page.getByRole('button', { name: 'Prova Grid Engine 2.0' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Editor sperimentale Grid Engine 2.0' })).toHaveCount(0);
});
