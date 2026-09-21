import type { MockEntityStateMap } from '../../types/ha';
import { FAN_FEATURE } from './fanModel';

export const DEMO_FAN_ENTITY_ID = 'fan.demo_breeze';

export function createFanStateMocks(): MockEntityStateMap {
  return {
    [DEMO_FAN_ENTITY_ID]: {
      state: 'off',
      toggleOn: false,
      supportedFeatures: Object.values(FAN_FEATURE).reduce((total, feature) => total | feature, 0),
      rawAttributes: {
        percentage: 50,
        speed_count: 4,
        preset_modes: ['eco', 'breeze'],
        preset_mode: null,
        oscillating: false,
        direction: 'forward',
      },
    },
  };
}
