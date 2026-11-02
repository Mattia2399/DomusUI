import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Bell, DoorClosed, Footprints, Home, Moon, Plane, RectangleVertical, Shield, ShieldAlert, ShieldOff, ShieldPlus, type LucideIcon } from 'lucide-react';
import { usePanelsTranslations } from '../../../i18n/panelsTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { useCan } from '../../../security/AccessControlProvider';
import type { MockEntityStateMap } from '../../../types/ha';
import { normalizeAlarmState } from '../../../utils/alarmUtils';
import type { AlarmActionAuthOptions } from '../../../utils/alarmSecurityPolicy';
import SecurityAuthModal from '../../security/SecurityAuthModal';
import { useAlarmGate, type AlarmActionResult, type AlarmGateAction } from '../../settings/useAlarmGate';
import { buildCameraCardModel } from '../../widgets/cameraCardModel';
import type { Widget } from '../../../types/dashboardModels';
import {
  alarmCanTrigger,
  alarmExitDelay,
  alarmHouseOf,
  alarmModesOf,
  alarmTriggerZone,
  camerasInArea,
  entityChangedAt,
  findAlarmEntityId,
  formatPanelSpan,
  secondsLeft,
  type AlarmModeId,
  type HouseEntity,
} from '../model/panelRules';
import { useEntityRegistry } from './panelData';
import { usePanelServices } from './panelServicesContext';
import { PanelShell } from './PanelShell';
import '../theme/panels.css';

/*
 * The alarm: its modes, what is open before arming it, the time to leave, and
 * when it goes off what to do. Every command goes through the same gate as
 * before (code, device authorization, attempts, audit); a mode the entity does
 * not declare is not shown, and without permission only the state stays.
 */

const CameraViewer = React.lazy(() => import('../../camera/CameraViewer').then((module) => ({ default: module.CameraViewer })));

type AlarmCommand = (code?: string, options?: AlarmActionAuthOptions) => AlarmActionResult;

export type AlarmPanelModel = {
  name: string;
  state: string;
  status?: string;
  codeArmRequired?: boolean;
  unlockCode?: string;
  localExtraCode?: string;
  requireAuthToDisarm?: boolean;
  supportedFeatures?: number;
  activityLogLimit?: number;
  activityTimeline?: Array<{ id: string; text: string }>;
  rawAttributes?: Record<string, unknown>;
};

export type AlarmPanelCommands = {
  disarm: AlarmCommand;
  home: AlarmCommand;
  away: AlarmCommand;
  night: AlarmCommand;
  vacation: AlarmCommand;
  custom_bypass: AlarmCommand;
  trigger: AlarmCommand;
};

export type AlarmPanelProps = {
  alarm: AlarmPanelModel;
  haStates: MockEntityStateMap;
  commands: AlarmPanelCommands;
  onAuthorizeDeviceAuth?: (label: string) => Promise<boolean>;
  embedded?: boolean;
  onClose: () => void;
};

const MODE_LOOK: Record<AlarmModeId, { Icon: LucideIcon; rgb: string; label: 'amModeHome' | 'amModeAway' | 'amModeNight' | 'amModeVacation' | 'amModeCustom' }> = {
  home: { Icon: Home, rgb: '10 132 255', label: 'amModeHome' },
  away: { Icon: Shield, rgb: '31 157 76', label: 'amModeAway' },
  night: { Icon: Moon, rgb: '94 92 230', label: 'amModeNight' },
  vacation: { Icon: Plane, rgb: '200 120 20', label: 'amModeVacation' },
  custom_bypass: { Icon: ShieldPlus, rgb: '20 140 160', label: 'amModeCustom' },
};

const DISARM_RGB = '99 99 102';
const ALERT_RGB = '255 69 58';

const modeOfState = (state: string | undefined): AlarmModeId | null => {
  const mode = state?.replace(/^armed_/, '');
  return mode && mode in MODE_LOOK && state?.startsWith('armed_') ? (mode as AlarmModeId) : null;
};

const clock = (time: number, locale: string) => new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

const namesOf = (items: HouseEntity[]) => items.map((item) => item.name).join(', ');

export function AlarmPanel({ alarm, haStates, commands, onAuthorizeDeviceAuth, embedded = false, onClose }: AlarmPanelProps) {
  const pt = usePanelsTranslations();
  const { locale, t } = useI18n();
  const canControl = useCan('security.control');
  const services = usePanelServices();
  const registry = useEntityRegistry();
  const state = normalizeAlarmState(alarm.state || alarm.status);
  const attributes = alarm.rawAttributes;
  const [askingMode, setAskingMode] = useState<AlarmModeId | null>(null);
  const [silenced, setSilenced] = useState(false);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const gate = useAlarmGate<AlarmGateAction>({ alarm, onAuthorizeDeviceAuth });

  const triggered = state === 'triggered';
  const arming = state === 'arming';
  const pending = state === 'pending';
  const disarming = state === 'disarming';
  const unavailable = state === 'unavailable' || state === 'unknown';
  const moving = arming || pending || disarming;

  const entityId = findAlarmEntityId(haStates, attributes);
  const areaOf = registry?.entityAreaByEntityId ?? null;
  const area = entityId ? areaOf?.[entityId] ?? null : null;
  const house = alarmHouseOf(haStates, areaOf, area);
  const openDoors = house.doors.filter((item) => item.on);
  const openWindows = house.windows.filter((item) => item.on);
  const openings = [...openDoors, ...openWindows];
  const movingNow = house.motion.filter((item) => item.on);
  const sirensOn = house.sirens.filter((item) => item.on);

  const zone = triggered ? alarmTriggerZone(attributes, haStates) : null;
  const zoneArea = zone?.entityId ? areaOf?.[zone.entityId] ?? null : null;
  const cameras = triggered ? camerasInArea(haStates, areaOf, zoneArea ?? area) : [];

  const changedAt = entityChangedAt(entityId ? haStates[entityId] : undefined);
  const seenAt = useRef(now);
  useEffect(() => {
    if (arming) seenAt.current = Date.now();
  }, [arming]);
  const delay = arming ? alarmExitDelay(attributes) : null;
  const ticking = delay !== null || (triggered && sirensOn.length > 0);
  useEffect(() => {
    if (!ticking) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  const left = delay !== null ? secondsLeft(delay, changedAt ?? seenAt.current, now) : null;

  const modes = alarmModesOf(alarm.supportedFeatures);
  const armMode = modeOfState(state) ?? (arming ? modeOfState(String(attributes?.next_state ?? attributes?.arm_mode ?? '')) : null);
  const tint = triggered ? ALERT_RGB : armMode ? MODE_LOOK[armMode].rgb : null;

  const disarmAction: AlarmGateAction = { id: 'disarm', label: pt('amModeDisarm'), state: 'disarmed', onPress: commands.disarm };
  const armAction = (mode: AlarmModeId): AlarmGateAction => ({ id: mode, label: pt(MODE_LOOK[mode].label), state: `armed_${mode}`, onPress: commands[mode] });

  const pickMode = (mode: AlarmModeId) => {
    if (openings.length > 0) {
      setAskingMode(mode);
      return;
    }
    gate.open(armAction(mode));
  };

  const silence = async () => {
    if (!services) return;
    const done = await services.callService('siren', 'turn_off', { entity_id: sirensOn.map((item) => item.entityId) });
    if (done) setSilenced(true);
  };

  const spanWords = { min: pt('spanMin'), hour: pt('spanHour'), day: pt('spanDay') };

  const head = triggered
    ? pt('amHeadTriggered')
    : arming
      ? pt('amHeadArming')
      : pending
        ? pt('amHeadPending')
        : disarming
          ? pt('amHeadDisarming')
          : unavailable
            ? t('alarm.state.unavailable')
            : armMode
              ? pt('amHeadArmed', { mode: pt(MODE_LOOK[armMode].label).toLocaleLowerCase(locale) })
              : pt('amModeDisarm');
  const subtitle = [
    openWindows.length === 1 ? pt('amSubOpenWindow') : openWindows.length > 1 ? pt('amSubOpenWindows', { n: openWindows.length }) : null,
    openDoors.length === 1 ? pt('amSubOpenDoor') : openDoors.length > 1 ? pt('amSubOpenDoors', { n: openDoors.length }) : null,
  ].filter(Boolean).join(' · ') || (house.doors.length + house.windows.length > 0 ? pt('amSubClosed') : '');
  const caption = triggered
    ? [zone?.name, silenced ? pt('amSilenced') : null].filter(Boolean).join(' · ') || t('alarm.caption.triggered')
    : arming
      ? pt('amCapArming')
      : pending
        ? pt('amCapPending')
        : unavailable
          ? t('alarm.caption.unavailable')
          : armMode
            ? t(`alarm.modeDescription.${armMode === 'custom_bypass' ? 'customBypass' : armMode}`)
            : canControl
              ? pt('amCapDisarmed')
              : pt('amCapReadOnly');

  const HeadIcon = triggered ? ShieldAlert : armMode ? MODE_LOOK[armMode].Icon : ShieldOff;
  const timeline = (alarm.activityTimeline ?? []).slice(0, Math.max(1, alarm.activityLogLimit ?? 6));

  const cameraItems = cameras.map((id) => {
    const camera = buildCameraCardModel({ entityId: id, title: id, status: haStates[id]?.state } as Widget, haStates[id]);
    return {
      entityId: id,
      name: camera.title,
      statusLabel: camera.statusLabel,
      subtitle: camera.subtitle,
      streamUrl: camera.streamUrl,
      snapshotUrl: camera.imageUrl,
      isOffline: !camera.isAvailable,
    };
  });

  return (
    <div style={tint ? ({ '--dv-pn-tint': tint } as React.CSSProperties) : undefined}>
    <PanelShell
      className={clsx(tint && 'dv-pn-tinted')}
      icon={<HeadIcon size={23} strokeWidth={2} />}
      iconClassName={tint ? 'text-white' : 'dv-t2 bg-[color:var(--dv-icon-off)]'}
      iconStyle={tint ? { background: `rgb(${tint})` } : undefined}
      name={alarm.name}
      subtitle={subtitle}
      liveSubtitle
      embedded={embedded}
      onClose={onClose}
    >
      <div className="dv-pn-hero">
        <b style={triggered ? { color: 'var(--dv-red)' } : undefined} aria-live="polite">{head}</b>
        <span className="dv-t2">{caption}</span>
      </div>

      {triggered ? (
        <div className="dv-banner dv-pn-banner is-red" role="alert">
          <ShieldAlert size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>
            {changedAt !== null || zone ? (
              <b>
                {changedAt !== null
                  ? zone
                    ? pt('amTrigZone', { zone: zone.name, time: clock(changedAt, locale) })
                    : pt('amTrigTime', { time: clock(changedAt, locale) })
                  : zone?.name}
              </b>
            ) : null}
            {sirensOn.length > 0 && !silenced && changedAt !== null ? <span>{pt('amSirenFor', { time: formatPanelSpan(now - changedAt, spanWords) })}</span> : null}
            <span>{pt('amIfNotYou')}</span>
            <span className="dv-pn-actions">
              <a className="dv-pn-pill is-on" href="tel:112">{pt('amCall')}</a>
              {canControl && sirensOn.length > 0 ? (
                <button type="button" className="dv-pn-pill" disabled={silenced || !services} onClick={() => void silence()}>
                  {silenced ? pt('amSilenced') : pt('amSilence')}
                </button>
              ) : null}
              {cameraItems.length > 0 ? (
                <button type="button" className="dv-pn-pill" onClick={() => setCameraId(cameraItems[0].entityId)}>{pt('amSeeCamera')}</button>
              ) : null}
            </span>
          </span>
        </div>
      ) : null}

      {triggered && canControl ? (
        <button type="button" className="dv-pn-big dv-pn-wide" onClick={() => gate.open(disarmAction)}>{pt('amStop')}</button>
      ) : null}

      {pending && canControl ? (
        <button type="button" className="dv-pn-big dv-pn-wide" onClick={() => gate.open(disarmAction)}>{t('alarm.action.disarm')}</button>
      ) : null}

      {!triggered && canControl ? (
        <div className="dv-pn-modes" role="group" aria-label={pt('amModesAria')}>
          <button
            type="button"
            className={clsx('dv-pn-mode', state === 'disarmed' && 'is-on')}
            style={state === 'disarmed' ? ({ '--dv-pn-tint': DISARM_RGB } as React.CSSProperties) : undefined}
            aria-pressed={state === 'disarmed'}
            disabled={moving || unavailable}
            onClick={() => {
              setAskingMode(null);
              if (armMode) gate.open(disarmAction);
            }}
          >
            <ShieldOff size={20} strokeWidth={2} aria-hidden="true" />
            <span>{pt('amModeDisarm')}</span>
          </button>
          {modes.map((mode) => {
            const look = MODE_LOOK[mode];
            const on = armMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className={clsx('dv-pn-mode', on && 'is-on')}
                style={on ? ({ '--dv-pn-tint': look.rgb } as React.CSSProperties) : undefined}
                aria-pressed={on}
                disabled={moving || unavailable}
                onClick={() => {
                  if (!on) pickMode(mode);
                }}
              >
                <look.Icon size={20} strokeWidth={2} aria-hidden="true" />
                <span>{pt(look.label)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {askingMode && !triggered && openings.length > 0 ? (
        <div className="dv-banner dv-pn-banner" role="alert">
          <RectangleVertical size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>
            <b>{openings.length === 1 ? pt('amWarnOne', { name: openings[0].name }) : pt('amWarnMany', { n: openings.length, names: namesOf(openings) })}</b>
            <span>{pt('amWarnAsk')}</span>
            <span className="dv-pn-actions">
              <button
                type="button"
                className="dv-pn-pill is-on"
                onClick={() => {
                  gate.open(armAction(askingMode));
                  setAskingMode(null);
                }}
              >
                {pt('amForce')}
              </button>
              <button type="button" className="dv-pn-pill" onClick={() => setAskingMode(null)}>{pt('cancel')}</button>
            </span>
          </span>
        </div>
      ) : null}

      {arming ? (
        <div className="dv-card dv-pn-count" aria-live="polite">
          <span>
            <b>{pt('amExitTitle')}</b>
            {left !== null ? <span className="dv-t2 text-[13px] font-medium">{pt('amExitLeft', { n: left })}</span> : null}
          </span>
          {left !== null && delay ? (
            <span className="dv-pn-bar" aria-hidden="true"><i style={{ width: `${(left / delay) * 100}%` }} /></span>
          ) : null}
          {canControl ? <button type="button" className="dv-pn-pill" onClick={() => gate.open(disarmAction)}>{pt('cancel')}</button> : null}
        </div>
      ) : null}

      {house.doors.length + house.windows.length + house.motion.length + house.sirens.length > 0 ? (
        <div className="dv-card dv-pn-rows">
          {house.doors.length > 0 ? (
            <HouseRow Icon={DoorClosed} warn={openDoors.length > 0} title={pt('amDoors')} value={openDoors.length > 0 ? pt('amOpenList', { names: namesOf(openDoors) }) : pt('amAllClosed', { n: house.doors.length })} />
          ) : null}
          {house.windows.length > 0 ? (
            <HouseRow Icon={RectangleVertical} warn={openWindows.length > 0} title={pt('amWindows')} value={openWindows.length > 0 ? pt('amOpenList', { names: namesOf(openWindows) }) : pt('amAllClosed', { n: house.windows.length })} />
          ) : null}
          {house.motion.length > 0 ? (
            <HouseRow
              Icon={Footprints}
              warn={movingNow.length > 0}
              title={pt('amMotion')}
              value={movingNow.length > 0 ? pt('amMotionIn', { names: namesOf(movingNow) }) : house.motion.length === 1 ? pt('amNoMotionOne') : pt('amNoMotion', { n: house.motion.length })}
            />
          ) : null}
          {house.sirens.length > 0 ? (
            <HouseRow Icon={Bell} warn={sirensOn.length > 0} title={pt('amSiren')} value={sirensOn.length > 0 ? pt('amSirenOn') : pt('amSirenReady')} />
          ) : null}
        </div>
      ) : null}

      {timeline.length > 0 ? (
        <>
          <div className="dv-pn-label">{pt('amHistory')}</div>
          <div className="dv-card dv-pn-rows">
            {timeline.map((entry) => (
              <div key={entry.id} className="dv-pn-row">
                <span className="dv-pn-rt"><span className="dv-t2">{entry.text}</span></span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {canControl && alarmCanTrigger(alarm.supportedFeatures) && !triggered ? (
        <button
          type="button"
          className="dv-pn-sm dv-pn-wide text-[color:var(--dv-red)]"
          disabled={moving || unavailable}
          onClick={() => gate.open({ id: 'trigger', label: t('alarm.action.trigger'), state: 'triggered', onPress: commands.trigger })}
        >
          {t('alarm.action.sos')}
        </button>
      ) : null}

      <SecurityAuthModal {...gate.modalProps} />

      {cameraId ? (
        <React.Suspense fallback={null}>
          <CameraViewer
            isOpen
            cameras={cameraItems}
            activeEntityId={cameraId}
            onActiveEntityChange={setCameraId}
            onClose={() => setCameraId(null)}
            commandsEnabled={false}
          />
        </React.Suspense>
      ) : null}
    </PanelShell>
    </div>
  );
}

function HouseRow({ Icon, warn, title, value }: { Icon: LucideIcon; warn: boolean; title: string; value: string }) {
  return (
    <div className="dv-pn-row">
      <span className={clsx('dv-pn-row-ic', warn && 'is-warn')} aria-hidden="true"><Icon size={17} strokeWidth={2.2} /></span>
      <span className="dv-pn-rt">
        <b>{title}</b>
        <span className="dv-t2">{value}</span>
      </span>
    </div>
  );
}

export default AlarmPanel;
