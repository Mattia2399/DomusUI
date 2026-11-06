import { Plus, Trash2 } from 'lucide-react';
import type { HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { MockEntityStateMap } from '../../types/ha';
import type { ClimateBindingConfig } from './climateModel';
import { ClimateEntityPicker, type EntityFilter } from './ClimateEntityPicker';
import { useClimateConfigCopy } from './climateConfigCopy';
import { MUTED } from './ClimatePrimitives';

export function ClimateBindingEditor({ id, binding, onChange, filter, states, registry }: {
  id: string; binding: ClimateBindingConfig; onChange: (value: ClimateBindingConfig) => void; filter: EntityFilter;
  states: MockEntityStateMap; registry: readonly HaEntityRegistryEntry[];
}) {
  const { t } = useClimateConfigCopy();
  const updateRelated = (index: number, patch: Partial<ClimateBindingConfig['relatedControls'][number]>) => onChange({
    ...binding, relatedControls: binding.relatedControls.map((control, i) => i === index ? { ...control, ...patch } : control),
  });
  return <div className="space-y-4">
    <ClimateEntityPicker id={`${id}-primary`} label={t('entity')} value={binding.primaryEntityId ?? ''} onChange={(entityId) => onChange({ ...binding, primaryEntityId: entityId || null })} filter={filter} states={states} registry={registry} />
    <div className="space-y-3"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{t('related')}</h4><button type="button" onClick={() => onChange({ ...binding, relatedControls: [...binding.relatedControls, { entityId: '', type: 'select', role: 'other' }] })} disabled={binding.relatedControls.length >= 16} className="liquid-glass-control flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold"><Plus size={15} />{t('addRelated')}</button></div>
      {binding.relatedControls.map((control, index) => <div key={`${id}-related-${index}`} className="grid gap-2 rounded-2xl border border-[color:var(--ui-border)] p-3 sm:grid-cols-[1fr_8rem_auto]">
        <ClimateEntityPicker id={`${id}-related-${index}`} label={t('entity')} value={control.entityId} onChange={(entityId) => updateRelated(index, { entityId, type: entityId.split('.', 1)[0] as typeof control.type })} filter="related" states={states} registry={registry} />
        <label className={`block text-xs font-semibold ${MUTED}`}>{t('role')}<input value={control.role} onChange={(event) => updateRelated(index, { role: event.target.value })} placeholder={t('roleHint')} className="liquid-glass-control mt-1.5 min-h-11 w-full rounded-xl px-3 text-sm" /></label>
        <button type="button" onClick={() => onChange({ ...binding, relatedControls: binding.relatedControls.filter((_, i) => i !== index) })} aria-label={`${t('remove')} ${control.entityId || t('related')}`} className="liquid-glass-control min-h-11 self-end rounded-xl px-3"><Trash2 size={16} /></button>
      </div>)}
    </div>
  </div>;
}
