import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import GlassModal from '../ui/GlassModal';
import type { ProfileHouseMember } from './settingsHouseAccessModel';

type ButtonClasses = { neutral: string; accent: string };

type LinkCandidate = { member: ProfileHouseMember; sameName: boolean };

const footerButtonBase =
  'inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold disabled:opacity-50';

function errorText(error: string | null) {
  return error ? (
    <p role="alert" className="mt-3 text-xs font-medium text-[color:var(--ui-danger)]">
      {error}
    </p>
  ) : null;
}

/** Choose the person a Home Assistant login belongs to. */
export function LinkAccountDialog({
  account,
  candidates,
  busy,
  error,
  buttons,
  onCancel,
  onConfirm,
}: {
  account: ProfileHouseMember | null;
  candidates: LinkCandidate[];
  busy: boolean;
  error: string | null;
  buttons: ButtonClasses;
  onCancel: () => void;
  onConfirm: (personEntityId: string) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);

  // Preselect the same-name suggestion (if any) each time the dialog opens.
  useEffect(() => {
    setSelected(candidates.find((candidate) => candidate.sameName)?.member.personEntityId ?? null);
  }, [account?.id, candidates]);

  return (
    <GlassModal
      isOpen={account !== null}
      onClose={busy ? () => undefined : onCancel}
      title={account ? t('settings.access.link.title', { name: account.name }) : ''}
      description={t('settings.access.link.description')}
      variant="responsive"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={`${footerButtonBase} ${buttons.neutral}`} onClick={onCancel} disabled={busy}>
            {t('settings.access.link.cancel')}
          </button>
          <button
            type="button"
            className={`${footerButtonBase} ${buttons.accent}`}
            onClick={() => selected && onConfirm(selected)}
            disabled={busy || !selected}
          >
            {t('settings.access.link.confirm')}
          </button>
        </div>
      }
    >
      {candidates.length > 0 ? (
        <fieldset>
          <legend className="sr-only">{t('settings.access.peopleTitle')}</legend>
          <div className="space-y-2">
            {candidates.map(({ member, sameName }) => {
              const id = member.personEntityId as string;
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors ${
                    selected === id
                      ? 'border-[color:var(--ui-accent)] bg-[color:var(--ui-fill-secondary)]'
                      : 'border-[color:var(--ui-border)] hover:bg-[color:var(--ui-fill-tertiary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="person-link-target"
                    value={id}
                    checked={selected === id}
                    onChange={() => setSelected(id)}
                    className="h-4 w-4 accent-[color:var(--ui-accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
                    {member.name}
                  </span>
                  {sameName ? (
                    <span className="shrink-0 rounded-full bg-[color:var(--ui-fill-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ui-text-secondary)]">
                      {t('settings.access.link.sameName')}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-[color:var(--ui-text-secondary)]">{t('settings.access.link.noCandidates')}</p>
      )}
      {errorText(error)}
    </GlassModal>
  );
}

const NO_ACCOUNT = '';

/**
 * Create a Home Assistant person. From an account row the login is fixed and
 * the name is prefilled; from Members any login without a person can be chosen.
 */
export function CreatePersonDialog({
  isOpen,
  account,
  accounts,
  findExistingPerson,
  busy,
  error,
  buttons,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  /** Preset login (account row); `null` when adding a person from Members. */
  account: ProfileHouseMember | null;
  /** Logins without a person, offered when no account is preset. */
  accounts: ProfileHouseMember[];
  findExistingPerson: (name: string) => ProfileHouseMember | undefined;
  busy: boolean;
  error: string | null;
  buttons: ButtonClasses;
  onCancel: () => void;
  onConfirm: (name: string, userId: string | null) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [userId, setUserId] = useState(NO_ACCOUNT);

  useEffect(() => {
    if (!isOpen) return;
    setName(account?.name ?? '');
    setUserId(account?.userId ?? NO_ACCOUNT);
  }, [isOpen, account?.name, account?.userId]);

  const trimmedName = name.trim();
  const duplicate = trimmedName ? findExistingPerson(trimmedName) : undefined;
  const canConfirm = !busy && trimmedName.length > 0 && trimmedName.length <= 255 && !duplicate;
  const confirm = () => canConfirm && onConfirm(trimmedName, userId || null);
  const accountOptions = [
    { value: NO_ACCOUNT, label: t('settings.access.create.noAccount') },
    ...accounts.flatMap((entry) => (entry.userId ? [{ value: entry.userId, label: entry.name }] : [])),
  ];

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={busy ? () => undefined : onCancel}
      title={account ? t('settings.access.create.titleForAccount', { name: account.name }) : t('settings.access.create.title')}
      description={t('settings.access.create.description')}
      variant="responsive"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={`${footerButtonBase} ${buttons.neutral}`} onClick={onCancel} disabled={busy}>
            {t('settings.access.link.cancel')}
          </button>
          <button
            type="button"
            className={`${footerButtonBase} ${buttons.accent}`}
            onClick={confirm}
            disabled={!canConfirm}
          >
            {t('settings.access.create.confirm')}
          </button>
        </div>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          confirm();
        }}
      >
        <label className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
          {t('settings.access.create.nameLabel')}
          <input
            className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm"
            value={name}
            maxLength={255}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {duplicate ? (
          <p className="mt-2 text-xs font-medium text-[color:var(--ui-text-secondary)]">
            {t(
              duplicate.hasAccount === false && account
                ? 'settings.access.create.duplicateLinkable'
                : 'settings.access.create.duplicate',
            )}
          </p>
        ) : null}
        {!account && accountOptions.length > 1 ? (
          <fieldset className="mt-4">
            <legend className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('settings.access.create.accountLabel')}
            </legend>
            <div className="mt-1.5 space-y-2">
              {accountOptions.map((option) => (
                <label
                  key={option.value || 'none'}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors ${
                    userId === option.value
                      ? 'border-[color:var(--ui-accent)] bg-[color:var(--ui-fill-secondary)]'
                      : 'border-[color:var(--ui-border)] hover:bg-[color:var(--ui-fill-tertiary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="person-create-account"
                    value={option.value}
                    checked={userId === option.value}
                    onChange={() => setUserId(option.value)}
                    className="h-4 w-4 accent-[color:var(--ui-accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </form>
      {errorText(error)}
    </GlassModal>
  );
}

/** Confirm detaching a login from its person. */
export function UnlinkAccountDialog({
  person,
  busy,
  error,
  buttons,
  onCancel,
  onConfirm,
}: {
  person: ProfileHouseMember | null;
  busy: boolean;
  error: string | null;
  buttons: ButtonClasses;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <GlassModal
      isOpen={person !== null}
      onClose={busy ? () => undefined : onCancel}
      title={person ? t('settings.access.unlink.title', { name: person.name }) : ''}
      description={t('settings.access.unlink.description')}
      variant="responsive"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={`${footerButtonBase} ${buttons.neutral}`} onClick={onCancel} disabled={busy}>
            {t('settings.access.link.cancel')}
          </button>
          <button type="button" className={`${footerButtonBase} ${buttons.accent}`} onClick={onConfirm} disabled={busy}>
            {t('settings.access.unlink.confirm')}
          </button>
        </div>
      }
    >
      {errorText(error)}
    </GlassModal>
  );
}
