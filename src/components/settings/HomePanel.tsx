import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nProvider';
import { usePanelsTranslations } from '../../i18n/panelsTranslations';
import { Panel } from '../devices/panels/Panel';
import { arrangeControls, loadMediaPlayer, loadPanelEntry, MOST_IN_THE_ROW, PANEL_CONTROLS, panelKindOfDevice } from '../devices/panels/registry';
import { EDITOR_ICONS } from '../editor/editorIcons';
import { PanelSurfaceContext } from '../devices/panels/shell/panelSurface';
import type { ClimatePanelInput } from '../devices/panels/entries/climate';
import type { LightPanelInput } from '../devices/panels/entries/light';
import type { DevicePanelInput } from '../devices/panels/entries/device';
import type { CalendarPanelInput } from '../devices/panels/entries/calendar';
import type { CameraPanelInput } from '../devices/panels/entries/camera';
import type { MembersPanelInput } from '../devices/panels/entries/members';
import type { SensorPanelInput } from '../devices/panels/entries/sensor';
import type { VacuumPanelInput } from '../devices/panels/entries/vacuum';
import type { WeatherPanelInput } from '../devices/panels/entries/weather';
import { entityChangedAt } from '../devices/model/panelRules';
import { SecurityPanel } from '../devices/panels/SecurityPanel';
import type { MockEntityState } from '../../types/ha';
import { resolveDeviceKind } from '../devices/model/entityKind';
import {
  deviceModelOf,
  homeClimateToModel,
  homeLiveEntityIdOf,
  lampToLightModel,
  mediaModelOf,
  runHomeClimateExtra,
  runHomeLightExtra,
  runClimateAction,
  runDeviceAction,
  runLightAction,
  runLockAction,
  runMediaAction,
  securityModelOf,
} from './homePanelModels';
import { homeLiveEntityId, homePanelOf, type HomePanelProps } from './homePanelRoute';
import { usePanelLiveState } from '../devices/panels/panelLiveState';
import { PanelStates } from '../devices/panels/shell/PanelStates';
import { findBatterySensor } from '../devices/model/sensor';
import { resolveSensorFamily } from '../devices/model/sensorFamily';
import { findEnergySource } from '../devices/model/plugEnergy';
import { useDeviceExtras } from '../devices/cards/deviceExtrasContext';
import { canHaveTimer } from '../devices/model/deviceTimer';
import { useEntityRegistry, usePanelPlugEnergy, useSecurityHistory } from '../devices/panels/panelData';

/* The shared panel a card of the Home opens, in place of its old content. */

// Heavier and rarer than a light: each loads when its own card opens.
const AlarmPanel = React.lazy(() => import('../devices/panels/AlarmPanel'));
const MediaPlayer = React.lazy(loadMediaPlayer);

// The sheet keeps its height while a panel loads: the finger that opened it with
// a long press is lifted over the sheet, not over the backdrop that would close it.
const LOADING_SHEET = <div className="min-h-[60vh] md:min-h-0" aria-hidden="true" />;

export function HomePanel(props: HomePanelProps) {
  const { activeDevice, lamp, climate, actions, embedded, onClose } = props;
  // The icons chosen in the edit mode are drawn here, where the Home has them.
  const related = React.useMemo(() => (props.related ? { ...props.related, context: { ...props.related.context, iconOf: chosenIconOf } } : undefined), [props.related]);
  const panel = homePanelOf(props);
  const registry = useEntityRegistry();
  const deviceExtras = useDeviceExtras();
  const pt = usePanelsTranslations();
  const { t } = useI18n();
  const closeLabel = embedded ? t('builder.closeDevice') : undefined;

  const entityId = homeLiveEntityIdOf(props);
  // Robot, calendar and members belong to the entity of their card, as every other panel does.
  const owner = props.cardEntityId ?? entityId ?? undefined;
  const readEntity = entityId ? props.haStates[entityId] : undefined;
  // A sensor the Home cannot read keeps the panel, with what its card knows.
  const sensorStandIn = panel === 'sensor' && !readEntity
    ? ({
        state: activeDevice.sensorRawState ?? (typeof activeDevice.sensorValue === 'number' ? String(activeDevice.sensorValue) : 'unavailable'),
        rawAttributes: { friendly_name: activeDevice.name, unit_of_measurement: activeDevice.sensorUnit, device_class: activeDevice.sensorDeviceClass },
      } as MockEntityState)
    : undefined;
  const entity = readEntity ?? sensorStandIn;
  const sensorAttributes = panel === 'sensor' ? entity?.rawAttributes : undefined;
  const family = panel === 'sensor' && entityId
    ? resolveSensorFamily({ entityId, deviceClass: `${sensorAttributes?.device_class ?? ''}`, unit: `${sensorAttributes?.unit_of_measurement ?? ''}`, state: `${entity?.state ?? ''}` })
    : null;
  const batteryId = panel === 'sensor' && entityId ? findBatterySensor(entityId, props.haStates) : null;
  const batteryValue = batteryId ? Number(props.haStates[batteryId]?.state) : Number.NaN;
  const { stale, ...live } = usePanelLiveState({
    entityId,
    entity,
    away: panel === 'light' && lamp.status === 'unavailable',
    unknownCounts: panel !== 'calendar' && panel !== 'members',
    family,
    battery: Number.isFinite(batteryValue) ? batteryValue : null,
  });
  const areaId = entityId ? registry?.entityAreaByEntityId[entityId] : undefined;
  const roomName = areaId ? registry?.areaNames[areaId] : undefined;
  const securityEntityId = panel === 'security' ? homeLiveEntityId(props, 'lock') : null;
  const securityHistory = useSecurityHistory(securityEntityId);
  const deviceEntityId = panel === 'device' && activeDevice.type === 'switch' ? activeDevice.switchEntityId ?? null : null;
  const energySource = deviceEntityId
    ? findEnergySource(
        deviceEntityId,
        props.haStates,
        activeDevice.switchConsumptionEntityId ?? null,
        (id) => registry?.registryEntities.find((entry) => entry.entityId === id)?.deviceId,
      )
    : null;
  const plugEnergy = usePanelPlugEnergy(energySource);

  if (panel === 'light') {
    const model = lampToLightModel(activeDevice.id, activeDevice.name, lamp);
    const input: LightPanelInput = {
      model,
      roomName,
      extras: {
        supportsWhite: lamp.supportsWhite === true,
        supportsEffects: lamp.supportsEffects === true,
        supportsFlash: lamp.supportsFlash === true,
        effect: lamp.effect,
        effects: lamp.effectList ?? [],
      },
      onAction: (action) => runLightAction(action, model, actions),
      onExtraAction: (action) => runHomeLightExtra(action, actions),
    };
    return <Panel kind="light" input={input} live={live} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  if (panel === 'climate') {
    const model = homeClimateToModel(activeDevice.id, activeDevice.name, climate);
    const input: ClimatePanelInput = {
      model,
      roomName,
      roomTemperature: model.current,
      roomHumidity: typeof climate.currentHumidity === 'number' ? climate.currentHumidity : null,
      onAction: (action) => runClimateAction(action, model, actions),
      extras: {
        supportsTargetHumidity: climate.supportsTargetHumidity === true,
        targetHumidity: climate.targetHumidity,
        minHumidity: climate.minHumidity,
        maxHumidity: climate.maxHumidity,
        targetHumidityStep: climate.targetHumidityStep,
        supportsHorizontalSwing: climate.supportsSwingHorizontalMode === true,
        horizontalSwing: climate.swingHorizontalMode,
        horizontalSwingModes: climate.swingHorizontalModes ?? [],
      },
      onExtraAction: (action) => runHomeClimateExtra(action, actions),
    };
    return <Panel kind="climate" input={input} live={live} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  if (panel === 'device') {
    const model = deviceModelOf(props, deviceExtras?.wattsOf);
    if (!model) return null;
    const kind = resolveDeviceKind(model.entityId);
    if (model.kind === 'outlet' || model.kind === 'switch' || model.kind === 'virtual') {
      const input: DevicePanelInput = {
        model,
        roomName,
        protectedPlug: deviceExtras?.isProtected(model.entityId) ?? false,
        onToggleProtected: deviceExtras?.canProtect && model.kind !== 'virtual' ? (value) => deviceExtras.setProtected(model.entityId, value) : undefined,
        energy: plugEnergy.energy,
        timer: deviceExtras?.timers[model.entityId],
        timerNow: deviceExtras?.timerNow,
        onSetTimer: deviceExtras?.timersAvailable && canHaveTimer(model) ? (minutes) => deviceExtras.setTimer(model.entityId, minutes) : undefined,
        // The panel asks by itself before turning off a protected plug.
        onAction: (action) => runDeviceAction(action, kind, actions),
      };
      return <Panel kind="plug" input={input} live={live} closeLabel={closeLabel} onClose={onClose} related={related} />;
    }
    const input: DevicePanelInput = {
      model,
      roomName,
      timer: deviceExtras?.timers[model.entityId],
      timerNow: deviceExtras?.timerNow,
      onSetTimer: deviceExtras?.timersAvailable && canHaveTimer(model) ? (minutes) => deviceExtras.setTimer(model.entityId, minutes) : undefined,
      onAction: (action) => {
        if (action.type === 'turn_off' && deviceExtras) deviceExtras.guardTurnOff(model.entityId, model.name, () => runDeviceAction(action, kind, actions));
        else runDeviceAction(action, kind, actions);
      },
    };
    const deviceLive =
      activeDevice.type === 'cover' && props.coverIsReadOnly
        ? { off: true, notice: <PanelStates state={{ kind: 'message', text: pt('lvReadOnly') }} /> }
        : live;
    return <Panel kind={panelKindOfDevice(model.kind)} input={input} live={deviceLive} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  if (panel === 'security') {
    const model = securityModelOf(props);
    if (!model) return null;
    const timeline = (props.lock.activityTimeline ?? []).flatMap((entry) => {
      if (typeof entry.timestampMs !== 'number') return [];
      const state = entry.kind === 'lock' ? 'locked' : entry.kind === 'unlock' ? 'unlocked' : entry.kind === 'open' ? 'open' : entry.kind === 'jam' ? 'jammed' : null;
      return state ? [{ t: entry.timestampMs, state }] : [];
    });
    return (
      <SecurityPanel
        model={model}
        roomName={roomName}
        history={securityHistory.length > 0 ? securityHistory : timeline}
        details={{ rawAttributes: props.lock.rawAttributes, changedBy: props.lock.changedBy }}
        commandsEnabled={props.panelCommandsEnabled}
        closeLabel={closeLabel}
        live={live}
        onLockCommand={(command) => runLockAction(command, actions)}
        onClose={onClose}
      />
    );
  }
  if (panel === 'camera') {
    const input: CameraPanelInput = {
      camera: { ...props.camera, name: activeDevice.name },
      roomName,
      commandsEnabled: props.panelCommandsEnabled,
      onPtzMove: actions.moveCameraPtz,
      onPtzStop: actions.stopCameraPtz,
      onRelatedAction: actions.runCameraRelatedEntityAction,
    };
    return <Panel kind="camera" input={input} live={live} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  if (panel === 'media') {
    const model = mediaModelOf(props);
    if (!model) return null;
    const player = (
      <React.Suspense fallback={LOADING_SHEET}>
        <MediaPlayer
          model={model}
          pictureUrl={props.speaker.coverUrl ?? model.picture}
          groupCandidates={(props.speaker.multiroomDevices ?? []).map((device) => ({ entityId: device.id, name: device.name, roomName: device.subtitle ?? null }))}
          surface={embedded ? 'screen' : 'column'}
          onAction={(action) => {
            if (props.panelCommandsEnabled) runMediaAction(action, actions);
          }}
          onClose={onClose}
        />
      </React.Suspense>
    );
    // On a phone it fills the screen: out of the sheet, whose motion would hold it inside.
    return embedded ? createPortal(player, document.body) : player;
  }
  if (panel === 'alarm') {
    return (
      <React.Suspense fallback={LOADING_SHEET}>
        <AlarmPanel
          alarm={{ ...props.alarm, name: activeDevice.name }}
          haStates={props.haStates}
          commands={props.alarmCommands}
          onAuthorizeDeviceAuth={props.onAuthorizeAlarmDeviceAuth}
          closeLabel={closeLabel}
          live={live}
          onClose={onClose}
        />
      </React.Suspense>
    );
  }
  if (panel === 'vacuum') {
    const input: VacuumPanelInput = { vacuum: { ...props.vacuum, name: activeDevice.name }, entityId: owner, areas: props.vacuumAreas, commands: props.vacuumCommands };
    return <Panel kind="vacuum" input={input} live={live} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  if (panel === 'calendar') {
    const input: CalendarPanelInput = {
      name: activeDevice.name,
      entityId: owner,
      supportedFeatures: activeDevice.calendarSupportedFeatures ?? 0,
      agenda: props.calendarAgenda,
      wasteTypes: props.calendarWasteTypes,
      onConfigureWaste: props.onConfigureWaste,
    };
    return <Panel kind="calendar" input={input} live={live} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  if (panel === 'sensor' && activeDevice.sensorEntityId) {
    const input: SensorPanelInput = {
      entityId: activeDevice.sensorEntityId,
      name: activeDevice.name,
      history: activeDevice.sensorHistory,
      haStates: props.haStates,
      fallbackEntity: sensorStandIn,
      stale,
    };
    return <Panel kind="sensor" input={input} live={live} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  if (panel === 'weather') {
    const weatherAttributes = props.weather.rawAttributes;
    const weatherIds = Object.keys(props.haStates).filter((id) => id.startsWith('weather.'));
    // The entity of the card: the one the shown attributes come from, or the only one there is.
    const weatherEntityId = weatherIds.find((id) => weatherAttributes && props.haStates[id]?.rawAttributes === weatherAttributes) ?? (weatherIds.length === 1 ? weatherIds[0] : null);
    const input: WeatherPanelInput = {
      weather: props.weather,
      entityId: weatherEntityId,
      isNight: props.haStates['sun.sun']?.state === 'below_horizon',
      updatedAt: weatherEntityId ? entityChangedAt(props.haStates[weatherEntityId], '__last_updated') : null,
      ...props.weatherConfig,
    };
    return <Panel kind="weather" input={input} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  if (panel === 'members') {
    const input: MembersPanelInput = { name: activeDevice.name, entityId: owner, members: activeDevice.membersPresence ?? activeDevice.membersMapPoints ?? [], haStates: props.haStates };
    return <Panel kind="members" input={input} closeLabel={closeLabel} onClose={onClose} related={related} />;
  }
  return null;
}

/** The weather has no device card to ask for it: the Home has it ready with the rest. */
export const preloadWeatherPanel = () => loadPanelEntry('weather');

/*
 * What the edit mode of a card draws and arranges its panel with. It takes them from here,
 * the piece the Home already loads for its panels: reaching them on its own would split the
 * pieces the Rooms share with the panels.
 */
/** A related control in its group, for the edit mode: it arrives with the piece of the related controls. */
const RelatedPreview = React.lazy(() => import('../devices/panels/related/RelatedPanelView').then((module) => ({ default: module.RelatedControlPreview })));

export const panelEditorKit = { Panel, PanelSurfaceContext, arrangeControls, loadPanelEntry, PANEL_CONTROLS, MOST_IN_THE_ROW, EDITOR_ICONS, RelatedPreview };

/** The icon chosen for a related control in the edit mode. */
const chosenIconOf = (key: string) => {
  const Icon = EDITOR_ICONS[key]?.icon;
  return Icon ? <Icon size={20} strokeWidth={2} /> : undefined;
};

export default HomePanel;
