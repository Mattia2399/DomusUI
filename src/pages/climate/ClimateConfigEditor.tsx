import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import type { HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { MockEntityStateMap } from '../../types/ha';
import type { ClimateEndpointRole, ClimateHouseConfig } from './climateModel';
import { type ClimateCallApi, type ClimateConfigResponse, saveClimateConfig } from '../../services/climateConfigClient';
import { newCircuit, newEndpoint, newGenerator, newZone, syncClimateLinks } from './climateConfigDraft';
import { ClimateBindingEditor } from './ClimateBindingEditor';
import { ClimateEntityPicker } from './ClimateEntityPicker';
import { useClimateConfigCopy } from './climateConfigCopy';
import { ClimateSectionHeading, MUTED, PANEL } from './ClimatePrimitives';

type Tab = 'zones' | 'devices' | 'circuits' | 'generators';
type ErrorKey = 'conflict' | 'invalid_config' | 'entity_missing' | 'entity_incompatible' | 'area_missing' | 'access_denied' | 'unavailable' | 'network' | 'cannotSave';
const FIELD = 'liquid-glass-control mt-1.5 min-h-11 w-full rounded-xl px-3 text-sm';

function errorKey(error: unknown): ErrorKey {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : '';
  if (['conflict', 'invalid_config', 'entity_missing', 'entity_incompatible', 'area_missing', 'access_denied'].includes(code)) return code as ErrorKey;
  if (code === 'store_unavailable') return 'unavailable';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('conflict')) return 'conflict';
  if (message.includes('invalid')) return 'invalid_config';
  if (message.includes('entity_missing')) return 'entity_missing';
  return 'network';
}

export function ClimateConfigEditor({ initialConfig, revision, callApi, areas, states, registry, onSaved, onCancel, onReload }: {
  initialConfig: ClimateHouseConfig; revision: number; callApi: ClimateCallApi; areas: readonly HaArea[];
  states: MockEntityStateMap; registry: readonly HaEntityRegistryEntry[];
  onSaved: (response: ClimateConfigResponse) => void; onCancel: () => void; onReload: () => void;
}) {
  const { t } = useClimateConfigCopy();
  const [draft, setDraft] = useState<ClimateHouseConfig>(() => structuredClone(initialConfig));
  const [tab, setTab] = useState<Tab>('zones');
  const [zoneId, setZoneId] = useState(initialConfig.zones[0]?.id ?? '');
  const [endpointId, setEndpointId] = useState('');
  const [circuitId, setCircuitId] = useState(initialConfig.circuits[0]?.id ?? '');
  const [generatorId, setGeneratorId] = useState(initialConfig.generators[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialConfig);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = t('leaveWarning'); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, t]);

  const edit = (change: (config: ClimateHouseConfig) => void) => {
    setDraft((current) => { const next = structuredClone(current); change(next); return syncClimateLinks(next); });
    setError(null);
  };
  const zone = draft.zones.find((item) => item.id === zoneId);
  const zoneEndpoints = draft.endpoints.filter((item) => item.zoneId === zoneId);
  const endpoint = draft.endpoints.find((item) => item.id === endpointId);
  const circuit = draft.circuits.find((item) => item.id === circuitId);
  const generator = draft.generators.find((item) => item.id === generatorId);
  const tabs: readonly { id: Tab; label: string }[] = [
    { id: 'zones', label: t('stepZones') }, { id: 'devices', label: t('stepDevices') },
    { id: 'circuits', label: t('stepCircuits') }, { id: 'generators', label: t('stepGenerators') },
  ];
  const addZone = () => { const item = newZone(); edit((config) => config.zones.push(item)); setZoneId(item.id); setTab('zones'); };
  const addEndpoint = () => { if (!zone) return; const item = newEndpoint(zone.id); edit((config) => config.endpoints.push(item)); setEndpointId(item.id); setTab('devices'); };
  const addCircuit = () => { const item = newCircuit(); edit((config) => config.circuits.push(item)); setCircuitId(item.id); setTab('circuits'); };
  const addGenerator = (kind: 'boiler' | 'thermostove') => { const item = newGenerator(kind); edit((config) => config.generators.push(item)); setGeneratorId(item.id); setTab('generators'); };
  const save = async () => {
    if (draft.zones.some((item) => !item.name.trim() || !item.reference.primaryEntityId) ||
        draft.endpoints.some((item) => !item.name.trim() || !item.entity.primaryEntityId) ||
        draft.circuits.some((item) => !item.name.trim()) || draft.generators.some((item) => !item.name.trim())) {
      setError('cannotSave'); return;
    }
    setBusy(true); setError(null);
    try { onSaved(await saveClimateConfig(callApi, draft, revision)); }
    catch (failure) { setError(errorKey(failure)); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6 pb-24">
    <ClimateSectionHeading eyebrow="DOMUS CLIMATE" title={t('configure')} detail={t('configuredDetail')} />
    <nav aria-label={t('configure')} className="flex gap-2 overflow-x-auto pb-1">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined} className={`liquid-glass-control min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold ${tab === item.id ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}>{item.label}</button>)}</nav>
    {error && <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-[color:var(--ui-text-primary)]">{t(error)}{error === 'conflict' && <button type="button" onClick={onReload} className="ml-3 underline">{t('reload')}</button>}</div>}
    <section className={`${PANEL} space-y-2 p-4 sm:p-5`} aria-label={t('physicalExecution')}>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={draft.physicalExecutionEnabled === true} onChange={(event) => edit((config) => { config.physicalExecutionEnabled = event.target.checked; })} />{t('physicalExecution')}</label>
      <p className={`text-xs ${MUTED}`}>{t('physicalExecutionWarning')}</p>
    </section>

    {tab === 'zones' && <section className="grid gap-4 lg:grid-cols-[15rem_1fr]"><div className={`${PANEL} space-y-2 p-3`}><h3 className="px-2 text-sm font-semibold">{t('zones')}</h3>{draft.zones.map((item) => <button key={item.id} type="button" onClick={() => setZoneId(item.id)} className={`block min-h-11 w-full rounded-xl px-3 text-left text-sm ${zoneId === item.id ? 'bg-[color:var(--ui-fill-tertiary)] font-semibold' : ''}`}>{item.name || t('zoneName')}</button>)}<button type="button" onClick={addZone} className="liquid-glass-control flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold"><Plus size={16} />{t('addZone')}</button></div>
      {zone ? <div className={`${PANEL} space-y-5 p-4 sm:p-5`}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{zone.name || t('zoneName')}</h3><button type="button" onClick={() => { edit((config) => { config.zones = config.zones.filter((item) => item.id !== zone.id); }); setZoneId(draft.zones.find((item) => item.id !== zone.id)?.id ?? ''); }} className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs text-[color:var(--ui-danger)]"><Trash2 size={15} />{t('removeZone')}</button></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className={`text-xs font-semibold ${MUTED}`}>{t('zoneName')}<input value={zone.name} onChange={(event) => edit((config) => { config.zones.find((item) => item.id === zone.id)!.name = event.target.value; })} className={FIELD} /></label><label className={`text-xs font-semibold ${MUTED}`}>{t('area')}<select value={zone.areaId ?? ''} onChange={(event) => edit((config) => { config.zones.find((item) => item.id === zone.id)!.areaId = event.target.value || null; })} className={FIELD}><option value="">{t('noArea')}</option>{areas.map((area) => <option key={area.area_id} value={area.area_id}>{area.name}</option>)}</select></label></div>
        <ClimateEntityPicker id={`${zone.id}-reference`} label={t('primary')} value={zone.reference.primaryEntityId} onChange={(entityId) => edit((config) => { config.zones.find((item) => item.id === zone.id)!.reference.primaryEntityId = entityId; })} filter="temperature" states={states} registry={registry} />
        <div className="rounded-2xl border border-[color:var(--ui-border)] p-3 text-xs"><label className="block font-semibold">{t('freshnessPolicy')}<select value={zone.reference.freshnessPolicy ?? 'none'} onChange={(event) => edit((config) => { const reference = config.zones.find((item) => item.id === zone.id)!.reference; reference.freshnessPolicy = event.target.value as 'none' | 'max_age'; if (reference.freshnessPolicy === 'max_age') reference.maxAgeSeconds = 300; else delete reference.maxAgeSeconds; })} className={FIELD}><option value="none">{t('freshnessNone')}</option><option value="max_age">{t('freshnessMaxAge')}</option></select></label>{zone.reference.freshnessPolicy === 'max_age' && <label className="mt-3 block font-semibold">{t('maxAgeSeconds')}<input type="number" min="30" max="86400" step="1" value={zone.reference.maxAgeSeconds ?? 300} onChange={(event) => edit((config) => { config.zones.find((item) => item.id === zone.id)!.reference.maxAgeSeconds = Number(event.target.value); })} className={FIELD} /></label>}<p className={`mt-2 ${MUTED}`}>{t('freshnessHint')}</p></div>
        <div className="space-y-2"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{t('fallbacks')}</h4><button type="button" onClick={() => edit((config) => { config.zones.find((item) => item.id === zone.id)!.reference.fallbacks.push(''); })} disabled={zone.reference.fallbacks.length >= 8} className="liquid-glass-control flex min-h-10 items-center gap-1 rounded-full px-3 text-xs"><Plus size={15} />{t('addFallback')}</button></div>{zone.reference.fallbacks.map((fallback, index) => <div key={`${zone.id}-fallback-${index}`} className="grid items-end gap-2 sm:grid-cols-[1fr_auto_auto_auto]"><ClimateEntityPicker id={`${zone.id}-fallback-${index}`} label={`${t('fallbacks')} ${index + 1}`} value={fallback} onChange={(entityId) => edit((config) => { config.zones.find((item) => item.id === zone.id)!.reference.fallbacks[index] = entityId; })} filter="temperature" states={states} registry={registry} /><button type="button" onClick={() => edit((config) => { const list = config.zones.find((item) => item.id === zone.id)!.reference.fallbacks; [list[index - 1], list[index]] = [list[index], list[index - 1]]; })} disabled={index === 0} aria-label={t('moveUp')} className="liquid-glass-control min-h-11 rounded-xl px-3"><ArrowUp size={16} /></button><button type="button" onClick={() => edit((config) => { const list = config.zones.find((item) => item.id === zone.id)!.reference.fallbacks; [list[index], list[index + 1]] = [list[index + 1], list[index]]; })} disabled={index === zone.reference.fallbacks.length - 1} aria-label={t('moveDown')} className="liquid-glass-control min-h-11 rounded-xl px-3"><ArrowDown size={16} /></button><button type="button" onClick={() => edit((config) => { config.zones.find((item) => item.id === zone.id)!.reference.fallbacks.splice(index, 1); })} aria-label={t('remove')} className="liquid-glass-control min-h-11 rounded-xl px-3"><Trash2 size={16} /></button></div>)}</div>
      </div> : <div className={`${PANEL} p-6 text-sm ${MUTED}`}>{t('noZones')}</div>}</section>}

    {tab === 'devices' && <section className="space-y-4"><div className={`${PANEL} flex flex-wrap items-center gap-3 p-4`}><label className="text-sm font-semibold">{t('zones')}<select value={zoneId} onChange={(event) => { setZoneId(event.target.value); setEndpointId(''); }} className={`${FIELD} min-w-48`}><option value="">{t('noZones')}</option>{draft.zones.map((item) => <option key={item.id} value={item.id}>{item.name || t('zoneName')}</option>)}</select></label><button type="button" onClick={addEndpoint} disabled={!zone} className="liquid-glass-control flex min-h-11 items-center gap-2 self-end rounded-full px-4 text-sm font-semibold"><Plus size={16} />{t('addEndpoint')}</button></div>
      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]"><div className={`${PANEL} space-y-1 p-3`}>{zoneEndpoints.map((item) => <button key={item.id} type="button" onClick={() => setEndpointId(item.id)} className={`block min-h-11 w-full rounded-xl px-3 text-left text-sm ${endpointId === item.id ? 'bg-[color:var(--ui-fill-tertiary)] font-semibold' : ''}`}>{item.name || t('endpointName')}</button>)}</div>
        {endpoint && endpoint.zoneId === zoneId && <div className={`${PANEL} space-y-5 p-4 sm:p-5`}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{endpoint.name || t('endpointName')}</h3><button type="button" onClick={() => { edit((config) => { config.endpoints = config.endpoints.filter((item) => item.id !== endpoint.id); }); setEndpointId(''); }} className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs text-[color:var(--ui-danger)]"><Trash2 size={15} />{t('remove')}</button></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className={`text-xs font-semibold ${MUTED}`}>{t('endpointName')}<input value={endpoint.name} onChange={(event) => edit((config) => { config.endpoints.find((item) => item.id === endpoint.id)!.name = event.target.value; })} className={FIELD} /></label><label className={`text-xs font-semibold ${MUTED}`}>{t('kind')}<select value={endpoint.kind} onChange={(event) => edit((config) => { const item = config.endpoints.find((entry) => entry.id === endpoint.id)!; item.kind = event.target.value as typeof item.kind; item.roles = item.kind === 'thermostatic_radiator_valve' ? ['radiator_trv', 'room_heater'] : ['room_heater', 'room_cooler']; item.circuitId = null; })} className={FIELD}><option value="air_conditioner">{t('ac')}</option><option value="thermostatic_radiator_valve">{t('trv')}</option><option value="other">{t('other')}</option></select></label></div>
          <div className="flex flex-wrap gap-3">{(['room_heater', 'room_cooler'] as ClimateEndpointRole[]).filter((role) => endpoint.kind !== 'thermostatic_radiator_valve' || role === 'room_heater').map((role) => <label key={role} className="liquid-glass-control flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm"><input type="checkbox" checked={endpoint.roles.includes(role)} onChange={(event) => edit((config) => { const item = config.endpoints.find((entry) => entry.id === endpoint.id)!; item.roles = event.target.checked ? [...item.roles, role] : item.roles.filter((entry) => entry !== role); })} />{t(role === 'room_heater' ? 'heat' : 'cool')}</label>)}{endpoint.kind === 'thermostatic_radiator_valve' && <span className="liquid-glass-control flex min-h-11 items-center rounded-xl px-3 text-sm">{t('radiatorRole')}</span>}</div>
          <div className="rounded-2xl border border-[color:var(--ui-border)] p-3 text-xs"><label className="block font-semibold">{t('executionOwnership')}<select value={endpoint.executionOwnership ?? 'observe_only'} onChange={(event) => edit((config) => { config.endpoints.find((item) => item.id === endpoint.id)!.executionOwnership = event.target.value as 'observe_only' | 'domus_supervised'; })} className={FIELD}><option value="observe_only">{t('observeOnly')}</option><option value="domus_supervised">{t('domusSupervised')}</option></select></label><p className={`mt-2 ${MUTED}`}>{t('ownershipHint')}</p></div>
          <ClimateBindingEditor id={endpoint.id} binding={endpoint.entity} onChange={(binding) => edit((config) => { config.endpoints.find((item) => item.id === endpoint.id)!.entity = binding; })} filter={endpoint.roles.includes('room_heater') && !endpoint.roles.includes('room_cooler') ? 'heat' : endpoint.roles.includes('room_cooler') && !endpoint.roles.includes('room_heater') ? 'cool' : 'climate'} states={states} registry={registry} />
          {endpoint.kind === 'thermostatic_radiator_valve' && <label className={`block text-xs font-semibold ${MUTED}`}>{t('circuits')}<select value={endpoint.circuitId ?? ''} onChange={(event) => edit((config) => { config.endpoints.find((item) => item.id === endpoint.id)!.circuitId = event.target.value || null; })} className={FIELD}><option value="">{t('noArea')}</option>{draft.circuits.map((item) => <option key={item.id} value={item.id}>{item.name || t('circuitName')}</option>)}</select></label>}
        </div>}</div></section>}

    {tab === 'circuits' && <section className="grid gap-4 lg:grid-cols-[15rem_1fr]"><div className={`${PANEL} space-y-2 p-3`}>{draft.circuits.map((item) => <button key={item.id} type="button" onClick={() => setCircuitId(item.id)} className={`block min-h-11 w-full rounded-xl px-3 text-left text-sm ${circuitId === item.id ? 'bg-[color:var(--ui-fill-tertiary)] font-semibold' : ''}`}>{item.name || t('circuitName')}</button>)}<button type="button" onClick={addCircuit} className="liquid-glass-control flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold"><Plus size={16} />{t('addCircuit')}</button></div>
      {circuit && <div className={`${PANEL} space-y-5 p-4 sm:p-5`}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{circuit.name || t('circuitName')}</h3><button type="button" onClick={() => { edit((config) => { config.circuits = config.circuits.filter((item) => item.id !== circuit.id); }); setCircuitId(''); }} className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs text-[color:var(--ui-danger)]"><Trash2 size={15} />{t('remove')}</button></div><label className={`block text-xs font-semibold ${MUTED}`}>{t('circuitName')}<input value={circuit.name} onChange={(event) => edit((config) => { config.circuits.find((item) => item.id === circuit.id)!.name = event.target.value; })} className={FIELD} /></label>
        <ClimateEntityPicker id={`${circuit.id}-controller`} label={t('controller')} value={circuit.controller?.primaryEntityId ?? ''} onChange={(entityId) => edit((config) => { config.circuits.find((item) => item.id === circuit.id)!.controller = entityId ? { primaryEntityId: entityId, relatedControls: [] } : null; })} filter="heat" states={states} registry={registry} />
        <div className="space-y-2"><h4 className="text-sm font-semibold">{t('linkedValves')}</h4>{draft.endpoints.filter((item) => item.roles.includes('radiator_trv')).map((item) => <label key={item.id} className="liquid-glass-control flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm"><input type="checkbox" checked={item.circuitId === circuit.id} onChange={(event) => edit((config) => { config.endpoints.find((entry) => entry.id === item.id)!.circuitId = event.target.checked ? circuit.id : null; })} />{item.name || item.entity.primaryEntityId}</label>)}</div>
        <p className={`text-xs ${MUTED}`}>{t('linkedGenerators')}: {draft.generators.filter((item) => item.circuitIds.includes(circuit.id)).map((item) => item.name).join(', ') || '—'}</p>
      </div>}</section>}

    {tab === 'generators' && <section className="grid gap-4 lg:grid-cols-[15rem_1fr]"><div className={`${PANEL} space-y-2 p-3`}>{draft.generators.map((item) => <button key={item.id} type="button" onClick={() => setGeneratorId(item.id)} className={`block min-h-11 w-full rounded-xl px-3 text-left text-sm ${generatorId === item.id ? 'bg-[color:var(--ui-fill-tertiary)] font-semibold' : ''}`}>{item.name || t(item.kind === 'boiler' ? 'boiler' : 'stove')}</button>)}<button type="button" onClick={() => addGenerator('boiler')} className="liquid-glass-control flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm"><Plus size={16} />{t('boiler')}</button><button type="button" onClick={() => addGenerator('thermostove')} className="liquid-glass-control flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm"><Plus size={16} />{t('stove')}</button></div>
      {generator && <div className={`${PANEL} space-y-5 p-4 sm:p-5`}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{generator.name || t('generatorName')}</h3><button type="button" onClick={() => { edit((config) => { config.generators = config.generators.filter((item) => item.id !== generator.id); }); setGeneratorId(''); }} className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs text-[color:var(--ui-danger)]"><Trash2 size={15} />{t('remove')}</button></div><label className={`block text-xs font-semibold ${MUTED}`}>{t('generatorName')}<input value={generator.name} onChange={(event) => edit((config) => { config.generators.find((item) => item.id === generator.id)!.name = event.target.value; })} className={FIELD} /></label>
        <p className={`text-sm ${MUTED}`}>{t(generator.kind === 'boiler' ? 'boiler' : 'stove')}</p>
        <div className="flex flex-wrap gap-3">{(['space_heating', 'domestic_hot_water'] as const).map((service) => <label key={service} className="liquid-glass-control flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm"><input type="checkbox" checked={generator.services.includes(service)} onChange={(event) => edit((config) => { const item = config.generators.find((entry) => entry.id === generator.id)!; item.services = event.target.checked ? [...item.services, service] : item.services.filter((entry) => entry !== service); })} />{t(service === 'space_heating' ? 'spaceHeating' : 'dhw')}</label>)}</div>
        <label className={`block text-xs font-semibold ${MUTED}`}>{t('waterSetpoint')}<select value={generator.setpointKind} disabled={generator.kind === 'thermostove'} onChange={(event) => edit((config) => { config.generators.find((item) => item.id === generator.id)!.setpointKind = event.target.value as typeof generator.setpointKind; })} className={FIELD}><option value="none">{t('noSetpoint')}</option><option value="generator_water_temperature">{t('waterSetpoint')}</option></select></label>
        <ClimateBindingEditor id={generator.id} binding={generator.entity} onChange={(binding) => edit((config) => { config.generators.find((item) => item.id === generator.id)!.entity = binding; })} filter={generator.setpointKind === 'generator_water_temperature' ? 'climate' : 'generator'} states={states} registry={registry} />
        <div className="space-y-2"><h4 className="text-sm font-semibold">{t('circuits')}</h4>{draft.circuits.map((item) => <label key={item.id} className="liquid-glass-control flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm"><input type="checkbox" checked={generator.circuitIds.includes(item.id)} onChange={(event) => edit((config) => { const current = config.generators.find((entry) => entry.id === generator.id)!; current.circuitIds = event.target.checked ? [...current.circuitIds, item.id] : current.circuitIds.filter((id) => id !== item.id); })} />{item.name || t('circuitName')}</label>)}</div>
      </div>}</section>}

    <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-bg-grouped)] p-3 shadow-xl backdrop-blur-2xl"><span className={`text-xs font-semibold ${MUTED}`}>{dirty ? t('draft') : t('configure')}</span><div className="flex gap-2"><button type="button" onClick={onCancel} disabled={busy} className="liquid-glass-control min-h-11 rounded-full px-4 text-sm font-semibold">{t('cancel')}</button><button type="button" onClick={save} disabled={!dirty || busy} className="liquid-glass-control min-h-11 rounded-full bg-[color:var(--ui-accent)] px-5 text-sm font-semibold text-white disabled:opacity-50">{t('save')}</button></div></div>
  </div>;
}
