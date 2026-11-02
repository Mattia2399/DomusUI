import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import GlassDropdown, { type GlassDropdownOption } from '../ui/GlassDropdown';
import GlassToggle from '../ui/GlassToggle';
import GlassSlider from '../ui/GlassSlider';
import { useI18n } from '../../i18n/I18nProvider';
import { formatVacuumOption } from '../widgets/vacuumCardModel';
import type { VacuumRelatedEntityInfo } from '../widgets/vacuumDeviceModel';

/* A control or a reading that the integration of a robot adds beside the vacuum entity. */

export type VacuumRelatedEntityActionRequest = {
  entityId: string;
  action: 'toggle' | 'select' | 'number' | 'press';
  value?: string | number | boolean;
};

export function formatRelatedValue(entity: VacuumRelatedEntityInfo, unavailable: string) {
  const value = entity.stateLabel || entity.state || unavailable;
  return entity.unit && !value.endsWith(entity.unit) ? `${value} ${entity.unit}` : value;
}

export function RelatedControl({
  entity,
  onAction,
}: {
  entity: VacuumRelatedEntityInfo;
  onAction?: (request: VacuumRelatedEntityActionRequest) => boolean | void | Promise<boolean | void>;
}) {
  const { t } = useI18n();
  const [draftNumber, setDraftNumber] = useState(Number(entity.state) || entity.min || 0);
  useEffect(() => setDraftNumber(Number(entity.state) || entity.min || 0), [entity.entityId, entity.min, entity.state]);

  if (entity.domain === 'switch') {
    const enabled = entity.state === 'on';
    return (
      <div
        className="dashboard-content-surface flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left"
      >
        <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{entity.name}</span><span className="mt-0.5 block text-[11px] text-[color:var(--ui-text-tertiary)]">{enabled ? t('vacuum.related.active') : t('vacuum.related.inactive')}</span></span>
        <GlassToggle
          checked={enabled}
          label={entity.name}
          onChange={(checked) => onAction?.({ entityId: entity.entityId, action: 'toggle', value: checked })}
          size="compact"
          tone="accent"
        />
      </div>
    );
  }

  if (entity.domain === 'select' && entity.options?.length) {
    const options: GlassDropdownOption[] = entity.options.map((option) => ({ id: option, name: formatVacuumOption(option) }));
    const selected = options.find((option) => option.id === entity.state) ?? options[0] ?? null;
    return (
      <div className="dashboard-content-surface block rounded-2xl px-3 py-2.5">
        <span className="mb-2 block text-sm font-semibold text-[color:var(--ui-text-primary)]">{entity.name}</span>
        <GlassDropdown
          ariaLabel={entity.name}
          options={options}
          selected={selected}
          onChange={(option) => onAction?.({ entityId: entity.entityId, action: 'select', value: option.id })}
          size="compact"
        />
      </div>
    );
  }

  if (entity.domain === 'number' && entity.min !== undefined && entity.max !== undefined) {
    return (
      <label className="dashboard-content-surface block rounded-2xl px-3 py-2.5">
        <span className="flex items-center justify-between gap-3 text-sm font-semibold text-[color:var(--ui-text-primary)]"><span>{entity.name}</span><span className="text-xs text-[color:var(--ui-text-tertiary)]">{draftNumber}{entity.unit ?? ''}</span></span>
        <GlassSlider
          min={entity.min}
          max={entity.max}
          step={entity.step ?? 1}
          value={draftNumber}
          onChange={(event) => setDraftNumber(Number(event.target.value))}
          onPointerUp={() => onAction?.({ entityId: entity.entityId, action: 'number', value: draftNumber })}
          onKeyUp={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) onAction?.({ entityId: entity.entityId, action: 'number', value: draftNumber });
          }}
          className="mt-3"
          tone="accent"
          aria-label={entity.name}
        />
      </label>
    );
  }

  if (entity.domain === 'button') {
    return (
      <button type="button" onClick={() => onAction?.({ entityId: entity.entityId, action: 'press' })} className="glass-button flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-xs font-semibold text-[color:var(--ui-text-secondary)] transition">
        <RotateCcw size={14} /> {entity.name}
      </button>
    );
  }

  return (
    <div className="dashboard-content-surface min-w-0 rounded-2xl p-3">
      <p className="truncate text-[11px] font-medium text-[color:var(--ui-text-tertiary)]">{entity.name}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{formatRelatedValue(entity, t('vacuum.na'))}</p>
    </div>
  );
}
