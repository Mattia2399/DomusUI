const { expect, test } = require('@playwright/test');

// The micro widgets saved on a card: each one in the row or in Altro, and the old block only where a panel has no Altro.

const NAMES = ['Boiler ACS', 'Fiamma', 'Programma orario', 'Pellet nel serbatoio', 'Pulsante', 'Pulizia braciere', 'Campanello', 'Vai alle Stanze', 'Setpoint acqua', 'Setpoint dal vivo', 'Potenza fiamma', 'Linea', 'Area', 'Barre'];

const MICRO = [
  { id: 'pill', type: 'value_pill', entity: 'sensor.demo_boiler_acs' },
  { id: 'glow', type: 'status_glow', entity: 'binary_sensor.demo_stove_flame' },
  { id: 'toggle', type: 'micro_toggle', entity: 'switch.demo_stove_schedule' },
  { id: 'ring', type: 'mini_ring', entity: 'sensor.demo_pellet_level' },
  { id: 'switch', type: 'micro_button', entity: 'switch.demo_stove_schedule', label: 'Pulsante', buttonMode: 'switch' },
  { id: 'push', type: 'micro_button', entity: 'button.demo_stove_clean', buttonMode: 'push' },
  { id: 'hold', type: 'micro_button', entity: 'switch.demo_bell', buttonMode: 'push', buttonHoldWhilePressed: true },
  { id: 'page', type: 'micro_button', entity: 'switch.demo_bell', label: 'Vai alle Stanze', buttonMode: 'page', buttonPagePath: '/rooms' },
  { id: 'release', type: 'micro_slider', entity: 'number.demo_water_setpoint', sliderSendOnRelease: true },
  { id: 'live', type: 'micro_slider', entity: 'number.demo_water_setpoint', label: 'Setpoint dal vivo', sliderSendOnRelease: false },
  { id: 'step', type: 'micro_step', entity: 'number.demo_stove_power' },
  { id: 'line', type: 'micro_superchart', entity: 'sensor.demo_boiler_acs', label: 'Linea', superChartType: 'line' },
  { id: 'area', type: 'micro_superchart', entity: 'sensor.demo_boiler_acs', label: 'Area', superChartType: 'area' },
  { id: 'bar', type: 'micro_superchart', entity: 'sensor.demo_boiler_acs', label: 'Barre', superChartType: 'bar' },
];

const card = (id, kind, title, extra, x, y) => ({ id, kind, title, entityId: id, dataSource: 'mock', status: 'on', isOn: true, layout: { i: id, x, y, w: 2, h: 4 }, ...extra });

async function openDemo(page, view, widgets) {
  await page.setViewportSize({ width: view.width, height: view.height });
  const layout = { version: 14, layoutEngine: 'grid-engine-2', gridMetricsVersion: 'v2', widgetTypeLayoutOverrides: {}, widgetLayoutOverrides: {}, responsiveLayouts: {}, sections: [], widgets };
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
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dv-tile-body', { timeout: 60000 });
  await page.waitForTimeout(800);
}

const openPanel = async (page, name) => {
  await page.locator(`.dv-tile-body[aria-label*="${name}"]`).first().evaluate((node) => node.click());
  await page.waitForSelector('.panel-shell', { timeout: 15000 });
};

const savedOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ha.dashboard.demo.builder.layout.v1')).widgets.find((widget) => widget.id === 'switch.demo_micro_plug')?.widgets);

test.describe.configure({ timeout: 120000 });

for (const view of [{ name: 'telefono', width: 390, height: 844, touch: true }, { name: 'colonna', width: 1440, height: 900, touch: false }]) {
  test.describe(view.name, () => {
    test.use({ hasTouch: view.touch, locale: 'it-IT', ignoreHTTPSErrors: true });
    const more = (page) => (view.touch ? page.locator('.panel-nav').getByRole('button', { name: 'Altro' }) : page.locator('.panel-group-more'));

    test('every micro widget is in Altro, with the old block gone, and nothing saved changes', async ({ page }) => {
      await openDemo(page, view, [card('switch.demo_micro_plug', 'switch', 'Presa con micro widget', { widgets: MICRO }, 0, 0)]);
      const before = await savedOf(page);
      await openPanel(page, 'Presa con micro');
      await more(page).click();
      const list = page.locator('.panel-page');
      await expect(list.getByText(`${MICRO.length} controlli`)).toBeVisible();
      for (const name of NAMES) await expect(list.locator('.glass-list-row', { hasText: name }).first(), name).toBeVisible();
      await expect(page.locator('.dv-pn-label')).toHaveCount(0);
      expect(await savedOf(page)).toEqual(before);
    });

    test('press and hold: on while held, off when let go', async ({ page }) => {
      await openDemo(page, view, [card('switch.demo_micro_plug', 'switch', 'Presa', { widgets: [MICRO[6], MICRO[0]] }, 0, 0)]);
      await openPanel(page, 'Presa');
      await more(page).click();
      await page.locator('.panel-page').locator('.glass-list-row', { hasText: 'Campanello' }).click();
      const button = page.locator('.panel-page-fill').getByRole('button', { name: /Campanello/ });
      await expect(button).toBeVisible();
      await expect(button).toContainText('Premi e tieni');
      const box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.panel-page-head')).toContainText('Acceso');
      await page.mouse.up();
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.panel-page-head')).toContainText('Spento');
    });

    test('a lone micro widget goes up to the row', async ({ page }) => {
      await openDemo(page, view, [card('switch.demo_micro_plug', 'switch', 'Presa', { widgets: [MICRO[0]] }, 0, 0)]);
      await openPanel(page, 'Presa');
      if (view.touch) await expect(page.locator('.panel-nav').getByRole('button', { name: /Boiler ACS/ })).toBeVisible();
      else await expect(page.locator('.panel-groups').getByText('Boiler ACS')).toBeVisible();
      await expect(page.locator('.panel-nav').getByRole('button', { name: 'Altro' })).toHaveCount(0);
    });

    test('a cover has a row only with its related controls', async ({ page }) => {
      await openDemo(page, view, [
        card('cover.living_room_shutter', 'cover', 'Tapparella', { status: 'open', widgets: [MICRO[0], MICRO[2]] }, 0, 0),
        card('cover.other', 'cover', 'Altra', { status: 'open' }, 2, 0),
      ]);
      await openPanel(page, 'Tapparella');
      if (view.touch) {
        const row = page.locator('.panel-nav');
        await expect(row.getByRole('button', { name: 'Altro' })).toBeVisible();
        await expect(row.getByRole('button', { name: /Posizione/ })).toHaveCount(0);
      } else {
        await expect(page.locator('.panel-group-more')).toBeVisible();
      }
    });

    test('the panels with no Altro keep the old block, with all of them', async ({ page }) => {
      await openDemo(page, view, [card('alarm_control_panel.home_alarm', 'alarm', 'Allarme', { status: 'disarmed', widgets: MICRO.slice(0, 3) }, 0, 0)]);
      await openPanel(page, 'Allarme');
      for (const name of NAMES.slice(0, 3)) await expect(page.getByText(name).first(), name).toBeVisible();
    });
  });
}

test.describe('a page button', () => {
  test.use({ locale: 'it-IT', ignoreHTTPSErrors: true });
  const view = { width: 1440, height: 900 };
  const widgets = (path) => [card('switch.demo_micro_plug', 'switch', 'Presa', { widgets: [{ ...MICRO[7], buttonPagePath: path }, MICRO[0]] }, 0, 0)];
  const press = async (page) => {
    await page.locator('.panel-group-more').click();
    await page.locator('.panel-page').locator('.glass-list-row', { hasText: 'Vai alle Stanze' }).click();
    await page.waitForTimeout(500);
  };

  test('goes to a page of the app', async ({ page }) => {
    await openDemo(page, view, widgets('/rooms'));
    await openPanel(page, 'Presa');
    await press(page);
    await expect(page).toHaveURL(/\/rooms/);
  });

  test('ignores an address outside it', async ({ page }) => {
    await openDemo(page, view, widgets('https://example.com/'));
    await openPanel(page, 'Presa');
    await press(page);
    await expect(page).toHaveURL(/\/home/);
  });
});
