import { chromium } from '@playwright/test';

// Lab measurements only, not field Core Web Vitals. Fresh context per URL.
const browser = await chromium.launch();
try {
  for (const url of process.argv.slice(2)) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 3 });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.siteVitals = { lcp: 0, cls: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.siteVitals.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.siteVitals.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    console.log(JSON.stringify(await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      ...window.siteVitals,
      resources: performance.getEntriesByType('resource').map(({ name, decodedBodySize, encodedBodySize }) => ({ name: name.split('/').pop(), decodedBodySize, encodedBodySize })),
    })), null, 2));
    await context.close();
  }
} finally {
  await browser.close();
}
