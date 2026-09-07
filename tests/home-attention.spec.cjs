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
}

test('Demo exposes a clearly simulated Attention Center without altering the grid editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedDemo(page);
  await page.goto('/home');

  const attentionButton = page.getByRole('button', { name: /Apri Centro Attenzione/ });
  await expect(attentionButton).toBeVisible();
  await attentionButton.click();

  const dialog = page.getByRole('dialog', { name: 'Centro Attenzione' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Anteprima simulata');
  await expect(dialog).toContainText('Finestra studio aperta');
  await expect(dialog).toContainText('Nest Wifi non raggiungibile');
  await expect(dialog).toContainText('Batteria sensore umidità');

  await page.getByRole('button', {
    name: /Ignora finché cambia stato: Batteria sensore/,
  }).click();
  await expect(dialog).not.toContainText('Batteria sensore umidità');
  await expect(attentionButton).toHaveAttribute(
    'aria-label',
    'Apri Centro Attenzione: 2 attenzioni',
  );

  await page.keyboard.press('Escape');
  await expect(attentionButton).toBeFocused();

  await enterEditMode(page);
  await expect(attentionButton).toBeHidden();
  await expect(page.locator('.sections-grid')).toBeVisible();
});

test('mobile Attention Center stays inside the viewport and opens a matching card context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCompletedDemo(page);
  await page.goto('/home');

  await page.getByRole('button', { name: /Apri Centro Attenzione/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Centro Attenzione' });
  await expect(dialog).toBeVisible();

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(390);
  await expect.poll(async () => {
    const settledBox = await dialog.boundingBox();
    return (settledBox?.y ?? 0) + (settledBox?.height ?? 0);
  }).toBeLessThanOrEqual(844.5);

  await page.getByRole('button', { name: 'Controlla Batteria sensore umidità' }).click();
  await expect(dialog).toBeHidden();
  const contextPanel = page.locator('aside:visible').filter({ hasText: 'Humidity Sensor' });
  await expect(contextPanel).toBeVisible();
  await expect(contextPanel).toContainText('Andamento');
});
