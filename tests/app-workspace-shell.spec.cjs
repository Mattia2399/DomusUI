const { test, expect } = require('@playwright/test');
const { connectHomeAssistant } = require('./support/fakeHomeAssistant.cjs');

function installCompletedRealWorkspace(page) {
  return page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2,
      phase: 'done',
      mode: 'real',
      updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
}

test('App Library detail routes use an immersive contextual workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedRealWorkspace(page);
  await connectHomeAssistant(page);

  await page.goto('/appgallery/irrigation');

  await expect(page.getByTestId('app-workspace-shell')).toBeVisible();
  await expect(page.getByTestId('app-workspace-sidebar')).toBeVisible();
  await expect(page.locator('.dashboard-shell > aside')).toHaveCount(0);
  const sidebarMetrics = await page.getByTestId('app-workspace-sidebar').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      width: element.getBoundingClientRect().width,
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
    };
  });
  expect(sidebarMetrics.width).toBeGreaterThanOrEqual(60);
  expect(sidebarMetrics.width).toBeLessThanOrEqual(80);
  expect(sidebarMetrics.borderRadius).toBeGreaterThan(0);
  await expect(page.getByRole('navigation', { name: 'Navigazione Irrigazione Smart' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Panoramica' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zone', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Consumi', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Oggi', exact: true })).toBeVisible();
  await expect(page.getByTestId('irrigation-today-hero')).toBeVisible();
  await expect(page.getByTestId('irrigation-today-hero').locator('img[src*="/irrigation/"]')).toBeVisible();
  const overviewHero = await page.getByTestId('irrigation-today-hero').boundingBox();
  const upcomingHeading = await page.getByRole('heading', { name: 'Prossimi' }).boundingBox();
  expect(Math.abs((overviewHero?.y ?? 0) - (upcomingHeading?.y ?? 0))).toBeLessThan(25);

  await page.getByRole('button', { name: 'Zone' }).click();
  await expect(page.locator('#irrigation-zones')).toBeInViewport();

  await page.getByRole('button', { name: 'Torna alla libreria' }).click();
  await expect(page).toHaveURL(/\/appgallery$/);
  await expect(page.getByRole('heading', { name: 'App Gallery', exact: true })).toBeVisible();
});

test('App Library apps use a contextual bottom bar on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCompletedRealWorkspace(page);
  await connectHomeAssistant(page);

  await page.goto('/appgallery/pool');

  await expect(page.getByTestId('app-workspace-shell')).toBeVisible();
  await expect(page.getByTestId('app-workspace-sidebar')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Navigazione Piscina e Spa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Torna alla libreria' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acqua pronta, sempre' })).toBeVisible();
  await expect(page.getByText('Disponibile prossimamente')).toBeVisible();
  await expect(page.locator('img[src*="pool-spa-preview"]')).toBeVisible();
  await expect(page.locator('.dashboard-shell > nav')).toHaveCount(0);

  const hero = page.getByTestId('coming-soon-demo-hero');
  const heroHeader = page.getByTestId('coming-soon-demo-header');
  const sheet = page.getByTestId('coming-soon-demo-sheet');
  const sheetBackdrop = page.getByTestId('coming-soon-demo-sheet-backdrop');
  await expect(page.getByTestId('coming-soon-demo-mobile-metrics')).toBeVisible();
  const scrollContainer = page.getByTestId('app-workspace-shell').locator('main');
  const scrollContainerBackground = await scrollContainer.evaluate((element) => getComputedStyle(element).backgroundColor);
  const groupedBackground = await scrollContainer.evaluate((element) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--ui-bg-grouped)';
    element.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  expect(scrollContainerBackground).toBe(groupedBackground);
  const heroBefore = await hero.boundingBox();
  const sheetBefore = await sheet.boundingBox();
  const mobileCornerRadii = {
    hero: Number.parseFloat(await hero.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)),
    sheet: Number.parseFloat(await sheet.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)),
  };
  const headerOpacityBefore = Number.parseFloat(await heroHeader.evaluate((element) => getComputedStyle(element).opacity));
  const backdropOpacityBefore = Number.parseFloat(await sheetBackdrop.evaluate((element) => getComputedStyle(element).opacity));
  await scrollContainer.evaluate((element) => element.scrollTo({ top: 320, behavior: 'instant' }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const heroAfter = await hero.boundingBox();
  const sheetAfter = await sheet.boundingBox();
  const headerOpacityAfter = Number.parseFloat(await heroHeader.evaluate((element) => getComputedStyle(element).opacity));
  const backdropOpacityAfter = Number.parseFloat(await sheetBackdrop.evaluate((element) => getComputedStyle(element).opacity));

  expect(Math.abs((heroAfter?.y ?? 0) - (heroBefore?.y ?? 0))).toBeLessThan(3);
  expect(heroBefore?.height).toBeGreaterThanOrEqual(400);
  expect(heroBefore?.height).toBeLessThanOrEqual(461);
  expect(sheetAfter?.y).toBeLessThan((sheetBefore?.y ?? 0) - 150);
  expect(headerOpacityBefore).toBeGreaterThan(0.95);
  expect(headerOpacityAfter).toBeLessThan(0.2);
  expect(backdropOpacityBefore).toBeLessThan(0.05);
  expect(backdropOpacityAfter).toBeGreaterThan(0.9);
  expect(mobileCornerRadii.hero).toBe(0);
  expect(mobileCornerRadii.sheet).toBeGreaterThanOrEqual(28);

  await scrollContainer.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const sheetAtRest = await sheet.boundingBox();
  const sheetLayout = await sheet.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    position: getComputedStyle(element).position,
    top: getComputedStyle(element).top,
  }));
  expect(sheetAtRest?.y, JSON.stringify(sheetLayout)).toBeGreaterThanOrEqual(6);
  expect(sheetAtRest?.y).toBeLessThan(24);
});

test('Irrigation Today keeps the shared mobile navigation and uses a rounded photo card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCompletedRealWorkspace(page);
  await connectHomeAssistant(page);

  await page.goto('/appgallery/irrigation');

  await expect(page.getByTestId('app-workspace-sidebar')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Oggi', exact: true })).toBeVisible();
  const hero = page.getByTestId('irrigation-today-hero');
  const facts = page.getByTestId('irrigation-today-facts');
  await expect(hero).toBeVisible();
  await expect(facts).toBeVisible();
  await expect(facts.getByText('Meteo', { exact: true })).toBeVisible();
  await expect(facts.getByText('Terreno', { exact: true })).toBeVisible();
  await expect(facts.getByText('Acqua', { exact: true })).toBeVisible();
  await expect(hero).toHaveAttribute('data-state', 'unavailable');
  await expect(hero.getByRole('button')).toHaveCount(0);

  const scrollContainer = page.getByTestId('app-workspace-shell').locator('main');
  const heroBefore = await hero.boundingBox();
  await scrollContainer.evaluate((element) => element.scrollTo({ top: 400, behavior: 'instant' }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const heroAfter = await hero.boundingBox();
  const scrollTop = await scrollContainer.evaluate((element) => element.scrollTop);
  expect(heroBefore?.height).toBeGreaterThanOrEqual(236);
  expect(heroBefore?.height).toBeLessThanOrEqual(350);
  expect(scrollTop).toBeGreaterThan(0);
  expect(Math.abs(((heroBefore?.y ?? 0) - (heroAfter?.y ?? 0)) - scrollTop)).toBeLessThan(3);
  const heroRadius = Number.parseFloat(await hero.evaluate((element) => getComputedStyle(element).borderTopLeftRadius));
  expect(heroRadius).toBeGreaterThanOrEqual(24);

  const mobileNavigation = page.getByRole('navigation', { name: 'Navigazione Irrigazione Smart' });
  await expect(mobileNavigation.getByRole('button', { name: 'Torna alla libreria' })).toBeVisible();
  await expect(page.locator('header')).toHaveCount(0);
  const todayZones = page.getByTestId('irrigation-today-zones');
  await expect(todayZones).toBeVisible();
  await todayZones.getByRole('button', { name: 'Tutte' }).click();
  await expect(page).toHaveURL(/\/appgallery\/irrigation\/zones$/);
});

test('Irrigation nested routes survive direct navigation and refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCompletedRealWorkspace(page);
  await connectHomeAssistant(page);
  await page.goto('/appgallery/irrigation');

  const navigation = page.getByRole('navigation', { name: 'Navigazione Irrigazione Smart' });
  await navigation.getByRole('button', { name: 'Calendario' }).click();
  await expect(page).toHaveURL(/\/appgallery\/irrigation\/calendar$/);
  await expect(page.getByRole('heading', { name: 'Calendario irrigazione' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Impostazioni' })).toHaveCount(0);
  // Measure the summary against the page heading: the click may scroll the
  // page to reach the last tab, which moves both without any layout shift.
  const weeklySummary = page.getByText('Cicli questa settimana');
  const calendarHeading = page.getByRole('heading', { name: 'Calendario irrigazione' });
  const summaryOffset = async () =>
    ((await weeklySummary.boundingBox())?.y ?? 0) - ((await calendarHeading.boundingBox())?.y ?? 0);
  const summaryBefore = await summaryOffset();
  await page.getByRole('tablist', { name: 'Giorni della settimana' }).getByRole('tab').last().click();
  const summaryAfter = await summaryOffset();
  expect(Math.abs(summaryAfter - summaryBefore)).toBeLessThan(4);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Calendario irrigazione' })).toBeVisible();
  const refreshedNavigation = page.getByRole('navigation', { name: 'Navigazione Irrigazione Smart' });
  await refreshedNavigation.getByRole('button', { name: 'Zone' }).click();
  await expect(page).toHaveURL(/\/appgallery\/irrigation\/zones$/);
  await expect(page.getByRole('heading', { name: 'Zone irrigazione' })).toBeVisible();

  await refreshedNavigation.getByRole('button', { name: 'Consumi' }).click();
  await expect(page).toHaveURL(/\/appgallery\/irrigation\/consumption$/);
  const consumptionHeading = page.getByRole('heading', { name: 'Consumi irrigazione' });
  const firstConsumptionCard = page.locator('#irrigation-usage article').first();
  await expect(consumptionHeading).toBeVisible();
  await expect(firstConsumptionCard).toBeVisible();
  const headingBox = await consumptionHeading.boundingBox();
  const cardBox = await firstConsumptionCard.boundingBox();
  // Chromium can resolve the same responsive percentage to slightly
  // different sub-pixels on Windows and Linux. Three pixels still enforces a
  // visually flush edge without making the release gate platform-dependent.
  expect(Math.abs((headingBox?.x ?? 0) - (cardBox?.x ?? 0))).toBeLessThanOrEqual(3);
});
