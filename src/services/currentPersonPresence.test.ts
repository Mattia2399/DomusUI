import { describe, expect, it } from 'vitest';
import { resolveCurrentPersonPresence } from './currentPersonPresence';

const person = (attributes: Record<string, unknown>) => ({ rawAttributes: attributes });

describe('resolveCurrentPersonPresence', () => {
  it('uses the Person Home Assistant links to the user and only its trackers', () => {
    const states = {
      'person.mattia': person({
        user_id: 'user-1',
        friendly_name: 'Mattia',
        device_trackers: ['device_tracker.pixel', 'device_tracker.watch'],
        source: 'device_tracker.pixel',
      }),
      'device_tracker.pixel': person({ friendly_name: 'Pixel' }),
      'device_tracker.watch': person({}),
      'device_tracker.tablet_mattia': person({ friendly_name: 'Mattia', user_id: 'user-1' }),
    };
    expect(resolveCurrentPersonPresence(states, 'user-1')).toEqual({
      personEntityId: 'person.mattia',
      trackerEntityIds: ['device_tracker.pixel', 'device_tracker.watch'],
    });
  });

  it('accepts the legacy entity_id list and ignores entries that are not trackers', () => {
    const states = {
      'person.anna': person({ user_id: 'user-2', entity_id: ['device_tracker.anna', 'sensor.anna', 42] }),
    };
    expect(resolveCurrentPersonPresence(states, 'user-2').trackerEntityIds).toEqual(['device_tracker.anna']);
  });

  it('never matches a Person or tracker by name, username or email', () => {
    const states = {
      'person.mattia': person({ friendly_name: 'Mattia', device_trackers: ['device_tracker.pixel'] }),
      'person.mattia_rossi': person({ friendly_name: 'mattia.rossi', user_id: 'someone-else' }),
      'device_tracker.mattia': person({ friendly_name: 'Mattia' }),
      'device_tracker.pixel': person({ user_id: 'user-1' }),
    };
    expect(resolveCurrentPersonPresence(states, 'user-1')).toEqual({ personEntityId: null, trackerEntityIds: [] });
  });

  it('shows no presence without a user or with an ambiguous link', () => {
    const states = {
      'person.one': person({ user_id: 'user-1', device_trackers: ['device_tracker.one'] }),
      'person.two': person({ user_id: 'user-1', device_trackers: ['device_tracker.two'] }),
    };
    expect(resolveCurrentPersonPresence(states, 'user-1')).toEqual({ personEntityId: null, trackerEntityIds: [] });
    expect(resolveCurrentPersonPresence(states, undefined)).toEqual({ personEntityId: null, trackerEntityIds: [] });
    expect(resolveCurrentPersonPresence(states, '  ')).toEqual({ personEntityId: null, trackerEntityIds: [] });
  });
});
