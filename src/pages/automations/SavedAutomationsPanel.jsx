import React from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { buildTitle, formatDate } from './utils';
import { useI18n } from '../../i18n/I18nProvider';

export function SavedAutomationsPanel({
  records,
  connected,
  runningId,
  deletingId,
  onToggle,
  onEdit,
  onDelete,
  onRun,
}) {
  const { t, locale } = useI18n();
  return (
    <section className="rounded-[1.7rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] p-5 backdrop-blur-2xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('automations.saved.local')}</p>
          <h2 className="text-lg font-semibold text-[color:var(--ui-text-primary)]">{t('automations.saved.title')}</h2>
        </div>
        <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-1 text-xs text-[color:var(--ui-text-secondary)]">
          {records.length}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4 text-[color:var(--ui-text-tertiary)]">
          {t('automations.saved.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <motion.div
              key={record.id}
              layout
              className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4 transition-colors hover:bg-[color:var(--ui-fill-secondary)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                  {record.enabled ? t('automations.saved.active') : t('automations.saved.inactive')}
                </p>
                {record.haConfigId ? (
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--ui-success)]">
                    Home Assistant
                  </span>
                ) : (
                  <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--ui-text-secondary)]">
                    {t('automations.saved.localIndex')}
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-[color:var(--ui-text-primary)]">{record.name}</h3>
              <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">{buildTitle(record, locale)}</p>
              <p className="mt-2 text-xs text-[color:var(--ui-text-tertiary)]">
                {t('automations.saved.updated')}: {formatDate(record.updatedAt, locale)} | {t('automations.saved.lastRun')}:{' '}
                {formatDate(record.lastTriggeredAt, locale)}
              </p>
              {record.event?.triggerType === 'manual_event' ? (
                <p className="mt-1 text-xs text-[color:var(--ui-info)]">
                  {t('automations.saved.manualEvent')}: {record.manualEventType ?? t('automations.saved.notAvailable')}
                </p>
              ) : null}
              {record.event?.triggerType === 'time' && record.eventTime ? (
                <p className="mt-1 text-xs text-[color:var(--ui-info)]">
                  {t('automations.saved.scheduled')}: {record.eventTime}
                </p>
              ) : null}
              {record.haConfigId ? (
                <p className="mt-1 text-xs text-[color:var(--ui-success)]">
                  Config ID: {record.haConfigId} | Entity: {record.linkedHaEntityId ?? t('automations.saved.syncing')} | {t('automations.saved.haState')}:{' '}
                  {record.linkedHaState ?? t('automations.saved.notAvailable')} | {t('automations.saved.haLastTrigger')}:{' '}
                  {formatDate(record.linkedHaLastTriggered, locale)}
                </p>
              ) : null}
              {record.missingInHaSince ? (
                <p className="mt-1 text-xs text-[color:var(--ui-warning)]">
                  {t('automations.saved.waitingSync')}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!connected || !record.linkedHaEntityId}
                  onClick={() => onToggle(record)}
                  className="rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-2 text-xs text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {record.enabled ? t('automations.panel.disable') : t('automations.panel.enable')}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(record)}
                  className="rounded-xl border border-sky-300/25 bg-sky-400/12 px-3 py-2 text-xs text-[color:var(--ui-info)] hover:bg-sky-400/20"
                >
                  {t('automations.saved.edit')}
                </button>
                <button
                  type="button"
                  disabled={deletingId === record.id}
                  onClick={() => onDelete(record.id)}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-300/25 bg-rose-400/12 px-3 py-2 text-xs text-[color:var(--ui-danger)] hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  {deletingId === record.id ? t('automations.saved.deleting') : t('automations.saved.deleteHa')}
                </button>
                <button
                  type="button"
                  disabled={
                    !connected ||
                    !record.enabled ||
                    (record.event?.triggerType !== 'manual_event' && !record.linkedHaEntityId) ||
                    runningId === record.id
                  }
                  onClick={() => onRun(record)}
                  className="rounded-xl border border-emerald-300/25 bg-emerald-400/12 px-3 py-2 text-xs text-[color:var(--ui-success)] hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {runningId === record.id
                    ? t('automations.saved.running')
                    : record.event?.triggerType === 'manual_event'
                      ? t('automations.saved.sendTrigger')
                      : t('automations.saved.run')}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

export default SavedAutomationsPanel;
