import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { AlertCircle, Bell, Bot, Home, Pause, Play, Sparkles, Square } from 'lucide-react';
import { usePanelsTranslations } from '../../../i18n/panelsTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { RelatedControl, formatRelatedValue, type VacuumRelatedEntityActionRequest } from '../../settings/VacuumRelatedControl';
import GlassSegmentSelect from '../../ui/GlassSegmentSelect';
import { formatVacuumOption, normalizeVacuumState } from '../../widgets/vacuumCardModel';
import type { VacuumMappedArea, VacuumRelatedEntityInfo } from '../../widgets/vacuumDeviceModel';
import { vacuumErrorText, vacuumModeControl, vacuumProgress } from '../model/panelRules';
import { PanelShell, type PanelLive } from './PanelShell';
import '../theme/panelLive.css';
import '../theme/panels.css';

/*
 * The robot: the battery, what it is doing, the commands it declares, the
 * suction and how it cleans when it can choose, the rooms when its integration
 * names them, and the parts that wear out when it has sensors for them.
 * The drawn map with rooms to touch needs their shape, which Home Assistant
 * does not give: a map picture stays a picture.
 */

export type VacuumPanelModel = {
  name: string;
  state: string;
  status?: string;
  batteryLevel?: number;
  cleanedArea?: number;
  cleanedAreaUnit?: string;
  cleaningMinutes?: number;
  fanSpeed?: string;
  fanSpeedList?: string[];
  mapUrl?: string;
  supportsStart?: boolean;
  supportsPause?: boolean;
  supportsStop?: boolean;
  supportsReturnToBase?: boolean;
  supportsLocate?: boolean;
  supportsCleanSpot?: boolean;
  supportsCleanArea?: boolean;
  supportsFanSpeed?: boolean;
  relatedEntities?: VacuumRelatedEntityInfo[];
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    swVersion?: string;
    hwVersion?: string;
  };
  rawAttributes?: Record<string, unknown>;
};

export type VacuumPanelCommands = {
  start: () => void;
  pause: () => void;
  stop: () => void;
  returnToBase: () => void;
  locate: () => void;
  cleanSpot: () => void;
  cleanArea: (areaIds: string[]) => void;
  setFanSpeed: (fanSpeed: string) => void;
  related?: (request: VacuumRelatedEntityActionRequest) => boolean | void | Promise<boolean | void>;
};

export type VacuumPanelProps = {
  vacuum: VacuumPanelModel;
  areas?: VacuumMappedArea[];
  commands: VacuumPanelCommands;
  embedded?: boolean;
  live?: PanelLive;
  onClose: () => void;
};

const STATE_KEYS = {
  docked: 'vacuum.state.docked',
  cleaning: 'vacuum.state.cleaning',
  paused: 'vacuum.state.paused',
  error: 'vacuum.state.error',
  returning: 'vacuum.state.returning',
  idle: 'vacuum.state.idle',
  unavailable: 'vacuum.state.unavailable',
  unknown: 'vacuum.state.unknown',
} as const;

const RING_LENGTH = 2 * Math.PI * 46;

const meterTone = (percent: number) => (percent < 10 ? 'is-bad' : percent < 30 ? 'is-warn' : undefined);

export function VacuumPanel({ vacuum, areas = [], commands, embedded = false, live, onClose }: VacuumPanelProps) {
  const pt = usePanelsTranslations();
  const { t } = useI18n();
  const state = normalizeVacuumState(vacuum.state);
  const [fanSpeed, setFanSpeed] = useState(vacuum.fanSpeed ?? '');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [finding, setFinding] = useState(false);
  useEffect(() => setFanSpeed(vacuum.fanSpeed ?? ''), [vacuum.fanSpeed]);
  useEffect(() => {
    if (!finding) return undefined;
    const timer = window.setTimeout(() => setFinding(false), 1800);
    return () => window.clearTimeout(timer);
  }, [finding]);

  const error = state === 'error';
  const cleaning = state === 'cleaning';
  const away = state === 'unavailable' || state === 'unknown';
  const battery = typeof vacuum.batteryLevel === 'number' && Number.isFinite(vacuum.batteryLevel) ? Math.round(vacuum.batteryLevel) : null;
  const progress = vacuumProgress(vacuum.rawAttributes);
  const fanSpeeds = Array.from(new Set((vacuum.fanSpeedList ?? []).map((item) => item.trim()).filter(Boolean)));
  const related = (vacuum.relatedEntities ?? []).filter((entity) => entity.domain !== 'image');
  const modeControl = vacuumModeControl(related);
  const controls = related.filter((entity) => ['switch', 'select', 'number', 'button'].includes(entity.domain) && entity.entityId !== modeControl?.entityId);
  const readings = related.filter((entity) => !['switch', 'select', 'number', 'button'].includes(entity.domain));
  const deviceInfo = [
    [t('camera.info.manufacturer'), vacuum.deviceInfo?.manufacturer],
    [t('camera.info.model'), vacuum.deviceInfo?.model],
    [t('camera.info.firmware'), vacuum.deviceInfo?.swVersion],
    [t('camera.info.hardware'), vacuum.deviceInfo?.hwVersion],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const note = cleaning
    ? pt('vcCleaning')
    : state === 'paused'
      ? pt('vcPausedNote')
      : state === 'returning'
        ? pt('vcReturning')
        : state === 'docked' || state === 'idle'
          ? pt('vcReady')
          : vacuum.status?.trim() || t(STATE_KEYS[state]);
  const progressText = [
    typeof vacuum.cleanedArea === 'number' ? `${Math.round(vacuum.cleanedArea * 10) / 10} ${vacuum.cleanedAreaUnit ?? 'm²'}` : null,
    typeof vacuum.cleaningMinutes === 'number' ? `${Math.round(vacuum.cleaningMinutes)} min` : null,
  ].filter(Boolean).join(' · ');
  const working = cleaning || state === 'paused' || state === 'returning';
  const mainIsPause = cleaning && vacuum.supportsPause;
  const mainIsStop = cleaning && !vacuum.supportsPause && vacuum.supportsStop;
  const mainIsStart = !cleaning && !away && state !== 'returning' && vacuum.supportsStart;
  const showStop = vacuum.supportsStop && !mainIsStop && working;

  const subtitle = [t(STATE_KEYS[state]), battery !== null ? `${battery}%` : null].filter(Boolean).join(' · ');

  return (
    <PanelShell
      icon={<Bot size={23} strokeWidth={2} />}
      iconClassName={cleaning ? 'bg-[#64d2ff] text-[#00263a]' : 'bg-[rgb(100_210_255/0.18)] text-[#64d2ff]'}
      name={vacuum.name}
      subtitle={subtitle}
      liveSubtitle
      embedded={embedded}
      live={live}
      onClose={onClose}
    >
      <div className="dv-card dv-pn-vhero">
        {battery !== null ? (
          <span className={clsx('dv-pn-vring', error ? 'is-bad' : battery < 20 && 'is-low')}>
            <svg viewBox="0 0 104 104" width="100%" height="100%" aria-hidden="true">
              <circle cx="52" cy="52" r="46" />
              <circle cx="52" cy="52" r="46" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - battery / 100)} />
            </svg>
            <b>{battery}%</b>
            <span>{pt('vcBattery')}</span>
          </span>
        ) : null}
        <span className="dv-pn-vtext">
          <b aria-live="polite">{t(STATE_KEYS[state])}</b>
          <span className="dv-t2">{note}</span>
          {progress !== null && working ? <span className="dv-pn-bar" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span> : null}
          <span className="dv-t3 text-xs">{working && progressText ? progressText : working ? '' : pt('vcNoCleaning')}</span>
        </span>
      </div>

      {error ? (
        <div className="dv-banner dv-pn-banner is-red" role="alert">
          <AlertCircle size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>
            <b>{pt('vcStuck')}</b>
            <span>{vacuumErrorText(vacuum.rawAttributes, vacuum.status) ?? pt('vcStuckHelp')}</span>
          </span>
        </div>
      ) : null}

      {mainIsPause || mainIsStop || mainIsStart || vacuum.supportsReturnToBase || vacuum.supportsLocate || showStop ? (
        <div className="dv-pn-acts">
          {mainIsPause ? (
            <button type="button" className="dv-pn-big" onClick={commands.pause}><Pause size={20} strokeWidth={2.2} aria-hidden="true" />{pt('vcPause')}</button>
          ) : mainIsStop ? (
            <button type="button" className="dv-pn-big" onClick={commands.stop}><Square size={18} strokeWidth={2.2} aria-hidden="true" />{pt('vcStop')}</button>
          ) : mainIsStart ? (
            <button type="button" className="dv-pn-big" onClick={commands.start}>
              <Play size={20} strokeWidth={2.2} aria-hidden="true" />
              {error || state === 'paused' ? pt('vcResume') : pt('vcStart')}
            </button>
          ) : null}
          {showStop ? (
            <button type="button" className="dv-pn-sm" onClick={commands.stop}><Square size={16} strokeWidth={2.2} aria-hidden="true" />{pt('vcStop')}</button>
          ) : null}
          {vacuum.supportsReturnToBase ? (
            <button type="button" className="dv-pn-sm" disabled={state === 'docked' || away} onClick={commands.returnToBase}>
              <Home size={18} strokeWidth={2.2} aria-hidden="true" />{pt('vcBase')}
            </button>
          ) : null}
          {vacuum.supportsLocate ? (
            <button
              type="button"
              className="dv-pn-sm"
              disabled={away}
              onClick={() => {
                setFinding(true);
                commands.locate();
              }}
            >
              <Bell size={18} strokeWidth={2.2} aria-hidden="true" />{finding ? pt('vcFinding') : pt('vcFind')}
            </button>
          ) : null}
        </div>
      ) : null}

      {vacuum.supportsFanSpeed && fanSpeeds.length > 0 ? (
        <div className="dv-pn-line">
          <span className="dv-pn-label">{pt('vcSuction')}</span>
          <GlassSegmentSelect
            className="dv-seg"
            ariaLabel={pt('vcSuction')}
            options={fanSpeeds.map((option) => ({ value: option, label: formatVacuumOption(option) }))}
            value={fanSpeeds.find((option) => option.toLowerCase() === fanSpeed.toLowerCase())}
            onChange={(option) => {
              setFanSpeed(option);
              commands.setFanSpeed(option);
            }}
            minOptionWidth="3.7rem"
            scrollable
          />
        </div>
      ) : null}

      {modeControl?.options?.length ? (
        <div className="dv-pn-line">
          <span className="dv-pn-label">{pt('vcMode')}</span>
          <GlassSegmentSelect
            className="dv-seg"
            ariaLabel={pt('vcMode')}
            options={modeControl.options.map((option) => ({ value: option, label: formatVacuumOption(option) }))}
            value={modeControl.options.find((option) => option === modeControl.state)}
            onChange={(option) => void commands.related?.({ entityId: modeControl.entityId, action: 'select', value: option })}
            minOptionWidth="3.7rem"
            scrollable
          />
        </div>
      ) : null}

      {vacuum.mapUrl ? <img className="dv-pn-map" src={vacuum.mapUrl} alt={pt('vcMapAlt', { name: vacuum.name })} /> : null}

      {(vacuum.supportsCleanArea && areas.length > 0) || vacuum.supportsCleanSpot ? (
        <div className="dv-pn-line">
          {vacuum.supportsCleanArea && areas.length > 0 ? (
            <>
              <span className="dv-pn-label">{pt('vcRooms')}</span>
              <div className="dv-pn-pills">
                {areas.map((area) => {
                  const selected = selectedAreas.includes(area.id);
                  return (
                    <button
                      key={area.id}
                      type="button"
                      className={clsx('dv-pn-pill', selected && 'is-on')}
                      aria-pressed={selected}
                      onClick={() => setSelectedAreas((current) => (selected ? current.filter((id) => id !== area.id) : [...current, area.id]))}
                    >
                      {area.name}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
          <div className="dv-pn-acts">
            {vacuum.supportsCleanArea && selectedAreas.length > 0 ? (
              <button type="button" className="dv-pn-sm" onClick={() => commands.cleanArea(selectedAreas)}>
                <Sparkles size={16} strokeWidth={2.2} aria-hidden="true" />
                {selectedAreas.length === 1 ? pt('vcCleanRoom') : pt('vcCleanRooms', { n: selectedAreas.length })}
              </button>
            ) : null}
            {vacuum.supportsCleanSpot ? (
              <button type="button" className="dv-pn-sm" onClick={commands.cleanSpot}>
                <Sparkles size={16} strokeWidth={2.2} aria-hidden="true" />{pt('vcSpot')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {readings.length > 0 ? (
        <>
          <div className="dv-pn-label">{pt('vcMaintenance')}</div>
          <div className="dv-card dv-pn-rows">
            {readings.map((entity) => {
              const percent = entity.unit === '%' ? Number(entity.state) : Number.NaN;
              return (
                <div key={entity.entityId} className="dv-pn-row">
                  <span className="dv-pn-rt">
                    <b>{entity.name}</b>
                    <span className="dv-t2">{formatRelatedValue(entity, t('vacuum.na'))}</span>
                  </span>
                  {Number.isFinite(percent) ? (
                    <span className="dv-pn-meter" aria-hidden="true"><i className={meterTone(percent)} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {controls.length > 0 ? (
        <>
          <div className="dv-pn-label">{pt('vcControls')}</div>
          <div className="flex flex-col gap-2.5">
            {controls.map((entity) => <RelatedControl key={entity.entityId} entity={entity} onAction={commands.related} />)}
          </div>
        </>
      ) : null}

      {deviceInfo.length > 0 ? (
        <>
          <div className="dv-pn-label">{t('camera.settings.info')}</div>
          <div className="dv-card dv-pn-rows">
            {deviceInfo.map(([label, value]) => (
              <div key={label} className="dv-pn-row">
                <span className="dv-pn-rt"><b>{label}</b></span>
                <span className="dv-pn-tm dv-t2">{value}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </PanelShell>
  );
}

export default VacuumPanel;
