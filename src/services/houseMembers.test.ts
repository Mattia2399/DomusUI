import { describe, expect, it } from 'vitest';
import type { MockEntityStateMap } from '../types/ha';
import { parseHaAuthUsers } from './haIdentityPresentation';
import { buildHouseMembers, selectHouseholdPeople } from './houseMembers';

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
