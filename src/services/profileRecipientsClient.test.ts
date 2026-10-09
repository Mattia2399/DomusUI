import { describe, expect, it, vi } from 'vitest';
import {
  RecipientsClientError,
  listRecipients,
  parseRecipients,
  toRecipientsError,
  type ProfileRecipientsCallApi,
} from './profileRecipientsClient';

const entry = (overrides: Record<string, unknown> = {}) => ({
  person_id: 'p-mattia',
  person_entity_id: 'person.mattia',
  status: 'ready',
  selectable: true,
  ...overrides,
});

describe('profileRecipientsClient', () => {
  it('asks for the list with no parameters and reads only the four fields', async () => {
    const callApi = vi.fn(async () => ({
      recipients: [entry({ user_id: 'u-1', devices: ['Galaxy'], notify_service: 'notify.mobile_app_galaxy' })],
    }));

    const recipients = await listRecipients(callApi as unknown as ProfileRecipientsCallApi);

    expect(callApi).toHaveBeenCalledWith({ type: 'domusos/profile/list_recipients' }, { reportError: false, throwOnError: true });
    expect(recipients).toEqual([{ personId: 'p-mattia', personEntityId: 'person.mattia', status: 'ready', selectable: true }]);
    expect(JSON.stringify(recipients)).not.toMatch(/u-1|Galaxy|notify/);
  });

  it('rejects malformed answers instead of skipping entries', () => {
    for (const bad of [
      null,
      { recipients: 'x' },
      { recipients: [entry({ person_id: 7 })] },
      { recipients: [entry({ person_id: '../x' })] },
      { recipients: [entry({ person_entity_id: 'sensor.mattia' })] },
      { recipients: [entry({ selectable: 'yes' })] },
      { recipients: [entry({ status: 3 })] },
      { recipients: [entry(), entry()] },
    ]) {
      expect(() => parseRecipients(bad)).toThrow(RecipientsClientError);
    }
  });

  it('never treats an unknown status as ready and never lets an ambiguous identity be chosen', () => {
    const [future, ambiguous] = parseRecipients({
      recipients: [
        entry({ person_id: 'p-a', status: 'quiet_hours' }),
        entry({ person_id: 'p-b', person_entity_id: null, status: 'ambiguous', selectable: true }),
      ],
    });

    expect(future).toMatchObject({ status: 'unknown', selectable: true });
    expect(ambiguous).toMatchObject({ status: 'ambiguous', selectable: false, personEntityId: null });
  });

  it('maps failures to stable codes', () => {
    expect(toRecipientsError({ code: 'unauthorized', message: 'Unauthorized' }).code).toBe('unauthorized');
    expect(toRecipientsError(new Error('Permesso amministrativo Home Assistant richiesto.')).code).toBe('unauthorized');
    expect(toRecipientsError({ code: 'unknown_command' }).code).toBe('unsupported');
    expect(toRecipientsError({ code: 'profile_unavailable' }).code).toBe('profile_unavailable');
    expect(toRecipientsError(new Error('socket closed')).code).toBe('network');
  });
});
