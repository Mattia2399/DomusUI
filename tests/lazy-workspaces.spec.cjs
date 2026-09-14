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

test('secondary workspaces load on demand without replacing the dashboard shell', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedRealWorkspace(page);

  await page.goto('/rooms');
  await expect(page.locator('.dashboard-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nessuna stanza configurata' })).toBeVisible();
  await expect(page.getByText('Carichiamo soltanto gli strumenti necessari.')).toHaveCount(0);

  const workspaces = [
    { path: '/security', heading: 'Sicurezza' },
    { path: '/consumi', heading: 'Hub Sostenibilità e Consumi' },
    { path: '/automations', heading: 'Costruttore Automazioni' },
    { path: '/appgallery', heading: 'App Library' },
    { path: '/settings', heading: 'Impostazioni Casa' },
    { path: '/support', heading: 'Supporto e feedback' },
  ];

  for (const workspace of workspaces) {
    await page.goto(workspace.path);
    await expect(page.locator('.dashboard-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: workspace.heading, exact: true })).toBeVisible();
    await expect(page.getByText('Carichiamo soltanto gli strumenti necessari.')).toHaveCount(0);
  }

  await page.goto('/profile');
  await expect(page.locator('.dashboard-shell')).toBeVisible();
  await expect(page.getByText('Preferenze personali')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Indietro' })).toBeVisible();
  await expect(page.getByText('Carichiamo soltanto gli strumenti necessari.')).toHaveCount(0);
});
