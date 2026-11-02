import React from 'react';
import { ClimatePanel } from '../devices/panels/ClimatePanel';
import { DevicePanel } from '../devices/panels/DevicePanel';
import { LightPanel } from '../devices/panels/LightPanel';
import { resolveDeviceKind } from '../devices/model/entityKind';
import {
  deviceModelOf,
  homeClimateToModel,
  homeLiveEntityIdOf,
  lampToLightModel,
  runClimateAction,
  runDeviceAction,
  runLightAction,
} from './homePanelModels';
import { homePanelOf, type HomePanelProps } from './homePanelRoute';
import { usePanelLiveState } from '../devices/panels/panelLiveState';
import { findBatterySensor } from '../devices/model/sensor';
import { resolveSensorFamily } from '../devices/model/sensorFamily';

/* The shared panel a card of the Home opens, in place of its old content. */

// Heavier and rarer than a light: each loads when its own card opens.
const AlarmPanel = React.lazy(() => import('../devices/panels/AlarmPanel'));
const VacuumPanel = React.lazy(() => import('../devices/panels/VacuumPanel'));
const CalendarPanel = React.lazy(() => import('../devices/panels/CalendarPanel'));
const MembersPanel = React.lazy(() => import('../devices/panels/MembersPanel'));
const SensorFamilyPanel = React.lazy(() => import('../devices/panels/SensorFamilyPanel'));

// The sheet keeps its height while a panel loads: the finger that opened it with
// a long press is lifted over the sheet, not over the backdrop that would close it.
const LOADING_SHEET = <div className="min-h-[60vh] md:min-h-0" aria-hidden="true" />;

export function HomePanel(props: HomePanelProps) {
  const { activeDevice, lamp, climate, actions, embedded, onClose } = props;
  const panel = homePanelOf(props);

  const entityId = homeLiveEntityIdOf(props);
  const entity = entityId ? props.haStates[entityId] : undefined;
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

  if (panel === 'light') {
    const model = lampToLightModel(activeDevice.id, activeDevice.name, lamp);
    return <LightPanel model={model} embedded={embedded} live={live} onAction={(action) => runLightAction(action, model, actions)} onClose={onClose} />;
  }
  if (panel === 'climate') {
    const model = homeClimateToModel(activeDevice.id, activeDevice.name, climate);
    return (
      <ClimatePanel
        model={model}
        roomTemperature={model.current}
        roomHumidity={typeof climate.currentHumidity === 'number' ? climate.currentHumidity : null}
        embedded={embedded}
        live={live}
        onAction={(action) => runClimateAction(action, model, actions)}
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
        protectedPlug={false}
        embedded={embedded}
        live={live}
        onAction={(action) => runDeviceAction(action, kind, actions)}
        onClose={onClose}
      />
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
          embedded={embedded}
          live={live}
          stale={stale}
          onClose={onClose}
        />
      </React.Suspense>
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
