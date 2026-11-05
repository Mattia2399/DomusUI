import { ArrowRight, CalendarDays, Flame, House, Layers3, Snowflake, Sparkles, Thermometer, Wind } from 'lucide-react';
import { GlassSegmentSelect } from '../../components/ui/GlassSegmentSelect';
import type { ClimateControlMode, ClimateSeason } from './climateModel';
import { DEMO_ZONE_VIEWS, type DemoZoneView } from './climatePreviewData';
import { useClimateCopy } from './climateCopy';
import { ClimateIcon, ClimateSectionHeading, MUTED, PANEL } from './ClimatePrimitives';
import { ClimateZoneCard } from './ClimateZoneCard';

type Props = {
  mode: ClimateControlMode;
  season: ClimateSeason;
  source: 'radiators' | 'air_conditioners';
  onMode: (mode: ClimateControlMode) => void;
  onSeason: (season: ClimateSeason) => void;
  onOpenZone: (view: DemoZoneView) => void;
  onGo: (section: 'zones' | 'programs' | 'plant') => void;
};

export function ClimateOverview({ mode, season, source, onMode, onSeason, onOpenZone, onGo }: Props) {
  const { c } = useClimateCopy();
  const SeasonIcon = season === 'cooling' ? Snowflake : season === 'heating' ? Flame : House;
  return <div className="space-y-8">
    <section className={`${PANEL} relative overflow-hidden p-5 sm:p-7`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-400/10 blur-3xl" />
      <div className="relative grid gap-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
        <div><div className="flex items-center gap-3"><ClimateIcon icon={SeasonIcon} tone={season === 'cooling' ? 'cool' : 'warm'} /><p className={`text-xs font-semibold uppercase tracking-[0.16em] ${MUTED}`}>{c('houseStatus')}</p></div><h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--ui-text-primary)]">{c(mode === 'auto' ? 'auto' : 'manual')} <span className="text-[color:var(--ui-text-tertiary)]">·</span> {c(season)}</h2><p className={`mt-2 max-w-sm text-sm leading-6 ${MUTED}`}>{c('houseStatusDetail')}</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label className={`block text-xs font-semibold ${MUTED}`}>{c('controlMode')}</label><GlassSegmentSelect ariaLabel={c('controlMode')} value={mode} onChange={onMode} options={[{ value: 'auto', label: c('auto') }, { value: 'manual', label: c('manual') }]} /><p className={`text-xs ${MUTED}`}>{c(mode === 'auto' ? 'autoDetail' : 'manualDetail')}</p></div><div className="space-y-2"><label className={`block text-xs font-semibold ${MUTED}`}>{c('season')}</label><GlassSegmentSelect ariaLabel={c('season')} value={season} onChange={onSeason} options={[{ value: 'heating', label: c('heating') }, { value: 'cooling', label: c('cooling') }, { value: 'off', label: c('off') }]} /><p className={`text-xs ${MUTED}`}>{c('seasonDetail')}</p></div></div>
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-3">{([
      { icon: Sparkles, label: c('activeProfile'), value: mode === 'auto' ? c('comfort') : '—' },
      { icon: CalendarDays, label: c('nextChange'), value: mode === 'auto' ? c('nextAt', { time: '17:00' }) : '—' },
      { icon: Wind, label: c('currentSource'), value: season === 'off' ? c('off') : season === 'cooling' || source === 'air_conditioners' ? c('airConditioners') : c('radiators') },
    ]).map((item) => <div key={item.label} className={`${PANEL} flex min-h-20 items-center gap-3 p-4`}><ClimateIcon icon={item.icon} tone="neutral" /><div><p className={`text-xs ${MUTED}`}>{item.label}</p><strong className="mt-1 block text-sm text-[color:var(--ui-text-primary)]">{item.value}</strong></div></div>)}</div>

    <section className="space-y-4"><ClimateSectionHeading title={c('zoneHeading')} detail={c('zoneHeadingDetail')} action={<button type="button" onClick={() => onGo('zones')} className="liquid-glass-control flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold">{c('allZones')}<ArrowRight size={16} /></button>} />
      <div className="grid gap-3 sm:grid-cols-2">{DEMO_ZONE_VIEWS.slice(0, 4).map((view) => <ClimateZoneCard key={view.zone.id} view={view} onOpen={() => onOpenZone(view)} />)}</div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => onGo('programs')} className={`${PANEL} flex min-h-24 items-center gap-3 p-4 text-left`}><ClimateIcon icon={CalendarDays} tone="cool" /><span className="min-w-0 flex-1"><strong className="block text-sm text-[color:var(--ui-text-primary)]">{c('scheduleTitle')}</strong><span className={`mt-1 block text-xs ${MUTED}`}>{c('scheduleDetail')}</span></span><ArrowRight size={17} className={MUTED} /></button>
      <button type="button" onClick={() => onGo('plant')} className={`${PANEL} flex min-h-24 items-center gap-3 p-4 text-left`}><ClimateIcon icon={Layers3} /><span className="min-w-0 flex-1"><strong className="block text-sm text-[color:var(--ui-text-primary)]">{c('circuitTitle')}</strong><span className={`mt-1 block text-xs ${MUTED}`}>{c('generatorsDetail')}</span></span><ArrowRight size={17} className={MUTED} /></button></div>
  </div>;
}
