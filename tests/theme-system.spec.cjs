const { test, expect } = require('@playwright/test');

function installCompletedDemo(page, preferences = {}) {
  return page.addInitScript((stored) => {
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
    if (stored.theme) localStorage.setItem('ha.dashboard.theme', stored.theme);
    if (stored.background) localStorage.setItem('ha.dashboard.wallpaper', stored.background);
  }, preferences);
}

async function enterEditMode(page) {
  const directEditButton = page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first();
  await directEditButton.waitFor({ state: 'visible' });
  await directEditButton.click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
}

test('Auto keeps a neutral background and follows the device appearance', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await installCompletedDemo(page, { theme: 'auto' });
  await page.goto('/home');

  const shell = page.locator('.dashboard-shell.dashboard-background-neutral').first();
  await expect(shell).toBeVisible();
  await expect(shell).toHaveClass(/dashboard-theme-light/);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.dashboardAppearance)).toBe('light');
  await expect.poll(() => shell.evaluate((element) => getComputedStyle(element).getPropertyValue('--ui-bg-canvas').trim())).toBe('#f2f2f7');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(shell).toHaveClass(/dashboard-theme-dark/);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.dashboardAppearance)).toBe('dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.background'))).toBe('neutral');
});

test('legacy Total White migrates to Light plus Neutral without a legacy render class', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await installCompletedDemo(page, { theme: 'auto', background: 'total-white' });
  await page.goto('/home');

  const shell = page.locator('.dashboard-shell').first();
  await expect(shell).toHaveClass(/dashboard-theme-light/);
  await expect(shell).toHaveClass(/dashboard-background-neutral/);
  await expect(shell).not.toHaveClass(/dashboard-background-total-white/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.theme'))).toBe('light');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.background'))).toBe('neutral');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.wallpaper'))).toBeNull();
});

test('mobile navigation keeps a live adaptive backdrop in Light and Dark', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await installCompletedDemo(page, { theme: 'auto' });
  await page.goto('/home');

  const navigation = page.locator('nav.liquid-glass-navigation').first();
  await expect(navigation).toBeVisible();
  await expect.poll(() => navigation.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.backdropFilter || style.webkitBackdropFilter;
  })).toContain('blur');
  await expect.poll(() => navigation.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--ui-glass-navigation-opacity').trim(),
  )).toBe('0.36');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => navigation.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--ui-glass-navigation-opacity').trim(),
  )).toBe('0.3');
});

test('Rooms content surfaces follow the resolved appearance through semantic tokens', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await installCompletedDemo(page, { theme: 'auto' });
  await page.goto('/rooms');

  const surface = page.locator('.rooms-surface').first();
  await expect(surface).toBeVisible();
  const lightBorder = await surface.evaluate((element) => getComputedStyle(element).borderColor);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.dashboardAppearance)).toBe('dark');
  await expect.poll(() => surface.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(lightBorder);
});

test('Builder uses the shared glass shell and semantic controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: 'light' });
  await installCompletedDemo(page, { theme: 'auto' });
  await page.goto('/home');

  await enterEditMode(page);

  await expect(page.locator('.react-resizable-handle')).toHaveCount(0);

  const builder = page.locator('aside.builder-sidebar');
  await expect(builder).toBeVisible();
  await expect(builder).toHaveClass(/liquid-glass-panel/);

  const configurableCard = page
    .locator('.sections-grid > .react-grid-item')
    .filter({ has: page.locator('.light-card') })
    .first();
  await configurableCard.click({ position: { x: 32, y: 24 } });
  const semanticControl = builder.locator('.dashboard-content-surface, .dashboard-content-surface-soft, .ui-input').first();
  await expect(semanticControl).toBeVisible();
  const lightBorder = await semanticControl.evaluate((element) => getComputedStyle(element).borderColor);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => semanticControl.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(lightBorder);
});

test('device context panels resolve semantic surfaces in Light and Dark', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: 'light' });
  await installCompletedDemo(page, { theme: 'auto' });
  await page.goto('/home');

  await page.locator('.sensor-card__handle').first().click();

  const sidebar = page.locator('aside.context-sidebar');
  await expect(sidebar).toBeVisible();
  const surface = sidebar.locator('.context-content-surface-soft').first();
  await expect(surface).toBeVisible();
  const lightBackground = await surface.evaluate((element) => getComputedStyle(element).backgroundColor);
  const lightText = await sidebar.locator('h2').first().evaluate((element) => getComputedStyle(element).color);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => surface.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightBackground);
  await expect.poll(() => sidebar.locator('h2').first().evaluate((element) => getComputedStyle(element).color)).not.toBe(lightText);
});

test('dashboard cards resolve their own semantic text without global Light overrides', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: 'light' });
  await installCompletedDemo(page, { theme: 'auto' });
  await page.goto('/home');

  const title = page.locator('.sensor-card__title').first();
  await expect(title).toBeVisible();
  const lightText = await title.evaluate((element) => getComputedStyle(element).color);
  await expect.poll(() => page.evaluate(() => {
    const styles = Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules, (rule) => rule.cssText);
      } catch {
        return [];
      }
    });
    return styles.some((rule) => rule.includes('.dashboard-theme-light [class*='));
  })).toBe(false);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => title.evaluate((element) => getComputedStyle(element).color)).not.toBe(lightText);
});
