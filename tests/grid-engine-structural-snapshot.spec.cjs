const { test, expect } = require('@playwright/test');

const RUNTIME_SHADOW_PREFIX = '[DomusUI:grid-engine2:runtime-shadow]';
const SHARED_CONFIGURATION_KEY = 'premium-home.shared-house.v1';
const OWNER_ID = 'snapshot-owner';

function layouts(ids, includeAbsentId = false) {
  const columns = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  return Object.fromEntries(Object.entries(columns).map(([breakpoint, cols]) => {
    const width = cols <= 4 ? 1 : 2;
    const perRow = Math.max(1, Math.floor(cols / width));
    const items = ids.map((id, index) => ({
      i: id,
      x: (index % perRow) * width,
      y: Math.floor(index / perRow),
      w: width,
      h: 1,
    }));
    if (includeAbsentId) {
      items.push({ i: 'removed-on-server', x: 0, y: Math.ceil(ids.length / perRow), w: width, h: 1 });
    }
    return [breakpoint, items];
  }));
}

function dashboard(count, prefix, includeAbsentId = false) {
  const ids = Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
  const xlById = new Map(layouts(ids).xl.map((item) => [item.i, item]));
  return {
    storageVersion: 14,
    sections: [],
    widgets: ids.map((id, index) => ({
      id,
      kind: index === 0 ? 'light' : 'sensor',
      title: `${prefix} ${index}`,
      entityId: index === 0 ? 'light.snapshot' : `sensor.snapshot_${index}`,
      status: index === 0 ? 'off' : 'ready',
      isOn: false,
      placementPolicy: 'manual',
      layout: { ...xlById.get(id), i: id },
    })),
    widgetTypeLayoutOverrides: { light: { xl: { hOff: 1, hOn: 2 } } },
    widgetLayoutOverrides: {},
    responsiveLayouts: { root: layouts(ids, includeAbsentId) },
  };
}

function sharedDocument(revision, value) {
  return {
    schema: 'premium-home-house-configuration',
    version: 1,
    revision,
    updatedAt: new Date(Date.UTC(2026, 9, 15, 12, 0, revision)).toISOString(),
    updatedByUserId: OWNER_ID,
    publication: { source: 'edit', originClientId: 'remote-fixture' },
    dashboard: value,
    security: { alarmEntityId: null, visibleSensorEntityIds: null, visibleCameraEntityIds: null },
    rooms: { customRooms: [], hiddenEntitiesByRoom: {} },
  };
}

async function installDelayedPanelBridge(page, localDashboard, authoritativeDocument) {
  await page.goto('/home');
  await page.evaluate(({ localDashboard, authoritativeDocument, ownerId, sharedKey }) => {
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
      sections: localDashboard.sections,
      widgets: localDashboard.widgets,
      widgetTypeLayoutOverrides: localDashboard.widgetTypeLayoutOverrides,
      widgetLayoutOverrides: localDashboard.widgetLayoutOverrides,
      responsiveLayouts: localDashboard.responsiveLayouts,
    }));

    const origin = window.location.origin;
    const owner = {
      id: ownerId,
      name: 'Snapshot Owner',
      username: 'snapshot@example.test',
      is_owner: true,
      is_admin: true,
      is_active: true,
      system_generated: false,
      group_ids: ['system-admin'],
    };
    const offState = {
      'light.snapshot': {
        entity_id: 'light.snapshot', state: 'off', attributes: { friendly_name: 'Snapshot Light' },
        last_changed: '2026-10-15T12:00:00.000Z', last_updated: '2026-10-15T12:00:00.000Z',
      },
    };
    let panelWindow = null;
    let released = false;
    let currentDocument = authoritativeDocument;
    const pendingConfigurationReads = [];
    window.__snapshotHaMetrics = { sharedReads: 0, sharedWrites: 0 };
    const reply = (target, requestId, result) => target.postMessage({
      type: 'ha-panel-call-api-result', requestId, ok: true, result,
    }, origin);
    const replyConfiguration = ({ target, requestId }) => {
      window.__snapshotHaMetrics.sharedReads += 1;
      reply(target, requestId, { value: currentDocument });
    };
    window.__releaseSnapshotConfiguration = () => {
      released = true;
      pendingConfigurationReads.splice(0).forEach(replyConfiguration);
    };
    window.__setSnapshotConfiguration = (document) => {
      currentDocument = document;
    };
    window.__sendSnapshotLightState = (isOn) => {
      if (!panelWindow) return;
      panelWindow.postMessage({
        type: 'ha-panel-snapshot',
        hassUrl: origin,
        bridgeProtocolVersion: 1,
        capabilities: ['shared_configuration'],
        states: {
          'light.snapshot': {
            ...offState['light.snapshot'],
            state: isOn ? 'on' : 'off',
            last_updated: new Date().toISOString(),
          },
        },
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
          capabilities: ['shared_configuration'], states: offState, areas: [],
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
          const pending = { target: event.source, requestId: event.data.requestId };
          if (released) replyConfiguration(pending);
          else pendingConfigurationReads.push(pending);
        } else if (message.type === 'frontend/set_system_data' && message.key === sharedKey) {
          window.__snapshotHaMetrics.sharedWrites += 1;
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
  }, { localDashboard, authoritativeDocument, ownerId: OWNER_ID, sharedKey: SHARED_CONFIGURATION_KEY });
}

async function stableGeometry(frame) {
  await frame.waitForFunction(() => new Promise((resolve) => {
    let previous = '';
    let stableFrames = 0;
    const inspect = () => {
      const current = JSON.stringify([...document.querySelectorAll('.sections-grid > *:not(.react-grid-placeholder)')]
        .map((item) => [item.getAttribute('data-grid-item-id'), item.getAttribute('style')]));
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 3) resolve(true);
      else requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  }));
  return frame.locator('.sections-grid > *:not(.react-grid-placeholder)').evaluateAll((items) =>
    items.map((item) => ({ id: item.getAttribute('data-grid-item-id'), style: item.getAttribute('style') })));
}

test('authoritative snapshot replaces local structure atomically and deduplicates unchanged HA reads', async ({ page }) => {
  test.skip(process.env.VITE_GRID_ENGINE_2_RUNTIME_SHADOW !== 'true' ||
    process.env.VITE_GRID_ENGINE_2_RUNTIME_SHADOW_RECONCILE !== 'true',
  'requires Runtime Shadow and reconciliation feature flags');
  test.setTimeout(120_000);
  const reports = [];
  const browserErrors = [];
  page.on('console', async (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
    if (!message.text().includes(RUNTIME_SHADOW_PREFIX)) return;
    const detail = message.args()[1];
    reports.push(detail ? await detail.jsonValue().catch(() => ({ event: 'unreadable' })) : {});
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  const local = dashboard(22, 'local');
  const server = dashboard(21, 'server', true);
  await installDelayedPanelBridge(page, local, sharedDocument(84, server));
  const frame = page.frameLocator('iframe[title="Home Assistant panel"]');

  await expect(frame.locator('.sections-grid > *:not(.react-grid-placeholder)')).toHaveCount(22);
  const child = page.frames().find((candidate) => candidate.parentFrame());
  expect(child).toBeTruthy();
  await expect.poll(() => reports.some((report) =>
    report.event === 'report' && report.counts?.roots === 22 && report.structuralContext?.revision === null
  )).toBe(true);

  await page.evaluate(() => window.__releaseSnapshotConfiguration());
  await expect(frame.locator('.sections-grid > *:not(.react-grid-placeholder)')).toHaveCount(21);
  await expect.poll(() => reports.some((report) =>
    report.event === 'report' &&
    report.counts?.roots === 21 &&
    report.structuralContext?.revision === 84 &&
    report.reconciliation?.classifications?.some((entry) =>
      entry.classification === 'ABSENT_FROM_CURRENT_CONFIG'
    )
  )).toBe(true);
  const authoritativeReportCount = reports.length;
  const metricsAfterLoad = await page.evaluate(() => ({ ...window.__snapshotHaMetrics }));
  expect(metricsAfterLoad.sharedWrites).toBe(0);

  await child.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__snapshotHaMetrics.sharedReads))
    .toBeGreaterThan(metricsAfterLoad.sharedReads);
  await expect.poll(() => reports.length).toBe(authoritativeReportCount);

  const nextServer = dashboard(20, 'server-next', true);
  await page.evaluate((document) => window.__setSnapshotConfiguration(document), sharedDocument(85, nextServer));
  await child.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(frame.locator('.sections-grid > *:not(.react-grid-placeholder)')).toHaveCount(20);
  await expect.poll(() => reports.some((report) =>
    report.event === 'report' &&
    report.counts?.roots === 20 &&
    report.structuralContext?.generation === 2 &&
    report.structuralContext?.revision === 85 &&
    report.reconciliation?.classifications?.some((entry) =>
      entry.classification === 'ABSENT_FROM_CURRENT_CONFIG'
    )
  )).toBe(true);
  const revisionGeometry = await stableGeometry(child);

  await page.evaluate(() => window.__sendSnapshotLightState(true));
  await expect(frame.locator('.light-card')).toHaveAttribute('data-light-state', 'on');
  await expect.poll(() => reports.some((report) =>
    report.event === 'report' && report.structuralContext?.revision === 85 && report.counts?.overrides === 1
  )).toBe(true);
  const metricsAfterState = await page.evaluate(() => ({ ...window.__snapshotHaMetrics }));
  expect(metricsAfterState.sharedReads).toBeGreaterThanOrEqual(metricsAfterLoad.sharedReads);
  expect(metricsAfterState.sharedWrites).toBe(0);
  expect(browserErrors).toEqual([]);
  expect(await stableGeometry(child)).not.toEqual(revisionGeometry);
  await expect(frame.locator('.dashboard-edit-overlay')).toHaveCount(0);
});
