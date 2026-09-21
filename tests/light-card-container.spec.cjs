const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test, expect } = require('@playwright/test');

const lightCss = readFileSync(resolve(__dirname, '../src/components/widgets/LightCard.css'), 'utf8');

test('Light Card reveals controls and details from its own size', async ({ page }) => {
  await page.setContent(`
    <style>${lightCss}</style>
    <div id="frame" style="width:120px;height:48px">
      <div class="light-card" data-light-state="on" data-light-mode="brightness" data-light-has-slider="true" data-light-has-details="true">
        <div class="light-card__surface">
          <div class="light-card__icon-shell">●</div>
          <div class="light-card__meta"><p class="light-card__title">Luce sala</p><p class="light-card__status">Accesa · 67%</p></div>
          <div class="light-card__top-actions">
            <button class="light-card__mode-button">Palette</button>
            <span class="light-card__timer">T</span>
          </div>
          <div class="light-card__controls"><div class="light-card__slider"><input class="light-card__slider-input" type="range" /></div></div>
          <div class="light-card__details">
            <span class="light-card__detail"><span class="light-card__detail-icon">C</span><span class="light-card__detail-copy"><small>Colore</small><strong>210°</strong></span></span>
            <span class="light-card__detail"><span class="light-card__detail-icon">T</span><span class="light-card__detail-copy"><small>Temperatura</small><strong>3200 K</strong></span></span>
            <span class="light-card__detail"><span class="light-card__detail-icon">E</span><span class="light-card__detail-copy"><small>Effetto</small><strong>Relax</strong></span></span>
          </div>
          <button class="light-card__toggle">Toggle</button>
        </div>
      </div>
    </div>
  `);

  const stateAt = async (width, height) => page.evaluate(({ width, height }) => {
    const frame = document.querySelector('#frame');
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    const display = (selector) => getComputedStyle(document.querySelector(selector)).display;
    const bounds = (selector) => {
      const { top, bottom, left, right, width: itemWidth } = document.querySelector(selector).getBoundingClientRect();
      return { top, bottom, left, right, width: itemWidth };
    };
    return {
      status: display('.light-card__status'),
      palette: display('.light-card__mode-button'),
      controls: display('.light-card__controls'),
      details: display('.light-card__details'),
      surface: bounds('.light-card__surface'),
      meta: bounds('.light-card__meta'),
      slider: bounds('.light-card__slider'),
      detail: bounds('.light-card__detail'),
      detailWidths: [...document.querySelectorAll('.light-card__detail')].map((item) => item.getBoundingClientRect().width),
      paletteOnTop: (() => {
        const rect = document.querySelector('.light-card__mode-button').getBoundingClientRect();
        return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.classList.contains('light-card__mode-button');
      })(),
      sliderOnTop: (() => {
        const rect = document.querySelector('.light-card__slider-input').getBoundingClientRect();
        return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.classList.contains('light-card__slider-input');
      })(),
    };
  }, { width, height });

  const mini = await stateAt(120, 48);
  expect(mini.status).toBe('none');
  expect(mini.palette).toBe('none');
  expect(mini.controls).toBe('none');

  const horizontal = await stateAt(150, 60);
  expect(horizontal.status).toBe('block');
  expect(horizontal.palette).toBe('none');
  expect(horizontal.controls).toBe('none');

  const vertical = await stateAt(104, 112);
  expect(vertical.status).toBe('block');
  expect(vertical.palette).toBe('none');
  expect(vertical.controls).toBe('none');

  const standardMinimum = await stateAt(170, 104);
  expect(standardMinimum.controls).not.toBe('none');
  expect(standardMinimum.meta.width).toBeGreaterThan(50);
  expect(standardMinimum.slider.bottom).toBeLessThanOrEqual(standardMinimum.surface.bottom);

  const standard = await stateAt(192, 112);
  expect(standard.palette).not.toBe('none');
  expect(standard.controls).not.toBe('none');
  expect(standard.details).toBe('none');
  expect(standard.slider.bottom).toBeLessThanOrEqual(standard.surface.bottom);
  expect(standard.paletteOnTop).toBe(true);
  expect(standard.sliderOnTop).toBe(true);

  const beforeWide = await stateAt(319, 104);
  expect(beforeWide.details).toBe('none');

  const wide = await stateAt(320, 104);
  expect(wide.details).toBe('flex');
  expect(wide.slider.bottom).toBeLessThanOrEqual(wide.surface.bottom);
  expect(wide.detail.bottom).toBeLessThanOrEqual(wide.surface.bottom);

  const tall = await stateAt(176, 160);
  expect(tall.details).toBe('flex');
  expect(tall.detailWidths[0]).toBeCloseTo(tall.detailWidths[1], 0);
  expect(tall.detail.bottom).toBeLessThanOrEqual(tall.surface.bottom);

  await page.locator('.light-card__detail').last().evaluate((detail) => detail.remove());
  const twoDetails = await stateAt(176, 160);
  expect(twoDetails.detailWidths).toHaveLength(2);
  expect(twoDetails.detailWidths[0]).toBeGreaterThan(tall.detailWidths[0]);

  await page.locator('.light-card').evaluate((card) => card.setAttribute('data-light-has-details', 'false'));
  const sliderOnly = await stateAt(320, 104);
  expect(sliderOnly.details).toBe('none');
  expect(sliderOnly.slider.width).toBeGreaterThan(wide.slider.width);

  await page.locator('.light-card').evaluate((card) => {
    card.setAttribute('data-light-has-slider', 'false');
  });
  const onOff = await stateAt(400, 200);
  expect(onOff.controls).toBe('none');
  expect(onOff.details).toBe('none');
});
