import { describe, expect, it } from 'vitest';
import type { ProfileHouseMember } from '../components/settings/settingsHouseAccessModel';
import type { MockEntityStateMap } from '../types/ha';
import { parseHaAuthUsers } from './haIdentityPresentation';
import {
  buildHouseMemberLocationPoints,
  buildHouseMemberPresences,
  buildHouseMembers,
  selectHouseholdPeople,
} from './houseMembers';

// Mirrors a real installation: one owner linked to a person, three people
// created without a linked login plus separate logins with the same names,
// a guest login, and the accounts Home Assistant generates for itself.
const users = parseHaAuthUsers([
  { id: 'u-mattia', name: 'Mattia', username: 'ticconimattia@gmail.com', is_owner: true, is_active: true, system_generated: false, group_ids: ['system-admin'] },
  { id: 'u-angela', name: 'Angela', username: 'angela@example.com', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-users'] },
  { id: 'u-giulia', name: 'Giulia', username: 'giulia@example.com', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-users'] },
  { id: 'u-maurizio', name: 'Maurizio', username: 'maurizio@example.com', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-users'] },
  { id: 'u-guest', name: 'Guest', username: 'guest', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-users'] },
  { id: 'u-cast', name: 'Home Assistant Cast', is_owner: false, is_active: true, system_generated: true, group_ids: ['system-admin'] },
  { id: 'u-cloud', name: 'Home Assistant Cloud', is_owner: false, is_active: true, system_generated: true, group_ids: ['system-admin'] },
  { id: 'u-content', name: 'Home Assistant Content', is_owner: false, is_active: true, system_generated: true, group_ids: ['system-read-only'] },
  { id: 'u-supervisor', name: 'Supervisor', is_owner: false, is_active: true, system_generated: true, group_ids: ['system-admin'] },
]);

const person = (name: string, attributes: Record<string, unknown> = {}) => ({
  state: 'home',
  rawAttributes: { friendly_name: name, entity_picture: `/api/image/${name.toLowerCase()}.jpg`, ...attributes },
});

const states: MockEntityStateMap = {
  'person.mattia': person('Mattia', { user_id: 'u-mattia' }),
  'person.angela': person('Angela'),
  'person.giulia': person('Giulia'),
  'person.maurizio': person('Maurizio'),
  'light.kitchen': { state: 'on' },
};

const build = (overrides: Partial<Parameters<typeof buildHouseMembers>[0]> = {}) =>
  buildHouseMembers({
    states,
    users,
    currentUser: users[0],
    resolveAvatarUrl: (candidate) => (candidate ? `https://ha.local${candidate}` : undefined),
    ...overrides,
  });

describe('parseHaAuthUsers', () => {
  it('reads admin membership from the groups and flags system or disabled logins', () => {
    const [mattia, angela] = users;
    const cast = users.find((user) => user.id === 'u-cast');
    expect(mattia).toMatchObject({ isOwner: true, isAdmin: true, isActive: true, isSystem: false });
    expect(angela).toMatchObject({ isAdmin: false, isSystem: false });
    expect(cast).toMatchObject({ isSystem: true });
    expect(parseHaAuthUsers([{ id: 'x', name: 'Old', is_active: false }])[0].isActive).toBe(false);
  });
});

describe('buildHouseMembers', () => {
  it('never lists the accounts Home Assistant generates for itself', () => {
    const names = build().map((member) => member.name);
    expect(names).not.toContain('Home Assistant Cast');
    expect(names).not.toContain('Home Assistant Cloud');
    expect(names).not.toContain('Home Assistant Content');
    expect(names).not.toContain('Supervisor');
  });

  it('merges a login into the person it is linked to', () => {
    const mattia = build().filter((member) => member.name === 'Mattia');
    expect(mattia).toHaveLength(1);
    expect(mattia[0]).toMatchObject({
      id: 'user:u-mattia',
      personEntityId: 'person.mattia',
      hasAccount: true,
      roleLabel: 'Creatore',
      isCurrent: true,
      avatarUrl: 'https://ha.local/api/image/mattia.jpg',
    });
  });

  it('keeps unlinked logins apart from people instead of guessing by name', () => {
    const members = build();
    const [person, account, ...rest] = members.filter((member) => member.name === 'Angela');
    expect(rest).toHaveLength(0);
    expect(person).toMatchObject({ id: 'person:person.angela', personEntityId: 'person.angela', hasAccount: false });
    expect(person.userId).toBeUndefined();
    expect(account).toMatchObject({ id: 'user:u-angela', userId: 'u-angela', hasAccount: true });
    expect(account.personEntityId).toBeUndefined();
  });

  it('gives the Members card only real people', () => {
    const people = selectHouseholdPeople(build()).map((member) => member.name);
    expect(people).toEqual(['Mattia', 'Angela', 'Giulia', 'Maurizio']);
  });

  it('shows administrators from the Home Assistant groups', () => {
    const admin = parseHaAuthUsers([
      { id: 'u-admin', name: 'Admin', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-admin'] },
    ]);
    const [member] = build({ states: {}, users: admin, currentUser: undefined });
    expect(member.roleLabel).toBe('Admin');
  });

  it('treats a person linked to a disabled login as a person without access', () => {
    const disabled = parseHaAuthUsers([{ id: 'u-old', name: 'Old', is_active: false }]);
    const members = build({
      states: { 'person.old': person('Old', { user_id: 'u-old' }) },
      users: disabled,
      currentUser: undefined,
    });
    expect(members).toEqual([expect.objectContaining({ id: 'person:person.old', hasAccount: false })]);
  });

  it('still lists the current login when no person represents it', () => {
    const [member] = build({ states: {}, users: [], currentUser: users[4] });
    expect(member).toMatchObject({ id: 'user:u-guest', isCurrent: true, hasAccount: true });
    expect(member.personEntityId).toBeUndefined();
  });
});

const locationMember = (
  id: string,
  name: string,
  personEntityId?: string,
  overrides: Partial<ProfileHouseMember> = {},
): ProfileHouseMember => ({
  id,
  name,
  personEntityId,
  hasAccount: Boolean(overrides.userId),
  ...overrides,
});

const buildLocations = (members: ProfileHouseMember[], locationStates: MockEntityStateMap) =>
  buildHouseMemberLocationPoints({
    members,
    states: locationStates,
    resolveAvatarUrl: (candidate) => candidate ? `https://ha.local${candidate}` : undefined,
  });

const buildPresences = (members: ProfileHouseMember[], locationStates: MockEntityStateMap) =>
  buildHouseMemberPresences({
    members,
    states: locationStates,
    resolveAvatarUrl: (candidate) => candidate ? `https://ha.local${candidate}` : undefined,
  });

describe('buildHouseMemberLocationPoints', () => {
  it('uses the exact person entity for a person linked to an account', () => {
    const points = buildLocations(
      [locationMember('user:u-mattia', 'Account name', 'person.mattia', { userId: 'u-mattia', isCurrent: true })],
      {
        'person.mattia': {
          state: 'home',
          rawAttributes: { friendly_name: 'Mattia', user_id: 'u-mattia', latitude: 41.9, longitude: 12.5 },
        },
      },
    );

    expect(points).toEqual([
      expect.objectContaining({
        id: 'user:u-mattia',
        personEntityId: 'person.mattia',
        name: 'Mattia',
        latitude: 41.9,
        longitude: 12.5,
        state: 'home',
        isCurrent: true,
      }),
    ]);
  });

  it('keeps a person without an account when its person entity has coordinates', () => {
    const points = buildLocations(
      [locationMember('person:person.angela', 'Angela', 'person.angela')],
      { 'person.angela': { state: 'home', rawAttributes: { latitude: 45.46, longitude: 9.19 } } },
    );

    expect(points[0]).toMatchObject({ personEntityId: 'person.angela', latitude: 45.46, longitude: 9.19 });
  });

  it('never turns an account without a person into a marker, even when its name matches', () => {
    const points = buildLocations(
      [
        locationMember('person:person.angela', 'Angela', 'person.angela'),
        locationMember('user:u-angela', 'Angela', undefined, { userId: 'u-angela', hasAccount: true }),
      ],
      {
        'person.angela': {
          state: 'home',
          rawAttributes: { friendly_name: 'Angela', latitude: 45.46, longitude: 9.19 },
        },
      },
    );

    expect(points).toHaveLength(1);
    expect(points[0].id).toBe('person:person.angela');
  });

  it('does not create a marker for person.home without coordinates', () => {
    expect(buildLocations(
      [locationMember('person:person.home', 'Home', 'person.home')],
      { 'person.home': { state: 'home', rawAttributes: { friendly_name: 'Home' } } },
    )).toEqual([]);
  });

  it('keeps a person and its explicitly linked trackers when coordinates are unavailable', () => {
    const [presence] = buildPresences(
      [locationMember('person:person.home', 'Home', 'person.home')],
      {
        'person.home': {
          state: 'home',
          rawAttributes: {
            friendly_name: 'Home',
            source: 'device_tracker.home_router',
            device_trackers: ['device_tracker.home_router', 'device_tracker.home_phone'],
          },
        },
        'device_tracker.home_router': { state: 'home', rawAttributes: {} },
        'device_tracker.home_phone': { state: 'home', rawAttributes: {} },
      },
    );

    expect(presence).toMatchObject({
      personEntityId: 'person.home',
      state: 'home',
      trackerEntityIds: ['device_tracker.home_router', 'device_tracker.home_phone'],
    });
    expect(presence.latitude).toBeUndefined();
    expect(presence.longitude).toBeUndefined();
  });

  it('uses coordinates from the exact active source tracker when the person omits them', () => {
    const [point] = buildLocations(
      [locationMember('person:person.source', 'Source', 'person.source')],
      {
        'person.source': {
          state: 'not_home',
          rawAttributes: {
            source: 'device_tracker.source_phone',
            device_trackers: ['device_tracker.source_phone'],
          },
        },
        'device_tracker.source_phone': {
          state: 'not_home',
          rawAttributes: { latitude: 41.91, longitude: 12.51, gps_accuracy: 6 },
        },
      },
    );

    expect(point).toMatchObject({
      personEntityId: 'person.source',
      latitude: 41.91,
      longitude: 12.51,
      gpsAccuracy: 6,
      locationSourceEntityId: 'device_tracker.source_phone',
    });
  });

  it('never borrows coordinates from an unassociated tracker with a similar name', () => {
    const points = buildLocations(
      [locationMember('person:person.alex', 'Alex', 'person.alex')],
      {
        'person.alex': { state: 'home', rawAttributes: { friendly_name: 'Alex' } },
        'device_tracker.alex_phone': {
          state: 'not_home',
          rawAttributes: { friendly_name: 'Alex phone', latitude: 42, longitude: 13 },
        },
      },
    );

    expect(points).toEqual([]);
  });

  it('preserves not_home, GPS accuracy and directly linked trackers', () => {
    const [point] = buildLocations(
      [locationMember('person:person.giulia', 'Giulia', 'person.giulia')],
      {
        'person.giulia': {
          state: 'not_home',
          rawAttributes: {
            latitude: 44.5,
            longitude: 11.3,
            gps_accuracy: 12,
            device_trackers: ['device_tracker.giulia_phone'],
            source: 'device_tracker.giulia_watch',
          },
        },
      },
    );

    expect(point).toMatchObject({ state: 'not_home', gpsAccuracy: 12 });
    expect(point.trackerEntityIds).toEqual([
      'device_tracker.giulia_watch',
      'device_tracker.giulia_phone',
    ]);
  });

  it('preserves a Home Assistant zone state', () => {
    const [point] = buildLocations(
      [locationMember('person:person.maurizio', 'Maurizio', 'person.maurizio')],
      { 'person.maurizio': { state: 'Lavoro', rawAttributes: { latitude: 43.7, longitude: 10.4 } } },
    );

    expect(point.state).toBe('Lavoro');
  });

  it('accepts zero latitude and longitude as valid coordinates', () => {
    const [point] = buildLocations(
      [locationMember('person:person.zero', 'Zero', 'person.zero')],
      { 'person.zero': { state: 'not_home', rawAttributes: { latitude: 0, longitude: 0 } } },
    );

    expect(point).toMatchObject({ latitude: 0, longitude: 0 });
  });

  it('rejects missing, non-numeric and out-of-range coordinates', () => {
    const members = [
      locationMember('person:person.missing', 'Missing', 'person.missing'),
      locationMember('person:person.invalid', 'Invalid', 'person.invalid'),
      locationMember('person:person.outside', 'Outside', 'person.outside'),
    ];
    const points = buildLocations(members, {
      'person.missing': { state: 'home', rawAttributes: { latitude: 42 } },
      'person.invalid': { state: 'home', rawAttributes: { latitude: 'north', longitude: 'east' } },
      'person.outside': { state: 'home', rawAttributes: { latitude: 91, longitude: 181 } },
    });

    expect(points).toEqual([]);
  });

  it('keeps multiple people distinct through personEntityId', () => {
    const points = buildLocations(
      [
        locationMember('person:person.alex_one', 'Alex', 'person.alex_one'),
        locationMember('person:person.alex_two', 'Alex', 'person.alex_two'),
      ],
      {
        'person.alex_one': { state: 'home', rawAttributes: { latitude: 41, longitude: 12 } },
        'person.alex_two': { state: 'not_home', rawAttributes: { latitude: 42, longitude: 13 } },
      },
    );

    expect(points.map((point) => point.personEntityId)).toEqual(['person.alex_one', 'person.alex_two']);
  });

  it('uses the current person entity picture instead of account imagery', () => {
    const [point] = buildLocations(
      [locationMember('user:u-owner', 'Owner', 'person.owner', {
        userId: 'u-owner',
        isCurrent: true,
        avatarUrl: 'https://account.invalid/avatar.jpg',
      })],
      {
        'person.owner': {
          state: 'home',
          rawAttributes: { latitude: 41, longitude: 12, entity_picture: '/api/person/owner.jpg' },
        },
      },
    );

    expect(point).toMatchObject({
      personEntityId: 'person.owner',
      isCurrent: true,
      avatarUrl: 'https://ha.local/api/person/owner.jpg',
    });
  });
});
