import React from 'react';
import type { MockEntityState } from '../../types/ha';
import {
  applyLightAction,
  lightServiceCall,
  toLightModel,
  type LightAction,
  type LightModel,
} from '../../components/devices/model/light';
import { useEntityCommands, type CallService, type EntityAdapter } from './useEntityCommands';

function confirmed(live: LightModel, wanted: LightModel) {
  if (live.on !== wanted.on) return false;
  if (!wanted.on) return true;
  const brightnessOk =
    wanted.brightnessPct === null || live.brightnessPct === null || Math.abs(live.brightnessPct - wanted.brightnessPct) <= 2;
  return brightnessOk && live.mode === wanted.mode;
}

const LIGHT_ADAPTER: EntityAdapter<LightModel, LightAction> = {
  toModel: toLightModel,
  isAvailable: (model) => model.available,
  apply: applyLightAction,
  call: lightServiceCall,
  confirmed,
  isSlider: (action) => action.type === 'brightness' || action.type === 'hue',
};

/** Light commands of the Rooms page, and every light off in one call. */
export function useLightCommands({
  demo,
  states,
  onCallService,
}: {
  demo: boolean;
  states: Record<string, MockEntityState | undefined>;
  onCallService?: CallService;
}) {
  const commands = useEntityCommands({ demo, states, onCallService, adapter: LIGHT_ADAPTER });
  const { modelOf, act, actMany } = commands;

  const turnOffAll = React.useCallback(
    (entityIds: string[]) => {
      const lit = entityIds.filter((entityId) => modelOf(entityId).on);
      if (lit.length === 0) return;
      actMany(lit, { type: 'turn_off' }, { domain: 'light', service: 'turn_off', data: { entity_id: lit } });
    },
    [actMany, modelOf],
  );

  return React.useMemo(() => ({ modelOf, act, turnOffAll }), [act, modelOf, turnOffAll]);
}
