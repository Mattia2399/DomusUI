const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';
// Chromium can round the nested grid border to a different device pixel on
// Windows and Linux. Two pixels still represents a flush, unclipped edge.
const STACK_EDGE_TOLERANCE_PX = 2;

const seededLayout = {
  version: 14,
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
  sections: [
    {
      id: 'section-stack-auto',
      kind: 'stack-grid',
      title: 'Stack automatico',
      stackColumnsMode: 'auto',
      stackShowBackground: true,
      stackShowBorder: true,
      stackShowHeader: true,
      layout: { i: 'section-stack-auto', x: 0, y: 0, w: 6, h: 10 },
    },
  ],
  widgets: [
    {
      id: 'light.stack_first',
      kind: 'light',
      title: 'Prima luce',
      entityId: 'light.stack_first',
      parentSectionId: 'section-stack-auto',
      placementPolicy: 'manual',
      status: 'Accesa',
      isOn: true,
      value: 70,
      unit: '%',
      layout: { i: 'light.stack_first', x: 0, y: 0, w: 2, h: 2 },
    },
    {
      id: 'light.stack_second',
      kind: 'light',
      title: 'Seconda luce',
      entityId: 'light.stack_second',
      parentSectionId: 'section-stack-auto',
      placementPolicy: 'manual',
      status: 'Accesa',
      isOn: true,
      value: 55,
      unit: '%',
      layout: { i: 'light.stack_second', x: 4, y: 0, w: 2, h: 2 },
    },
  ],
};

async function readGeometry(page, title = 'Stack automatico') {
  return page.evaluate((stackTitle) => {
    const stack = [...document.querySelectorAll('.sections-grid > .react-grid-item')].find((node) =>
      node.textContent?.includes(stackTitle),
    );
    const canvas = document.querySelector('.sections-grid');
    if (!stack || !canvas) throw new Error(`${stackTitle} non trovato`);
    const stackRect = stack.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const cardRects = [...stack.querySelectorAll('.light-card')].map((node) => node.getBoundingClientRect());
    return {
      canvasWidth: canvasRect.width,
      stack: {
        width: stackRect.width,
        right: stackRect.right,
        bottom: stackRect.bottom,
      },
      cards: cardRects.map((rect) => ({ right: rect.right, bottom: rect.bottom })),
    };
  }, title);
}

async function expectContainedAndFitted(page, { title = 'Stack automatico', cards = 2 } = {}) {
  await page.waitForSelector('.sections-grid');
  await expect.poll(async () => (await readGeometry(page, title)).cards.length).toBe(cards);
  await expect.poll(async () => Math.round((await readGeometry(page, title)).stack.width)).toBeGreaterThan(0);
  await expect.poll(async () => {
    const geometry = await readGeometry(page, title);
    return Math.ceil(Math.max(...geometry.cards.map((card) => card.bottom)) - geometry.stack.bottom);
  }).toBeLessThanOrEqual(1);
  const geometry = await readGeometry(page, title);
  const contentRight = Math.max(...geometry.cards.map((card) => card.right));
  expect(Math.abs(contentRight - geometry.stack.right)).toBeLessThanOrEqual(3);
  for (const card of geometry.cards) {
    expect(card.right).toBeLessThanOrEqual(geometry.stack.right + STACK_EDGE_TOLERANCE_PX);
    expect(card.bottom).toBeLessThanOrEqual(geometry.stack.bottom + STACK_EDGE_TOLERANCE_PX);
  }
}

async function enterEditMode(page) {
  const editButton = page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first();
  await editButton.click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await page.waitForSelector('.sections-grid.is-editing');
}

test('Stack Grid auto fits sparse content without clipping across breakpoints and reload', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 1366, height: 900 });
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
  await expectContainedAndFitted(page);

  await page.setViewportSize({ width: 520, height: 820 });
  await page.waitForTimeout(500);
  await expectContainedAndFitted(page);

  await page.reload();
  await expectContainedAndFitted(page);
  expect(consoleErrors).toEqual([]);
});

test('Stack Grid auto grows vertically on a true 2xl multi-row canvas', async ({ page }) => {
  const stackId = 'section-stack-auto-2xl';
  const widgets = Array.from({ length: 8 }, (_, index) => ({
    id: `light.stack_2xl_${index}`,
    kind: 'light',
    title: `Luce 2xl ${index + 1}`,
    entityId: `light.stack_2xl_${index}`,
    parentSectionId: stackId,
    placementPolicy: 'manual',
    status: 'Accesa',
    isOn: true,
    value: 60,
    unit: '%',
    layout: { i: `light.stack_2xl_${index}`, x: (index % 3) * 2, y: Math.floor(index / 3) * 2, w: 2, h: 2 },
  }));
  const tallLayout = {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
    sections: [
      {
        id: stackId,
        kind: 'stack-grid',
        title: 'Stack alto 2xl',
        stackColumnsMode: 'auto',
        stackShowBackground: true,
        stackShowBorder: true,
        stackShowHeader: true,
        layout: { i: stackId, x: 0, y: 0, w: 6, h: 2 },
      },
    ],
    widgets,
  };

  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.addInitScript(
    ({ key, value, runtimeKey }) => {
      localStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { key: STORAGE_KEY, value: tallLayout, runtimeKey: RUNTIME_KEY },
  );

  await page.goto('/?view=home');
  await expectContainedAndFitted(page, { title: 'Stack alto 2xl', cards: widgets.length });
  await page.reload();
  await expectContainedAndFitted(page, { title: 'Stack alto 2xl', cards: widgets.length });
});

test('Canvas and nested stack follow an in-app width change without a window resize', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
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
  await expectContainedAndFitted(page);
  await page.evaluate(() => {
    const host = document.querySelector('.behance-canvas-shell');
    const canvasColumn = host?.parentElement?.parentElement;
    if (!(canvasColumn instanceof HTMLElement)) throw new Error('Colonna canvas non trovata');
    canvasColumn.style.flex = '0 0 720px';
    canvasColumn.style.width = '720px';
  });

  await expect.poll(async () => page.evaluate(() => {
    const host = document.querySelector('.behance-canvas-shell');
    const grid = document.querySelector('.sections-grid');
    if (!host || !grid) return Number.POSITIVE_INFINITY;
    const hostStyle = window.getComputedStyle(host);
    const contentWidth = host.clientWidth
      - (Number.parseFloat(hostStyle.paddingLeft) || 0)
      - (Number.parseFloat(hostStyle.paddingRight) || 0);
    return Math.abs(contentWidth - grid.getBoundingClientRect().width);
  })).toBeLessThanOrEqual(1);
  await expect.poll(async () => page.evaluate(() => {
    const host = document.querySelector('.behance-canvas-shell');
    if (!host) return Number.POSITIVE_INFINITY;
    const hostRight = host.getBoundingClientRect().right;
    const items = [...document.querySelectorAll('.sections-grid > .react-grid-item')];
    return Math.ceil(Math.max(...items.map((item) => item.getBoundingClientRect().right)) - hostRight);
  })).toBeLessThanOrEqual(1);
  await expectContainedAndFitted(page);
});

test('Stack Grid auto can grow again from a previously narrow outer span', async ({ page }) => {
  const narrowSeed = structuredClone(seededLayout);
  narrowSeed.sections[0].layout.w = 2;

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(
    ({ key, value, runtimeKey }) => {
      localStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { key: STORAGE_KEY, value: narrowSeed, runtimeKey: RUNTIME_KEY },
  );

  await page.goto('/?view=home');
  await expectContainedAndFitted(page);
  await expect.poll(async () => {
    const geometry = await readGeometry(page);
    return geometry.stack.width / geometry.canvasWidth;
  }).toBeGreaterThan(0.6);
});

test('Stack Grid manual mode respects its configured canvas columns', async ({ page }) => {
  const manualSeed = structuredClone(seededLayout);
  manualSeed.sections[0] = {
    ...manualSeed.sections[0],
    title: 'Stack manuale',
    stackColumnsMode: 'manual',
    stackColumns: 3,
  };

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(
    ({ key, value, runtimeKey }) => {
      localStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { key: STORAGE_KEY, value: manualSeed, runtimeKey: RUNTIME_KEY },
  );

  await page.goto('/?view=home');
  await page.waitForSelector('.sections-grid');
  await expect.poll(async () => {
    const geometry = await readGeometry(page, 'Stack manuale');
    return geometry.stack.width / geometry.canvasWidth;
  }).toBeGreaterThan(0.45);
  await expect.poll(async () => {
    const geometry = await readGeometry(page, 'Stack manuale');
    return geometry.stack.width / geometry.canvasWidth;
  }).toBeLessThan(0.55);
});

test('Horizontal Stack respects the same manual canvas column contract', async ({ page }) => {
  const horizontalSeed = structuredClone(seededLayout);
  horizontalSeed.sections[0] = {
    ...horizontalSeed.sections[0],
    kind: 'stack-horizontal',
    title: 'Stack orizzontale',
    stackColumns: 3,
  };

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(
    ({ key, value, runtimeKey }) => {
      localStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    },
    { key: STORAGE_KEY, value: horizontalSeed, runtimeKey: RUNTIME_KEY },
  );

  await page.goto('/?view=home');
  await page.waitForSelector('.sections-grid');
  await expect.poll(async () => {
    const geometry = await readGeometry(page, 'Stack orizzontale');
    return geometry.stack.width / geometry.canvasWidth;
  }).toBeGreaterThan(0.45);
  await expect.poll(async () => {
    const geometry = await readGeometry(page, 'Stack orizzontale');
    return geometry.stack.width / geometry.canvasWidth;
  }).toBeLessThan(0.55);
});

test('Builder switches a stack live between automatic and manual width', async ({ page }) => {
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
  await enterEditMode(page);
  await page.getByRole('group', { name: 'Sezione Stack automatico' }).click({ position: { x: 20, y: 20 } });

  await page.locator('aside.builder-sidebar button').filter({ hasText: 'Auto (da contenuto)' }).click();
  await page.getByRole('option', { name: '3 colonne' }).click();
  await expect.poll(async () => {
    const geometry = await readGeometry(page);
    return geometry.stack.width / geometry.canvasWidth;
  }).toBeGreaterThan(0.45);
  await expect.poll(async () => {
    const geometry = await readGeometry(page);
    return geometry.stack.width / geometry.canvasWidth;
  }).toBeLessThan(0.55);
  await expect.poll(async () => {
    const geometry = await readGeometry(page);
    return Math.ceil(Math.max(...geometry.cards.map((card) => card.right)) - geometry.stack.right);
  }).toBeLessThanOrEqual(STACK_EDGE_TOLERANCE_PX);

  await page.locator('aside.builder-sidebar button').filter({ hasText: '3 colonne' }).click();
  await page.getByRole('option', { name: 'Auto (da contenuto)' }).click();
  await expect.poll(async () => {
    const geometry = await readGeometry(page);
    return geometry.stack.width / geometry.canvasWidth;
  }).toBeGreaterThan(0.6);
  await expect.poll(async () => {
    const geometry = await readGeometry(page);
    return Math.ceil(Math.max(...geometry.cards.map((card) => card.right)) - geometry.stack.right);
  }).toBeLessThanOrEqual(STACK_EDGE_TOLERANCE_PX);
});
