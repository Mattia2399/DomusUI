/**
 * Client for `domusos/profile/list_recipients`: people who can be chosen as
 * notification recipients, with how ready each one is. Administrators only.
 *
 * Kept apart from `profileClient.ts` so it only ships with the screens that
 * choose recipients. The answer says *who* and *whether*, never *where*: only
 * the four documented fields of each entry are read, whatever else arrives.
 */

export type ProfileRecipientsCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

export const RECIPIENT_READINESS = [
  'ready',
  'temporarily_unavailable',
  'notifications_disabled',
  'no_devices',
  'no_profile',
  'no_account',
  'account_disabled',
  'account_unavailable',
  'profile_unavailable',
  'ambiguous',
] as const;

/** `unknown` stands for a status a newer backend may send: never treated as ready. */
export type RecipientReadiness = (typeof RECIPIENT_READINESS)[number] | 'unknown';

export type PersonRecipient = {
  /** Home Assistant internal person id: the only value a feature stores. */
  personId: string;
  /** Presentation only, to read the name and picture of that exact entity. */
  personEntityId: string | null;
  status: RecipientReadiness;
  selectable: boolean;
};

export type RecipientsErrorCode = 'unauthorized' | 'unsupported' | 'profile_unavailable' | 'invalid_response' | 'network';

export class RecipientsClientError extends Error {
  readonly code: RecipientsErrorCode;

  constructor(code: RecipientsErrorCode) {
    super(code);
    this.name = 'RecipientsClientError';
    this.code = code;
  }
}

const PERSON_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PERSON_ENTITY_ID = /^person\.[a-z0-9_]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function invalid(): never {
  throw new RecipientsClientError('invalid_response');
}

function parseEntry(value: unknown): PersonRecipient {
  if (!isRecord(value) || typeof value.person_id !== 'string' || !PERSON_ID.test(value.person_id)) return invalid();
  const entityId = value.person_entity_id;
  if (entityId !== null && (typeof entityId !== 'string' || !PERSON_ENTITY_ID.test(entityId))) return invalid();
  const personEntityId = entityId as string | null;
  if (typeof value.status !== 'string' || typeof value.selectable !== 'boolean') return invalid();
  const known = (RECIPIENT_READINESS as readonly string[]).includes(value.status);
  return {
    personId: value.person_id,
    personEntityId,
    status: known ? (value.status as RecipientReadiness) : 'unknown',
    // An ambiguous identity is never selectable, whatever the flag says.
    selectable: value.selectable && value.status !== 'ambiguous',
  };
}

/** Validate the whole answer: a malformed entry rejects it rather than being skipped silently. */
export function parseRecipients(value: unknown): PersonRecipient[] {
  if (!isRecord(value) || !Array.isArray(value.recipients)) return invalid();
  const recipients = value.recipients.map(parseEntry);
  if (new Set(recipients.map((recipient) => recipient.personId)).size !== recipients.length) return invalid();
  return recipients;
}

export function toRecipientsError(error: unknown): RecipientsClientError {
  if (error instanceof RecipientsClientError) return error;
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : String(error ?? '');
  const code = isRecord(error) && typeof error.code === 'string'
    ? error.code
    : message.match(/\[([a-z_]+)\]\s*$/)?.[1] ?? '';
  if (code === 'unauthorized' || code === 'admin_required' || /amministrativ|administrator/i.test(message)) {
    return new RecipientsClientError('unauthorized');
  }
  if (code === 'unknown_command' || code === 'invalid_format' || /non ammess[oa]/i.test(message)) {
    return new RecipientsClientError('unsupported');
  }
  if (code === 'profile_unavailable' || code === 'store_corrupt') return new RecipientsClientError('profile_unavailable');
  return new RecipientsClientError('network');
}

export async function listRecipients(callApi: ProfileRecipientsCallApi): Promise<PersonRecipient[]> {
  let result: unknown;
  try {
    result = await callApi<unknown>({ type: 'domusos/profile/list_recipients' }, { reportError: false, throwOnError: true });
  } catch (error) {
    throw toRecipientsError(error);
  }
  return parseRecipients(result);
}
