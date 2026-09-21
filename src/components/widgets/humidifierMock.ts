import type { MockEntityStateMap } from '../../types/ha';

export const DEMO_HUMIDIFIER_ENTITY_ID = 'humidifier.demo_bedroom';

export function createHumidifierStateMocks(): MockEntityStateMap {
  return {
    [DEMO_HUMIDIFIER_ENTITY_ID]: {
      state: 'on',
      toggleOn: true,
      supportedFeatures: 1,
      currentHumidity: 43,
      targetHumidity: 50,
      minHumidity: 30,
      maxHumidity: 70,
      targetHumidityStep: 5,
      rawAttributes: {
        device_class: 'humidifier',
        action: 'humidifying',
        current_humidity: 43,
        humidity: 50,
        min_humidity: 30,
        max_humidity: 70,
        target_humidity_step: 5,
        mode: 'auto',
        available_modes: ['normal', 'auto', 'sleep'],
      },
    },
  };
}
