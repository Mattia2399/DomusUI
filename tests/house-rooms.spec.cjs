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
      temperatureEntityId: null, humidityEntityId: null }],
    devices: [],
    entities: [{ entityId: 'light.living', registryId: 'stable-light', domain: 'light', deviceId: null,
      explicitAreaId: 'living', effectiveAreaId: 'living', deviceClass: null }],
    unassigned: { deviceIds: [], entityIds: [] }, issues: [],
  };
  const home = await connectHomeAssistant(page, {
    states: { 'light.living': { state: 'on', attributes: { friendly_name: 'Lampada', brightness: 255 } } },
    handle(message, { reply }) {
      if (message.type === 'domusos/house/get_topology') { reply(house); return true; }
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
  expect(home.messages.some((message) => message.type === 'domusos/house/get_topology')).toBe(true);

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
