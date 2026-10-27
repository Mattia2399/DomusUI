const { test, expect } = require('@playwright/test');

const laboratoryFor = (page) => page.getByRole('region', { name: /Grid Engine 2\.0/ });

async function gridMetrics(laboratory) {
  return laboratory.getByTestId('result-canvas').evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    const styles = getComputedStyle(canvas);
    const cols = Number(canvas.getAttribute('data-cols'));
    const columnGap = Number.parseFloat(styles.columnGap) || 0;
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    const firstRow = Number.parseFloat(styles.gridTemplateRows.split(' ')[0]);
    const cellWidth = (bounds.width - columnGap * (cols - 1)) / cols;
    return {
      cols,
      stepX: cellWidth + columnGap,
      stepY: firstRow + rowGap,
    };
  });
}

async function setCanvasWidth(laboratory, width, breakpoint, cols, profile) {
  await laboratory.getByLabel('Larghezza canvas').fill(String(width));
  await expect(laboratory.getByTestId('result-canvas')).toHaveAttribute('data-canvas-width', String(width));
  await expect(laboratory.getByTestId('responsive-breakpoint')).toHaveText(breakpoint);
  await expect(laboratory.getByTestId('responsive-cols')).toHaveText(String(cols));
  await expect(laboratory.getByTestId('responsive-profile')).toHaveText(profile);
}

async function expectValidGeometry(laboratory, cols, prefix = 'result') {
  const geometry = await layoutSnapshot(laboratory, prefix);
  for (const item of geometry) {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.w).toBeGreaterThanOrEqual(1);
    expect(item.x + item.w).toBeLessThanOrEqual(cols);
  }
  for (let first = 0; first < geometry.length; first += 1) {
    for (let second = first + 1; second < geometry.length; second += 1) {
      const a = geometry[first];
      const b = geometry[second];
      const overlaps = a.x < b.x + b.w
        && a.x + a.w > b.x
        && a.y < b.y + b.h
        && a.y + a.h > b.y;
      expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

async function beginCardDrag(page, laboratory, id, deltaXCells, deltaYCells) {
  const cardButton = laboratory.getByRole('button', { name: `Seleziona ${id}`, exact: true });
  await cardButton.scrollIntoViewIfNeeded();
  const bounds = await cardButton.boundingBox();
  if (!bounds) throw new Error(`Card ${id} has no browser bounds.`);
  const metrics = await gridMetrics(laboratory);
  const start = {
    x: bounds.x + Math.min(24, bounds.width * 0.25),
    y: bounds.y + bounds.height * 0.42,
  };
  const end = {
    x: start.x + metrics.stepX * deltaXCells,
    y: start.y + metrics.stepY * deltaYCells,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  return { start, end, metrics };
}

async function layoutSnapshot(laboratory, prefix = 'result') {
  return laboratory.locator(`[data-testid^="${prefix}-card-"]`).evaluateAll((cards, currentPrefix) => cards
    .map((card) => ({
      id: card.getAttribute('data-testid').replace(`${currentPrefix}-card-`, ''),
      x: Number(card.getAttribute('data-x')),
      y: Number(card.getAttribute('data-y')),
      w: Number(card.getAttribute('data-w')),
      h: Number(card.getAttribute('data-h')),
    }))
    .sort((first, second) => first.id.localeCompare(second.id)), prefix);
}

test('Grid Engine 2.0 laboratory previews and commits the exact solver geometry', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');

  const laboratory = laboratoryFor(page);
  await expect(laboratory).toBeVisible();
  await expect(laboratory.getByRole('button', { name: /Collisione semplice/ })).toBeVisible();
  await expect(laboratory.getByRole('button', { name: /Collisione a catena/ })).toBeVisible();
  await expect(laboratory.getByRole('button', { name: /Spazi manuali/ })).toBeVisible();
  await expect(laboratory.getByRole('button', { name: /Dimensioni differenti/ })).toBeVisible();
  await expect(laboratory.getByRole('button', { name: /Densità responsive/ })).toBeVisible();

  const mover = laboratory.getByTestId('result-card-move-a');
  const target = laboratory.getByTestId('result-card-target-b');
  await expect(mover).toHaveAttribute('data-x', '8');
  await expect(mover).toHaveAttribute('data-y', '3');

  await laboratory.getByRole('button', { name: 'Anteprima' }).click();
  await expect(mover).toHaveAttribute('data-x', '0');
  await expect(mover).toHaveAttribute('data-y', '0');
  await expect(target).toHaveAttribute('data-y', '1');

  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  await expect(mover).toHaveAttribute('data-x', '0');
  await expect(mover).toHaveAttribute('data-y', '0');
  await expect(target).toHaveAttribute('data-y', '1');
  await expect(laboratory.getByTestId('reference-card-target-b')).toHaveAttribute('data-y', '1');

  await laboratory.screenshot({ path: testInfo.outputPath('grid-engine-lab-desktop.png') });
});

test('Grid Engine 2.0 laboratory remains contained on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/grid-test');

  const laboratory = laboratoryFor(page);
  await expect(laboratory).toBeVisible();
  await laboratory.getByRole('button', { name: /Spazi manuali/ }).click();
  await laboratory.getByRole('button', { name: 'automatic', exact: true }).click();
  await expect(laboratory.getByTestId('result-card-gap-b')).toHaveAttribute('data-y', '1');

  const pageFitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(pageFitsViewport).toBe(true);
});

test('mouse drag previews a collision and commits the exact visible coordinates', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  const canvas = laboratory.getByTestId('result-canvas');

  await beginCardDrag(page, laboratory, 'move-a', -8, -3);
  await expect(canvas).toHaveAttribute('data-gesture-state', 'DRAGGING');
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-x', '0');
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-y', '0');
  await expect(laboratory.getByTestId('result-card-target-b')).toHaveAttribute('data-y', '1');
  await expect(laboratory.getByTestId('reference-card-move-a')).toHaveAttribute('data-x', '8');
  await expect(laboratory.getByTestId('reference-card-target-b')).toHaveAttribute('data-y', '0');
  const lastPreview = await layoutSnapshot(laboratory);

  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-gesture-state', 'IDLE');
  expect(await layoutSnapshot(laboratory)).toEqual(lastPreview);
  await expect(laboratory.getByTestId('draft-status')).toHaveText('Unconfirmed changes');
  expect(await layoutSnapshot(laboratory, 'reference')).not.toEqual(lastPreview);
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(lastPreview);
});

test('drag exposes a three-card collision chain before release', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Collisione a catena/ }).click();

  await beginCardDrag(page, laboratory, 'mover', -10, -5);
  await expect(laboratory.getByTestId('result-card-mover')).toHaveAttribute('data-y', '0');
  await expect(laboratory.getByTestId('result-card-chain-a')).toHaveAttribute('data-y', '1');
  await expect(laboratory.getByTestId('result-card-chain-b')).toHaveAttribute('data-y', '2');
  await expect(laboratory.getByTestId('result-card-chain-c')).toHaveAttribute('data-y', '3');
  await expect(laboratory.getByTestId('reference-card-chain-a')).toHaveAttribute('data-y', '0');
  await page.mouse.up();
  await expect(laboratory.getByTestId('reference-card-chain-c')).toHaveAttribute('data-y', '2');
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  await expect(laboratory.getByTestId('reference-card-chain-c')).toHaveAttribute('data-y', '3');
});

test('downward drag reorders the complete vertical sequence without moving unrelated cards', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Collisione a catena/ }).click();
  const topCard = laboratory.getByRole('button', { name: 'Seleziona chain-a', exact: true });
  await topCard.click();
  await topCard.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const before = await layoutSnapshot(laboratory);

  await beginCardDrag(page, laboratory, 'chain-a', 0, 2);
  await expect(laboratory.getByTestId('result-canvas')).toHaveAttribute('data-gesture-state', 'DRAGGING');
  await expect(laboratory.getByTestId('current-operation')).toHaveText('REORDER');
  const preview = await layoutSnapshot(laboratory);
  const expected = before.map((item) => {
    if (item.id === 'chain-a') return { ...item, y: 2 };
    if (item.id === 'chain-b') return { ...item, y: 0 };
    if (item.id === 'chain-c') return { ...item, y: 1 };
    return item;
  });

  expect(preview).toEqual(expected);
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(before);
  await expectValidGeometry(laboratory, 12);

  await page.mouse.up();
  expect(await layoutSnapshot(laboratory)).toEqual(expected);
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(before);
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(expected);
  await expect(laboratory.getByTestId('final-selected-position')).toHaveText(/chain-a · x0 y2/);
});

test('Escape cancels drag and restores the immutable operation snapshot', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);

  await beginCardDrag(page, laboratory, 'move-a', -8, -3);
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-x', '0');
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await expect(laboratory.getByTestId('result-canvas')).toHaveAttribute('data-gesture-state', 'IDLE');
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-x', '8');
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-y', '3');
  await expect(laboratory.getByTestId('result-card-target-b')).toHaveAttribute('data-y', '0');
});

test('bottom-right resize previews collisions, commits exactly, and supports Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: 'Seleziona target-b', exact: true }).click();
  const handle = laboratory.getByRole('button', { name: 'Ridimensiona target-b', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const handleBounds = await handle.boundingBox();
  if (!handleBounds) throw new Error('Resize handle has no browser bounds.');
  const metrics = await gridMetrics(laboratory);
  const start = { x: handleBounds.x + handleBounds.width / 2, y: handleBounds.y + handleBounds.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + metrics.stepX * 4, start.y, { steps: 6 });
  await expect(laboratory.getByTestId('result-canvas')).toHaveAttribute('data-gesture-state', 'RESIZING');
  await expect(laboratory.getByTestId('result-card-target-b')).toHaveAttribute('data-w', '8');
  await expect(laboratory.getByTestId('result-card-side-c')).toHaveAttribute('data-y', '2');
  await expect(laboratory.getByTestId('reference-card-target-b')).toHaveAttribute('data-w', '4');
  const resizePreview = await layoutSnapshot(laboratory);
  await page.mouse.up();
  expect(await layoutSnapshot(laboratory)).toEqual(resizePreview);
  await expect(laboratory.getByTestId('reference-card-target-b')).toHaveAttribute('data-w', '4');
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(resizePreview);

  const committedHandle = laboratory.getByRole('button', { name: 'Ridimensiona target-b', exact: true });
  await committedHandle.scrollIntoViewIfNeeded();
  const committedBounds = await committedHandle.boundingBox();
  if (!committedBounds) throw new Error('Committed resize handle has no browser bounds.');
  await page.mouse.move(committedBounds.x + 8, committedBounds.y + 8);
  await page.mouse.down();
  await page.mouse.move(committedBounds.x - metrics.stepX * 2, committedBounds.y + metrics.stepY, { steps: 6 });
  await expect(laboratory.getByTestId('result-card-target-b')).not.toHaveAttribute('data-w', '8');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await layoutSnapshot(laboratory)).toEqual(resizePreview);
});

test('cell hysteresis avoids repeated solver calls around the same boundary', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  const canvas = laboratory.getByTestId('result-canvas');
  const cardButton = laboratory.getByRole('button', { name: 'Seleziona move-a', exact: true });
  await cardButton.scrollIntoViewIfNeeded();
  const bounds = await cardButton.boundingBox();
  if (!bounds) throw new Error('Move card has no browser bounds.');
  const metrics = await gridMetrics(laboratory);
  const start = { x: bounds.x + 20, y: bounds.y + bounds.height * 0.42 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - metrics.stepX * 0.7, start.y);
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-x', '7');
  const callsAfterChange = Number(await canvas.getAttribute('data-solver-calls'));
  expect(callsAfterChange).toBeGreaterThan(0);

  await page.mouse.move(start.x - metrics.stepX * 0.42, start.y);
  await page.mouse.move(start.x - metrics.stepX * 0.38, start.y);
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-x', '7');
  expect(Number(await canvas.getAttribute('data-solver-calls'))).toBe(callsAfterChange);

  await page.mouse.move(start.x - metrics.stepX * 0.3, start.y);
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-x', '8');
  expect(Number(await canvas.getAttribute('data-solver-calls'))).toBe(callsAfterChange + 1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('mobile long-press supports commit and pointer cancellation without hijacking taps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Spazi manuali/ }).click();
  const canvas = laboratory.getByTestId('result-canvas');
  const card = laboratory.getByRole('button', { name: 'Seleziona gap-a', exact: true });
  const dragHandle = laboratory.getByRole('button', { name: 'Trascina gap-a', exact: true });
  await expect(card).toHaveCSS('touch-action', 'pan-y');
  await expect(dragHandle).toHaveCSS('touch-action', 'none');
  const bounds = await card.boundingBox();
  if (!bounds) throw new Error('Touch card has no browser bounds.');
  const metrics = await gridMetrics(laboratory);
  const point = { x: bounds.x + 24, y: bounds.y + bounds.height * 0.42 };

  const dispatchTouch = (type, pointerId, x, y) => page.evaluate(
    ({ type, pointerId, x, y }) => window.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: 0,
    })),
    { type, pointerId, x, y },
  );

  await card.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    clientX: point.x,
    clientY: point.y,
    button: 0,
  });
  await dispatchTouch('pointerup', 71, point.x, point.y);
  await page.waitForTimeout(700);
  await expect(canvas).toHaveAttribute('data-gesture-state', 'IDLE');
  await expect(laboratory.getByTestId('result-card-gap-a')).toHaveAttribute('data-x', '0');

  await card.dispatchEvent('pointerdown', {
    pointerId: 72,
    pointerType: 'touch',
    isPrimary: true,
    clientX: point.x,
    clientY: point.y,
    button: 0,
  });
  await page.waitForTimeout(700);
  await expect(canvas).toHaveAttribute('data-gesture-state', 'DRAGGING');
  await dispatchTouch('pointermove', 72, point.x + metrics.stepX, point.y);
  await expect(laboratory.getByTestId('result-card-gap-a')).toHaveAttribute('data-x', '1');
  await dispatchTouch('pointercancel', 72, point.x + metrics.stepX, point.y);
  await expect(canvas).toHaveAttribute('data-gesture-state', 'IDLE');
  await expect(laboratory.getByTestId('result-card-gap-a')).toHaveAttribute('data-x', '0');

  await card.dispatchEvent('pointerdown', {
    pointerId: 73,
    pointerType: 'touch',
    isPrimary: true,
    clientX: point.x,
    clientY: point.y,
    button: 0,
  });
  await page.waitForTimeout(700);
  await expect(canvas).toHaveAttribute('data-gesture-state', 'DRAGGING');
  await dispatchTouch('pointermove', 73, point.x + metrics.stepX, point.y);
  await expect(laboratory.getByTestId('result-card-gap-a')).toHaveAttribute('data-x', '1');
  const touchPreview = await layoutSnapshot(laboratory);
  await dispatchTouch('pointerup', 73, point.x + metrics.stepX, point.y);
  expect(await layoutSnapshot(laboratory)).toEqual(touchPreview);
  await expect(laboratory.getByTestId('reference-card-gap-a')).toHaveAttribute('data-x', '0');
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(touchPreview);
});

test('canvas boundaries select the six real breakpoints without invalid geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  const boundaries = [
    [390, 'xs', 2, 'Mobile'],
    [639, 'xs', 2, 'Mobile'],
    [640, 'sm', 4, 'Tablet'],
    [767, 'sm', 4, 'Tablet'],
    [768, 'md', 6, 'Tablet'],
    [1023, 'md', 6, 'Tablet'],
    [1024, 'lg', 8, 'Desktop'],
    [1279, 'lg', 8, 'Desktop'],
    [1280, 'xl', 12, 'Desktop'],
    [1535, 'xl', 12, 'Desktop'],
    [1536, '2xl', 12, 'Desktop'],
  ];

  for (const [width, breakpoint, cols, profile] of boundaries) {
    await setCanvasWidth(laboratory, width, breakpoint, cols, profile);
    const measuredWidth = await laboratory.getByTestId('result-canvas').evaluate(
      (canvas) => canvas.getBoundingClientRect().width,
    );
    expect(measuredWidth).toBeCloseTo(width, 0);
    await expectValidGeometry(laboratory, cols);
    await expect(laboratory.getByTestId('rgl-experiment')).toHaveAttribute('data-rgl-fidelity', 'exact');
  }
});

test('Desktop to Tablet to Mobile and back remains drift-free', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await expect(laboratory.getByTestId('result-card-move-a')).toBeVisible();
  const desktop = await layoutSnapshot(laboratory);

  await laboratory.getByRole('button', { name: 'Vista Tablet' }).click();
  await expect(laboratory.getByTestId('responsive-breakpoint')).toHaveText('md');
  await expectValidGeometry(laboratory, 6);
  await laboratory.getByRole('button', { name: 'Vista Mobile' }).click();
  await expect(laboratory.getByTestId('responsive-breakpoint')).toHaveText('xs');
  await expectValidGeometry(laboratory, 2);
  await laboratory.getByRole('button', { name: 'Vista Desktop' }).click();

  expect(await layoutSnapshot(laboratory)).toEqual(desktop);
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Generated');
});

test('responsive Tablet drag and resize commit their exact previews', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: 'Vista Tablet' }).click();

  await beginCardDrag(page, laboratory, 'move-a', -4, -3);
  await expect(laboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-x', '0');
  const dragPreview = await layoutSnapshot(laboratory);
  await page.mouse.up();
  expect(await layoutSnapshot(laboratory)).toEqual(dragPreview);
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Preview');
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Custom');
  await expect(laboratory.getByTestId('rgl-experiment')).toHaveAttribute('data-rgl-fidelity', 'exact');

  await laboratory.getByRole('button', { name: /Collisione semplice/ }).click();
  await laboratory.getByRole('button', { name: 'Seleziona target-b', exact: true }).click();
  const handle = laboratory.getByRole('button', { name: 'Ridimensiona target-b', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error('Responsive resize handle has no browser bounds.');
  const metrics = await gridMetrics(laboratory);
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + metrics.stepX * 2, start.y, { steps: 6 });
  await expect(laboratory.getByTestId('result-card-target-b')).toHaveAttribute('data-w', '4');
  const resizePreview = await layoutSnapshot(laboratory);
  await page.mouse.up();
  expect(await layoutSnapshot(laboratory)).toEqual(resizePreview);
  await expect(laboratory.getByTestId('rgl-experiment')).toHaveAttribute('data-rgl-fidelity', 'exact');
});

test('custom Mobile survives a Desktop edit and can return to automatic provenance', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: 'Vista Mobile' }).click();
  await laboratory.getByLabel('Destinazione X').fill('0');
  await laboratory.getByLabel('Destinazione Y').fill('5');
  await laboratory.getByRole('button', { name: 'Anteprima' }).click();
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  const customizedMobile = await layoutSnapshot(laboratory);
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Custom');

  await laboratory.getByRole('button', { name: 'Vista Tablet' }).click();
  const tabletBeforeDesktopEdit = await layoutSnapshot(laboratory);
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Generated');
  await laboratory.getByRole('button', { name: 'Vista Desktop' }).click();
  await laboratory.getByLabel('Destinazione X').fill('0');
  await laboratory.getByLabel('Destinazione Y').fill('0');
  await laboratory.getByRole('button', { name: 'Anteprima' }).click();
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  await laboratory.getByRole('button', { name: 'Vista Tablet' }).click();
  const tabletAfterDesktopEdit = await layoutSnapshot(laboratory);
  expect(tabletAfterDesktopEdit).not.toEqual(tabletBeforeDesktopEdit);
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Generated');
  await laboratory.getByRole('button', { name: 'Vista Mobile' }).click();

  expect(await layoutSnapshot(laboratory)).toEqual(customizedMobile);
  await laboratory.getByRole('button', { name: 'Ripristina layout generated' }).click();
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Generated');
  expect(await layoutSnapshot(laboratory)).not.toEqual(customizedMobile);
  await expectValidGeometry(laboratory, 2);
});

test('changing canvas width cancels an active gesture without committing partial geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: 'Vista Tablet' }).click();
  const tablet = await layoutSnapshot(laboratory);

  await beginCardDrag(page, laboratory, 'move-a', -2, -1);
  await expect(laboratory.getByTestId('result-canvas')).toHaveAttribute('data-gesture-state', 'DRAGGING');
  await laboratory.getByLabel('Larghezza canvas').evaluate((input) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor.set.call(input, '640');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(laboratory.getByTestId('result-canvas')).toHaveAttribute('data-gesture-state', 'IDLE');
  await expect(laboratory.getByTestId('responsive-breakpoint')).toHaveText('sm');
  await page.mouse.up();
  await laboratory.getByRole('button', { name: 'Vista Tablet' }).click();

  expect(await layoutSnapshot(laboratory)).toEqual(tablet);
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Generated');
});

test('30-card stress fixture keeps drag and resize previews stable and collision-free', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Densità responsive/ }).click();
  await expect(laboratory.locator('[data-testid^="result-card-density-"]')).toHaveCount(30);

  await beginCardDrag(page, laboratory, 'density-01', 2, 3);
  await expect(laboratory.getByTestId('result-canvas')).toHaveAttribute('data-gesture-state', 'DRAGGING');
  const dragPreview = await layoutSnapshot(laboratory);
  await expectValidGeometry(laboratory, 12);
  await expect(laboratory.getByTestId('rgl-experiment')).toHaveAttribute('data-rgl-fidelity', 'exact');
  await page.mouse.up();
  expect(await layoutSnapshot(laboratory)).toEqual(dragPreview);
  expect(await layoutSnapshot(laboratory, 'reference')).not.toEqual(dragPreview);
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(dragPreview);

  const handle = laboratory.getByRole('button', { name: 'Ridimensiona density-01', exact: true });
  await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error('Stress resize handle has no browser bounds.');
  const metrics = await gridMetrics(laboratory);
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + metrics.stepX, start.y + metrics.stepY, { steps: 6 });
  await expect(laboratory.getByTestId('result-canvas')).toHaveAttribute('data-gesture-state', 'RESIZING');
  const resizePreview = await layoutSnapshot(laboratory);
  expect(resizePreview).not.toEqual(dragPreview);
  await expectValidGeometry(laboratory, 12);
  await expect(laboratory.getByTestId('rgl-experiment')).toHaveAttribute('data-rgl-fidelity', 'exact');
  await page.mouse.up();
  expect(await layoutSnapshot(laboratory)).toEqual(resizePreview);
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(dragPreview);
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(resizePreview);
});

test('manual and automatic transitions support undo, redo, reset, and memory-only confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Spazi manuali/ }).click();
  const manual = await layoutSnapshot(laboratory);
  await expect(laboratory.getByTestId('result-card-gap-b')).toHaveAttribute('data-y', '4');

  await laboratory.getByRole('button', { name: 'automatic', exact: true }).click();
  const automatic = await layoutSnapshot(laboratory);
  expect(automatic).not.toEqual(manual);
  await expect(laboratory.getByTestId('result-card-gap-b')).toHaveAttribute('data-y', '1');
  await expect(laboratory.getByTestId('reference-card-gap-b')).toHaveAttribute('data-y', '4');
  await expect(laboratory.getByTestId('draft-status')).toHaveText('Unconfirmed changes');

  await laboratory.getByRole('button', { name: 'Annulla', exact: true }).click();
  expect(await layoutSnapshot(laboratory)).toEqual(manual);
  await laboratory.getByRole('button', { name: 'Ripristina', exact: true }).click();
  expect(await layoutSnapshot(laboratory)).toEqual(automatic);

  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(automatic);
  await expect(laboratory.getByTestId('draft-status')).toContainText('Saved in lab');

  await laboratory.getByRole('button', { name: 'manual', exact: true }).click();
  await expect(laboratory.getByTestId('solver-mode-status')).toHaveText('manual');
  expect(await layoutSnapshot(laboratory)).toEqual(automatic);
  await laboratory.getByRole('button', { name: 'Reset preview' }).click();
  await expect(laboratory.getByTestId('solver-mode-status')).toHaveText('automatic');
  expect(await layoutSnapshot(laboratory)).toEqual(automatic);

  await page.reload();
  const reloadedLaboratory = laboratoryFor(page);
  await expect(reloadedLaboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-x', '8');
  await expect(reloadedLaboratory.getByTestId('result-card-move-a')).toHaveAttribute('data-y', '3');
  await expect(reloadedLaboratory.getByTestId('draft-status')).toHaveText(/Saved in lab.*r0/);
});

test('explicit XS manual override survives XL round trips without altering XL geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Spazi manuali/ }).click();
  await laboratory.getByRole('button', { name: 'automatic', exact: true }).click();
  await laboratory.getByRole('button', { name: 'Vista Desktop' }).click();
  const automaticXl = await layoutSnapshot(laboratory);

  await laboratory.getByRole('button', { name: 'Vista Mobile' }).click();
  await laboratory.getByRole('button', { name: 'Crea override manuale XS' }).click();
  await expect(laboratory.getByTestId('effective-mode')).toContainText('manual');
  await expect(laboratory.getByTestId('override-status')).toContainText('manual');
  await laboratory.getByRole('button', { name: 'Seleziona gap-c', exact: true }).click();
  await laboratory.getByLabel('Destinazione Y').fill('7');
  await laboratory.getByRole('button', { name: 'Anteprima' }).click();
  await laboratory.getByRole('button', { name: 'Conferma in memoria' }).click();
  const customXs = await layoutSnapshot(laboratory);
  await expect(laboratory.getByTestId('result-card-gap-c')).toHaveAttribute('data-y', '7');

  await laboratory.getByRole('button', { name: 'Vista Desktop' }).click();
  expect(await layoutSnapshot(laboratory)).toEqual(automaticXl);
  await expect(laboratory.getByTestId('effective-mode')).toContainText('automatic');
  await expect(laboratory.getByTestId('override-status')).toContainText('none');

  await laboratory.getByRole('button', { name: 'Vista Mobile' }).click();
  expect(await layoutSnapshot(laboratory)).toEqual(customXs);
  await expect(laboratory.getByTestId('effective-mode')).toContainText('manual');
  await laboratory.getByRole('button', { name: 'Elimina override preview' }).click();
  await expect(laboratory.getByTestId('effective-mode')).toContainText('automatic');
  await expect(laboratory.getByTestId('result-card-gap-c')).toHaveAttribute('data-y', '2');
  await expect(laboratory.getByTestId('draft-status')).toHaveText('Unconfirmed changes');
});

test('missing breakpoint remains synthetic and cannot be confirmed', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Breakpoint mancante/ }).click();
  await setCanvasWidth(laboratory, 1536, '2xl', 12, 'Desktop');
  await expect(laboratory.getByTestId('responsive-origin')).toHaveText('Missing');
  await expect(laboratory.locator('[data-testid^="result-card-missing-"]')).toHaveCount(0);

  await laboratory.getByRole('button', { name: 'Deriva preview sintetica non persistita' }).click();
  await expect(laboratory.locator('[data-testid^="result-card-missing-"]')).toHaveCount(3);
  await expect(laboratory.getByTestId('missing-breakpoint-status')).toContainText(/non pu/);
  await expect(laboratory.getByRole('button', { name: 'Conferma in memoria' })).toBeDisabled();
  await expectValidGeometry(laboratory, 12);
});

test('synthetic Light runtime expansion restores its baseline and keeps Stack root atomic', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Light, Stack e sezioni/ }).click();
  const light = laboratory.getByTestId('result-card-light-dynamic');
  const referenceLight = laboratory.getByTestId('reference-card-light-dynamic');
  const stack = laboratory.getByTestId('result-card-stack-root');
  await expect(light).toHaveAttribute('data-item-kind', 'light');
  await expect(stack).toHaveAttribute('data-item-kind', 'stack-root');
  await expect(laboratory.getByTestId('result-card-special-section')).toHaveAttribute('data-item-kind', 'special-section');
  const initial = await layoutSnapshot(laboratory);

  await laboratory.getByRole('button', { name: /Simula espansione Light \/ dispositivo/ }).click();
  await expect(light).toHaveAttribute('data-w', '5');
  await expect(light).toHaveAttribute('data-h', '2');
  await expect(referenceLight).toHaveAttribute('data-w', '4');
  await expect(referenceLight).toHaveAttribute('data-h', '1');
  await expect(laboratory.getByTestId('preview-validation')).toHaveText('collisions=0 / out=0');

  await laboratory.getByRole('button', { name: /Simula espansione Light \/ dispositivo/ }).click();
  expect(await layoutSnapshot(laboratory)).toEqual(initial);
  expect(await layoutSnapshot(laboratory, 'reference')).toEqual(initial);
});

test('30-card mixed fixture reports measured responsive derivation and render costs', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto('/grid-test');
  const laboratory = laboratoryFor(page);
  await laboratory.getByRole('button', { name: /Densità responsive/ }).click();
  await expect(laboratory.locator('[data-testid^="result-card-density-"]')).toHaveCount(30);

  const measureWidths = async (includeRgl) => {
    const samples = [];
    for (const [width, breakpoint, cols] of [[1536, '2xl', 12], [768, 'md', 6], [390, 'xs', 2]]) {
      const updateMs = await laboratory.getByLabel('Larghezza canvas').evaluate((input, nextWidth) => new Promise((resolve) => {
        const startedAt = performance.now();
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor.set.call(input, String(nextWidth));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - startedAt)));
      }), width);
      await expect(laboratory.getByTestId('responsive-breakpoint')).toHaveText(breakpoint);
      await expect(laboratory.getByTestId('responsive-cols')).toHaveText(String(cols));
      await expect(laboratory.locator('[data-testid^="result-card-density-"]')).toHaveCount(30);
      if (includeRgl) {
        await expect(laboratory.getByTestId('rgl-experiment')).toHaveAttribute('data-rgl-fidelity', 'exact');
      }
      const solverMs = Number(await laboratory.getByTestId('responsive-derive-duration').getAttribute('data-duration-ms'));
      samples.push({ width, updateMs: Number(updateMs.toFixed(3)), solverMs });
      await expectValidGeometry(laboratory, cols);
    }
    return samples;
  };

  await laboratory.getByRole('button', { name: 'Nascondi esperimento RGL' }).click();
  await expect(laboratory.getByTestId('rgl-experiment-disabled')).toBeVisible();
  const customOnly = await measureWidths(false);
  await laboratory.getByRole('button', { name: 'Mostra esperimento RGL' }).click();
  const withRgl = await measureWidths(true);

  console.log(`[grid-engine-2 performance] ${JSON.stringify({ customOnly, withRgl })}`);
  expect([...customOnly, ...withRgl].every(
    (sample) => Number.isFinite(sample.updateMs) && Number.isFinite(sample.solverMs),
  )).toBe(true);
});
