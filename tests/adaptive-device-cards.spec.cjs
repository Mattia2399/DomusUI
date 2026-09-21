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

for (const { name, compact, standard, full } of [
  { name: 'fan', compact: [132, 48], standard: [180, 108], full: [310, 240] },
  { name: 'humidifier', compact: [132, 48], standard: [180, 108], full: [300, 225] },
]) {
  test(`${name} reveals controls from its own size`, async ({ page }) => {
    const prefix = `${name}-card`;
    const control = name === 'fan' ? 'speed' : 'humidity';
    await page.setContent(`<style>${css('DeviceControlCardHeader')}${css(name === 'fan' ? 'FanCard' : 'HumidifierCard')}.liquid-glass-card { border:1px solid transparent; }</style><div id="frame" style="width:120px;height:40px"><div class="${prefix}" data-${name}-control-mode="${control}"><div class="${prefix}__surface liquid-glass-card"><div class="device-control-card__header"><button class="device-control-card__toggle">I</button><span class="device-control-card__meta"><strong>Device</strong><small>On</small></span><button class="device-control-card__secondary">Mode</button></div><div class="${prefix}__controls"><div class="${prefix}__control ${prefix}__control--${control}" data-active="true">Main</div><div class="${prefix}__control ${prefix}__control--${name === 'fan' ? 'preset' : 'mode'}" data-active="false">More</div></div>${name === 'humidifier' ? `<div class="humidifier-card__values">Values</div>` : ''}</div></div></div>`);
    const state = async (width, height) => page.evaluate(({ width, height, prefix }) => {
      const frame = document.querySelector('#frame');
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      const display = (selector) => getComputedStyle(document.querySelector(selector)).display;
      return {
        status: display('.device-control-card__meta small'),
        controls: display(`.${prefix}__controls`),
        main: display(`.${prefix}__control:first-child`),
        secondary: display(`.${prefix}__control:last-child`),
        headerBottom: document.querySelector('.device-control-card__header').getBoundingClientRect().bottom,
        frameBottom: document.querySelector('#frame').getBoundingClientRect().bottom,
      };
    }, { width, height, prefix });
    expect((await state(120, 40)).status).toBe('none');
    const mini = await state(120, 40);
    expect(mini.headerBottom).toBeLessThanOrEqual(mini.frameBottom);
    expect((await state(...compact)).controls).toBe('none');
    const middle = await state(...standard);
    expect(middle.main).not.toBe('none');
    expect(middle.secondary).toBe('none');
    const expanded = await state(...full);
    expect(expanded.main).not.toBe('none');
    expect(expanded.secondary).not.toBe('none');
  });
}
