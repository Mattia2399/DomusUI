/**
 * Pure model of the person recipient picker.
 *
 * Identity is always the Home Assistant internal person id. Names and pictures
 * are read live, only from the exact entity the server named, and only for
 * display, sorting and the local search: they never decide who a value is.
 */

import type { PersonRecipientCopyKey } from '../../i18n/personRecipientTranslations';
import type { PersonRecipient, RecipientReadiness } from '../../services/profileRecipientsClient';

export type PersonStates = Record<string, { rawAttributes?: Record<string, unknown> } | undefined>;

/** `removed`: a selected id the server no longer lists. Only the picker creates it. */
export type RecipientRowStatus = RecipientReadiness | 'removed';

export type RecipientRow = {
  personId: string;
  name: string | null;
  picture: string | null;
  status: RecipientRowStatus;
  selected: boolean;
  /** Can be chosen as a new recipient. */
  canAdd: boolean;
};

export type RecipientTone = 'success' | 'warning' | 'muted';

export const STATUS_COPY: Record<RecipientRowStatus, PersonRecipientCopyKey> = {
  ready: 'status.ready',
  temporarily_unavailable: 'status.temporarily_unavailable',
  notifications_disabled: 'status.notifications_disabled',
  no_devices: 'status.no_devices',
  no_profile: 'status.no_profile',
  no_account: 'status.no_account',
  account_disabled: 'status.account_disabled',
  account_unavailable: 'status.account_unavailable',
  profile_unavailable: 'status.profile_unavailable',
  ambiguous: 'status.ambiguous',
  unknown: 'status.unknown',
  removed: 'removed',
};

export const STATUS_HINT: Partial<Record<RecipientRowStatus, PersonRecipientCopyKey>> = {
  temporarily_unavailable: 'hint.temporarily_unavailable',
  notifications_disabled: 'hint.notifications_disabled',
  ambiguous: 'hint.ambiguous',
  removed: 'removedHint',
};

export function statusTone(status: RecipientRowStatus): RecipientTone {
  if (status === 'ready') return 'success';
  if (status === 'ambiguous' || status === 'removed' || status === 'temporarily_unavailable') return 'warning';
  return 'muted';
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Name and picture of exactly one entity; nothing is looked up by similarity. */
export function presentationOf(states: PersonStates, entityId: string | null) {
  const attributes = entityId ? states[entityId]?.rawAttributes : undefined;
  return { name: text(attributes?.friendly_name), picture: text(attributes?.entity_picture) };
}

/**
 * The entity of a selected person before the list is loaded, for the summary:
 * the one person state whose internal id is exactly ``personId``, if only one.
 */
export function entityForPersonId(states: PersonStates, personId: string): string | null {
  const matches = Object.entries(states).filter(
    ([entityId, state]) => entityId.startsWith('person.') && state?.rawAttributes?.id === personId,
  );
  return matches.length === 1 ? matches[0][0] : null;
}

// Ready first, then everyone else who can be chosen, then what needs attention.
const GROUP_ORDER = (row: RecipientRow) =>
  row.status === 'removed' ? 3 : row.status === 'ambiguous' ? 2 : row.status === 'ready' ? 0 : 1;

/**
 * One row per listed person, plus one per selected id the server no longer
 * lists. Selection does not move rows, so the list stays still while the
 * administrator ticks people; duplicate names stay separate rows.
 */
export function buildRecipientRows(
  recipients: PersonRecipient[],
  value: readonly string[],
  states: PersonStates,
  collator: Intl.Collator,
): RecipientRow[] {
  const selected = new Set(value);
  const rows: RecipientRow[] = recipients.map((recipient) => ({
    personId: recipient.personId,
    ...presentationOf(states, recipient.personEntityId),
    status: recipient.status,
    selected: selected.has(recipient.personId),
    canAdd: recipient.selectable,
  }));
  const listed = new Set(recipients.map((recipient) => recipient.personId));
  for (const personId of value) {
    if (!listed.has(personId)) {
      rows.push({ personId, name: null, picture: null, status: 'removed', selected: true, canAdd: false });
    }
  }
  return rows.sort((first, second) =>
    GROUP_ORDER(first) - GROUP_ORDER(second)
    || collator.compare(first.name ?? '', second.name ?? '')
    || first.personId.localeCompare(second.personId));
}

/** Local, display-only search by name; it hides rows, never changes the selection. */
export function filterRows(rows: RecipientRow[], query: string, locale: string): RecipientRow[] {
  const needle = query.trim().toLocaleLowerCase(locale);
  if (!needle) return rows;
  return rows.filter((row) => (row.name ?? '').toLocaleLowerCase(locale).includes(needle));
}

/** The next value after a tap: only the administrator's action changes it. */
export function toggleRecipient(
  value: readonly string[],
  row: RecipientRow,
  maxRecipients?: number,
): readonly string[] {
  if (row.selected) return value.filter((personId) => personId !== row.personId);
  if (!row.canAdd || value.includes(row.personId)) return value;
  if (maxRecipients !== undefined && value.length >= maxRecipients) return value;
  return [...value, row.personId];
}
