const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const RUNTIME_KEY = 'ha.dashboard.runtimeMode.v1';
const EXPECT_RENDERER = process.env.VITE_GRID_ENGINE_2_RENDERER === 'true';

function widget(id, kind, title, layout, parentSectionId) {
  return {
    id,
    kind,
    title,
    entityId: `${kind}.${id.replaceAll('.', '_')}`,
    dataSource: 'mock',
    placementPolicy: 'manual',
    status: kind === 'light' ? 'Accesa' : 'Attivo',
    isOn: true,
    value: kind === 'climate' ? 22 : 64,
    unit: kind === 'climate' ? 'C' : '%',
    ...(parentSectionId ? { parentSectionId } : null),
    layout: { i: id, ...layout },
  };
}

function fixtureWithSpecialSections() {
  const sections = [
    {
      id: 'section-greeting', kind: 'greeting', title: 'Greeting Renderer', showWeather: true,
      layout: { i: 'section-greeting', x: 0, y: 0, w: 12, h: 2 },
    },
    {
      id: 'section-weather', kind: 'weather', title: 'Weather Renderer', weatherUnit: 'C',
      layout: { i: 'section-weather', x: 0, y: 2, w: 4, h: 2 },
    },
    {
      id: 'section-scenes', kind: 'scenes', title: 'Scenes Renderer', scenes: ['music', 'night'],
      scenesShowBackground: true, scenesShowBorder: true,
      layout: { i: 'section-scenes', x: 4, y: 2, w: 8, h: 2 },
    },
    {
      id: 'stack-vertical', kind: 'stack-vertical', title: 'Vertical Renderer Stack', stackColumns: 2,
      stackColumnsMode: 'manual', stackShowBackground: true, stackShowBorder: true, stackShowHeader: true,
      layout: { i: 'stack-vertical', x: 0, y: 4, w: 4, h: 7 },
    },
    {
      id: 'stack-horizontal', kind: 'stack-horizontal', title: 'Horizontal Renderer Stack', stackColumns: 2,
      stackColumnsMode: 'manual', stackShowBackground: true, stackShowBorder: true, stackShowHeader: true,
      layout: { i: 'stack-horizontal', x: 4, y: 4, w: 4, h: 7 },
    },
    {
      id: 'stack-grid', kind: 'stack-grid', title: 'Grid Renderer Stack', stackColumns: 2,
      stackColumnsMode: 'manual', stackShowBackground: true, stackShowBorder: true, stackShowHeader: true,
      layout: { i: 'stack-grid', x: 8, y: 4, w: 4, h: 7 },
    },
  ];
  const rootKinds = ['light', 'switch', 'fan', 'climate', 'cover', 'sensor'];
  const rootWidgets = Array.from({ length: 16 }, (_, index) => {
    const kind = rootKinds[index % rootKinds.length];
    return widget(
      `root.${index + 1}`,
      kind,
      `${kind[0].toUpperCase()}${kind.slice(1)} Root ${index + 1}`,
      { x: (index % 6) * 2, y: 12 + Math.floor(index / 6) * 3, w: 2, h: 2 },
    );
  });
  const stackWidgets = [
    widget('stack.vertical.light', 'light', 'Vertical Stack Light', { x: 0, y: 0, w: 2, h: 2 }, 'stack-vertical'),
    widget('stack.vertical.sensor', 'sensor', 'Vertical Stack Sensor', { x: 0, y: 2, w: 2, h: 2 }, 'stack-vertical'),
    widget('stack.horizontal.light', 'light', 'Horizontal Stack Light', { x: 0, y: 0, w: 2, h: 2 }, 'stack-horizontal'),
    widget('stack.horizontal.sensor', 'sensor', 'Horizontal Stack Sensor', { x: 2, y: 0, w: 2, h: 2 }, 'stack-horizontal'),
    widget('stack.grid.light', 'light', 'Grid Stack Light', { x: 0, y: 0, w: 2, h: 2 }, 'stack-grid'),
    widget('stack.grid.sensor', 'sensor', 'Grid Stack Sensor', { x: 2, y: 0, w: 2, h: 2 }, 'stack-grid'),
  ];
  return {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
    sections,
    widgets: [...rootWidgets, ...stackWidgets],
  };
}

function densityFixture(count) {
  return {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
    sections: [],
    widgets: Array.from({ length: count }, (_, index) => widget(
      `density.${index + 1}`,
      'sensor',
      `Density ${index + 1}`,
      { x: (index % 6) * 2, y: Math.floor(index / 6) * 2, w: 2, h: 2 },
    )),
  };
}

function dynamicLightFixture() {
  const breakpoints = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  const ids = [
    'dynamic.light',
    'dynamic.below-one',
    'dynamic.below-two',
    'dynamic.neighbor-wide',
    ...Array.from({ length: 18 }, (_, index) => `dynamic.fill-${index + 1}`),
  ];
  const layoutFor = (cols) => {
    const span = cols <= 4 ? 1 : 2;
    const neighborWidth = Math.max(1, Math.min(cols - span, cols <= 4 ? 1 : 3));
    const fixed = [
      { i: ids[0], x: 0, y: 0, w: span, h: 1 },
      { i: ids[1], x: 0, y: 1, w: span, h: 1 },
      { i: ids[2], x: 0, y: 2, w: span, h: 1 },
      { i: ids[3], x: span, y: 0, w: neighborWidth, h: 2 },
    ];
    const perRow = Math.max(1, Math.floor(cols / span));
    return [
      ...fixed,
      ...ids.slice(4).map((id, index) => ({
        i: id,
        x: (index % perRow) * span,
        y: 4 + Math.floor(index / perRow),
        w: span,
        h: 1,
      })),
    ];
  };
  const desktop = layoutFor(breakpoints.xl);
  const byId = new Map(desktop.map((item) => [item.i, item]));
  const light = {
    ...widget(ids[0], 'light', 'Dynamic Light', byId.get(ids[0])),
    isOn: false,
    status: 'Spenta',
    value: 0,
  };
  const named = [
    widget(ids[1], 'sensor', 'Immediately Below', byId.get(ids[1])),
    widget(ids[2], 'sensor', 'Second Below', byId.get(ids[2])),
    widget(ids[3], 'sensor', 'Different Size Neighbor', byId.get(ids[3])),
  ];
  const fillers = ids.slice(4).map((id, index) =>
    widget(id, 'sensor', `Dynamic Fill ${index + 1}`, byId.get(id)),
  );
  return {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root: Object.fromEntries(
        Object.entries(breakpoints).map(([breakpoint, cols]) => [breakpoint, layoutFor(cols)]),
      ),
    },
    sections: [],
    widgets: [light, ...named, ...fillers],
  };
}

async function installFixture(page, value) {
  await page.addInitScript(
    ({ key, runtimeKey, layout }) => {
      localStorage.clear();
      localStorage.setItem(runtimeKey, 'demo');
      localStorage.setItem(key, JSON.stringify(layout));
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
      const originalSetItem = Storage.prototype.setItem;
      window.__rendererLayoutWrites = [];
      window.__trackRendererLayoutWrites = false;
      Storage.prototype.setItem = function observedSetItem(storageKey, storageValue) {
        if (window.__trackRendererLayoutWrites && storageKey === key) {
          window.__rendererLayoutWrites.push(storageValue);
        }
        return originalSetItem.call(this, storageKey, storageValue);
      };
    },
    { key: STORAGE_KEY, runtimeKey: RUNTIME_KEY, layout: value },
  );
}

async function waitForRootRenderer(page) {
  const custom = page.locator('[data-grid-engine-root-renderer="grid-engine-2"]');
  if (EXPECT_RENDERER) {
    await expect(custom).toHaveCount(1);
  } else {
    await expect(custom).toHaveCount(0);
    await expect(page.locator('.sections-grid:not([data-grid-engine-root-renderer])')).toHaveCount(1);
  }
  await expect(page.locator('.sections-grid > .react-grid-item')).not.toHaveCount(0);
  await page.waitForTimeout(350);
}

async function customGeometry(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-grid-engine-root-renderer="grid-engine-2"]');
    if (!canvas) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const width = Number(canvas.getAttribute('data-canvas-width'));
    const cols = Number(canvas.getAttribute('data-cols'));
    const breakpoint = canvas.getAttribute('data-breakpoint');
    const gap = 16;
    const paddingY = breakpoint === '2xl' || breakpoint === 'xl' ? 14
      : breakpoint === 'lg' ? 12
        : breakpoint === 'md' ? 10 : 4;
    const paddingX = breakpoint === 'xs' ? 2 : 0;
    const columnWidth = (width - gap * (cols - 1) - paddingX * 2) / cols;
    const items = [...canvas.querySelectorAll(':scope > [data-grid-engine-root-item]')].map((node) => {
      const rect = node.getBoundingClientRect();
      const x = Number(node.getAttribute('data-grid-x'));
      const y = Number(node.getAttribute('data-grid-y'));
      const w = Number(node.getAttribute('data-grid-w'));
      const h = Number(node.getAttribute('data-grid-h'));
      const left = Math.round((columnWidth + gap) * x + paddingX);
      const right = Math.round((columnWidth + gap) * (x + w) + paddingX);
      const top = Math.round((48 + gap) * y + paddingY);
      const bottom = Math.round((48 + gap) * (y + h) + paddingY);
      return {
        id: node.getAttribute('data-grid-engine-root-item'),
        cells: { x, y, w, h },
        actual: {
          left: Math.round(rect.left - canvasRect.left),
          top: Math.round(rect.top - canvasRect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        expected: { left, top, width: right - left - gap, height: bottom - top - gap },
      };
    });
    const usedRows = Math.max(0, ...items.map((item) => {
      const node = canvas.querySelector(`[data-grid-engine-root-item="${CSS.escape(item.id)}"]`);
      return Number(node?.getAttribute('data-grid-y')) + Number(node?.getAttribute('data-grid-h'));
    }));
    const expectedHeight = usedRows === 0 ? 0 : usedRows * 48 + Math.max(0, usedRows - 1) * gap + paddingY * 2;
    return {
      breakpoint,
      cols,
      width,
      actualWidth: Math.round(canvasRect.width),
      actualHeight: Math.round(canvasRect.height),
      expectedHeight,
      horizontalOverflow: canvas.scrollWidth - canvas.clientWidth,
      items,
    };
  });
}

const DYNAMIC_ROOT_LABELS = [
  ['dynamic.light', 'Dynamic Light'],
  ['dynamic.below-one', 'Immediately Below'],
  ['dynamic.below-two', 'Second Below'],
  ['dynamic.neighbor-wide', 'Different Size Neighbor'],
  ...Array.from({ length: 18 }, (_, index) => [`dynamic.fill-${index + 1}`, `Dynamic Fill ${index + 1}`]),
].sort((first, second) => second[1].length - first[1].length);

async function dynamicRootGeometry(page) {
  return page.evaluate((labels) => {
    const canvas = document.querySelector('.sections-grid');
    if (!canvas) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const width = canvasRect.width;
    const custom = canvas.hasAttribute('data-grid-engine-root-renderer');
    const breakpoint = custom
      ? canvas.getAttribute('data-breakpoint')
      : width >= 1536 ? '2xl' : width >= 1280 ? 'xl' : width >= 1024 ? 'lg' : width >= 768 ? 'md' : width >= 640 ? 'sm' : 'xs';
    const cols = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 }[breakpoint];
    const gap = 16;
    const paddingY = breakpoint === '2xl' || breakpoint === 'xl' ? 14
      : breakpoint === 'lg' ? 12
        : breakpoint === 'md' ? 10 : 4;
    const paddingX = breakpoint === 'xs' ? 2 : 0;
    const columnWidth = (width - gap * (cols - 1) - paddingX * 2) / cols;
    const roots = [...canvas.querySelectorAll(':scope > .react-grid-item')];
    const items = roots.map((node, index) => {
      const text = node.textContent ?? '';
      const labelEntry = labels.find(([, label]) => text.includes(label));
      const rect = node.getBoundingClientRect();
      const actual = {
        left: Math.round(rect.left - canvasRect.left),
        top: Math.round(rect.top - canvasRect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      const cells = custom
        ? {
            x: Number(node.getAttribute('data-grid-x')),
            y: Number(node.getAttribute('data-grid-y')),
            w: Number(node.getAttribute('data-grid-w')),
            h: Number(node.getAttribute('data-grid-h')),
          }
        : {
            x: Math.round((actual.left - paddingX) / (columnWidth + gap)),
            y: Math.round((actual.top - paddingY) / (48 + gap)),
            w: Math.round((actual.width + gap) / (columnWidth + gap)),
            h: Math.round((actual.height + gap) / (48 + gap)),
          };
      const left = Math.round((columnWidth + gap) * cells.x + paddingX);
      const right = Math.round((columnWidth + gap) * (cells.x + cells.w) + paddingX);
      const top = Math.round((48 + gap) * cells.y + paddingY);
      const bottom = Math.round((48 + gap) * (cells.y + cells.h) + paddingY);
      return {
        id: labelEntry?.[0] ?? `unknown-${index}`,
        cells,
        actual,
        expected: { left, top, width: right - left - gap, height: bottom - top - gap },
      };
    });
    const collisions = [];
    for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex += 1) {
        const first = items[firstIndex];
        const second = items[secondIndex];
        const overlapsX = Math.min(first.actual.left + first.actual.width, second.actual.left + second.actual.width) -
          Math.max(first.actual.left, second.actual.left) > 0.5;
        const overlapsY = Math.min(first.actual.top + first.actual.height, second.actual.top + second.actual.height) -
          Math.max(first.actual.top, second.actual.top) > 0.5;
        if (overlapsX && overlapsY) collisions.push([first.id, second.id]);
      }
    }
    const lightRoot = roots.find((node) => node.textContent?.includes('Dynamic Light'));
    const lightRect = lightRoot?.getBoundingClientRect();
    const lightContent = lightRoot?.querySelector('.light-card');
    const contentRect = lightContent?.getBoundingClientRect();
    const controls = lightRoot?.querySelector('.light-card__controls');
    const controlsRect = controls?.getBoundingClientRect();
    const controlsVisible = Boolean(
      controls &&
      controlsRect &&
      getComputedStyle(controls).display !== 'none' &&
      controlsRect.width > 0 &&
      controlsRect.height > 0
    );
    const inside = (inner, outer) => Boolean(inner && outer &&
      inner.left >= outer.left - 1 && inner.top >= outer.top - 1 &&
      inner.right <= outer.right + 1 && inner.bottom <= outer.bottom + 1);
    return {
      custom,
      breakpoint,
      cols,
      items,
      collisions,
      light: {
        contentWithinRoot: inside(contentRect, lightRect),
        controlsVisible,
        controlsWithinRoot: controlsVisible ? inside(controlsRect, lightRect) : true,
      },
    };
  }, DYNAMIC_ROOT_LABELS);
}

function dynamicCellSnapshot(geometry) {
  return geometry.items
    .map(({ id, cells }) => ({ id, cells }))
    .sort((first, second) => first.id.localeCompare(second.id));
}

function changedDynamicPositionIds(before, after) {
  const beforeById = new Map(before.map((item) => [item.id, item.cells]));
  return after
    .filter((item) => {
      const previous = beforeById.get(item.id);
      return previous && (previous.x !== item.cells.x || previous.y !== item.cells.y);
    })
    .map((item) => item.id)
    .sort();
}

function expectedDynamicExpansionChain(collapsed) {
  const working = collapsed.map(({ id, cells }) => ({ id, cells: { ...cells } }));
  const light = working.find((item) => item.id === 'dynamic.light');
  light.cells.h = 2;
  const pending = [light];
  const moved = new Set();
  const overlaps = (first, second) =>
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y;

  while (pending.length > 0) {
    const blocker = pending.shift();
    for (const candidate of working) {
      if (candidate.id === blocker.id || !overlaps(blocker.cells, candidate.cells)) continue;
      const nextY = blocker.cells.y + blocker.cells.h;
      if (candidate.cells.y >= nextY) continue;
      candidate.cells.y = nextY;
      moved.add(candidate.id);
      pending.push(candidate);
    }
  }

  return [...moved].sort();
}

function expectLocalDynamicExpansion(collapsed, expanded) {
  const expectedMoved = expectedDynamicExpansionChain(collapsed);
  expect(changedDynamicPositionIds(collapsed, expanded)).toEqual(expectedMoved);
  const expandedById = new Map(expanded.map((item) => [item.id, item.cells]));
  for (const before of collapsed) {
    const after = expandedById.get(before.id);
    expect(after.x).toBe(before.cells.x);
    expect(after.y).toBe(before.cells.y + (expectedMoved.includes(before.id) ? 1 : 0));
  }
}

async function waitForDynamicRootGeometry(page, { expanded, breakpoint }) {
  let latest = null;
  await expect.poll(async () => {
    latest = await dynamicRootGeometry(page);
    const light = latest?.items.find((item) => item.id === 'dynamic.light');
    const domMatchesCells = latest?.items.every((item) =>
      ['left', 'top', 'width', 'height'].every((edge) =>
        Math.abs(item.actual[edge] - item.expected[edge]) <= 1,
      ),
    );
    return {
      breakpoint: latest?.breakpoint,
      custom: latest?.custom,
      count: latest?.items.length,
      collisions: latest?.collisions.length,
      lightHeight: light?.cells.h,
      controlsVisible: latest?.light.controlsVisible,
      domMatchesCells,
    };
  }, { timeout: 15_000, intervals: [100, 250, 500] }).toEqual({
    breakpoint,
    custom: EXPECT_RENDERER,
    count: 22,
    collisions: 0,
    lightHeight: expanded ? 2 : 1,
    controlsVisible: expanded,
    domMatchesCells: true,
  });
  return latest;
}

function expectDynamicGeometry(geometry, { expanded, breakpoint }) {
  expect(geometry).not.toBeNull();
  expect(geometry.items).toHaveLength(22);
  expect(new Set(geometry.items.map((item) => item.id)).size).toBe(22);
  expect(geometry.collisions).toEqual([]);
  expect(geometry.custom).toBe(EXPECT_RENDERER);
  expect(geometry.breakpoint).toBe(breakpoint);
  for (const item of geometry.items) {
    for (const edge of ['left', 'top', 'width', 'height']) {
      expect(Math.abs(item.actual[edge] - item.expected[edge])).toBeLessThanOrEqual(1);
    }
  }
  const light = geometry.items.find((item) => item.id === 'dynamic.light');
  expect(light.cells.h).toBe(expanded ? 2 : 1);
  expect(geometry.light.contentWithinRoot).toBe(true);
  expect(geometry.light.controlsVisible).toBe(expanded);
  expect(geometry.light.controlsWithinRoot).toBe(true);
}

async function enterEditMode(page) {
  await page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first().click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await page.waitForSelector('.sections-grid.is-editing');
}

async function leaveEditMode(page) {
  await page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first().click();
  const confirmation = page.getByRole('dialog', { name: 'Uscire dalla modalità modifica?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: /^(Salva ed esci|Esci)$/ }).click();
  await page.waitForSelector('.sections-grid:not(.is-editing)');
}

async function measureResize(page, width, height) {
  const started = await page.evaluate(() => performance.now());
  await page.setViewportSize({ width, height });
  await page.waitForFunction(
    (expectedCustom) => {
      const canvas = document.querySelector('.sections-grid');
      if (!canvas || canvas.getBoundingClientRect().width <= 0) return false;
      return expectedCustom ? canvas.hasAttribute('data-grid-engine-root-renderer') : !canvas.hasAttribute('data-grid-engine-root-renderer');
    },
    EXPECT_RENDERER,
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate((start) => performance.now() - start, started);
}

test(`root renderer ${EXPECT_RENDERER ? 'experimental' : 'legacy'} preserves the real 22-root Home`, async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors = [];
  const rendererWarnings = [];
  const apiRequests = [];
  page.on('console', async (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.type() === 'warning' && message.text().includes('DomusUI:grid-engine2:renderer')) {
      rendererWarnings.push(message.text());
      const args = await Promise.all(message.args().map(async (argument) => argument.jsonValue()));
      console.log('[grid-engine-2 browser warning]', JSON.stringify(args));
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || request.resourceType() === 'websocket') apiRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1920, height: 1100 });
  await installFixture(page, fixtureWithSpecialSections());
  await page.goto('/?view=home');
  await waitForRootRenderer(page);

  await expect(page.locator('.sections-grid > .react-grid-item')).toHaveCount(22);
  await expect(page.getByRole('heading', { name: /Buongiorno|Buon pomeriggio|Buonasera|Buonanotte/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Apri pannello meteo' })).toHaveCount(1);
  for (const label of ['Scenes Renderer', 'Vertical Renderer Stack', 'Horizontal Renderer Stack', 'Grid Renderer Stack', 'Light Root 1']) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(1);
  }
  for (const label of ['Vertical Renderer Stack', 'Horizontal Renderer Stack', 'Grid Renderer Stack']) {
    const stackRoot = page.locator('.sections-grid > .react-grid-item').filter({ hasText: label });
    await expect(stackRoot).toHaveCount(1);
    await expect(stackRoot.locator('.light-card')).toHaveCount(1);
  }

  const initialCustomGeometry = EXPECT_RENDERER ? await customGeometry(page) : null;
  if (initialCustomGeometry) {
    expect(initialCustomGeometry.items).toHaveLength(22);
    for (const item of initialCustomGeometry.items) expect(item.actual).toEqual(item.expected);
    expect(Math.abs(initialCustomGeometry.actualWidth - initialCustomGeometry.width)).toBeLessThanOrEqual(1);
    expect(initialCustomGeometry.actualHeight).toBe(initialCustomGeometry.expectedHeight);
    expect(initialCustomGeometry.horizontalOverflow).toBeLessThanOrEqual(1);
  }

  await page.evaluate(() => {
    window.__rendererLayoutWrites.length = 0;
    window.__trackRendererLayoutWrites = true;
  });
  const light = page.locator('.sections-grid > .react-grid-item').filter({ hasText: 'Light Root 1' }).first();
  const slider = light.getByRole('slider', { name: 'Luminosità Light Root 1' });
  const sliderValueBefore = await slider.inputValue();
  await slider.focus();
  await slider.press('ArrowLeft');
  await expect.poll(() => slider.inputValue()).not.toBe(sliderValueBefore);
  const toggle = light.locator('.light-card__toggle');
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await expect(toggle).toBeFocused();
  const stateBefore = await light.locator('.light-card').getAttribute('data-light-state');
  await toggle.click();
  await expect.poll(() => light.locator('.light-card').getAttribute('data-light-state')).not.toBe(stateBefore);

  await page.getByRole('button', { name: 'Apri Sensor Root 6' }).click();
  const devicePanelHeading = page.getByRole('heading', { name: 'Sensor Root 6' });
  await expect(devicePanelHeading).toBeVisible();
  await page.getByRole('button', { name: 'Chiudi pannello contestuale' }).click();
  await expect(devicePanelHeading).toHaveCount(0);
  await page.waitForTimeout(350);
  const responsiveBaselineGeometry = EXPECT_RENDERER ? await customGeometry(page) : null;

  const responsiveSamples = [];
  const observedBreakpoints = new Map();
  const responsiveObservations = [];
  for (const [width, height] of [
    [2200, 1100], [1920, 1080], [1700, 1020], [1600, 1000],
    [1200, 940], [760, 850], [500, 800], [1920, 1100],
  ]) {
    responsiveSamples.push(await measureResize(page, width, height));
    await page.waitForTimeout(350);
    if (EXPECT_RENDERER) {
      const geometry = await customGeometry(page);
      expect(geometry, JSON.stringify(rendererWarnings)).not.toBeNull();
      observedBreakpoints.set(geometry.breakpoint, geometry.cols);
      responsiveObservations.push({ viewport: width, canvas: geometry.width, breakpoint: geometry.breakpoint });
      for (const item of geometry.items) expect(item.actual).toEqual(item.expected);
      expect(geometry.actualHeight).toBe(geometry.expectedHeight);
      expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
    }
  }
  if (EXPECT_RENDERER) {
    console.log('[grid-engine-2 root renderer breakpoints]', JSON.stringify(responsiveObservations));
    expect(Object.fromEntries(observedBreakpoints)).toEqual({ '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 });
    const returnedGeometry = await customGeometry(page);
    const byId = (geometry) => geometry.items
      .map(({ id, cells }) => ({ id, cells }))
      .sort((first, second) => first.id.localeCompare(second.id));
    expect(byId(returnedGeometry)).toEqual(
      byId(responsiveBaselineGeometry),
    );
  }
  expect(await page.evaluate(() => window.__rendererLayoutWrites)).toEqual([]);
  expect(apiRequests).toEqual([]);

  await enterEditMode(page);
  await expect(page.locator('[data-grid-engine-root-renderer]')).toHaveCount(0);
  await expect(page.locator('.sections-grid.is-editing')).toHaveCount(1);
  await leaveEditMode(page);
  await waitForRootRenderer(page);
  await expect(page.locator('.sections-grid > .react-grid-item')).toHaveCount(22);

  console.log('[grid-engine-2 root renderer resize]', JSON.stringify({
    renderer: EXPECT_RENDERER ? 'grid-engine-2' : 'legacy',
    samplesMs: responsiveSamples.map((value) => Number(value.toFixed(1))),
  }));
  expect(rendererWarnings).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test(`root renderer ${EXPECT_RENDERER ? 'experimental' : 'legacy'} handles 30 root cards without duplication`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1100 });
  await installFixture(page, densityFixture(30));
  const started = Date.now();
  await page.goto('/?view=home');
  await waitForRootRenderer(page);
  const totalMs = Date.now() - started;

  await expect(page.locator('.sections-grid > .react-grid-item')).toHaveCount(30);
  await expect(page.getByText('Density 1', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Density 30', { exact: true })).toHaveCount(1);
  if (EXPECT_RENDERER) {
    const geometry = await customGeometry(page);
    expect(geometry.items).toHaveLength(30);
    for (const item of geometry.items) expect(item.actual).toEqual(item.expected);
    expect(geometry.actualHeight).toBe(geometry.expectedHeight);
  }
  console.log('[grid-engine-2 root renderer density]', JSON.stringify({
    renderer: EXPECT_RENDERER ? 'grid-engine-2' : 'legacy',
    roots: 30,
    navigationAndRenderMs: totalMs,
  }));
});

test(`root renderer ${EXPECT_RENDERER ? 'experimental' : 'legacy'} keeps dynamic Light expansion collision-free`, async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors = [];
  const apiRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || request.resourceType() === 'websocket') apiRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1920, height: 1100 });
  await installFixture(page, dynamicLightFixture());
  await page.goto('/?view=home');
  await waitForRootRenderer(page);
  await page.evaluate(() => {
    const modes = [];
    const recordMode = () => {
      const canvas = document.querySelector('.sections-grid');
      if (!canvas) return;
      const mode = canvas.hasAttribute('data-grid-engine-root-renderer') ? 'grid-engine-2' : 'legacy';
      if (modes.at(-1) !== mode) modes.push(mode);
    };
    recordMode();
    const observer = new MutationObserver(recordMode);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-grid-engine-root-renderer'],
      childList: true,
      subtree: true,
    });
    window.__stopRootRendererModeObserver = () => {
      observer.disconnect();
      recordMode();
      return modes;
    };
  });

  const rootByText = (text) => page.locator('.sections-grid > .react-grid-item').filter({ hasText: text }).first();
  const lightRoot = rootByText('Dynamic Light');
  await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', 'off');
  let geometry = await waitForDynamicRootGeometry(page, { expanded: false, breakpoint: 'xl' });
  expectDynamicGeometry(geometry, { expanded: false, breakpoint: 'xl' });
  const desktopCollapsed = dynamicCellSnapshot(geometry);

  await page.evaluate(() => {
    window.__rendererLayoutWrites.length = 0;
    window.__trackRendererLayoutWrites = true;
  });
  const toggleLight = async (expanded, breakpoint) => {
    const toggle = lightRoot.locator('.light-card__toggle');
    await toggle.focus();
    await toggle.press('Enter');
    await expect(lightRoot.locator('.light-card')).toHaveAttribute('data-light-state', expanded ? 'on' : 'off');
    if (EXPECT_RENDERER) await expect(lightRoot).toHaveAttribute('data-grid-h', expanded ? '2' : '1');
    return waitForDynamicRootGeometry(page, { expanded, breakpoint });
  };

  geometry = await toggleLight(true, 'xl');
  expectDynamicGeometry(geometry, { expanded: true, breakpoint: 'xl' });
  const desktopExpanded = dynamicCellSnapshot(geometry);
  expectLocalDynamicExpansion(desktopCollapsed, desktopExpanded);
  for (const id of ['dynamic.below-one', 'dynamic.below-two']) {
    const moved = geometry.items.find((item) => item.id === id).cells;
    const initial = desktopCollapsed.find((item) => item.id === id).cells;
    expect({ x: moved.x, y: moved.y }).not.toEqual({ x: initial.x, y: initial.y });
  }

  geometry = await toggleLight(false, 'xl');
  expectDynamicGeometry(geometry, { expanded: false, breakpoint: 'xl' });
  expect(dynamicCellSnapshot(geometry)).toEqual(desktopCollapsed);
  for (let cycle = 0; cycle < 2; cycle += 1) {
    geometry = await toggleLight(true, 'xl');
    expectDynamicGeometry(geometry, { expanded: true, breakpoint: 'xl' });
    expect(dynamicCellSnapshot(geometry)).toEqual(desktopExpanded);
    geometry = await toggleLight(false, 'xl');
    expectDynamicGeometry(geometry, { expanded: false, breakpoint: 'xl' });
    expect(dynamicCellSnapshot(geometry)).toEqual(desktopCollapsed);
  }

  for (const viewport of [
    { width: 1600, height: 1000, breakpoint: 'md' },
    { width: 500, height: 820, breakpoint: 'xs' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const collapsedAtBreakpoint = await waitForDynamicRootGeometry(page, {
      expanded: false,
      breakpoint: viewport.breakpoint,
    });
    expectDynamicGeometry(collapsedAtBreakpoint, { expanded: false, breakpoint: viewport.breakpoint });
    geometry = await toggleLight(true, viewport.breakpoint);
    expectDynamicGeometry(geometry, { expanded: true, breakpoint: viewport.breakpoint });
    expectLocalDynamicExpansion(dynamicCellSnapshot(collapsedAtBreakpoint), dynamicCellSnapshot(geometry));
    geometry = await toggleLight(false, viewport.breakpoint);
    expectDynamicGeometry(geometry, { expanded: false, breakpoint: viewport.breakpoint });
    expect(dynamicCellSnapshot(geometry)).toEqual(dynamicCellSnapshot(collapsedAtBreakpoint));
  }

  await page.setViewportSize({ width: 1920, height: 1100 });
  await waitForDynamicRootGeometry(page, { expanded: false, breakpoint: 'xl' });
  geometry = await toggleLight(true, 'xl');
  expectDynamicGeometry(geometry, { expanded: true, breakpoint: 'xl' });
  await page.setViewportSize({ width: 500, height: 820 });
  geometry = await waitForDynamicRootGeometry(page, { expanded: true, breakpoint: 'xs' });
  expectDynamicGeometry(geometry, { expanded: true, breakpoint: 'xs' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  geometry = await waitForDynamicRootGeometry(page, { expanded: true, breakpoint: 'md' });
  expectDynamicGeometry(geometry, { expanded: true, breakpoint: 'md' });
  geometry = await toggleLight(false, 'md');
  expectDynamicGeometry(geometry, { expanded: false, breakpoint: 'md' });
  await page.setViewportSize({ width: 1920, height: 1100 });
  geometry = await waitForDynamicRootGeometry(page, { expanded: false, breakpoint: 'xl' });
  expectDynamicGeometry(geometry, { expanded: false, breakpoint: 'xl' });
  expect(dynamicCellSnapshot(geometry)).toEqual(desktopCollapsed);

  expect(await page.evaluate(() => window.__rendererLayoutWrites)).toEqual([]);
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => window.__stopRootRendererModeObserver())).toEqual([
    EXPECT_RENDERER ? 'grid-engine-2' : 'legacy',
  ]);
  await page.evaluate(() => { window.__trackRendererLayoutWrites = false; });

  await enterEditMode(page);
  await expect(page.locator('[data-grid-engine-root-renderer]')).toHaveCount(0);
  await expect(page.locator('.sections-grid.is-editing')).toHaveCount(1);
  await leaveEditMode(page);
  await waitForRootRenderer(page);
  expect(consoleErrors).toEqual([]);
});
