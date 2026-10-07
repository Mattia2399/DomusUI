import { describe, expect, it } from 'vitest';
import type { MockEntityStateMap } from '../types/ha';
import {
  DEFAULT_CONSUMPTION_CONFIG,
  createConsumptionDashboardData,
} from './useConsumptionConfig';

describe('legacy consumption configuration boundary', () => {
  it('does not define a second set of Energy sensor bindings', () => {
    expect(Object.keys(DEFAULT_CONSUMPTION_CONFIG).sort()).toEqual([
      'gasTodayEntityId',
      'waterCurrentEntityId',
      'waterGoalEntityId',
      'waterRainRecoveryEntityId',
    ]);
  });

  it('keeps non-Energy preview data isolated from Energy-like HA states', () => {
    const states = {
      'sensor.solar_power_kw': { state: '99' },
      'sensor.home_power_kw': { state: '88' },
      [DEFAULT_CONSUMPTION_CONFIG.waterCurrentEntityId]: { state: '125' },
      [DEFAULT_CONSUMPTION_CONFIG.waterGoalEntityId]: { state: '350' },
      [DEFAULT_CONSUMPTION_CONFIG.waterRainRecoveryEntityId]: { state: '3.5' },
      [DEFAULT_CONSUMPTION_CONFIG.gasTodayEntityId]: { state: '0.8' },
    } as MockEntityStateMap;

    expect(createConsumptionDashboardData(DEFAULT_CONSUMPTION_CONFIG, states)).toEqual({
      waterCurrentLiters: 125,
      waterGoalLiters: 350,
      waterRainRecoveryLitersPerMin: 3.5,
      gasTodayCubicMeters: 0.8,
    });
  });
});
