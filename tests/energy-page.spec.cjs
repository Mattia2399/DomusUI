const { test, expect } = require('@playwright/test');

function installCompletedWorkspace(page, mode) {
  return page.addInitScript((runtimeMode) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'ha.dashboard.setupJourney.v2',
      JSON.stringify({ version: 2, phase: 'done', mode: runtimeMode, updatedAt: Date.now() }),
    );
    localStorage.setItem('ha.dashboard.runtimeMode.v1', runtimeMode);
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  }, mode);
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('Energy page never invents values without Home Assistant', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCompletedWorkspace(page, 'real');

  await page.goto('/consumi/energia');

  await expect(page.getByRole('heading', { name: 'Dettaglio Energia' })).toBeVisible();
  await expect(page.getByText('Home Assistant non collegato')).toBeVisible();
  await expect(page.getByRole('img', { name: /Flussi energetici/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /rilevamento/ })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('Energy page returns to Consumi and Demo keeps the workspace gate', async ({ page }) => {
  await installCompletedWorkspace(page, 'real');
  await page.goto('/consumi/energia');
  await page.getByRole('button', { name: 'Torna a Consumi' }).click();
  await expect(page).toHaveURL(/\/consumi$/);
  await expect(page.getByRole('heading', { name: 'Hub Sostenibilità e Consumi', exact: true })).toBeVisible();

  await installCompletedWorkspace(page, 'demo');
  await page.goto('/consumi/energia');
  await expect(page.getByRole('heading', { name: 'Questa sezione richiede una casa collegata' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Flussi energetici/ })).toHaveCount(0);
});
