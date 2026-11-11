import { ChevronRight, Flame, Snowflake, Thermometer, TriangleAlert } from 'lucide-react';
import type { DemoZoneView, DemoZoneStatus } from './climatePreviewData';
import type { ClimateZoneConfig } from './climateModel';
import type { ClimateZoneHouseContext } from '../../services/climateConfigClient';
import { useClimateConfigCopy } from './climateConfigCopy';
import { useClimateCopy, type ClimateCopyKey } from './climateCopy';
import '../../components/devices/theme/devices.css';

export const ZONE_NAME_KEY: Record<string, ClimateCopyKey> = {
  living: 'zone.living', bedroom: 'zone.bedroom', guest: 'zone.guest', bath: 'zone.bath', study: 'zone.study',
};
const STATUS_KEY: Record<DemoZoneStatus, ClimateCopyKey> = {
  satisfied: 'satisfied', heating: 'zoneHeating', cooling: 'zoneCooling', override: 'override', offline: 'offline',
};

/** A logical zone in the visual language of the new Home and Rooms climate tiles. */
export function ClimateZoneCard({ view, onOpen }: { view: DemoZoneView; onOpen: () => void }) {
  const { c, temperature } = useClimateCopy();
  const name = c(ZONE_NAME_KEY[view.zone.id]);
  const Icon = view.status === 'offline' ? TriangleAlert : view.status === 'cooling' ? Snowflake : view.status === 'heating' || view.status === 'override' ? Flame : Thermometer;
  const source = view.source === 'radiator' ? c('radiator') : view.source === 'air_conditioner' ? c('airConditioner') : c('noDevice');
  const active = view.status === 'heating' || view.status === 'cooling' || view.status === 'override';
  const tone = view.status === 'cooling' ? 'cool' : view.status === 'heating' || view.status === 'override' ? 'heat' : 'auto';
  const secondary = active ? 'text-white/80' : view.status === 'satisfied' ? 'text-[color:var(--dv-tile-on-ink-2)]' : 'dv-climate-sub';

  return <button type="button" onClick={onOpen} aria-label={c('openZone', { name })}
    className={`dv-tile dv-climate dv-cl-${tone} ${active ? 'is-lit-climate' : view.status === 'satisfied' ? 'is-on' : 'is-unavailable'} group !min-h-[208px] !h-full w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dv-focus)]`}
    data-tone={view.status === 'satisfied' ? 'cl-auto' : undefined}>
    <span className="dv-climate-top w-full">
      <span className="dv-icon-button !cursor-inherit" aria-hidden="true"><Icon size={21} strokeWidth={2} /></span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-[15px] font-semibold">{name}</strong><span className={`mt-0.5 block truncate text-[13px] font-medium ${secondary}`}>{c(STATUS_KEY[view.status])}</span></span>
      <ChevronRight size={16} className={`shrink-0 ${secondary}`} aria-hidden="true" />
    </span>
    <span className="dv-climate-mid w-full">
      <span className="min-w-0"><span className={`block text-[12px] font-semibold ${secondary}`}>{c('current')}</span><span className="block whitespace-nowrap text-[44px] font-semibold leading-[1.05] tracking-[-0.05em] tabular-nums">{view.currentCelsius === undefined ? '—' : temperature(view.currentCelsius)}</span></span>
      <span className="dv-climate-room"><b>{view.zone.target ? temperature(view.zone.target.celsius) : '—'}</b><span className={secondary}>{c('targetShort')}</span></span>
    </span>
    <span className={`dv-climate-foot w-full justify-between border-t pt-2 text-[12px] font-medium ${active ? 'border-white/25' : 'border-current/10'} ${secondary}`}>
      <span className="min-w-0 truncate">{source}</span>
      <span className="shrink-0">{view.status === 'override' && view.nextTime ? c('until', { time: view.nextTime }) : view.nextTime ? c('nextAt', { time: view.nextTime }) : c('planned')}</span>
    </span>
  </button>;
}

/** The same Home/Rooms tile surface, with saved mapping instead of invented readings. */
export function ConfiguredClimateZoneCard({ zone, sourceName, houseContext }: {
  zone: ClimateZoneConfig; sourceName: string; houseContext?: ClimateZoneHouseContext;
}) {
  const { t } = useClimateConfigCopy();
  const room = houseContext?.room;
  const roomLabel = zone.areaId === null ? t('noArea') : room?.name ?? t('orphanedRoom');
  const floorLabel = room?.floorName;
  return <article className="dv-tile dv-climate dv-cl-auto is-on !min-h-[208px] !h-full w-full !cursor-default text-left" data-tone="cl-auto">
    <span className="dv-climate-top w-full"><span className="dv-icon-button !cursor-inherit" aria-hidden="true"><Thermometer size={21} strokeWidth={2} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[15px] font-semibold">{zone.name}</strong><span className="mt-0.5 block truncate text-[13px] font-medium text-[color:var(--dv-tile-on-ink-2)]">{t('roomLabel')}: {roomLabel}{floorLabel ? ` · ${t('floorLabel')}: ${floorLabel}` : ''}</span></span></span>
    <span className="dv-climate-mid w-full"><span className="min-w-0"><span className="block text-[12px] font-semibold text-[color:var(--dv-tile-on-ink-2)]">{t('reference')}</span><strong className="mt-2 block max-w-[13rem] break-words text-lg font-semibold leading-6">{sourceName}</strong></span><span className="dv-climate-room"><b>{zone.endpointIds.length}</b><span className="text-[color:var(--dv-tile-on-ink-2)]">{t('endpoints')}</span></span></span>
    <span className="dv-climate-foot w-full border-t border-current/10 pt-2 text-[12px] font-medium text-[color:var(--dv-tile-on-ink-2)]">{t('configured')}</span>
  </article>;
}
