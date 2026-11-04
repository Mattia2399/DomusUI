import React from 'react';
import { clsx } from 'clsx';
import { Bell, Bot, Fan, Home, Info, ListChecks, Map as MapIcon, SlidersHorizontal, Sparkles, Square, Wrench } from 'lucide-react';
import { useI18n } from '../../../../i18n/I18nProvider';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { usePanelsTranslations } from '../../../../i18n/panelsTranslations';
import { formatRelatedValue, type VacuumRelatedEntityActionRequest } from '../../../settings/VacuumRelatedControl';
import { GlassButton } from '../../../ui/GlassButton';
import { GlassChips } from '../../../ui/GlassChips';
import { formatVacuumOption, normalizeVacuumState } from '../../../widgets/vacuumCardModel';
import type { VacuumMappedArea, VacuumRelatedEntityInfo } from '../../../widgets/vacuumDeviceModel';
import { vacuumErrorText, vacuumModeControl, vacuumProgress } from '../../model/panelRules';
import type { PanelEntry, PanelItem, PanelSpec } from '../registry';
import { relatedItem } from './related';
import { accentOf, chipSize, ICON, PanelRows } from './shared';
import './data.css';

/*
 * A robot: the battery and what it is doing in the middle, Start, Pause or Stop as the
 * main action, and around them the commands it declares. A map only when its integration
 * gives one, and a picture stays a picture: Home Assistant does not give the shape of a room.
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

export type VacuumPanelInput = {
  vacuum: VacuumPanelModel;
  areas?: VacuumMappedArea[];
  commands: VacuumPanelCommands;
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
const FINDING_MS = 1800;

function useVacuumSpec({ vacuum, areas = [], commands }: VacuumPanelInput): PanelSpec {
  const pt = usePanelsTranslations();
  const sp = usePanelSpecTranslations();
  const { t } = useI18n();
  const state = normalizeVacuumState(vacuum.state);
  const [fanSpeed, setFanSpeed] = React.useState(vacuum.fanSpeed ?? '');
  const [selectedAreas, setSelectedAreas] = React.useState<string[]>([]);
  const [finding, setFinding] = React.useState(false);
  React.useEffect(() => setFanSpeed(vacuum.fanSpeed ?? ''), [vacuum.fanSpeed]);
  React.useEffect(() => {
    if (!finding) return undefined;
    const timer = window.setTimeout(() => setFinding(false), FINDING_MS);
    return () => window.clearTimeout(timer);
  }, [finding]);

  const error = state === 'error';
  const cleaning = state === 'cleaning';
  const away = state === 'unavailable' || state === 'unknown';
  const working = cleaning || state === 'paused' || state === 'returning';
  const battery = typeof vacuum.batteryLevel === 'number' && Number.isFinite(vacuum.batteryLevel) ? Math.round(vacuum.batteryLevel) : null;
  const progress = vacuumProgress(vacuum.rawAttributes);
  const fanSpeeds = Array.from(new Set((vacuum.fanSpeedList ?? []).map((item) => item.trim()).filter(Boolean)));
  const related = (vacuum.relatedEntities ?? []).filter((entity) => entity.domain !== 'image');
  const modeControl = vacuumModeControl(related);
  const controls = related.filter((entity) => ['switch', 'select', 'number', 'button'].includes(entity.domain) && entity.entityId !== modeControl?.entityId);
  const readings = related.filter((entity) => !['switch', 'select', 'number', 'button'].includes(entity.domain));
  const stateName = t(STATE_KEYS[state]);

  const note = cleaning
    ? pt('vcCleaning')
    : state === 'paused'
      ? pt('vcPausedNote')
      : state === 'returning'
        ? pt('vcReturning')
        : state === 'docked' || state === 'idle'
          ? pt('vcReady')
          : error
            ? vacuumErrorText(vacuum.rawAttributes, vacuum.status) ?? pt('vcStuckHelp')
            : vacuum.status?.trim() || stateName;
  const progressText = [
    typeof vacuum.cleanedArea === 'number' ? `${Math.round(vacuum.cleanedArea * 10) / 10} ${vacuum.cleanedAreaUnit ?? 'm²'}` : null,
    typeof vacuum.cleaningMinutes === 'number' ? `${Math.round(vacuum.cleaningMinutes)} min` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const mainIsPause = cleaning && vacuum.supportsPause;
  const mainIsStop = cleaning && !vacuum.supportsPause && vacuum.supportsStop;
  const mainIsStart = !cleaning && !away && state !== 'returning' && vacuum.supportsStart;
  const showStop = vacuum.supportsStop && !mainIsStop && working;

  const shortcuts: PanelItem[] = [];
  if (showStop) {
    shortcuts.push({ key: 'stop', kind: 'action', icon: <Square {...ICON} />, label: pt('vcStop'), actionLabel: pt('vcStop'), onPress: commands.stop });
  }
  if (vacuum.supportsReturnToBase) {
    shortcuts.push({ key: 'base', kind: 'action', icon: <Home {...ICON} />, label: pt('vcBase'), actionLabel: pt('vcBase'), disabled: state === 'docked' || away, onPress: commands.returnToBase });
  }
  if (vacuum.supportsLocate) {
    shortcuts.push({
      key: 'find',
      kind: 'action',
      icon: <Bell {...ICON} />,
      label: pt('vcFind'),
      actionLabel: finding ? pt('vcFinding') : pt('vcFind'),
      on: finding,
      disabled: away,
      onPress: () => {
        setFinding(true);
        commands.locate();
      },
    });
  }
  if (vacuum.supportsFanSpeed && fanSpeeds.length > 0) {
    const current = fanSpeeds.find((option) => option.toLowerCase() === fanSpeed.toLowerCase());
    shortcuts.push({
      key: 'suction',
      kind: 'opens',
      icon: <Fan {...ICON} />,
      label: pt('vcSuction'),
      value: current ? formatVacuumOption(current) : undefined,
      content: (place) => (
        <GlassChips<string>
          size={chipSize(place)}
          ariaLabel={pt('vcSuction')}
          options={fanSpeeds.map((option) => ({ value: option, label: formatVacuumOption(option) }))}
          value={current}
          onChange={(option) => {
            setFanSpeed(option);
            commands.setFanSpeed(option);
          }}
        />
      ),
    });
  }
  if (modeControl?.options?.length) {
    const options = modeControl.options;
    shortcuts.push({
      key: 'mode',
      kind: 'opens',
      icon: <SlidersHorizontal {...ICON} />,
      label: pt('vcMode'),
      value: modeControl.state ? formatVacuumOption(modeControl.state) : undefined,
      content: (place) => (
        <GlassChips<string>
          size={chipSize(place)}
          ariaLabel={pt('vcMode')}
          options={options.map((option) => ({ value: option, label: formatVacuumOption(option) }))}
          value={options.find((option) => option === modeControl.state)}
          onChange={(option) => void commands.related?.({ entityId: modeControl.entityId, action: 'select', value: option })}
        />
      ),
    });
  }
  if (vacuum.mapUrl) {
    const map = <img className="panel-vacuum-map" src={vacuum.mapUrl} alt={pt('vcMapAlt', { name: vacuum.name })} />;
    shortcuts.push({ key: 'map', kind: 'opens', icon: <MapIcon {...ICON} />, label: sp.t('map'), content: () => null, hero: map, group: map });
  }
  if (vacuum.supportsCleanArea && areas.length > 0) {
    shortcuts.push({
      key: 'rooms',
      kind: 'opens',
      icon: <ListChecks {...ICON} />,
      label: pt('vcRooms'),
      content: (place) => (
        <>
          <GlassChips<string> multiple size={chipSize(place)} ariaLabel={pt('vcRooms')} options={areas.map((area) => ({ value: area.id, label: area.name }))} value={selectedAreas} onChange={setSelectedAreas} />
          {selectedAreas.length > 0 ? (
            <GlassButton variant="soft" className="panel-group-action" onClick={() => commands.cleanArea(selectedAreas)}>
              {selectedAreas.length === 1 ? pt('vcCleanRoom') : pt('vcCleanRooms', { n: selectedAreas.length })}
            </GlassButton>
          ) : null}
        </>
      ),
    });
  }
  if (vacuum.supportsCleanSpot) {
    shortcuts.push({ key: 'spot', kind: 'action', icon: <Sparkles {...ICON} />, label: pt('vcSpot'), actionLabel: pt('vcSpot'), onPress: commands.cleanSpot });
  }
  if (readings.length > 0) {
    shortcuts.push({
      key: 'parts',
      kind: 'opens',
      icon: <Wrench {...ICON} />,
      label: sp.t('parts'),
      title: pt('vcMaintenance'),
      content: () => <PanelRows rows={readings.map((entity) => [entity.name, formatRelatedValue(entity, t('vacuum.na'))])} />,
    });
  }
  for (const entity of controls) {
    const item = relatedItem(entity, {
      runLabel: t('camera.action.run'),
      optionName: formatVacuumOption,
      commands: {
        toggle: () => void commands.related?.({ entityId: entity.entityId, action: 'toggle', value: entity.state !== 'on' }),
        press: () => void commands.related?.({ entityId: entity.entityId, action: 'press' }),
        select: (value) => void commands.related?.({ entityId: entity.entityId, action: 'select', value }),
        number: (value) => void commands.related?.({ entityId: entity.entityId, action: 'number', value }),
      },
    });
    if (item) shortcuts.push(item);
  }
  const info = [
    [t('camera.info.manufacturer'), vacuum.deviceInfo?.manufacturer],
    [t('camera.info.model'), vacuum.deviceInfo?.model],
    [t('camera.info.firmware'), vacuum.deviceInfo?.swVersion],
    [t('camera.info.hardware'), vacuum.deviceInfo?.hwVersion],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (info.length > 0) {
    shortcuts.push({ key: 'info', kind: 'opens', icon: <Info {...ICON} />, label: t('camera.settings.info'), content: () => <PanelRows rows={info} /> });
  }

  return {
    owner: vacuum.name,
    name: vacuum.name,
    status: [stateName, battery !== null ? `${battery}%` : null].filter(Boolean).join(' · '),
    icon: <Bot size={23} strokeWidth={2} />,
    lit: cleaning || error,
    accent: accentOf(error ? '255 69 58' : '100 210 255'),
    tint: cleaning || error,
    heroKind: 'data',
    hero: (
      <div className={clsx('dv-card panel-vacuum', error && 'is-error')}>
        {battery !== null ? (
          <span className={clsx('panel-vacuum-ring', battery < 20 && 'is-low')}>
            <svg viewBox="0 0 104 104" width="100%" height="100%" aria-hidden="true">
              <circle cx="52" cy="52" r="46" />
              <circle cx="52" cy="52" r="46" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - battery / 100)} />
            </svg>
            <b>{battery}%</b>
            <span>{pt('vcBattery')}</span>
          </span>
        ) : null}
        <b className="panel-vacuum-state" aria-live="polite">
          {stateName}
        </b>
        {error ? <b className="panel-vacuum-stuck">{pt('vcStuck')}</b> : null}
        <span className="panel-vacuum-note" role={error ? 'alert' : undefined}>
          {note}
        </span>
        {progress !== null && working ? (
          <span className="panel-vacuum-bar" aria-hidden="true">
            <i style={{ width: `${progress}%` }} />
          </span>
        ) : null}
        <span className="panel-vacuum-more">{working ? progressText : pt('vcNoCleaning')}</span>
      </div>
    ),
    shortcuts,
    action: mainIsPause
      ? { kind: 'pause', label: pt('vcPause'), onPress: commands.pause }
      : mainIsStop
        ? { kind: 'stop', label: pt('vcStop'), onPress: commands.stop }
        : mainIsStart
          ? { kind: 'play', label: error || state === 'paused' ? pt('vcResume') : pt('vcStart'), onPress: commands.start }
          : undefined,
  };
}

export const vacuumEntry: PanelEntry<VacuumPanelInput> = { useSpec: useVacuumSpec };
