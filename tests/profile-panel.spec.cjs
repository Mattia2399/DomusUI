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

test('Profile is the personal page at the top of Settings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedRealWorkspace(page);
  await page.goto('/settings');

  // The account card opens the Profile, inside the Settings page.
  await page.getByRole('region', { name: 'Profilo', exact: true }).getByRole('button').first().click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.locator('.dashboard-shell > aside')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /Informazioni personali Nome, email e ruolo/,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Attività e spostamenti/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Accesso e sicurezza/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Preferenze' })).toBeVisible();
  // Theme, background and language are saved in this browser: Settings, This device.
  await expect(page.getByRole('radiogroup', { name: 'Tema del dispositivo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Temi colorati/ })).toHaveCount(0);
  await expect(page.getByText('Persone/Membri')).toHaveCount(0);

  await page.getByRole('button', { name: /Attività e spostamenti/ }).click();
  await expect(page.getByRole('heading', { name: 'Attività e spostamenti' })).toBeVisible();
  await expect(page.getByText('Cronologia recente')).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('Profile uses drill-in navigation on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCompletedRealWorkspace(page);
  // The old address opens Settings, whose top is the person.
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('region', { name: 'Profilo', exact: true }).getByRole('button').first().click();

  const securityButton = page.getByRole('button', { name: /Accesso e sicurezza/ });
  await expect(securityButton).toBeVisible();
  await securityButton.click();

  await expect(page.getByRole('heading', { name: 'Accesso e sicurezza' })).toBeVisible();
  await expect(page.getByText('Conferma dispositivo', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByRole('button', { name: /Accesso e sicurezza/ })).toBeVisible();

  // Back from the Profile is the Settings page, with this device further down.
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('region', { name: 'Questo dispositivo' }).getByRole('button', { name: /^Aspetto/ }).click();
  await expect(page.getByRole('heading', { name: 'Aspetto', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sunset Amber/ })).toBeVisible();
});

test('Settings remains useful while administrative destinations stay fail-closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedRealWorkspace(page);
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Impostazioni', exact: true })).toBeVisible();
  // Preferences of this device need no administrator; house administration stays closed.
  await expect(page.getByRole('button', { name: /^Aspetto/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lingua/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Persone e accessi/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Energia/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Connessioni/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dati e backup/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Sistema/ })).toBeVisible();

  await page.getByRole('button', { name: /Connessioni/ }).click();
  await expect(page).toHaveURL(/\/settings\/connections$/);
  await expect(page.getByRole('heading', { name: 'Connessioni' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
