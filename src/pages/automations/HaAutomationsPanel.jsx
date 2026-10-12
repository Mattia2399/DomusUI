import React from 'react';
import { formatDate } from './utils';
import { useI18n } from '../../i18n/I18nProvider';

export function HaAutomationsPanel({
  records,
  connected,
  runningHaId,
  onTrigger,
  onToggle,
}) {
  const { t, locale } = useI18n();
  return (
    <section className="rounded-[1.7rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] p-5 backdrop-blur-2xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('automations.panel.backend')}</p>
          <h2 className="text-lg font-semibold text-[color:var(--ui-text-primary)]">{t('automations.panel.haTitle')}</h2>
        </div>
        <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-1 text-xs text-[color:var(--ui-text-secondary)]">
          {records.length}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4 text-[color:var(--ui-text-tertiary)]">
          {t('automations.panel.haEmpty')}
        </p>
      ) : (
        <div className="space-y-3">
          {records.map((item) => (
            <div
              key={item.entityId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4 transition-colors hover:bg-[color:var(--ui-fill-secondary)]"
            >
              <div>
                <p className="text-sm font-medium text-[color:var(--ui-text-primary)]">{item.name}</p>
                <p className="mt-1 text-xs text-[color:var(--ui-text-tertiary)]">
                  {item.entityId} | {t('automations.panel.state')}: {item.state} | {t('automations.panel.lastTrigger')}:{' '}
                  {formatDate(item.lastTriggered, locale)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!connected || runningHaId === `trigger-${item.entityId}`}
                  onClick={() => onTrigger(item.entityId)}
                  className="rounded-xl border border-emerald-300/25 bg-emerald-400/12 px-3 py-2 text-xs text-[color:var(--ui-success)] hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {runningHaId === `trigger-${item.entityId}` ? t('automations.panel.triggering') : t('automations.panel.trigger')}
                </button>
                <button
                  type="button"
                  disabled={!connected || runningHaId === `toggle-${item.entityId}`}
                  onClick={() => onToggle(item.entityId, item.state)}
                  className="rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-2 text-xs text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {runningHaId === `toggle-${item.entityId}`
                    ? t('automations.panel.updating')
                    : item.state === 'on'
                      ? t('automations.panel.disable')
                      : t('automations.panel.enable')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default HaAutomationsPanel;
