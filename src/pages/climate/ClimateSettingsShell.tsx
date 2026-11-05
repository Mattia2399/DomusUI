import { useState } from 'react';
import { House, Info, Layers3, List, CalendarDays, ArrowLeft } from 'lucide-react';
import GlassButton from '../../components/ui/GlassButton';
import type { ClimateControlMode, ClimateSeason } from './climateModel';
import { DEMO_ZONE_VIEWS, type DemoZoneView } from './climatePreviewData';
import { useClimateCopy } from './climateCopy';
import { ClimateOverview } from './ClimateOverview';
import { ClimateSetup } from './ClimateSetup';
import { ClimatePrograms } from './ClimatePrograms';
import { ClimateSources } from './ClimateSources';
import { ClimateZoneCard } from './ClimateZoneCard';
import { ClimateZoneDetail } from './ClimateZoneDetail';
import { ClimateSectionHeading, MUTED } from './ClimatePrimitives';

type Section = 'overview' | 'zones' | 'programs' | 'plant';

/** CLM UX: all controls below are local to a clearly labeled demo preview. */
export default function ClimateSettingsShell() {
  const { c } = useClimateCopy();
  const [preview, setPreview] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [mode, setMode] = useState<ClimateControlMode>('auto');
  const [season, setSeason] = useState<ClimateSeason>('heating');
  const [heatingSource, setHeatingSource] = useState<'radiators' | 'air_conditioners'>('radiators');
  const [generator, setGenerator] = useState<'boiler' | 'thermostove'>('boiler');
  const [selectedZone, setSelectedZone] = useState<DemoZoneView | null>(null);
  const leavePreview = () => { setSelectedZone(null); setPreview(false); setSection('overview'); setMode('auto'); setSeason('heating'); setHeatingSource('radiators'); setGenerator('boiler'); };
  const navigation: readonly { id: Section; icon: typeof House; label: string }[] = [
    { id: 'overview', icon: House, label: c('overview') }, { id: 'zones', icon: List, label: c('zones') },
    { id: 'programs', icon: CalendarDays, label: c('programs') }, { id: 'plant', icon: Layers3, label: c('plant') },
  ];

  return <div className="mx-auto w-full max-w-6xl space-y-6 pb-8" data-climate-preview={preview ? 'demo' : 'empty'}>
    {!preview ? <ClimateSetup onPreview={() => setPreview(true)} /> : <>
      <div role="note" className="flex flex-col items-start gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 sm:flex-row sm:items-center"><div className="flex w-full items-start gap-3 sm:min-w-0 sm:flex-1"><Info size={19} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" /><div className="min-w-0"><strong className="block text-sm text-[color:var(--ui-text-primary)]">{c('previewBanner')}</strong><p className={`mt-0.5 text-xs leading-5 ${MUTED}`}>{c('previewDetail')}</p></div></div><GlassButton size="sm" variant="ghost" onClick={leavePreview} className="inline-flex items-center gap-2 self-end sm:self-auto"><ArrowLeft size={15} />{c('previewClose')}</GlassButton></div>
      <nav aria-label={c('eyebrow')} className="flex gap-2 overflow-x-auto pb-1">{navigation.map(({ id, icon: Icon, label }) => <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={`liquid-glass-control flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${section === id ? 'ring-2 ring-[color:var(--ui-accent)] text-[color:var(--ui-text-primary)]' : 'text-[color:var(--ui-text-secondary)]'}`}><Icon size={17} aria-hidden="true" />{label}</button>)}</nav>
      {section === 'overview' && <ClimateOverview mode={mode} season={season} source={heatingSource} onMode={setMode} onSeason={setSeason} onOpenZone={setSelectedZone} onGo={setSection} />}
      {section === 'zones' && <section className="space-y-4"><ClimateSectionHeading eyebrow={c('zones')} title={c('zoneHeading')} detail={c('zoneHeadingDetail')} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{DEMO_ZONE_VIEWS.map((view) => <ClimateZoneCard key={view.zone.id} view={view} onOpen={() => setSelectedZone(view)} />)}</div></section>}
      {section === 'programs' && <ClimatePrograms />}
      {section === 'plant' && <ClimateSources season={season} source={heatingSource} onSource={setHeatingSource} generator={generator} onGenerator={setGenerator} />}
      <ClimateZoneDetail view={selectedZone} onClose={() => setSelectedZone(null)} />
    </>}
  </div>;
}
