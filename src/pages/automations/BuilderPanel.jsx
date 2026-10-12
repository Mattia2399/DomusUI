import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Clock3, Info, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { IconGlyph } from './IconGlyph';
import GlassSegmentSelect from '../../components/ui/GlassSegmentSelect';
import { useI18n } from '../../i18n/I18nProvider';

function cn(...values) {
  return twMerge(clsx(values));
}

function NarrativePill({ value, placeholder, onClick }) {
  return (
    <motion.button
      layout
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-3 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] px-5 py-2.5 text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-fill-primary)]"
    >
      {value ? <IconGlyph name={value.icon} size={20} className="text-[color:var(--ui-text-secondary)]" /> : null}
      <span className={cn('text-base lg:text-xl', value ? 'text-[color:var(--ui-text-primary)]' : 'text-[color:var(--ui-text-secondary)]')}>
        {value ? value.label : placeholder}
      </span>
      <ChevronDown size={18} className="text-[color:var(--ui-text-tertiary)]" />
    </motion.button>
  );
}

function SequenceTimerPill({ label, value, onChange, onClear }) {
  const { t } = useI18n();
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] px-4 py-2 text-[color:var(--ui-text-primary)]">
      <Clock3 size={15} className="text-[color:var(--ui-text-secondary)]" />
      <span className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
        {label}
      </span>
      <input
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(eventInput) =>
          onChange(Math.max(0, Number.parseInt(eventInput.target.value || '0', 10) || 0))
        }
        className="w-20 rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2 py-1 text-sm text-[color:var(--ui-text-primary)] focus:border-emerald-300/45 focus:outline-none"
      />
      <span className="text-xs text-[color:var(--ui-text-secondary)]">s</span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] transition-colors hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]"
        aria-label={t('automations.builder.removeTimer')}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function BuilderPanel({
  automationName,
  onAutomationNameChange,
  event,
  eventTime,
  onEventTimeChange,
  conditions,
  conditionLogic,
  onConditionLogicChange,
  onOpenConditionMenuAt,
  onAddCondition,
  onRemoveCondition,
  onClearConditions,
  action,
  showCondition,
  onOpenEventMenu,
  onOpenActionMenu,
  onShowCondition,
  eventPersistenceSeconds,
  onEventPersistenceSecondsChange,
  conditionPersistenceSeconds,
  onConditionPersistenceSecondsChange,
  actionDelaySeconds,
  onActionDelaySecondsChange,
  narrativePreview,
  canSave,
  onSave,
  onReset,
  editingId,
  onCancelEdit,
  connected,
  isSaving,
  saveError,
}) {
  const { t } = useI18n();
  const safeConditions = Array.isArray(conditions) ? conditions : [];
  const eventSupportsPersistence =
    event?.triggerType === 'state' || event?.triggerConfig?.trigger === 'state';
  const mainActionButtonClass = cn(
    'flex-1 rounded-[2rem] border px-8 py-4 text-base font-semibold transition-all bg-[color:var(--ui-fill-secondary)] backdrop-blur-2xl',
    'border-emerald-300/45 text-[color:var(--ui-success)] shadow-[0_0_0_1px_rgba(110,231,183,0.22),0_0_32px_rgba(16,185,129,0.32)] hover:bg-emerald-400/18',
    'disabled:cursor-not-allowed disabled:opacity-50',
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="relative flex min-h-[360px] flex-col items-start justify-center gap-5 overflow-hidden rounded-[2rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] p-8 lg:p-10 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_24px_64px_rgba(0,0,0,0.4)]">
        <div className="pointer-events-none absolute -left-32 -top-44 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative z-10 w-full space-y-4">
          <div className="inline-flex rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">
            {t('automations.builder.engine')}
          </div>
          <div>
            <label htmlFor="automation-name" className="mb-2 block text-xs uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]">
              {t('automations.builder.name')}
            </label>
            <input
              id="automation-name"
              value={automationName}
              onChange={(eventInput) => onAutomationNameChange(eventInput.target.value)}
              placeholder={t('automations.builder.namePlaceholder')}
              className="w-full rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-5 py-3 text-[color:var(--ui-text-primary)] placeholder:text-[color:var(--ui-text-disabled)] focus:border-emerald-300/45 focus:outline-none"
            />
          </div>

          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--ui-success)]">
                {t('automations.builder.sentence')}
              </p>
              <span
                title={
                  connected
                    ? t('automations.builder.directSave')
                    : t('automations.builder.connectionNeeded')
                }
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/12 text-[color:var(--ui-success)]"
                aria-label={t('automations.builder.saveInfo')}
              >
                <Info size={12} />
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--ui-text-primary)]">
              {narrativePreview}
            </p>
          </div>
          {saveError ? (
            <p className="rounded-xl border border-rose-300/30 bg-rose-500/12 px-4 py-3 text-sm text-[color:var(--ui-danger)]">
              {saveError}
            </p>
          ) : null}
        </div>

        <motion.div
          layout
          className="relative z-10 flex w-full flex-col gap-4 text-xl font-medium tracking-tight lg:text-3xl"
        >
          <motion.div layout className="flex flex-wrap items-center gap-4">
            <span className="text-xl font-bold uppercase tracking-widest text-[color:var(--ui-text-tertiary)]">{t('automations.builder.when')}</span>
            <NarrativePill value={event} placeholder={t('automations.builder.selectEvent')} onClick={onOpenEventMenu} />
            {eventSupportsPersistence && eventPersistenceSeconds > 0 ? (
              <SequenceTimerPill
                label={t('automations.builder.atLeast')}
                value={eventPersistenceSeconds}
                onChange={onEventPersistenceSecondsChange}
                onClear={() => onEventPersistenceSecondsChange(0)}
              />
            ) : null}
          </motion.div>
          {eventSupportsPersistence && eventPersistenceSeconds === 0 ? (
            <motion.button
              layout
              type="button"
              onClick={() => onEventPersistenceSecondsChange(30)}
              className="inline-flex items-center gap-1 text-sm text-[color:var(--ui-text-tertiary)] transition-colors hover:text-[color:var(--ui-text-primary)]"
            >
              <Plus size={14} />
              {t('automations.builder.addAtLeast')}
            </motion.button>
          ) : null}
          {event?.triggerType === 'time' ? (
            <motion.div layout className="ml-2 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-4 py-3">
              <label className="block text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                {t('automations.builder.time')}
              </label>
              <input
                type="time"
                value={eventTime}
                onChange={(eventInput) => onEventTimeChange(eventInput.target.value)}
                className="mt-2 w-full rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-2 text-base text-[color:var(--ui-text-primary)] focus:border-emerald-300/45 focus:outline-none"
              />
            </motion.div>
          ) : null}
          {event?.triggerType === 'manual_event' ? (
            <motion.p layout className="ml-2 text-sm text-[color:var(--ui-text-secondary)]">
              {t('automations.builder.manualHelp')}
            </motion.p>
          ) : null}
          {event?.triggerConfig?.trigger === 'event' && event?.triggerType !== 'manual_event' ? (
            <motion.p layout className="ml-2 text-sm text-[color:var(--ui-text-secondary)]">
              {t('automations.builder.customHelp')}
            </motion.p>
          ) : null}

          <AnimatePresence initial={false} mode="popLayout">
            {!showCondition ? (
              <motion.button
                key="show-condition"
                layout
                type="button"
                onClick={onShowCondition}
                className="mt-2 mb-2 inline-flex items-center gap-1 text-sm text-[color:var(--ui-text-tertiary)] transition-colors hover:text-[color:var(--ui-text-primary)]"
              >
                <Plus size={16} />
                {t('automations.builder.addOnlyIf')}
              </motion.button>
            ) : (
              <motion.div key="condition" layout className="flex w-full flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <GlassSegmentSelect
                    ariaLabel={t('automations.builder.conditionLogic')}
                    className="min-w-[9rem] flex-1"
                    options={[
                      { value: 'and', label: 'AND' },
                      { value: 'or', label: 'OR' },
                    ]}
                    value={conditionLogic}
                    onChange={onConditionLogicChange}
                    optionClassName="h-auto py-1 uppercase tracking-[0.14em]"
                  />
                  <button
                    type="button"
                    onClick={onClearConditions}
                    className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-2 text-xs uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)] transition-colors hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]"
                  >
                    {t('automations.builder.removeBlock')}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {safeConditions.map((conditionItem, index) => (
                    <React.Fragment key={`${conditionItem.id}-${index}`}>
                      <span className="text-sm font-bold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                        {index === 0
                          ? t('automations.builder.onlyIf')
                          : conditionLogic === 'and'
                            ? t('automations.builder.andIf')
                            : t('automations.builder.orIf')}
                      </span>
                      <div className="flex items-center gap-2">
                        <NarrativePill
                          value={conditionItem}
                          placeholder={t('automations.builder.selectCondition')}
                          onClick={() => onOpenConditionMenuAt(index)}
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveCondition(index)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] transition-colors hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]"
                          aria-label={t('automations.builder.removeCondition')}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </React.Fragment>
                  ))}
                  {safeConditions.length > 0 && conditionPersistenceSeconds > 0 ? (
                    <SequenceTimerPill
                      label={t('automations.builder.validFor')}
                      value={conditionPersistenceSeconds}
                      onChange={onConditionPersistenceSecondsChange}
                      onClear={() => onConditionPersistenceSecondsChange(0)}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={onAddCondition}
                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-4 py-2 text-sm text-[color:var(--ui-text-secondary)] transition-colors hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]"
                  >
                    <Plus size={14} />
                    {t('automations.builder.addOnlyIf')}
                  </button>
                </div>
                {safeConditions.length > 0 && conditionPersistenceSeconds === 0 ? (
                  <button
                    type="button"
                    onClick={() => onConditionPersistenceSecondsChange(30)}
                    className="inline-flex items-center gap-1 text-sm text-[color:var(--ui-text-tertiary)] transition-colors hover:text-[color:var(--ui-text-primary)]"
                  >
                    <Plus size={14} />
                    {t('automations.builder.addValidFor')}
                  </button>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout className="flex flex-wrap items-center gap-4">
            <span className="text-xl font-bold uppercase tracking-widest text-[color:var(--ui-text-tertiary)]">{t('automations.builder.then')}</span>
            <NarrativePill value={action} placeholder={t('automations.builder.selectAction')} onClick={onOpenActionMenu} />
            {actionDelaySeconds > 0 ? (
              <SequenceTimerPill
                label={t('automations.builder.after')}
                value={actionDelaySeconds}
                onChange={onActionDelaySecondsChange}
                onClear={() => onActionDelaySecondsChange(0)}
              />
            ) : null}
          </motion.div>
          {actionDelaySeconds === 0 ? (
            <motion.button
              layout
              type="button"
              onClick={() => onActionDelaySecondsChange(10)}
              className="inline-flex items-center gap-1 text-sm text-[color:var(--ui-text-tertiary)] transition-colors hover:text-[color:var(--ui-text-primary)]"
            >
              <Plus size={14} />
              {t('automations.builder.addAfter')}
            </motion.button>
          ) : null}
        </motion.div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave}
          onClick={onSave}
          className={mainActionButtonClass}
        >
          {isSaving
            ? t('automations.builder.saving')
            : editingId
              ? t('automations.builder.updateHa')
              : t('automations.builder.saveHa')}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={onReset}
          className={mainActionButtonClass}
        >
          {t('automations.builder.reset')}
        </button>
        {editingId ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-6 py-3 text-sm text-[color:var(--ui-text-secondary)] transition-colors hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]"
          >
            {t('automations.builder.cancelEdit')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default BuilderPanel;
