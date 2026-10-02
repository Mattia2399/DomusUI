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

async function expectCenteredMessage(page, title) {
  const card = page.getByText(title).locator('xpath=ancestor::div[contains(@class, "liquid-glass-card")][1]');
  const box = await card.boundingBox();
  const content = await page.locator('#dashboard-main-content').boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x + box.width / 2 - (content.x + content.width / 2))).toBeLessThanOrEqual(24);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 960 }]) {
  test(`Energy messages are centred at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installCompletedWorkspace(page, 'real');
    await page.goto('/consumi/energia');
    await expectCenteredMessage(page, 'Home Assistant non collegato');
  });

  test(`Energy remains the primary responsive overview at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installCompletedWorkspace(page, 'real');
    await page.goto('/consumi');

    const energy = page.getByRole('button', { name: /^Energia/ });
    const water = page.getByRole('button', { name: /^Acqua/ });
    await expect(energy).toBeVisible();
    await expect(water).toBeVisible();
    await expect(page.getByRole('region', { name: 'Panoramica consumi' })).toBeVisible();

    const energyBox = await energy.boundingBox();
    const waterBox = await water.boundingBox();
    expect(energyBox).not.toBeNull();
    expect(waterBox).not.toBeNull();
    if (viewport.width >= 1280) {
      expect(waterBox.x).toBeGreaterThan(energyBox.x + energyBox.width);
    } else {
      expect(waterBox.y).toBeGreaterThan(energyBox.y + energyBox.height - 1);
    }
    await expectNoHorizontalOverflow(page);
  });
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
