const { test, expect } = require('@playwright/test');
const path = require('node:path');

/*
 * Energy history (Andamento) against a simulated Home Assistant: the websocket
 * serves the realtime projection and domusos/energy/get_history documents
 * shaped as A2.0 returns them. Values are fixtures of this test only.
 * HISTORY_SCREENSHOTS=<dir> also saves the section for a visual review.
 */

const HA = 'http://homeassistant.local:8123';
const SENSORS = { 'sensor.grid_power': 900, 'sensor.pv_power': 2400 };

const quantity = (value, entity) => ({
  status: 'ok', value, unit: 'W', source: 'measured', entity_ids: [entity], reason: null, freshness: 'fresh',
  reported_at: new Date(Date.now() - 5000).toISOString(), stale_after: 1800,
});
const module = (quantities, extra = {}) => ({ status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities, ...extra });

const ENERGY_STATE = () => ({
  configured: true, load_error: false, available: true, profile_revision: 4, observed_at: new Date().toISOString(),
  modules: {
    grid: module({ net_power: quantity(900, 'sensor.grid_power') }, { sign_convention: 'positive_import' }),
    solar: module({ production_power: quantity(2400, 'sensor.pv_power') }),
  },
  absent_modules: ['home', 'battery', 'wallbox'], offline_modules: [],
  home_consumption: { ...quantity(3300, 'sensor.grid_power'), source: 'derived', stale_after: null },
  tariff: null,
});

const pad = (value) => String(value).padStart(2, '0');
const round = (value) => Math.round(value * 1000) / 1000;
const HOURS = Array.from({ length: 24 }, (_, hour) => `2026-10-05T${pad(hour)}:00:00+02:00`);
const DAYS = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((date) => `${date}T00:00:00+02:00`);

/** A sunny day: production follows the sun, the home a morning and an evening peak. */
const solar = (hour) => round(Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI)) * 2.6);
const home = (hour) => round(0.35 + (hour >= 7 && hour <= 9 ? 0.9 : 0) + (hour >= 18 && hour <= 22 ? 1.4 : 0));

function seriesOf(starts, values, extra = {}) {
  const points = values.map((value, index) => (value !== null && typeof value === 'object' ? { start: starts[index], ...value } : { start: starts[index], value }));
  const inProgress = extra.in_progress_last ?? false;
  const complete = (inProgress ? points.slice(0, -1) : points).every((point) => point.value !== null);
  return { source: 'total', statistic_ids: ['sensor.energy'], points, complete, status: complete ? 'complete' : 'partial_data', in_progress_last: inProgress, ...extra };
}

function documentOf(bucket, starts, series, unavailable = {}) {
  return {
    configured: true,
    range: { start: starts[0], end: '2026-10-06T00:00:00+02:00', bucket, timezone: 'Europe/Rome' },
    unit: 'kWh', recorder: 'available', verification: 'complete',
    series, unavailable, devices: {}, cost: null, previous: null, generated_at: '2026-10-05T21:30:00+00:00',
  };
}

function dayHistory({ gap = false } = {}) {
  const production = HOURS.map((_, hour) => solar(hour));
  const consumption = HOURS.map((_, hour) => home(hour));
  const imported = consumption.map((value, hour) => round(Math.max(0, value - production[hour])));
  const exported = consumption.map((value, hour) => round(Math.max(0, production[hour] - value)));
  // The last hour is still being compiled by the Recorder.
  const open = (values) => [...values.slice(0, -1), null];
  const series = {
    consumption: seriesOf(HOURS, open(consumption), { source: 'derived', in_progress_last: true, terms: { grid_import: 1, production: 1, grid_export: -1 } }),
    production: seriesOf(HOURS, open(production), { in_progress_last: true }),
    grid_import: seriesOf(HOURS, open(imported), { in_progress_last: true }),
    grid_export: seriesOf(HOURS, open(exported), { in_progress_last: true }),
  };
  if (gap) {
    // The import meter has no row for 13:00 and 14:00: the import and the derived consumption have a gap there.
    for (const hour of [13, 14]) {
      series.grid_import.points[hour] = { start: HOURS[hour], value: null, missing: ['sensor.grid_energy'] };
      series.consumption.points[hour] = { start: HOURS[hour], value: null, missing: ['grid_import'] };
    }
    for (const name of ['grid_import', 'consumption']) Object.assign(series[name], { complete: false, status: 'partial_data' });
  }
  return documentOf('hour', HOURS, series);
}

function weekHistory() {
  const values = [9.8, 12.4, 11.1, 8.7, 13.9, 12.2, 4.1];
  const production = [14.2, 6.1, 17.8, 18.4, 9.9, 15.1, 5.2];
  return documentOf('day', DAYS, {
    consumption: seriesOf(DAYS, values, { source: 'derived', in_progress_last: true, terms: { grid_import: 1, production: 1, grid_export: -1 } }),
    production: seriesOf(DAYS, production, { in_progress_last: true }),
    grid_import: seriesOf(DAYS, values.map((value, day) => round(Math.max(0, value - production[day] * 0.55))), { in_progress_last: true }),
    grid_export: seriesOf(DAYS, production.map((value, day) => round(Math.max(0, value * 0.45 - 0.2 * day))), { in_progress_last: true }),
  });
}

const NO_METER = documentOf('hour', HOURS, {}, {
  grid_import: { reason: 'no_energy_meter', statistic_ids: [] },
  grid_export: { reason: 'no_energy_meter', statistic_ids: [] },
  production: { reason: 'no_energy_meter', statistic_ids: [] },
  consumption: { reason: 'no_energy_meter', statistic_ids: [], needs: ['grid_import', 'production', 'grid_export'] },
});

/** Simulated Home Assistant; `history(range)` answers get_history (an Error rejects it). */
async function simulateHomeAssistant(page, history) {
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
          case 'subscribe_entities': {
            reply(null);
            const now = Date.now() / 1000;
            const state = (value) => ({ s: String(value), a: { unit_of_measurement: 'W', device_class: 'power' }, c: 'ctx', lc: now, lu: now });
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: Object.fromEntries(Object.entries(SENSORS).map(([id, value]) => [id, state(value)])) } }));
            break;
          }
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
            reply(ENERGY_STATE());
            break;
          case 'domusos/energy/get_history': {
            requests.push(message.range);
            const answer = history(message.range);
            if (answer instanceof Error) {
              ws.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code: answer.message, message: 'History not available' } }));
            } else {
              reply(answer);
            }
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

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Axis labels never overlap: each one ends before the next starts. */
async function expectReadableAxis(section) {
  const boxes = await section.locator('svg[role="img"] text[text-anchor="middle"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()).map((box) => ({ left: box.left, right: box.right })));
  expect(boxes.length).toBeGreaterThan(1);
  boxes.slice(1).forEach((box, index) => expect(box.left).toBeGreaterThanOrEqual(boxes[index].right));
}

async function capture(section, name) {
  if (!process.env.HISTORY_SCREENSHOTS) return;
  // The section at rest: no reading open.
  await section.page().evaluate(() => document.activeElement?.blur());
  await section.page().mouse.move(0, 0);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: path.join(process.env.HISTORY_SCREENSHOTS, `${name}.png`), animations: 'disabled' });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 960 }]) {
  test(`complete 24-hour history at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const requests = await simulateHomeAssistant(page, () => dayHistory());
    await page.goto('/consumi/energia');

    const section = historySection(page);
    await expect(section.getByRole('img', { name: 'Grafico dell’energia per ora. Usa le frecce per leggere i valori.' })).toBeVisible();
    await expect(section.getByRole('radio', { name: '24 ore' })).toHaveAttribute('aria-checked', 'true');
    const legend = section.getByRole('group', { name: 'Serie da mostrare' });
    await expect(legend.getByRole('button')).toHaveText(['Consumi· calcolato', 'Fotovoltaico', 'Prelievo', 'Immissione']);
    await expect(section.getByText('L’ultimo intervallo è ancora in corso.')).toBeVisible();
    await expect(section.getByText(/Dati incompleti/)).toHaveCount(0);
    // The realtime page stays as it is.
    await expect(page.getByTestId('energy-hero')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadableAxis(section);

    // The keyboard reads every bucket; the last one is still in progress.
    await section.getByRole('img', { name: /Grafico dell’energia/ }).focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    const reading = section.getByRole('status');
    await expect(reading).toContainText('lun 5 ott · 01:00');
    await expect(reading).toContainText('Calcolato dal bilancio dei contatori');
    await page.keyboard.press('End');
    await expect(reading).toContainText('in corso');
    await expect(reading).not.toContainText(/NaN|undefined|null kWh/);
    const box = await reading.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

    expect(requests).toEqual(['24h']);
    if (viewport.width === 1440) await capture(section, 'a-24h-complete');
    if (viewport.width === 390) await capture(section, 'e-mobile-390');
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 960 }]) {
  test(`changing from 24 hours to 7 days at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const requests = await simulateHomeAssistant(page, (range) => (range === '7d' ? weekHistory() : dayHistory()));
    await page.goto('/consumi/energia');
    const section = historySection(page);
    await expect(section.getByRole('img', { name: /per ora/ })).toBeVisible();

    await section.getByRole('radio', { name: '7 giorni' }).click();

    await expect(section.getByRole('img', { name: /per giorno/ })).toBeVisible();
    await expect(section.locator('p', { hasText: 'Energia per giorno, in kWh' })).toBeVisible();
    await expect(section.getByRole('table')).toContainText('Oggi · in corso');
    // Back to a period already read: answered from memory, nothing is sent.
    await section.getByRole('radio', { name: '24 ore' }).click();
    await expect(section.getByRole('img', { name: /per ora/ })).toBeVisible();
    expect(requests).toEqual(['24h', '7d']);
    await section.getByRole('radio', { name: '7 giorni' }).click();
    await expect(section.getByRole('img', { name: /per giorno/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectReadableAxis(section);
    if (viewport.width === 1440) await capture(section, 'b-7d');
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test(`a missing bucket leaves a gap and is called incomplete at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await simulateHomeAssistant(page, () => dayHistory({ gap: true }));
    await page.goto('/consumi/energia');
    const section = historySection(page);

    await expect(section.getByText(/Dati incompleti in alcuni intervalli/)).toBeVisible();
    await expect(section.getByTestId('history-incomplete')).toHaveCount(2);
    // The import line restarts after the gap instead of falling to 0.
    expect((await section.locator('[data-series="grid_import"] path').getAttribute('d')).match(/M/g)).toHaveLength(2);
    await expect(section.getByRole('table')).toContainText('Non disponibile (Dati incompleti)');
    await expectNoHorizontalOverflow(page);
    if (viewport.width === 820) await capture(section, 'c-partial');
  });
}

test('the Recorder unavailable keeps the realtime page', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const requests = await simulateHomeAssistant(page, () => new Error('recorder_unavailable'));
  await page.goto('/consumi/energia');
  const section = historySection(page);

  await expect(section.getByText('Lo storico di Home Assistant non è temporaneamente disponibile.')).toBeVisible();
  await expect(page.getByTestId('energy-hero')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Componenti dell’impianto' })).toBeVisible();
  await section.getByRole('button', { name: /Riprova/ }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expectNoHorizontalOverflow(page);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 960 }]) {
  test(`no energy meter explains the history and offers the settings at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await simulateHomeAssistant(page, () => NO_METER);
    await page.goto('/consumi/energia');
    const section = historySection(page);

    await expect(section.getByText('Lo storico non è ancora configurato')).toBeVisible();
    await expect(section.getByText('Domus Energy continua comunque a funzionare in tempo reale.')).toBeVisible();
    await expect(section.getByRole('img', { name: /Grafico dell’energia/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    if (viewport.width === 1440) await capture(section, 'd-no-meter');
    await section.getByRole('button', { name: 'Apri le impostazioni' }).click();
    await expect(page.getByRole('heading', { name: 'Impostazioni Energia' })).toBeVisible();
  });
}
