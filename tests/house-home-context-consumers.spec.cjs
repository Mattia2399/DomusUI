const { test, expect } = require('@playwright/test');
const { connectHomeAssistant } = require('./support/fakeHomeAssistant.cjs');
const { accessSelfFor } = require('./support/accessSelf.cjs');

const TYPE = 'domusos/dashboard/get_house_context';
const setup = async (page, widgets) => {
  await page.addInitScript((items) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.builder.layout.v1', JSON.stringify({
      version: 14, layoutEngine: 'grid-engine-2', gridMetricsVersion: 'v2',
      widgetTypeLayoutOverrides: {}, widgetLayoutOverrides: {}, responsiveLayouts: {}, sections: [], widgets: items,
    }));
  }, widgets);
};

test('editor groups an entity inheriting its device room in the same House room', async ({ page }) => {
  page.setDefaultTimeout(10_000);
  const widget = { id: 'house-switch', kind: 'switch', title: 'Presa House', entityId: 'switch.main', dataSource: 'ha',
    status: 'on', isOn: true, layout: { i: 'house-switch', x: 0, y: 0, w: 2, h: 4 } };
  await setup(page, [widget]);
  const home = await connectHomeAssistant(page, {
    states: {
      'switch.main': { state: 'on', attributes: { friendly_name: 'Presa House' } },
      'sensor.power': { state: '80', attributes: { friendly_name: 'Potenza ereditata', device_class: 'power', unit_of_measurement: 'W' } },
    },
    handle(message, { reply }) {
      if (message.type === 'domusos/access/get_self') {
        const access = accessSelfFor({ id: 'owner', is_admin: true, is_owner: true });
        access.access.capabilities = access.access.capabilities.filter((capability) => capability !== 'rooms.view');
        reply(access);
        return true;
      }
      if (message.type === 'frontend/get_system_data' && message.key === 'premium-home.shared-house.v1') {
        reply({ value: {
          schema: 'premium-home-house-configuration', version: 1, revision: 1,
          updatedAt: '2026-11-10T12:00:00Z', updatedByUserId: 'owner',
          publication: { source: 'edit', originClientId: 'e2e' },
          dashboard: { storageVersion: 14, sections: [], widgets: [widget],
            widgetTypeLayoutOverrides: {}, widgetLayoutOverrides: {}, responsiveLayouts: {} },
          security: { alarmEntityId: null, visibleSensorEntityIds: null, visibleCameraEntityIds: null },
          rooms: { customRooms: [], hiddenEntitiesByRoom: {} },
        } });
        return true;
      }
      if (message.type === TYPE) {
        reply({ schemaVersion: 'domusos.dashboard.house.v1', topologyRevision: 1,
          rooms: [{ id: 'a', name: 'Studio' }], devices: [{ id: 'main', effectiveRoomId: 'a' }, { id: 'd', effectiveRoomId: 'a' }],
          entities: [
            { registryId: 'main', entityId: 'switch.main', deviceId: 'main', effectiveRoomId: 'a' },
            { registryId: 'power', entityId: 'sensor.power', deviceId: 'd', effectiveRoomId: 'a' },
          ] });
        return true;
      }
      if (message.type === 'config/entity_registry/list') {
        reply([{ entity_id: 'switch.main', device_id: 'main', area_id: 'a' },
          { entity_id: 'sensor.power', device_id: 'd', area_id: null },
          { entity_id: 'sensor.hidden', device_id: 'd', area_id: null, name: 'Potenza segreta' }]);
        return true;
      }
      return false;
    },
  });
  await page.goto('/home');
  await expect(page.getByRole('switch', { name: /Presa House/ })).toBeVisible({ timeout: 60_000 });
  await page.locator('button[aria-label*="modifica"]:visible').first().click();
  await page.getByRole('button', { name: 'Attiva', exact: true }).click();
  await expect(page.locator('.sections-grid.is-editing')).toBeVisible();
  await page.locator('[aria-label="Card Presa House"]').click();
  const editor = page.getByTestId('panel-editor');
  await expect(editor).toBeVisible();
  await editor.getByRole('radio', { name: 'Dispositivo' }).click();
  await editor.getByRole('button', { name: /Consumo/ }).click();
  await expect(editor.locator('.editor-heading').filter({ hasText: 'Stessa stanza' })).toBeVisible();
  const sameRoomRow = editor.locator('.editor-heading').filter({ hasText: 'Stessa stanza' }).locator('xpath=following-sibling::*[1]');
  await expect(sameRoomRow).toContainText('Potenza ereditata');
  await expect(editor.getByText('Potenza segreta')).toHaveCount(0);
  expect(home.messages.some((message) => message.type === TYPE)).toBe(true);
  expect(home.messages.some((message) => message.type === 'domusos/house/get_topology')).toBe(false);
});

test('mobile quick card counts two House rooms with the same name separately', async ({ page }) => {
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, []);
  await connectHomeAssistant(page, {
    states: {
      'light.one': { state: 'on', attributes: { friendly_name: 'Luce uno' } },
      'light.two': { state: 'on', attributes: { friendly_name: 'Luce due' } },
    },
    handle(message, { reply }) {
      if (message.type !== TYPE) return false;
      reply({ schemaVersion: 'domusos.dashboard.house.v1', topologyRevision: 1,
        rooms: [{ id: 'floor-a-room', name: 'Camera' }, { id: 'floor-b-room', name: 'Camera' }], devices: [],
        entities: [
          { registryId: 'one', entityId: 'light.one', deviceId: null, effectiveRoomId: 'floor-a-room' },
          { registryId: 'two', entityId: 'light.two', deviceId: null, effectiveRoomId: 'floor-b-room' },
        ] });
      return true;
    },
  });
  await page.goto('/home');
  await page.getByRole('button', { name: 'Apri menu' }).click();
  await page.getByRole('button', { name: 'Cambia la scheda rapida' }).click();
  await page.getByRole('dialog', { name: 'Scheda rapida' }).getByRole('button', { name: 'Luci accese' }).click();
  const card = page.getByRole('region', { name: 'Luci accese' });
  await expect(card).toContainText('in 2 stanze');
  await expect(card.getByText('Camera')).toHaveCount(2);
});
