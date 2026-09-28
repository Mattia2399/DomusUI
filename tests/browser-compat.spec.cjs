const { test, expect } = require('@playwright/test');

test('an outdated browser or WebView gets an explanation instead of a blank page', async ({ page }) => {
  await page.addInitScript(() => {
    // Simulate an old Android WebView (for example on a Fully Kiosk wall tablet).
    delete window.structuredClone;
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (property, value) =>
      typeof value === 'string' && value.includes('color-mix') ? false : supports(property, value);
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Browser non supportato' })).toBeVisible();
  await expect(page.getByText(/Android System WebView/).first()).toBeVisible();
  await expect(page.getByText(/Funzioni mancanti: .*CSS color-mix\(\).*structuredClone\(\)/)).toBeVisible();
  // The app itself does not start over the message.
  await expect(page.getByRole('heading', { name: 'Browser non supportato' })).toHaveCount(1);
  await expect(page.locator('#root nav')).toHaveCount(0);
});

test('a supported browser starts the app normally', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Browser non supportato' })).toHaveCount(0);
  await expect(page.locator('#root')).not.toBeEmpty();
});
