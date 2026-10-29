const { test, expect } = require('@playwright/test');

const viewports = [
  { name: 'mobile', width: 390, height: 844, phone: true },
  { name: 'tablet', width: 820, height: 1180, phone: false },
  { name: 'desktop', width: 1440, height: 900, phone: false },
];

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const viewport of viewports) {
  test(`setup assistant adapts to ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('http://homeassistant.local:8123/**', (route) => route.abort('namenotresolved'));
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('ha.dashboard.theme', 'dark');
      localStorage.setItem('ha.dashboard.wallpaper', 'sunset-amber');
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Tutta la casa\.\s*Un solo gesto\./ })).toBeVisible();
    await expect(page.locator('main.sw-root[data-appearance-source="device"]')).toBeVisible();
    await expect.poll(() => noSideScroll(page)).toBe(true);

    await page.getByRole('button', { name: 'Inizia', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Indietro' })).toBeVisible();
    await page.getByRole('button', { name: /Collega la tua casa/ }).click();
    await expect(page.getByRole('heading', { name: 'Dov’è la tua casa?' })).toBeVisible();
    await expect(page.locator('.sw-count')).toHaveText('1 di 3');
    await expect.poll(() => noSideScroll(page)).toBe(true);

    const card = page.locator('.sw-card');
    const actions = page.locator('.sw-actions');
    const signIn = page.getByRole('button', { name: 'Accedi con Home Assistant' });
    await expect(signIn).toBeVisible();
    if (viewport.phone) {
      // On a phone the card fills the screen and the actions stay at the bottom.
      await expect(card).toHaveCSS('border-radius', '0px');
      await expect(actions).toHaveCSS('position', 'sticky');
      const bounds = await card.boundingBox();
      expect(bounds?.x).toBe(0);
      expect(bounds?.width).toBe(viewport.width);
    } else {
      await expect(actions).toHaveCSS('position', 'static');
      const bounds = await card.boundingBox();
      expect(bounds?.width).toBeLessThanOrEqual(680);
    }
  });
}

test('setup follows the device appearance instead of the stored profile theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('ha.dashboard.theme', 'dark');
  });

  await page.goto('/');
  const setup = page.locator('main[data-appearance-source="device"]');
  await expect(setup).toHaveClass(/dashboard-theme-light/);
  await expect(setup).not.toHaveClass(/dashboard-theme-dark/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(setup).toHaveClass(/dashboard-theme-dark/);
  await expect(setup).not.toHaveClass(/dashboard-theme-light/);
});

const bigHome = {
  version: 3,
  phase: 'summary',
  mode: 'real',
  hassUrl: 'http://homeassistant.local:8123',
  updatedAt: 0,
  summary: {
    entities: 540,
    devices: 80,
    areas: 12,
    floors: 3,
    unavailable: 4,
    unassigned: 9,
    partial: ['floors'],
    canManageHa: true,
    userName: 'Mattia',
    categories: { lights: 70, thermostats: 8, covers: 12, media: 18, plugs: 14, security: 22 },
    domains: {},
  },
};

for (const viewport of [{ width: 1180, height: 720 }, { width: 390, height: 844 }]) {
  test(`a long summary keeps the continue action reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((journey) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('hass_auth_tokens', JSON.stringify({
        hassUrl: journey.hassUrl,
        clientId: window.location.origin,
        expires: Date.now() + 3_600_000,
        refresh_token: 'refresh',
        access_token: 'access',
        expires_in: 1800,
      }));
      localStorage.setItem('ha.dashboard.setupJourney.v3', JSON.stringify({ ...journey, updatedAt: Date.now() }));
    }, bigHome);

    await page.goto('/setup');
    await page.getByRole('button', { name: 'Riprendi da dove eri' }).click();
    await expect(page.getByRole('heading', { name: 'Ecco la casa di Mattia' })).toBeVisible();
    await expect(page.getByText('Non siamo riusciti a leggere i piani')).toBeVisible();
    const continueButton = page.getByRole('button', { name: 'Continua' });
    await continueButton.scrollIntoViewIfNeeded();
    await expect(continueButton).toBeInViewport();
    await expect.poll(() => noSideScroll(page)).toBe(true);
    if (viewport.width < 760) {
      // The action bar stays pinned to the bottom of the phone while the summary scrolls under it.
      await page.evaluate(() => window.scrollTo(0, 0));
      const bounds = await continueButton.boundingBox();
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
      expect(bounds?.y ?? viewport.height).toBeGreaterThan(viewport.height - 140);
    }
  });
}
