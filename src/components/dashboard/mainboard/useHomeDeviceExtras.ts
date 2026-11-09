import React from 'react';
import type { DeviceExtras } from '../../devices/cards/deviceExtrasContext';
import { findPowerSensor, isPowerSensor, readWatts } from '../../devices/model/powerSensor';
import { useProtectedEntities } from '../../rooms/useProtectedEntities';
import { useDeviceTimers, type RoomsSubscribeApi } from '../../../pages/rooms/useDeviceTimers';
import type { RoomsApiCall } from '../../rooms/roomsDirectory';
import type { DashboardRuntimeMode } from '../../../security/dashboardAccess';
import type { MockEntityStateMap } from '../../../types/ha';

/*
 * What the Home knows of its devices beyond their entity, the same as the Rooms
 * page. The cards read it from a context: its value changes when a meter, a
 * timer or a protection changes, not at every event of the house.
 */

const NO_IDS: string[] = [];

export function useHomeDeviceExtras({
  runtimeMode,
  demo,
  canManage,
  states,
  deviceIdOf,
  isOn,
  onCallApi,
  onSubscribeApi,
  onDemoSwitch,
}: {
  runtimeMode: DashboardRuntimeMode;
  demo: boolean;
  canManage: boolean;
  states: MockEntityStateMap;
  deviceIdOf: (entityId: string) => string | null | undefined;
  isOn: (entityId: string) => boolean;
  onCallApi?: RoomsApiCall;
  onSubscribeApi?: RoomsSubscribeApi;
  onDemoSwitch?: (entityId: string, on: boolean) => void;
}) {
  const canProtect = canManage || demo;
  const { protectedIds, setProtectedIds } = useProtectedEntities(runtimeMode, canProtect, NO_IDS);
  const protectedSet = React.useMemo(() => new Set(protectedIds), [protectedIds]);
  const timers = useDeviceTimers({ demo, isOn, onCallApi, onSubscribeApi, onDemoSwitch });
  const setTimerNow = React.useRef(timers.setTimer);
  React.useEffect(() => {
    setTimerNow.current = timers.setTimer;
  }, [timers.setTimer]);
  const [confirmOff, setConfirmOff] = React.useState<{ name: string; turnOff: () => void } | null>(null);

  const meters = React.useMemo(
    () => Object.fromEntries(Object.entries(states).filter(([entityId, state]) => isPowerSensor(entityId, state))),
    [states],
  );
  const metersKey = Object.entries(meters)
    .map(([entityId, state]) => `${entityId}=${state?.state}`)
    .join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steadyMeters = React.useMemo(() => meters, [metersKey]);

  const extras = React.useMemo<DeviceExtras>(
    () => ({
      wattsOf: (entityId) => {
        const sensor = findPowerSensor(entityId, steadyMeters, deviceIdOf);
        return sensor ? readWatts(steadyMeters[sensor]) : null;
      },
      isProtected: (entityId) => protectedSet.has(entityId),
      canProtect,
      setProtected: (entityId, value) =>
        setProtectedIds((current) => (value ? Array.from(new Set([...current, entityId])) : current.filter((id) => id !== entityId))),
      guardTurnOff: (entityId, name, turnOff) => {
        if (protectedSet.has(entityId)) setConfirmOff({ name, turnOff });
        else turnOff();
      },
      timers: timers.timers,
      timerNow: timers.now,
      timersAvailable: timers.available,
      timerDomains: timers.domains,
      setTimer: (entityId, minutes) => void setTimerNow.current(entityId, minutes),
    }),
    [canProtect, deviceIdOf, protectedSet, setProtectedIds, steadyMeters, timers.available, timers.domains, timers.now, timers.timers],
  );

  return { extras, confirmOff, closeConfirmOff: () => setConfirmOff(null) };
}
