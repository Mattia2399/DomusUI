const { test, expect } = require('@playwright/test');

const SHARED_CONFIGURATION_KEY = 'premium-home.shared-house.v1';
const DECISION_PREFIX = '[DomusUI:grid-engine2:runtime-render]';
const EXPECT_CUSTOM = process.env.VITE_GRID_ENGINE_2_RENDERER === 'true';
const EXPECT_SOLVER = EXPECT_CUSTOM &&
  process.env.VITE_GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER === 'true';

function responsiveLayouts(ids, { orphan = false, missingBreakpoint = null } = {}) {
  const columns = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  return Object.fromEntries(Object.entries(columns).flatMap(([breakpoint, cols]) => {
    if (breakpoint === missingBreakpoint) return [];
    const span = cols <= 4 ? 1 : 2;
    const laneX = Math.min(span, Math.max(0, cols - span));
    const perRow = Math.max(1, Math.floor(cols / span));
    const layout = [
      { i: ids[0], x: 0, y: 0, w: span, h: 1 },
      { i: ids[1], x: 0, y: 1, w: span, h: 1 },
      { i: ids[2], x: 0, y: 2, w: span, h: 1 },
      { i: ids[3], x: laneX, y: 0, w: Math.max(1, Math.min(span, cols - laneX)), h: 2 },
      ...ids.slice(4).map((id, index) => ({
        i: id,
        x: (index % perRow) * span,
        y: 4 + Math.floor(index / perRow),
        w: span,
        h: 1,
      })),
    ];
    if (orphan) layout.push({ i: 'orphan.persisted-id', x: 0, y: 20, w: span, h: 1 });
    return [[breakpoint, layout]];
  }));
}

function dashboard({ orphan = false, missingBreakpoint = null } = {}) {
  const ids = [
    'solver.light',
    'solver.direct',
    'solver.chain',
    'solver.other-lane',
    ...Array.from({ length: 17 }, (_, index) => `solver.fill-${index + 1}`),
  ];
  const layouts = responsiveLayouts(ids, { orphan, missingBreakpoint });
  const xlById = new Map((layouts.xl ?? []).map((item) => [item.i, item]));
  return {
    storageVersion: 14,
    sections: [],
    widgets: ids.map((id, index) => ({
      id,
      kind: index === 0 ? 'light' : 'sensor',
      title: index === 0 ? 'Solver Light' : `Solver Root ${index}`,
      entityId: index === 0 ? 'light.solver' : `sensor.solver_${index}`,
      status: index === 0 ? 'off' : 'ready',
      isOn: false,
      placementPolicy: 'manual',
      layout: { ...(xlById.get(id) ?? { x: 0, y: index, w: 2, h: 1 }), i: id },
    })),
    widgetTypeLayoutOverrides: {
      light: Object.fromEntries(Object.keys(layouts).map((breakpoint) => [breakpoint, {
        hOff: 1,
        hOn: 2,
        autoExpand: true,
      }])),
    },
    widgetLayoutOverrides: {},
    responsiveLayouts: { root: layouts },
  };
}

function dynamicStackDashboard() {
  const columns = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  const rootLayouts = Object.fromEntries(Object.entries(columns).map(([breakpoint, cols]) => [breakpoint, [
    { i: 'solver.stack', x: 0, y: 0, w: Math.min(cols, 2), h: 3 },
    { i: 'solver.outside', x: 0, y: 3, w: Math.min(cols, 2), h: 1 },
  ]]));
  const stackLayouts = Object.fromEntries(Object.keys(columns).map((breakpoint) => [breakpoint, [
    { i: 'solver.stack-light', x: 0, y: 0, w: 1, h: 2 },
    { i: 'solver.stack-sensor', x: 1, y: 0, w: 1, h: 2 },
  ]]));
  return {
    storageVersion: 14,
    sections: [{
      id: 'solver.stack',
      kind: 'stack-grid',
      title: 'Solver Dynamic Stack',
      stackColumns: 2,
      stackColumnsMode: 'auto',
      stackShowBackground: true,
      stackShowBorder: true,
      stackShowHeader: true,
      layout: rootLayouts.xl[0],
    }],
    widgets: [
      {
        id: 'solver.stack-light', kind: 'light', title: 'Stack Light', entityId: 'light.stack_solver',
        parentSectionId: 'solver.stack', placementPolicy: 'manual', status: 'off', isOn: false,
        layout: { i: 'solver.stack-light', x: 0, y: 0, w: 1, h: 2 },
      },
      {
        id: 'solver.stack-sensor', kind: 'sensor', title: 'Stack Sensor', entityId: 'sensor.stack_solver',
        parentSectionId: 'solver.stack', placementPolicy: 'manual', status: 'ready',
        layout: { i: 'solver.stack-sensor', x: 1, y: 0, w: 1, h: 2 },
      },
      {
        id: 'solver.outside', kind: 'sensor', title: 'Outside Stack', entityId: 'sensor.outside_solver',
        placementPolicy: 'manual', status: 'ready', layout: rootLayouts.xl[1],
      },
    ],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: { root: rootLayouts, stacks: { 'solver.stack': stackLayouts } },
  };
}

async function installPanelBridge(page, serverDashboard) {
  await page.goto('/home');
  await page.evaluate(({ serverDashboard, sharedKey }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2, phase: 'done', mode: 'real', updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.builder.layout.v1', JSON.stringify({
      version: 14,
      sections: serverDashboard.sections,
      widgets: serverDashboard.widgets,
      widgetTypeLayoutOverrides: serverDashboard.widgetTypeLayoutOverrides,
      widgetLayoutOverrides: serverDashboard.widgetLayoutOverrides,
      responsiveLayouts: serverDashboard.responsiveLayouts,
    }));

    const origin = window.location.origin;
    const owner = {
      id: 'runtime-solver-owner',
      name: 'Runtime Solver Owner',
      username: 'runtime-solver@example.test',
      is_owner: true,
      is_admin: true,
      is_active: true,
      system_generated: false,
      group_ids: ['system-admin'],
    };
    const state = (isOn) => ({
      'light.solver': {
        entity_id: 'light.solver',
        state: isOn ? 'on' : 'off',
        attributes: { friendly_name: 'Solver Light' },
        last_changed: '2026-10-19T08:00:00.000Z',
        last_updated: new Date().toISOString(),
      },
    });
    let panelWindow = null;
    let released = false;
    const pendingConfigurationReads = [];
    const documentValue = {
      schema: 'premium-home-house-configuration',
      version: 1,
      revision: 104,
      updatedAt: '2026-10-19T08:00:00.000Z',
      updatedByUserId: owner.id,
      publication: { source: 'edit', originClientId: 'runtime-solver-fixture' },
      dashboard: serverDashboard,
      security: { alarmEntityId: null, visibleSensorEntityIds: null, visibleCameraEntityIds: null },
      rooms: { customRooms: [], hiddenEntitiesByRoom: {} },
    };
    window.__runtimeSolverMetrics = {
      sharedReads: 0,
      sharedWrites: 0,
      apiCalls: 0,
      serviceCalls: 0,
      apiTypes: {},
    };
    const reply = (target, requestId, result) => target.postMessage({
      type: 'ha-panel-call-api-result', requestId, ok: true, result,
    }, origin);
    const replyConfiguration = ({ target, requestId }) => {
      window.__runtimeSolverMetrics.sharedReads += 1;
      reply(target, requestId, { value: documentValue });
    };
    window.__releaseRuntimeSolverConfiguration = () => {
      released = true;
      pendingConfigurationReads.splice(0).forEach(replyConfiguration);
    };
    window.__sendRuntimeSolverLightState = (isOn) => {
      panelWindow?.postMessage({
        type: 'ha-panel-snapshot',
        hassUrl: origin,
        bridgeProtocolVersion: 1,
        capabilities: ['shared_configuration'],
        states: state(isOn),
        areas: [],
      }, origin);
    };

    window.addEventListener('message', (event) => {
      if (event.origin !== origin || !event.source || !event.data) return;
      if (event.data.type === 'ha-panel-ready' || event.data.type === 'ha-panel-request-sync') {
        panelWindow = event.source;
        event.source.postMessage({
          type: 'ha-panel-context', hassUrl: origin, bridgeProtocolVersion: 1,
          capabilities: ['shared_configuration'],
        }, origin);
        event.source.postMessage({
          type: 'ha-panel-snapshot', hassUrl: origin, bridgeProtocolVersion: 1,
          capabilities: ['shared_configuration'], states: state(false), areas: [],
        }, origin);
        return;
      }
      if (event.data.type === 'ha-panel-call-api') {
        window.__runtimeSolverMetrics.apiCalls += 1;
        const message = event.data.message ?? {};
        const apiType = String(message.type ?? 'unknown');
        window.__runtimeSolverMetrics.apiTypes[apiType] =
          (window.__runtimeSolverMetrics.apiTypes[apiType] ?? 0) + 1;
        if (apiType === 'call_service' || apiType.endsWith('/call_service')) {
          window.__runtimeSolverMetrics.serviceCalls += 1;
        }
        if (message.type === 'auth/current_user') {
          reply(event.source, event.data.requestId, owner);
        } else if (message.type === 'config/auth/list' || message.type === 'auth/list') {
          reply(event.source, event.data.requestId, [owner]);
        } else if (message.type === 'frontend/get_system_data' && message.key === sharedKey) {
          const pending = { target: event.source, requestId: event.data.requestId };
          if (released) replyConfiguration(pending);
          else pendingConfigurationReads.push(pending);
        } else if (message.type === 'frontend/set_system_data' && message.key === sharedKey) {
          window.__runtimeSolverMetrics.sharedWrites += 1;
          reply(event.source, event.data.requestId, undefined);
        } else if (message.type === 'frontend/get_system_data' || message.type === 'frontend/get_user_data') {
          reply(event.source, event.data.requestId, { value: null });
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
  }, { serverDashboard, sharedKey: SHARED_CONFIGURATION_KEY });
}

async function rootCells(frame) {
  return frame.locator('[data-grid-engine-root-item]').evaluateAll((items) => items.map((item) => ({
    id: item.getAttribute('data-grid-engine-root-item'),
    x: Number(item.getAttribute('data-grid-x')),
    y: Number(item.getAttribute('data-grid-y')),
    w: Number(item.getAttribute('data-grid-w')),
    h: Number(item.getAttribute('data-grid-h')),
  })));
}

function collisionCount(items) {
  return items.reduce((count, item, index) => count + items.slice(0, index).filter((previous) => (
    item.x < previous.x + previous.w &&
    item.x + item.w > previous.x &&
    item.y < previous.y + previous.h &&
    item.y + item.h > previous.y
  )).length, 0);
}

async function waitForSolverDecision(frame) {
  const host = frame.locator('[data-grid-engine-runtime-render-decision]');
  await expect(host).toHaveAttribute(
    'data-grid-engine-runtime-render-decision',
    EXPECT_SOLVER ? 'custom-solver' : EXPECT_CUSTOM ? 'existing-renderer' : 'existing-renderer',
  );
  return host;
}

test('verified HA snapshot drives a reversible Runtime Solver custom render', async ({ page }) => {
  test.skip(!EXPECT_SOLVER, 'requires both custom renderer and Runtime Solver Renderer flags');
  test.setTimeout(180_000);
  const decisions = [];
  const browserErrors = [];
  page.on('console', async (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
    if (!message.text().includes(DECISION_PREFIX)) return;
    const detail = message.args()[1];
    decisions.push(detail ? await detail.jsonValue().catch(() => ({ event: 'unreadable' })) : {});
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await installPanelBridge(page, dashboard());
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');
  await expect(frame.locator('.sections-grid > .react-grid-item')).toHaveCount(21);
  const host = frame.locator('[data-grid-engine-runtime-render-decision]');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-decision', 'legacy-fallback');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-fallback', 'snapshot-not-authoritative');
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(0);
  await page.evaluate(() => window.__releaseRuntimeSolverConfiguration());
  await waitForSolverDecision(frame);
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(1);
  await expect(frame.locator('[data-grid-engine-root-item]')).toHaveCount(21);

  const off = await rootCells(frame);
  expect(collisionCount(off)).toBe(0);
  expect(off.find((item) => item.id === 'solver.light')).toMatchObject({ y: 0, h: 1 });
  expect(off.find((item) => item.id === 'solver.direct')).toMatchObject({ y: 1 });
  expect(off.find((item) => item.id === 'solver.chain')).toMatchObject({ y: 2 });
  const metricsBeforeState = await page.evaluate(() => ({ ...window.__runtimeSolverMetrics }));

  const onStartedAt = await page.evaluate(() => performance.now());
  await page.evaluate(() => window.__sendRuntimeSolverLightState(true));
  await expect(frame.locator('[data-grid-engine-root-item="solver.light"]')).toHaveAttribute('data-grid-h', '2');
  const on = await rootCells(frame);
  const onElapsed = await page.evaluate((startedAt) => performance.now() - startedAt, onStartedAt);
  expect(collisionCount(on)).toBe(0);
  expect(on.find((item) => item.id === 'solver.direct')).toMatchObject({ y: 2 });
  expect(on.find((item) => item.id === 'solver.chain')).toMatchObject({ y: 3 });
  const lightBounds = await frame.locator('[data-grid-engine-root-item="solver.light"]').evaluate((root) => {
    const card = root.querySelector('.light-card');
    const rootRect = root.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    return {
      rootHeight: rootRect.height,
      cardHeight: cardRect?.height ?? 0,
      contained: Boolean(cardRect && cardRect.top >= rootRect.top - 1 && cardRect.bottom <= rootRect.bottom + 1),
    };
  });
  expect(lightBounds.contained).toBe(true);
  expect(lightBounds.cardHeight).toBeGreaterThan(0);

  await page.evaluate(() => window.__sendRuntimeSolverLightState(false));
  await expect(frame.locator('[data-grid-engine-root-item="solver.light"]')).toHaveAttribute('data-grid-h', '1');
  expect(await rootCells(frame)).toEqual(off);
  const metricsAfterState = await page.evaluate(() => ({ ...window.__runtimeSolverMetrics }));
  expect(metricsAfterState.sharedWrites).toBe(0);
  expect(metricsAfterState.serviceCalls).toBe(metricsBeforeState.serviceCalls);

  const responsive = [
    { width: 2200, breakpoint: '2xl' },
    { width: 1920, breakpoint: 'xl' },
    { width: 1700, breakpoint: 'lg' },
    { width: 1600, breakpoint: 'md' },
    { width: 1200, breakpoint: 'sm' },
    { width: 500, breakpoint: 'xs' },
  ];
  for (const sample of responsive) {
    await page.setViewportSize({ width: sample.width, height: 940 });
    await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]'))
      .toHaveAttribute('data-breakpoint', sample.breakpoint);
    expect(collisionCount(await rootCells(frame))).toBe(0);
    await expect(host).toHaveAttribute('data-grid-engine-runtime-render-decision', 'custom-solver');
  }

  const reportCount = decisions.length;
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(400);
  expect(decisions.length).toBe(reportCount);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]'))
    .toHaveAttribute('data-breakpoint', 'xl');
  await frame.locator('[data-tour-target="edit-mode"]:visible').first().click();
  await frame.getByRole('button', { name: 'Attiva', exact: true }).click();
  await expect(frame.locator('.dashboard-edit-overlay')).toHaveCount(1);
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-decision', 'legacy-fallback');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-fallback', 'edit-mode');
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(0);

  await frame.locator('[data-tour-target="edit-mode"]:visible').first().click();
  const confirmExit = frame.getByRole('button', { name: /^(Salva ed esci|Esci)$/ });
  await expect(confirmExit).toBeVisible();
  await confirmExit.click();
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-decision', 'custom-solver');
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(1);
  await expect(frame.getByText('Solver Root 1', { exact: true })).toBeVisible();

  expect(browserErrors).toEqual([]);
  expect(JSON.stringify(decisions)).not.toContain('solver.light');
  expect(JSON.stringify(decisions)).not.toContain('access_token');
  expect(decisions.some((entry) => entry.decision === 'custom-solver' && entry.revision === 104)).toBe(true);
  console.log('[runtime-solver-renderer browser performance]', JSON.stringify({
    roots: 21,
    stateToRenderMs: Math.round(onElapsed * 10) / 10,
    decisionReports: decisions.length,
  }));
});

test('an orphan structural ID falls back immediately to usable RGL', async ({ page }) => {
  test.skip(!EXPECT_SOLVER, 'requires both custom renderer and Runtime Solver Renderer flags');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installPanelBridge(page, dashboard({ orphan: true }));
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');
  await expect(frame.locator('.sections-grid > .react-grid-item')).toHaveCount(21);
  await page.evaluate(() => window.__releaseRuntimeSolverConfiguration());
  const host = frame.locator('[data-grid-engine-runtime-render-decision]');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-decision', 'legacy-fallback');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-fallback', 'invalid-structural-layout');
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(0);
  await expect(frame.locator('.sections-grid.react-grid-layout')).toHaveCount(1);
  await expect(frame.getByText('Solver Light', { exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.__runtimeSolverMetrics)).sharedWrites).toBe(0);
});

test('missing active breakpoint falls back without completing the layout', async ({ page }) => {
  test.skip(!EXPECT_SOLVER, 'requires both custom renderer and Runtime Solver Renderer flags');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 500, height: 900 });
  await installPanelBridge(page, dashboard({ missingBreakpoint: 'xs' }));
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');
  await expect(frame.locator('.sections-grid > .react-grid-item')).toHaveCount(21);
  await page.evaluate(() => window.__releaseRuntimeSolverConfiguration());
  const host = frame.locator('[data-grid-engine-runtime-render-decision]');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-decision', 'legacy-fallback');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-fallback', 'missing-explicit-layout');
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(0);
  await expect(frame.locator('.sections-grid.react-grid-layout')).toHaveCount(1);
  expect((await page.evaluate(() => window.__runtimeSolverMetrics)).sharedWrites).toBe(0);
});

test('a root Stack remains on RGL until runtime Stack geometry is supported', async ({ page }) => {
  test.skip(!EXPECT_SOLVER, 'requires both custom renderer and Runtime Solver Renderer flags');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installPanelBridge(page, dynamicStackDashboard());
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');
  await expect(frame.locator('.sections-grid > .react-grid-item')).toHaveCount(2);
  await page.evaluate(() => window.__releaseRuntimeSolverConfiguration());
  const host = frame.locator('[data-grid-engine-runtime-render-decision]');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-decision', 'legacy-fallback');
  await expect(host).toHaveAttribute('data-grid-engine-runtime-render-fallback', 'unsupported-dynamic-component');
  await expect(frame.locator('[data-grid-engine-root-renderer="grid-engine-2"]')).toHaveCount(0);
  await expect(frame.getByText('Solver Dynamic Stack', { exact: true })).toBeVisible();
  await expect(frame.getByText('Outside Stack', { exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.__runtimeSolverMetrics)).sharedWrites).toBe(0);
});
