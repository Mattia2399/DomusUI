import type { MockEntityState } from '../../types/ha';
import {
  applyClimateAction,
  climateConfirmed,
  climateServiceCall,
  toClimateModel,
  type ClimateAction,
  type ClimateModel,
} from '../../components/devices/model/climate';
import { useEntityCommands, type CallService, type EntityAdapter } from './useEntityCommands';

const CLIMATE_ADAPTER: EntityAdapter<ClimateModel, ClimateAction> = {
  toModel: toClimateModel,
  isAvailable: (model) => model.available,
  apply: applyClimateAction,
  call: climateServiceCall,
  confirmed: climateConfirmed,
  // Steps and the target slider are paced: a few taps on + send one call.
  isSlider: (action) => action.type === 'step' || action.type === 'target' || action.type === 'range',
};

/** Commands of the climate devices of the Rooms page. */
export function useClimateCommands({
  demo,
  states,
  onCallService,
}: {
  demo: boolean;
  states: Record<string, MockEntityState | undefined>;
  onCallService?: CallService;
}) {
  return useEntityCommands({ demo, states, onCallService, adapter: CLIMATE_ADAPTER });
}
