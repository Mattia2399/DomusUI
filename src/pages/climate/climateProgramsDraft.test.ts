import { describe, expect, it } from 'vitest';
import { emptyClimateConfig } from '../../services/climateConfigClient';
import { copyWeeklyDay, createProfile, deleteProfile, deleteWeeklyEvent, profileInUse, putWeeklyEvent, renameProfile, setProfileTarget } from './climateProgramsDraft';

function house() {
  const config = emptyClimateConfig();
  config.zones = [{ id: 'living', name: 'Living', areaId: null, reference: { primaryEntityId: 'sensor.living_temp', fallbacks: [] }, endpointIds: [] }];
  return config;
}

describe('Climate profiles and week draft', () => {
  it('creates, renames, edits optional targets and deletes an unused profile by stable ID', () => {
    const config = createProfile(house(), ' Comfort ', 'comfort');
    expect(config.profiles[0]).toEqual({ id: 'comfort', name: 'Comfort', zoneTargets: {} });
    expect(() => createProfile(config, 'Again', 'comfort')).toThrow('duplicate_profile_id');
    const renamed = renameProfile(config, 'comfort', 'Home');
    expect(renamed.profiles[0].id).toBe('comfort');
    const target = setProfileTarget(renamed, 'comfort', 'living', 21);
    expect(target.profiles[0].zoneTargets.living).toBe(21);
    expect(setProfileTarget(target, 'comfort', 'living', null).profiles[0].zoneTargets).toEqual({});
    expect(() => setProfileTarget(target, 'comfort', 'living', 41)).toThrow('invalid_target');
    expect(deleteProfile(target, 'comfort').profiles).toEqual([]);
    expect(config.profiles[0].name).toBe('Comfort');
  });

  it('sorts events, rejects duplicate times, edits/deletes, copies a day and protects used profiles', () => {
    let config = createProfile(house(), 'Comfort', 'comfort');
    expect(config.schedules).toEqual([]);
    config = putWeeklyEvent(config, ['monday'], null, { time: '23:59', profileId: 'comfort' });
    config = putWeeklyEvent(config, ['monday'], null, { time: '00:00', profileId: 'comfort' });
    expect(config.schedules[0].events.map((item) => item.time)).toEqual(['00:00', '23:59']);
    expect(() => putWeeklyEvent(config, ['monday'], null, { time: '00:00', profileId: 'comfort' })).toThrow('duplicate_schedule_time');
    expect(() => putWeeklyEvent(config, ['monday'], null, { time: '24:00', profileId: 'comfort' })).toThrow('invalid_time');
    config = putWeeklyEvent(config, ['monday'], '23:59', { time: '06:30', profileId: 'comfort' });
    expect(config.schedules[0].events.map((item) => item.time)).toEqual(['00:00', '06:30']);
    config = copyWeeklyDay(config, 'monday', ['tuesday', 'wednesday']);
    expect(config.schedules.map((item) => item.day)).toEqual(['monday', 'tuesday', 'wednesday']);
    expect(profileInUse(config, 'comfort')).toBe(true);
    expect(() => deleteProfile(config, 'comfort')).toThrow('profile_in_use');
    config = deleteWeeklyEvent(config, 'monday', '00:00');
    expect(config.schedules[0].events).toHaveLength(1);
    config = copyWeeklyDay(config, 'sunday', ['monday']);
    expect(config.schedules.some((item) => item.day === 'monday')).toBe(false);
  });
});
