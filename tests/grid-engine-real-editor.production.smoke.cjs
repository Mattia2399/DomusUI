const { test, expect } = require('@playwright/test');

test('production keeps the legacy editor until the user explicitly activates Home 2.0', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('__gridEngine2ProductionCutover') === 'installed') return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('__gridEngine2ProductionCutover', 'installed');
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

  await expect(page.locator('[data-grid-engine-editor]')).toHaveCount(0);
  await expect(page.getByTestId('grid-engine-2-editor-status')).toHaveCount(0);
  await expect(page.locator('.sections-grid.grid-engine-2-root-renderer')).toHaveCount(0);
});

test('production explicitly activates, saves, and reloads a Grid Engine 2.0 Home', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('__gridEngine2ProductionCutover') === 'installed') return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('__gridEngine2ProductionCutover', 'installed');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
  await page.goto('/home');
  await page.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await page.getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  await page.getByRole('dialog', { name: 'Attiva nuova Home 2.0' })
    .getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();

  await expect(page.locator('[data-grid-engine-editor="active"]')).toBeVisible();
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toBeVisible();
  await page.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  await page.getByRole('dialog').filter({ hasText: 'Uscire' })
    .getByRole('button', { name: 'Salva ed esci', exact: true }).click();
  await expect(page.locator('.sections-grid')).not.toHaveClass(/is-editing/);

  await page.reload();
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toBeVisible();
  expect(await page.evaluate(() => {
    const value = localStorage.getItem('ha.dashboard.demo.builder.layout.v1');
    return value ? JSON.parse(value).layoutEngine : null;
  })).toBe('grid-engine-2');
});
