import React from 'react';
import type { MockEntityState } from '../../types/ha';
import {
  applyDeviceAction,
  deviceConfirmed,
  deviceServiceCall,
  readWatts,
  toDeviceModel,
  type DeviceAction,
  type DeviceModel,
} from '../../components/devices/model/device';
import { useEntityCommands, type CallService, type EntityAdapter } from './useEntityCommands';

const SLIDER_ACTIONS = new Set<DeviceAction['type']>(['fan_pct', 'cover_position', 'cover_tilt', 'humidity']);

/** Commands of the plugs, switches, fans, covers and humidifiers of the Rooms page. */
export function useDeviceCommands({
  demo,
  states,
  onCallService,
  powerSensorOf,
}: {
  demo: boolean;
  states: Record<string, MockEntityState | undefined>;
  onCallService?: CallService;
  /** The meter of a plug, when it has one. */
  powerSensorOf: (entityId: string) => string | null;
}) {
  const adapter = React.useMemo<EntityAdapter<DeviceModel, DeviceAction>>(
    () => ({
      toModel: (entityId, entity) => {
        const sensor = powerSensorOf(entityId);
        // Only the kinds this hook is given; an unknown entity reads as an unavailable switch.
        return (
          toDeviceModel(entityId, entity, { watts: sensor ? readWatts(states[sensor]) : null }) ??
          toDeviceModel('switch.unknown', undefined)!
        );
      },
      isAvailable: (model) => model.available,
      apply: applyDeviceAction,
      call: deviceServiceCall,
      confirmed: deviceConfirmed,
      isSlider: (action) => SLIDER_ACTIONS.has(action.type),
    }),
    [powerSensorOf, states],
  );
  return useEntityCommands({ demo, states, onCallService, adapter });
}
