import React from 'react';
import { createPortal } from 'react-dom';
import { CloudSun } from 'lucide-react';
import { usePanelsTranslations } from '../../i18n/panelsTranslations';
import { PanelShell } from '../devices/panels/PanelShell';
import { ClimatePanel } from '../devices/panels/ClimatePanel';
import { DevicePanel } from '../devices/panels/DevicePanel';
import { LightPanel } from '../devices/panels/LightPanel';
import { CameraPanel } from '../devices/panels/CameraPanel';
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
import { findBatterySensor } from '../devices/model/sensor';
import { resolveSensorFamily } from '../devices/model/sensorFamily';
import { findEnergySource } from '../devices/model/plugEnergy';
import { climateIsOn } from '../devices/model/climate';
import { CLIMATE_TINT, DEVICE_TINT } from '../devices/model/panelTint';
import { lightRgb } from '../devices/model/tileColor';
import { useEntityRegistry, usePanelPlugEnergy, useSecurityHistory } from '../devices/panels/panelData';

/* The shared panel a card of the Home opens, in place of its old content. */

// Heavier and rarer than a light: each loads when its own card opens.
const AlarmPanel = React.lazy(() => import('../devices/panels/AlarmPanel'));
const VacuumPanel = React.lazy(() => import('../devices/panels/VacuumPanel'));
const CalendarPanel = React.lazy(() => import('../devices/panels/CalendarPanel'));
const MembersPanel = React.lazy(() => import('../devices/panels/MembersPanel'));
const SensorFamilyPanel = React.lazy(() => import('../devices/panels/SensorFamilyPanel'));
const MediaPlayer = React.lazy(() => import('../devices/panels/MediaPlayer'));
const WeatherControls = React.lazy(() => import('./WeatherControls').then((module) => ({ default: module.WeatherControls })));

// The sheet keeps its height while a panel loads: the finger that opened it with
// a long press is lifted over the sheet, not over the backdrop that would close it.
const LOADING_SHEET = <div className="min-h-[60vh] md:min-h-0" aria-hidden="true" />;

export function HomePanel(props: HomePanelProps) {
  const { activeDevice, lamp, climate, actions, embedded, onClose } = props;
  const panel = homePanelOf(props);
  const registry = useEntityRegistry();
  const pt = usePanelsTranslations();

  const entityId = homeLiveEntityIdOf(props);
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
    return (
      <LightPanel
        model={model}
        roomName={roomName}
        extras={{
          supportsWhite: lamp.supportsWhite === true,
          supportsEffects: lamp.supportsEffects === true,
          supportsFlash: lamp.supportsFlash === true,
          effect: lamp.effect,
          effects: lamp.effectList ?? [],
        }}
        embedded={embedded}
        live={{ ...live, tint: model.on && model.available ? { rgb: lightRgb(model).join(' ') } : null }}
        onAction={(action) => runLightAction(action, model, actions)}
        onExtraAction={(action) => runHomeLightExtra(action, actions)}
        onClose={onClose}
      />
    );
  }
  if (panel === 'climate') {
    const model = homeClimateToModel(activeDevice.id, activeDevice.name, climate);
    return (
      <ClimatePanel
        model={model}
        roomName={roomName}
        roomTemperature={model.current}
        roomHumidity={typeof climate.currentHumidity === 'number' ? climate.currentHumidity : null}
        embedded={embedded}
        live={{ ...live, tint: climateIsOn(model) ? { rgb: CLIMATE_TINT[model.mode], soft: true } : null }}
        onAction={(action) => runClimateAction(action, model, actions)}
        extras={{
          supportsTargetHumidity: climate.supportsTargetHumidity === true,
          targetHumidity: climate.targetHumidity,
          minHumidity: climate.minHumidity,
          maxHumidity: climate.maxHumidity,
          targetHumidityStep: climate.targetHumidityStep,
          supportsHorizontalSwing: climate.supportsSwingHorizontalMode === true,
          horizontalSwing: climate.swingHorizontalMode,
          horizontalSwingModes: climate.swingHorizontalModes ?? [],
          supportsAutoAdjust: true,
        }}
        onExtraAction={(action) => runHomeClimateExtra(action, actions)}
        onClose={onClose}
      />
    );
  }
  if (panel === 'device') {
    const model = deviceModelOf(props);
    if (!model) return null;
    const kind = resolveDeviceKind(model.entityId);
    return (
      <DevicePanel
        model={model}
        roomName={roomName}
        protectedPlug={false}
        energy={plugEnergy.energy}
        embedded={embedded}
        live={
          activeDevice.type === 'cover' && props.coverIsReadOnly
            ? { off: true, notice: <div className="dv-banner dv-pn-banner is-grey" role="status"><span><b>{pt('lvReadOnly')}</b></span></div> }
            : { ...live, tint: model.on && model.available ? { rgb: DEVICE_TINT[model.kind], soft: true } : null }
        }
        onAction={(action) => runDeviceAction(action, kind, actions)}
        onClose={onClose}
      />
    );
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
        embedded={embedded}
        live={live}
        onLockCommand={(command) => runLockAction(command, actions)}
        onClose={onClose}
      />
    );
  }
  if (panel === 'camera') {
    return (
      <CameraPanel
        camera={{ ...props.camera, name: activeDevice.name }}
        roomName={roomName}
        commandsEnabled={props.panelCommandsEnabled}
        embedded={embedded}
        live={live}
        onPtzMove={actions.moveCameraPtz}
        onPtzStop={actions.stopCameraPtz}
        onRelatedAction={actions.runCameraRelatedEntityAction}
        onClose={onClose}
      />
    );
  }
  if (panel === 'media') {
    const model = mediaModelOf(props);
    if (!model) return null;
    // The player fills the screen: out of the sheet, whose motion would hold it inside.
    return createPortal(
      <React.Suspense fallback={LOADING_SHEET}>
        <MediaPlayer
          model={model}
          pictureUrl={props.speaker.coverUrl ?? model.picture}
          groupCandidates={(props.speaker.multiroomDevices ?? []).map((device) => ({ entityId: device.id, name: device.name, roomName: device.subtitle ?? null }))}
          onAction={(action) => {
            if (props.panelCommandsEnabled) runMediaAction(action, actions);
          }}
          onClose={onClose}
        />
      </React.Suspense>,
      document.body,
    );
  }
  if (panel === 'alarm') {
    return (
      <React.Suspense fallback={LOADING_SHEET}>
        <AlarmPanel
          alarm={{ ...props.alarm, name: activeDevice.name }}
          haStates={props.haStates}
          commands={props.alarmCommands}
          onAuthorizeDeviceAuth={props.onAuthorizeAlarmDeviceAuth}
          embedded={embedded}
          live={live}
          onClose={onClose}
        />
      </React.Suspense>
    );
  }
  if (panel === 'vacuum') {
    return (
      <React.Suspense fallback={LOADING_SHEET}>
        <VacuumPanel
          vacuum={{ ...props.vacuum, name: activeDevice.name }}
          areas={props.vacuumAreas}
          commands={props.vacuumCommands}
          embedded={embedded}
          live={live}
          onClose={onClose}
        />
      </React.Suspense>
    );
  }
  if (panel === 'calendar') {
    return (
      <React.Suspense fallback={LOADING_SHEET}>
        <CalendarPanel
          name={activeDevice.name}
          supportedFeatures={activeDevice.calendarSupportedFeatures ?? 0}
          agenda={props.calendarAgenda}
          wasteTypes={props.calendarWasteTypes}
          onConfigureWaste={props.onConfigureWaste}
          embedded={embedded}
          live={live}
          onClose={onClose}
        />
      </React.Suspense>
    );
  }
  if (panel === 'sensor' && activeDevice.sensorEntityId) {
    return (
      <React.Suspense fallback={LOADING_SHEET}>
        <SensorFamilyPanel
          entityId={activeDevice.sensorEntityId}
          name={activeDevice.name}
          history={activeDevice.sensorHistory}
          haStates={props.haStates}
          fallbackEntity={sensorStandIn}
          embedded={embedded}
          live={live}
          stale={stale}
          onClose={onClose}
        />
      </React.Suspense>
    );
  }
  if (panel === 'weather') {
    return (
      <PanelShell
        icon={<CloudSun size={23} strokeWidth={2} />}
        iconStyle={{ background: 'rgb(100 210 255 / 0.18)', color: '#64d2ff' }}
        name={activeDevice.name}
        subtitle={roomName ?? ''}
        embedded={embedded}
        onClose={onClose}
      >
        <React.Suspense fallback={LOADING_SHEET}>
          <WeatherControls weather={props.weather} {...props.weatherConfig} />
        </React.Suspense>
      </PanelShell>
    );
  }
  if (panel === 'members') {
    return (
      <React.Suspense fallback={LOADING_SHEET}>
        <MembersPanel
          name={activeDevice.name}
          members={activeDevice.membersPresence ?? activeDevice.membersMapPoints ?? []}
          haStates={props.haStates}
          embedded={embedded}
          onClose={onClose}
        />
      </React.Suspense>
    );
  }
  return null;
}

export default HomePanel;
