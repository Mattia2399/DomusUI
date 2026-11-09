import { ArrowDown, Fan, Flame, Gauge, Radio, Thermometer, Waves, Zap } from 'lucide-react';
import { GlassSegmentSelect } from '../../components/ui/GlassSegmentSelect';
import type { ClimateSeason } from './climateModel';
import { DEMO_CLIMATE_SYSTEM } from './climatePreviewData';
import { useClimateCopy } from './climateCopy';
import { ClimateIcon, ClimateInfoRow, ClimateSectionHeading, MUTED, PANEL } from './ClimatePrimitives';

function FlowStep({ icon, title, detail }: { icon: typeof Flame; title: string; detail: string }) {
  return <div className={`${PANEL} flex min-h-20 w-full items-center gap-3 px-4 py-3`}><ClimateIcon icon={icon} /><div className="min-w-0"><strong className="block text-sm text-[color:var(--ui-text-primary)]">{title}</strong><span className={`text-xs leading-5 ${MUTED}`}>{detail}</span></div></div>;
}

export function ClimateSources({ season, source, onSource, generator, onGenerator }: {
  season: ClimateSeason;
  source: 'radiators' | 'air_conditioners';
  onSource: (value: 'radiators' | 'air_conditioners') => void;
  generator: 'boiler' | 'thermostove';
  onGenerator: (value: 'boiler' | 'thermostove') => void;
}) {
  const { c, temperature } = useClimateCopy();
  const stove = DEMO_CLIMATE_SYSTEM.generators.find((item) => item.kind === 'thermostove');
  const waterTarget = stove?.setpointKind === 'generator_water_temperature' ? stove.waterTarget?.celsius : undefined;
  const flowArrow = <ArrowDown size={16} className="mx-auto text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />;

  return <div className="space-y-8">
    <section className="space-y-4"><ClimateSectionHeading eyebrow={c('plant')} title={c('sourceSelect')} detail={c('strategyFuture')} />
      <div className={`${PANEL} space-y-4 p-4 sm:p-5`}><GlassSegmentSelect<'radiators' | 'air_conditioners' | 'automatic'> ariaLabel={c('sourceSelect')} value={source} onChange={(value) => { if (value !== 'automatic') onSource(value); }} options={[{ value: 'radiators', label: c('radiators') }, { value: 'air_conditioners', label: c('airConditioners') }, { value: 'automatic', label: c('automaticFuture'), disabled: true }]} className="w-full" /><p className={`text-xs ${MUTED}`}>{c('previewDetail')}</p></div>
    </section>

    <section className="space-y-4"><ClimateSectionHeading title={c('circuitTitle')} detail={c('circuitDetail')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className={`${PANEL} p-4 sm:p-5`}><div className="mx-auto max-w-md space-y-2">
          <FlowStep icon={Thermometer} title={c('zones')} detail={`${c('zone.bedroom')} · ${c('zone.bath')}`} />{flowArrow}
          <FlowStep icon={Radio} title={c('valves')} detail={c('trv')} />{flowArrow}
          <FlowStep icon={Flame} title={c('demand')} detail={season === 'heating' ? c('demandCount') : c('demandNone')} />{flowArrow}
          <FlowStep icon={Gauge} title={c('controller')} detail={c('corridor')} />{flowArrow}
          <FlowStep icon={Zap} title={c('generators')} detail={`${c('boiler')} · ${c('thermostove')}`} />
        </div></div>
        <div className="space-y-4"><div className={`${PANEL} overflow-hidden`}><ClimateInfoRow label={c('controller')} value={c('corridor')} detail={c('controllerDetail')} icon={Gauge} /><ClimateInfoRow label={c('demand')} value={season === 'heating' ? c('demandCount') : c('demandNone')} icon={Flame} /></div>
          <div className={`${PANEL} space-y-3 p-4`}><h3 className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{c('generatorSelect')}</h3><GlassSegmentSelect<'boiler' | 'thermostove' | 'automatic'> ariaLabel={c('generatorSelect')} value={generator} onChange={(value) => { if (value !== 'automatic') onGenerator(value); }} options={[{ value: 'boiler', label: c('boiler') }, { value: 'thermostove', label: c('thermostove') }, { value: 'automatic', label: c('automaticFuture'), disabled: true }]} disabled={source !== 'radiators'} /><p className={`text-xs leading-5 ${MUTED}`}>{c('strategyFuture')}</p></div>
        </div>
      </div>
    </section>

    <section className="space-y-4"><ClimateSectionHeading title={c('generators')} detail={c('generatorsDetail')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <article className={`${PANEL} space-y-4 p-5 ${source === 'radiators' && generator === 'boiler' ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}><div className="flex items-center gap-3"><ClimateIcon icon={Flame} /><div><h3 className="font-semibold text-[color:var(--ui-text-primary)]">{c('boiler')}</h3><p className={`text-xs ${MUTED}`}>{c('spaceHeating')}</p></div></div><div className="rounded-2xl bg-[color:var(--ui-fill-tertiary)] p-4 text-sm text-[color:var(--ui-text-secondary)]">{c('circuitTitle')}</div></article>
        <article className={`${PANEL} space-y-4 p-5 ${source === 'radiators' && generator === 'thermostove' ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}><div className="flex items-center gap-3"><ClimateIcon icon={Waves} tone="cool" /><div><h3 className="font-semibold text-[color:var(--ui-text-primary)]">{c('thermostove')}</h3><p className={`text-xs ${MUTED}`}>{c('circuitTitle')}</p></div></div>
          <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-2xl bg-orange-500/10 p-3"><Flame size={16} className="text-orange-500" aria-hidden="true" /><p className="mt-2 text-xs font-semibold text-[color:var(--ui-text-primary)]">{c('spaceHeating')}</p></div><div className="rounded-2xl bg-sky-500/10 p-3"><Waves size={16} className="text-sky-500" aria-hidden="true" /><p className="mt-2 text-xs font-semibold text-[color:var(--ui-text-primary)]">{c('dhw')}</p></div></div>
          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4"><div className="flex items-end justify-between gap-2"><div><p className={`text-xs ${MUTED}`}>{c('waterSetpoint')}</p><p className="mt-1 text-3xl font-semibold tracking-[-0.05em] tabular-nums text-[color:var(--ui-text-primary)]">{waterTarget === undefined ? '—' : temperature(waterTarget)}</p></div><Thermometer size={22} className="text-sky-500" aria-hidden="true" /></div><p className={`mt-2 text-xs leading-5 ${MUTED}`}>{c('waterWarning')}</p></div>
          <div className="space-y-2 border-t border-[color:var(--ui-separator)] pt-4"><h4 className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{c('deviceControls')}</h4><p className={`text-xs ${MUTED}`}>{c('deviceControlsDetail')}</p><div className="flex flex-wrap gap-2">{([['power', Gauge], ['fan', Fan], ['ecoControl', Waves]] as const).map(([key, Icon]) => <span key={key} className="liquid-glass-control flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-medium"><Icon size={15} aria-hidden="true" />{c(key)}</span>)}</div></div>
        </article>
      </div>
    </section>
  </div>;
}
