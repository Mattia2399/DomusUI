import { useId, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, CircleDashed, RefreshCw, Search, UserRound, Users, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { personRecipientCopy } from '../../i18n/personRecipientTranslations';
import type { ProfileRecipientsCallApi } from '../../services/profileRecipientsClient';
import GlassBottomSheet from '../ui/GlassBottomSheet';
import {
  STATUS_COPY,
  STATUS_HINT,
  buildRecipientRows,
  entityForPersonId,
  filterRows,
  presentationOf,
  statusTone,
  toggleRecipient,
  type PersonStates,
  type RecipientRow,
  type RecipientTone,
} from './personRecipientModel';
import { usePersonRecipients } from './usePersonRecipients';

export type PersonRecipientPickerProps = {
  /** Home Assistant internal person ids: the only thing a feature stores. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Live Home Assistant states, used only to show names and pictures. */
  states: PersonStates;
  callApi?: ProfileRecipientsCallApi;
  /** The integration offers `profile_recipients_v1`. */
  supported: boolean;
  /** Connected to Home Assistant. */
  online: boolean;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  maxRecipients?: number;
  /** Turns a Home Assistant picture path into a loadable URL. */
  resolveAssetUrl?: (url: string) => string;
};

const TONE_CLASS: Record<RecipientTone, string> = {
  success: 'text-[color:var(--ui-success)]',
  warning: 'text-[color:var(--ui-warning)]',
  muted: 'text-[color:var(--ui-text-secondary)]',
};

const TONE_ICON = { success: CheckCircle2, warning: AlertTriangle, muted: CircleDashed } as const;

const buttonBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const neutralButton =
  'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-primary)] shadow-[0_8px_18px_var(--ui-shadow)] hover:bg-[color:var(--ui-surface-glass)]';
const accentButton =
  'border-[color:rgb(var(--ui-accent-rgb)/0.55)] bg-[linear-gradient(140deg,rgb(var(--ui-accent-rgb)/0.34)_0%,rgb(var(--ui-accent-secondary-rgb)/0.24)_100%)] text-[color:var(--ui-text-primary)] shadow-[0_12px_24px_var(--ui-shadow-soft)] hover:brightness-105';

function initials(name: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

function Avatar({ name, picture, size }: { name: string | null; picture: string | null; size: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  const letters = initials(name);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)] ${
        size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-10 w-10 text-xs'
      } font-semibold`}
    >
      {picture && !failed ? (
        <img src={picture} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : letters ? (
        letters
      ) : (
        <UserRound size={size === 'sm' ? 12 : 17} />
      )}
    </span>
  );
}

/**
 * Choose who receives a shared notification, by Home Assistant person.
 *
 * Controlled and stateless towards storage: it only reports person ids through
 * ``onChange``. It never knows where a person is notified. A person whose
 * status changes, or who disappears from Home Assistant, stays selected until
 * the administrator removes them.
 */
export function PersonRecipientPicker({
  value,
  onChange,
  states,
  callApi,
  supported,
  online,
  disabled = false,
  label,
  helperText,
  maxRecipients,
  resolveAssetUrl,
}: PersonRecipientPickerProps) {
  const { locale } = useI18n();
  const copy = useMemo(() => personRecipientCopy(locale), [locale]);
  const collator = useMemo(() => new Intl.Collator(locale, { sensitivity: 'base', numeric: true }), [locale]);
  const searchId = useId();
  const { state, load } = usePersonRecipients(callApi);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const picture = (url: string | null) => (url && resolveAssetUrl ? resolveAssetUrl(url) : url);

  const loaded = state.status === 'ready' || (state.status === 'error' && state.recipients.length > 0);
  const rows = useMemo(
    () => (loaded ? buildRecipientRows(state.recipients, value, states, collator) : []),
    [collator, loaded, state.recipients, states, value],
  );
  const visible = useMemo(() => filterRows(rows, query, locale), [locale, query, rows]);
  const canEdit = !disabled && online && loaded;
  const atLimit = maxRecipients !== undefined && value.length >= maxRecipients;

  // Before the list is loaded, a selected id is shown through its one exact person state.
  const summary = value.map((personId) => {
    const row = rows.find((candidate) => candidate.personId === personId);
    if (row) return { personId, name: row.name, picture: row.picture, removed: row.status === 'removed' };
    const presentation = presentationOf(states, entityForPersonId(states, personId));
    return { personId, ...presentation, removed: false };
  });

  const openSheet = () => {
    setQuery('');
    setOpen(true);
    void load();
  };

  const toggle = (row: RecipientRow) => {
    if (!canEdit) return;
    const next = toggleRecipient(value, row, maxRecipients);
    if (next !== value) onChange([...next]);
  };

  const unavailableReason = !supported ? copy('unsupported') : !online ? copy('offline') : null;

  return (
    <div className="space-y-2" data-testid="person-recipient-picker">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{label ?? copy('title')}</span>
        <span className="text-xs font-medium text-[color:var(--ui-text-secondary)]">
          {value.length === 0
            ? copy('summary.none')
            : value.length === 1
              ? copy('summary.one')
              : copy('summary.many', { count: value.length })}
        </span>
      </div>
      {helperText ? <p className="text-xs leading-5 text-[color:var(--ui-text-secondary)]">{helperText}</p> : null}

      {summary.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={label ?? copy('title')}>
          {summary.map((item) => (
            <li
              key={item.personId}
              className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] py-1 pl-1 pr-3 text-xs font-semibold text-[color:var(--ui-text-primary)]"
            >
              {item.removed ? (
                <AlertTriangle size={14} className="ml-1 shrink-0 text-[color:var(--ui-warning)]" aria-hidden="true" />
              ) : (
                <Avatar name={item.name} picture={picture(item.picture)} size="sm" />
              )}
              <span className="truncate">
                {item.removed ? copy('removed') : item.name ?? copy('unknownPerson')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {unavailableReason ? (
        <p className="text-xs font-medium leading-5 text-[color:var(--ui-warning)]" role="status">
          {unavailableReason}
          {!supported ? <span className="block font-normal text-[color:var(--ui-text-secondary)]">{copy('unsupportedHint')}</span> : null}
        </p>
      ) : null}

      <button
        type="button"
        onClick={openSheet}
        disabled={disabled || !supported || !online || !callApi}
        className={`${buttonBase} ${neutralButton} w-full sm:w-auto`}
      >
        <Users size={16} aria-hidden="true" />
        {copy('choose')}
      </button>

      <GlassBottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={copy('sheetTitle')}
        description={copy('sheetDescription')}
        footer={
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={state.status === 'loading'}
              className={`${buttonBase} ${neutralButton}`}
            >
              <RefreshCw
                size={15}
                aria-hidden="true"
                className={state.status === 'loading' ? 'animate-spin motion-reduce:animate-none' : undefined}
              />
              {copy('refresh')}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={`${buttonBase} ${accentButton}`}>
              {copy('done')}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {loaded && rows.length > 0 ? (
            <label htmlFor={searchId} className="relative block">
              <span className="sr-only">{copy('search')}</span>
              <Search
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ui-text-tertiary)]"
              />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy('search')}
                autoComplete="off"
                className="ui-input w-full rounded-xl py-2.5 pl-9 pr-3 text-sm"
              />
            </label>
          ) : null}

          {!online ? (
            <p role="status" className="text-xs font-medium leading-5 text-[color:var(--ui-warning)]">{copy('offline')}</p>
          ) : null}
          {state.status === 'error' ? (
            <div role="alert" className="space-y-2 text-xs font-medium leading-5 text-[color:var(--ui-danger)]">
              <p>{state.error === 'unauthorized' ? copy('unauthorized') : state.error === 'unsupported' ? copy('unsupported') : copy('error')}</p>
              {state.error !== 'unauthorized' && state.error !== 'unsupported' ? (
                <button type="button" onClick={() => void load()} className={`${buttonBase} ${neutralButton}`}>
                  {copy('retry')}
                </button>
              ) : null}
            </div>
          ) : null}
          {atLimit && canEdit ? (
            <p role="status" className="text-xs leading-5 text-[color:var(--ui-text-secondary)]">
              {copy('limit', { count: maxRecipients ?? 0 })}
            </p>
          ) : null}

          {state.status === 'loading' && !loaded ? (
            <div role="status" aria-label={copy('loading')} className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex min-h-16 items-center gap-3">
                  <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[color:var(--ui-fill-secondary)] motion-reduce:animate-none" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3 w-2/5 animate-pulse rounded-full bg-[color:var(--ui-fill-secondary)] motion-reduce:animate-none" />
                    <span className="block h-3 w-3/5 animate-pulse rounded-full bg-[color:var(--ui-fill-tertiary)] motion-reduce:animate-none" />
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {loaded && rows.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <Users size={24} className="mx-auto text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{copy('empty')}</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{copy('emptyHint')}</p>
            </div>
          ) : null}
          {loaded && rows.length > 0 && visible.length === 0 ? (
            <p className="py-4 text-center text-xs text-[color:var(--ui-text-secondary)]">{copy('noMatch')}</p>
          ) : null}

          {loaded && visible.length > 0 ? (
            <ul className="divide-y divide-[color:var(--ui-separator)]" aria-label={copy('sheetTitle')}>
              {visible.map((row) => {
                const tone = statusTone(row.status);
                const Icon = TONE_ICON[tone];
                const hint = STATUS_HINT[row.status];
                const name = row.status === 'removed' ? copy('removed') : row.name ?? copy('unnamed');
                // A selected row can always be removed; a new one needs a choosable person and room.
                const actionable = canEdit && (row.selected || (row.canAdd && !atLimit));
                return (
                  <li key={row.personId} data-testid="recipient-row" data-status={row.status}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={row.selected}
                      aria-label={row.selected && row.status === 'removed' ? copy('remove', { name }) : name}
                      aria-describedby={`${searchId}-${row.personId}`}
                      disabled={!actionable}
                      onClick={() => toggle(row)}
                      className="flex min-h-16 w-full items-center gap-3 rounded-[1rem] px-1 py-2.5 text-left transition hover:bg-[color:var(--ui-fill-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ui-accent-rgb)/0.45)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      {row.status === 'removed' ? (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-warning)]" aria-hidden="true">
                          <AlertTriangle size={17} />
                        </span>
                      ) : (
                        <Avatar name={row.name} picture={picture(row.picture)} size="md" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-semibold text-[color:var(--ui-text-primary)]">{name}</span>
                        <span id={`${searchId}-${row.personId}`} className="block">
                          <span className={`mt-0.5 flex items-start gap-1.5 text-xs font-medium leading-5 ${TONE_CLASS[tone]}`}>
                            <Icon size={13} className="mt-[3px] shrink-0" aria-hidden="true" />
                            <span>{row.status === 'removed' ? copy('removedHint') : copy(STATUS_COPY[row.status])}</span>
                          </span>
                          {hint && row.status !== 'removed' ? (
                            <span className="block text-xs leading-5 text-[color:var(--ui-text-secondary)]">{copy(hint)}</span>
                          ) : null}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                          row.selected
                            ? 'border-[color:var(--ui-accent-strong)] bg-[color:var(--ui-accent-strong)] text-[color:var(--ui-accent-contrast)]'
                            : 'border-[color:var(--ui-border-strong)] bg-[color:var(--ui-surface-glass-soft)]'
                        }`}
                      >
                        {row.selected ? row.status === 'removed' ? <X size={14} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </GlassBottomSheet>
    </div>
  );
}

export default PersonRecipientPicker;
