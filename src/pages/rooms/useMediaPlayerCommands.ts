import type { MockEntityState } from '../../types/ha';
import {
  applyMediaAction,
  mediaConfirmed,
  mediaServiceCall,
  toMediaModel,
  type MediaAction,
  type MediaModel,
} from '../../components/devices/model/media';
import { useEntityCommands, type CallService, type EntityAdapter } from './useEntityCommands';

const MEDIA_ADAPTER: EntityAdapter<MediaModel, MediaAction> = {
  toModel: toMediaModel,
  isAvailable: (model) => model.available,
  apply: (model, action) => applyMediaAction(model, action),
  call: mediaServiceCall,
  confirmed: (live, wanted) => mediaConfirmed(live, wanted),
  // Dragging the position or the volume sends one call per pause.
  isSlider: (action) => action.type === 'seek' || action.type === 'volume',
};

/** Commands of the media players of the Rooms page. */
export function useMediaPlayerCommands({
  demo,
  states,
  onCallService,
}: {
  demo: boolean;
  states: Record<string, MockEntityState | undefined>;
  onCallService?: CallService;
}) {
  return useEntityCommands({ demo, states, onCallService, adapter: MEDIA_ADAPTER });
}
