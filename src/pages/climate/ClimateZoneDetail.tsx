import { useState } from 'react';
import { Clock3, Fan, Flame, Radio, Snowflake, Thermometer, TriangleAlert, type LucideIcon } from 'lucide-react';
import GlassModal from '../../components/ui/GlassModal';
import { GlassSegmentSelect } from '../../components/ui/GlassSegmentSelect';
import { DEMO_CLIMATE_SYSTEM, type DemoZoneView } from './climatePreviewData';
import { useClimateCopy, type ClimateCopyKey } from './climateCopy';
import { ZONE_NAME_KEY } from './ClimateZoneCard';
import { ClimateInfoRow, ClimateSectionHeading, MUTED, PANEL } from './ClimatePrimitives';

type MappingRole = 'heating' | 'cooling' | 'alternative';

function DetailBody({ view }: { view: DemoZoneView }) {
  const { c, temperature } = useClimateCopy();
  const endpoints = DEMO_CLIMATE_SYSTEM.endpoints.filter((endpoint) => view.zone.endpointIds.includes(endpoint.id));
  const valve = endpoints.find((endpoint) => endpoint.kind === 'thermostatic_radiator_valve');
  const ac = endpoints.find((endpoint) => endpoint.kind === 'air_conditioner');
  const [zoneMode, setZoneMode] = useState<'house' | 'manual'>('house');
  const [reference, setReference] = useState<'sensor' | 'trv' | 'ac' | 'none'>(view.zone.referenceTemperatureEntityId ? 'sensor' : 'none');
  const [mapping, setMapping] = useState<Record<MappingRole, string>>({
    heating: valve?.id ?? '', cooling: ac?.id ?? '', alternative: ac?.capabilities.includes('heat') ? ac.id : '',
  });
  const [override, setOverride] = useState<'next' | '1h' | '2h' | 'custom' | ''>(view.status === 'override' ? 'custom' : '');
  const [customTime, setCustomTime] = useState(view.nextTime ?? '23:00');
  const [overrideTarget, setOverrideTarget] = useState(view.status === 'override' ? 22.5 : (view.zone.target?.celsius ?? 20) + 1);
  const name = c(ZONE_NAME_KEY[view.zone.id]);
  const mappingRows: { id: MappingRole; label: ClimateCopyKey; icon: LucideIcon; kind: 'thermostatic_radiator_valve' | 'air_conditioner' }[] = [
    { id: 'heating', label: 'heatingDevice', icon: Flame, kind: 'thermostatic_radiator_valve' },
    { id: 'cooling', label: 'coolingDevice', icon: Snowflake, kind: 'air_conditioner' },
    { id: 'alternative', label: 'alternativeHeating', icon: Fan, kind: 'air_conditioner' },
  ];
  const overrideDescription = override === 'custom' ? c('overrideUntil', { time: customTime })
    : override === 'next' ? c('overrideNext') : override === '1h' ? c('overrideOneHour')
      : override === '2h' ? c('overrideTwoHours') : c('overrideAction');

  return <div className="space-y-6 pb-2">
    {view.status === 'offline' && <div role="status" className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300"><TriangleAlert className="shrink-0" size={20} /><div><strong className="text-sm">{c('offline')}</strong><p className="mt-1 text-xs leading-5">{c('offlineDetail')}</p></div></div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`${PANEL} p-5`}><p className={`text-xs ${MUTED}`}>{c('current')}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.05em] tabular-nums text-[color:var(--ui-text-primary)]">{view.currentCelsius === undefined ? '—' : temperature(view.currentCelsius)}</p></div>
      <div className={`${PANEL} p-5`}><p className={`text-xs ${MUTED}`}>{c('roomTarget')}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.05em] tabular-nums text-[color:var(--ui-text-primary)]">{view.zone.target ? temperature(view.zone.target.celsius) : '—'}</p></div>
    </div>

    <section className="space-y-3"><ClimateSectionHeading title={c('zoneMode')} detail={c('manualZoneDetail')} />
      <GlassSegmentSelect<'house' | 'manual'> ariaLabel={c('zoneMode')} value={zoneMode} onChange={setZoneMode} options={[{ value: 'house', label: c('followsHouse') }, { value: 'manual', label: c('manualZone') }]} />
    </section>

    <section className="space-y-3"><ClimateSectionHeading title={c('temperatureReference')} detail={c('temperatureReferenceDetail')} />
      <div className={`${PANEL} overflow-hidden`}>
        {view.zone.referenceTemperatureEntityId ? <label className="flex min-h-16 cursor-pointer items-center gap-3 border-b border-[color:var(--ui-separator)] px-4 py-3"><input type="radio" name={`reference-${view.zone.id}`} checked={reference === 'sensor'} onChange={() => setReference('sensor')} className="h-4 w-4 accent-[color:var(--ui-accent)]" /><Thermometer size={18} aria-hidden="true" /><span className="min-w-0 flex-1 text-sm font-medium">{c('sensor')} · {name}<span className={`block break-all text-xs ${MUTED}`}>{view.zone.referenceTemperatureEntityId}</span></span></label> : <ClimateInfoRow label={c('temperatureReference')} value={c('notSelected')} icon={Thermometer} />}
        {([['trv', 'trvFallback', Radio, valve], ['ac', 'acFallback', Fan, ac]] as const).map(([id, key, Icon, endpoint]) => <label key={id} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-[color:var(--ui-separator)] px-4 py-3 last:border-b-0"><input type="radio" name={`reference-${view.zone.id}`} value={id} checked={reference === id} onChange={() => setReference(id)} disabled={!endpoint} className="h-4 w-4 accent-[color:var(--ui-accent)]" /><Icon size={18} aria-hidden="true" className={MUTED} /><span className={`text-sm ${MUTED}`}>{c(key)}{endpoint && <span className="block text-xs">{c(id)} · {c(ZONE_NAME_KEY[endpoint.zoneId])}</span>}</span></label>)}
      </div>
    </section>

    <section className="space-y-3"><ClimateSectionHeading title={c('deviceMapping')} detail={c('deviceMappingDetail')} />
      <div className={`${PANEL} overflow-hidden`}>
        {mappingRows.map(({ id, label, icon: Icon, kind }) => {
          const selected = DEMO_CLIMATE_SYSTEM.endpoints.find((endpoint) => endpoint.id === mapping[id]);
          const choices = DEMO_CLIMATE_SYSTEM.endpoints.filter((endpoint) => endpoint.kind === kind && (id !== 'alternative' || endpoint.capabilities.includes('heat')));
          return <div key={id} className="flex min-h-16 items-start gap-3 border-b border-[color:var(--ui-separator)] px-4 py-3 last:border-b-0"><Icon size={19} className={`mt-2 shrink-0 ${MUTED}`} aria-hidden="true" /><div className="min-w-0 flex-1"><label htmlFor={`mapping-${view.zone.id}-${id}`} className={`block text-xs ${MUTED}`}>{c(label)}</label><select id={`mapping-${view.zone.id}-${id}`} value={mapping[id]} onChange={(event) => setMapping((previous) => ({ ...previous, [id]: event.target.value }))} className="liquid-glass-control mt-1 min-h-11 w-full rounded-xl px-3 text-sm font-semibold"><option value="">{c('noDevice')}</option>{choices.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{c(endpoint.kind === 'air_conditioner' ? 'airConditioner' : 'trv')} · {c(ZONE_NAME_KEY[endpoint.zoneId])}</option>)}</select>{selected && <details className={`mt-1 text-xs ${MUTED}`}><summary className="cursor-pointer">{c('technicalId')}</summary><code className="break-all">{selected.entity.primaryEntityId}</code></details>}</div></div>;
        })}
      </div>
    </section>

    <section className="space-y-3"><ClimateSectionHeading title={c('roomProgram')} />
      <div className={`${PANEL} overflow-hidden`}><ClimateInfoRow label={c('profile')} value={view.zone.profileId ? c(view.zone.profileId as ClimateCopyKey) : c('planned')} icon={Clock3} /><ClimateInfoRow label={c('nextChange')} value={view.nextTime ? c('nextAt', { time: view.nextTime }) : c('missingSchedule')} icon={Clock3} /></div>
    </section>

    <section className="space-y-3"><ClimateSectionHeading title={c('override')} detail={c('manualZoneDetail')} />
      <div className={`${PANEL} space-y-4 p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><span className={`text-sm ${MUTED}`}>{overrideDescription}</span><label className="flex items-center gap-2 text-sm font-medium text-[color:var(--ui-text-primary)]">{c('roomTarget')}<input type="number" min="5" max="35" step="0.5" value={overrideTarget} onChange={(event) => setOverrideTarget(Number(event.target.value))} className="liquid-glass-control h-11 w-20 rounded-xl px-2 text-center tabular-nums" />°C</label></div>
        <div className="flex flex-wrap gap-2">{([['next', 'overrideNext'], ['1h', 'overrideOneHour'], ['2h', 'overrideTwoHours'], ['custom', 'overrideCustom']] as const).map(([value, key]) => <button key={value} type="button" onClick={() => setOverride(value)} aria-pressed={override === value} className={`liquid-glass-control min-h-11 rounded-full px-3 text-xs font-semibold ${override === value ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}>{c(key)}</button>)}
          {override && <button type="button" onClick={() => setOverride('')} className="min-h-11 rounded-full px-3 text-xs font-semibold text-[color:var(--ui-danger)]">{c('overrideCancel')}</button>}</div>
        {override === 'custom' && <input type="time" aria-label={c('overrideCustom')} value={customTime} onChange={(event) => setCustomTime(event.target.value)} className="liquid-glass-control min-h-11 rounded-xl px-3 text-sm" />}
      </div>
    </section>
  </div>;
}

export function ClimateZoneDetail({ view, onClose }: { view: DemoZoneView | null; onClose: () => void }) {
  const { c } = useClimateCopy();
  return <GlassModal isOpen={view !== null} onClose={onClose} title={view ? c(ZONE_NAME_KEY[view.zone.id]) : c('zoneDetail')} description={c('previewBanner')} variant="responsive" size="xl">
    {view && <DetailBody key={view.zone.id} view={view} />}
  </GlassModal>;
}
