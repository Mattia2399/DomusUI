const { test, expect } = require('@playwright/test');

function installCompletedRealWorkspace(page) {
  return page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'ha.dashboard.setupJourney.v2',
      JSON.stringify({
        version: 2,
        phase: 'done',
        mode: 'real',
        updatedAt: Date.now(),
      }),
    );
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
}

test('Profile is a personal desktop page without administrative settings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedRealWorkspace(page);
  await page.goto('/profile');

  await expect(page.getByText('Preferenze personali')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /Informazioni personali Account Home Assistant/,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Attività e spostamenti/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Accesso e sicurezza/ })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Tema del dispositivo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Temi colorati/ })).toBeVisible();
  await expect(page.getByText('Persone/Membri')).toHaveCount(0);

  await page.getByRole('button', { name: /Attività e spostamenti/ }).click();
  await expect(page.getByRole('heading', { name: 'Attività e spostamenti' })).toBeVisible();
  await expect(page.getByText('Cronologia recente')).toBeVisible();
});

test('Profile uses fullscreen drill-in navigation on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCompletedRealWorkspace(page);
  await page.goto('/profile');

  await expect(page.getByText('Preferenze personali')).toBeVisible();
  const securityButton = page.getByRole('button', { name: /Accesso e sicurezza/ });
  await expect(securityButton).toBeVisible();
  await securityButton.click();

  await expect(page.getByRole('heading', { name: 'Accesso e sicurezza' })).toBeVisible();
  await expect(page.getByText('Conferma dispositivo', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByText('Preferenze personali')).toBeVisible();
  await expect(page.getByRole('button', { name: /Accesso e sicurezza/ })).toBeVisible();

  await page.getByRole('button', { name: /Temi colorati/ }).click();
  await expect(page.getByRole('heading', { name: 'Temi colorati' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sunset Amber/ })).toBeVisible();
});

test('Settings remains useful while administrative destinations stay fail-closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedRealWorkspace(page);
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Impostazioni Casa' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Aspetto/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Persone e accessi/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Connessioni/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dati e backup/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Sistema/ })).toBeVisible();

  await page.getByRole('button', { name: /Connessioni/ }).click();
  await expect(page).toHaveURL(/\/settings\/connections$/);
  await expect(page.getByRole('heading', { name: 'Connessioni' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
