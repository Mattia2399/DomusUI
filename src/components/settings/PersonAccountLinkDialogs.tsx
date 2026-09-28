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
