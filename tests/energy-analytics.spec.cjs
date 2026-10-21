const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { accessSelfFor } = require('./support/accessSelf.cjs');

/*
 * Period analytics of the Energy page (A2.2B) against a simulated Home
 * Assistant: get_history answers shaped as A2.2A returns them, with summary,
 * kpis and the previous period. Every number is a fixture of this test; the
 * page only formats them. ANALYTICS_SCREENSHOTS=<dir> also saves the section.
 */

const HA = 'http://homeassistant.local:8123';

const quantity = (value, entity, unit = 'W') => ({
  status: 'ok', value, unit, source: 'measured', entity_ids: [entity], reason: null, freshness: 'fresh',
  reported_at: new Date(Date.now() - 5000).toISOString(), stale_after: 1800,
});
const module = (quantities, extra = {}) => ({ status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities, ...extra });

function energyState({ solar = true, battery = false, wallbox = false } = {}) {
  const modules = { grid: module({ net_power: quantity(900, 'sensor.grid_power') }, { sign_convention: 'positive_import' }) };
  if (solar) modules.solar = module({ production_power: quantity(2400, 'sensor.pv_power') });
  if (battery) modules.battery = module({ state_of_charge: quantity(60, 'sensor.battery_soc', '%'), net_power: quantity(0, 'sensor.battery_power') }, { sign_convention: 'positive_discharge' });
  if (wallbox) modules.wallbox = module({ charging_power: quantity(0, 'sensor.wallbox_power') });
  return {
    configured: true, load_error: false, available: true, profile_revision: 7, observed_at: new Date().toISOString(),
    modules,
    absent_modules: ['home', 'solar', 'battery', 'wallbox'].filter((id) => !modules[id]),
    offline_modules: [],
    home_consumption: { ...quantity(3300, 'sensor.grid_power'), source: 'derived', stale_after: null },
    tariff: null,
  };
}

const pad = (value) => String(value).padStart(2, '0');
/** Local midnights from `[year, monthIndex, day]`, all in summer time. */
const days = (count, [year, month, day]) => Array.from({ length: count }, (_, index) => {
  const date = new Date(Date.UTC(year, month, day + index));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T00:00:00+02:00`;
});
const DAYS7 = days(7, [2026, 8, 29]);
const DAYS30 = days(30, [2026, 8, 6]);
const HOURS = Array.from({ length: 24 }, (_, hour) => `2026-10-05T${pad(hour)}:00:00+02:00`);

/** One series whose last bucket is in progress; `null` leaves a closed bucket missing. */
const seriesOf = (starts, values, source = 'total') => {
  const points = starts.map((start, index) => ({ start, value: values[index % values.length] }));
  const complete = points.slice(0, -1).every((point) => point.value !== null);
  return { source, statistic_ids: ['sensor.energy'], points, complete, status: complete ? 'complete' : 'partial_data', in_progress_last: true };
};
const totalOf = (value, closed, extra = {}) => ({
  value, closed_value: closed, unit: 'kWh', status: value === null ? 'partial_data' : 'complete', complete: value !== null,
  in_progress: true, in_progress_included: value !== null, source: 'measured', ...(value === null ? { reason: 'partial_data' } : {}), ...extra,
});
const kpiOf = (value, extra = {}) => ({ value, unit: '%', status: value === null ? 'unavailable' : 'complete', complete: true, in_progress: true, source: 'measured', ...extra });
const changeOf = (current, previous, percent, extra = {}) => ({
  current, previous, absolute_change: current === null || previous === null ? null : Math.round((current - previous) * 1000) / 1000,
  percent_change: percent, status: current === null || previous === null ? 'partial_data' : 'complete', ...extra,
});

function documentOf({ bucket = 'day', starts = DAYS7, series, summary, kpis, comparison, unavailable = {} }) {
  return {
    configured: true,
    range: { start: starts[0], end: '2026-10-06T00:00:00+02:00', bucket, timezone: 'Europe/Rome' },
    unit: 'kWh', recorder: 'available', verification: 'complete',
    series, unavailable, devices: {}, summary, kpis, cost: null,
    previous: {
      range: { start: '2026-09-22T00:00:00+02:00', end: starts[0], bucket, timezone: 'Europe/Rome' },
      summary: {}, kpis: {},
      comparison: { buckets: starts.length - 1, series: comparison },
    },
    generated_at: '2026-10-05T10:30:00+00:00',
  };
}

const solarSeries = (starts) => ({
  consumption: seriesOf(starts, [6, 6.5, 5.5], 'derived'),
  production: seriesOf(starts, [4, 5, 4.5]),
  grid_import: seriesOf(starts, [3, 2.5, 2]),
  grid_export: seriesOf(starts, [1, 0.8, 1.2]),
});

const WEEK = () => documentOf({
  series: solarSeries(DAYS7),
  summary: {
    production: totalOf(31.6, 27), consumption: totalOf(42.8, 36, { source: 'derived' }), grid_import: totalOf(17.8, 15), grid_export: totalOf(6.6, 6),
  },
  kpis: { self_consumption: kpiOf(79.1), self_sufficiency: kpiOf(58.4, { source: 'mixed' }), solar_offset: kpiOf(73.8, { source: 'mixed' }) },
  comparison: { production: changeOf(27, 24.1, 12), consumption: changeOf(36, 39.1, -8), grid_import: changeOf(15, 15, 0), grid_export: changeOf(6, 6.3, -4.8) },
});

const MONTH = () => documentOf({
  starts: DAYS30,
  series: solarSeries(DAYS30),
  summary: {
    production: totalOf(141.2, 136.5), consumption: totalOf(183.5, 177, { source: 'derived' }), grid_import: totalOf(70.4, 68), grid_export: totalOf(28.1, 27.5),
  },
  kpis: { self_consumption: kpiOf(80.1), self_sufficiency: kpiOf(61.6, { source: 'mixed' }), solar_offset: kpiOf(76.9, { source: 'mixed' }) },
  comparison: { production: changeOf(136.5, 110.2, 23.9), consumption: changeOf(177, 180.6, -2), grid_import: changeOf(68, 75, -9.3), grid_export: changeOf(27.5, 20, 37.5) },
});

const SUNNY = () => documentOf({
  series: solarSeries(DAYS7),
  summary: {
    production: totalOf(51.6, 45), consumption: totalOf(43, 37, { source: 'derived' }), grid_import: totalOf(8.4, 7.5), grid_export: totalOf(17, 15.5),
  },
  kpis: { self_consumption: kpiOf(67.1), self_sufficiency: kpiOf(80.5, { source: 'mixed' }), solar_offset: kpiOf(120, { source: 'mixed' }) },
  comparison: { production: changeOf(45, 40, 12.5), consumption: changeOf(37, 37, 0), grid_import: changeOf(7.5, 9, -16.7), grid_export: changeOf(15.5, 11, 40.9) },
});

const FULL_PLANT = () => documentOf({
  series: {
    ...solarSeries(DAYS7),
    battery_charge: seriesOf(DAYS7, [1, 0.5]), battery_discharge: seriesOf(DAYS7, [0.8, 0.6]), wallbox_consumption: seriesOf(DAYS7, [0, 0, 6.2]),
  },
  summary: {
    production: totalOf(31.6, 27), consumption: totalOf(55.2, 48, { source: 'derived' }), grid_import: totalOf(29.6, 26), grid_export: totalOf(4.2, 4),
    battery_charge: totalOf(5.2, 4.5), battery_discharge: totalOf(4.6, 4), wallbox_consumption: totalOf(12.4, 12.4, { in_progress_included: false }),
  },
  kpis: { self_consumption: kpiOf(86.7), self_sufficiency: kpiOf(46.4, { source: 'mixed' }), solar_offset: kpiOf(57.2, { source: 'mixed' }) },
  comparison: {
    production: changeOf(27, 24.1, 12), consumption: changeOf(48, 39.1, 22.8), grid_import: changeOf(26, 18, 44.4), grid_export: changeOf(4, 6.3, -36.5),
    battery_charge: changeOf(4.5, 4.5, 0), battery_discharge: changeOf(4, 4.2, -4.8),
    // The car was not charged in the previous 7 days: no percentage, never infinity.
    wallbox_consumption: changeOf(12.4, 0, null, { reason: 'no_percentage_baseline' }),
  },
});

const PARTIAL = () => {
  const series = solarSeries(DAYS7);
  series.grid_import = seriesOf(DAYS7, [3, null, 2]);
  series.consumption = seriesOf(DAYS7, [6, null, 5.5], 'derived');
  return documentOf({
    series,
    summary: {
      production: totalOf(31.6, 27), consumption: totalOf(null, null, { partial_value: 28.9, source: 'derived' }),
      grid_import: totalOf(null, null, { partial_value: 12.5 }), grid_export: totalOf(6.6, 6),
    },
    kpis: {
      self_consumption: kpiOf(79.1),
      self_sufficiency: kpiOf(null, { status: 'partial_data', complete: false, reason: 'partial_data', source: 'mixed' }),
      solar_offset: kpiOf(null, { status: 'partial_data', complete: false, reason: 'partial_data', source: 'mixed' }),
    },
    comparison: { production: changeOf(27, 24.1, 12), consumption: changeOf(null, 39.1, null), grid_import: changeOf(null, 15, null), grid_export: changeOf(6, 6.3, -4.8) },
  });
};

const TODAY = () => documentOf({
  bucket: 'hour',
  starts: HOURS,
  series: solarSeries(HOURS),
  summary: {
    production: totalOf(18.4, 18.4, { in_progress_included: false }), consumption: totalOf(21.6, 21.6, { in_progress_included: false, source: 'derived' }),
    grid_import: totalOf(9.1, 9.1, { in_progress_included: false }), grid_export: totalOf(5.9, 5.9, { in_progress_included: false }),
  },
  kpis: { self_consumption: kpiOf(67.9), self_sufficiency: kpiOf(57.9, { source: 'mixed' }), solar_offset: kpiOf(85.2, { source: 'mixed' }) },
  comparison: { production: changeOf(18.4, 20.1, -8.5), consumption: changeOf(21.6, 22.4, -3.6), grid_import: changeOf(9.1, 8.7, 4.6), grid_export: changeOf(5.9, 6.4, -7.8) },
});

const GRID_ONLY = () => documentOf({
  series: { consumption: seriesOf(DAYS7, [8, 7.5], 'derived'), grid_import: seriesOf(DAYS7, [8, 7.5]) },
  summary: { consumption: totalOf(54.3, 47, { source: 'derived' }), grid_import: totalOf(54.3, 47) },
  kpis: { self_sufficiency: kpiOf(0, { source: 'mixed' }) },
  comparison: { consumption: changeOf(47, 50.2, -6.4), grid_import: changeOf(47, 50.2, -6.4) },
  unavailable: {},
});

/** Simulated Home Assistant; `history(range)` answers get_history and every request is recorded. */
async function simulateHomeAssistant(page, history, state = energyState()) {
  const requests = [];
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities':
            reply(null);
            break;
          case 'domusos/access/get_self':
            reply(accessSelfFor({ id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] }));
            break;
          case 'auth/current_user':
            reply({ id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] });
            break;
          case 'config/entity_registry/list_for_display':
            reply({ entity_categories: {}, entities: [] });
            break;
          case 'config/area_registry/list':
          case 'config/entity_registry/list':
          case 'config/device_registry/list':
            reply([]);
            break;
          case 'domusos/energy/get_state':
            reply(state);
            break;
          case 'domusos/energy/get_history': {
            const { id, type, ...payload } = message;
            requests.push(payload);
            reply(history(message.range));
            break;
          }
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript((hassUrl) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
  }, HA);
  return requests;
}

const historySection = (page) => page.getByRole('heading', { name: 'Energia nel tempo' }).locator('xpath=ancestor::section[1]');
const totals = (page) => page.getByRole('heading', { name: 'Energia nel periodo' }).locator('xpath=ancestor::section[1]');
const kpis = (page) => page.getByRole('heading', { name: 'Come usi la tua energia' }).locator('xpath=ancestor::section[1]');
const tile = (page, id) => totals(page).locator(`[data-total="${id}"]`);
const kpi = (page, id) => kpis(page).locator(`[data-kpi="${id}"]`);

async function openWeek(page, history) {
  await page.goto('/consumi/energia');
  await expect(historySection(page).getByRole('img', { name: /Grafico dell’energia/ })).toBeVisible();
  await historySection(page).getByRole('radio', { name: '7 giorni' }).click();
  await expect(totals(page).getByText(/^Ultimi 7 giorni/)).toBeVisible();
  return history;
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function capture(page, name) {
  if (!process.env.ANALYTICS_SCREENSHOTS) return;
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(0, 0);
  // The page scrolls inside its own container: a tall window shows the whole section at the same width.
  const { width } = page.viewportSize();
  await page.setViewportSize({ width, height: 3200 });
  const section = historySection(page);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: path.join(process.env.ANALYTICS_SCREENSHOTS, `${name}.png`), animations: 'disabled' });
}

const byRange = (documents) => (range) => documents[range] ?? TODAY();

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 960 }]) {
  test(`7 days with totals, KPIs and the comparison at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const requests = await simulateHomeAssistant(page, byRange({ '7d': WEEK() }));
    await openWeek(page);

    // One request per period, always with the previous period.
    expect(requests).toEqual([{ range: '24h', compare: 'previous' }, { range: '7d', compare: 'previous' }]);
    await expect(totals(page).getByText('Ultimi 7 giorni · periodo in corso')).toBeVisible();
    await expect(tile(page, 'consumption')).toContainText('42,8 kWh');
    await expect(tile(page, 'consumption')).toContainText('finora');
    await expect(tile(page, 'consumption')).toContainText('↓ 8% rispetto ai 7 giorni precedenti');
    await expect(tile(page, 'production')).toContainText('↑ 12% rispetto ai 7 giorni precedenti');
    await expect(tile(page, 'grid_import')).toContainText('Nessuna variazione');
    await expect(totals(page).getByText('Il confronto esclude il periodo ancora in corso.')).toBeVisible();
    await expect(kpi(page, 'self_consumption')).toHaveAttribute('aria-label', 'Autoconsumo: 79,1%, finora. Quanta energia solare hai utilizzato direttamente in casa.');
    await expect(kpi(page, 'self_sufficiency')).toContainText('58,4%');
    await expect(kpi(page, 'solar_offset')).toContainText('Copertura solare');
    await expect(historySection(page)).not.toContainText(/NaN|undefined|Infinity|∞/);
    await expectNoHorizontalOverflow(page);

    // On phones the totals sit two by two and the KPIs one per row.
    const boxes = await Promise.all(['consumption', 'production'].map((id) => tile(page, id).boundingBox()));
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
    const cards = await Promise.all(['self_consumption', 'self_sufficiency'].map((id) => kpi(page, id).boundingBox()));
    if (viewport.width < 640) expect(cards[1].y).toBeGreaterThan(cards[0].y + cards[0].height - 1);
    else expect(Math.abs(cards[0].y - cards[1].y)).toBeLessThan(2);
    await capture(page, `a-7d-${viewport.width}`);
  });
}

test('changing to 30 days updates totals, KPIs and the comparison together', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const requests = await simulateHomeAssistant(page, byRange({ '7d': WEEK(), '30d': MONTH() }));
  await openWeek(page);

  await historySection(page).getByRole('radio', { name: '30 giorni' }).click();

  await expect(totals(page).getByText('Ultimi 30 giorni · periodo in corso')).toBeVisible();
  // Totals use the chart's precision: no decimal from 100 kWh.
  await expect(tile(page, 'production')).toContainText('141 kWh');
  await expect(tile(page, 'production')).toContainText('↑ 23,9% rispetto ai 30 giorni precedenti');
  await expect(kpi(page, 'self_consumption')).toContainText('80,1%');
  await expect(historySection(page).getByRole('img', { name: /per giorno/ })).toBeVisible();
  // Back to 7 days: answered from memory, the same document feeds every part.
  await historySection(page).getByRole('radio', { name: '7 giorni' }).click();
  await expect(tile(page, 'production')).toContainText('31,6 kWh');
  expect(requests.map((request) => request.range)).toEqual(['24h', '7d', '30d']);
  expect(requests.every((request) => request.compare === 'previous')).toBe(true);
});

test('the method explains the closed days of the comparison', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await simulateHomeAssistant(page, byRange({ '7d': WEEK() }));
  await openWeek(page);

  await historySection(page).getByText('Come viene calcolato?').click();
  const details = historySection(page).locator('details');
  await expect(details).toContainText('usa solo gli intervalli conclusi: 6 giorni per ciascun periodo');
  await expect(details.getByRole('row', { name: /Consumi/ })).toContainText('36 kWh');
  await expect(details.getByRole('row', { name: /Consumi/ })).toContainText('−8%');
  await expectNoHorizontalOverflow(page);
});

test('a solar coverage of 120% is shown as it is', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await simulateHomeAssistant(page, byRange({ '7d': SUNNY() }));
  await openWeek(page);

  await expect(kpi(page, 'solar_offset')).toContainText('120%');
  await expect(kpi(page, 'solar_offset')).toContainText('Nel periodo hai prodotto più energia solare di quanta ne hai consumata.');
  await expect(kpi(page, 'self_consumption')).toContainText('67,1%');
  await capture(page, 'c-solar-offset-120');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 960 }]) {
  test(`photovoltaics, battery and car with a previous period at zero at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await simulateHomeAssistant(page, byRange({ '7d': FULL_PLANT() }), energyState({ battery: true, wallbox: true }));
    await openWeek(page);

    await expect(tile(page, 'battery_charge')).toContainText('5,2 kWh');
    await expect(tile(page, 'battery_discharge')).toContainText('4,6 kWh');
    await expect(tile(page, 'wallbox_consumption')).toContainText('12,4 kWh');
    await expect(tile(page, 'wallbox_consumption')).toContainText('Nuovo rispetto ai 7 giorni precedenti');
    await expect(tile(page, 'wallbox_consumption')).not.toContainText('%');
    await expect(kpis(page).locator('[data-kpi]')).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
    await capture(page, viewport.width === 1440 ? 'b-full-plant' : 'e-previous-zero-390');
  });
}

test('incomplete data shows no total and no precise comparison', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await simulateHomeAssistant(page, byRange({ '7d': PARTIAL() }));
  await openWeek(page);

  await expect(tile(page, 'grid_import')).toContainText('—');
  await expect(tile(page, 'grid_import')).toContainText('Dati incompleti');
  await expect(tile(page, 'grid_import')).toContainText('Dato parziale: 12,5 kWh misurati');
  await expect(tile(page, 'grid_import')).toContainText('Confronto non disponibile · dati incompleti');
  await expect(tile(page, 'production')).toContainText('31,6 kWh');
  await expect(kpi(page, 'self_sufficiency')).toContainText('Dati incompleti nel periodo.');
  await expect(kpi(page, 'self_consumption')).toContainText('79,1%');
  await capture(page, 'f-partial');
});

test('the 24 hours in progress read so far and compare only closed hours', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const requests = await simulateHomeAssistant(page, byRange({}));
  await page.goto('/consumi/energia');

  await expect(totals(page).getByText('Ultime 24 ore · periodo in corso')).toBeVisible();
  await expect(tile(page, 'production')).toContainText('18,4 kWh');
  await expect(tile(page, 'production')).toContainText('finora');
  await expect(tile(page, 'production')).toContainText('↓ 8,5% rispetto alle 24 ore precedenti');
  await expect(totals(page).getByText('Il confronto esclude il periodo ancora in corso.')).toBeVisible();
  expect(requests).toEqual([{ range: '24h', compare: 'previous' }]);
  await capture(page, 'd-in-progress');
});

test('a plant without photovoltaics has no solar KPI and no solar tile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simulateHomeAssistant(page, byRange({ '7d': GRID_ONLY() }), energyState({ solar: false }));
  await openWeek(page);

  await expect(kpis(page).locator('[data-kpi]')).toHaveCount(1);
  await expect(kpi(page, 'self_sufficiency')).toContainText('0%');
  await expect(totals(page).locator('[data-total]')).toHaveCount(2);
  await expect(historySection(page).getByText('Copertura solare')).toHaveCount(0);
  await expect(historySection(page).getByText('Autoconsumo')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, 'g-no-solar-390');
});
