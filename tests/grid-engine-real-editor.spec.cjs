const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';
const REAL_STORAGE_KEY = 'ha.dashboard.builder.layout.v1';
const DRAFT_KEY = 'premium-home.dashboard-edit-draft.demo.v1';
const SHARED_CONFIGURATION_KEY = 'premium-home.shared-house.v1';
const REVISION_HISTORY_KEY = 'premium-home.dashboard-revisions.v1';
const EXPECT_EDITOR = process.env.VITE_GRID_ENGINE_2_EDITOR === 'true';
const EXPECT_QA_SAVE = process.env.VITE_GRID_ENGINE_2_QA_SAVE === 'true';

const BREAKPOINT_COLS = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };

function widget(id, kind, title, layout, parentSectionId) {
  return {
    id,
    kind,
    title,
    entityId: `${kind}.${id.replaceAll('.', '_')}`,
    dataSource: 'mock',
    status: kind === 'light' ? 'Accesa' : 'Attivo',
    isOn: true,
    value: 52,
    unit: '%',
    ...(parentSectionId ? { parentSectionId } : {}),
    layout: { i: id, ...layout },
  };
}

function spanOverrides(kind) {
  return Object.fromEntries(Object.entries(BREAKPOINT_COLS).map(([breakpoint, cols]) => [
    breakpoint,
    kind === 'light'
      ? { w: Math.min(cols, cols >= 12 ? 3 : 2), hOff: 1, hOn: 2, autoExpand: true }
      : { w: Math.min(cols, cols >= 12 ? 3 : 2), h: 1 },
  ]));
}

function editorFixture({ dynamicStack = false } = {}) {
  const rootIds = ['section.greeting', 'section.stack', 'root.light', 'root.sensor', 'root.switch'];
  const root = Object.fromEntries(Object.entries(BREAKPOINT_COLS).map(([breakpoint, cols]) => [
    breakpoint,
    [
      { i: rootIds[0], x: 0, y: 0, w: Math.min(4, cols), h: 1 },
      { i: rootIds[1], x: 0, y: 2, w: Math.min(4, cols), h: 1 },
      { i: rootIds[2], x: 0, y: 4, w: Math.min(cols, cols >= 12 ? 3 : 2), h: 1 },
      { i: rootIds[3], x: 0, y: 7, w: Math.min(cols, cols >= 12 ? 3 : 2), h: 1 },
      { i: rootIds[4], x: 0, y: 10, w: Math.min(cols, cols >= 12 ? 3 : 2), h: 1 },
    ],
  ]));
  return {
    version: 14,
    widgetTypeLayoutOverrides: {
      light: spanOverrides('light'),
      sensor: spanOverrides('sensor'),
      switch: spanOverrides('switch'),
    },
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root,
      stacks: {
        'section.stack': Object.fromEntries(Object.keys(BREAKPOINT_COLS).map((breakpoint) => [
          breakpoint,
          [{ i: 'stack.child', x: 0, y: 0, w: 2, h: dynamicStack ? 2 : 1 }],
        ])),
      },
    },
    sections: [
      {
        id: 'section.greeting', kind: 'greeting', title: 'Casa Grid Engine',
        layout: { i: 'section.greeting', x: 0, y: 0, w: 4, h: 1 },
      },
      {
        id: 'section.stack', kind: 'stack-grid', title: 'Stack atomico', stackColumns: 4,
        stackColumnsMode: dynamicStack ? 'auto' : 'manual',
        stackShowBackground: true, stackShowBorder: true, stackShowHeader: dynamicStack,
        layout: { i: 'section.stack', x: 0, y: 2, w: 4, h: 1 },
      },
    ],
    widgets: [
      widget('root.light', 'light', 'Luce autentica', { x: 0, y: 4, w: 3, h: 1 }),
      widget('root.sensor', 'sensor', 'Sensore autentico', { x: 0, y: 7, w: 3, h: 1 }),
      widget('root.switch', 'switch', 'Interruttore autentico', { x: 0, y: 10, w: 3, h: 1 }),
      widget('stack.child', 'sensor', 'Figlio Stack', { x: 0, y: 0, w: 2, h: dynamicStack ? 2 : 1 }, 'section.stack'),
    ],
  };
}

function historicalSpanFixture() {
  const layout = editorFixture();
  delete layout.widgetTypeLayoutOverrides.sensor;
  for (const breakpoint of Object.keys(BREAKPOINT_COLS)) {
    const sensor = layout.responsiveLayouts.root[breakpoint]
      .find((item) => item.i === 'root.sensor');
    sensor.w = Math.min(2, BREAKPOINT_COLS[breakpoint]);
    sensor.h = 1;
  }
  const sensor = layout.widgets.find((item) => item.id === 'root.sensor');
  sensor.layout.w = 2;
  sensor.layout.h = 1;
  return layout;
}

function automaticModeFixture() {
  const ids = ['root.auto-a', 'root.auto-b', 'root.auto-c'];
  const geometryByBreakpoint = {
    '2xl': { w: 3, positions: [[0, 0], [4, 0], [8, 0]] },
    xl: { w: 3, positions: [[0, 0], [4, 0], [8, 0]] },
    lg: { w: 2, positions: [[0, 0], [3, 0], [6, 0]] },
    md: { w: 2, positions: [[0, 0], [2, 0], [4, 0]] },
    sm: { w: 1, positions: [[0, 0], [1, 0], [2, 0]] },
    xs: { w: 2, positions: [[0, 0], [0, 1], [0, 2]] },
  };
  const root = Object.fromEntries(Object.entries(geometryByBreakpoint).map(([breakpoint, geometry]) => [
    breakpoint,
    ids.map((id, index) => ({
      i: id,
      x: geometry.positions[index][0],
      y: geometry.positions[index][1],
      w: geometry.w,
      h: 1,
    })),
  ]));
  const sensorOverrides = Object.fromEntries(Object.entries(geometryByBreakpoint).map(([breakpoint, geometry]) => [
    breakpoint,
    { w: geometry.w, h: 1 },
  ]));
  return {
    version: 14,
    widgetTypeLayoutOverrides: { sensor: sensorOverrides },
    widgetLayoutOverrides: {},
    responsiveLayouts: { root },
    sections: [],
    widgets: ids.map((id, index) => widget(
      id,
      'sensor',
      `Automatic ${index + 1}`,
      { x: geometryByBreakpoint.xl.positions[index][0], y: 0, w: 3, h: 1 },
    )),
  };
}

function automaticReorderFixture({ mixedHeights = false } = {}) {
  const ids = ['root.order-a', 'root.order-b', 'root.order-c'];
  const breakpoints = Object.keys(BREAKPOINT_COLS);
  const root = Object.fromEntries(breakpoints.map((breakpoint) => {
    const cols = BREAKPOINT_COLS[breakpoint];
    const width = Math.min(3, cols);
    const bHeight = mixedHeights ? 2 : 1;
    return [breakpoint, [
      { i: ids[0], x: 0, y: 0, w: width, h: 1 },
      { i: ids[1], x: 0, y: 1, w: width, h: bHeight },
      { i: ids[2], x: 0, y: 1 + bHeight, w: width, h: 1 },
    ]];
  }));
  const sensorOverrides = Object.fromEntries(breakpoints.map((breakpoint) => [
    breakpoint,
    { w: Math.min(3, BREAKPOINT_COLS[breakpoint]), h: 1 },
  ]));
  const widgetLayoutOverrides = mixedHeights
    ? {
        [ids[1]]: Object.fromEntries(breakpoints.map((breakpoint) => [
          breakpoint,
          { w: Math.min(3, BREAKPOINT_COLS[breakpoint]), h: 2 },
        ])),
      }
    : {};
  return {
    version: 14,
    widgetTypeLayoutOverrides: { sensor: sensorOverrides },
    widgetLayoutOverrides,
    responsiveLayouts: { root },
    sections: [],
    widgets: ids.map((id, index) => widget(
      id,
      'sensor',
      `Order ${String.fromCharCode(65 + index)}`,
      {
        x: 0,
        y: index === 0 ? 0 : index === 1 ? 1 : mixedHeights ? 3 : 2,
        w: 3,
        h: index === 1 && mixedHeights ? 2 : 1,
      },
    )),
  };
}

function autoscrollFixture() {
  const ids = Array.from({ length: 20 }, (_, index) => `root.scroll-${String(index).padStart(2, '0')}`);
  const breakpoints = Object.keys(BREAKPOINT_COLS);
  const root = Object.fromEntries(breakpoints.map((breakpoint) => {
    const width = Math.min(3, BREAKPOINT_COLS[breakpoint]);
    return [breakpoint, ids.map((id, index) => ({ i: id, x: 0, y: index, w: width, h: 1 }))];
  }));
  const sensorOverrides = Object.fromEntries(breakpoints.map((breakpoint) => [
    breakpoint,
    { w: Math.min(3, BREAKPOINT_COLS[breakpoint]), h: 1 },
  ]));
  return {
    version: 14,
    widgetTypeLayoutOverrides: { sensor: sensorOverrides },
    widgetLayoutOverrides: {},
    responsiveLayouts: { root },
    sections: [],
    widgets: ids.map((id, index) => widget(
      id,
      'sensor',
      `Scroll ${index + 1}`,
      { x: 0, y: index, w: 3, h: 1 },
    )),
  };
}

async function installDemo(page, layout) {
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem('__gridEngineRealEditorFixture') !== 'installed') {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('__gridEngineRealEditorFixture', 'installed');
      localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
        version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now(),
      }));
      localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
      localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
      localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, { key: STORAGE_KEY, value: layout });
}

async function installSimulatedHaQa(page, layout) {
  const dashboard = structuredClone(layout);
  dashboard.storageVersion = dashboard.version;
  delete dashboard.version;
  await page.goto('/home');
  await page.evaluate(({
    layoutValue,
    dashboardValue,
    realStorageKey,
    sharedKey,
    historyKey,
  }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2, phase: 'done', mode: 'real', updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem(realStorageKey, JSON.stringify(layoutValue));

    const origin = window.location.origin;
    const owner = {
      id: 'qa-save-owner',
      name: 'QA Save Owner',
      username: 'qa-save@example.test',
      is_owner: true,
      is_admin: true,
      is_active: true,
      system_generated: false,
      group_ids: ['system-admin'],
    };
    let sharedDocument = {
      schema: 'premium-home-house-configuration',
      version: 1,
      revision: 84,
      updatedAt: '2026-10-28T08:00:00.000Z',
      updatedByUserId: owner.id,
      publication: { source: 'edit', originClientId: 'qa-save-fixture' },
      dashboard: dashboardValue,
      security: { alarmEntityId: null, visibleSensorEntityIds: null, visibleCameraEntityIds: null },
      rooms: { customRooms: [], hiddenEntitiesByRoom: {} },
    };
    let revisionHistory = null;
    let failNextSharedWrite = false;
    window.__qaSaveHaState = {
      sharedReads: 0,
      sharedWrites: 0,
      historyReads: 0,
      historyWrites: 0,
      sharedDocument,
      revisionHistory,
    };
    const syncState = () => {
      window.__qaSaveHaState.sharedDocument = sharedDocument;
      window.__qaSaveHaState.revisionHistory = revisionHistory;
    };
    window.__publishQaSaveRemoteRevision = () => {
      const next = structuredClone(sharedDocument);
      next.revision += 1;
      next.updatedAt = '2026-10-28T08:05:00.000Z';
      next.updatedByUserId = 'other-ha-owner';
      next.publication = { source: 'edit', originClientId: 'other-ha-client' };
      const responsiveSensor = next.dashboard.responsiveLayouts.root.xl
        .find((item) => item.i === 'root.sensor');
      const canonicalSensor = next.dashboard.widgets
        .find((item) => item.id === 'root.sensor');
      responsiveSensor.y += 2;
      canonicalSensor.layout.y += 2;
      sharedDocument = next;
      syncState();
    };
    window.__failNextQaSave = () => {
      failNextSharedWrite = true;
    };
    const reply = (target, requestId, result) => target.postMessage({
      type: 'ha-panel-call-api-result', requestId, ok: true, result,
    }, origin);

    window.addEventListener('message', (event) => {
      if (event.origin !== origin || !event.source || !event.data) return;
      if (event.data.type === 'ha-panel-ready' || event.data.type === 'ha-panel-request-sync') {
        event.source.postMessage({
          type: 'ha-panel-context', hassUrl: origin, bridgeProtocolVersion: 1,
          capabilities: ['shared_configuration'],
        }, origin);
        event.source.postMessage({
          type: 'ha-panel-snapshot', hassUrl: origin, bridgeProtocolVersion: 1,
          capabilities: ['shared_configuration'], states: {}, areas: [],
        }, origin);
        return;
      }
      if (event.data.type === 'ha-panel-call-api') {
        const message = event.data.message ?? {};
        if (message.type === 'auth/current_user') {
          reply(event.source, event.data.requestId, owner);
        } else if (message.type === 'config/auth/list' || message.type === 'auth/list') {
          reply(event.source, event.data.requestId, [owner]);
        } else if (message.type === 'frontend/get_system_data' && message.key === sharedKey) {
          window.__qaSaveHaState.sharedReads += 1;
          reply(event.source, event.data.requestId, { value: sharedDocument });
        } else if (message.type === 'frontend/set_system_data' && message.key === sharedKey) {
          if (failNextSharedWrite) {
            failNextSharedWrite = false;
            event.source.postMessage({
              type: 'ha-panel-call-api-result', requestId: event.data.requestId,
              ok: false, error: 'simulated-write-failure',
            }, origin);
            return;
          }
          window.__qaSaveHaState.sharedWrites += 1;
          sharedDocument = message.value;
          syncState();
          reply(event.source, event.data.requestId, undefined);
        } else if (message.type === 'frontend/get_system_data' && message.key === historyKey) {
          window.__qaSaveHaState.historyReads += 1;
          reply(event.source, event.data.requestId, { value: revisionHistory });
        } else if (message.type === 'frontend/set_system_data' && message.key === historyKey) {
          window.__qaSaveHaState.historyWrites += 1;
          revisionHistory = message.value;
          syncState();
          reply(event.source, event.data.requestId, undefined);
        } else if (message.type === 'frontend/get_system_data' || message.type === 'frontend/get_user_data') {
          reply(event.source, event.data.requestId, { value: null });
        } else if (message.type === 'frontend/set_system_data') {
          reply(event.source, event.data.requestId, undefined);
        } else if (message.type === 'get_services') {
          reply(event.source, event.data.requestId, {});
        } else {
          reply(event.source, event.data.requestId, []);
        }
        return;
      }
      if (event.data.type === 'ha-panel-subscribe-api') {
        event.source.postMessage({
          type: 'ha-panel-subscribe-api-result', requestId: event.data.requestId, ok: true,
        }, origin);
      }
    });
    document.body.innerHTML = '<iframe title="Home Assistant panel" src="/home" style="width:100vw;height:100vh;border:0"></iframe>';
  }, {
    layoutValue: layout,
    dashboardValue: dashboard,
    realStorageKey: REAL_STORAGE_KEY,
    sharedKey: SHARED_CONFIGURATION_KEY,
    historyKey: REVISION_HISTORY_KEY,
  });
}

async function enterEditMode(page) {
  await page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first().click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await expect(page.locator('.sections-grid.is-editing')).toBeVisible();
}

async function selectDesktopPreview(page) {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.getByRole('radio', { name: 'Anteprima desktop' }).click();
  await expect(page.locator('.behance-canvas-shell')).toHaveAttribute('data-preview-width', '1280');
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveAttribute('data-breakpoint', 'xl');
}

function rootItem(page, id) {
  return page.locator(`[data-grid-engine-root-item="${id}"]`);
}

function editorScrollContainer(page) {
  return page.locator('[data-grid-engine-editor="active"]').locator('xpath=..');
}

async function scrollTopOf(locator) {
  return locator.evaluate((element) => element.scrollTop);
}

async function cellGeometry(page, id) {
  return rootItem(page, id).evaluate((node) => ({
    x: Number(node.getAttribute('data-grid-x')),
    y: Number(node.getAttribute('data-grid-y')),
    w: Number(node.getAttribute('data-grid-w')),
    h: Number(node.getAttribute('data-grid-h')),
  }));
}

async function dragEditorItem(page, id, deltaCellsY) {
  const target = page.locator(`[data-grid-engine-editor-item="${id}"]`);
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error(`Editor item ${id} has no browser bounds.`);
  const startX = bounds.x + Math.min(36, bounds.width / 3);
  const startY = bounds.y + Math.min(28, bounds.height / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(page.locator('[data-grid-engine-editor-gesture="PRESSING"]')).toBeVisible();
  await page.mouse.move(startX, startY + deltaCellsY * 64, { steps: 12 });
  await expect(page.locator('[data-grid-engine-editor-gesture="DRAGGING"]')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('[data-grid-engine-editor-gesture="IDLE"]')).toBeVisible();
}

async function dragEditorItemByCells(page, id, deltaCellsX, deltaCellsY) {
  const target = page.locator(`[data-grid-engine-editor-item="${id}"]`);
  const renderer = page.locator('[data-grid-engine-root-renderer="grid-engine-2"]');
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error(`Editor item ${id} has no browser bounds.`);
  const canvasWidth = Number(await renderer.getAttribute('data-canvas-width'));
  const cols = Number(await renderer.getAttribute('data-cols'));
  const stepX = (canvasWidth - 16 * (cols - 1)) / cols + 16;
  const startX = bounds.x + Math.min(36, bounds.width / 3);
  const startY = bounds.y + Math.min(28, bounds.height / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(
    startX + deltaCellsX * stepX,
    startY + deltaCellsY * 64,
    { steps: 16 },
  );
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'DRAGGING');
  const preview = await cellGeometry(page, id);
  const host = page.locator('[data-grid-engine-editor="active"]');
  const mode = await host.getAttribute('data-grid-engine-editor-mode');
  const operation = await host.getAttribute('data-grid-engine-editor-operation');
  await page.mouse.up();
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'IDLE');
  return { preview, mode, operation };
}

async function beginEditorDragWithCadence(
  page,
  id,
  deltaCellsY,
  { steps, delayMs },
) {
  const target = page.locator(`[data-grid-engine-editor-item="${id}"]`);
  const renderer = page.locator('[data-grid-engine-root-renderer="grid-engine-2"]');
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error(`Editor item ${id} has no browser bounds.`);
  const startX = bounds.x + Math.min(36, bounds.width / 3);
  const startY = bounds.y + Math.min(28, bounds.height / 2);
  const endY = startY + deltaCellsY * 64;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(startX, startY + (endY - startY) * step / steps);
    if (delayMs > 0) await page.waitForTimeout(delayMs);
  }
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'DRAGGING');
  return { renderer, endX: startX, endY };
}

async function rootOrder(page, ids) {
  const entries = await Promise.all(ids.map(async (id) => ({ id, ...(await cellGeometry(page, id)) })));
  return entries
    .sort((first, second) => first.y - second.y || first.x - second.x || first.id.localeCompare(second.id))
    .map((entry) => entry.id);
}

async function dragEditorItemWithVisualTrace(page, id, deltaCellsY) {
  const target = page.locator(`[data-grid-engine-editor-item="${id}"]`);
  const rendered = rootItem(page, id);
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error(`Editor item ${id} has no browser bounds.`);
  const startX = bounds.x + Math.min(36, bounds.width / 3);
  const startY = bounds.y + Math.min(28, bounds.height / 2);
  const trace = [];

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(page.locator('[data-grid-engine-editor-gesture="PRESSING"]')).toBeVisible();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(startX, startY + deltaCellsY * 64 * step / 12);
    await page.waitForTimeout(16);
    const itemBounds = await rendered.boundingBox();
    trace.push({
      top: itemBounds?.y ?? Number.NaN,
      gridY: Number(await rendered.getAttribute('data-grid-y')),
      visualY: Number(await rendered.getAttribute('data-grid-visual-offset-y')),
      operation: await page.locator('[data-grid-engine-editor="active"]')
        .getAttribute('data-grid-engine-editor-operation'),
      draft: await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY),
    });
  }
  await expect(rendered).toHaveClass(/react-draggable-dragging/);
  await page.mouse.up();
  await expect(page.locator('[data-grid-engine-editor-gesture="IDLE"]')).toBeVisible();
  return { startTop: bounds.y, trace };
}

async function resizeEditorItem(page, id, deltaCellsY) {
  await page.locator(`[data-grid-engine-editor-item="${id}"]`).click();
  const target = page.locator(`[data-grid-engine-editor-resize="${id}"]`);
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error(`Resize handle ${id} has no browser bounds.`);
  const startX = bounds.x + bounds.width / 2;
  const startY = bounds.y + bounds.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaCellsY * 64, { steps: 12 });
  await expect(page.locator('[data-grid-engine-editor-gesture="RESIZING"]')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('[data-grid-engine-editor-gesture="IDLE"]')).toBeVisible();
}

async function expectNoCellCollisions(page) {
  const items = await page.locator('[data-grid-engine-root-item]').evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute('data-grid-engine-root-item'),
    x: Number(node.getAttribute('data-grid-x')),
    y: Number(node.getAttribute('data-grid-y')),
    w: Number(node.getAttribute('data-grid-w')),
    h: Number(node.getAttribute('data-grid-h')),
  })));
  for (let index = 0; index < items.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
      const first = items[index];
      const second = items[otherIndex];
      const overlaps = first.x < second.x + second.w && first.x + first.w > second.x
        && first.y < second.y + second.h && first.y + first.h > second.y;
      expect(overlaps, `${first.id} overlaps ${second.id}`).toBe(false);
    }
  }
}

async function saveAndExitQa(page) {
  await page.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const dialog = page.getByRole('dialog', { name: 'Uscire dalla modalità modifica?' });
  const save = dialog.getByRole('button', { name: 'Salva QA Grid Engine', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('.sections-grid')).not.toHaveClass(/is-editing/);
  await expect(dialog).not.toBeVisible();
}

test('flag OFF keeps the legacy editor and ordinary Demo persistence unchanged', async ({ page }) => {
  test.skip(EXPECT_EDITOR, 'This assertion exercises the default disabled path.');
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, editorFixture());
  await page.goto('/home');
  await enterEditMode(page);

  await expect(page.locator('[data-grid-engine-editor]')).toHaveCount(0);
  await expect(page.getByTestId('grid-engine-2-editor-status')).toHaveCount(0);
  await expect(page.locator('.sections-grid.grid-engine-2-root-renderer')).toHaveCount(0);

  await page.getByRole('radio', { name: 'Anteprima desktop' }).click();
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  const sensor = page.locator('.sections-grid > .react-grid-item').filter({ hasText: 'Sensore autentico' }).first();
  const bounds = await sensor.boundingBox();
  if (!bounds) throw new Error('Legacy sensor has no browser bounds.');
  await page.mouse.move(bounds.x + 32, bounds.y + 28);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 32, bounds.y + 92, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(350);

  await page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first().click();
  await page.getByRole('button', { name: 'Salva ed esci', exact: true }).click();
  await expect(page.locator('.sections-grid')).not.toHaveClass(/is-editing/);
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(after.responsiveLayouts.root.xl).not.toEqual(before.responsiveLayouts.root.xl);
});

test('explicit Home 2.0 cutover works without DEV flags, saves normally, and reloads exact geometry', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  const source = editorFixture();
  await installDemo(page, source);
  const apiRequests = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') || request.resourceType() === 'websocket') apiRequests.push(request.url());
  });
  await page.goto('/home');
  await enterEditMode(page);
  const persistedBaseline = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  await page.getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  const activation = page.getByRole('dialog', { name: 'Attiva nuova Home 2.0' });
  await expect(activation).toContainText('I widget e le relative configurazioni saranno conservati');
  await activation.getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();

  await expect(page.locator('[data-grid-engine-editor="active"]')).toBeVisible();
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toBeVisible();
  await expect(page.locator('[data-grid-engine-root-item]')).toHaveCount(5);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(persistedBaseline);

  await expect.poll(async () => page.evaluate((key) => {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }, DRAFT_KEY)).toMatchObject({
    persistenceProtection: 'grid-engine-2-experimental',
    dashboard: { layoutEngine: 'grid-engine-2' },
  });

  await page.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const exit = page.getByRole('dialog').filter({ hasText: 'Uscire' });
  await expect(exit).toContainText('nuova geometria Home 2.0 è valida');
  const save = exit.getByRole('button', { name: 'Salva ed esci', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('.sections-grid')).not.toHaveClass(/is-editing/);

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.layoutEngine).toBe('grid-engine-2');
  expect(Object.keys(saved.responsiveLayouts.root).sort()).toEqual(Object.keys(BREAKPOINT_COLS).sort());
  expect(saved.sections.map((section) => [section.id, section.kind, section.title]))
    .toEqual(source.sections.map((section) => [section.id, section.kind, section.title]));
  expect(saved.widgets.map((widget) => [widget.id, widget.kind, widget.entityId, widget.parentSectionId ?? null]))
    .toEqual(source.widgets.map((widget) => [widget.id, widget.kind, widget.entityId, widget.parentSectionId ?? null]));
  expect(saved.responsiveLayouts.root).not.toEqual(source.responsiveLayouts.root);
  expect(apiRequests).toEqual([]);

  const savedGeometry = structuredClone(saved.responsiveLayouts);
  await page.reload();
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toBeVisible();
  const reloaded = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(reloaded.layoutEngine).toBe('grid-engine-2');
  expect(reloaded.responsiveLayouts).toEqual(savedGeometry);
});

test('discarding an unsaved Home 2.0 cutover restores the complete legacy Home', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, editorFixture());
  await page.goto('/home');
  await enterEditMode(page);
  const persistedBaseline = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  await page.getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  await page.getByRole('dialog', { name: 'Attiva nuova Home 2.0' })
    .getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  await expect(page.locator('[data-grid-engine-editor="active"]')).toBeVisible();

  await page.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const exit = page.getByRole('dialog').filter({ hasText: 'Uscire' });
  await exit.getByRole('button', { name: 'Scarta modifiche', exact: true }).click();
  await expect(page.locator('.sections-grid')).not.toHaveClass(/is-editing/);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(persistedBaseline);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
});

test('simulated HA cutover archives the legacy revision before publishing Home 2.0', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installSimulatedHaQa(page, editorFixture());
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');
  await expect(frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first()).toBeVisible();
  const panelFrame = page.frames().find((candidate) => candidate.parentFrame());
  if (!panelFrame) throw new Error('Simulated Home Assistant panel frame not found.');
  await panelFrame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState?.sharedReads ?? 0))
    .toBeGreaterThan(0);

  await enterEditMode(frame);
  await frame.getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  await frame.getByRole('dialog', { name: 'Attiva nuova Home 2.0' })
    .getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  await expect(frame.locator('[data-grid-engine-editor="active"]')).toBeVisible();

  await frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const exit = frame.getByRole('dialog').filter({ hasText: 'Uscire' });
  await expect(exit.getByRole('button', { name: 'Salva ed esci', exact: true })).toBeEnabled();
  await exit.getByRole('button', { name: 'Salva ed esci', exact: true }).click();
  await expect(frame.locator('.sections-grid')).not.toHaveClass(/is-editing/);

  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState?.sharedWrites ?? 0)).toBe(1);
  const state = await page.evaluate(() => structuredClone(window.__qaSaveHaState));
  expect(state.historyWrites).toBe(1);
  expect(state.revisionHistory.entries.map((entry) => entry.revision)).toContain(84);
  expect(state.sharedDocument.revision).toBe(85);
  expect(state.sharedDocument.dashboard.layoutEngine).toBe('grid-engine-2');
  expect(Object.keys(state.sharedDocument.dashboard.responsiveLayouts.root).sort())
    .toEqual(Object.keys(BREAKPOINT_COLS).sort());
});

test('simulated HA cutover stays open and unwritten when a newer revision is pending', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installSimulatedHaQa(page, editorFixture());
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');
  await expect(frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first()).toBeVisible();
  const panelFrame = page.frames().find((candidate) => candidate.parentFrame());
  if (!panelFrame) throw new Error('Simulated Home Assistant panel frame not found.');
  await panelFrame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState?.sharedReads ?? 0))
    .toBeGreaterThan(0);

  await enterEditMode(frame);
  await frame.getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  await frame.getByRole('dialog', { name: 'Attiva nuova Home 2.0' })
    .getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  const readsBeforeRemote = await page.evaluate(() => window.__qaSaveHaState.sharedReads);
  await page.evaluate(() => window.__publishQaSaveRemoteRevision());
  await panelFrame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState.sharedReads))
    .toBeGreaterThan(readsBeforeRemote);

  await frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const exit = frame.getByRole('dialog').filter({ hasText: 'Uscire' });
  await expect(exit.getByRole('button', { name: 'Salvataggio sperimentale bloccato' })).toBeDisabled();
  await expect(exit).toContainText('pendente la revisione Home Assistant 85');
  expect(await page.evaluate(() => window.__qaSaveHaState.sharedWrites)).toBe(0);
  expect(await page.evaluate(() => window.__qaSaveHaState.historyWrites)).toBe(0);
  await exit.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(frame.locator('.sections-grid')).toHaveClass(/is-editing/);
});

test('simulated HA write failure keeps the cutover retryable and discard restores legacy', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installSimulatedHaQa(page, editorFixture());
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');
  await expect(frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first()).toBeVisible();
  const panelFrame = page.frames().find((candidate) => candidate.parentFrame());
  if (!panelFrame) throw new Error('Simulated Home Assistant panel frame not found.');
  await panelFrame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState?.sharedReads ?? 0))
    .toBeGreaterThan(0);

  await enterEditMode(frame);
  await frame.getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  await frame.getByRole('dialog', { name: 'Attiva nuova Home 2.0' })
    .getByRole('button', { name: 'Attiva nuova Home 2.0', exact: true }).click();
  await page.evaluate(() => window.__failNextQaSave());

  await frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  await frame.getByRole('dialog').filter({ hasText: 'Uscire' })
    .getByRole('button', { name: 'Salva ed esci', exact: true }).click();
  await expect(frame.locator('.sections-grid')).toHaveClass(/is-editing/);
  expect(await page.evaluate(() => window.__qaSaveHaState.sharedWrites)).toBe(0);
  expect(await page.evaluate(() => window.__qaSaveHaState.sharedDocument.revision)).toBe(84);
  expect(await page.evaluate(() => window.__qaSaveHaState.sharedDocument.dashboard.layoutEngine)).toBeUndefined();

  await frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  await frame.getByRole('dialog').filter({ hasText: 'Uscire' })
    .getByRole('button', { name: 'Scarta modifiche', exact: true }).click();
  await expect(frame.locator('.sections-grid')).not.toHaveClass(/is-editing/);
  expect(await page.evaluate(() => window.__qaSaveHaState.sharedWrites)).toBe(0);
});

test('DEV flag ON integrates authentic cards, GE2 gestures, history, breakpoints, and protected recovery', async ({ page }) => {
  test.skip(!EXPECT_EDITOR, 'Requires VITE_GRID_ENGINE_2_EDITOR=true on the development server.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, editorFixture());
  const apiRequests = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') || request.resourceType() === 'websocket') apiRequests.push(request.url());
  });
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);

  const host = page.locator('[data-grid-engine-editor="active"]');
  await expect(host).toBeVisible();
  await expect(page.getByTestId('grid-engine-2-editor-status')).toContainText('Grid Engine 2.0');
  await expect(page.locator('[data-grid-engine-root-item]')).toHaveCount(5);
  await expect(page.locator('[data-grid-engine-editor-item]')).toHaveCount(5);
  await expect(rootItem(page, 'root.sensor')).toHaveCount(1);
  await expect(rootItem(page, 'root.light')).toContainText('Luce autentica');
  await expect(rootItem(page, 'section.stack')).toContainText('Figlio Stack');
  await expect(page.locator('[data-grid-engine-editor-item="section.stack"]')).toHaveCount(1);
  await expect(page.locator('[data-grid-engine-editor-item="stack.child"]')).toHaveCount(0);
  await expect(page.locator('[data-grid-engine-editor-item="root.sensor"]')).toHaveCSS('touch-action', 'pan-y');

  // The authentic Light is ON and expands only in runtime geometry.
  await expect(rootItem(page, 'root.light')).toHaveAttribute('data-grid-h', '2');
  const persistedBaseline = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(persistedBaseline).toBeTruthy();

  const beforeDrag = await cellGeometry(page, 'root.sensor');
  await dragEditorItem(page, 'root.sensor', 2);
  const afterDrag = await cellGeometry(page, 'root.sensor');
  expect(afterDrag.y).toBeGreaterThan(beforeDrag.y);
  await expectNoCellCollisions(page);

  await page.waitForTimeout(320);
  const beforeResize = await cellGeometry(page, 'root.sensor');
  await resizeEditorItem(page, 'root.sensor', 1);
  const afterResize = await cellGeometry(page, 'root.sensor');
  expect(afterResize.h).toBe(beforeResize.h + 1);
  await expectNoCellCollisions(page);

  // MainBoard owns Undo/Redo; GE2 contributes only one normal transaction.
  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'root.sensor')).toMatchObject({ h: beforeResize.h });
  await page.getByRole('button', { name: 'Ripeti ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'root.sensor')).toMatchObject({ h: afterResize.h });

  // Keyboard editing uses the same GE2 solver and the same protected commit.
  const beforeKeyboard = await cellGeometry(page, 'root.sensor');
  await page.locator('[data-grid-engine-editor-item="root.sensor"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => cellGeometry(page, 'root.sensor')).toMatchObject({ x: beforeKeyboard.x + 1 });

  await expect(page.getByTestId('grid-engine-2-editor-mode-manual')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();
  await expect(page.getByTestId('grid-engine-2-editor-mode-automatic')).toHaveAttribute('aria-pressed', 'true');
  await dragEditorItem(page, 'root.switch', 1);
  await expectNoCellCollisions(page);
  await page.getByTestId('grid-engine-2-editor-mode-manual').click();

  const xlSensor = await cellGeometry(page, 'root.sensor');
  const closeContext = page.getByRole('button', { name: 'Chiudi pannello contestuale' });
  if (await closeContext.isVisible()) await closeContext.click();
  await page.getByRole('radio', { name: 'Anteprima automatica' }).click();
  for (const width of [1900, 1850, 1800, 1750, 1700, 1650, 1600, 1550, 1500]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(120);
    if (await page.locator('[data-grid-engine-root-renderer="grid-engine-2"][data-breakpoint="lg"]').count()) break;
  }
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveAttribute('data-breakpoint', 'lg');
  const lgBefore = await cellGeometry(page, 'root.sensor');
  await dragEditorItem(page, 'root.sensor', 2);
  const lgAfter = await cellGeometry(page, 'root.sensor');
  expect(lgAfter.y).toBeGreaterThan(lgBefore.y);
  await selectDesktopPreview(page);
  expect(await cellGeometry(page, 'root.sensor')).toEqual(xlSensor);

  await expect.poll(async () => page.evaluate((key) => {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }, DRAFT_KEY)).toMatchObject({
    persistenceProtection: 'grid-engine-2-experimental',
  });
  const storedDraft = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), DRAFT_KEY);
  expect(storedDraft.dashboard.responsiveLayouts.root.xl.find((item) => item.i === 'root.light').h).toBe(1);
  expect(apiRequests).toEqual([]);

  await page.keyboard.press('Control+R');
  const refreshDialog = page.getByRole('dialog', { name: 'Ricaricare la pagina?' });
  await expect(refreshDialog).toBeVisible();
  await refreshDialog.getByRole('button', { name: 'Ricarica', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Hai una bozza non salvata' })).toBeVisible();
  await page.getByRole('button', { name: 'Riprendi modifica', exact: true }).click();
  await expect(page.locator('[data-grid-engine-editor="active"]')).toBeVisible();

  await page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first().click();
  const exitDialog = page.getByRole('dialog', { name: 'Uscire dalla modalità modifica?' });
  await expect(exitDialog.getByRole('button', { name: 'Salvataggio sperimentale bloccato' })).toBeDisabled();
  await expect(exitDialog).toContainText('salvataggio è bloccato');
  await exitDialog.getByRole('button', { name: 'Scarta modifiche', exact: true }).click();
  await expect(page.locator('.sections-grid')).not.toHaveClass(/is-editing/);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(persistedBaseline);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();

  // Discarding a recovered draft must end the protected session completely.
  // A subsequent activation starts from the authoritative baseline and can
  // become a fresh QA-save candidate instead of inheriting recovered-blocked.
  await enterEditMode(page);
  await selectDesktopPreview(page);
  await dragEditorItem(page, 'root.sensor', 1);
  await page.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const freshExitDialog = page.getByRole('dialog').filter({ hasText: 'Uscire' });
  if (EXPECT_QA_SAVE) {
    await expect(freshExitDialog.getByRole('button', { name: 'Salva QA Grid Engine', exact: true }))
      .toBeEnabled();
    await expect(freshExitDialog).toContainText('hanno superato la validazione QA');
  } else {
    await expect(freshExitDialog.getByRole('button', { name: 'Salvataggio sperimentale bloccato' }))
      .toBeDisabled();
    await expect(freshExitDialog).toContainText('flag dellâ€™editor da solo non abilita scritture');
  }
  await freshExitDialog.getByRole('button', { name: 'Scarta modifiche', exact: true }).click();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
});

test('real editor keeps Manual free placement, compacts only in Automatic, and previews drag continuously', async ({ page }) => {
  test.skip(!EXPECT_EDITOR, 'Requires VITE_GRID_ENGINE_2_EDITOR=true on the development server.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, editorFixture());
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);

  const host = page.locator('[data-grid-engine-editor="active"]');
  await expect(host).toHaveAttribute('data-grid-engine-editor-renderer', 'grid-engine-2');
  await expect(host).toHaveAttribute('data-grid-engine-editor-mode', 'manual');
  await expect(rootItem(page, 'section.greeting')).toHaveAttribute('data-grid-y', '0');
  await expect(rootItem(page, 'section.stack')).toHaveAttribute('data-grid-y', '2');
  await expect(rootItem(page, 'root.light')).toHaveAttribute('data-grid-y', '4');
  await expect(rootItem(page, 'root.sensor')).toHaveAttribute('data-grid-y', '7');
  await expect(rootItem(page, 'root.switch')).toHaveAttribute('data-grid-y', '10');

  const unchangedManualItems = Object.fromEntries(await Promise.all(
    ['section.stack', 'root.light', 'root.sensor', 'root.switch'].map(async (id) => [id, await cellGeometry(page, id)]),
  ));
  const { startTop, trace } = await dragEditorItemWithVisualTrace(page, 'section.greeting', 6);

  expect(trace[0].gridY).toBe(0);
  expect(trace[0].visualY).toBeGreaterThan(0);
  expect(trace[0].top).toBeGreaterThan(startTop + 10);
  for (let index = 1; index < trace.length; index += 1) {
    expect(trace[index].top, JSON.stringify(trace)).toBeGreaterThanOrEqual(trace[index - 1].top - 1);
  }
  expect(trace.every((sample) => sample.draft === null)).toBe(true);
  const solvedOperations = trace.filter((sample) => sample.operation !== null);
  expect(solvedOperations.length).toBeGreaterThan(0);
  expect(solvedOperations.every((sample) => sample.operation === 'MOVE')).toBe(true);
  await expect.poll(() => cellGeometry(page, 'section.greeting')).toMatchObject({ x: 0, y: 6, w: 4, h: 1 });
  for (const [id, geometry] of Object.entries(unchangedManualItems)) {
    expect(await cellGeometry(page, id)).toEqual(geometry);
  }
  const manualRows = await page.locator('[data-grid-engine-root-item]').evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-grid-y'))));
  expect(manualRows).not.toContain(0);

  await expect.poll(async () => page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key));
    return draft?.dashboard?.responsiveLayouts?.root?.xl
      ?.find((item) => item.i === 'section.greeting')?.y;
  }, DRAFT_KEY)).toBe(6);

  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'section.greeting')).toMatchObject({ y: 0 });
  await page.getByRole('button', { name: 'Ripeti ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'section.greeting')).toMatchObject({ y: 6 });

  // The editor surface grows visually; no empty-row placeholder is persisted.
  await page.waitForTimeout(320);
  await dragEditorItem(page, 'root.switch', 3);
  await expect.poll(() => cellGeometry(page, 'root.switch')).toMatchObject({ y: 13 });
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveAttribute('data-used-rows', '14');
  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'root.switch')).toMatchObject({ y: 10 });
  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'section.greeting')).toMatchObject({ y: 0 });

  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();
  await expect(host).toHaveAttribute('data-grid-engine-editor-mode', 'automatic');
  // Selecting Automatic alone is session state, not an implicit COMPACT.
  await expect(rootItem(page, 'section.stack')).toHaveAttribute('data-grid-y', '2');
  await dragEditorItem(page, 'section.greeting', 6);
  // Structural COMPACT produces stack=0, light=1, greeting=2, sensor=3,
  // switch=4. The ON Light expands only at runtime and pushes the three
  // following rendered cards down by one row.
  await expect.poll(() => cellGeometry(page, 'section.greeting')).toMatchObject({ y: 3 });
  expect(await cellGeometry(page, 'section.stack')).toMatchObject({ y: 0 });
  expect(await cellGeometry(page, 'root.light')).toMatchObject({ y: 1 });
  expect(await cellGeometry(page, 'root.sensor')).toMatchObject({ y: 4 });
  expect(await cellGeometry(page, 'root.switch')).toMatchObject({ y: 5 });
  await expectNoCellCollisions(page);
});

test('Automatic globally compacts a completed MOVE that Manual leaves in a free lower row', async ({ page }) => {
  test.skip(!EXPECT_EDITOR, 'Requires VITE_GRID_ENGINE_2_EDITOR=true on the development server.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, automaticModeFixture());
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);

  const host = page.locator('[data-grid-engine-editor="active"]');
  await expect(host).toHaveAttribute('data-grid-engine-editor-renderer', 'grid-engine-2');
  await expect(host).toHaveAttribute('data-grid-engine-editor-mode', 'manual');
  const initial = {
    a: await cellGeometry(page, 'root.auto-a'),
    b: await cellGeometry(page, 'root.auto-b'),
    c: await cellGeometry(page, 'root.auto-c'),
  };

  const manualGesture = await dragEditorItemByCells(page, 'root.auto-a', 1, 4);
  expect(manualGesture).toMatchObject({
    mode: 'manual',
    operation: 'MOVE',
    preview: { x: 1, y: 4, w: 3, h: 1 },
  });
  await expect.poll(() => cellGeometry(page, 'root.auto-a')).toMatchObject({ x: 1, y: 4 });
  expect(await cellGeometry(page, 'root.auto-b')).toEqual(initial.b);
  expect(await cellGeometry(page, 'root.auto-c')).toEqual(initial.c);

  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'root.auto-a')).toEqual(initial.a);
  await page.getByRole('button', { name: 'Ripeti ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'root.auto-a')).toMatchObject({ x: 1, y: 4 });
  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'root.auto-a')).toEqual(initial.a);

  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();
  await expect(host).toHaveAttribute('data-grid-engine-editor-mode', 'automatic');
  const automaticGesture = await dragEditorItemByCells(page, 'root.auto-a', 1, 4);
  expect(automaticGesture).toMatchObject({
    mode: 'automatic',
    operation: 'MOVE',
    preview: { x: 1, y: 4, w: 3, h: 1 },
  });

  // COMPACT keeps the requested X but removes the free vertical rows.
  await expect.poll(() => cellGeometry(page, 'root.auto-a')).toMatchObject({ x: 1, y: 0, w: 3, h: 1 });
  expect(await cellGeometry(page, 'root.auto-b')).toEqual(initial.b);
  expect(await cellGeometry(page, 'root.auto-c')).toEqual(initial.c);
  await expectNoCellCollisions(page);
  await expect.poll(async () => page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key));
    return draft?.dashboard?.responsiveLayouts?.root?.xl
      ?.find((item) => item.i === 'root.auto-a');
  }, DRAFT_KEY)).toMatchObject({ x: 1, y: 0, w: 3, h: 1 });

  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'root.auto-a')).toEqual(initial.a);
  await page.getByRole('button', { name: 'Ripeti ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, 'root.auto-a')).toMatchObject({ x: 1, y: 0, w: 3, h: 1 });
});

test('Automatic REORDER produces the same A-to-bottom order for slow and fast drags', async ({ page }) => {
  test.skip(!EXPECT_EDITOR, 'Requires VITE_GRID_ENGINE_2_EDITOR=true on the development server.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, automaticReorderFixture());
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);
  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();

  const ids = ['root.order-a', 'root.order-b', 'root.order-c'];
  const initialOrder = [...ids];
  await expect.poll(() => rootOrder(page, ids)).toEqual(initialOrder);

  const slow = await beginEditorDragWithCadence(page, ids[0], 2, { steps: 24, delayMs: 35 });
  await expect(page.locator('[data-grid-engine-editor="active"]'))
    .toHaveAttribute('data-grid-engine-editor-operation', 'REORDER');
  const stationaryPreview = await Promise.all(ids.map((id) => cellGeometry(page, id)));
  await page.waitForTimeout(450);
  await page.mouse.move(slow.endX, slow.endY);
  await page.waitForTimeout(150);
  expect(await Promise.all(ids.map((id) => cellGeometry(page, id)))).toEqual(stationaryPreview);
  await page.mouse.up();
  await expect.poll(() => rootOrder(page, ids)).toEqual([ids[1], ids[2], ids[0]]);
  const slowFinal = await Promise.all(ids.map((id) => cellGeometry(page, id)));
  expect(slowFinal).toEqual([
    { x: 0, y: 2, w: 3, h: 1 },
    { x: 0, y: 0, w: 3, h: 1 },
    { x: 0, y: 1, w: 3, h: 1 },
  ]);

  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => rootOrder(page, ids)).toEqual(initialOrder);
  await page.getByRole('button', { name: 'Ripeti ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => rootOrder(page, ids)).toEqual([ids[1], ids[2], ids[0]]);
  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => rootOrder(page, ids)).toEqual(initialOrder);

  const fast = await beginEditorDragWithCadence(page, ids[0], 2, { steps: 1, delayMs: 0 });
  await page.mouse.up();
  await expect.poll(() => rootOrder(page, ids)).toEqual([ids[1], ids[2], ids[0]]);
  expect(await Promise.all(ids.map((id) => cellGeometry(page, id)))).toEqual(slowFinal);

  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => rootOrder(page, ids)).toEqual(initialOrder);
  const middle = await beginEditorDragWithCadence(page, ids[0], 1, { steps: 12, delayMs: 25 });
  await page.mouse.up();
  await expect.poll(() => rootOrder(page, ids)).toEqual([ids[1], ids[0], ids[2]]);

  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => rootOrder(page, ids)).toEqual(initialOrder);
  const beforeFirst = await beginEditorDragWithCadence(page, ids[2], -2, { steps: 16, delayMs: 20 });
  await expect(page.locator('[data-grid-engine-editor="active"]'))
    .toHaveAttribute('data-grid-engine-editor-operation', 'REORDER');
  await page.mouse.up();
  await expect.poll(() => rootOrder(page, ids)).toEqual([ids[2], ids[0], ids[1]]);

  expect(fast.renderer).toBeDefined();
  expect(middle.renderer).toBeDefined();
  expect(beforeFirst.renderer).toBeDefined();
});

test('Automatic REORDER preserves mixed-height order without collisions', async ({ page }) => {
  test.skip(!EXPECT_EDITOR, 'Requires VITE_GRID_ENGINE_2_EDITOR=true on the development server.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, automaticReorderFixture({ mixedHeights: true }));
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);
  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();

  const ids = ['root.order-a', 'root.order-b', 'root.order-c'];
  const drag = await beginEditorDragWithCadence(page, ids[0], 3, { steps: 30, delayMs: 24 });
  await page.mouse.up();
  await expect.poll(() => rootOrder(page, ids)).toEqual([ids[1], ids[2], ids[0]]);
  expect(await Promise.all(ids.map((id) => cellGeometry(page, id)))).toEqual([
    { x: 0, y: 3, w: 3, h: 1 },
    { x: 0, y: 0, w: 3, h: 2 },
    { x: 0, y: 2, w: 3, h: 1 },
  ]);
  await expectNoCellCollisions(page);
  expect(drag.renderer).toBeDefined();
});

test('real editor autoscroll follows the mouse, stops safely, and preserves one Manual transaction', async ({ page }) => {
  test.skip(!EXPECT_EDITOR, 'Requires VITE_GRID_ENGINE_2_EDITOR=true on the development server.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 760 });
  await installDemo(page, autoscrollFixture());
  const apiRequests = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') || request.resourceType() === 'websocket') apiRequests.push(request.url());
  });
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);

  const id = 'root.scroll-00';
  const target = page.locator(`[data-grid-engine-editor-item="${id}"]`);
  const renderer = page.locator('[data-grid-engine-root-renderer="grid-engine-2"]');
  const scrollContainer = editorScrollContainer(page);
  await expect(scrollContainer).toHaveClass(/glass-scrollbar/);
  await scrollContainer.evaluate((element) => { element.scrollTop = 0; });
  const persistedBaseline = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const initial = await cellGeometry(page, id);
  const targetBounds = await target.boundingBox();
  const scrollBounds = await scrollContainer.boundingBox();
  if (!targetBounds || !scrollBounds) throw new Error('Autoscroll surface has no browser bounds.');
  const startX = targetBounds.x + Math.min(36, targetBounds.width / 3);
  const startY = targetBounds.y + Math.min(28, targetBounds.height / 2);
  const bottomEdgeY = scrollBounds.y + scrollBounds.height - 4;
  const topEdgeY = scrollBounds.y + 4;
  const centerY = scrollBounds.y + scrollBounds.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, bottomEdgeY, { steps: 12 });
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'DRAGGING');
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeGreaterThan(100);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
  const downGeometry = await cellGeometry(page, id);
  expect(downGeometry.y).toBeGreaterThan(initial.y);

  await page.mouse.move(startX, centerY);
  await page.waitForTimeout(120);
  const stoppedAt = await scrollTopOf(scrollContainer);
  await page.waitForTimeout(250);
  expect(Math.abs(await scrollTopOf(scrollContainer) - stoppedAt)).toBeLessThanOrEqual(1);

  await page.mouse.move(startX, bottomEdgeY);
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeGreaterThan(stoppedAt + 50);
  const beforeUp = await scrollTopOf(scrollContainer);
  await page.mouse.move(startX, topEdgeY);
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeLessThan(beforeUp - 50);
  await page.mouse.up();
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'IDLE');
  const releasedAt = await scrollTopOf(scrollContainer);
  await page.waitForTimeout(250);
  expect(Math.abs(await scrollTopOf(scrollContainer) - releasedAt)).toBeLessThanOrEqual(1);

  const committed = await cellGeometry(page, id);
  expect(committed.y).toBeGreaterThan(initial.y);
  await expectNoCellCollisions(page);
  await expect.poll(async () => page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key));
    return draft?.dashboard?.responsiveLayouts?.root?.xl?.find((item) => item.i === 'root.scroll-00');
  }, DRAFT_KEY)).toMatchObject(committed);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(persistedBaseline);
  expect(apiRequests).toEqual([]);

  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Annulla ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, id)).toEqual(initial);
  await page.getByRole('button', { name: 'Ripeti ultima modifica' }).filter({ visible: true }).first().click();
  await expect.poll(() => cellGeometry(page, id)).toEqual(committed);

  await target.scrollIntoViewIfNeeded();
  const cancelBounds = await target.boundingBox();
  const cancelScrollBounds = await scrollContainer.boundingBox();
  if (!cancelBounds || !cancelScrollBounds) throw new Error('Cancel surface has no browser bounds.');
  const cancelX = cancelBounds.x + 24;
  const cancelY = cancelBounds.y + Math.min(28, cancelBounds.height / 2);
  await page.mouse.move(cancelX, cancelY);
  await page.mouse.down();
  await page.mouse.move(cancelX, cancelScrollBounds.y + cancelScrollBounds.height - 4, { steps: 10 });
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'DRAGGING');
  const beforeEscape = await scrollTopOf(scrollContainer);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'IDLE');
  // Cancelling restores the immutable layout and may trigger one native scroll
  // anchoring adjustment. The autoscroll loop itself must remain stopped after
  // that layout has settled.
  await page.waitForTimeout(80);
  const settledAfterEscape = await scrollTopOf(scrollContainer);
  await page.waitForTimeout(250);
  expect(Math.abs(await scrollTopOf(scrollContainer) - settledAfterEscape)).toBeLessThanOrEqual(1);
  expect(Math.abs(settledAfterEscape - beforeEscape)).toBeLessThanOrEqual(20);
  expect(await cellGeometry(page, id)).toEqual(committed);
});

test('real editor autoscroll keeps Automatic reorder stable and touch cancel fail-closed', async ({ page }) => {
  test.skip(!EXPECT_EDITOR, 'Requires VITE_GRID_ENGINE_2_EDITOR=true on the development server.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 760 });
  await installDemo(page, autoscrollFixture());
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);
  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();

  const ids = Array.from({ length: 20 }, (_, index) => `root.scroll-${String(index).padStart(2, '0')}`);
  const id = ids[0];
  const target = page.locator(`[data-grid-engine-editor-item="${id}"]`);
  const renderer = page.locator('[data-grid-engine-root-renderer="grid-engine-2"]');
  const scrollContainer = editorScrollContainer(page);
  await scrollContainer.evaluate((element) => { element.scrollTop = 0; });
  const targetBounds = await target.boundingBox();
  const scrollBounds = await scrollContainer.boundingBox();
  if (!targetBounds || !scrollBounds) throw new Error('Automatic autoscroll surface has no browser bounds.');
  const x = targetBounds.x + 24;
  const y = targetBounds.y + Math.min(28, targetBounds.height / 2);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, scrollBounds.y + scrollBounds.height - 4, { steps: 12 });
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeGreaterThan(100);
  await page.mouse.up();
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'IDLE');
  const orderAfterMouse = await rootOrder(page, ids);
  expect(orderAfterMouse[0]).not.toBe(id);
  expect(orderAfterMouse.indexOf(id)).toBeGreaterThan(5);
  await expectNoCellCollisions(page);

  const touchId = orderAfterMouse[0];
  const touchTarget = page.locator(`[data-grid-engine-editor-item="${touchId}"]`);
  await scrollContainer.evaluate((element) => { element.scrollTop = 0; });
  await touchTarget.scrollIntoViewIfNeeded();
  const touchBounds = await touchTarget.boundingBox();
  const touchScrollBounds = await scrollContainer.boundingBox();
  if (!touchBounds || !touchScrollBounds) throw new Error('Touch autoscroll surface has no browser bounds.');
  const touchPoint = { x: touchBounds.x + 24, y: touchBounds.y + Math.min(28, touchBounds.height / 2) };
  const beforeTouch = await cellGeometry(page, touchId);
  const draftBeforeTouch = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
  await touchTarget.dispatchEvent('pointerdown', {
    pointerId: 91,
    pointerType: 'touch',
    isPrimary: true,
    clientX: touchPoint.x,
    clientY: touchPoint.y,
    button: 0,
  });
  await page.waitForTimeout(700);
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'DRAGGING');
  await page.evaluate(({ pointerId, x: clientX, y: clientY }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX,
      clientY,
      buttons: 1,
    }));
  }, {
    pointerId: 91,
    x: touchPoint.x,
    y: touchScrollBounds.y + touchScrollBounds.height - 4,
  });
  const touchStartScroll = await scrollTopOf(scrollContainer);
  await expect.poll(() => scrollTopOf(scrollContainer)).toBeGreaterThan(touchStartScroll + 30);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBe(draftBeforeTouch);
  await page.evaluate(({ pointerId, x: clientX, y: clientY }) => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX,
      clientY,
    }));
  }, {
    pointerId: 91,
    x: touchPoint.x,
    y: touchScrollBounds.y + touchScrollBounds.height - 4,
  });
  await expect(renderer).toHaveAttribute('data-grid-engine-editor-gesture', 'IDLE');
  const cancelledAt = await scrollTopOf(scrollContainer);
  await page.waitForTimeout(250);
  expect(Math.abs(await scrollTopOf(scrollContainer) - cancelledAt)).toBeLessThanOrEqual(1);
  expect(await cellGeometry(page, touchId)).toEqual(beforeTouch);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBe(draftBeforeTouch);
});

test('editor flag alone keeps a fresh GE2 save blocked by default', async ({ page }) => {
  test.skip(!EXPECT_EDITOR || EXPECT_QA_SAVE, 'Requires editor ON with the independent QA save flag OFF.');
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, editorFixture());
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);

  await dragEditorItem(page, 'root.sensor', 2);
  await page.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const dialog = page.getByRole('dialog', { name: 'Uscire dalla modalità modifica?' });
  await expect(dialog.getByRole('button', { name: 'Salvataggio sperimentale bloccato' })).toBeDisabled();
  await expect(dialog).toContainText('flag dell’editor da solo non abilita scritture');
  await dialog.getByRole('button', { name: 'Scarta modifiche', exact: true }).click();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
});

test('real Home QA save accepts a verified historical span and archives revision 84 before writing 85', async ({ page }) => {
  test.skip(!EXPECT_EDITOR || !EXPECT_QA_SAVE, 'Requires both development-only editor and QA save flags.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installSimulatedHaQa(page, historicalSpanFixture());
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');

  await expect(frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first()).toBeVisible();
  const panelFrame = page.frames().find((candidate) => candidate.parentFrame());
  if (!panelFrame) throw new Error('Simulated Home Assistant panel frame not found.');
  await panelFrame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState?.sharedReads ?? 0))
    .toBeGreaterThan(0);
  await enterEditMode(frame);
  await frame.getByRole('radio', { name: 'Anteprima desktop' }).click();
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]'))
    .toHaveAttribute('data-breakpoint', 'xl');
  await expect(rootItem(frame, 'root.sensor')).toHaveAttribute('data-grid-w', '2');
  await expect(rootItem(frame, 'root.sensor')).toHaveAttribute('data-grid-h', '1');

  const before = await cellGeometry(frame, 'root.sensor');
  const editorItem = frame.locator('[data-grid-engine-editor-item="root.sensor"]');
  await editorItem.focus();
  await editorItem.press('ArrowDown');
  await expect.poll(() => cellGeometry(frame, 'root.sensor')).toMatchObject({
    y: before.y + 1,
    w: 2,
    h: 1,
  });

  await frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const dialog = frame.getByRole('dialog').filter({ hasText: 'Uscire' });
  await expect(dialog).toContainText('hanno superato la validazione QA');
  await expect(dialog.getByRole('button', { name: 'Salva QA Grid Engine', exact: true }))
    .toBeEnabled();
  await dialog.getByRole('button', { name: 'Salva QA Grid Engine', exact: true }).click();
  await expect(frame.locator('.sections-grid')).not.toHaveClass(/is-editing/);

  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState?.sharedWrites ?? 0))
    .toBe(1);
  const state = await page.evaluate(() => structuredClone(window.__qaSaveHaState));
  expect(state.historyWrites).toBe(1);
  expect(state.revisionHistory.entries.map((entry) => entry.revision)).toContain(84);
  expect(state.sharedDocument.revision).toBe(85);
  expect(state.sharedDocument.dashboard.responsiveLayouts.root.xl
    .find((item) => item.i === 'root.sensor')).toMatchObject({
    x: before.x,
    y: before.y + 1,
    w: 2,
    h: 1,
  });
  expect(state.sharedDocument.dashboard.widgets
    .find((item) => item.id === 'root.sensor').layout).toMatchObject({
    x: before.x,
    y: before.y + 1,
    w: 2,
    h: 1,
  });
});

test('real Home blocks QA save when a newer HA revision makes the structural baseline non-current', async ({ page }) => {
  test.skip(!EXPECT_EDITOR || !EXPECT_QA_SAVE, 'Requires both development-only editor and QA save flags.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installSimulatedHaQa(page, historicalSpanFixture());
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');

  await expect(frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first()).toBeVisible();
  const panelFrame = page.frames().find((candidate) => candidate.parentFrame());
  if (!panelFrame) throw new Error('Simulated Home Assistant panel frame not found.');
  await panelFrame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState?.sharedReads ?? 0))
    .toBeGreaterThan(0);
  await enterEditMode(frame);
  await frame.getByRole('radio', { name: 'Anteprima desktop' }).click();
  const editorItem = frame.locator('[data-grid-engine-editor-item="root.sensor"]');
  await editorItem.focus();
  await editorItem.press('ArrowDown');

  const readsBeforeRemote = await page.evaluate(() => window.__qaSaveHaState.sharedReads);
  await page.evaluate(() => window.__publishQaSaveRemoteRevision());
  await panelFrame.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__qaSaveHaState.sharedReads))
    .toBeGreaterThan(readsBeforeRemote);

  await frame.locator('button[aria-label^="Attiva o disattiva"]:visible').first().click();
  const dialog = frame.getByRole('dialog').filter({ hasText: 'Uscire' });
  await expect(dialog.getByRole('button', { name: 'Salvataggio sperimentale bloccato' }))
    .toBeDisabled();
  await expect(dialog).toContainText('È pendente la revisione Home Assistant 85');
  await expect(dialog).toContainText('Applica o risolvi l’aggiornamento remoto prima di salvare');
  expect(await page.evaluate(() => window.__qaSaveHaState.sharedWrites)).toBe(0);
  expect(await page.evaluate(() => window.__qaSaveHaState.historyWrites)).toBe(0);
  await dialog.getByRole('button', { name: 'Scarta modifiche', exact: true }).click();
});

test('explicit QA save persists Manual XL geometry through the existing flow without runtime Light contamination', async ({ page }) => {
  test.skip(!EXPECT_EDITOR || !EXPECT_QA_SAVE, 'Requires both development-only editor and QA save flags.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, editorFixture());
  const apiRequests = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') || request.resourceType() === 'websocket') apiRequests.push(request.url());
  });
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);

  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  await expect(rootItem(page, 'root.light')).toHaveAttribute('data-grid-h', '2');
  await dragEditorItem(page, 'root.sensor', 2);
  const committed = await cellGeometry(page, 'root.sensor');
  await saveAndExitQa(page);

  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(after.responsiveLayouts.root.xl.find((item) => item.i === 'root.sensor')).toEqual({
    i: 'root.sensor', ...committed,
  });
  expect(after.widgets.find((item) => item.id === 'root.sensor').layout).toEqual({
    i: 'root.sensor', ...committed,
  });
  expect(after.responsiveLayouts.root.xl.find((item) => item.i === 'root.light').h).toBe(1);
  expect(after.widgets.find((item) => item.id === 'root.light').layout.h).toBe(1);
  expect(after.widgets.find((item) => item.id === 'root.light').isOn).toBe(true);
  expect(after.widgets.find((item) => item.id === 'stack.child')).toEqual(
    before.widgets.find((item) => item.id === 'stack.child'),
  );
  for (const breakpoint of ['2xl', 'lg', 'md', 'sm', 'xs']) {
    expect(after.responsiveLayouts.root[breakpoint]).toEqual(before.responsiveLayouts.root[breakpoint]);
  }
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();
  expect(apiRequests).toEqual([]);

  await page.reload();
  await enterEditMode(page);
  await selectDesktopPreview(page);
  expect(await cellGeometry(page, 'root.sensor')).toEqual(committed);
  await expect(rootItem(page, 'root.light')).toHaveAttribute('data-grid-h', '2');
});

test('explicit QA save changes LG only and leaves XL plus canonical geometry byte-equivalent', async ({ page }) => {
  test.skip(!EXPECT_EDITOR || !EXPECT_QA_SAVE, 'Requires both development-only editor and QA save flags.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, editorFixture());
  await page.goto('/home');
  await enterEditMode(page);
  await page.getByRole('radio', { name: 'Anteprima automatica' }).click();
  for (const width of [1900, 1800, 1700, 1600, 1500]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(120);
    if (await page.locator('[data-grid-engine-root-renderer="grid-engine-2"][data-breakpoint="lg"]').count()) break;
  }
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveAttribute('data-breakpoint', 'lg');

  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  await dragEditorItem(page, 'root.sensor', 2);
  const committedLg = await cellGeometry(page, 'root.sensor');
  await saveAndExitQa(page);
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);

  expect(after.responsiveLayouts.root.lg.find((item) => item.i === 'root.sensor')).toEqual({
    i: 'root.sensor', ...committedLg,
  });
  expect(after.responsiveLayouts.root.xl).toEqual(before.responsiveLayouts.root.xl);
  expect(after.sections.map((section) => section.layout)).toEqual(before.sections.map((section) => section.layout));
  expect(after.widgets.map((item) => item.layout)).toEqual(before.widgets.map((item) => item.layout));
  for (const breakpoint of ['2xl', 'md', 'sm', 'xs']) {
    expect(after.responsiveLayouts.root[breakpoint]).toEqual(before.responsiveLayouts.root[breakpoint]);
  }

  await page.reload();
  await enterEditMode(page);
  await page.getByRole('radio', { name: 'Anteprima automatica' }).click();
  await expect(page.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveAttribute('data-breakpoint', 'lg');
  expect(await cellGeometry(page, 'root.sensor')).toEqual(committedLg);
});

test('explicit QA save preserves Automatic reorder and compact geometry after reload', async ({ page }) => {
  test.skip(!EXPECT_EDITOR || !EXPECT_QA_SAVE, 'Requires both development-only editor and QA save flags.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, automaticReorderFixture());
  await page.goto('/home');
  await enterEditMode(page);
  await selectDesktopPreview(page);
  await page.getByTestId('grid-engine-2-editor-mode-automatic').click();

  const ids = ['root.order-a', 'root.order-b', 'root.order-c'];
  const drag = await beginEditorDragWithCadence(page, ids[0], 2, { steps: 12, delayMs: 15 });
  await page.mouse.up();
  await expect.poll(() => rootOrder(page, ids)).toEqual([ids[1], ids[2], ids[0]]);
  const committed = await Promise.all(ids.map((id) => cellGeometry(page, id)));
  await saveAndExitQa(page);
  expect(drag.renderer).toBeDefined();

  await page.reload();
  await enterEditMode(page);
  await selectDesktopPreview(page);
  expect(await rootOrder(page, ids)).toEqual([ids[1], ids[2], ids[0]]);
  expect(await Promise.all(ids.map((id) => cellGeometry(page, id)))).toEqual(committed);
  await expectNoCellCollisions(page);
});

test('unsupported dynamic Stack geometry falls back to RGL without a GE2 commit surface', async ({ page }) => {
  test.skip(!EXPECT_EDITOR, 'Requires VITE_GRID_ENGINE_2_EDITOR=true on the development server.');
  await page.setViewportSize({ width: 1920, height: 1000 });
  await installDemo(page, editorFixture({ dynamicStack: true }));
  await page.goto('/home');
  await enterEditMode(page);
  await page.getByRole('radio', { name: 'Anteprima desktop' }).click();

  await expect(page.locator('[data-grid-engine-editor="legacy-fallback"]')).toBeVisible();
  await expect(page.locator('[data-grid-engine-editor="legacy-fallback"]')).toHaveAttribute(
    'data-grid-engine-editor-fallback',
    'UNSUPPORTED_DYNAMIC_STACK',
  );
  await expect(page.locator('[data-grid-engine-editor-item]')).toHaveCount(0);
  await expect(page.getByTestId('grid-engine-2-editor-status')).toContainText('RGL fallback');
});
