import { describe, expect, it } from 'vitest';
import { areaMessage, overlayAreas, parseHaArea, roomDraftOf } from './roomManagement';

const studio = {
  area_id: 'studio',
  name: 'Studio',
  aliases: ['ufficio'],
  floor_id: 'first',
  icon: 'mdi:desk',
  picture: '/local/studio.jpg',
  temperature_entity_id: 'sensor.studio_temperature',
  humidity_entity_id: null,
};

describe('managing rooms', () => {
  it('creates an area with only what was filled in', () => {
    expect(areaMessage({ ...roomDraftOf(null, '  Studio   nord '), aliases: 'ufficio, studio, ufficio' })).toEqual({
      type: 'config/area_registry/create',
      name: 'Studio nord',
      aliases: ['ufficio', 'studio'],
    });
  });

  it('changes an area, clearing what was emptied', () => {
    const draft = { ...roomDraftOf(studio), picture: '', icon: 'mdi:sofa' };
    expect(areaMessage(draft, 'studio')).toEqual({
      type: 'config/area_registry/update',
      area_id: 'studio',
      name: 'Studio',
      floor_id: 'first',
      icon: 'mdi:sofa',
      aliases: ['ufficio'],
      picture: null,
      temperature_entity_id: 'sensor.studio_temperature',
      humidity_entity_id: null,
    });
  });

  it('reads an area back from Home Assistant', () => {
    expect(parseHaArea({ ...studio, humidity_entity_id: '' })).toMatchObject({ area_id: 'studio', humidity_entity_id: null, floor_id: 'first' });
    expect(parseHaArea({ name: 'Senza id' })).toBeNull();
  });

  it('shows the areas changed here until Home Assistant sends them back', () => {
    const kitchen = { area_id: 'kitchen', name: 'Cucina' };
    const renamed = { ...kitchen, name: 'Cucina grande' };
    const created = { area_id: 'garage', name: 'Garage' };
    expect(overlayAreas([kitchen, studio], [renamed, created], ['studio'])).toEqual([renamed, created]);
  });
});
