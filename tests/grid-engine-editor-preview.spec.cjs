const { test, expect } = require('@playwright/test');

test.skip(
  process.env.VITE_GRID_ENGINE_2_PREVIEW_DIAGNOSTIC !== 'true',
  'The historical preview is an opt-in DEV diagnostic after the editor cutover.',
);

const STORAGE_KEY = 'ha.dashboard.demo.builder.layout.v1';

function widget(id, kind, title, layout, parentSectionId) {
  return {
    id,
    kind,
    title,
    entityId: `${kind}.${id.replaceAll('.', '_')}`,
    dataSource: 'mock',
    status: kind === 'light' ? 'Accesa' : 'Attivo',
    isOn: true,
    value: 50,
    unit: '%',
    ...(parentSectionId ? { parentSectionId } : {}),
    layout: { i: id, ...layout },
  };
}

function editorFixture() {
  const rootIds = ['special', 'stack', 'root.light', 'root.sensor', 'alarm.custom_12'];
  const breakpointCols = { '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  const root = Object.fromEntries(Object.entries(breakpointCols).map(([breakpoint, cols]) => [
    breakpoint,
    rootIds.map((id, index) => ({
      i: id,
      x: index % 2 === 0 ? 0 : Math.max(0, cols - Math.min(2, cols)),
      y: index * 3,
      w: Math.min(2, cols),
      h: id === 'stack' ? 2 : 1,
    })),
  ]));
  return {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: { root },
    sections: [
      { id: 'special', kind: 'greeting', title: 'Special editor section', layout: { i: 'special', x: 0, y: 0, w: 6, h: 1 } },
      {
        id: 'stack', kind: 'stack-grid', title: 'Atomic editor Stack', stackColumns: 2,
        stackShowBackground: true, stackShowBorder: true, stackShowHeader: true,
        layout: { i: 'stack', x: 6, y: 0, w: 6, h: 4 },
      },
    ],
    widgets: [
      widget('root.light', 'light', 'Editor Light', { x: 0, y: 5, w: 3, h: 1 }),
      widget('root.sensor', 'sensor', 'Editor Sensor', { x: 3, y: 5, w: 3, h: 1 }),
      widget('alarm.custom_12', 'alarm', 'New alarm', { x: 6, y: 5, w: 3, h: 1 }),
      widget('stack.child', 'sensor', 'Stack child excluded', { x: 0, y: 0, w: 2, h: 1 }, 'stack'),
    ],
  };
}

function responsiveEditorFixture() {
  const sectionIds = ['section.greeting', 'section.weather'];
  const widgetIds = Array.from({ length: 9 }, (_, index) => `root.widget.${index + 1}`);
  const rootIds = [...sectionIds, ...widgetIds];
  const breakpointCols = { xl: 12, lg: 8, md: 6, sm: 4, xs: 2 };
  const yOffsets = { xl: 1, lg: 3, md: 5, sm: 7, xs: 9 };
  const root = Object.fromEntries(Object.entries(breakpointCols).map(([breakpoint, cols]) => [
    breakpoint,
    [
      ...rootIds.map((id, index) => ({
        i: id,
        x: index % 2 === 0 ? 0 : Math.max(0, cols - Math.min(2, cols)),
        y: yOffsets[breakpoint] + index * 2,
        w: Math.min(2, cols),
        h: 1,
      })),
      { i: `legacy.orphan.${breakpoint}`, x: 0, y: 40, w: Math.min(2, cols), h: 1 },
    ],
  ]));
  return {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: { root },
    sections: [
      { id: sectionIds[0], kind: 'greeting', title: 'Greeting', layout: { i: sectionIds[0], x: 0, y: 0, w: 6, h: 1 } },
      { id: sectionIds[1], kind: 'weather', title: 'Weather', layout: { i: sectionIds[1], x: 6, y: 0, w: 6, h: 1 } },
    ],
    widgets: widgetIds.map((id, index) => widget(
      id,
      index % 2 === 0 ? 'light' : 'sensor',
      `Root widget ${index + 1}`,
      { x: (index % 4) * 3, y: 3 + Math.floor(index / 4) * 2, w: 3, h: 1 },
    )),
  };
}

function realCardEditorFixture() {
  const sectionIds = ['section.greeting', 'section.scenes', 'section.stack'];
  const widgets = [
    widget('root.climate', 'climate', 'Termostufa Integrata', { x: 0, y: 12, w: 3, h: 3 }),
    widget('root.lock', 'lock', 'Cancello Piccolo', { x: 3, y: 12, w: 3, h: 2 }),
    widget('alarm.custom_45', 'alarm', 'New alarm', { x: 6, y: 12, w: 3, h: 2 }),
    widget('root.light', 'light', 'Luce autentica', { x: 9, y: 12, w: 3, h: 2 }),
    widget('root.media', 'media', 'Google Home Mini', { x: 0, y: 16, w: 3, h: 2 }),
    widget('root.sensor', 'sensor', 'Sensore autentico', { x: 3, y: 16, w: 3, h: 2 }),
    widget('root.calendar', 'calendar', 'Calendario', { x: 6, y: 16, w: 3, h: 2 }),
    widget('root.members', 'members', 'Persone', { x: 9, y: 16, w: 3, h: 2 }),
    widget('root.light.secondary', 'light', 'Seconda luce', { x: 0, y: 20, w: 3, h: 2 }),
    widget('stack.child', 'sensor', 'Sensore nello Stack', { x: 0, y: 0, w: 2, h: 2 }, 'section.stack'),
  ];
  const rootWidgets = widgets.filter((entry) => !entry.parentSectionId);
  const rootIds = [...sectionIds, ...rootWidgets.map((entry) => entry.id)];
  const root = Object.fromEntries(Object.entries({ xl: 12, lg: 8, md: 6, sm: 4, xs: 2 }).map(([breakpoint, cols]) => [
    breakpoint,
    rootIds.map((id, index) => ({
      i: id,
      x: 0,
      y: index * 4,
      w: Math.min(id === 'section.greeting' ? 6 : id === 'section.stack' ? 4 : 3, cols),
      h: id === 'section.stack' || id === 'root.climate' ? 3 : 2,
    })),
  ]));
  return {
    version: 14,
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root,
      stacks: {
        'section.stack': Object.fromEntries(['xl', 'lg', 'md', 'sm', 'xs'].map((breakpoint) => [
          breakpoint,
          [{ i: 'stack.child', x: 0, y: 0, w: 2, h: 2 }],
        ])),
      },
    },
    sections: [
      { id: sectionIds[0], kind: 'greeting', title: 'Casa di Ada', layout: { i: sectionIds[0], x: 0, y: 0, w: 6, h: 2 } },
      { id: sectionIds[1], kind: 'scenes', title: 'Scenari', layout: { i: sectionIds[1], x: 6, y: 0, w: 6, h: 2 } },
      {
        id: sectionIds[2], kind: 'stack-grid', title: 'Dispositivi raggruppati', stackColumns: 2,
        stackShowBackground: true, stackShowBorder: true, stackShowHeader: true,
        layout: { i: sectionIds[2], x: 0, y: 4, w: 6, h: 4 },
      },
    ],
    widgets,
  };
}

async function installDemo(page, layout = editorFixture()) {
  await page.addInitScript(({ key, layout }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2, phase: 'done', mode: 'demo', updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'demo');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem(key, JSON.stringify(layout));
  }, { key: STORAGE_KEY, layout });
}

async function enterEditMode(page) {
  await page.locator('button[aria-label="Attiva o disattiva modalità modifica"]:visible').first().click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await page.waitForSelector('.sections-grid.is-editing');
}

async function operationalGeometry(page) {
  return page.locator('.sections-grid > .react-grid-item').evaluateAll((nodes) => nodes
    .filter((node) => !node.classList.contains('react-grid-placeholder'))
    .map((node) => ({
      transform: node.style.transform,
      width: node.style.width,
      height: node.style.height,
      text: node.textContent.replace(/\s+/g, ' ').trim(),
    })));
}

async function dragPreviewCard(page, dialog, id, deltaXCells, deltaYCells) {
  const card = dialog.getByRole('button', { name: `Seleziona ${id}`, exact: true });
  await card.scrollIntoViewIfNeeded();
  const bounds = await card.boundingBox();
  if (!bounds) throw new Error(`Preview card ${id} has no browser bounds.`);
  const metrics = await dialog.getByTestId('result-canvas').evaluate((canvas) => {
    const canvasBounds = canvas.getBoundingClientRect();
    const styles = getComputedStyle(canvas);
    const cols = Number(canvas.getAttribute('data-cols'));
    const columnGap = Number.parseFloat(styles.columnGap) || 0;
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    const firstRow = Number.parseFloat(styles.gridTemplateRows.split(' ')[0]);
    return {
      stepX: (canvasBounds.width - columnGap * (cols - 1)) / cols + columnGap,
      stepY: firstRow + rowGap,
    };
  });
  const start = { x: bounds.x + Math.min(24, bounds.width * 0.25), y: bounds.y + bounds.height * 0.42 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x + metrics.stepX * deltaXCells,
    start.y + metrics.stepY * deltaYCells,
    { steps: 8 },
  );
  await page.mouse.up();
}

async function resizePreviewCard(page, dialog, id, deltaXCells, deltaYCells) {
  const handle = dialog.getByRole('button', { name: `Ridimensiona ${id}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error(`Preview resize handle ${id} has no browser bounds.`);
  const metrics = await dialog.getByTestId('result-canvas').evaluate((canvas) => {
    const canvasBounds = canvas.getBoundingClientRect();
    const styles = getComputedStyle(canvas);
    const cols = Number(canvas.getAttribute('data-cols'));
    const columnGap = Number.parseFloat(styles.columnGap) || 0;
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    const firstRow = Number.parseFloat(styles.gridTemplateRows.split(' ')[0]);
    return {
      stepX: (canvasBounds.width - columnGap * (cols - 1)) / cols + columnGap,
      stepY: firstRow + rowGap,
    };
  });
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x + metrics.stepX * deltaXCells,
    start.y + metrics.stepY * deltaYCells,
    { steps: 8 },
  );
  await page.mouse.up();
}

test('DEV real-card editor renders 12 authentic roots safely and keeps responsive drafts isolated', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1536, height: 1000 });
  await installDemo(page, realCardEditorFixture());
  const apiRequests = [];
  page.on('request', (request) => {
    if (/\/api(?:\/|$)/.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });
  await page.goto('/home');
  await enterEditMode(page);
  const beforeGeometry = await operationalGeometry(page);
  await page.evaluate(() => {
    window.__gridPreviewStorageWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function monitoredSetItem(key, value) {
      window.__gridPreviewStorageWrites.push({ key, value });
      return original.call(this, key, value);
    };
  });

  await page.getByRole('button', { name: 'Prova Grid Engine 2.0' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editor sperimentale Grid Engine 2.0' });
  await expect(dialog.getByTestId('editor-preview-inventory')).toContainText('12 elementi · 1 Stack');
  await expect(dialog.locator('[data-testid^="result-card-"]')).toHaveCount(12);
  await expect(dialog.locator('[data-testid^="experimental-real-card-"]:not([data-testid^="experimental-real-card-content-"])')).toHaveCount(12);

  const authenticWidgets = [
    ['root.climate', 'climate'],
    ['root.lock', 'lock'],
    ['alarm.custom_45', 'alarm'],
    ['root.light', 'light'],
    ['root.media', 'media'],
    ['root.sensor', 'sensor'],
    ['root.calendar', 'calendar'],
    ['root.members', 'members'],
  ];
  const renderedKinds = await dialog.locator('[data-experimental-card-kind]').evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [
    node.closest('[data-grid-safe-visual-only="true"]')?.getAttribute('data-testid'),
    {
      kind: node.getAttribute('data-experimental-card-kind'),
      renderer: node.getAttribute('data-experimental-renderer'),
    },
  ])));
  for (const [id, kind] of authenticWidgets) {
    expect(renderedKinds[`experimental-real-card-${id}`]).toEqual({ kind, renderer: 'WidgetCardRenderer' });
    expect(await dialog.getByTestId(`experimental-real-card-content-${id}`).getAttribute('inert')).toBe('');
  }
  await expect(dialog.getByTestId('experimental-real-card-section.greeting').locator('[data-experimental-renderer="SectionCardRenderer"]')).toHaveCount(1);
  await expect(dialog.getByTestId('experimental-real-card-section.scenes').locator('[data-experimental-renderer="SectionCardRenderer"]')).toHaveCount(1);
  await expect(dialog.getByTestId('experimental-real-card-section.stack').locator('[data-experimental-renderer="SafeStackProjection"]')).toHaveAttribute('data-stack-child-count', '1');
  await expect(dialog.getByTestId('experimental-stack-child-stack.child')).toHaveCount(1);

  for (const id of ['root.lock', 'root.light', 'root.climate']) {
    await dialog.getByTestId(`experimental-real-card-${id}`).dispatchEvent('click');
  }
  expect(await page.evaluate(() => window.__gridPreviewStorageWrites)).toEqual([]);
  expect(apiRequests).toEqual([]);

  await dialog.getByText('Pannello avanzato · sei breakpoint reali').click();
  await dialog.getByRole('button', { name: 'Breakpoint xs' }).click();
  const initialXsY = Number(await dialog.getByTestId('result-card-root.sensor').getAttribute('data-y'));
  await dragPreviewCard(page, dialog, 'root.sensor', 0, 1);
  await expect(dialog.getByTestId('result-card-root.sensor')).toHaveAttribute('data-y', String(initialXsY + 1));
  const initialXsH = Number(await dialog.getByTestId('result-card-root.sensor').getAttribute('data-h'));
  await resizePreviewCard(page, dialog, 'root.sensor', 0, 1);
  await expect(dialog.getByTestId('result-card-root.sensor')).toHaveAttribute('data-h', String(initialXsH + 1));
  await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(dialog.getByTestId('result-card-root.sensor')).toHaveAttribute('data-h', String(initialXsH));
  await dialog.getByRole('button', { name: 'Breakpoint xl' }).click();
  await dialog.getByRole('button', { name: 'Breakpoint xs' }).click();
  await expect(dialog.getByTestId('result-card-root.sensor')).toHaveAttribute('data-y', String(initialXsY + 1));

  await dialog.getByRole('button', { name: 'Breakpoint 2xl' }).click();
  await expect(dialog.getByTestId('responsive-origin')).toHaveText('Missing');
  await expect(dialog.getByRole('button', { name: 'Conferma in memoria' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Breakpoint xs' }).click();
  await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(dialog.getByTestId('result-card-root.sensor')).toHaveAttribute('data-y', String(initialXsY));
  await dialog.getByRole('button', { name: 'Ripristina', exact: true }).click();
  await expect(dialog.getByTestId('result-card-root.sensor')).toHaveAttribute('data-y', String(initialXsY + 1));

  await dialog.getByTestId('review-draft-changes').click();
  await expect(dialog.getByTestId('grid-engine-draft-review')).toBeVisible();
  await expect(dialog.getByTestId('draft-change-xs-root.sensor')).toContainText('Sensore autentico');
  await expect(dialog.getByTestId('draft-applicability-status')).toHaveText('blocked-invalid');
  await expect(dialog.getByTestId('draft-review-blockers')).toContainText('BREAKPOINT_MISSING');
  await expect(dialog.getByTestId('draft-review-blockers')).toContainText('COLLISION');
  await expect(dialog.getByText('Applica al draft dell’editor')).toBeVisible();
  await expect(dialog.getByText('Salva su Home Assistant')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Applica al draft/ })).toHaveCount(0);
  await dialog.getByTestId('review-draft-changes').click();

  const modifiedAfterY = await dialog.getByTestId('result-card-root.sensor').getAttribute('data-y');
  const capturedSourceXs = await dialog.getByTestId('editor-geometry-row-xs-root.sensor').getAttribute('data-editor');
  await dialog.getByRole('button', { name: 'Prepara adozione layout' }).click();
  await dialog.getByLabel('Seleziona XS').check();
  await dialog.getByTestId('prepare-grid-structural-adoption').click();
  const adoptedSource = await dialog.getByTestId('grid-adoption-row-xs-root.sensor').getAttribute('data-candidate');
  expect(adoptedSource).toBe(capturedSourceXs);
  expect(adoptedSource).not.toContain(`y${modifiedAfterY}`);
  await dialog.getByTestId('discard-grid-structural-adoption').click();

  await dialog.getByRole('button', { name: 'Chiudi esperimento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await operationalGeometry(page)).toEqual(beforeGeometry);
  expect(await page.evaluate(() => window.__gridPreviewStorageWrites)).toEqual([]);
  expect(apiRequests).toEqual([]);
});

test('DEV editor preview is isolated, interactive, and discarded on close and refresh', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1536, height: 1000 });
  await installDemo(page);
  const apiRequests = [];
  page.on('request', (request) => {
    if (/\/api(?:\/|$)/.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });
  await page.goto('/home');
  await enterEditMode(page);

  const beforeGeometry = await operationalGeometry(page);
  await page.evaluate(() => {
    window.__gridPreviewStorageWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function monitoredSetItem(key, value) {
      window.__gridPreviewStorageWrites.push({ key, value });
      return original.call(this, key, value);
    };
  });

  await page.getByRole('button', { name: 'Prova Grid Engine 2.0' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editor sperimentale Grid Engine 2.0' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('editor-preview-baseline')).toContainText('Copia locale non autorevole');
  await expect(dialog.getByTestId('editor-preview-inventory')).toContainText('5 elementi · 1 Stack');
  await expect(dialog.getByText('1 figli Stack esclusi')).toBeVisible();
  await expect(dialog.locator('[data-testid^="result-card-"]')).toHaveCount(5);
  await expect(dialog.getByTestId('result-card-stack')).toHaveAttribute('data-item-kind', 'stack-root');
  await expect(dialog.getByTestId('result-card-root.light')).toHaveAttribute('data-item-kind', 'light');
  await expect(dialog.getByTestId('editor-inventory-alarm.custom_12')).toContainText('New alarm');
  await expect(dialog.getByTestId('editor-inventory-alarm.custom_12')).toContainText('root-widget');
  await expect(dialog.getByTestId('editor-geometry-capture-status')).toContainText('Geometria effettiva RGL catturata');
  const xsBaseline = await dialog.getByTestId('editor-geometry-row-xs-root.light').getAttribute('data-before');
  const xsBaselineY = xsBaseline?.match(/y(\d+)/)?.[1];
  const xsBaselineH = xsBaseline?.match(/h(\d+)/)?.[1];
  expect(xsBaselineY).toBeTruthy();
  expect(xsBaselineH).toBeTruthy();
  await expect(dialog.getByTestId('draft-status')).toContainText('Snapshot isolata');
  await expect(page.locator('.sections-grid.is-editing')).toBeAttached();

  await dialog.getByRole('button', { name: 'automatic', exact: true }).click();
  await expect(dialog.getByTestId('solver-mode-status')).toHaveText('automatic');
  await dialog.getByRole('button', { name: 'Vista Mobile' }).click();
  await expect(dialog.getByTestId('responsive-breakpoint')).toHaveText('xs');
  const xsAutomatic = await dialog.getByTestId('result-card-root.light').getAttribute('data-y');
  await dialog.getByRole('button', { name: 'Crea override manuale XS' }).click();
  await expect(dialog.getByTestId('override-status')).toContainText('manual');
  await dialog.getByRole('button', { name: 'Resize', exact: true }).click();
  await dialog.getByLabel('Altezza H').fill('2');
  await dialog.getByRole('button', { name: 'Anteprima', exact: true }).click();
  await expect(dialog.getByTestId('result-card-root.light')).toHaveAttribute('data-h', '2');
  await dialog.getByRole('button', { name: 'Conferma in memoria' }).click();
  await dialog.getByRole('button', { name: 'Vista Desktop' }).click();
  await dialog.getByRole('button', { name: 'Vista Mobile' }).click();
  await expect(dialog.getByTestId('result-card-root.light')).toHaveAttribute('data-h', '2');
  await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ripristina', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reset anteprima' }).click();
  await expect(dialog.getByTestId('result-card-root.light')).toHaveAttribute('data-y', xsBaselineY);
  expect(xsAutomatic).toBeTruthy();
  await expect(dialog.getByTestId('result-card-root.light')).toHaveAttribute('data-h', xsBaselineH);

  await dialog.getByRole('button', { name: 'Vista Desktop' }).click();
  const desktopBaselineH = await dialog.getByTestId('result-card-root.light').getAttribute('data-h');
  await dialog.getByRole('button', { name: /Simula espansione Light \/ dispositivo/ }).click();
  await expect(dialog.getByTestId('result-card-root.light')).toHaveAttribute(
    'data-h',
    String(Number(desktopBaselineH) + 1),
  );
  await dialog.getByRole('button', { name: /Simula espansione Light \/ dispositivo/ }).click();
  await expect(dialog.getByTestId('result-card-root.light')).toHaveAttribute('data-h', desktopBaselineH);

  await dialog.getByRole('button', { name: 'Prepara adozione layout' }).click();
  await expect(dialog.getByTestId('grid-adoption-source-preview')).toContainText('root.light:');
  await dialog.getByLabel('Seleziona XL').check();
  await dialog.getByRole('radio', { name: 'Automatic' }).check();
  const capturedXl = await dialog.getByTestId('editor-geometry-row-xl-root.light').getAttribute('data-editor');
  await dialog.getByTestId('prepare-grid-structural-adoption').click();
  await expect(dialog.getByTestId('grid-adoption-lifecycle')).toHaveText('Candidato preparato in memoria');
  await expect(dialog.getByTestId('grid-adoption-authorization')).toHaveText('Applicazione non autorizzata');
  await expect(dialog.getByTestId('grid-adoption-row-xl-root.light')).toHaveAttribute('data-operational', capturedXl);
  await expect(dialog.getByTestId('grid-adoption-row-xl-root.light')).toHaveAttribute('data-candidate', capturedXl);
  await expect(dialog.getByRole('button', { name: /Apply/i })).toHaveCount(0);
  await dialog.getByTestId('acknowledge-grid-structural-adoption').click();
  await expect(dialog.getByTestId('grid-adoption-lifecycle')).toHaveText('Candidato esaminato in memoria');
  await expect(dialog.getByTestId('grid-adoption-authorization')).toHaveText('Applicazione non autorizzata');
  await dialog.getByTestId('discard-grid-structural-adoption').click();
  await expect(dialog.getByTestId('grid-structural-adoption-candidate')).toHaveCount(0);
  await dialog.getByTestId('prepare-grid-structural-adoption').click();
  await expect(dialog.getByTestId('grid-structural-adoption-candidate')).toBeVisible();

  await dialog.getByRole('button', { name: 'Chiudi esperimento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await operationalGeometry(page)).toEqual(beforeGeometry);
  expect(await page.evaluate(() => window.__gridPreviewStorageWrites)).toEqual([]);
  expect(apiRequests).toEqual([]);

  await page.reload();
  await enterEditMode(page);
  await page.getByRole('button', { name: 'Prova Grid Engine 2.0' }).click();
  const reopened = page.getByRole('dialog', { name: 'Editor sperimentale Grid Engine 2.0' });
  await expect(reopened.getByTestId('draft-status')).toContainText('Snapshot isolata · r0');
  await expect(reopened.getByTestId('result-card-root.light')).toHaveAttribute('data-h', desktopBaselineH);
  await reopened.getByRole('button', { name: 'Prepara adozione layout' }).click();
  await expect(reopened.getByTestId('grid-structural-adoption-candidate')).toHaveCount(0);
});

test('DEV editor preview keeps provisional root geometry across responsive breakpoints', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1536, height: 1000 });
  await installDemo(page, responsiveEditorFixture());
  const apiRequests = [];
  page.on('request', (request) => {
    if (/\/api(?:\/|$)/.test(new URL(request.url()).pathname)) apiRequests.push(request.url());
  });
  await page.goto('/home');
  await enterEditMode(page);
  const geometryBeforeEdit = await operationalGeometry(page);
  const editedCard = page.getByRole('group', { name: 'Card Root widget 1', exact: true });
  await editedCard.focus();
  await editedCard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Annulla ultima modifica' }).first()).toBeEnabled();
  await page.waitForTimeout(650);
  const beforeGeometry = await operationalGeometry(page);
  expect(beforeGeometry).not.toEqual(geometryBeforeEdit);
  await page.evaluate(() => {
    window.__gridPreviewStorageWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function monitoredSetItem(key, value) {
      window.__gridPreviewStorageWrites.push({ key, value });
      return original.call(this, key, value);
    };
  });

  await page.getByRole('button', { name: 'Prova Grid Engine 2.0' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editor sperimentale Grid Engine 2.0' });
  await expect(dialog.getByTestId('editor-preview-baseline')).toContainText('Bozza editor isolata');
  await expect(dialog.getByTestId('responsive-breakpoint')).toHaveText('md');
  await expect(dialog.getByTestId('editor-preview-inventory')).toContainText('11 elementi · 0 Stack');
  await dialog.getByText('Pannello avanzato · sei breakpoint reali').click();

  const initialGeometry = {};
  const assertBreakpoint = async (breakpoint) => {
    await dialog.getByRole('button', { name: `Breakpoint ${breakpoint}` }).click();
    await expect(dialog.getByTestId('responsive-breakpoint')).toHaveText(breakpoint);
    await expect(dialog.locator('[data-testid^="reference-card-"]')).toHaveCount(11);
    await expect(dialog.locator('[data-testid^="result-card-"]')).toHaveCount(11);
    await expect(dialog.locator('[data-grid-safe-visual-only="true"]')).toHaveCount(11);
    const auditRow = dialog.getByTestId(`editor-geometry-row-${breakpoint}-root.widget.1`);
    const editor = await auditRow.getAttribute('data-editor');
    const before = await auditRow.getAttribute('data-before');
    const after = await auditRow.getAttribute('data-after');
    expect(editor).not.toBe('n/d');
    expect(before).toBe(editor);
    expect(after).toBe(editor);
    const expectedY = before?.match(/y(\d+)/)?.[1];
    expect(expectedY).toBeTruthy();
    initialGeometry[breakpoint] = { editor, y: expectedY };
    await expect(dialog.getByTestId('reference-card-root.widget.1')).toHaveAttribute('data-y', expectedY);
    await expect(dialog.getByTestId('result-card-root.widget.1')).toHaveAttribute('data-y', expectedY);
    const expectedOrigin = breakpoint === 'md' ? 'Custom' : 'Provisional';
    await expect(dialog.getByTestId('responsive-origin')).toHaveText(expectedOrigin);
    if (expectedOrigin === 'Provisional') {
      await expect(dialog.getByTestId('provisional-breakpoint-status')).toContainText('11 root validi');
    }
    await expect(dialog.locator(`[data-testid*="legacy.orphan.${breakpoint}"]`)).toHaveCount(0);
  };

  await assertBreakpoint('md');
  await assertBreakpoint('xl');
  await assertBreakpoint('lg');
  await assertBreakpoint('sm');
  await assertBreakpoint('xs');

  await dragPreviewCard(page, dialog, 'root.widget.1', 0, 1);
  const movedXsY = String(Number(initialGeometry.xs.y) + 1);
  await expect(dialog.getByTestId('result-card-root.widget.1')).toHaveAttribute('data-y', movedXsY);
  await expect(dialog.getByRole('button', { name: 'Conferma in memoria' })).toBeDisabled();
  await dialog.getByTestId('review-draft-changes').click();
  await expect(dialog.getByTestId('draft-change-xs-root.widget.1')).toBeVisible();
  await expect(dialog.getByTestId('draft-applicability-status')).toHaveText('blocked-incomplete-source');
  await expect(dialog.getByTestId('draft-review-blockers')).toContainText('BASELINE_PROVISIONAL');
  await dialog.getByTestId('review-draft-changes').click();

  await assertBreakpoint('xl');
  await dialog.getByRole('button', { name: 'Breakpoint xs' }).click();
  await expect(dialog.getByTestId('responsive-breakpoint')).toHaveText('xs');
  await expect(dialog.locator('[data-testid^="result-card-"]')).toHaveCount(11);
  await expect(dialog.getByTestId('result-card-root.widget.1')).toHaveAttribute('data-y', movedXsY);
  await assertBreakpoint('md');

  await dialog.getByRole('button', { name: 'Breakpoint 2xl' }).click();
  await expect(dialog.getByTestId('responsive-origin')).toHaveText('Missing');
  await expect(dialog.getByTestId('missing-breakpoint-status')).toContainText('Geometria mancante');
  await expect(dialog.locator('[data-testid^="reference-card-"]')).toHaveCount(0);
  await expect(dialog.locator('[data-testid^="result-card-"]')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Conferma in memoria' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Chiudi esperimento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await operationalGeometry(page)).toEqual(beforeGeometry);
  expect(await page.evaluate(() => window.__gridPreviewStorageWrites)).toEqual([]);
  expect(apiRequests).toEqual([]);

  await page.getByRole('button', { name: 'Annulla ultima modifica' }).first().click();
  await expect.poll(() => operationalGeometry(page)).toEqual(geometryBeforeEdit);
  await page.getByRole('button', { name: 'Prova Grid Engine 2.0' }).click();
  const reopened = page.getByRole('dialog', { name: 'Editor sperimentale Grid Engine 2.0' });
  const restored = await reopened.getByTestId('editor-geometry-row-md-root.widget.1').getAttribute('data-before');
  expect(restored).not.toBe(initialGeometry.md.editor);
  await reopened.getByRole('button', { name: 'Chiudi esperimento', exact: true }).click();
});
