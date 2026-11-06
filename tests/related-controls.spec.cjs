const { expect, test } = require('@playwright/test');

// The demo stove with its related controls, on a phone and in the column of the Home. They belong to the Home only.

const VIEWS = [
  { name: 'telefono', width: 390, height: 844, touch: true, path: '/home' },
  { name: 'colonna', width: 1440, height: 900, touch: false, path: '/home' },
];
const ROOMS = { name: 'dialogo', width: 1376, height: 1032, touch: false, path: '/rooms' };

const RELATED = [
  { id: 'boiler', entityId: 'sensor.demo_boiler_acs', look: 'temperature', place: 'more', order: 0 },
  { id: 'power', entityId: 'number.demo_stove_power', look: 'levels', place: 'more', order: 1 },
  { id: 'schedule', entityId: 'switch.demo_stove_schedule', look: 'toggle-row', place: 'more', order: 2 },
  { id: 'pellet', entityId: 'sensor.demo_pellet_level', look: 'level', place: 'more', order: 3 },
];

const card = (id, kind, title, extra, x, y) => ({ id, kind, title, entityId: id, dataSource: 'mock', status: 'on', isOn: true, layout: { i: id, x, y, w: 2, h: 4 }, ...extra });

function layoutWith(related = RELATED, others = []) {
  return {
    version: 14,
    layoutEngine: 'grid-engine-2',
    gridMetricsVersion: 'v2',
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
    sections: [],
    widgets: [
      card('climate.demo_stove', 'climate', 'Termostufa Integrata', { status: 'heat', value: 69, relatedControls: related }, 0, 0),
      card('light.living_room_lamp', 'light', 'Lampada', { value: 60 }, 2, 0),
      card('climate.living_room', 'climate', 'Clima', { status: 'heat', value: 21 }, 0, 4),
      ...others,
    ],
  };
}

async function openDemo(page, view, layout = layoutWith()) {
  await page.setViewportSize({ width: view.width, height: view.height });
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('__fx') === '1') return;
    sessionStorage.setItem('__fx', '1');
    localStorage.clear();
    localStorage.setItem('domusui.language.v1', 'it');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.demo.builder.layout.v1', value);
  }, JSON.stringify(layout));
  await page.goto(view.path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dv-tile-body', { timeout: 60000 });
  await page.waitForTimeout(800);
}

async function openPanel(page, name) {
  await page.locator(`.dv-tile-body[aria-label*="${name}"]`).first().evaluate((node) => node.click());
  await page.waitForSelector('.panel-shell', { timeout: 15000 });
}

const isPhone = (view) => view.name === 'telefono';
const moreOf = (page, view) => (isPhone(view) ? page.locator('.panel-nav').getByRole('button', { name: 'Altro' }) : page.locator('.panel-group-more'));
const rowOf = (page, name) => page.locator('.panel-page').getByRole('button', { name: new RegExp(name) });
const backOf = (page) => page.locator('.panel-page').getByRole('button', { name: 'Indietro' });

test.describe.configure({ timeout: 90000 });

for (const view of VIEWS) {
  test.describe(view.name, () => {
    test.use({ hasTouch: view.touch, locale: 'it-IT', ignoreHTTPSErrors: true });

    test('the rows of Altro are those of the board, with the name once', async ({ page }) => {
      await openDemo(page, view);
      await openPanel(page, 'Termostufa');
      await moreOf(page, view).click();
      await expect(rowOf(page, 'Boiler ACS')).toContainText('56,4°');
      await expect(rowOf(page, 'Boiler ACS')).toContainText('Sensore');
      await expect(rowOf(page, 'Potenza fiamma')).toContainText('3 di 5');
      await expect(rowOf(page, 'Potenza fiamma')).toContainText('Livelli');
      await expect(rowOf(page, 'Programma orario')).toContainText('Acceso');
      await expect(rowOf(page, 'Programma orario')).toContainText('Interruttore');
      await expect(rowOf(page, 'Pellet nel serbatoio')).toContainText('40%');
      await expect(rowOf(page, 'Pellet nel serbatoio')).toContainText('Livello');
      await expect(page.locator('.panel-page').getByText('4 controlli')).toBeVisible();
    });

    test('a large version fills the space of the protagonist', async ({ page }) => {
      await openDemo(page, view);
      await openPanel(page, 'Termostufa');
      await moreOf(page, view).click();
      for (const [name, control] of [['Potenza fiamma', '.glass-levels.is-hero'], ['Pellet nel serbatoio', '.glass-level.is-hero'], ['Boiler ACS', '.glass-temperature.is-hero']]) {
        await rowOf(page, name).click();
        const shown = page.locator(`.panel-page-fill ${control}`);
        await expect(shown).toBeVisible();
        const fill = await page.locator('.panel-page-fill').boundingBox();
        const look = await page.locator('.panel-page-fill .related-look').boundingBox();
        expect(fill.height, name).toBeGreaterThan(280);
        expect(look.height, `${name} non riempie`).toBeGreaterThan(fill.height - 40);
        expect(look.width, `${name} non riempie`).toBeGreaterThan(fill.width - 40);
        await backOf(page).click();
        await expect(rowOf(page, name)).toBeVisible();
      }
    });

    test('touching a level or a switch changes what it says', async ({ page }) => {
      await openDemo(page, view);
      await openPanel(page, 'Termostufa');
      await moreOf(page, view).click();
      await rowOf(page, 'Potenza fiamma').click();
      await page.locator('.panel-page-fill').getByRole('radio', { name: '4' }).click();
      await backOf(page).click();
      await expect(rowOf(page, 'Potenza fiamma')).toContainText('4 di 5');
      await rowOf(page, 'Programma orario').click();
      await expect(rowOf(page, 'Programma orario')).toContainText('Spento');
    });

    test('a control of the device opened from Altro shows too', async ({ page }) => {
      await openDemo(page, view);
      await openPanel(page, 'Clima');
      await moreOf(page, view).click();
      await rowOf(page, 'Alette').click();
      const inside = page.locator('.panel-page-fill .panel-hero-main');
      await expect(inside).toBeVisible();
      expect((await inside.boundingBox()).height).toBeGreaterThan(100);
    });

    test('a panel with no related controls downloads nothing new', async ({ page }) => {
      const asked = [];
      page.on('request', (request) => {
        if (/related\/(looks|relatedPanelControls|RelatedControlView)|ui\/families/.test(request.url())) asked.push(request.url());
      });
      await openDemo(page, view);
      await openPanel(page, 'Lampada');
      await page.waitForTimeout(1200);
      expect(asked).toEqual([]);
    });

    test('nothing jumps while a piece arrives', async ({ page }) => {
      let release = () => undefined;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      await page.route(/ValuesLooks/, async (route) => {
        await held;
        await route.continue();
      });
      await openDemo(page, view, layoutWith([{ ...RELATED[1], place: 'main' }, RELATED[0], RELATED[2]]));
      await openPanel(page, 'Termostufa');
      if (isPhone(view)) {
        const row = page.locator('.panel-nav');
        const before = await row.boundingBox();
        await row.getByRole('button', { name: /Potenza fiamma/ }).click();
        const waiting = page.locator('.related-look.is-hero.is-waiting');
        await expect(waiting).toBeVisible();
        const box = await waiting.boundingBox();
        release();
        await expect(page.locator('.glass-levels.is-hero')).toBeVisible();
        const after = await page.locator('.related-look.is-hero').boundingBox();
        expect(Math.abs(after.height - box.height)).toBeLessThan(2);
        expect(Math.abs(after.width - box.width)).toBeLessThan(2);
        expect(Math.abs((await row.boundingBox()).y - before.y)).toBeLessThan(2);
      } else {
        const waiting = page.locator('.related-look.is-group.is-waiting');
        await expect(waiting).toBeVisible();
        const box = await waiting.boundingBox();
        release();
        await expect(page.locator('.glass-levels.is-group')).toBeVisible();
        const after = await page.locator('.related-look.is-group').first().boundingBox();
        expect(Math.abs(after.height - box.height), 'il segnaposto ha la misura del controllo').toBeLessThan(2);
      }
    });

    test('an entity that is gone says so', async ({ page }) => {
      await openDemo(page, view, layoutWith([...RELATED, { id: 'gone', entityId: 'sensor.demo_gone', name: 'Sparita', look: 'value', place: 'more', order: 9 }]));
      await openPanel(page, 'Termostufa');
      await moreOf(page, view).click();
      const row = page.locator('.panel-page').locator('.glass-list-row', { hasText: 'Sparita' });
      await expect(row).toContainText('Non disponibile');
    });
  });
}

test.describe('the Rooms show the device as the registry recommends', () => {
  test.use({ locale: 'it-IT', ignoreHTTPSErrors: true });

  test('the related controls and the choices of the card of the Home stay in the Home', async ({ page }) => {
    const layout = layoutWith(RELATED.map((control) => ({ ...control, place: 'main' })));
    layout.widgets[0].panelControls = { modes: { place: 'hidden', order: 0 } };
    await openDemo(page, ROOMS, layout);
    await openPanel(page, 'Termostufa');
    await expect(page.locator('.panel-groups').getByText('Modalità', { exact: true })).toBeVisible();
    await expect(page.getByText('Boiler ACS')).toHaveCount(0);
    await expect(page.getByText('Pellet nel serbatoio')).toHaveCount(0);
  });
});
