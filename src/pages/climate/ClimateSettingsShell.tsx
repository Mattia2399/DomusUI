import { useEffect, useState } from 'react';
import { House, Info, Layers3, List, CalendarDays, ArrowLeft } from 'lucide-react';
import GlassButton from '../../components/ui/GlassButton';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import type { HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { MockEntityStateMap } from '../../types/ha';
import { emptyClimateConfig, getClimateConfig, type ClimateCallApi, type ClimateConfigResponse } from '../../services/climateConfigClient';
import type { ClimateControlMode, ClimateSeason } from './climateModel';
import { DEMO_ZONE_VIEWS, type DemoZoneView } from './climatePreviewData';
import { useClimateCopy } from './climateCopy';
import { ClimateOverview } from './ClimateOverview';
import { ClimateSetup } from './ClimateSetup';
import { ClimatePrograms } from './ClimatePrograms';
import { ClimateSources } from './ClimateSources';
import { ClimateZoneCard, ConfiguredClimateZoneCard } from './ClimateZoneCard';
import { ClimateZoneDetail } from './ClimateZoneDetail';
import { ClimateSectionHeading, MUTED } from './ClimatePrimitives';
import { PANEL } from './ClimatePrimitives';
import { ClimateConfigEditor } from './ClimateConfigEditor';
import { useClimateConfigCopy } from './climateConfigCopy';

type Section = 'overview' | 'zones' | 'programs' | 'plant';

/** CLM UX: all controls below are local to a clearly labeled demo preview. */
export default function ClimateSettingsShell({ callApi, connected, areas, states, registry, canManage }: {
  callApi?: ClimateCallApi; connected: boolean; areas: readonly HaArea[]; states: MockEntityStateMap;
  registry: readonly HaEntityRegistryEntry[]; canManage: boolean;
}) {
  const { c } = useClimateCopy();
  const { t } = useClimateConfigCopy();
  const [configResponse, setConfigResponse] = useState<ClimateConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
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

  useEffect(() => {
    let active = true;
    if (!connected || !callApi) { setLoading(false); setLoadError(true); setConfigResponse(null); return; }
    setLoading(true); setLoadError(false);
    getClimateConfig(callApi).then((response) => {
      if (active) { setConfigResponse(response); setEditing(false); setLoading(false); }
    }).catch(() => { if (active) { setLoadError(true); setConfigResponse(null); setLoading(false); } });
    return () => { active = false; };
  }, [callApi, connected, reloadCount]);

  if (loading) return <div className={`${PANEL} p-6`} role="status">{t('loading')}</div>;
  if (loadError || !configResponse) return <div className={`${PANEL} space-y-4 p-6`} role="alert"><p>{t('unavailable')}</p><GlassButton onClick={() => setReloadCount((value) => value + 1)}>{t('retry')}</GlassButton></div>;
  if (configResponse.state !== 'ready' && configResponse.state !== 'absent') return <div className={`${PANEL} space-y-4 p-6`} role="alert"><p>{t(configResponse.state)}</p><GlassButton onClick={() => setReloadCount((value) => value + 1)}>{t('retry')}</GlassButton></div>;
  if (editing && callApi) return <ClimateConfigEditor key={configResponse.revision} initialConfig={configResponse.config ?? emptyClimateConfig()} revision={configResponse.revision} callApi={callApi} areas={areas} states={states} registry={registry} onSaved={(response) => { setConfigResponse(response); setEditing(false); setPreview(false); }} onCancel={() => setEditing(false)} onReload={() => setReloadCount((value) => value + 1)} />;
  if (configResponse.state === 'ready' && configResponse.config) {
    const config = configResponse.config;
    return <div className="mx-auto w-full max-w-6xl space-y-6 pb-8" data-climate-config="ready">
      <section className={`${PANEL} flex flex-wrap items-center justify-between gap-4 p-5 sm:p-7`}><div><p className={`text-xs font-semibold uppercase tracking-[0.16em] ${MUTED}`}>{c('eyebrow')}</p><h2 className="mt-2 text-2xl font-semibold text-[color:var(--ui-text-primary)]">{t('configured')}</h2><p className={`mt-2 text-sm ${MUTED}`}>{t('configuredDetail')}</p></div>{canManage && <GlassButton variant="primary" onClick={() => setEditing(true)}>{t('edit')}</GlassButton>}</section>
      {!canManage && <p className={`px-1 text-sm ${MUTED}`}>{t('readonly')}</p>}
      <ClimateSectionHeading title={t('zones')} detail={`${config.zones.length} ${t('zones').toLowerCase()} · ${config.endpoints.length} ${t('endpoints').toLowerCase()} · ${config.circuits.length} ${t('circuits').toLowerCase()} · ${config.generators.length} ${t('generators').toLowerCase()}`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{config.zones.map((zone) => <ConfiguredClimateZoneCard key={zone.id} zone={zone} sourceName={String(states[zone.reference.primaryEntityId]?.rawAttributes?.friendly_name ?? registry.find((entry) => entry.entityId === zone.reference.primaryEntityId)?.name ?? zone.reference.primaryEntityId)} areaName={areas.find((area) => area.area_id === zone.areaId)?.name} />)}</div>
    </div>;
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6 pb-8" data-climate-preview={preview ? 'demo' : 'empty'}>
    {!preview ? <ClimateSetup onPreview={() => setPreview(true)} onConfigure={() => setEditing(true)} canManage={canManage} /> : <>
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
