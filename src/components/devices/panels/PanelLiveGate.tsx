import type React from 'react';
import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import { findBatterySensor } from '../model/sensor';
import { resolveSensorFamily } from '../model/sensorFamily';
import type { PanelLive } from './shell/PanelShell';
import { usePanelLiveState } from './panelLiveState';

/*
 * The states all panels share, for a page that opens its panels on request: the
 * words and the rules of these states load with this, not with the page.
 */

export type PanelLiveGateProps = {
  entityId: string;
  entity: MockEntityState | undefined;
  states: MockEntityStateMap;
  children: (live: PanelLive, stale: boolean) => React.ReactNode;
};

export function PanelLiveGate({ entityId, entity, states, children }: PanelLiveGateProps) {
  const isSensor = entityId.startsWith('sensor.') || entityId.startsWith('binary_sensor.');
  const attributes = entity?.rawAttributes;
  const family = isSensor
    ? resolveSensorFamily({ entityId, deviceClass: `${attributes?.device_class ?? ''}`, unit: `${attributes?.unit_of_measurement ?? ''}`, state: `${entity?.state ?? ''}` })
    : null;
  const batteryId = isSensor ? findBatterySensor(entityId, states) : null;
  const batteryValue = batteryId ? Number(states[batteryId]?.state) : Number.NaN;
  const { stale, ...live } = usePanelLiveState({
    entityId,
    entity,
    family,
    battery: Number.isFinite(batteryValue) ? batteryValue : null,
  });
  return <>{children(live, stale)}</>;
}

export default PanelLiveGate;
