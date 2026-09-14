import clsx from 'clsx';
import {
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  History,
  Pause,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';

export type IrrigationActivityItemModel = {
  id: string;
  zoneName: string;
  state: string;
  reason: string;
  source: string;
  occurredAt: number;
};

type ActivityPresentation = {
  icon: LucideIcon;
  titleKey: 'irrigation.activity.completed' | 'irrigation.activity.interrupted' | 'irrigation.activity.failed' | 'irrigation.activity.skipped';
  descriptionKey: 'irrigation.activity.reason.completed' | 'irrigation.activity.reason.stopped' | 'irrigation.activity.reason.restart' | 'irrigation.activity.reason.rain' | 'irrigation.activity.reason.unavailable' | 'irrigation.activity.reason.permission' | 'irrigation.activity.reason.paused' | 'irrigation.activity.reason.removed' | 'irrigation.activity.reason.generic';
  tone: 'success' | 'warning' | 'danger' | 'neutral';
};

function getPresentation(item: IrrigationActivityItemModel): ActivityPresentation {
  const reason = item.reason.toLowerCase();
  if (item.state === 'failed') {
    return { icon: CircleAlert, titleKey: 'irrigation.activity.failed', descriptionKey: reason.includes('unavailable') || reason.includes('confirm') ? 'irrigation.activity.reason.unavailable' : 'irrigation.activity.reason.generic', tone: 'danger' };
  }
  if (item.state === 'interrupted') {
    return { icon: RefreshCw, titleKey: 'irrigation.activity.interrupted', descriptionKey: reason.includes('restart') || reason.includes('unload') ? 'irrigation.activity.reason.restart' : 'irrigation.activity.reason.generic', tone: 'warning' };
  }
  if (item.state === 'skipped') {
    const descriptionKey = reason.includes('rain')
      ? 'irrigation.activity.reason.rain'
      : reason.includes('permission') || reason.includes('user_missing')
        ? 'irrigation.activity.reason.permission'
        : reason.includes('paused')
          ? 'irrigation.activity.reason.paused'
          : 'irrigation.activity.reason.generic';
    return { icon: Ban, titleKey: 'irrigation.activity.skipped', descriptionKey, tone: 'neutral' };
  }
  const descriptionKey = reason.includes('deadline')
    ? 'irrigation.activity.reason.completed'
    : reason.includes('stop') || reason.includes('closed_externally')
      ? 'irrigation.activity.reason.stopped'
      : reason.includes('rain')
        ? 'irrigation.activity.reason.rain'
        : reason.includes('removed')
          ? 'irrigation.activity.reason.removed'
          : 'irrigation.activity.reason.completed';
  return { icon: reason.includes('stop') ? Pause : Check, titleKey: 'irrigation.activity.completed', descriptionKey, tone: 'success' };
}

const toneClasses = {
  success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  warning: 'bg-amber-500/14 text-amber-600 dark:text-amber-300',
  danger: 'bg-rose-500/14 text-rose-600 dark:text-rose-300',
  neutral: 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)]',
} as const;

function ActivityRow({ item, compact = false }: { item: IrrigationActivityItemModel; compact?: boolean }) {
  const { formatDate, t } = useI18n();
  const presentation = getPresentation(item);
  const Icon = presentation.icon;
  const validDate = Number.isFinite(item.occurredAt);
  const sourceKey = item.source === 'schedule'
    ? 'irrigation.activity.source.schedule'
    : item.source === 'service'
      ? 'irrigation.activity.source.service'
      : 'irrigation.activity.source.manual';

  return (
    <div className={clsx('flex min-w-0 items-center gap-3', compact ? 'py-2' : 'rounded-[1.15rem] bg-[color:var(--ui-fill-tertiary)] p-3.5')}>
      <span className={clsx('flex shrink-0 items-center justify-center rounded-full', compact ? 'h-9 w-9' : 'h-10 w-10', toneClasses[presentation.tone])}>
        <Icon className="h-4 w-4" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-xs font-semibold text-[color:var(--ui-text-primary)] sm:text-sm">{item.zoneName}</span>
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ui-text-tertiary)]">{t(sourceKey)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-[color:var(--ui-text-secondary)] sm:text-[11px]">
          {t(presentation.titleKey)} · {t(presentation.descriptionKey)}
        </span>
      </span>
      <time className="shrink-0 text-right text-[9px] font-medium leading-4 text-[color:var(--ui-text-tertiary)]" dateTime={validDate ? new Date(item.occurredAt).toISOString() : undefined}>
        {validDate ? formatDate(item.occurredAt, { day: '2-digit', month: 'short' }) : '—'}
        {validDate ? <span className="block">{formatDate(item.occurredAt, { hour: '2-digit', minute: '2-digit' })}</span> : null}
      </time>
    </div>
  );
}

export function IrrigationActivitySnapshotCard({ items, onOpen }: { items: IrrigationActivityItemModel[]; onOpen: () => void }) {
  const { t } = useI18n();
  const visibleItems = items.slice(0, 3);
  return (
    <section className="rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] sm:p-5">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 text-left" aria-label={t('irrigation.activity.open')}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ui-fill-secondary)] text-[color:var(--app-workspace-accent)]"><History className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.activity.eyebrow')}</span><span className="mt-0.5 block text-lg font-semibold tracking-[-0.035em]">{t('irrigation.activity.recent')}</span></span>
        <ChevronRight className="h-4 w-4 text-[color:var(--ui-text-tertiary)]" />
      </button>
      {visibleItems.length ? (
        <div className="mt-3 grid divide-y divide-[color:var(--ui-separator)] lg:grid-cols-3 lg:gap-3 lg:divide-y-0">{visibleItems.map((item) => <ActivityRow key={item.id} item={item} compact />)}</div>
      ) : (
        <p className="mt-3 rounded-[1rem] bg-[color:var(--ui-fill-tertiary)] px-3 py-4 text-xs text-[color:var(--ui-text-secondary)]">{t('irrigation.activity.empty')}</p>
      )}
    </section>
  );
}

export default function IrrigationActivityPage({ items }: { items: IrrigationActivityItemModel[] }) {
  const { t } = useI18n();
  return (
    <section className="rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] sm:p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ui-separator)] pb-4">
        <div><p className="text-sm font-semibold">{t('irrigation.activity.log')}</p><p className="mt-1 text-[11px] text-[color:var(--ui-text-secondary)]">{t('irrigation.activity.retention')}</p></div>
        <span className="rounded-full bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">{items.length}</span>
      </div>
      {items.length ? <div className="mt-4 grid gap-2.5 lg:grid-cols-2">{items.map((item) => <ActivityRow key={item.id} item={item} />)}</div> : <div className="flex min-h-52 flex-col items-center justify-center text-center"><History className="h-7 w-7 text-[color:var(--ui-text-tertiary)]" /><p className="mt-3 text-sm font-semibold">{t('irrigation.activity.empty')}</p><p className="mt-1 max-w-sm text-xs leading-5 text-[color:var(--ui-text-secondary)]">{t('irrigation.activity.emptyDescription')}</p></div>}
    </section>
  );
}
