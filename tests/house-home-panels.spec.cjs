const { test, expect } = require('@playwright/test');
const { connectHomeAssistant } = require('./support/fakeHomeAssistant.cjs');

const TYPE = 'domusos/dashboard/get_house_context';

test('an open Home light panel follows a House room move and rename without reload', async ({ page }) => {
  const widget = {
    id: 'qa-house-lamp', kind: 'light', title: 'Lampada QA', entityId: 'light.house_lamp', dataSource: 'ha',
    status: 'on', isOn: true, layout: { i: 'qa-house-lamp', x: 0, y: 0, w: 2, h: 4 },
  };
  const layout = {
    version: 14, layoutEngine: 'grid-engine-2', gridMetricsVersion: 'v2',
    widgetTypeLayoutOverrides: {}, widgetLayoutOverrides: {}, responsiveLayouts: {}, sections: [], widgets: [widget],
  };
  await page.addInitScript((value) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.builder.layout.v1', JSON.stringify(value));
  }, layout);
  let room = 'a';
  let roomName = 'Sala';
  let revision = 1;
  const home = await connectHomeAssistant(page, {
    states: { 'light.house_lamp': { state: 'on', attributes: { friendly_name: 'Lampada QA', brightness: 255 } } },
    handle(message, { reply }) {
      if (message.type !== TYPE) return false;
      reply({
        schemaVersion: 'domusos.dashboard.house.v1', topologyRevision: revision,
        rooms: [{ id: room, name: roomName }], devices: [],
        entities: [{ registryId: 'stable-light', entityId: 'light.house_lamp', deviceId: null, effectiveRoomId: room }],
      });
      return true;
    },
  });
  await page.goto('/home');
  const card = page.locator('[data-grid-engine-root-item="qa-house-lamp"]');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Controlli di Lampada QA/i }).click();
  const panel = page.locator('.panel-shell').first();
  await expect(panel).toContainText('Sala');
  expect(home.messages.some((message) => message.type === TYPE)).toBe(true);

  room = 'b'; roomName = 'Studio'; revision += 1;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(panel).toContainText('Studio');
  await expect(panel).not.toContainText('Sala');

  roomName = 'Studio nuovo'; revision += 1;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(panel).toContainText('Studio nuovo');
  expect(home.messages.filter((message) => message.type === TYPE).length).toBeGreaterThanOrEqual(3);
});
