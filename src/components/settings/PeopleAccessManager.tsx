import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronRight, RotateCcw, ShieldAlert, UserRound } from 'lucide-react';
import GlassModal from '../ui/GlassModal';
import GlassToggle from '../ui/GlassToggle';
import { SettingsListGroup } from './SettingsList';
import { useAccessControl } from '../../security/AccessControlProvider';
import { usePeopleAccessCopy, type PeopleAccessCopyKey } from '../../i18n/peopleAccessCopy';
import {
  ASSIGNABLE_ROLES,
  AccessAdminError,
  PERSONAL_GRANTS,
  ROLES_WITH_PERSONAL_GRANTS,
  listAccounts,
  removeAssignment,
  resetAccessPolicy,
  setAssignment,
  type AccessAdminCallApi,
  type AccountsList,
  type AssignableRole,
  type ManagedAccount,
  type PersonalGrant,
} from '../../services/accessAdminClient';

const ROLE_KEYS: Record<ManagedAccount['role'], PeopleAccessCopyKey> = {
  admin: 'roleAdmin',
  resident: 'roleResident',
  member: 'roleMember',
  restricted: 'roleRestricted',
  wall_panel: 'roleWallPanel',
  locked: 'roleLocked',
};
const ROLE_DESCRIPTION_KEYS: Record<AssignableRole, PeopleAccessCopyKey> = {
  admin: 'roleAdminDescription',
  resident: 'roleResidentDescription',
  member: 'roleMemberDescription',
  restricted: 'roleRestrictedDescription',
  wall_panel: 'roleWallPanelDescription',
};
const GRANT_KEYS: Record<PersonalGrant, [PeopleAccessCopyKey, PeopleAccessCopyKey]> = {
  'access.control': ['grantAccess', 'grantAccessDescription'],
  'security.control': ['grantSecurity', 'grantSecurityDescription'],
};
// What each role means for the house; presentation only, the capabilities decide.
const HOUSE_ACCESS_KEYS: Record<ManagedAccount['role'], PeopleAccessCopyKey> = {
  admin: 'houseFull',
  resident: 'houseFull',
  member: 'houseStandard',
  restricted: 'houseLimited',
  wall_panel: 'housePanel',
  locked: 'houseLimited',
};
const TRUSTED_STATES = new Set(['absent', 'ready']);

const holdsPersonalGrants = (role: AssignableRole) => ROLES_WITH_PERSONAL_GRANTS.includes(role);
// Administration is real only for a Home Assistant administrator (Q24).
const administers = (role: ManagedAccount['role'], account: ManagedAccount) => role === 'admin' && account.isAdmin;
// A stored Administrator role that Home Assistant cannot honour: shown, never silently changed.
const isLegacyAdmin = (account: ManagedAccount) => account.role === 'admin' && !account.isAdmin;

type Draft = { role: AssignableRole; grants: PersonalGrant[] };
type Notice = { tone: 'info' | 'error' | 'conflict'; key: PeopleAccessCopyKey } | null;

const sameDraft = (left: Draft, right: Draft) =>
  left.role === right.role && left.grants.join() === right.grants.join();

const draftOf = (account: ManagedAccount): Draft => ({
  role: account.role === 'locked' ? 'member' : account.role,
  grants: [...account.grants].sort(),
});

const errorKey = (error: unknown): PeopleAccessCopyKey => {
  const code = error instanceof AccessAdminError ? error.code : 'network';
  if (code === 'account_not_manageable') return 'notManageable';
  if (code === 'unknown_account') return 'unknownAccount';
  if (code === 'role_requires_ha_admin') return 'roleRequiresHaAdmin';
  if (code === 'access_denied' || code === 'unauthorized') return 'denied';
  if (code === 'access_store_untrusted') return 'lockedTitle';
  if (code === 'unsupported') return 'unsupported';
  return 'saveError';
};

// Only a failure that may pass offers to try again: an older integration or a refused account will not.
const loadErrorKey = (error: unknown): PeopleAccessCopyKey => {
  const code = error instanceof AccessAdminError ? error.code : 'network';
  if (code === 'unsupported') return 'unsupported';
  if (code === 'access_denied' || code === 'unauthorized') return 'denied';
  return 'loadError';
};

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-semibold ${
        tone === 'accent'
          ? 'bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:var(--ui-accent)]'
          : 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Settings › People and access › Roles and permissions. For an administrator
 * (access.manage); the backend checks the administrator again on every
 * request and answers with what it saved, which the page then shows.
 */
export function PeopleAccessManager({ callApi }: { callApi: AccessAdminCallApi }) {
  const copy = usePeopleAccessCopy();
  const access = useAccessControl();
  const currentUserId = access.profile?.userId ?? null;
  const [list, setList] = useState<AccountsList | null>(null);
  const [loadFailure, setLoadFailure] = useState<PeopleAccessCopyKey | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetNotice, setResetNotice] = useState<Notice>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const roleLegendId = useId();
  const grantsLegendId = useId();

  const load = useCallback(async (): Promise<AccountsList | null> => {
    setLoadFailure(null);
    try {
      const fresh = await listAccounts(callApi);
      setList(fresh);
      return fresh;
    } catch (error) {
      setLoadFailure(loadErrorKey(error));
      return null;
    }
  }, [callApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => list?.accounts.find((account) => account.userId === selectedId) ?? null,
    [list, selectedId],
  );
  const trusted = list ? TRUSTED_STATES.has(list.state) : true;
  const dirty = Boolean(selected && draft && !sameDraft(draftOf(selected), draft));

  useEffect(() => {
    if (notice && notice.tone !== 'info') noticeRef.current?.focus();
  }, [notice]);

  const open = (account: ManagedAccount) => {
    setSelectedId(account.userId);
    setDraft(draftOf(account));
    setNotice(null);
  };
  const close = () => {
    if (saving) return;
    setSelectedId(null);
    setDraft(null);
    setNotice(null);
  };

  const applySaved = (account: ManagedAccount | null, summary: { state: AccountsList['state']; revision: number }) => {
    setList((current) =>
      current
        ? {
            ...summary,
            accounts: account
              ? current.accounts.map((entry) => (entry.userId === account.userId ? account : entry))
              : current.accounts,
          }
        : current,
    );
    if (account) setDraft(draftOf(account));
    // The current account's own profile changed: the interface follows at once.
    if (account && account.userId === currentUserId) access.refresh();
  };

  const run = async (operation: () => Promise<{ state: AccountsList['state']; revision: number; account: ManagedAccount | null }>) => {
    if (saving || !list) return;
    setSaving(true);
    setNotice(null);
    try {
      const saved = await operation();
      applySaved(saved.account, saved);
      setNotice({ tone: 'info', key: 'saved' });
    } catch (error) {
      setNotice(
        error instanceof AccessAdminError && error.code === 'revision_conflict'
          ? { tone: 'conflict', key: 'conflict' }
          : { tone: 'error', key: errorKey(error) },
      );
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!selected || !draft || !list || !dirty) return;
    void run(() => setAssignment(callApi, selected.userId, draft.role, draft.grants, list.revision));
  };
  const restoreDefault = () => {
    if (!selected || !list) return;
    void run(() => removeAssignment(callApi, selected.userId, list.revision));
  };
  const reloadAfterConflict = async () => {
    const fresh = await load();
    if (!fresh) return;
    // The editor starts again from what the backend says, never from the stale draft.
    const account = fresh.accounts.find((entry) => entry.userId === selectedId);
    setDraft(account ? draftOf(account) : null);
    if (!account) setSelectedId(null);
    setNotice(null);
  };

  const reset = async () => {
    setSaving(true);
    setResetNotice(null);
    try {
      await resetAccessPolicy(callApi);
      setIsResetOpen(false);
      setResetNotice({ tone: 'info', key: 'resetDone' });
      access.refresh();
      await load();
    } catch {
      setResetNotice({ tone: 'error', key: 'resetError' });
    } finally {
      setSaving(false);
    }
  };

  const summary = (account: ManagedAccount) => {
    const parts = [copy(ROLE_KEYS[account.role])];
    if (account.grants.length > 0 && !(account.role !== 'locked' && holdsPersonalGrants(account.role))) {
      parts.push(copy('extraGrants', { grants: account.grants.map((grant) => copy(GRANT_KEYS[grant][0])).join(', ') }));
    }
    return parts.join(' · ');
  };

  const row = (account: ManagedAccount) => (
    <button
      key={account.userId}
      type="button"
      onClick={() => open(account)}
      disabled={!account.manageable}
      data-account={account.userId}
      className="flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--ui-fill-tertiary)] disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
        <UserRound size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{account.name}</span>
          {account.userId === currentUserId ? <Badge tone="accent">{copy('youBadge')}</Badge> : null}
          {account.isOwner ? <Badge>{copy('ownerBadge')}</Badge> : null}
          {isLegacyAdmin(account) ? <Badge>{copy('legacyBadge')}</Badge> : null}
          {trusted ? <Badge>{copy(account.assigned ? 'assignedBadge' : 'defaultBadge')}</Badge> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-secondary)]">{summary(account)}</span>
      </span>
      {account.manageable ? <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-[color:var(--ui-text-tertiary)]" /> : null}
    </button>
  );

  if (!list) {
    return (
      <div className="dashboard-content-surface rounded-[1.5rem] p-5 text-sm text-[color:var(--ui-text-secondary)]" role="status">
        {loadFailure ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{copy(loadFailure)}</span>
            {loadFailure === 'loadError' ? (
              <button type="button" onClick={() => void load()} className="liquid-glass-selection inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold">
                {copy('retry')}
              </button>
            ) : null}
          </div>
        ) : (
          copy('loading')
        )}
      </div>
    );
  }

  const active = list.accounts.filter((account) => account.isActive);
  const disabled = list.accounts.filter((account) => !account.isActive);

  return (
    <div className="space-y-6 pb-6" data-people-access>
      <p className="px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{copy('note')}</p>

      {!trusted ? (
        <section className="dashboard-content-surface flex items-start gap-3 rounded-[1.5rem] p-5" role="status">
          <ShieldAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{copy('lockedTitle')}</h2>
            <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{copy('lockedBody')}</p>
          </div>
        </section>
      ) : null}

      <SettingsListGroup title={copy('accounts')} description={copy('accountsDescription')}>
        {active.map(row)}
      </SettingsListGroup>

      {disabled.length > 0 ? (
        <SettingsListGroup title={copy('disabledAccounts')} description={copy('disabledDescription')}>
          {disabled.map(row)}
        </SettingsListGroup>
      ) : null}

      <SettingsListGroup title={copy('danger')}>
        <button
          type="button"
          onClick={() => {
            setResetNotice(null);
            setIsResetOpen(true);
          }}
          className="flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ui-danger)_12%,transparent)] text-[color:var(--ui-danger)]">
            <RotateCcw size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[color:var(--ui-danger)]">{copy('reset')}</span>
            <span className="mt-0.5 block text-xs text-[color:var(--ui-text-secondary)]">{copy('resetDescription')}</span>
          </span>
        </button>
      </SettingsListGroup>
      {resetNotice ? (
        <p role="status" className="px-1 text-xs text-[color:var(--ui-text-secondary)]">
          {copy(resetNotice.key)}
        </p>
      ) : null}

      <GlassModal
        isOpen={Boolean(selected && draft)}
        onClose={close}
        title={selected?.name ?? ''}
        description={selected ? summary(selected) : undefined}
        size="md"
        closeLabel={copy('close')}
        dismissible={!saving}
        footer={
          selected && draft ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty ? (
                <span role="status" className="mr-auto text-xs font-medium text-[color:var(--ui-text-secondary)]">
                  {copy('unsaved')}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => (dirty ? setDraft(draftOf(selected)) : close())}
                disabled={saving}
                className="liquid-glass-control inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-45"
              >
                {copy(dirty ? 'cancel' : 'close')}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                aria-busy={saving || undefined}
                className="liquid-glass-selection inline-flex min-h-10 items-center rounded-full px-5 text-sm font-semibold disabled:opacity-45"
              >
                {copy(saving ? 'saving' : 'save')}
              </button>
            </div>
          ) : null
        }
      >
        {selected && draft ? (
          <div className="space-y-5">
            {notice ? (
              <div
                ref={noticeRef}
                tabIndex={-1}
                role={notice.tone === 'info' ? 'status' : 'alert'}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm outline-none ${
                  notice.tone === 'info'
                    ? 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
                    : 'bg-[color:color-mix(in_srgb,var(--ui-danger)_10%,transparent)] text-[color:var(--ui-text-primary)]'
                }`}
              >
                <span>{copy(notice.key)}</span>
                {notice.tone === 'conflict' ? (
                  <button type="button" onClick={() => void reloadAfterConflict()} className="liquid-glass-selection inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold">
                    {copy('reload')}
                  </button>
                ) : null}
              </div>
            ) : null}

            {selected.userId === currentUserId ? (
              <p className="text-xs leading-5 text-[color:var(--ui-text-secondary)]">{copy('selfNotice')}</p>
            ) : null}

            {isLegacyAdmin(selected) ? (
              <p role="status" className="rounded-[1.2rem] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-[color:var(--ui-text-primary)]">
                {copy('legacyAdmin')}
              </p>
            ) : null}

            <dl className="grid grid-cols-2 gap-2 text-xs">
              {(
                [
                  ['houseAccess', HOUSE_ACCESS_KEYS[draft.role]],
                  ['administration', administers(draft.role, selected) ? 'yes' : 'no'],
                ] as const
              ).map(([term, value]) => (
                <div key={term} className="rounded-[1rem] bg-[color:var(--ui-fill-tertiary)] px-3 py-2">
                  <dt className="text-[color:var(--ui-text-secondary)]">{copy(term)}</dt>
                  <dd className="font-semibold text-[color:var(--ui-text-primary)]">{copy(value)}</dd>
                </div>
              ))}
            </dl>

            <fieldset aria-labelledby={roleLegendId} disabled={saving}>
              <legend id={roleLegendId} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
                {copy('role')}
              </legend>
              <div className="divide-y divide-[color:var(--ui-separator)] overflow-hidden rounded-[1.2rem] border border-[color:var(--ui-border)]">
                {ASSIGNABLE_ROLES.filter((role) => role !== 'admin' || selected.isAdmin).map((role) => (
                  <label key={role} className="flex min-h-[3.25rem] cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-[color:var(--ui-fill-tertiary)]">
                    <input
                      type="radio"
                      name={`role-${selected.userId}`}
                      value={role}
                      checked={draft.role === role}
                      onChange={() => setDraft((current) => (current ? { ...current, role } : current))}
                      className="h-4 w-4 accent-[color:var(--ui-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">{copy(ROLE_KEYS[role])}</span>
                      <span className="block text-xs text-[color:var(--ui-text-secondary)]">{copy(ROLE_DESCRIPTION_KEYS[role])}</span>
                    </span>
                  </label>
                ))}
              </div>
              {selected.isAdmin ? null : (
                <p className="mt-2 text-xs text-[color:var(--ui-text-secondary)]">{copy('adminOnlyForHa')}</p>
              )}
            </fieldset>

            <fieldset aria-labelledby={grantsLegendId} disabled={saving || holdsPersonalGrants(draft.role)}>
              <legend id={grantsLegendId} className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
                {copy('grants')}
              </legend>
              <p className="mb-2 text-xs text-[color:var(--ui-text-secondary)]">
                {copy(draft.role === 'admin' ? 'grantsAdmin' : draft.role === 'resident' ? 'grantsResident' : 'grantsDescription')}
              </p>
              <div className="divide-y divide-[color:var(--ui-separator)] overflow-hidden rounded-[1.2rem] border border-[color:var(--ui-border)]">
                {PERSONAL_GRANTS.map((grant) => {
                  const [titleKey, descriptionKey] = GRANT_KEYS[grant];
                  const checked = holdsPersonalGrants(draft.role) || draft.grants.includes(grant);
                  return (
                    <div key={grant} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">{copy(titleKey)}</span>
                        <span className="block text-xs text-[color:var(--ui-text-secondary)]">{copy(descriptionKey)}</span>
                      </span>
                      <GlassToggle
                        checked={checked}
                        disabled={saving || holdsPersonalGrants(draft.role)}
                        label={copy(titleKey)}
                        onChange={(next) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  grants: next
                                    ? [...new Set([...current.grants, grant])].sort()
                                    : current.grants.filter((entry) => entry !== grant),
                                }
                              : current,
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {selected.assigned ? (
              <button
                type="button"
                onClick={restoreDefault}
                disabled={saving}
                className="flex w-full items-center gap-2 rounded-2xl px-1 py-2 text-left text-sm font-semibold text-[color:var(--ui-accent)] disabled:opacity-45"
              >
                <RotateCcw size={15} aria-hidden="true" />
                <span>
                  {copy('restoreDefault')}
                  <span className="block text-xs font-normal text-[color:var(--ui-text-secondary)]">
                    {copy('restoreDefaultDescription', { role: copy(selected.isAdmin ? 'roleAdmin' : 'roleMember') })}
                  </span>
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
      </GlassModal>

      <GlassModal
        isOpen={isResetOpen}
        onClose={() => (saving ? undefined : setIsResetOpen(false))}
        title={copy('resetTitle')}
        description={copy('resetBody')}
        variant="dialog"
        size="sm"
        closeLabel={copy('close')}
        dismissible={!saving}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {resetNotice?.tone === 'error' ? (
              <span role="alert" className="mr-auto text-xs text-[color:var(--ui-danger)]">
                {copy(resetNotice.key)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setIsResetOpen(false)}
              disabled={saving}
              className="liquid-glass-control inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-45"
            >
              {copy('cancel')}
            </button>
            <button
              type="button"
              onClick={() => void reset()}
              disabled={saving}
              aria-busy={saving || undefined}
              className="inline-flex min-h-10 items-center rounded-full bg-[color:var(--ui-danger)] px-4 text-sm font-semibold text-[color:var(--ui-danger-contrast)] disabled:opacity-45"
            >
              {copy('resetConfirm')}
            </button>
          </div>
        }
      />
    </div>
  );
}

export default PeopleAccessManager;
