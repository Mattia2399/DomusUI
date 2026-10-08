const { test, expect } = require('@playwright/test');

for (const locale of ['it', 'en']) {
  test(`${locale}: presentation, energy, navigation and live cards`, async ({ page, isMobile }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(locale === 'it' ? '/' : '/en/');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: 'Domus UI', exact: true })).toBeVisible();
    // Below-fold widgets are not mounted at startup.
    await expect(page.locator('#live .s-demo-placeholder')).toHaveCount(3);
    if (isMobile) await page.getByRole('button', { name: locale === 'it' ? 'Apri menu' : 'Open menu' }).click();
    await page.locator(isMobile ? '#site-mobile-menu a[href="#energy"]' : 'nav a[href="#energy"]').click();
    await expect(page).toHaveURL(/#energy$/);
    await expect(page.locator('#energy-title')).toBeInViewport();
    await expect(page.locator('#energy')).toContainText('Domus Energy Core');
    await expect(page.locator('#energy')).toContainText(locale === 'it' ? 'versione 1.5.0' : 'version 1.5.0');
    await expect(page.locator('#energy')).toContainText(locale === 'it' ? '24 ore' : '24 hours');
    const image = page.locator('#energy img');
    await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`energy-${locale}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.locator('#live').scrollIntoViewIfNeeded();
    const light = page.locator('#live [data-demo-card="light"]');
    await light.scrollIntoViewIfNeeded();
    await expect(light.locator('.s-demo-placeholder')).toHaveCount(0);
    // The same production light control must remain interactive after lazy mounting.
    const toggle = light.locator('button[aria-pressed]').first();
    await expect(toggle).toBeVisible();
    const checked = await toggle.getAttribute('aria-pressed');
    // The toggle covers the card; its centre belongs to the brightness slider.
    // Centre the card below the fixed nav and use its icon/header hit target.
    await light.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await toggle.click({ position: { x: 20, y: 20 } });
    await expect(toggle).toHaveAttribute('aria-pressed', checked === 'true' ? 'false' : 'true');
    await page.screenshot({ path: testInfo.outputPath(`live-${locale}.png`) });

    if (isMobile) await page.getByRole('button', { name: locale === 'it' ? 'Apri menu' : 'Open menu' }).click();
    await page.locator(isMobile ? '#site-mobile-menu a[hreflang]' : 'nav a[hreflang]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale === 'it' ? 'en' : 'it');
    await page.goto(`${locale === 'it' ? '/' : '/en/'}#energy`);
    await expect(page.locator('#energy-title')).toBeInViewport();
    expect(errors).toEqual([]);
  });
}

test('reduced motion and failed optional demo keep the site usable', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/DemoCardRuntime-*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Domus UI', exact: true })).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: 'Apri menu' }).click();
  await page.locator(isMobile ? '#site-mobile-menu a[href="#install"]' : 'nav ul a[href="#install"]').click();
  await expect(page.locator('#install-title')).toBeInViewport();
  await expect(page.locator('#install a').filter({ hasText: 'Apri in HACS' })).toBeVisible();
});
