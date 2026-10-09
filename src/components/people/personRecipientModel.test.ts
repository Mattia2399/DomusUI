import { describe, expect, it } from 'vitest';
import type { PersonRecipient } from '../../services/profileRecipientsClient';
import {
  buildRecipientRows,
  entityForPersonId,
  filterRows,
  presentationOf,
  toggleRecipient,
  type PersonStates,
} from './personRecipientModel';

const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

const recipient = (personId: string, entityId: string | null, status: PersonRecipient['status'] = 'ready'): PersonRecipient => ({
  personId,
  personEntityId: entityId,
  status,
  selectable: status !== 'ambiguous',
});

const states: PersonStates = {
  'person.andrea_1': { rawAttributes: { id: 'p-a1', friendly_name: 'Andrea', entity_picture: '/api/image/serve/a/512x512' } },
  'person.andrea_2': { rawAttributes: { id: 'p-a2', friendly_name: 'Andrea' } },
  'person.zoe': { rawAttributes: { id: 'p-zoe', friendly_name: 'Zoe' } },
  'person.copy_1': { rawAttributes: { id: 'p-dup', friendly_name: 'Copia' } },
  'person.copy_2': { rawAttributes: { id: 'p-dup', friendly_name: 'Copia' } },
};

describe('personRecipientModel', () => {
  it('reads presentation only from the exact entity', () => {
    expect(presentationOf(states, 'person.andrea_1')).toEqual({ name: 'Andrea', picture: '/api/image/serve/a/512x512' });
    expect(presentationOf(states, 'person.andrea')).toEqual({ name: null, picture: null });
    expect(presentationOf(states, null)).toEqual({ name: null, picture: null });
  });

  it('finds a selected person by its exact internal id, never by name', () => {
    expect(entityForPersonId(states, 'p-zoe')).toBe('person.zoe');
    expect(entityForPersonId(states, 'Zoe')).toBeNull();
    expect(entityForPersonId(states, 'p-dup')).toBeNull();
  });

  it('keeps people with the same name apart and orders ready, others, ambiguous, removed', () => {
    const rows = buildRecipientRows(
      [
        recipient('p-zoe', 'person.zoe', 'no_devices'),
        recipient('p-a2', 'person.andrea_2'),
        recipient('p-a1', 'person.andrea_1'),
        recipient('p-dup', null, 'ambiguous'),
      ],
      ['p-gone', 'p-zoe'],
      states,
      collator,
    );

    expect(rows.map((row) => [row.personId, row.name, row.status, row.selected, row.canAdd])).toEqual([
      ['p-a1', 'Andrea', 'ready', false, true],
      ['p-a2', 'Andrea', 'ready', false, true],
      ['p-zoe', 'Zoe', 'no_devices', true, true],
      ['p-dup', null, 'ambiguous', false, false],
      ['p-gone', null, 'removed', true, false],
    ]);
  });

  it('searches names for display only', () => {
    const rows = buildRecipientRows([recipient('p-a1', 'person.andrea_1'), recipient('p-zoe', 'person.zoe')], [], states, collator);

    expect(filterRows(rows, '  ANDR ', 'it').map((row) => row.personId)).toEqual(['p-a1']);
    // Ids and entity ids are not searchable text.
    expect(filterRows(rows, 'p-zoe', 'it')).toEqual([]);
    expect(filterRows(rows, '', 'it')).toHaveLength(2);
  });

  it('changes the value only for addable people and always allows removing', () => {
    const rows = buildRecipientRows(
      [recipient('p-a1', 'person.andrea_1'), recipient('p-dup', null, 'ambiguous'), recipient('p-zoe', 'person.zoe', 'no_account')],
      ['p-gone'],
      states,
      collator,
    );
    const row = (id: string) => rows.find((candidate) => candidate.personId === id)!;
    const value = ['p-gone'];

    expect(toggleRecipient(value, row('p-a1'))).toEqual(['p-gone', 'p-a1']);
    expect(toggleRecipient(value, row('p-zoe'))).toEqual(['p-gone', 'p-zoe']);
    expect(toggleRecipient(value, row('p-dup'))).toBe(value);
    expect(toggleRecipient(value, row('p-gone'))).toEqual([]);
    expect(toggleRecipient(value, row('p-a1'), 1)).toBe(value);
  });
});
