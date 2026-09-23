const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test, expect } = require('@playwright/test');

const css = (name) => readFileSync(resolve(__dirname, `../src/components/widgets/${name}.css`), 'utf8');

test('Cover reveals position, tilt and quick actions only as its container grows', async ({ page }) => {
  await page.setContent(`<style>${css('CoverCard')}</style><div id="frame" style="width:120px;height:60px"><div class="cover-card" data-cover-control-mode="position" data-cover-has-position="true" data-cover-has-tilt-control="true"><div class="cover-card__surface"><span class="cover-card__icon-shell"></span><span class="cover-card__meta"><span class="cover-card__title">Cover</span><span class="cover-card__subtitle">Open</span></span><button class="cover-card__mode-button">Mode</button><div class="cover-card__controls"><div class="cover-card__cover-slider"></div><div class="cover-card__tilt-segments"></div><div class="cover-card__quick-actions"><button class="cover-card__quick-action">Open</button></div></div></div></div></div>`);
  const displays = async (width, height) => page.evaluate(({ width, height }) => {
    const frame = document.querySelector('#frame');
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    return ['subtitle', 'controls', 'cover-slider', 'tilt-segments', 'quick-actions'].map((name) => getComputedStyle(document.querySelector(`.cover-card__${name}`)).display);
  }, { width, height });
  expect(await displays(120, 60)).toEqual(['none', 'none', 'none', 'none', 'none']);
  expect((await displays(132, 72))[0]).not.toBe('none');
  expect((await displays(170, 148)).slice(1)).toEqual(['grid', 'block', 'none', 'none']);
  expect((await displays(300, 235)).slice(1)).toEqual(['grid', 'block', 'grid', 'flex']);
  const wideFits = await page.evaluate(() => document.querySelector('.cover-card__controls').getBoundingClientRect().bottom <= document.querySelector('.cover-card__surface').getBoundingClientRect().bottom);
  expect(wideFits).toBe(true);
  expect((await displays(176, 250)).slice(1)).toEqual(['grid', 'block', 'grid', 'flex']);
  const tallFits = await page.evaluate(() => document.querySelector('.cover-card__controls').getBoundingClientRect().bottom <= document.querySelector('.cover-card__surface').getBoundingClientRect().bottom);
  expect(tallFits).toBe(true);
});

for (const name of ['fan', 'humidifier']) {
  test(`${name} fits its controls at 3x3 and reveals all controls only when the container has room`, async ({ page }) => {
    const prefix = `${name}-card`;
    const control = name === 'fan' ? 'speed' : 'humidity';
    const otherControls = name === 'fan' ? ['preset', 'oscillation', 'direction'] : ['mode'];
    const controls = [control, ...otherControls].map((key, index) => `<div class="${prefix}__control ${prefix}__control--${key}" data-active="${index === 0}"><div class="card-control-track">${key}</div></div>`).join('');
    const values = name === 'humidifier' ? '<div class="humidifier-card__values"><div><small>Target</small><strong>50%</strong></div><div><small>Current 43%</small></div></div>' : '';
    const speedLabel = name === 'fan' ? '<div class="fan-card__control-label"><span>Speed</span></div>' : '';
    await page.setContent(`<style>${css('DeviceControlCardHeader')}${css('CardValueSlider')}${css(name === 'fan' ? 'FanCard' : 'HumidifierCard')}.liquid-glass-card { border:1px solid transparent; }</style><div id="frame" style="width:120px;height:48px"><div class="${prefix} adaptive-device-card" data-display-variant="mini" data-${name}-display-variant="mini" data-${name}-control-mode="${control}"><div class="${prefix}__surface adaptive-device-card__surface liquid-glass-card"><div class="device-control-card__header" data-has-secondary="true"><button class="device-control-card__toggle">I</button><span class="device-control-card__meta"><strong>Device</strong><small>On</small></span><button class="device-control-card__secondary">Mode</button></div>${values}<div class="${prefix}__controls">${speedLabel}${controls}</div></div></div></div>`);
    const state = async (width, height, variant) => page.evaluate(({ width, height, variant, prefix, name }) => {
      const frame = document.querySelector('#frame');
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      frame.firstElementChild.dataset.displayVariant = variant;
      frame.firstElementChild.dataset[`${name}DisplayVariant`] = variant;
      const display = (selector) => getComputedStyle(document.querySelector(selector)).display;
      const surface = document.querySelector(`.${prefix}__surface`).getBoundingClientRect();
      const chipElement = document.querySelector('.device-control-card__secondary');
      const chipBounds = chipElement.getBoundingClientRect();
      const visibleTracks = [...document.querySelectorAll(`.${prefix}__control .card-control-track`)]
        .filter((element) => getComputedStyle(element.parentElement).display !== 'none');
      return {
        status: display('.device-control-card__meta small'),
        controls: display(`.${prefix}__controls`),
        visibleControls: visibleTracks.length,
        chip: display('.device-control-card__secondary'),
        fits: visibleTracks.every((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top >= surface.top && bounds.bottom <= surface.bottom - 1 && bounds.left >= surface.left && bounds.right <= surface.right;
        }),
        chipFits: chipBounds.left >= surface.left && chipBounds.right <= surface.right,
      };
    }, { width, height, variant, prefix, name });

    expect((await state(120, 48, 'mini')).visibleControls).toBe(0);
    expect((await state(200, 48, 'mini')).status).not.toBe('none');
    const xsStandard = await state(142, 112, 'standard');
    expect(xsStandard.visibleControls).toBe(1);
    expect(xsStandard.chip).not.toBe('none');
    expect(xsStandard.fits).toBe(true);
    expect(xsStandard.chipFits).toBe(true);
    const narrowStandard = await state(132, 108, 'standard');
    expect(narrowStandard.visibleControls).toBe(1);
    expect(narrowStandard.fits).toBe(true);
    expect(narrowStandard.chipFits).toBe(true);

    const expanded = await state(320, 176, 'full');
    expect(expanded.visibleControls).toBe(1);
    expect(expanded.chip).not.toBe('none');
    expect(expanded.fits).toBe(true);

    const tall = await state(190, 240, 'full');
    expect(tall.visibleControls).toBe(1);
    expect(tall.chip).not.toBe('none');
    expect(tall.fits).toBe(true);

    const roomy = await state(320, 320, 'full');
    expect(roomy.visibleControls).toBe(otherControls.length + 1);
    expect(roomy.chip).toBe('none');
    expect(roomy.fits).toBe(true);
  });
}

test('Fan and Humidifier slider fills have a straight inner edge until complete', async ({ page }) => {
  await page.setContent(`<style>${css('CardValueSlider')}</style>
    <div class="card-value-slider card-control-track" data-tone="fan" data-at-end="false" style="width:200px;--card-value-progress:50%"><span class="card-value-slider__fill"></span></div>
    <div class="card-value-slider card-control-track" data-tone="humidity" data-at-end="false" style="width:200px;--card-value-progress:50%"><span class="card-value-slider__fill"></span></div>
    <div class="card-value-slider card-control-track" data-tone="fan" data-at-end="true" style="width:200px;--card-value-progress:100%"><span class="card-value-slider__fill"></span></div>`);
  const radii = await page.locator('.card-value-slider__fill').evaluateAll((fills) => fills.map((fill) => ({
    left: getComputedStyle(fill).borderTopLeftRadius,
    right: getComputedStyle(fill).borderTopRightRadius,
  })));
  expect(radii[0].left).not.toBe('0px');
  expect(radii[0].right).toBe('0px');
  expect(radii[1].right).toBe('0px');
  expect(radii[2].right).not.toBe('0px');
});
