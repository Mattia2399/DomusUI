const { test, expect } = require('@playwright/test');

function installCompletedDemo(page) {
  return page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2,
      phase: 'done',
      mode: 'demo',
      updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
}

async function enterEditMode(page) {
  const directEditButton = page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first();
  await directEditButton.waitFor({ state: 'visible' });
  await directEditButton.click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await page.waitForSelector('.sections-grid.is-editing');
}

test('the scenes section can be removed from the builder', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedDemo(page);
  await page.goto('/home');
  await enterEditMode(page);

  const scenesSection = page.getByRole('group', { name: 'Sezione Scenari' });
  await expect(scenesSection).toBeVisible();
  await scenesSection.click({ position: { x: 20, y: 20 } });
  await page.getByRole('button', { name: 'Rimuovi Scenari' }).click();

  await expect(scenesSection).toHaveCount(0);
});
