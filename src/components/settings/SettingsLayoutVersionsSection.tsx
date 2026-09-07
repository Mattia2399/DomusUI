import { useMemo, useState } from 'react';
import {
  Clock3,
  CheckCircle2,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useDashboardSecurity } from '../../security/dashboardAccess';
import { useSensitiveActionGate } from '../../security/SensitiveActionGate';
import { useI18n } from '../../i18n/I18nProvider';
import {
  summarizeDashboardRevision,
  type DashboardRevisionHistoryStatus,
  type DashboardRevisionRecord,
  type DashboardRevisionSummary,
} from '../../services/dashboardRevisionHistory';
import type { DashboardLayoutSaveResult } from '../../services/dashboardStorage';
import type { ProfileHouseMember } from './settingsHouseAccessModel';

export type SettingsLayoutVersionsSectionProps = {
  revisions: DashboardRevisionRecord[];
  status: DashboardRevisionHistoryStatus;
  houseMembers: ProfileHouseMember[];
  onRefresh: () => Promise<boolean>;
  onRestore: (revision: number) => Promise<DashboardLayoutSaveResult>;
};

type Translate = ReturnType<typeof useI18n>['t'];

function formatRevisionDate(value: string, locale: string, t: Translate) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t('settings.versions.dateUnavailable');
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  if (isToday) return t('settings.versions.today', { time });
  if (isYesterday) return t('settings.versions.yesterday', { time });
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function summaryParts(summary: DashboardRevisionSummary | null, t: Translate) {
  if (!summary) return [t('settings.versions.first')];
  const parts: string[] = [];
  if (summary.addedWidgets) parts.push(t('settings.versions.added', { count: summary.addedWidgets }));
  if (summary.removedWidgets) parts.push(t('settings.versions.removed', { count: summary.removedWidgets }));
  if (summary.changedWidgets) parts.push(t('settings.versions.changed', { count: summary.changedWidgets }));
  if (summary.movedWidgets) parts.push(t('settings.versions.moved', { count: summary.movedWidgets }));
  if (summary.changedSections) parts.push(t('settings.versions.sectionsChanged', { count: summary.changedSections }));
  if (summary.changedBreakpoints.length) parts.push(t('settings.versions.layout', { breakpoints: summary.changedBreakpoints.join(', ').toUpperCase() }));
  return parts.length ? parts : [t('settings.versions.configurationUpdate')];
}

function hasSummaryChanges(summary: DashboardRevisionSummary) {
  return summary.addedWidgets > 0 ||
    summary.removedWidgets > 0 ||
    summary.changedWidgets > 0 ||
    summary.movedWidgets > 0 ||
    summary.changedSections > 0 ||
    summary.changedBreakpoints.length > 0;
}

function errorMessage(result: DashboardLayoutSaveResult, t: Translate) {
  if (result.ok === true) return '';
  if (result.code === 'server_conflict') return t('settings.versions.errorConflict');
  if (result.code === 'server_unauthorized') return t('settings.versions.errorUnauthorized');
  if (result.code === 'server_unsupported') return t('settings.versions.errorUnsupported');
  return t('settings.versions.errorGeneric');
}

export function SettingsLayoutVersionsSection({
  revisions,
  status,
  houseMembers,
  onRefresh,
  onRestore,
}: SettingsLayoutVersionsSectionProps) {
  const { locale, t } = useI18n();
  const security = useDashboardSecurity();
  const sensitiveGate = useSensitiveActionGate();
  const [busyRevision, setBusyRevision] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);
  const authorNames = useMemo(() => new Map(
    houseMembers.flatMap((member) => {
      const ids = [member.id, member.userId].filter((id): id is string => Boolean(id));
      return ids.map((id) => [id, member.name] as const);
    }),
  ), [houseMembers]);
  const rows = revisions.map((revision, index) => ({
    revision,
    summary: index < revisions.length - 1
      ? summarizeDashboardRevision(revisions[index + 1].dashboard, revision.dashboard)
      : null,
  }));
  const currentRow = rows[0] ?? null;
  const restorableRows = rows.slice(1);

  const restore = async (revision: DashboardRevisionRecord) => {
    if (!security.can('restore_backup') || busyRevision !== null) return;
    const authorized = await sensitiveGate.authorize({
      action: 'restore_backup',
      capability: 'restore_backup',
      title: t('settings.versions.restorePrompt', { revision: revision.revision }),
      description: t('settings.versions.restoreDescription'),
    });
    if (!authorized) return;
    setBusyRevision(revision.revision);
    setFeedback(null);
    const result = await onRestore(revision.revision);
    setBusyRevision(null);
    setFeedback({
      message: result.ok
        ? t('settings.versions.restored', { revision: revision.revision })
        : errorMessage(result, t),
      success: result.ok,
    });
  };

  if (status === 'loading' && revisions.length === 0) {
    return (
      <section className="dashboard-content-surface flex min-h-52 items-center justify-center rounded-[1.5rem] p-6">
        <div className="text-center text-[color:var(--ui-text-secondary)]">
          <LoaderCircle size={24} className="mx-auto animate-spin" />
          <p className="mt-3 text-sm font-medium">{t('settings.versions.loading')}</p>
        </div>
      </section>
    );
  }

  if ((status === 'error' || status === 'offline' || status === 'unsupported') && revisions.length === 0) {
    return (
      <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
        <History size={22} className="text-[color:var(--ui-text-secondary)]" />
        <h2 className="mt-3 text-base font-semibold">{t('settings.versions.unavailable')}</h2>
        <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
          {status === 'offline'
            ? t('settings.versions.offline')
            : status === 'unsupported'
              ? t('settings.versions.unsupported')
              : t('settings.versions.invalidArchive')}
        </p>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="liquid-glass-control mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
        >
          <RefreshCw size={16} />
          {t('settings.versions.retry')}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs leading-5 text-[color:var(--ui-text-secondary)]">
          {t('settings.versions.retention')}
        </p>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={status === 'loading' || busyRevision !== null}
          aria-label={t('settings.versions.refresh')}
          className="liquid-glass-control flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
        >
          <RefreshCw size={16} className={status === 'loading' ? 'animate-spin' : ''} />
        </button>
      </div>

      {currentRow ? (() => {
        const { revision, summary } = currentRow;
        const parts = summaryParts(summary, t);
        const author = authorNames.get(revision.createdByUserId) || t('settings.versions.haUser');
        return (
          <div>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-tertiary)]">
              {t('settings.versions.currentVersion')}
            </p>
            <article className="relative overflow-hidden rounded-[1.5rem] border border-[color:rgb(var(--ui-accent-rgb)/0.38)] bg-[linear-gradient(135deg,rgb(var(--ui-accent-rgb)/0.16),var(--ui-surface-glass-soft)_58%)] p-5 shadow-[0_18px_44px_var(--ui-shadow-soft),inset_0_1px_0_rgb(255_255_255/0.12)] backdrop-blur-2xl sm:p-6">
              <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-[color:rgb(var(--ui-accent-rgb)/0.14)] blur-3xl" />
              <div className="relative flex items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[color:rgb(var(--ui-accent-rgb)/0.24)] bg-[color:rgb(var(--ui-accent-rgb)/0.16)] text-[color:var(--ui-accent)] shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]">
                  <CheckCircle2 size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{t('settings.versions.version', { revision: revision.revision })}</h2>
                    <span className="rounded-full border border-[color:rgb(var(--ui-accent-rgb)/0.22)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ui-accent)]">
                      {t('settings.versions.current')}
                    </span>
                    {revision.source === 'rollback' ? (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ui-text-tertiary)]">
                        {t('settings.versions.rollback', { revision: revision.restoredFromRevision ?? '' })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">
                    {formatRevisionDate(revision.createdAt, locale, t)} · {author}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                    {parts.slice(0, 3).join(' · ')}
                  </p>
                  {summary?.changedBreakpoints.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {summary.changedBreakpoints.map((breakpoint) => (
                        <span
                          key={breakpoint}
                          className="rounded-full border border-[color:rgb(var(--ui-accent-rgb)/0.2)] bg-[color:rgb(var(--ui-accent-rgb)/0.1)] px-2 py-1 text-[10px] font-semibold uppercase text-[color:var(--ui-text-secondary)]"
                        >
                          {breakpoint}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          </div>
        );
      })() : null}

      <div>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-tertiary)]">
            {t('settings.versions.availableToRestore')}
          </p>
          {restorableRows.length ? (
            <span className="text-[11px] font-medium text-[color:var(--ui-text-tertiary)]">
              {t('settings.versions.count', { count: restorableRows.length })}
            </span>
          ) : null}
        </div>

        {restorableRows.length ? (
          <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] shadow-[0_16px_38px_var(--ui-shadow-soft)] backdrop-blur-2xl">
            {restorableRows.map(({ revision, summary }, index) => {
              const matchesCurrent = revisions[0]
                ? !hasSummaryChanges(summarizeDashboardRevision(revision.dashboard, revisions[0].dashboard))
                : false;
              const parts = summaryParts(summary, t);
              const author = authorNames.get(revision.createdByUserId) || t('settings.versions.haUser');
              return (
                <article
                  key={revision.revision}
                  className={`p-4 sm:p-5 ${index ? 'border-t border-[color:var(--ui-separator)]' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
                      <Clock3 size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 className="text-sm font-semibold">{t('settings.versions.version', { revision: revision.revision })}</h2>
                        {revision.source === 'rollback' ? (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ui-text-tertiary)]">
                            {t('settings.versions.rollback', { revision: revision.restoredFromRevision ?? '' })}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">
                        {formatRevisionDate(revision.createdAt, locale, t)} · {author}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                        {parts.slice(0, 3).join(' · ')}
                      </p>
                      {summary?.changedBreakpoints.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {summary.changedBreakpoints.map((breakpoint) => (
                            <span
                              key={breakpoint}
                              className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] px-2 py-1 text-[10px] font-semibold uppercase text-[color:var(--ui-text-secondary)]"
                            >
                              {breakpoint}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {matchesCurrent ? (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ui-text-tertiary)]">
                        {t('settings.versions.alreadyApplied')}
                      </span>
                    ) : security.can('restore_backup') ? (
                      <button
                        type="button"
                        onClick={() => void restore(revision)}
                        disabled={busyRevision !== null}
                        className="liquid-glass-control inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold disabled:opacity-50"
                      >
                        {busyRevision === revision.revision
                          ? <LoaderCircle size={15} className="animate-spin" />
                          : <RotateCcw size={15} />}
                        <span className="hidden sm:inline">{t('settings.versions.restore')}</span>
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] px-5 py-6 text-center">
            <History size={20} className="mx-auto text-[color:var(--ui-text-tertiary)]" />
            <p className="mt-2 text-sm font-medium">{t('settings.versions.noPrevious')}</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--ui-text-tertiary)]">
              {t('settings.versions.noPreviousDescription')}
            </p>
          </div>
        )}
      </div>

      {feedback ? (
        <p role="status" className={`px-1 text-xs font-medium ${feedback.success ? 'text-emerald-500' : 'text-rose-500'}`}>
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}

export default SettingsLayoutVersionsSection;
