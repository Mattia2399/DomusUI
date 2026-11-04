const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';

const widgets = [
  {
    id: 'qa-lock', kind: 'lock', title: 'Serratura QA', entityId: 'lock.max_compat_locked', dataSource: 'mock', status: 'locked',
    layout: { i: 'qa-lock', x: 0, y: 0, w: 2, h: 4 },
  },
  {
    id: 'qa-camera', kind: 'camera', title: 'Camera QA', entityId: 'camera.front_door', dataSource: 'mock', status: 'streaming',
    layout: { i: 'qa-camera', x: 2, y: 0, w: 2, h: 4 },
  },
  {
    id: 'qa-media', kind: 'media', title: 'Media QA', entityId: 'media_player.max_compat_media_player', dataSource: 'mock', status: 'playing',
    layout: { i: 'qa-media', x: 0, y: 4, w: 4, h: 4 },
  },
];

const layout = {
  version: 14,
  layoutEngine: 'grid-engine-2',
  gridMetricsVersion: 'v2',
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
  sections: [],
  widgets,
};

async function install(page, theme) {
  await page.addInitScript(({ key, value, appearance }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.theme', appearance);
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  }, { key: STORAGE_KEY, value: layout, appearance: theme });
}

async function openCard(page, id, phone) {
  const card = page.locator(`[data-grid-engine-root-item="${id}"]`);
  if (phone) {
    const target = id === 'qa-media'
      ? card.getByRole('button', { name: /Apri il player completo/i }).first()
      : card.getByRole('button', { name: /Apri il dettaglio/i }).first();
    await expect(target).toBeVisible({ timeout: 10_000 });
    const bounds = await target.boundingBox();
    const client = await page.context().newCDPSession(page);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
    await page.waitForTimeout(540);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    const target = id === 'qa-media'
      ? card.getByRole('button', { name: /Apri il player completo/i }).first()
      : card.getByRole('button', { name: /Apri il dettaglio/i }).first();
    await target.click();
  }
}

async function closeContext(page) {
  const sheetClose = page.locator('.device-context-surface').getByRole('button', { name: /Chiudi.*dispositivo/i });
  if (await sheetClose.count()) {
    await sheetClose.click();
  } else {
    await page.getByRole('button', { name: /Chiudi|Close|Fermer/i }).first().click();
  }
}

for (const { width, height, label } of [
  { width: 390, height: 844, label: 'phone' },
  { width: 1440, height: 960, label: 'desktop' },
]) {
  for (const theme of ['light', 'dark']) {
    test(`Home shared lock, camera and media panels fit ${label} in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme });
      await install(page, theme);
      await page.goto('/home');
      await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.dashboard-shell')).toHaveClass(new RegExp(`dashboard-theme-${theme}`));

      await openCard(page, 'qa-lock', label === 'phone');
      const lockPanel = page.locator('.panel-shell').first();
      await expect(lockPanel).toBeVisible();
      if (label === 'phone') await expect(page.getByRole('heading', { name: 'Serratura QA' })).toBeVisible();
      else await expect(lockPanel).toContainText('Serratura QA');
      await expect(lockPanel.locator('.dv-ring')).toBeVisible();
      await expect(page.locator('.dv-panel-frame')).toHaveCSS('container-type', 'inline-size');
      await closeContext(page);

      await openCard(page, 'qa-camera', label === 'phone');
      const cameraPanel = page.locator('.panel-shell').first();
      await expect(cameraPanel).toBeVisible();
      if (label === 'phone') await expect(page.getByRole('heading', { name: 'Camera QA' })).toBeVisible();
      else await expect(cameraPanel).toContainText('Camera QA');
      await expect(cameraPanel.locator('.panel-camera')).toBeVisible();
      const cameraBounds = await cameraPanel.boundingBox();
      expect(cameraBounds.x).toBeGreaterThanOrEqual(0);
      expect(cameraBounds.x + cameraBounds.width).toBeLessThanOrEqual(width + 1);
      await closeContext(page);

      await openCard(page, 'qa-media', label === 'phone');
      const media = page.getByTestId('media-player');
      await expect(media).toBeVisible();
      const mediaBounds = await media.boundingBox();
      expect(mediaBounds.x).toBeGreaterThanOrEqual(0);
      expect(mediaBounds.x + mediaBounds.width).toBeLessThanOrEqual(width + 1);
      await media.getByRole('button', { name: /Riduci|Minimizza|Réduire|Minimize/i }).click();
      await expect(media).toHaveCount(0);
    });
  }
}
