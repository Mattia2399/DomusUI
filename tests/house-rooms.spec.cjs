const { test, expect } = require('@playwright/test');
const { connectHomeAssistant } = require('./support/fakeHomeAssistant.cjs');

function installCompletedRealWorkspace(page) {
  return page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({
      version: 2, phase: 'done', mode: 'real', updatedAt: Date.now(),
    }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
}

test('connected Rooms uses House topology while controls use live HA state', async ({ page }) => {
  await installCompletedRealWorkspace(page);
  const house = {
    schemaVersion: 'domusos.house.v1', topologyRevision: 1, topologyFingerprint: 'house-1', generatedAt: 'now',
    floors: [{ id: 'ground', name: 'Piano terra', level: 0, aliases: [], order: 0 }],
    rooms: [{ id: 'living', name: 'Soggiorno', floorId: 'ground', aliases: [], icon: 'mdi:sofa', picture: null,
      temperatureEntityId: 'sensor.living_temperature', humidityEntityId: 'sensor.living_humidity' }],
    devices: [],
    entities: [
      { entityId: 'light.living', registryId: 'stable-light', domain: 'light', deviceId: null,
        explicitAreaId: 'living', effectiveAreaId: 'living', deviceClass: null },
      { entityId: 'sensor.living_temperature', registryId: 'stable-temperature', domain: 'sensor', deviceId: null,
        explicitAreaId: 'living', effectiveAreaId: 'living', deviceClass: 'temperature' },
      { entityId: 'sensor.living_humidity', registryId: 'stable-humidity', domain: 'sensor', deviceId: null,
        explicitAreaId: 'living', effectiveAreaId: 'living', deviceClass: 'humidity' },
    ],
    unassigned: { deviceIds: [], entityIds: [] }, issues: [],
  };
  const home = await connectHomeAssistant(page, {
    states: { 'light.living': { state: 'on', attributes: { friendly_name: 'Lampada', brightness: 255 } },
      'sensor.living_temperature': { state: '99', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
      'sensor.living_humidity': { state: '88', attributes: { device_class: 'humidity', unit_of_measurement: '%' } } },
    handle(message, { reply }) {
      if (message.type === 'domusos/house/get_topology') { reply(house); return true; }
      if (message.type === 'domusos/house/get_snapshot') {
        const reading = (metric, entityId, value, unit) => ({ metric, configured: true,
          configuredPrimaryEntityId: entityId, selectedEntityId: entityId,
          selectionSource: 'HA_AREA_PRIMARY', selectionReason: 'AREA_PRIMARY', fallbackUsed: false,
          available: true, value, unit, sourceEntityId: entityId, updatedAt: null, status: 'available' });
        reply({ schemaVersion: 'domusos.house.v1', topologyFingerprint: house.topologyFingerprint,
          generatedAt: 'now', rooms: [{ roomId: 'living',
            temperature: reading('temperature', 'sensor.living_temperature', 21, '°C'),
            humidity: reading('humidity', 'sensor.living_humidity', 45, '%') }] });
        return true;
      }
      if (message.type === 'config/floor_registry/create') {
        house.floors.push({ id: 'upper', name: message.name, level: null, aliases: [], order: 1 });
        house.topologyRevision += 1;
        house.topologyFingerprint = 'house-2';
        reply({ floor_id: 'upper', name: message.name });
        return true;
      }
      if (message.type === 'config/area_registry/update') {
        house.rooms[0].name = message.name;
        house.topologyRevision += 1;
        house.topologyFingerprint = 'house-3';
        reply({ area_id: 'living', name: message.name, floor_id: 'ground' });
        return true;
      }
      return false;
    },
  });
  await page.goto('/rooms');
  await expect(page.getByRole('heading', { level: 1, name: 'Soggiorno' })).toBeVisible();
  await expect(page.getByTestId('rooms-lights').getByText('Lampada')).toBeVisible();
  await expect(page.locator('.rooms-head-title p')).toContainText('21°');
  await expect(page.locator('.rooms-head-title p')).toContainText('45%');
  await expect(page.locator('.rooms-head-title p')).not.toContainText('99°');
  await expect(page.locator('.rooms-head-title p')).not.toContainText('88%');
  expect(home.messages.some((message) => message.type === 'domusos/house/get_topology')).toBe(true);
  expect(home.messages.some((message) => message.type === 'domusos/house/get_snapshot')).toBe(true);

  await page.getByRole('button', { name: 'Gestisci stanze e sezioni' }).click();
  const manage = page.getByTestId('rooms-manage');
  await manage.getByRole('radio', { name: 'Piani' }).click();
  await manage.getByRole('button', { name: 'Nuovo piano' }).click();
  await expect(manage.getByRole('textbox', { name: 'Nome del piano 2' })).toBeVisible();
  await expect.poll(() => home.messages.filter((message) => message.type === 'domusos/house/get_topology').length).toBeGreaterThan(1);
  expect(home.messages.some((message) => message.type === 'config/floor_registry/create')).toBe(true);

  await manage.getByRole('radio', { name: 'Stanze' }).click();
  await manage.getByRole('button', { name: 'Modifica Soggiorno' }).click();
  const edit = page.getByRole('dialog', { name: 'Modifica stanza' });
  await expect(edit.getByRole('textbox', { name: 'Nome' })).toBeVisible();
  await edit.getByRole('textbox', { name: 'Nome' }).fill('Salotto');
  await edit.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Salotto' })).toBeVisible();
  expect(home.messages.some((message) => message.type === 'config/area_registry/update' && message.name === 'Salotto')).toBe(true);
});
