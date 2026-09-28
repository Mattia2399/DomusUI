import { describe, expect, it } from 'vitest';
import {
  isValidPersonCreateMessage,
  isValidPersonUpdateMessage,
  validatePanelApiMessage,
} from '../hooks/useHaPanelBridgeConnection';
import type { ProfileHouseMember } from '../components/settings/settingsHouseAccessModel';
import {
  buildPersonCreateMessage,
  buildPersonUpdateMessage,
  findPersonNamed,
  parsePersonList,
  rankLinkCandidates,
  resolvePersonId,
} from './personAccountLinks';

const ANGELA_USER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const personList = {
  storage: [
    { id: 'angela', name: 'Angela', user_id: null, device_trackers: ['device_tracker.angela_phone'], picture: '/api/image/serve/abc/512x512' },
    { id: 'mattia', name: 'Mattia', user_id: 'ffffffffffffffffffffffffffffffff', device_trackers: [], picture: null },
  ],
  config: [{ id: 'yaml_person', name: 'Nonna', user_id: null, device_trackers: [] }],
};

describe('parsePersonList', () => {
  it('reads UI people as editable and configuration.yaml people as read-only', () => {
    expect(parsePersonList(personList)).toEqual([
      { id: 'angela', name: 'Angela', userId: null, deviceTrackers: ['device_tracker.angela_phone'], picture: '/api/image/serve/abc/512x512', editable: true },
      { id: 'mattia', name: 'Mattia', userId: 'ffffffffffffffffffffffffffffffff', deviceTrackers: [], picture: null, editable: true },
      { id: 'yaml_person', name: 'Nonna', userId: null, deviceTrackers: [], picture: null, editable: false },
    ]);
    expect(parsePersonList(null)).toEqual([]);
  });
});

describe('buildPersonUpdateMessage', () => {
  it('only changes the login and resends the rest of the person unchanged', () => {
    const [angela] = parsePersonList(personList);
    const message = buildPersonUpdateMessage(angela, ANGELA_USER);
    expect(message).toEqual({
      type: 'person/update',
      person_id: 'angela',
      name: 'Angela',
      user_id: ANGELA_USER,
      device_trackers: ['device_tracker.angela_phone'],
      picture: '/api/image/serve/abc/512x512',
    });
    expect(validatePanelApiMessage(message)).toBe(true);
    expect(validatePanelApiMessage(buildPersonUpdateMessage(angela, null))).toBe(true);
  });
});

describe('person bridge validation', () => {
  const valid = buildPersonUpdateMessage(parsePersonList(personList)[0], ANGELA_USER);

  it('rejects anything but a complete, well-formed person record', () => {
    expect(isValidPersonUpdateMessage({ ...valid, is_admin: true })).toBe(false);
    expect(isValidPersonUpdateMessage({ ...valid, user_id: 'not-a-user-id' })).toBe(false);
    expect(isValidPersonUpdateMessage({ ...valid, person_id: '../other' })).toBe(false);
    expect(isValidPersonUpdateMessage({ ...valid, name: '   ' })).toBe(false);
    expect(isValidPersonUpdateMessage({ ...valid, device_trackers: ['light.kitchen'] })).toBe(false);
    const { picture: _picture, ...withoutPicture } = valid;
    expect(isValidPersonUpdateMessage(withoutPicture)).toBe(false);
  });

  it('allows person/list only without parameters', () => {
    expect(validatePanelApiMessage({ type: 'person/list' })).toBe(true);
    expect(validatePanelApiMessage({ type: 'person/list', filter: 'x' })).toBe(false);
    expect(validatePanelApiMessage({ type: 'person/delete', person_id: 'angela' })).toBe(false);
  });
});

describe('buildPersonCreateMessage', () => {
  it('creates a person with only a name and an optional login', () => {
    const message = buildPersonCreateMessage('  Giulia ', ANGELA_USER);
    expect(message).toEqual({
      type: 'person/create',
      name: 'Giulia',
      user_id: ANGELA_USER,
      device_trackers: [],
      picture: null,
    });
    expect(validatePanelApiMessage(message)).toBe(true);
    expect(validatePanelApiMessage(buildPersonCreateMessage('Nonna', null))).toBe(true);
  });

  it('rejects creation requests that set anything else', () => {
    const valid = buildPersonCreateMessage('Giulia', null);
    expect(isValidPersonCreateMessage({ ...valid, name: ' ' })).toBe(false);
    expect(isValidPersonCreateMessage({ ...valid, name: 'x'.repeat(256) })).toBe(false);
    expect(isValidPersonCreateMessage({ ...valid, user_id: 'not-a-user-id' })).toBe(false);
    expect(isValidPersonCreateMessage({ ...valid, device_trackers: ['device_tracker.phone'] })).toBe(false);
    expect(isValidPersonCreateMessage({ ...valid, picture: '/api/image/serve/abc' })).toBe(false);
    expect(isValidPersonCreateMessage({ ...valid, person_id: 'giulia' })).toBe(false);
    const { user_id: _userId, ...withoutUser } = valid;
    expect(isValidPersonCreateMessage(withoutUser)).toBe(false);
  });
});

describe('findPersonNamed', () => {
  const members: ProfileHouseMember[] = [
    { id: 'person:person.giulia', name: 'Giulia', personEntityId: 'person.giulia', hasAccount: false },
    { id: 'user:a', name: 'Angela', userId: ANGELA_USER, hasAccount: true },
  ];

  it('matches existing people by name, ignoring case and spaces, but not bare logins', () => {
    expect(findPersonNamed(' giulia ', members)).toBe(members[0]);
    expect(findPersonNamed('Angela', members)).toBeUndefined();
    expect(findPersonNamed('  ', members)).toBeUndefined();
  });
});

describe('resolvePersonId', () => {
  it('reads the Home Assistant person id from the entity attributes', () => {
    const states = { 'person.angela': { state: 'home', rawAttributes: { id: 'angela', editable: true } } };
    expect(resolvePersonId(states, 'person.angela')).toBe('angela');
    expect(resolvePersonId(states, 'person.missing')).toBeUndefined();
  });
});

describe('rankLinkCandidates', () => {
  const members: ProfileHouseMember[] = [
    { id: 'user:m', name: 'Mattia', personEntityId: 'person.mattia', hasAccount: true },
    { id: 'person:person.giulia', name: 'Giulia', personEntityId: 'person.giulia', hasAccount: false },
    { id: 'person:person.angela', name: 'Angela', personEntityId: 'person.angela', hasAccount: false },
    { id: 'person:person.nonna', name: 'Nonna', personEntityId: 'person.nonna', hasAccount: false, personEditable: false },
    { id: 'user:a', name: 'Angela', userId: ANGELA_USER, hasAccount: true },
  ];

  it('offers editable people without a login, suggesting the same name first', () => {
    expect(rankLinkCandidates('angela', members)).toEqual([
      { member: members[2], sameName: true },
      { member: members[1], sameName: false },
    ]);
  });
});
