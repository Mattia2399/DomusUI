import { describe, expect, it } from 'vitest';
import { resolveWidgetKindFromEntityId } from '../../../services/haRegistryPresentation';
import { isKindImplemented, resolveDeviceKind, toWidgetKind, type DeviceKind } from './entityKind';

const TABLE: ReadonlyArray<readonly [string, DeviceKind]> = [
  ['light', 'light'],
  ['switch', 'switch'],
  ['input_boolean', 'switch'],
  ['fan', 'fan'],
  ['humidifier', 'humidifier'],
  ['climate', 'climate'],
  ['cover', 'cover'],
  ['lock', 'lock'],
  ['alarm_control_panel', 'alarm'],
  ['camera', 'camera'],
  ['media_player', 'media'],
  ['vacuum', 'vacuum'],
  ['sensor', 'sensor'],
  ['binary_sensor', 'binary'],
  ['calendar', 'calendar'],
  ['person', 'members'],
  ['water_heater', 'water_heater'],
  ['valve', 'valve'],
  ['lawn_mower', 'lawn_mower'],
  ['siren', 'siren'],
  ['event', 'event'],
  ['alert', 'alert'],
  ['button', 'button'],
  ['input_button', 'button'],
  ['script', 'script'],
  ['automation', 'automation'],
  ['remote', 'remote'],
  ['select', 'select'],
  ['input_select', 'select'],
  ['number', 'number'],
  ['input_number', 'number'],
  ['text', 'text'],
  ['input_text', 'text'],
  ['date', 'datetime'],
  ['time', 'datetime'],
  ['datetime', 'datetime'],
  ['input_datetime', 'datetime'],
  ['counter', 'counter'],
  ['timer', 'timer'],
  ['schedule', 'schedule'],
  ['update', 'update'],
  ['todo', 'todo'],
  ['image', 'image'],
  ['assist_satellite', 'assist'],
  ['device_tracker', 'location'],
  ['zone', 'location'],
  ['geo_location', 'location'],
  ['scene', 'none'],
  ['weather', 'none'],
  ['sun', 'none'],
  ['notify', 'none'],
  ['tts', 'none'],
  ['stt', 'none'],
  ['wake_word', 'none'],
  ['conversation', 'none'],
  ['ai_task', 'none'],
  ['image_processing', 'none'],
  ['infrared', 'none'],
  ['radio_frequency', 'none'],
  ['air_quality', 'none'],
];

const WITH_CARD: DeviceKind[] = [
  'light', 'switch', 'fan', 'humidifier', 'climate', 'cover', 'lock',
  'alarm', 'camera', 'media', 'vacuum', 'sensor', 'binary', 'calendar', 'members',
];

describe('resolveDeviceKind', () => {
  it.each(TABLE)('%s → %s', (domain, kind) => {
    expect(resolveDeviceKind(`${domain}.test`)).toBe(kind);
  });

  it('has no card for a domain it does not know, nor one named after a built-in of the object', () => {
    expect(resolveDeviceKind('something_new.test')).toBe('none');
    expect(resolveDeviceKind('constructor.test')).toBe('none');
    expect(resolveDeviceKind('')).toBe('none');
  });

  it('gives the input helpers the kind of what they stand for', () => {
    expect(resolveDeviceKind('input_boolean.x')).toBe('switch');
    expect(resolveDeviceKind('input_button.x')).toBe('button');
    expect(resolveDeviceKind('input_select.x')).toBe('select');
    expect(resolveDeviceKind('input_number.x')).toBe('number');
    expect(resolveDeviceKind('input_text.x')).toBe('text');
    expect(resolveDeviceKind('input_datetime.x')).toBe('datetime');
  });

  it('gives a group the kind of its members only when they share a domain', () => {
    expect(resolveDeviceKind('group.salotto', { entity_id: ['light.a', 'light.b'] })).toBe('light');
    expect(resolveDeviceKind('group.misto', { entity_id: ['light.a', 'switch.b'] })).toBe('none');
    // input_boolean and switch give the same card, but they are two domains.
    expect(resolveDeviceKind('group.misto', { entity_id: ['input_boolean.a', 'switch.b'] })).toBe('none');
  });

  it('has no card for a group it cannot read', () => {
    expect(resolveDeviceKind('group.vuoto')).toBe('none');
    expect(resolveDeviceKind('group.vuoto', { entity_id: [] })).toBe('none');
    expect(resolveDeviceKind('group.strano', { entity_id: 'light.a' })).toBe('none');
    expect(resolveDeviceKind('group.nidificato', { entity_id: ['group.a', 'group.b'] })).toBe('none');
    expect(resolveDeviceKind('group.scene', { entity_id: ['scene.a'] })).toBe('none');
  });
});

describe('isKindImplemented', () => {
  it('is true only for the kinds with a card today', () => {
    const kinds = new Set(TABLE.map(([, kind]) => kind));
    for (const kind of kinds) {
      expect(isKindImplemented(kind), kind).toBe(WITH_CARD.includes(kind));
    }
    expect(WITH_CARD.every(isKindImplemented)).toBe(true);
  });
});

describe('toWidgetKind', () => {
  it('turns a yes/no sensor into a sensor card', () => {
    expect(toWidgetKind('binary')).toBe('sensor');
  });

  it('keeps the kinds with a card, and has nothing for the others', () => {
    for (const kind of WITH_CARD.filter((item) => item !== 'binary')) {
      expect(toWidgetKind(kind)).toBe(kind);
    }
    expect(toWidgetKind('valve')).toBeNull();
    expect(toWidgetKind('location')).toBeNull();
    expect(toWidgetKind('none')).toBeNull();
  });

  it('agrees with resolveWidgetKindFromEntityId on every domain that function knows', () => {
    const known = TABLE.map(([domain]) => domain).filter((domain) => resolveWidgetKindFromEntityId(`${domain}.test`) !== null);
    expect(known.sort()).toEqual([
      'alarm_control_panel', 'binary_sensor', 'calendar', 'camera', 'climate', 'cover', 'fan', 'humidifier',
      'input_boolean', 'light', 'lock', 'media_player', 'sensor', 'switch', 'vacuum',
    ]);
    for (const domain of known) {
      const entityId = `${domain}.test`;
      expect(toWidgetKind(resolveDeviceKind(entityId)), domain).toBe(resolveWidgetKindFromEntityId(entityId));
    }
  });

  it('goes further than that function only for a person, which it does not know', () => {
    const differing = TABLE.map(([domain]) => domain).filter((domain) => {
      const entityId = `${domain}.test`;
      return toWidgetKind(resolveDeviceKind(entityId)) !== resolveWidgetKindFromEntityId(entityId);
    });
    expect(differing).toEqual(['person']);
  });
});
