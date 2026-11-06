import { useMemo, useState } from 'react';
import type { HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { MockEntityStateMap } from '../../types/ha';
import { useClimateConfigCopy } from './climateConfigCopy';
import { MUTED } from './ClimatePrimitives';

const LIMIT = 60;
const TEMPERATURE_UNITS = new Set(['°C', '°F', 'K']);

export type EntityFilter = 'temperature' | 'humidity' | 'climate' | 'actuator' | 'heat' | 'cool' | 'related' | 'generator';

function compatible(id: string, state: MockEntityStateMap[string], filter: EntityFilter): boolean {
  const domain = id.split('.', 1)[0];
  const attrs = state.rawAttributes ?? {};
  if (filter === 'related') return ['select', 'number', 'input_number', 'switch', 'input_boolean', 'sensor', 'binary_sensor', 'valve'].includes(domain);
  if (filter === 'actuator') return ['climate', 'switch', 'valve', 'input_boolean'].includes(domain);
  if (filter === 'humidity') return domain === 'climate' && typeof attrs.current_humidity === 'number' ||
    domain === 'sensor' && (attrs.device_class === 'humidity' || attrs.unit_of_measurement === '%');
  if (filter === 'temperature') return domain === 'climate' && typeof attrs.current_temperature === 'number' ||
    domain === 'sensor' && (attrs.device_class === 'temperature' || TEMPERATURE_UNITS.has(String(attrs.unit_of_measurement ?? state.unit)));
  if (filter === 'generator') return ['climate', 'switch', 'input_boolean'].includes(domain);
  if (domain !== 'climate') return false;
  const modes = state.hvacModes ?? (Array.isArray(attrs.hvac_modes) ? attrs.hvac_modes : []);
  if (filter === 'heat') return modes.includes('heat') || modes.includes('heat_cool');
  if (filter === 'cool') return modes.includes('cool') || modes.includes('heat_cool');
  return true;
}

export function ClimateEntityPicker({ id, label, value, onChange, filter, states, registry, allowEmpty = true }: {
  id: string; label: string; value: string; onChange: (entityId: string) => void; filter: EntityFilter;
  states: MockEntityStateMap; registry: readonly HaEntityRegistryEntry[]; allowEmpty?: boolean;
}) {
  const { t } = useClimateConfigCopy();
  const [search, setSearch] = useState('');
  const names = useMemo(() => new Map(registry.map((item) => [item.entityId, item.name || item.originalName])), [registry]);
  const labelFor = (entityId: string) => names.get(entityId) || String(states[entityId]?.rawAttributes?.friendly_name ?? entityId);
  const matches = useMemo(() => Object.entries(states)
    .filter(([entityId, state]) => compatible(entityId, state, filter))
    .filter(([entityId]) => `${labelFor(entityId)} ${entityId}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort(([a], [b]) => labelFor(a).localeCompare(labelFor(b)))
    .slice(0, LIMIT), [states, filter, search, names]);
  const selected = states[value];
  const attrs = selected?.rawAttributes ?? {};
  const modes = selected?.hvacModes ?? (Array.isArray(attrs.hvac_modes) ? attrs.hvac_modes : []);
  const range = attrs.min_temp !== undefined && attrs.max_temp !== undefined ? `${attrs.min_temp}–${attrs.max_temp} °C` : '—';
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className={`block text-xs font-semibold ${MUTED}`}>{label}</label>
    <input aria-label={`${label}: ${t('search')}`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search')} className="liquid-glass-control min-h-10 w-full rounded-xl px-3 text-sm" />
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="liquid-glass-control min-h-11 w-full rounded-xl px-3 text-sm font-medium">
      {allowEmpty && <option value="">{t('noEntity')}</option>}
      {value && !matches.some(([entityId]) => entityId === value) && <option value={value}>{labelFor(value)}</option>}
      {matches.map(([entityId]) => <option key={entityId} value={entityId}>{labelFor(entityId)}</option>)}
    </select>
    {value && <p className={`break-all text-[11px] ${MUTED}`}>{t('entitySecondary')}: {value}</p>}
    {selected && value.startsWith('climate.') && <p className={`text-[11px] leading-5 ${MUTED}`}>{t('capabilities', { modes: modes.join(', ') || '—', features: String(selected.supportedFeatures ?? attrs.supported_features ?? '—'), range, step: String(selected.targetTempStep ?? attrs.target_temp_step ?? '—') })}</p>}
    {selected && value.startsWith('climate.') && <p className={`text-[11px] leading-5 ${MUTED}`}>{t('extraModes', { fan: Array.isArray(attrs.fan_modes) ? attrs.fan_modes.join(', ') || '—' : '—', swing: Array.isArray(attrs.swing_modes) ? attrs.swing_modes.join(', ') || '—' : '—', preset: Array.isArray(attrs.preset_modes) ? attrs.preset_modes.join(', ') || '—' : '—' })}</p>}
    {matches.length === LIMIT && <p className={`text-[11px] ${MUTED}`}>{t('results')}</p>}
  </div>;
}
