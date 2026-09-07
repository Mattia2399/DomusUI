const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';

const seededLayout = {
  version: 14,
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
  sections: [
    {
      id: 'section-removal-stack',
      kind: 'stack-grid',
      title: 'Stack da rimuovere',
      stackColumnsMode: 'auto',
      stackShowBackground: true,
      stackShowBorder: true,
      stackShowHeader: true,
      layout: { i: 'section-removal-stack', x: 0, y: 0, w: 6, h: 4 },
    },
  ],
  widgets: [
    {
      id: 'light.removal_first',
      kind: 'light',
      title: 'Luce conservata uno',
      entityId: 'light.removal_first',
      parentSectionId: 'section-removal-stack',
      placementPolicy: 'manual',
      status: 'Accesa',
      isOn: true,
      value: 70,
      unit: '%',
      layout: { i: 'light.removal_first', x: 0, y: 0, w: 2, h: 2 },
    },
    {
      id: 'light.removal_second',
      kind: 'light',
      title: 'Luce conservata due',
      entityId: 'light.removal_second',
      parentSectionId: 'section-removal-stack',
      placementPolicy: 'manual',
      status: 'Spenta',
      isOn: false,
      value: 0,
      unit: '%',
      layout: { i: 'light.removal_second', x: 2, y: 0, w: 2, h: 2 },
    },
  ],
};

async function openRemovalChoice(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.addInitScript(
    ({ key, value, runtimeKey }) => {
      localStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { key: STORAGE_KEY, value: seededLayout, runtimeKey: RUNTIME_KEY },
  );

  await page.goto('/?view=home');
  await page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first().click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await page.waitForSelector('.sections-grid.is-editing');
  await page.getByRole('group', { name: 'Sezione Stack da rimuovere' }).click({ position: { x: 20, y: 20 } });
  await page.getByRole('button', { name: 'Rimuovi Stack' }).click();
  await expect(page.getByRole('dialog', { name: 'Rimuovere “Stack da rimuovere”?' })).toBeVisible();
}

test('removing a stack can keep its cards on the root canvas', async ({ page }) => {
  await openRemovalChoice(page);
  await page.getByRole('button', { name: 'Sposta le card nel canvas' }).click();

  await expect(page.getByRole('group', { name: 'Sezione Stack da rimuovere' })).toHaveCount(0);
  await expect(page.getByText('Luce conservata uno', { exact: true })).toBeVisible();
  await expect(page.getByText('Luce conservata due', { exact: true })).toBeVisible();
  await expect(page.locator('.sections-grid > .react-grid-item .light-card')).toHaveCount(2);
});

test('removing a stack can delete all of its cards', async ({ page }) => {
  await openRemovalChoice(page);
  await page.getByRole('button', { name: 'Elimina anche le card' }).click();

  await expect(page.getByRole('group', { name: 'Sezione Stack da rimuovere' })).toHaveCount(0);
  await expect(page.getByText('Luce conservata uno', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Luce conservata due', { exact: true })).toHaveCount(0);
});

test('closing the stack removal choice leaves the stack untouched', async ({ page }) => {
  await openRemovalChoice(page);
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();

  await expect(page.getByRole('dialog', { name: 'Rimuovere “Stack da rimuovere”?' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Sezione Stack da rimuovere' })).toBeVisible();
  await expect(page.locator('.sections-grid .light-card')).toHaveCount(2);
});
