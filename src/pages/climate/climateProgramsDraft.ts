import type { ClimateHouseConfig, ClimateProfileConfig, ClimateScheduleDayConfig, ClimateScheduleEventConfig, ClimateWeekday } from './climateModel';

export const WEEKDAYS: ClimateWeekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const ID = /^[a-z][a-z0-9_-]{0,63}$/;

function clone(config: ClimateHouseConfig): ClimateHouseConfig { return structuredClone(config); }
function validName(name: string): string { const trimmed = name.trim(); if (!trimmed || trimmed.length > 100) throw new Error('invalid_profile_name'); return trimmed; }
function order(config: ClimateHouseConfig): ClimateHouseConfig {
  config.schedules = WEEKDAYS.flatMap((day) => {
    const row = config.schedules.find((item) => item.day === day);
    return row?.events.length ? [{ day, events: [...row.events].sort((a, b) => a.time.localeCompare(b.time)) }] : [];
  });
  return config;
}

export function createProfile(config: ClimateHouseConfig, name: string, id = `profile_${crypto.randomUUID().replaceAll('-', '')}`): ClimateHouseConfig {
  if (!ID.test(id) || config.profiles.some((item) => item.id === id) || config.profiles.length >= 32) throw new Error('duplicate_profile_id');
  const next = clone(config);
  next.profiles.push({ id, name: validName(name), zoneTargets: {} });
  return next;
}

export function renameProfile(config: ClimateHouseConfig, id: string, name: string): ClimateHouseConfig {
  const next = clone(config);
  const profile = next.profiles.find((item) => item.id === id);
  if (!profile) throw new Error('unknown_profile');
  profile.name = validName(name);
  return next;
}

export function setProfileTarget(config: ClimateHouseConfig, id: string, zoneId: string, target: number | null): ClimateHouseConfig {
  const next = clone(config);
  const profile = next.profiles.find((item) => item.id === id);
  if (!profile || !next.zones.some((item) => item.id === zoneId)) throw new Error('unknown_zone_or_profile');
  if (target !== null && (!Number.isFinite(target) || target < 5 || target > 40)) throw new Error('invalid_target');
  if (target === null) delete profile.zoneTargets[zoneId];
  else profile.zoneTargets[zoneId] = target;
  return next;
}

export function profileInUse(config: ClimateHouseConfig, id: string): boolean {
  return config.schedules.some((day) => day.events.some((event) => event.profileId === id));
}

export function deleteProfile(config: ClimateHouseConfig, id: string): ClimateHouseConfig {
  if (profileInUse(config, id)) throw new Error('profile_in_use');
  const next = clone(config);
  if (!next.profiles.some((item) => item.id === id)) throw new Error('unknown_profile');
  next.profiles = next.profiles.filter((item) => item.id !== id);
  return next;
}

export function putWeeklyEvent(config: ClimateHouseConfig, days: readonly ClimateWeekday[], previousTime: string | null, event: ClimateScheduleEventConfig): ClimateHouseConfig {
  if (!TIME.test(event.time)) throw new Error('invalid_time');
  if (!config.profiles.some((item) => item.id === event.profileId)) throw new Error('unknown_profile');
  if (!days.length || new Set(days).size !== days.length || days.some((day) => !WEEKDAYS.includes(day))) throw new Error('invalid_day');
  const next = clone(config);
  for (const day of days) {
    let row = next.schedules.find((item) => item.day === day);
    if (!row) { row = { day, events: [] }; next.schedules.push(row); }
    const other = row.events.filter((item) => item.time !== previousTime);
    if (other.some((item) => item.time === event.time)) throw new Error('duplicate_schedule_time');
    if (previousTime !== null && !row.events.some((item) => item.time === previousTime)) throw new Error('unknown_event');
    if (other.length >= 64) throw new Error('too_many_events');
    row.events = [...other, { ...event }];
  }
  return order(next);
}

export function deleteWeeklyEvent(config: ClimateHouseConfig, day: ClimateWeekday, time: string): ClimateHouseConfig {
  const next = clone(config);
  const row = next.schedules.find((item) => item.day === day);
  if (!row?.events.some((item) => item.time === time)) throw new Error('unknown_event');
  row.events = row.events.filter((item) => item.time !== time);
  return order(next);
}

export function copyWeeklyDay(config: ClimateHouseConfig, source: ClimateWeekday, destinations: readonly ClimateWeekday[]): ClimateHouseConfig {
  if (!WEEKDAYS.includes(source) || destinations.some((day) => !WEEKDAYS.includes(day))) throw new Error('invalid_day');
  const next = clone(config);
  const events = next.schedules.find((item) => item.day === source)?.events ?? [];
  for (const day of new Set(destinations)) {
    if (day === source) continue;
    next.schedules = next.schedules.filter((item) => item.day !== day);
    if (events.length) next.schedules.push({ day, events: structuredClone(events) } satisfies ClimateScheduleDayConfig);
  }
  return order(next);
}

export function profileById(config: ClimateHouseConfig, id: string): ClimateProfileConfig | undefined { return config.profiles.find((item) => item.id === id); }
