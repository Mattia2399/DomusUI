const { test, expect } = require('@playwright/test');

async function enterFreshDemo(page) {
  await page.goto('/home');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Inizia ora' }).click();
  await page.getByRole('button', { name: /Esplora la Demo/ }).click();
  await expect(page.getByRole('dialog', { name: 'La tua nuova Home è pronta' })).toBeVisible();
}

async function expectCoachmarkNotToCoverTarget(coachmark, target) {
  const [coachmarkBox, targetBox] = await Promise.all([coachmark.boundingBox(), target.boundingBox()]);
  expect(coachmarkBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const overlaps = !(
    coachmarkBox.x + coachmarkBox.width <= targetBox.x ||
    targetBox.x + targetBox.width <= coachmarkBox.x ||
    coachmarkBox.y + coachmarkBox.height <= targetBox.y ||
    targetBox.y + targetBox.height <= coachmarkBox.y
  );
  expect(overlaps).toBe(false);
}

async function completeInteractiveGuide(page) {
  await page.getByRole('dialog', { name: 'La tua nuova Home è pronta' }).getByRole('button', { name: 'Continua' }).click();

  const editCoach = page.getByRole('dialog', { name: 'La tua nuova Home è pronta: Personalizza il layout' });
  await expect(editCoach).toBeVisible();
  await expect.poll(() => editCoach.locator('xpath=..').evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgba(0, 0, 0, 0)');
  const editTarget = page.locator('[data-tour-target="edit-mode"]:visible');
  await expect(editTarget).toBeVisible();
  await expectCoachmarkNotToCoverTarget(editCoach, editTarget);
  await editCoach.getByRole('button', { name: 'Attiva Edit Mode' }).click();

  const confirmation = page.getByRole('dialog', { name: 'Attivare la modalità modifica?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Attiva' }).click();

  const catalogCoach = page.locator('[data-guided-step="widget-catalog"]').getByRole('dialog');
  await expect(catalogCoach).toBeVisible();
  const catalogTarget = page.locator('[data-tour-target="widget-catalog"]:visible');
  await expect(catalogTarget).toBeVisible();
  await expectCoachmarkNotToCoverTarget(catalogCoach, catalogTarget);
  await catalogCoach.getByRole('button', { name: 'Apri il Catalogo' }).click();

  await expect(page.getByRole('dialog', { name: 'Aggiungi componenti' })).toBeVisible();
  const lightCoach = page.locator('[data-guided-step="catalog-light"]').getByRole('dialog');
  const lightTarget = page.locator('[data-tour-target="catalog-light"]:visible');
  await expect(lightCoach).toBeVisible();
  await expect(lightTarget).toBeVisible();
  await expectCoachmarkNotToCoverTarget(lightCoach, lightTarget);
  await lightCoach.getByRole('button', { name: 'Seleziona Luce' }).click();

  const addCoach = page.locator('[data-guided-step="catalog-add-light"]').getByRole('dialog');
  const addTarget = page.locator('[data-tour-target="catalog-confirm"]:visible');
  await expect(addCoach).toBeVisible();
  await expect(addTarget).toBeEnabled();
  await expectCoachmarkNotToCoverTarget(addCoach, addTarget);
  await addCoach.getByRole('button', { name: 'Aggiungi al canvas' }).click();

  const finishCoach = page.locator('[data-guided-step="catalog-finish"]').getByRole('dialog');
  const finishTarget = page.locator('[data-tour-target="catalog-finish"]:visible');
  await expect(finishCoach).toBeVisible();
  await expect(finishTarget).toBeVisible();
  await expectCoachmarkNotToCoverTarget(finishCoach, finishTarget);
  await finishCoach.getByRole('button', { name: 'Apri il Builder' }).click();

  const entityCoach = page.locator('[data-guided-step="builder-entity"]').getByRole('dialog');
  const entityTarget = page.locator('[data-tour-target="builder-entity"]:visible');
  await expect(entityCoach).toBeVisible();
  await expect(entityTarget).toBeVisible();
  await expectCoachmarkNotToCoverTarget(entityCoach, entityTarget);
  await entityCoach.getByRole('button', { name: 'Fine guida' }).click();

  const starterChoice = page.getByRole('dialog', { name: 'Scegli il tuo punto di partenza' });
  await expect(starterChoice).toBeVisible();
  await starterChoice.getByRole('button', { name: 'Mantieni dashboard' }).click();
  await expect(starterChoice).toBeHidden();

  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.onboarding.welcome.v1'))).toBe('done');
}

test('guided setup follows the real desktop Edit and Catalog controls', async ({ page }) => {
  // Mirrors a 1920x1080 browser with the visible browser chrome removed.
  await page.setViewportSize({ width: 1920, height: 1032 });
  await page.emulateMedia({ colorScheme: 'light' });
  await enterFreshDemo(page);
  const lightShell = page.locator('.dashboard-shell.dashboard-theme-light.dashboard-background-neutral').first();
  await expect(lightShell).toBeVisible();
  await expect.poll(() => lightShell.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(242, 242, 247)');
  await expect(page.locator('.onboarding-neutral-scope')).toBeVisible();
  await completeInteractiveGuide(page);
});

test('guided setup opens the mobile drawer and follows the mobile controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await enterFreshDemo(page);
  const darkShell = page.locator('.dashboard-shell.dashboard-theme-dark.dashboard-background-neutral').first();
  await expect(darkShell).toBeVisible();
  await expect.poll(() => darkShell.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(0, 0, 0)');
  await completeInteractiveGuide(page);
});
