import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

export function AiComposerPanel() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] p-6 backdrop-blur-2xl">
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-emerald-400/12 blur-3xl" />

      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">
              <Sparkles size={12} className="text-[color:var(--ui-info)]" />
              {t('automations.ai.label')}
            </div>
            <h3 className="mt-3 text-xl font-semibold text-[color:var(--ui-text-primary)]">{t('automations.ai.title')}</h3>
            <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">
              {t('automations.ai.description')}
            </p>
          </div>
          <span className="rounded-full border border-amber-300/25 bg-amber-400/12 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--ui-warning)]">
            {t('automations.ai.comingSoon')}
          </span>
        </div>

        <textarea
          disabled
          placeholder={t('automations.ai.placeholder')}
          className="liquid-glass-card mt-4 h-24 w-full resize-none px-4 py-3 text-sm text-[color:var(--ui-text-secondary)] placeholder:text-[color:var(--ui-text-disabled)] disabled:cursor-not-allowed disabled:opacity-70"
        />

        <button
          type="button"
          disabled
          className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-4 py-2 text-sm text-[color:var(--ui-text-secondary)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Lock size={14} />
          {t('automations.ai.generate')}
        </button>
      </div>
    </section>
  );
}

export default AiComposerPanel;
