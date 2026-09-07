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

test('document, skip link and visible controls expose an accessible baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedDemo(page);
  await page.goto('/home');

  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('it');

  const skipLink = page.getByRole('link', { name: 'Vai al contenuto principale' });
  await expect(skipLink).toBeAttached();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#dashboard-main-content')).toBeFocused();

  const unnamedControls = await page.locator(
    'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="radio"]',
  ).evaluateAll((nodes) =>
    nodes.flatMap((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || box.width === 0
        || box.height === 0
      ) {
        return [];
      }
      const labelledBy = element.getAttribute('aria-labelledby');
      const hasLabelledBy = labelledBy
        ? labelledBy.split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim())
        : false;
      const hasNativeLabel = 'labels' in element
        && Array.from(element.labels ?? []).some((label) => label.textContent?.trim());
      const hasImageAlt = Boolean(element.querySelector('img[alt]:not([alt=""])'));
      const hasName = Boolean(
        element.getAttribute('aria-label')?.trim()
        || hasLabelledBy
        || hasNativeLabel
        || element.textContent?.trim()
        || element.getAttribute('title')?.trim()
        || element.getAttribute('placeholder')?.trim()
        || hasImageAlt
      );
      return hasName
        ? []
        : [`${element.tagName.toLowerCase()}#${element.id}.${element.className}`];
    }),
  );

  expect(unnamedControls).toEqual([]);
});

test('mobile primary controls keep Apple-sized touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCompletedDemo(page);
  await page.goto('/home');

  const controls = [
    page.getByRole('button', { name: 'Apri menu laterale' }),
    page.getByRole('button', { name: 'Apri notifiche' }),
    page.getByRole('button', { name: /Apri profilo/ }),
  ];

  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await controls[0].click();
  const menuDialog = page.getByRole('dialog', { name: 'Menu principale' });
  await expect(menuDialog).toBeVisible();
  await expect(menuDialog.getByRole('button', { name: 'Apri profilo', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(controls[0]).toBeFocused();

  await controls[1].click();
  await expect(page.getByRole('dialog', { name: 'Notifiche' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chiudi notifiche' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(controls[1]).toBeFocused();
});

test('builder supports keyboard move and resize with screen reader feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedDemo(page);
  await page.goto('/home');
  await enterEditMode(page);

  const editableCard = page.getByRole('group', { name: /^Card / }).first();
  await expect(editableCard).toBeVisible();

  await editableCard.focus();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.locator('[role="status"]').filter({ hasText: /posizione colonna \d+, riga \d+/ }),
  ).toBeAttached();

  await editableCard.focus();
  await page.keyboard.press('Shift+ArrowDown');
  await expect(
    page.locator('[role="status"]').filter({ hasText: /dimensione \d+ colonne per \d+ righe/ }),
  ).toBeAttached();
});

test('reduced motion disables long-running decorative animation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installCompletedDemo(page);
  await page.goto('/home');

  await expect.poll(() => page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )).toBe(true);

  const longRunningAnimations = await page.evaluate(() =>
    document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return timing && (timing.iterations === Infinity || timing.duration > 1);
    }).length,
  );
  expect(longRunningAnimations).toBe(0);
});
