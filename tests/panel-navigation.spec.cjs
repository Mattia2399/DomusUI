const { test, expect } = require('@playwright/test');

/*
 * The structure of the panels. On a phone the header is one row and the row of shortcuts
 * sits at the bottom with its margin: neither moves, whatever is open, and the protagonist
 * has all there is between them. In the column and in the dialog the same controls are
 * groups, with Altro last. Nothing in the protagonist scrolls but a list, and a large
 * version fills it.
 *
 * Alarm and Lock have a structure of their own, and the player is at full screen: not here.
 */

const VIEWS = [
  { name: 'telefono', width: 390, height: 844, surface: 'sheet', touch: true, bottom: 26 },
  { name: 'colonna', width: 1440, height: 900, surface: 'column' },
  { name: 'dialogo', width: 1376, height: 1032, surface: 'dialog' },
];

const GAP = 18;

// The panels already on the new controls: their screens are walked one by one.
const CONVERTED = ['Lampada', 'Faretti', 'Striscia', 'Presa', 'Clima', 'Climatizzatore', 'Termosifone', 'Ventol', 'Umidificatore', 'Deumidificatore', 'Tapparella', 'Termostufa', 'Ingresso', 'Robot', 'Calendario', 'Membri', 'Sensore', 'Temperatura', 'Umidità', 'Finestra', 'Movimento'];

const widget = (id, kind, title, extra, x, y) => ({ id, kind, title, entityId: id, dataSource: 'mock', status: 'on', isOn: true, layout: { i: id, x, y, w: 2, h: 4 }, ...extra });

const HOME = {
  version: 14,
  layoutEngine: 'grid-engine-2',
  gridMetricsVersion: 'v2',
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
  sections: [],
  widgets: [
    widget('light.living_room_lamp', 'light', 'Lampada', { value: 60 }, 0, 0),
    widget('fan.demo_breeze', 'fan', 'Ventola', {}, 2, 0),
    widget('cover.living_room_shutter', 'cover', 'Tapparella', { status: 'open' }, 0, 4),
    widget('climate.living_room', 'climate', 'Clima', { status: 'heat', value: 21 }, 2, 4),
    widget('switch.kitchen_outlet', 'switch', 'Presa', {}, 0, 8),
    widget('camera.front_door', 'camera', 'Ingresso', {}, 2, 8),
    widget('vacuum.demo_robot', 'vacuum', 'Robot', { status: 'docked' }, 0, 12),
    widget('calendar.domus_ui', 'calendar', 'Calendario', {}, 2, 12),
    widget('sensor.nest_wifi_download', 'sensor', 'Sensore', { value: 45 }, 0, 16),
    widget('humidifier.demo_bedroom', 'humidifier', 'Umidificatore', {}, 2, 16),
  ],
};

const LAB = ['members', 'camera', 'vacuum', 'calendar', 'sensor-hot', 'sensor-humid', 'fan.demo_fan', 'humidifier.demo_dehumidifier', 'stove', 'climate-full', 'light-full'];

async function installDemo(page, layout) {
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('__panel_nav') === '1') return;
    sessionStorage.setItem('__panel_nav', '1');
    localStorage.clear();
    localStorage.setItem('domusui.language.v1', 'it');
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.demo.builder.layout.v1', value);
  }, JSON.stringify(layout));
}

const readPanel = (page) => page.evaluate(() => {
  const box = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height, width: rect.width } : null;
  };
  const shell = document.querySelector('.panel-shell');
  const hero = shell.querySelector('.panel-hero');
  const main = hero?.querySelector('.panel-hero-main');
  const surface = shell.closest('.device-context-surface') ?? shell.closest('[role="dialog"]') ?? shell.closest('.liquid-glass-panel') ?? shell.closest('.dv-panel-side');
  const cut = [];
  if (hero && box(hero)) {
    const edge = hero.getBoundingClientRect();
    for (const node of [hero, ...hero.querySelectorAll('*')]) {
      if (node.closest('svg') && node.tagName.toLowerCase() !== 'svg') continue;
      // A list is the one thing that may scroll in there.
      if (node.closest('.is-big-list')) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'absolute') continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const name = `${node.tagName.toLowerCase()}.${String(node.className?.baseVal ?? node.className).split(' ').join('.')}`;
      if (rect.bottom > edge.bottom + 1 || rect.top < edge.top - 1) cut.push(`fuori dal protagonista: ${name}`);
      if (node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0 && style.overflowY !== 'visible') cut.push(`scorre: ${name}`);
    }
  }
  const first = main?.firstElementChild;
  const last = main?.lastElementChild;
  return {
    name: shell.querySelector('.panel-header h2')?.textContent ?? '',
    twoColumns: Boolean(box(shell.querySelector('.panel-shell-main')) && getComputedStyle(shell.querySelector('.panel-shell-main')).display === 'grid'),
    surface: surface ? box(surface) : null,
    header: box(shell.querySelector('.panel-header')),
    close: box(shell.querySelector('.panel-header-close')),
    action: box(shell.querySelector('.panel-header-action')),
    notice: box(shell.querySelector('.panel-header + :not(.panel-shell-main):not(.panel-shell-free)')),
    hero: box(hero),
    main: box(main),
    isList: Boolean(main?.querySelector('.is-big-list')),
    contentTop: first?.getBoundingClientRect().top ?? null,
    contentBottom: last?.getBoundingClientRect().bottom ?? null,
    nav: box(shell.querySelector('.panel-nav')),
    page: box(shell.querySelector('.panel-page')),
    groups: box(shell.querySelector('.panel-groups')),
    groupsLast: shell.querySelector('.panel-groups')?.lastElementChild?.className ?? '',
    more: box(shell.querySelector('.panel-group-more')),
    slider: box(hero?.querySelector('.panel-hero-main > .glass-vslider')),
    labels: [...shell.querySelectorAll('.panel-nav .glass-shortcut-label')].map((node) => node.textContent),
    scroller: (() => {
      const node = shell.querySelector('.panel-shell-main');
      return node ? { scroll: node.scrollHeight, client: node.clientHeight, overflow: getComputedStyle(node).overflowY } : null;
    })(),
    cut,
  };
});

function structureProblems(read, view) {
  const out = [];
  const near = (value, expected, what, margin = 1) => {
    if (Math.abs(value - expected) > margin) out.push(`${what}: ${value.toFixed(1)} invece di ${expected}`);
  };
  if (!read.header) return ['manca l\'intestazione'];
  near(read.close.height, 44, 'altezza della X');
  if (read.action) {
    near(read.action.height, 44, 'altezza dell\'azione in alto');
    near(read.action.top, read.close.top, 'azione e X non sulla stessa riga');
    if (read.action.left > read.close.left) out.push('l\'azione non sta a sinistra');
  }
  if (!read.hero) return out;
  out.push(...read.cut);
  if (read.more && !read.groupsLast.includes('panel-group-more')) out.push('la riga Altro non è l\'ultima');
  if (view.surface === 'column') {
    if (read.nav) out.push('nella colonna c\'è la fila');
    if (read.scroller.overflow !== 'auto') out.push('la colonna non scorre');
    return out;
  }
  if (read.twoColumns) {
    if (read.nav) out.push('nel dialogo c\'è la fila');
    if (read.slider) {
      near(read.slider.height, 300, 'altezza dello slider');
      near(read.slider.width, 128, 'larghezza dello slider');
    }
    return out;
  }
  const above = read.notice ?? read.header;
  near(read.hero.top - above.bottom, GAP, 'spazio sopra il protagonista');
  if (read.nav) {
    near(read.nav.top - read.hero.bottom, GAP, 'spazio tra protagonista e fila');
    near(read.surface.bottom - read.nav.bottom, view.bottom, 'margine della fila dal fondo', 1.5);
  } else {
    near(read.surface.bottom - read.hero.bottom, view.bottom, 'margine del protagonista dal fondo', 1.5);
  }
  if (read.slider) {
    near(read.slider.width, 148, 'larghezza dello slider');
    if (read.hero.height >= 300) near(read.slider.height, 300, 'altezza dello slider');
  }
  return out;
}

const same = (a, b) => Boolean(a && b) && Math.abs(a.top - b.top) <= 1 && Math.abs(a.bottom - b.bottom) <= 1;

/** Every shortcut of a converted panel, on a phone: what it shows, and that nothing around it moves. */
async function walkRow(page, label, wrong) {
  const before = await readPanel(page);
  if (!before.nav) return;
  const shortcuts = page.locator('.panel-nav .glass-shortcut');
  const total = await shortcuts.count();
  for (let index = 0; index < total; index += 1) {
    const shortcut = shortcuts.nth(index);
    const name = await shortcut.locator('.glass-shortcut-label').textContent();
    if (await shortcut.isDisabled()) continue;
    if ((await shortcut.getAttribute('aria-haspopup')) === 'true') {
      await shortcut.click();
      await page.waitForTimeout(120);
      const read = await readPanel(page);
      if (!same(read.header, before.header)) wrong.push(`${label} · ${name}: l'intestazione si è spostata`);
      if (read.nav) wrong.push(`${label} · ${name}: la fila resta con Altro aperto`);
      await page.locator('.panel-page-back').click();
      await page.waitForTimeout(120);
      continue;
    }
    await shortcut.click();
    await page.waitForTimeout(120);
    const back = page.locator('.panel-hero-back');
    if (!(await back.count())) continue;
    const read = await readPanel(page);
    if (!same(read.header, before.header)) wrong.push(`${label} · ${name}: l'intestazione si è spostata`);
    if (!same(read.nav, before.nav)) wrong.push(`${label} · ${name}: la fila si è spostata`);
    for (const problem of read.cut) wrong.push(`${label} · ${name}: ${problem}`);
    // The large version fills the space: no empty room above and below beyond the margins.
    if (read.contentTop !== null && read.main && !read.isList) {
      const empty = (read.contentTop - read.main.top) + (read.main.bottom - read.contentBottom);
      if (empty > read.main.height * 0.45) wrong.push(`${label} · ${name}: la versione grande lascia ${Math.round(empty)} px vuoti su ${Math.round(read.main.height)}`);
    }
    await back.click();
    await page.waitForTimeout(120);
  }
}

const closeThePanel = async (page) => {
  await page.locator('.panel-header-close').first().click({ timeout: 2_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
};

async function measureOpen(page, view, where, label, found) {
  await page.waitForTimeout(450);
  const read = await readPanel(page);
  const problems = structureProblems(read, view);
  // The column scrolls when it does not fit, under a header that stays.
  if (view.surface === 'column' && read.scroller && read.scroller.scroll > read.scroller.client) {
    await page.locator('.panel-shell-main').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await page.waitForTimeout(80);
    const scrolled = await readPanel(page);
    if (!same(scrolled.header, read.header)) problems.push('l\'intestazione scorre con la colonna');
    if (read.more && scrolled.more && Math.abs(scrolled.surface.bottom - scrolled.more.bottom) > 60) problems.push('la riga Altro non arriva in fondo alla colonna');
    await page.locator('.panel-shell-main').evaluate((node) => {
      node.scrollTop = 0;
    });
  }
  if (view.surface === 'sheet' && CONVERTED.some((name) => read.name.includes(name))) await walkRow(page, read.name, problems);
  found.push({ where, label: label ?? read.name, problems });
}

async function fromCards(page, view, found) {
  const cards = page.locator('.dv-tile-body');
  const total = await cards.count();
  for (let index = 0; index < total; index += 1) {
    const card = cards.nth(index);
    const label = (await card.getAttribute('aria-label')) ?? '';
    if (/player/i.test(label) || /serratura/i.test(label) || /allarme/i.test(label)) continue;
    await card.evaluate((node) => node.click());
    const shown = await page.waitForSelector('.panel-shell', { timeout: 8_000 }).catch(() => null);
    if (!shown) continue;
    await measureOpen(page, view, view.name, null, found);
    await closeThePanel(page);
  }
}

async function fromLab(page, view, found) {
  await page.goto('/devices-lab');
  const board = page.getByTestId('devices-lab-light');
  await board.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await board.getByRole('button', { name: view.surface === 'column' ? 'side' : view.surface, exact: true }).click();
  for (const name of LAB) {
    await board.getByRole('button', { name, exact: true }).evaluate((node) => node.click());
    await page.waitForSelector('.panel-shell', { timeout: 15_000 });
    await measureOpen(page, view, `${view.name} (lab)`, name, found);
    await closeThePanel(page);
  }
}

for (const view of VIEWS) {
  test.describe(`${view.name} ${view.width}x${view.height}`, () => {
    test.use({ viewport: { width: view.width, height: view.height }, hasTouch: Boolean(view.touch), locale: 'it-IT' });
    test.setTimeout(300_000);

    test('header and row stay, the protagonist has all the room and nothing in it scrolls', async ({ page }) => {
      await installDemo(page, HOME);
      const found = [];
      if (view.surface !== 'dialog') {
        await page.goto('/home');
        await page.waitForSelector('.dv-tile-body', { timeout: 60_000 });
        await page.waitForTimeout(1_200);
        await fromCards(page, view, found);
      }
      if (view.surface !== 'column') {
        await page.goto('/rooms');
        await page.waitForSelector('.dv-tile-body', { timeout: 60_000 });
        await page.waitForTimeout(1_200);
        await fromCards(page, view, found);
      }
      await fromLab(page, view, found);
      const wrong = found.filter((entry) => entry.problems.length > 0).map((entry) => `${entry.where} · ${entry.label}: ${entry.problems.join('; ')}`);
      console.log(`${view.name}: ${found.length} pannelli misurati`);
      expect(found.length).toBeGreaterThan(8);
      expect(wrong).toEqual([]);
    });
  });
}
