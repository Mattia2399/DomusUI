import {
  Bug,
  ExternalLink,
  FileJson,
  HelpCircle,
  Lightbulb,
  LockKeyhole,
  MessagesSquare,
  ShieldAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import { useI18n } from '../../i18n/I18nProvider';

const REPOSITORY_URL = 'https://github.com/Mattia2399/DomusUI';

type SupportFeedbackSectionProps = {
  appVersion: string;
  haStatus: HaConnectionStatus;
  onDownloadDiagnostics: () => void;
  diagnosticsFeedback?: string;
};

type SupportLinkProps = {
  href: string;
  label: string;
  tone?: 'default' | 'danger';
};

function SupportLink({ href, label, tone = 'default' }: SupportLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition-[transform,background-color,border-color] active:scale-[0.98] ${
        tone === 'danger'
          ? 'border-rose-400/30 bg-rose-500/[0.08] text-rose-500 hover:bg-rose-500/[0.13]'
          : 'liquid-glass-selection border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-primary)]'
      }`}
    >
      {label}
      <ExternalLink size={15} aria-hidden="true" />
    </a>
  );
}

function ChannelCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: typeof Bug;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-content-surface flex min-h-[15rem] flex-col rounded-[1.5rem] p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
          <Icon size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-[color:var(--ui-text-primary)]">
            {title}
          </h2>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{description}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">{children}</div>
    </section>
  );
}

export default function SupportFeedbackSection({
  appVersion,
  haStatus,
  onDownloadDiagnostics,
  diagnosticsFeedback,
}: SupportFeedbackSectionProps) {
  const { t } = useI18n();
  const connectionLabel = haStatus === 'connected'
    ? t('settings.support.connected')
    : haStatus === 'connecting' || haStatus === 'reconnecting'
      ? t('settings.support.connecting')
      : haStatus === 'reauth_required'
        ? t('settings.support.reauth')
        : t('settings.support.disconnected');
  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="dashboard-content-surface relative overflow-hidden rounded-[1.65rem] p-5 sm:p-7">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[color:rgb(var(--ui-accent-rgb)/0.12)] blur-3xl"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
              {t('settings.support.publicBeta')}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em] sm:text-2xl">
              {t('settings.support.heroTitle')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
              {t('settings.support.heroDescription')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[15rem] sm:justify-end">
            <span className="inline-flex min-h-8 items-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">
              {t('settings.preview.version', { version: appVersion })}
            </span>
            <span className="inline-flex min-h-8 items-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">
              {connectionLabel}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <ChannelCard
          icon={Bug}
          eyebrow={t('settings.support.problems')}
          title={t('settings.support.reportBug')}
          description={t('settings.support.reportBugDescription')}
        >
          <SupportLink
            href={`${REPOSITORY_URL}/issues/new?template=bug_report.yml`}
            label={t('settings.support.openReport')}
          />
          <SupportLink href={`${REPOSITORY_URL}/issues`} label={t('settings.support.knownBugs')} />
        </ChannelCard>

        <ChannelCard
          icon={MessagesSquare}
          eyebrow={t('settings.support.community')}
          title={t('settings.support.ideasQuestions')}
          description={t('settings.support.ideasDescription')}
        >
          <SupportLink
            href={`${REPOSITORY_URL}/discussions/new?category=ideas`}
            label={t('settings.support.proposeIdea')}
          />
          <SupportLink
            href={`${REPOSITORY_URL}/discussions/new?category=q-a`}
            label={t('settings.support.askHelp')}
          />
        </ChannelCard>
      </div>

      <section className="dashboard-content-surface rounded-[1.5rem] p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)] lg:items-center">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
              <FileJson size={19} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">
                {t('settings.support.localDiagnostics')}
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em]">{t('settings.support.safeContext')}</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                {t('settings.support.diagnosticsDescription')}
              </p>
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4">
            <button
              type="button"
              onClick={onDownloadDiagnostics}
              className="liquid-glass-selection flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[color:var(--ui-border-strong)] px-4 text-sm font-semibold"
            >
              <FileJson size={16} aria-hidden="true" />
              {t('settings.advanced.downloadDiagnostics')}
            </button>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
              <LockKeyhole size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {t('settings.support.localDownload')}
            </p>
            {diagnosticsFeedback ? (
              <p role="status" className="mt-2 text-xs font-medium text-emerald-500">
                {diagnosticsFeedback}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/[0.055] p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-2xl items-start gap-3.5">
            <ShieldAlert size={21} className="mt-0.5 shrink-0 text-rose-500" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-[color:var(--ui-text-primary)]">{t('settings.support.securityIssue')}</h2>
              <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                {t('settings.support.securityDescription')}
              </p>
            </div>
          </div>
          <SupportLink
            href={`${REPOSITORY_URL}/security/advisories/new`}
            label={t('settings.support.reportPrivately')}
            tone="danger"
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-[color:var(--ui-text-secondary)]">
        <span className="inline-flex items-center gap-1.5"><HelpCircle size={14} /> {t('settings.support.publicTransparent')}</span>
        <span className="inline-flex items-center gap-1.5"><Lightbulb size={14} /> {t('settings.support.ideasFirst')}</span>
      </div>
    </div>
  );
}
