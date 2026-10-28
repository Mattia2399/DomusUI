const { test, expect } = require('@playwright/test');

async function longPress(page, locator) {
  const bounds = await locator.boundingBox();
  const client = await page.context().newCDPSession(page);
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1, radiusX: 2, radiusY: 2, force: 1 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(540);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function enterFreshDemo(page) {
  await page.goto('/home');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Inizia', exact: true }).click();
  await page.getByRole('button', { name: /Prova la Demo/ }).click();
  const guide = page.getByRole('dialog', { name: 'Questa è la casa Demo' });
  // The first Home of a cold dev server compiles the whole dashboard.
  await expect(guide).toBeVisible({ timeout: 30_000 });
  return guide;
}

test('the first-run guide walks the Demo on desktop and ends by connecting the home', async ({ page }) => {
  // Mirrors a 1920x1080 browser with the visible browser chrome removed.
  await page.setViewportSize({ width: 1920, height: 1032 });
  await page.emulateMedia({ colorScheme: 'light' });
  const guide = await enterFreshDemo(page);
  const lightShell = page.locator('.dashboard-shell.dashboard-theme-light.dashboard-background-neutral').first();
  await expect(lightShell).toBeVisible();

  await expect(guide.getByRole('img', { name: 'Passo 1 di 3' })).toBeVisible();
  await guide.getByRole('button', { name: 'Avanti' }).click();
  await expect(page.getByRole('dialog', { name: 'Le Stanze' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Avanti' }).click();
  const last = page.getByRole('dialog', { name: 'Quando vuoi, la tua casa' });
  await expect(last.getByRole('button', { name: 'Salta' })).toHaveCount(0);
  await last.getByRole('button', { name: 'Collega la tua casa' }).click();

  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Dov’è la tua casa?' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.runtimeMode.v1'))).toBe('real');
});

test('the first-run guide sits above the mobile bar and can be skipped', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Without the entrance animation the sheet is measured where it rests.
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const guide = await enterFreshDemo(page);
  const darkShell = page.locator('.dashboard-shell.dashboard-theme-dark.dashboard-background-neutral').first();
  await expect(darkShell).toBeVisible();

  const bounds = await guide.boundingBox();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(844 - 96);

  await guide.getByRole('button', { name: 'Salta' }).click();
  await expect(guide).toBeHidden();
  // The Demo chose its Home in setup: no starting-point question after the guide.
  await expect(page.getByRole('dialog', { name: 'Scegli il tuo punto di partenza' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.onboarding.welcome.v1'))).toBe('done');

  await page.reload();
  await expect(page.getByRole('button', { name: /Demo · Collega la tua casa/i })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Questa è la casa Demo' })).toHaveCount(0);
});

for (const viewport of [{ width: 1440, height: 900, phone: false }, { width: 390, height: 844, phone: true }]) {
  test(`the first device opened explains its controls at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const welcome = await enterFreshDemo(page);
    await welcome.getByRole('button', { name: 'Salta' }).click();
    await expect(welcome).toBeHidden();

    // A sensor has no switch: a click opens its controls, on a phone a long press.
    const sensor = page.getByRole('button', { name: 'Apri Sensor' }).first();
    await sensor.scrollIntoViewIfNeeded();
    if (viewport.phone) {
      await longPress(page, sensor);
    } else {
      await sensor.click();
    }

    const guide = page.getByRole('dialog', { name: 'I comandi del dispositivo' });
    await expect(guide).toBeVisible();
    await expect(guide.getByText('Comandi', { exact: true })).toBeVisible();
    const bounds = await guide.boundingBox();
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    if (viewport.phone) {
      // The controls fill the bottom of a phone: the guide sits above them.
      expect(bounds?.y ?? viewport.height).toBeLessThan(80);
    }
    await page.screenshot({ path: `test-results/controls-guide-${viewport.width}.png` });

    await guide.getByRole('button', { name: 'Avanti' }).click();
    await page.getByRole('dialog', { name: 'Passa a un altro' }).getByRole('button', { name: 'Avanti' }).click();
    await page.getByRole('dialog', { name: 'Torna alla Home' }).getByRole('button', { name: 'Ho capito' }).click();
    await expect(page.getByRole('dialog', { name: 'Torna alla Home' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ha.dashboard.onboarding.context.v1'))).toBe('done');
  });
}
