const { test, expect } = require('@playwright/test');
const { connectHomeAssistant, HA } = require('./support/fakeHomeAssistant.cjs');

const TYPE = 'domusos/system/get_house_context';

test('Settings keeps HA inventory and shows a room override only after House confirms it', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('domusui.language.v1', 'it');
  });
  let explicitRoom = null;
  let confirmedRoom = null;
  let revision = 1;
  const home = await connectHomeAssistant(page, {
    states: { 'light.lamp': { state: 'on', attributes: { friendly_name: 'Lampada QA' } } },
    handle(message, { reply }) {
      if (message.type === 'config/area_registry/list') {
        reply([{ area_id: 'a', name: 'Camera' }, { area_id: 'b', name: 'Studio' }]);
        return true;
      }
      if (message.type === 'config/device_registry/list') {
        reply([{ id: 'device-1', name: 'Lampada', area_id: 'a' }]);
        return true;
      }
      if (message.type === 'config/entity_registry/list') {
        reply([
          { id: 'registry-lamp', entity_id: 'light.lamp', device_id: 'device-1', area_id: explicitRoom },
          { id: 'registry-disabled', entity_id: 'sensor.disabled', disabled_by: 'user', area_id: null },
        ]);
        return true;
      }
      if (message.type === 'config/entity_registry/update') {
        explicitRoom = message.area_id;
        reply({ entity_id: message.entity_id, area_id: explicitRoom });
        return true;
      }
      if (message.type === TYPE) {
        reply({ schemaVersion: 'domusos.system.house.v1', topologyRevision: revision,
          rooms: [{ id: 'a', name: 'Camera' }, { id: 'b', name: 'Studio' }],
          devices: [{ id: 'device-1', roomId: 'a' }],
          entities: [
            { registryId: 'registry-lamp', entityId: 'light.lamp', effectiveRoomId: confirmedRoom || 'a' },
            { registryId: 'registry-disabled', entityId: 'sensor.disabled', effectiveRoomId: null },
          ] });
        return true;
      }
      return false;
    },
  });
  await page.goto('/settings/entities');
  const lamp = page.getByRole('button', { name: /Lampada QA/ });
  await expect(lamp).toContainText('Camera', { timeout: 60_000 });
  expect(home.messages.some((message) => message.type === TYPE)).toBe(true);

  // Another HA administrator writes the native entity registry. House has not
  // yet confirmed its normalized read-side membership.
  await page.evaluate(async (url) => {
    const socket = new WebSocket(url.replace('http', 'ws') + '/api/websocket');
    await new Promise((resolve, reject) => {
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: 'access' }));
        if (message.type === 'auth_ok') socket.send(JSON.stringify({ id: 1, type: 'config/entity_registry/update', entity_id: 'light.lamp', area_id: 'b' }));
        if (message.id === 1) { socket.close(); message.success ? resolve() : reject(new Error(message.error?.message)); }
      };
      socket.onerror = reject;
    });
  }, HA);
  expect(home.messages.some((message) => message.type === 'config/entity_registry/update' && message.area_id === 'b')).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(lamp).toContainText('Camera');
  confirmedRoom = 'b'; revision += 1;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(lamp).toContainText('Studio');

  await page.getByRole('button', { name: /Mostra 1 entità disattivata/ }).click();
  await expect(page.getByRole('button', { name: /Disabled/ })).toBeVisible();
});
